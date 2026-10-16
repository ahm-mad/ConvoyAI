# Deploying ConvoyAI's Node backend — reference notes

> **New, step-by-step guide (fresh Ubuntu 22.04 server → running stack, both paths): start at [README.md](README.md)** (written 2026-09-21 after a full local Docker dry run).
> This file keeps the reference material: what the bootstrap seeds, CORS rationale, and the history of the live verifications.

Phase 7 (Cutover) deliverable — see `../../migration/ROADMAP.md`'s Phase 7 section and
`../../migration/README.md` prime directive #9 for the binding rule this deployment sits inside:
**this backend runs alongside the still-live Laravel app until the user explicitly confirms every
step of the cutover gate has passed.** Nothing here removes or touches Laravel.

Two deployment paths, both built and live-tested end to end (D-0094/D-0095):

- **Docker (recommended, preferred)** — one command brings up the entire stack: Postgres+TimescaleDB,
  Redis, and all 4 app processes. Requires Docker + Docker Compose on the server.
- **Plain Node + pm2 (fallback)** — for a server without Docker yet. Requires Node 22+, and a
  reachable Postgres+TimescaleDB and Redis (installed natively, or pointed at elsewhere).

Both paths run the exact same idempotent database bootstrap (`dist/bootstrap-db.js` /
`scripts/bootstrap-db.ts`, D-0094) — safe on a genuinely empty database (creates the full frozen
schema) and safe to re-run on every future deploy against an already-provisioned one (skips schema
creation, re-applies only what's actually idempotent, never touches the seeded super-admin
account's password once it exists).

---

## Prerequisites (either path)

1. Clone this repo on the server, same as the old Laravel workflow.
2. Copy `.env.example` to `.env.production` and fill in real values — **at minimum**:
   - `POSTGRES_PASSWORD` (Docker path only — the plain-Node path expects `DATABASE_URL` to already
     point at a real, reachable database)
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_VERIFICATION_SECRET` / `INGESTION_TOKEN_SECRET`
     / `MQTT_CONFIG_ENCRYPTION_SECRET` — real random secrets, not the `change-me-dev-only` placeholders
   - `FRONTEND_URL` — wherever the separate frontend session's app is actually hosted
   - `CORS_ALLOWED_ORIGINS` (D-0096) — comma-separated exact origins allowed to call this API from a
     browser (e.g. `http://localhost:3000,https://app.example.com`). **The app has no CORS handling
     without this being set correctly** — a browser-based frontend on any origin not in this list
     will be silently blocked by the browser itself, even though the request looks fine in `curl`
   - `MQTT_URL` — a real broker URL, if IoT devices connect over MQTT. **Leave it empty otherwise** (the old
     template's placeholder host made the process retry a fake address; empty = one harmless warning)
   - `NODE_ENV=production`
   - Anything else you've decided to configure now: `GROQ_API_KEY` (module 6.3's AI suggestions),
     `R2_*` (file uploads — **set up 2026-09-19**, see `03-external-services.md`; leave empty and uploads 502 with a clear
     message, nothing crashes), `SMTP_*` (verification e-mails), `GOOGLE_*` (Google sign-in)
3. **Never commit `.env.production`** — already covered by `.gitignore`'s `.env.*` pattern.

---

## Path A — Docker (recommended)

```bash
cd node-backend
cp .env.example .env.production   # fill in real values first, see Prerequisites above
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

That's it. This one command:

1. Builds the app image (`Dockerfile` — one image, 4 possible entrypoints).
2. Starts Postgres+TimescaleDB and Redis (not published to the host — only reachable by other
   containers in this stack).
3. Runs the one-shot `migrate` service (the bootstrap script) and waits for it to succeed.
4. Starts `http` (published on `HOST_HTTP_PORT`, default `8080`), `worker`, `mqtt`, `scheduler` — all
   `restart: unless-stopped`, so Docker restarts any of them automatically if they crash.

**The super-admin password is printed once**, in the `migrate` service's logs, on the very first run
against a genuinely fresh database:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs migrate | grep "Generated password"
```

Save it immediately — it is never shown again, and re-running the bootstrap on an already-provisioned
database will not regenerate it (confirmed live: this is the account's permanent identity, per the
standing requirement that its email/password never change once set).

### Redeploying (every future update)

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Docker rebuilds the image, re-runs the (idempotent) migration step, then replaces each running
container with the new one. Postgres/Redis data persists in a named volume (`pgdata`) across this —
`down` alone doesn't touch it; only `down -v` would (never run that against a real deployment without
being certain that's what you want).

### Useful commands

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps        # status
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f   # all logs, follow
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f http   # just one service
docker compose -f docker-compose.prod.yml --env-file .env.production down      # stop everything (keeps data)
```

(`npm run deploy:prod:up` / `:down` / `:logs` in `package.json` are shortcuts for the first three of
these.)

### Exposing this to a live domain

Not this project's job to set up (per the user's own direction) — same convention as the old Laravel
workflow: point a reverse proxy / `cloudflared` tunnel at whatever port `HOST_HTTP_PORT` resolves to
on this host (default `8080`). Only the `http` service needs to be reachable externally — it also
serves Socket.IO on the same port (`SOCKET_IO_PATH`, default `/socket.io`).

---

## Path B — Plain Node + pm2 (fallback, no Docker)

Requires Node 22+ on the server, and Postgres 16 + the TimescaleDB extension already reachable
(natively installed on this box, or a managed/remote instance — either way, `DATABASE_URL` in
`.env.production` must point at it), plus Redis reachable the same way (`REDIS_URL`).

```bash
cd node-backend
cp .env.example .env.production   # fill in real values, including a real DATABASE_URL/REDIS_URL
./deploy/deploy-plain.sh
```

This script (`deploy/deploy-plain.sh`):

1. Stops the 4 pm2-managed processes first, if already running — **load-bearing, not just cautious**:
   confirmed live that `npm ci` fails outright if a running process still holds the Prisma engine
   binary open (`ENOTEMPTY` on `node_modules/.prisma/client`). This means a brief window of real
   downtime on every redeploy with this path — the Docker path doesn't have this problem.
2. `npm ci`, `prisma generate`, `npm run build`.
3. Runs the same idempotent `dist/bootstrap-db.js` bootstrap as the Docker path.
4. Starts (first run) or restarts (subsequent runs) the 4 processes under pm2
   (`ecosystem.config.cjs`) — each auto-restarts on crash independently.

**First run only**, make these survive a server reboot:

```bash
npx pm2 startup    # follow its printed instructions (usually one sudo command)
npx pm2 save
```

### Useful commands

```bash
npx pm2 status                 # all 4 processes' state
npx pm2 logs                   # follow all logs
npx pm2 logs convoyai-http    # just one process
npx pm2 restart convoyai-http # restart one process by name
npx pm2 stop convoyai-http convoyai-worker convoyai-mqtt convoyai-scheduler   # stop everything
```

Per-process log files also land under `logs/` (gitignored).

### Installing TimescaleDB natively (if not using a managed/remote Postgres)

Follow TimescaleDB's own install docs for your OS (`https://docs.timescale.com/self-hosted/latest/install/` —
note this project needs the extension enabled on a real Postgres 16 database, matching the version
this project develops against, `timescale/timescaledb:2.17.2-pg16`). After installing, run
`CREATE EXTENSION IF NOT EXISTS timescaledb;` once on the target database before the first
`deploy-plain.sh` run — `dist/bootstrap-db.js`'s Timescale migration step assumes the extension is
already available, it doesn't install it.

