#!/usr/bin/env bash
# Plain-Node deployment (Phase 7 fallback, D-0095) — for a server without
# Docker. Requires Node 22+ and a reachable Postgres+TimescaleDB and Redis
# already running (either installed natively on this box, or pointed at
# elsewhere via DATABASE_URL/REDIS_URL in .env.production). See DEPLOY.md
# for the full walkthrough, including how to install TimescaleDB natively.
#
# Usage, from the node-backend/ directory:
#   cp .env.example .env.production   # fill in real values first
#   ./deploy/deploy-plain.sh
#
# Idempotent: safe to re-run for every future deploy (git pull + re-run),
# not just the first time. `dist/bootstrap-db.js` (D-0094) handles the
# database side of that.
#
# Stops the 4 pm2-managed processes BEFORE `npm ci`/build, not after —
# confirmed live this is load-bearing, not just cautious: `npm ci` deletes
# and recreates `node_modules` (including the Prisma query engine's native
# binary), and a *running* process still holding that binary open makes
# `npm ci` fail outright (`ENOTEMPTY`/`rmdir` on `node_modules/.prisma/
# client`) rather than silently succeeding. This means a small window of
# real downtime on every redeploy — a deliberate, simpler tradeoff for the
# fallback path (the Docker path doesn't have this problem: it builds a
# new image before touching any running container).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env.production ]; then
  echo "Error: .env.production not found. Copy .env.example to .env.production and fill in real values first." >&2
  exit 1
fi

if npx pm2 describe convoyai-http >/dev/null 2>&1; then
  echo "==> Stopping existing pm2 processes (required before npm ci — see this script's own comment)"
  npx pm2 stop convoyai-http convoyai-worker convoyai-mqtt convoyai-scheduler
fi

echo "==> Installing dependencies"
# Full install (not --omit=dev): the build step below needs tsup, a
# devDependency. Unlike the Docker path's multi-stage build (which strips
# dev deps from the final runtime image), this plain-Node deployment keeps
# everything installed on the server — simpler, and image size isn't a
# concern for a single long-lived server the way it is for a container
# image pulled/rebuilt repeatedly.
npm ci

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Building"
npm run build

echo "==> Running database bootstrap (migrations + seeds, idempotent)"
set -a
# shellcheck disable=SC1091
source .env.production
set +a
node dist/bootstrap-db.js

mkdir -p logs

if npx pm2 describe convoyai-http >/dev/null 2>&1; then
  echo "==> Starting the stopped pm2 processes back up"
  npx pm2 restart convoyai-http convoyai-worker convoyai-mqtt convoyai-scheduler --update-env
else
  echo "==> Starting pm2 processes for the first time"
  npx pm2 start ecosystem.config.cjs
  echo "==> Run 'npx pm2 startup' once (follow its printed instructions), then 'npx pm2 save', so these processes survive a server reboot."
fi

echo "==> Done. Check status with: npx pm2 status"
echo "==> Check logs with: npx pm2 logs, or the per-process files under logs/"
