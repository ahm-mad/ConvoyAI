import corsMiddleware from 'cors';
import type { RequestHandler } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * CORS (D-0096, Phase 7) — the app had none at all before this, a real
 * gap only surfaced once an actual browser-based frontend integration
 * test was attempted (every prior live-verification used `curl`, never
 * subject to CORS). Mirrors Laravel's own `config/cors.php`: an explicit
 * origin allowlist, not a wildcard — `CORS_ALLOWED_ORIGINS` (comma-
 * separated, `env.schema.ts`) is the one place to add more, no code
 * change needed for a new local dev port, a staging domain, or the real
 * production frontend domain(s).
 *
 * `credentials: false` (the `cors` package's own default) is deliberate,
 * not an oversight — confirmed by reading `modules/auth/*.ts` directly:
 * this API is bearer-token-only (`Authorization` header), no cookies are
 * ever set, so there is nothing that needs `Access-Control-Allow-
 * Credentials` and the browser-side risk that comes with enabling it.
 */
export function createCorsMiddleware(): RequestHandler {
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS;

  return corsMiddleware({
    // D-0168 (B11): a browser can only read these response headers cross-origin when they are exposed — the CSV export's suggested
    // file name (`Content-Disposition`) and its row count (`X-Export-Row-Count`).
    exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'],
    origin(origin, callback) {
      // No Origin header at all (server-to-server, curl, same-origin) —
      // never subject to CORS in the first place, always allow.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn({ origin, allowedOrigins }, 'CORS: rejected origin not in CORS_ALLOWED_ORIGINS');
      callback(null, false);
    },
  });
}
