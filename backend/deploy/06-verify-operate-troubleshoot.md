# 06 — Verify, operate, back up, troubleshoot

Commands assume you run them on the server (the backend on `localhost:8080`); `$COMPOSE` is the Docker shortcut from [04](04-path-a-docker.md). On the pm2 path use
`npx pm2 logs` instead of `$COMPOSE logs`.

## 1. Smoke tests after every deploy

```bash
# 1. the process is up and can reach its database and Redis
curl -s http://localhost:8080/ready          # {"status":"ready","checks":[{"name":"postgres","ok":true},{"name":"redis","ok":true}]}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/health      # 200

# 2. login works (the seeded super-admin — password from the first-run logs — or the demo user if SEED_DEMO_USER was left true)
curl -s -X POST http://localhost:8080/api/login -H 'Content-Type: application/json' \
  -d '{"email":"junead@chaminade-hs.org","password":"password123"}' | head -c 300

# 3. CORS: the browser's preflight from your frontend origin must be answered with that exact origin
curl -si -X OPTIONS http://localhost:8080/api/login -H "Origin: https://staging.example.com" -H "Access-Control-Request-Method: POST" | grep -iE "^HTTP|access-control-allow-origin"

# 4. Google sign-in wiring: the redirect address in the returned URL must be your callback
curl -s http://localhost:8080/api/auth/google/redirect | python3 -c "import sys,json,urllib.parse as u;q=u.parse_qs(u.urlparse(json.load(sys.stdin)['redirect_url']).query);print(q['redirect_uri'][0])"

# 5. Socket.IO reachable through the proxy (expect 200)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/socket.io/?EIO=4&transport=polling"
```

Then in a browser with the frontend pointed at the API: register with a real mailbox (the verification mail must arrive, with the logo), sign in with
Google, upload a profile picture (it must appear and its URL must start with your `R2_PUBLIC_URL`).

### Checking the integrations from _inside_ the running container (Docker path)

Proves the container really received the values and can reach the outside world. Prints no secrets, sends no mail, leaves no file behind:

```bash
$COMPOSE exec -T http node -e '
const net=require("net"); net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
(async()=>{ const e=process.env;
 try{ await require("nodemailer").createTransport({host:e.SMTP_HOST,port:Number(e.SMTP_PORT||587),auth:{user:e.SMTP_USER,pass:e.SMTP_PASS}}).verify(); console.log("SMTP login OK"); }catch(x){ console.log("SMTP FAILED:",x.message.replace(e.SMTP_PASS||"@@","***")); }
 try{ const {S3Client,PutObjectCommand,DeleteObjectCommand}=require("@aws-sdk/client-s3"); const s=new S3Client({region:"auto",endpoint:"https://"+e.R2_ACCOUNT_ID+".r2.cloudflarestorage.com",credentials:{accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY}}); const k="_deploy-check/x.txt"; await s.send(new PutObjectCommand({Bucket:e.R2_BUCKET_NAME,Key:k,Body:"x"})); await s.send(new DeleteObjectCommand({Bucket:e.R2_BUCKET_NAME,Key:k})); console.log("R2 put+delete OK"); }catch(x){ console.log("R2 FAILED:",x.name); }
 try{ const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,code:"bogus",redirect_uri:e.GOOGLE_REDIRECT_URI,grant_type:"authorization_code"})}); console.log("Google:",r.status,(await r.text()).replace(/\s+/g," ")); }catch(x){ console.log("Google FAILED:",x.cause&&x.cause.code||x.message); }
})();'
# expected: SMTP login OK / R2 put+delete OK / Google: 400 {"error":"invalid_grant",...}
```

## 2. Logs

| Path   | Command                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- |
| Docker | `$COMPOSE logs -f http` · `$COMPOSE logs --since 1h worker` · rotation is automatic (10 MB × 5) |
| pm2    | `npx pm2 logs` · files under `node-backend/logs/`                                               |

Logs are JSON (pino). Useful filters: `| grep '"level":50'` (errors), `| grep '"level":40'` (warnings). Things worth grepping for:
`SMTP not configured`, `Social login callback failed`, `Object storage is not configured`, `MQTT_URL not configured`.

## 3. Backups (do this before every update, and on a schedule)

The database is the only stateful piece (files are in R2, Redis holds only queued jobs).

```bash
# Docker
$COMPOSE exec -T postgres pg_dump -U convoyai -Fc convoyai > ~/backups/convoyai-$(date +%F-%H%M).dump
# pm2 path
pg_dump -U convoyai -h localhost -Fc convoyai > ~/backups/convoyai-$(date +%F-%H%M).dump
```

