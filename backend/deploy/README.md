# Deploying ConvoyAI's Node backend

Scope of these notes: **clone the repo → install what the project needs → put the env file in place → run one command → the backend serves on
`localhost:8080`.** How that port reaches the internet (Cloudflare tunnel, reverse proxy, DNS), how the start command is run at boot (systemd), and OS/firewall
setup are your own server's business and are deliberately not covered.

> **Binding rule (migration/README.md prime directive #9):** this backend is deployed **alongside** the still-live Laravel app. Nothing here touches, stops or
> removes Laravel. Decommissioning Laravel is a separate step that only starts after the whole cutover gate is confirmed.

## What you are deploying

One codebase (`node-backend/`), **four long-running processes**, one database, one queue:

| Process     | Entry point              | Job                                                                                        |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `http`      | `dist/main.http.js`      | REST API + Socket.IO on **port 8080** — the only thing that must be reachable from outside |
| `worker`    | `dist/main.worker.js`    | background jobs: e-mail, SMS, rule actions, realtime fan-out                               |
| `mqtt`      | `dist/main.mqtt.js`      | MQTT ingestion / device commands (idle if no broker is configured)                         |
| `scheduler` | `dist/main.scheduler.js` | periodic jobs                                                                              |

Plus **PostgreSQL 16 with the TimescaleDB extension** (the only database) and **Redis 7** (queues). Uploaded files go to **Cloudflare R2**, e-mail over **SMTP**.

## Pick a path — both end with the backend on `localhost:8080`

|                                         | **Path A — Docker (recommended)**                                                    | **Path B — Node + pm2**                        |
| --------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Installs                                | Docker only (Postgres/Timescale/Redis come in containers)                            | Node 22, PostgreSQL 16 + TimescaleDB, Redis    |
| **Deploy / update command**             | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` | `./deploy/deploy-plain.sh`                     |
| **Start command (e.g. after a reboot)** | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d`         | `./deploy/start-plain.sh`                      |
| Downtime on update                      | seconds                                                                              | a short window (pm2 must stop before `npm ci`) |

Both run the same idempotent database bootstrap (schema, TimescaleDB, seeds) — safe on an empty database and safe to re-run.
The start commands are idempotent too, so they are safe to call from a boot script repeatedly. (With Docker the containers also restart on their own once the
Docker service is up: `restart: unless-stopped`.)

## Read in this order

1. **[01-install-prerequisites.md](01-install-prerequisites.md)** — clone the repo; install Docker (Path A) or Node + Postgres/Timescale + Redis (Path B).
2. **[02-environment-variables.md](02-environment-variables.md)** — every setting and exactly what changes from your laptop to a server. **Most deployment mistakes are here.**
3. **[03-external-services.md](03-external-services.md)** — Google sign-in, Cloudflare R2, Gmail SMTP, MQTT, Groq: how to create each and what goes where.
4. **[04-path-a-docker.md](04-path-a-docker.md)** or **[05-path-b-pm2.md](05-path-b-pm2.md)** — the deploy itself.
5. **[06-verify-operate-troubleshoot.md](06-verify-operate-troubleshoot.md)** — smoke tests, updates, backups, troubleshooting.
6. **[07-dry-run-log-2026-09-21.md](07-dry-run-log-2026-09-21.md)** — issues we hit during the laptop dry run and how they were resolved.

Reference material (what the bootstrap seeds, CORS rationale, live-verification history): **[DEPLOY.md](DEPLOY.md)**.

## The short version (Docker)

```bash
git clone <repo-url> convoyai && cd convoyai/node-backend && git checkout rewrite/node-stack
cp .env.example .env.production                       # edit it — see 02-environment-variables.md
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs migrate | grep "Generated password"   # SAVE the super-admin password (shown once)
curl -s localhost:8080/ready                          # {"status":"ready",...}   ← serving on localhost:8080
```

## What the front door (your tunnel) must carry

`localhost:8080` serves the REST API **and** Socket.IO (WebSocket upgrade on the same port, path `/socket.io`). Uploads up to 10 MB are accepted, so the front
door must allow bodies of at least that size. Postgres and Redis stay internal.
