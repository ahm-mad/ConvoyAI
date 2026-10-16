# 02 — Environment variables: what each one is and what changes on a server

The app reads **one** file per environment:

| Where                 | File                           | Loaded by                                                                               |
| --------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| your laptop (pm2/dev) | `node-backend/.env`            | the app itself (`dotenv`)                                                               |
| a server, Docker path | `node-backend/.env.production` | `docker compose … --env-file .env.production` (+ `env_file:` on every service)          |
| a server, pm2 path    | `node-backend/.env.production` | `deploy/deploy-plain.sh` (`source`s it, then the app also reads the exported variables) |

All three are **gitignored** — never commit them. Start from the template: `cp .env.example .env.production`.
Validation is strict (`src/platform/config/env.schema.ts`): if a required value is missing or malformed the process refuses to
start and prints which variable is wrong.

> Format rules that bit us: no spaces around `=`; wrap any value containing spaces or `<>` in double quotes
> (`MAIL_FROM="ConvoyAI <skote@support.com>"`); a trailing ` # comment` is fine; **no trailing slash** on URLs.

## 1. Generate the secrets (do this on the server, once)

Five values must be long random strings, all **different from each other and from your laptop's**:

```bash
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET JWT_VERIFICATION_SECRET INGESTION_TOKEN_SECRET MQTT_CONFIG_ENCRYPTION_SECRET; do
  echo "$k=\"$(openssl rand -hex 32)\""
done
echo "POSTGRES_PASSWORD=\"$(openssl rand -hex 16)\""      # Docker path only
```

Copy those lines into `.env.production`. **Back them up somewhere safe** (a password manager):

- losing `INGESTION_TOKEN_SECRET` invalidates every device's ingestion token (devices would need new tokens);
- losing `MQTT_CONFIG_ENCRYPTION_SECRET` makes stored broker passwords undecryptable;
- changing a `JWT_*` secret logs every user out (harmless, but intentional).

## 2. The full list

Legend — **R** required · **O** optional (feature is simply off/degraded without it) · **L** = differs between laptop and server.

### Core

| Variable            |                   | Laptop example                                                      | Server value / notes                                                                                                                                               |
| ------------------- | ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`          | R **L**           | `development`                                                       | `production`                                                                                                                                                       |
| `HTTP_PORT`         |                   | `8080`                                                              | leave `8080`. In Docker the container is forced to 8080; change the _host_ side with `HOST_HTTP_PORT` instead                                                      |
| `LOG_LEVEL`         | **L**             | `debug`                                                             | `info` (`debug` is very chatty)                                                                                                                                    |
| `DATABASE_URL`      | R **L**           | `postgresql://convoyai:convoyai@localhost:5442/convoyai?schema=public` | **Docker:** ignored/overridden by compose (it builds the URL from `POSTGRES_PASSWORD`). **pm2:** `postgresql://convoyai:<pw>@localhost:5432/convoyai?schema=public` |
| `REDIS_URL`         | R **L**           | `redis://localhost:6389`                                            | **Docker:** overridden to `redis://redis:6379`. **pm2:** `redis://localhost:6379`                                                                                  |
| `POSTGRES_PASSWORD` | Docker only **L** | —                                                                   | the compose file refuses to start without it (used to create the DB and build the URL)                                                                             |
| `HOST_HTTP_PORT`    | Docker, optional  | —                                                                   | host port that maps to the container's 8080 (default 8080)                                                                                                         |

### Auth

| Variable                                                             |         | Notes                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_VERIFICATION_SECRET` | R **L** | generated above; must differ from each other                                                                                                                             |
| `JWT_ACCESS_TTL`                                                     |         | seconds. **`604800` (7 days)** — the login `token` is deliberately long-lived like Laravel's (D-0125). The old template shipped `900`; make sure your file says `604800` |
| `JWT_REFRESH_TTL` / `JWT_VERIFICATION_TTL`                           |         | `2592000` (30 d) / `86400` (24 h — e-mail verification links)                                                                                                            |
| `INGESTION_TOKEN_SECRET`                                             | R **L** | encrypts the per-product webhook tokens                                                                                                                                  |
| `MQTT_CONFIG_ENCRYPTION_SECRET`                                      | R **L** | encrypts stored per-company MQTT broker credentials                                                                                                                      |

### Public addresses — **must be changed for every environment**

| Variable               |         | Server value                                                                                                                                                                                                                                |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_URL`         | R **L** | the frontend's public URL, e.g. `https://staging.example.com`. Used in verification/reset e-mail links and as the allowed target of the Google login popup. **The built-in default is a leftover temporary Vercel URL — never rely on it.** |
| `CORS_ALLOWED_ORIGINS` | R **L** | comma-separated exact origins that may call the API from a browser, e.g. `https://staging.example.com`. No trailing slash, no spaces. If wrong, the browser silently blocks every call although `curl` works                                |

### Google sign-in (O — the button fails without it)

