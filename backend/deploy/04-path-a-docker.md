# 04 — Path A: deploy with Docker Compose (recommended)

Prerequisites: [01](01-install-prerequisites.md) §1 and §2a done (repo cloned, Docker installed), [02](02-environment-variables.md) filled in
(`.env.production` exists in `node-backend/`), external services from [03](03-external-services.md) created.
Everything runs from `node-backend/`.

## What the compose file (`docker-compose.prod.yml`) starts

| Service                       | Image                               | Published?                                 | Notes                                                                                                       |
| ----------------------------- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `postgres`                    | `timescale/timescaledb:2.17.2-pg16` | no (internal network only)                 | data in the named volume `pgdata`                                                                           |
| `redis`                       | `redis:7-alpine`                    | no                                         | no persistence (`--save "" --appendonly no`)                                                                |
| `migrate`                     | the app image                       | —                                          | one-shot: runs `dist/bootstrap-db.js` (schema + Timescale + seeds); must exit 0 before anything else starts |
| `http`                        | the app image                       | **`HOST_HTTP_PORT` → 8080** (default 8080) | REST + Socket.IO; has a `/health` healthcheck                                                               |
| `worker`, `mqtt`, `scheduler` | the app image                       | no                                         | `restart: unless-stopped`                                                                                   |

One image (`Dockerfile`, multi-stage, `node:22-slim`), four entry points. Logs use the `json-file` driver with rotation (10 MB × 5 per service).
If another project on the box already uses host port 8080, set `HOST_HTTP_PORT` in `.env.production`.

## The two commands

```bash
# deploy / update  (builds the image, re-runs the idempotent bootstrap, replaces containers)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# start (e.g. from your boot script) — no rebuild
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Handy shortcut for the rest of this page: `export COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"`.

## First deploy

```bash
$COMPOSE config >/dev/null && echo "compose file + env file parse OK"     # fails fast on a missing POSTGRES_PASSWORD etc.
$COMPOSE up -d --build                                                    # first build ≈ 90 s
$COMPOSE ps                                                               # everything Up; http (healthy)
curl -s localhost:8080/ready                                              # {"status":"ready","checks":[postgres ok, redis ok]}
```

### Save the super-admin password — shown exactly once

The first bootstrap creates the platform operator `superadmin@example.com` with a generated password and prints it in the `migrate` logs:

```bash
$COMPOSE logs migrate | grep "Generated password"
```

Copy it into a password manager **now**; it is never shown again (re-running the bootstrap leaves the account untouched).
Unless you set `SEED_DEMO_USER=false` the bootstrap also created `junead@chaminade-hs.org` / `password123`.

Then run the smoke tests in [06](06-verify-operate-troubleshoot.md).

## Day-to-day commands

```bash
$COMPOSE ps                       # status
$COMPOSE logs -f http             # follow one service (http | worker | mqtt | scheduler | migrate | postgres | redis)
$COMPOSE logs --since 10m         # everything, last 10 minutes
$COMPOSE restart worker           # restart one process
$COMPOSE exec postgres psql -U convoyai -d convoyai      # database shell
$COMPOSE down                     # stop everything, KEEP data (the pgdata volume stays)
# $COMPOSE down -v                # DESTROYS the database volume — only when you truly want a blank slate
```

(`npm run deploy:prod:up | deploy:prod:down | deploy:prod:logs` are shortcuts for `up -d --build`, `down` and `logs -f`.)

## Updating to a new version

```bash
$COMPOSE exec -T postgres pg_dump -U convoyai -Fc convoyai > ~/backup-$(date +%F).dump   # 1. back up first (restore: see 06)
git pull                                                                                 # 2. new code
$COMPOSE up -d --build                                                                   # 3. rebuild + bootstrap + replace containers
$COMPOSE ps && curl -s localhost:8080/ready                                              # 4. verify
docker image prune -f                                                                    # 5. optional: drop old image layers
```

The bootstrap is safe to re-run on every deploy: it skips schema creation on a non-empty database, re-applies only idempotent migrations and never touches existing
passwords. Database changes are **forward-only** — to go back to an older release, restore the backup from step 1 and check out the old commit.

## Changing configuration

Edit `.env.production`, then `$COMPOSE up -d` (Compose recreates the services whose environment changed — no rebuild needed for env-only edits).
Check the effect with `$COMPOSE exec http printenv | grep -E '^(FRONTEND_URL|CORS_)'`.

## Running it on a laptop (what we did on 2026-09-21)

Same commands. Stop anything else on port 8080 first (e.g. the pm2 development processes), and use `GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/google/callback`,
`FRONTEND_URL=http://localhost:3000`. The Docker stack starts with a **fresh, empty database** — development data from another setup is not in it.
