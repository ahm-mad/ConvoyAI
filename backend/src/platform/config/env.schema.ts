import { z } from 'zod';

/**
 * The one place process.env is read and validated (ARCHITECTURE.md §11).
 * Fails fast at boot with a readable report of what's missing/invalid —
 * see config/index.ts. No module reads process.env directly.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HTTP_PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // PostgreSQL + TimescaleDB — the one database (D-0020).
  DATABASE_URL: z.url(),

  // Redis — BullMQ + cache.
  REDIS_URL: z.url(),

  // Auth — custom JWT (ARCHITECTURE.md §5).
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  // D-0125: 7 days, matching Laravel's `JWT_TTL` — the single `token`/`access_token` is deliberately long-lived for now (see KNOWN_ISSUES 11.64).
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(604_800),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  // D-0028: a distinct secret/TTL for email-verification tokens, never
  // usable as an access token (module 1.2 mints, 5.3 onboarding consumes).
  JWT_VERIFICATION_SECRET: z.string().min(1),
  JWT_VERIFICATION_TTL: z.coerce.number().int().positive().default(86_400),

  // Frontend URL (module 1.2: verification/reset links, OAuth postMessage origin).
  FRONTEND_URL: z.url().default('https://example.vercel.app'),

  // CORS (D-0096, Phase 7) — comma-separated list of exact allowed origins,
  // mirroring Laravel's own `config/cors.php` explicit-allowlist approach
  // (not a wildcard — this API is bearer-token-only, no cookies, but an
  // explicit list is still the safer default and the one the user asked
  // for). Add more by editing this one var, no code change: local dev
  // ports, staging domains, and the real production frontend domain(s) all
  // go here, comma-separated, no trailing slashes.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform(value =>
      value
        .split(',')
        .map(origin => origin.trim())
        .filter(origin => origin.length > 0)
    ),

  // Social login (module 1.2, ARCHITECTURE.md §5 — direct OAuth2 code
  // exchange, no Passport/Socialite). Optional: only google/github
  // configured mean those providers are usable; same pattern as Stripe/
  // Twilio above.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().optional(),

  // MQTT (HiveMQ) — connection (module 0.7) + topic registry (module 2.4,
  // `platform/mqtt/topics.ts`). Same pattern names/defaults as Laravel's
  // `config/mqtt.php` so an existing HiveMQ setup's topic structure carries
  // over unchanged; `{device_id}` is replaced with a real identifier by
  // `buildTopic()`.
  MQTT_URL: z.string().optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_TOPIC_DEVICE_DATA: z.string().default('convoyai/devices/{device_id}/data'),
  MQTT_TOPIC_DEVICE_STATUS: z.string().default('convoyai/devices/{device_id}/status'),
  MQTT_TOPIC_DEVICE_COMMANDS: z.string().default('convoyai/devices/{device_id}/commands'),
  MQTT_QOS: z.coerce.number().int().min(0).max(2).default(1),

  // Realtime.
  SOCKET_IO_PATH: z.string().default('/socket.io'),

  // Stripe (Phase 5).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Twilio (SMS rule actions).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  // Per-address TCP connect timeout for outbound connections (D-0133) — Node's own default (250 ms) is too short on slow links.
  NETWORK_CONNECT_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().min(10).default(5000),

  // Mail (SMTP).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Header logo for HTML emails (D-0131) — the old app served it from its own public storage; unset falls back to that URL.
  MAIL_LOGO_URL: z.string().optional(),

  // Groq (AI suggestions, module 6.3). STACK_MAPPING.md §11/§13 — base URL
  // was missing from .env.example, added here too. GROQ_MODEL (D-0092) is
  // new: a free-tier Groq-hosted model, deliberately a config value, not a
  // hardcoded string in application code — swappable with no code change
  // and no redeploy, just an env var edit + process restart.
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // Cloudflare R2 (module 1.4 profile images — D-0044, S3-compatible object
  // storage; the user's own account). Optional, same graceful-degradation
  // pattern as SMTP above — a dev environment without these configured
  // throws a clear error only when an upload is actually attempted, not
  // at boot.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  // The base URL images are served from — either R2's public r2.dev
  // development URL or a custom domain bound to the bucket. Not derivable
  // from the other R2_* vars (R2's API endpoint and its public serving URL
  // are deliberately different hosts).
  R2_PUBLIC_URL: z.string().optional(),

  // Ingestion-token crypto (module 2.1 `get-encrypt-token` — D-0047). A
  // dedicated secret, not reused from JWT — same "distinct secret per
  // purpose" precedent as D-0028's verification tokens. Required (not
  // optional like the third-party integrations above): this is core
  // module functionality, not an optional integration.
  INGESTION_TOKEN_SECRET: z.string().min(1),

  // At-rest encryption for module 4.8's mqtt-configurations (D-0117) —
  // per-company MQTT broker credentials (username/password), matching
  // Laravel's own model-level `encrypted` cast. A dedicated secret, same
  // "distinct secret per purpose" precedent as INGESTION_TOKEN_SECRET
  // above, not reused from JWT or the ingestion-token secret.
  MQTT_CONFIG_ENCRYPTION_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