| Variable                                   |         | Notes                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | O       | from _your_ Google Cloud OAuth client — see [03](03-external-services.md)                                                                                                                                                                               |
| `GOOGLE_REDIRECT_URI`                      | O **L** | **the API's public address + `/api/auth/google/callback`**, e.g. `https://api-staging.example.com/api/auth/google/callback`. It must also be registered in Google Cloud Console (Authorized redirect URIs) — the two must match character for character |
| `GITHUB_*`                                 | O       | unused today (Laravel never had GitHub credentials)                                                                                                                                                                                                     |

### Mail (O — without it e-mails are only written to the log: no verification/reset mails)

| Variable                  |     | Notes                                                                                                                                                        |
| ------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SMTP_HOST` / `SMTP_PORT` | O   | Gmail: `smtp.gmail.com` / `587`                                                                                                                              |
| `SMTP_USER` / `SMTP_PASS` | O   | Gmail address + a Google **app password** (16 characters) — not the account password                                                                         |
| `MAIL_FROM`               | O   | `"ConvoyAI <skote@support.com>"` is what Laravel used. Gmail rewrites the visible sender to the authenticated account unless the alias is verified in Gmail |
| `MAIL_LOGO_URL`           | O   | public URL of the logo shown in the e-mail header, e.g. `https://pub-….r2.dev/images/logo.png`                                                             |

### File storage — Cloudflare R2 (O — profile pictures, floor plans, yard layouts, vehicle images return 502 without it)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — see [03](03-external-services.md).
Staging and production should use **separate buckets** (or at least separate key prefixes) so testers cannot overwrite real files.

### MQTT (O — devices that publish over MQTT)

| Variable                                             |         | Notes                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MQTT_URL`                                           | O **L** | e.g. `mqtts://<cluster>.s1.eu.hivemq.cloud:8883`. **Leave it EMPTY if you have no broker:** the template's placeholder host (`your-hivemq-host`) would make the process retry a fake address forever. Empty prints one harmless warning ("MQTT_URL not configured — MQTT client not started") |
| `MQTT_USERNAME`, `MQTT_PASSWORD`                     | O       | broker credentials                                                                                                                                                                                                                                                                            |
| `MQTT_TOPIC_DEVICE_DATA/STATUS/COMMANDS`, `MQTT_QOS` |         | topic templates; `{device_id}` is replaced per device. Laravel's `.env` used `testtopic/{device_id}` — decide deliberately; per-company brokers can also be configured in the app (MQTT configuration page)                                                                                   |

### Other integrations (all O)

| Variable                                                 | Notes                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`            | AI attribute suggestions. No key → those endpoints error. Get a free key at console.groq.com |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS rule actions. Laravel never had these either; SMS is simply off                          |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`             | billing is intentionally not processed (placeholder subscription only) — leave empty         |
| `SOCKET_IO_PATH`                                         | `/socket.io` (leave)                                                                         |

### Tuning / bootstrap

| Variable                             |       | Notes                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NETWORK_CONNECT_ATTEMPT_TIMEOUT_MS` |       | default `5000`. Node's own default (250 ms) makes outbound calls (Google token exchange) fail with `ETIMEDOUT` on slow links — see the dry-run log                                                                                                                                                               |
| `SEED_DEMO_USER`                     | **L** | default `true`. The first-run bootstrap creates `junead@chaminade-hs.org` / `password123` (admin of a "Default Company") — a **publicly known password**. Keep it for a throw-away staging box if you like; **set `false` on a real production server** (the protocol/module/template catalogs are still seeded) |

## 3. What must change from laptop → server (checklist)

- [ ] `NODE_ENV=production`, `LOG_LEVEL=info`
- [ ] five new random secrets (+ `POSTGRES_PASSWORD` for Docker); backed up
- [ ] `DATABASE_URL` / `REDIS_URL` (pm2 path only)
- [ ] `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` = the real frontend origin
- [ ] `GOOGLE_REDIRECT_URI` = `https://<api-address>/api/auth/google/callback`, and the same string added in Google Cloud Console
- [ ] SMTP, R2, `MAIL_LOGO_URL` copied from your laptop `.env` (or new credentials for the server)
- [ ] `MQTT_URL` empty (or a real broker)
- [ ] `JWT_ACCESS_TTL=604800`
- [ ] `SEED_DEMO_USER=false` if this is production
- [ ] the **frontend's own** config points at the new API address (that is the frontend repo's job) — its Google login popup only accepts a message that comes from the API origin it is configured with

## 4. Sanity check before starting

```bash
# no empty required values / placeholders left behind (prints only names):
grep -nE '^(JWT_|INGESTION_|MQTT_CONFIG_|POSTGRES_PASSWORD|FRONTEND_URL|CORS_)' .env.production | sed -E 's/=.*/=<…>/'
grep -nE 'change-me|dev-only|your-hivemq|example\.com' .env.production && echo "^^ placeholders still present" || echo "no placeholders"
```
