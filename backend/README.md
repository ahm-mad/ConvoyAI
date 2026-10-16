# ConvoyAI Backend (Node.js / TypeScript)

Ground-up rewrite of the Laravel API. **Read `../migration/README.md` first** — it holds the plan,
the session protocol, the frozen contracts, and the prime directives (including #9, the binding
cutover gate: Laravel is never touched until the user explicitly confirms every step has passed).

- **Status:** Phase 7 (Cutover), in progress. Phases 0–6 are all complete — 29 modules built,
  tested, and live-verified against the real Laravel behavior they replace, plus two more found and
  built during Phase 7's live parity audit (fleet-positions 4.8/D-0115, mqtt-configurations 6.5/
  D-0117) — 31 total. This is a full, running application, not scaffold: all 4 processes
  (HTTP+Socket.IO, worker, MQTT, scheduler) boot and serve real traffic. See `../migration/STATUS.md`
  for the per-module dashboard.
- **Stack:** Node 22+, TypeScript (strict), Express 5, Prisma + PostgreSQL **+ TimescaleDB** (one
  DB — relational tables and IoT time-series together), Redis, BullMQ, Socket.IO, MQTT.js, Zod 4,
  custom JWT (argon2id + refresh rotation), OpenAPI.
- **Architecture:** `../migration/ARCHITECTURE.md`. **Conventions / DoD:** `../migration/CONVENTIONS.md`.
  **Stack mapping (Laravel → Node):** `../migration/STACK_MAPPING.md`. **Deployment:** `deploy/DEPLOY.md`.

## Layout (see ARCHITECTURE.md §2)

```
src/
  modules/<module>/   routes · controller · schemas(Zod) · service · repository · mapper · types · __tests__
                       31 modules: auth, rbac, users, products, protocols, devices, ingestion, rules,
                       realtime, dashboards, summaries, assets, fleet-{vehicles-drivers,trips,
                       geofences,yards,fuel-maintenance-compliance,dashboard,crm-billing,positions},
                       plans, subscriptions, onboarding, contacts-settings-notifications,
                       superadmin, ai-suggestions, connectivity, mqtt-configurations
  platform/           config · http · db · cache · queue · realtime · mqtt · auth · errors ·
                       logging · openapi · telemetry · lifecycle · timeseries · mail · sms · ai
  shared/              pure utils (dates, geo, rule-condition-evaluator, laravel-paginator,
                       payload-mapper, offline, company-response, …) · constants
  main.http.ts · main.worker.ts · main.mqtt.ts · main.scheduler.ts
  container.ts        composition root (awilix)
prisma/schema.prisma
```

## Local dev

```bash
npm install
cp .env.example .env      # fill in secrets (a dev-only .env with working defaults already exists locally)
npm run db:up             # timescaledb-pg16 :5442, redis :6389 (docker compose)
npx prisma generate
npm run dev               # HTTP API + Socket.IO on :8080 — GET /health, GET /ready, GET /docs
npm run dev:worker         # BullMQ worker process
npm run dev:mqtt           # MQTT.js consumer (no-ops if MQTT_URL isn't set)
npm run dev:scheduler      # BullMQ repeatable-job registration
```

```bash
npm run lint && npm run typecheck && npm run format:check && npm run test:cov && npm run build
```

All of the above are green (989+ tests, real-Postgres integration suites included when
`npm run db:up` is running).

## Deploying (Phase 7)

Two paths, both built and live-tested end to end — see `deploy/DEPLOY.md` for the full guide:

- **Docker Compose** (preferred): `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
- **Plain Node + pm2** (no Docker): `./deploy/deploy-plain.sh`

Both run the same idempotent bootstrap (`scripts/bootstrap-db.ts`) — safe on a fresh database and
safe to re-run on every future deploy. **After any code change, the running deployment needs a
rebuild + restart** (`npm run build` then `pm2 restart convoyai-http convoyai-worker
convoyai-mqtt convoyai-scheduler`, or re-run `deploy-plain.sh`) to actually pick it up — `tsx`
dev-mode hot-reload does not apply to a pm2-managed build.

**This backend runs alongside the still-live Laravel app** until the user explicitly confirms every
step of the cutover gate (`../migration/README.md` prime directive #9) has passed. Nothing here
removes or touches Laravel.

The **legacy reference DB** (a throwaway MySQL 8 copy of the current Laravel database — the Laravel
app itself runs on MySQL, D-0017) exists only to diff behavior against. Rebuild it any time:

```bash
bash ../migration/reference/tools/rebuild-oracle-db.sh
# -> mysql://root:root@localhost:13306/convoyai  (86 tables, demo data, current migration head)
```

**Next:** the user is running this against their real local frontend to find and close remaining
gaps (missing endpoints, response-shape mismatches against real Laravel, authorization
refinements) — see `../migration/HANDOFF.md` for exactly where things stand.
