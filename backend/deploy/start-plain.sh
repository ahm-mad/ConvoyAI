#!/usr/bin/env bash
# Starts (or restarts) the four pm2 processes with the environment from .env.production — NO install, NO build, NO database
# bootstrap. This is the command to run after a server reboot (e.g. from a systemd unit); use ./deploy/deploy-plain.sh
# for the first deploy and for every code update. Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env.production ] || { echo "Error: .env.production not found in $(pwd)" >&2; exit 1; }
[ -f dist/main.http.js ] || { echo "Error: dist/ is missing — run ./deploy/deploy-plain.sh once first (installs, builds, bootstraps the database)" >&2; exit 1; }

mkdir -p logs
set -a
# shellcheck disable=SC1091
source .env.production
set +a

# pm2 hands the *current shell's* variables to the processes; --update-env makes a restart pick up edits to .env.production.
npx pm2 startOrRestart ecosystem.config.cjs --update-env
npx pm2 status