---

## What the bootstrap actually does (either path)

`dist/bootstrap-db.js` (source: `scripts/bootstrap-db.ts`, D-0094):

1. Checks whether the target database is genuinely empty (no tables in `public` at all).
2. **Only if empty**: runs `prisma db push` to create the full 86-table frozen schema from
   `prisma/schema.prisma` in one pass. An already-provisioned database (a redeployed instance, or
   this project's own dev DB) never gets this run against it again — unsafe once TimescaleDB's
   hypertable conversion has run (D-0064), confirmed live.
3. Applies the TimescaleDB migration (`device_values` hypertable conversion + compression/retention
   policy) — idempotent, safe every time.
4. Applies every file under `prisma/manual-migrations/` — idempotent as of D-0094 (each file guards
   its own DDL now), safe every time regardless of whether step 2 already created the same columns.
5. Seeds/confirms the `platform_operator` super-admin account (`superadmin@example.com`) — creates it
   with a freshly generated password **only if it doesn't already exist**; on every subsequent run,
   the password is left completely untouched. This account has full cross-tenant database access
   (the `platform_operator` role has no company-matching filter — see `migration/DECISIONS.md`
   D-0039/D-0040) and its own dedicated `"ConvoyAI Platform"` company.
6. Seeds real demo data ported from Laravel's own active seeders (D-0097, after an explicit audit of
   every seeder Laravel actually runs): the protocol catalog — **since D-0135 only `HTTPS` and `MQTT`** (was Laravel's 6 rows `HTTPS`/`MQTTS`/`LoRaWAN`/
   `BACnet`/`Modbus`/`OPC UA` — MQTT ingestion resolves its protocol by the name `MQTT`, so that row must exist), 5 real preconfigure templates (for the "create product from template" flow), the real
   8-module catalog (`reference/fixtures/json/modules.json` — **not** `PlanModuleSeeder.php`'s own
   stale hardcoded list), and a "Default Company" with `admin`/`manager`/`user` roles plus the real
   `junead@chaminade-hs.org` / `password123` seed user (role `admin`) — a genuine existing account,
   not fabricated here (confirmed against `reference/fixtures/json/users.json`). **That password is public:** set
   `SEED_DEMO_USER=false` (D-0134) on a real production server to skip creating this user (the catalogs are still seeded).
7. Seeds/syncs the placeholder billing plan (D-0080/D-0085) — additive only, now covers every real
   module from step 6, including `fleet-management` (the real `Basic`/`Gold`/`Platinum` plans'
   own mapping grants none of the three plans `fleet-management` at all — a real, separate product gap,
   deliberately not ported; see D-0097).

