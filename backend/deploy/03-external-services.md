# 03 — External services: how to create each one and where the values go

None of these is needed for the API to _start_ — each one only switches a feature on. Set up the ones you need; the values go
into `.env.production` (see [02](02-environment-variables.md) for the variable names).

| Service                   | Feature it powers                                                        | If missing                                                            |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Google Cloud OAuth client | "Sign in with Google"                                                    | button ends on `login?error=auth_failed` / "not configured"           |
| Cloudflare R2 bucket      | profile pictures, floor plans, yard layouts, vehicle images, e-mail logo | those uploads return 502 `Object storage is not configured`           |
| SMTP (Gmail)              | verification / password-reset / rule e-mails                             | mails are only logged, nothing is sent                                |
| MQTT broker (HiveMQ)      | devices publishing over MQTT                                             | MQTT process idles with a warning; HTTP webhook ingestion still works |
| Groq API key              | AI attribute suggestions                                                 | those endpoints return an error                                       |
| Twilio / Stripe           | SMS rule actions / billing                                               | off (Laravel never had them either)                                   |

---

## Google sign-in (OAuth client)

Use **your own** Google Cloud project — the client that was in Laravel's `.env` belongs to the previous developer.

1. <https://console.cloud.google.com> → project selector → **New project** (e.g. `convoyai`).
2. **APIs & Services → OAuth consent screen** (may be labelled _Google Auth Platform_): user type **External**, app name, your support
   and developer e-mail. Scopes needed are only the basic ones the app asks for: `openid`, `email`, `profile`.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - _Authorized redirect URIs_ — add **every** environment's callback (they can live on the same client):
     - `http://localhost:8080/api/auth/google/callback` (laptop)
     - `https://api-staging.example.com/api/auth/google/callback` (staging)
     - `https://api.example.com/api/auth/google/callback` (production)
   - _Authorized JavaScript origins_ (optional): your frontend origins.
4. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to the
   callback of _that environment_. The string in `.env` and the one in the Google console must be **identical** (scheme, host, path,
   no trailing slash) or Google shows `redirect_uri_mismatch`.

Who may sign in: while the consent screen is in **Testing**, Google documents that only listed _Test users_ (and project members)
can sign in. **In our own tests an unlisted Gmail account signed in fine**, so staging worked without adding testers — but Google
can change this; if someone is blocked ("Access blocked … has not completed verification"), add them under _Test users_ or publish
the app (Publishing status → In production; for these basic scopes no restricted-scope review is required, and an unverified app is
capped at 100 users until you complete brand verification: homepage, privacy-policy URL, authorized domain).

What the server does on a Google sign-in: it exchanges the `code` with Google (server → `oauth2.googleapis.com`, so the **server must be
able to reach Google on port 443**), finds or creates the user, gives a brand-new user a company + admin role + placeholder
subscription, and posts the login result to the frontend popup. The Google profile picture is **not** imported.

Quick test from the server without a browser (a fake code must give `invalid_grant`, which proves the client id/secret are accepted):

```bash
curl -s -X POST https://oauth2.googleapis.com/token -d "client_id=$GOOGLE_CLIENT_ID" -d "client_secret=$GOOGLE_CLIENT_SECRET" \
  -d "code=bogus" -d "redirect_uri=$GOOGLE_REDIRECT_URI" -d "grant_type=authorization_code"
# {"error":"invalid_grant","error_description":"Malformed auth code."}   <- good.   invalid_client => wrong id/secret
```

---

## Cloudflare R2 (file storage)

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket** (e.g. `convoyai-staging`).
2. Bucket → **Settings → Public access → Public Development URL → Enable** (type `allow`). Copy the `https://pub-….r2.dev` address →
   `R2_PUBLIC_URL`. (For production attach a custom domain to the bucket instead — the r2.dev URL is rate-limited and meant for testing.)
3. R2 overview page → **Account details → Account ID** → `R2_ACCOUNT_ID`.
4. R2 overview → **Manage R2 API Tokens → Create API token** → permission **Object Read & Write**, scope **this bucket only** →
   copy **Access Key ID** → `R2_ACCESS_KEY_ID` and **Secret Access Key** (shown once) → `R2_SECRET_ACCESS_KEY`.
   _(A token with "Object Read only" lists and reads fine but every upload/delete fails with 403 — we hit exactly this.)_
5. `R2_BUCKET_NAME` = the bucket name.
6. Upload the ConvoyAI logo into the bucket as `images/logo.png` and set `MAIL_LOGO_URL` to `<R2_PUBLIC_URL>/images/logo.png`.

Files the app writes: `profile-images/…`, `floor-plans/…`, `yard-layouts/…`, `vehicles/…` (random UUID names). Laravel stored these on its own
server disk (`storage/app/public`, `FILESYSTEM_DISK=local`, no bucket) — there is nothing to migrate (no production data exists).

Verify from the server (writes and deletes a scratch object; run inside the project directory after `npm ci`, or use the container check
in [06](06-verify-operate-troubleshoot.md)).

---

## SMTP (Gmail)

1. The sending Google account needs **2-Step Verification** enabled.
2. <https://myaccount.google.com/apppasswords> → create an app password (16 characters, shown once).
3. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<the gmail address>`, `SMTP_PASS=<app password>`,
   `MAIL_FROM="ConvoyAI <the same address>"`.

Notes:

- Gmail always rewrites the visible sender to the authenticated address unless you add the alias under _Gmail → Settings → Accounts → Send mail as_.
  Laravel's configured sender was `ConvoyAI <skote@support.com>` (in practice recipients saw the Gmail account).
- Gmail limits ≈ 500 mails/day for a normal account — fine for verification mails, wrong for bulk alert mails; switch to a transactional
  provider (SES, Postmark, Mailgun, Resend) by changing only these five variables when you outgrow it.
- Outbound port 587 must be open from the server (some cloud providers block 25, not 587).
- Test without sending anything (login + STARTTLS only): from the project directory
  `node -e 'require("nodemailer").createTransport({host:process.env.SMTP_HOST,port:587,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}).verify().then(()=>console.log("OK"),e=>console.log(e.message))'`
  (with the env loaded, e.g. `set -a; . ./.env.production; set +a`).

---

## MQTT broker (HiveMQ Cloud) — optional

Only needed if devices publish over MQTT. Laravel's `.env` pointed at the previous developer's HiveMQ Cloud _test_ cluster
(`testtopic/…`, client id `convoyai_test_001`) — **do not reuse it**: it would make your server ingest that cluster's traffic.

1. <https://www.hivemq.com/mqtt-cloud-broker/> → free serverless cluster → _Manage cluster → Access management → create credentials_.
2. `MQTT_URL=mqtts://<cluster-host>:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`. Keep `MQTT_TOPIC_*` defaults unless your devices use other topics.
3. Per-company brokers can additionally be configured inside the app (MQTT configuration page); those credentials are stored encrypted with
   `MQTT_CONFIG_ENCRYPTION_SECRET`.

No broker? Leave `MQTT_URL` empty.

---

## Groq (AI suggestions) — optional

<https://console.groq.com> → API keys → create → `GROQ_API_KEY`. `GROQ_MODEL` defaults to `llama-3.3-70b-versatile` and can be changed
without a code change (edit the env value, restart).