Schedule it as the deploy user (`crontab -e`), for example a daily dump at 03:15 keeping 14 days (pm2 path shown; for Docker use the `$COMPOSE exec -T postgres pg_dump …` form with the full compose command spelled out, since cron has no `$COMPOSE`):

```
15 3 * * * pg_dump -U convoyai -h localhost -Fc convoyai > /home/deploy/backups/convoyai-$(date +\%F).dump && find /home/deploy/backups -name 'convoyai-*.dump' -mtime +14 -delete
```

(`mkdir -p ~/backups` first; for `pg_dump` over TCP put the password in `~/.pgpass`.) Copy dumps off the server (another machine / object storage) — a backup that lives only on the
server it protects is not a backup.

### Restoring — TimescaleDB needs two extra statements

`device_values`, `device_positions` and `vehicle_hourly_stats` are hypertables; restoring a dump without the Timescale hooks fails or corrupts chunk metadata. Restore into an **empty** database:

```bash
# Docker example (for pm2 use psql/pg_restore directly with -h localhost)
$COMPOSE exec -T postgres psql -U convoyai -d postgres -c "DROP DATABASE IF EXISTS convoyai;" -c "CREATE DATABASE convoyai OWNER convoyai;"
$COMPOSE exec -T postgres psql -U convoyai -d convoyai -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" -c "SELECT timescaledb_pre_restore();"
$COMPOSE exec -T postgres pg_restore -U convoyai -d convoyai --no-owner < ~/backups/convoyai-YYYY-MM-DD.dump
$COMPOSE exec -T postgres psql -U convoyai -d convoyai -c "SELECT timescaledb_post_restore();"
$COMPOSE restart http worker mqtt scheduler
```

Practice this restore once on a scratch machine before you need it.

## 4. Routine tasks

| Task                                                                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotate a JWT secret                                                   | edit `.env.production`, restart; all users are logged out once                                                                                                                                                                                                                                                                                                                                                                     |
| Change `FRONTEND_URL` / CORS                                          | edit `.env.production`; Docker: `$COMPOSE up -d`; pm2: `./deploy/start-plain.sh` ([05](05-path-b-pm2.md))                                                                                                                                                                                                                                                                                                                          |
| Add a second frontend origin                                          | append to `CORS_ALLOWED_ORIGINS` (comma-separated)                                                                                                                                                                                                                                                                                                                                                                                 |
| Disk filling up                                                       | `docker system df` · `docker image prune -f` · TimescaleDB compression/retention already runs on `device_values` (12 months) and `device_positions` (raw GPS packets: 12 months, compressed after 7 days); the hourly rollup `vehicle_hourly_stats` is kept forever (small)                                                                                                                                                        |
| Change how long raw GPS packets are kept                              | `$COMPOSE exec postgres psql -U convoyai -d convoyai -c "SELECT remove_retention_policy('device_positions');" -c "SELECT add_retention_policy('device_positions', INTERVAL '18 months');"` — takes effect at the next daily policy run; whole 7-day chunks are dropped; GPS trails of trips older than the period become empty (the trip and every report are unaffected). Note the new period in `migration/DECISIONS.md` (D-0196) |
| See the TimescaleDB policies and chunks                               | `SELECT hypertable_name, proc_name, schedule_interval, config FROM timescaledb_information.jobs;` · `SELECT * FROM timescaledb_information.chunks WHERE hypertable_name = 'device_positions';`                                                                                                                                                                                                                                     |
| Run the GPS telemetry rollup now (it runs every 15 minutes by itself) | `docker exec <project>-worker-1 node --input-type=module -e "import {Queue} from 'bullmq'; const q=new Queue('fleet-telemetry',{connection:{url:process.env.REDIS_URL}}); await q.add('fleet-telemetry-rollup',{}); await q.close()"` — safe to repeat (idempotent, skips vehicles with nothing new). To rebuild one vehicle's history: `DELETE FROM vehicle_hourly_stats WHERE vehicle_id = <id>;` then run the job               |
| Look at the database                                                  | `$COMPOSE exec postgres psql -U convoyai -d convoyai`                                                                                                                                                                                                                                                                                                                                                                               |

## 5. Troubleshooting