**Deliberately not seeded**: the real `Basic`/`Gold`/`Platinum` plans and their real `plan_modules`
mapping (D-0080/D-0085's standing scope boundary — real billing plans are a separately-authorized
future decision), and Laravel's own `SuperAdminSeeder.php` (a different, already-superseded account
shape, D-0039/D-0088).

Each seed step also has its own standalone `npm run db:*` command (`db:timescale`,
`db:manual-migrations`, `db:seed-platform-operator`, `db:seed-demo-data`, `db:seed-placeholder-plan`)
if you ever need to re-run just one piece by hand instead of the full `db:bootstrap` sequence — all
are idempotent, safe to run in any order relative to each other except that `db:seed-demo-data`
should run before `db:seed-placeholder-plan` (so the placeholder plan's module sync sees the real
module catalog).

## Retired protocols (D-0135) — one-off cleanup for an already-bootstrapped database

The catalog is now **HTTPS** and **MQTT** only. A **new** database gets exactly those two rows. A database bootstrapped **before** 2026-09-21 still has Laravel's original six:
the bootstrap renames `MQTTS` → `MQTT` automatically (`prisma/manual-migrations/002-protocol-mqtts-rename.sql`, idempotent — MQTT ingestion looks the protocol up by that name, so this is required),
but it deliberately does **not** delete the four retired rows (it re-runs on every deploy and must not remove a protocol someone adds on purpose later). Drop them once, by hand:

```sql
-- refuses to touch a protocol that a product still uses as its device protocol (that FK has no cascade);
-- ingestion-token placeholder rows that point at a retired protocol are removed with it (cascade)
DELETE FROM protocols
WHERE name IN ('LoRaWAN', 'BACnet', 'Modbus', 'OPC UA')
  AND NOT EXISTS (SELECT 1 FROM products WHERE device_protocol_id = protocols.id);
```

Docker: `docker compose -f docker-compose.prod.yml --env-file .env.production exec postgres psql -U convoyai -d convoyai -c "…"`. Frontend consequence: the product wizard's optional
"Device protocol" dropdown (`GET /api/protocols?category=device_protocol`) is empty.

## CORS — required for any browser-based frontend (D-0096)

The app has **no CORS handling without `CORS_ALLOWED_ORIGINS` set correctly** — a browser-based
frontend calling this API from an origin not in that list will be silently blocked by the browser
itself (the request will look fine in `curl`/Postman, which is why this was invisible until the first
real frontend integration attempt). Set it to a comma-separated list of every real origin that needs
to call this API from a browser — your local frontend dev URL, any staging domain, and the real
production frontend domain once you have one. Applies to both the plain HTTP API
(`platform/http/cors.ts`) and Socket.IO (`platform/realtime/socket.ts`) from the same list — one
place to add an origin for both.

## Verified live (2026-09-16 D-0094/D-0095, 2026-09-17 D-0096/D-0097)

Both paths were built and tested end to end against genuinely fresh, throwaway databases (never the
real dev DB) before being documented here:

- Docker: full `docker compose ... up -d --build` from an empty Postgres volume → real schema created
  → real super-admin login over real HTTP → `/health`/`/ready` both green → torn down cleanly.
- Plain Node: `deploy-plain.sh` from a clean checkout → same bootstrap outcome → real login over real
  HTTP via pm2-managed processes → a second run (redeploy path) confirmed idempotent, including the
  `npm ci`-vs-running-process conflict found and fixed (see the script's own comment) → torn down
  cleanly.

A real bug was found and fixed during this testing (not a config typo): the four migration/seed
scripts this bootstrap consolidates were each refactored to remove their own "am I the main module"
guard, since `tsup` bundling multiple scripts into one `dist/bootstrap-db.js` file makes every
bundled module's `import.meta.url` resolve to the _same_ bundle URL — a guard like
`if (import.meta.url === file://${process.argv[1]})` inside an _imported_ module fires
unconditionally once bundled, not just when that file is the actual entrypoint. Each of those four
scripts is now a pure, side-effect-free function when imported, with its own separate tiny
`run-*.ts` CLI wrapper for standalone use (`npm run db:timescale` etc. still work exactly as before).

**2026-09-17**: CORS (D-0096) live-verified via raw header inspection against a real running server —
an allowed origin gets `Access-Control-Allow-Origin`, a disallowed one doesn't, a real preflight
`OPTIONS /api/login` succeeds with the right methods. The demo-data seed step (D-0097) was
live-verified three times: twice against fresh throwaway databases (empty-DB creation, then an
immediate second run proving zero duplicates and the demo user's password stays untouched), then
against this project's own real dev DB — confirmed non-destructive to the existing super-admin
account first, then a real login as `junead@chaminade-hs.org` producing a JWT whose `perms` claim
genuinely lists `all-{slug}` for all 8 real modules, and a real `GET /protocols` returning all 6
seeded rows over real HTTP.
