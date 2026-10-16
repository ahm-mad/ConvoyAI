# 05 — Path B: plain Node + pm2 (no Docker)

Prerequisites: [01](01-install-prerequisites.md) §1 and §2b done (repo cloned; Node 22, PostgreSQL 16 **with the TimescaleDB extension enabled in
the `convoyai` database**, Redis), [02](02-environment-variables.md) filled in, services from [03](03-external-services.md) created.
Everything below runs from `node-backend/` on the server.

This is also how the development laptop runs the app day to day (the same four pm2 processes from `ecosystem.config.cjs`; on the laptop the app reads `.env` and Postgres/Redis come from `npm run db:up`).

## `.env.production` for this path

Same file as everywhere ([02](02-environment-variables.md)), with these specifics:

```
NODE_ENV=production
DATABASE_URL="postgresql://convoyai:<password>@localhost:5432/convoyai?schema=public"
REDIS_URL="redis://localhost:6379"
```

`POSTGRES_PASSWORD` is not used on this path.

## First deploy

```bash
cd ~/convoyai/node-backend
./deploy/deploy-plain.sh
```

What the script does (read `deploy/deploy-plain.sh` — it is short and commented):

1. Refuses to run without `.env.production`.
2. If the pm2 processes already exist, **stops them first** — mandatory: `npm ci` deletes `node_modules`, and a running process holding the Prisma
   engine binary open makes it fail with `ENOTEMPTY`. So every redeploy has a short downtime window.
3. `npm ci` (full install — the build needs devDependencies such as `tsup`), `prisma generate`, `npm run build` (→ `dist/`).
4. Loads `.env.production` into the shell and runs `node dist/bootstrap-db.js` — the same idempotent bootstrap as Docker: schema (only on an empty
   database), TimescaleDB hypertable migration, manual migrations, seeds, and the super-admin account.
5. Starts the four pm2 processes (`ecosystem.config.cjs`) — or restarts them with `--update-env` on later runs.

### Save the super-admin password — shown once

The bootstrap prints `Generated password — save this now` on a fresh database. The script's output scrolls by; if you missed it, it is
gone (there is no copy on disk). Run the first deploy with output kept: `./deploy/deploy-plain.sh 2>&1 | tee ~/first-deploy.log`, copy the
password, then **delete that file** (`shred -u ~/first-deploy.log`).

## The two commands

```bash
./deploy/deploy-plain.sh     # first deploy AND every code update: stop → npm ci → prisma generate → build → bootstrap → start
./deploy/start-plain.sh      # just start/restart the four processes with the env from .env.production — no install/build/bootstrap
```

`start-plain.sh` is what a boot script should call: it loads `.env.production` into the shell and runs `pm2 startOrRestart ecosystem.config.cjs --update-env`. It is idempotent
(safe to run repeatedly) and refuses to run before the first `deploy-plain.sh` (no `dist/`). Wiring it to the server's boot is your own setup.

## Day-to-day

```bash
npx pm2 status                                  # the four processes: convoyai-http / -worker / -mqtt / -scheduler
npx pm2 logs                                    # follow everything      (npx pm2 logs convoyai-http  for one)
npx pm2 restart convoyai-http                  # restart one
npx pm2 stop convoyai-http convoyai-worker convoyai-mqtt convoyai-scheduler
tail -f logs/http.out.log logs/http.error.log   # per-process files also exist under logs/
```

**pm2 does not reload code or env by itself, and the app does not read `.env.production` on its own** (it only auto-loads a file called `.env`).
The variables reach the processes from the _shell that starts or restarts them_ — that is what both scripts do (`source .env.production` with `set -a`, then
`pm2 … --update-env`). So:

- after a `git pull` → rebuild (`npm run build`) and restart — or just run `./deploy/deploy-plain.sh`;
- after editing `.env.production` only: `./deploy/start-plain.sh`
- a plain `npx pm2 restart <name>` (without `--update-env`) keeps the _old_ stored environment — the classic "I changed the env but nothing happened".

## Updating to a new version

```bash
pg_dump -U convoyai -h localhost -Fc convoyai > ~/backup-$(date +%F).dump    # 1. back up (see 06 for restore)
git pull                                                                     # 2. new code
./deploy/deploy-plain.sh                                                     # 3. stop → install → build → bootstrap → start
curl -s localhost:8080/ready                                                 # 4. verify
```

## Things that only matter on this path

- **TimescaleDB must already be installed and enabled** in the database (`CREATE EXTENSION IF NOT EXISTS timescaledb;` as the `postgres` superuser).
  The bootstrap does not install it. Symptom of forgetting: the bootstrap fails at the Timescale migration step.
- **Node must be 22.x** (`package.json` allows `>=22 <25`). `node -v` first when anything odd happens.
- **Variables that already exist in the environment win** over any `.env` file (the app loads `.env` with `dotenv`, which never overrides). If a pm2
  process was first started from a shell that had other variables exported (for example a development `JWT_ACCESS_SECRET`), those stay in effect. Start
  and restart through the two scripts from a clean shell.
- Redis with `maxmemory-policy noeviction` (see 01) — BullMQ requires it.
- Both `ecosystem.config.cjs` and the logs live in `node-backend/` — keep the working directory there, the `logs/` folder is relative.

## Rolling back

```bash
git log --oneline -5                       # find the previous good commit
git checkout <commit>                      # or a tag
./deploy/deploy-plain.sh
# if the database changed in the newer version and you need the old shape:
pg_restore -U convoyai -h localhost -d convoyai --clean --if-exists ~/backup-YYYY-MM-DD.dump     # see the Timescale note in 06
```