| Symptom                                                                    | Likely cause → fix                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ready` returns 503                                                       | `checks[]` in the body says which of postgres/redis is down → start it / fix `DATABASE_URL`/`REDIS_URL`. Docker: `$COMPOSE ps`, `$COMPOSE logs postgres`                                                                                                                                                                                                   |
| Compose stops with `POSTGRES_PASSWORD must be set`                         | add `POSTGRES_PASSWORD` to `.env.production` (it is Docker-only)                                                                                                                                                                                                                                                                                           |
| Process exits immediately with `Invalid environment configuration:`        | the message lists the bad variable. Usual: a missing secret, `FRONTEND_URL`/`DATABASE_URL`/`REDIS_URL` that is not a valid URL                                                                                                                                                                                                                             |
| Frontend: every call fails, `curl` works                                   | `CORS_ALLOWED_ORIGINS` doesn't contain the exact frontend origin (scheme+host+port, no trailing slash)                                                                                                                                                                                                                                                     |
| Google: `redirect_uri_mismatch`                                            | `GOOGLE_REDIRECT_URI` ≠ the address in Google Cloud Console — must be identical                                                                                                                                                                                                                                                                            |
| Google: popup ends on `…/login?error=auth_failed`                          | look for `Social login callback failed` in the http log: `ETIMEDOUT` → server can't reach Google (network/firewall; the app already lengthens the connect timeout, [07](07-dry-run-log-2026-09-21.md)); `invalid_client` → wrong client id/secret; `invalid_grant` on a real login → the redirect URI used for the code differs from `GOOGLE_REDIRECT_URI` |
| Google: signs in but frontend stays on the login page                      | the frontend's configured backend origin ≠ the API origin (it ignores messages from other origins), or `FRONTEND_URL` is wrong (the popup posts to it)                                                                                                                                                                                                     |
| No verification e-mail                                                     | log line `SMTP not configured` → SMTP_* not loaded (Docker: `printenv` in the container; pm2: stale env, use `--update-env`). Gmail rejects → app password wrong / 2-Step Verification off. Check spam                                                                                                                                                     |
| E-mail logo missing                                                        | `MAIL_LOGO_URL` unset or the R2 object isn't public                                                                                                                                                                                                                                                                                                        |
| Upload returns 502 `Object storage is not configured (R2_… missing)`       | an `R2_*` value is empty/not loaded                                                                                                                                                                                                                                                                                                                        |
| Upload returns 500 and the log shows `AccessDenied` on PutObject           | the R2 API token is _Object Read only_ — recreate it with **Object Read & Write**                                                                                                                                                                                                                                                                          |
| Uploaded image URL 404/401 in the browser                                  | bucket public access not enabled, or `R2_PUBLIC_URL` wrong                                                                                                                                                                                                                                                                                                 |
| `npm ci` fails with `ENOTEMPTY … node_modules/.prisma` (pm2 path)          | a pm2 process was still running — always deploy through `deploy-plain.sh` (it stops them first)                                                                                                                                                                                                                                                            |
| Prisma: `Query Engine for runtime debian-openssl-…` (custom Docker builds) | `openssl` missing from the image's base stage — the shipped `Dockerfile` installs it in the shared `base` stage                                                                                                                                                                                                                                            |
| pm2 path: bootstrap fails at the Timescale migration                       | TimescaleDB extension not installed/enabled in that database ([01 §2b](01-install-prerequisites.md))                                                                                                                                                                                                                                                       |
| Port 8080 already in use (laptop)                                          | stop the other process (`npx pm2 stop …`) or set `HOST_HTTP_PORT` for Docker                                                                                                                                                                                                                                                                               |
| Changed the env but nothing changed (pm2)                                  | pm2 kept the old environment — run `./deploy/start-plain.sh` ([05](05-path-b-pm2.md))                                                                                                                                                                                                                                                                      |
| Lost the `superadmin@example.com` password                                   | it is shown only once at first bootstrap and never rotated; there is no reset tool — a maintainer must overwrite the hash in `users` (do not delete the account)                                                                                                                                                                                           |
| A tester says "Access blocked" on Google sign-in                           | add them under Test users or publish the consent screen ([03](03-external-services.md))                                                                                                                                                                                                                                                                    |

## 6. Secrets checklist for a real production server

- [ ] `SEED_DEMO_USER=false` before the first bootstrap (otherwise `junead@chaminade-hs.org / password123` exists — delete it if it does)
- [ ] the super-admin password is stored in a password manager, not in a chat or a file on the server
- [ ] all five secrets are unique to this environment and backed up
- [ ] the R2 token is scoped to the one bucket; the Google client secret and SMTP app password exist only in `.env.production`
- [ ] `.env.production` is `chmod 600` and owned by the deploy user
- [ ] backups run and a restore has been rehearsed
