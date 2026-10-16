import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { verifyAccessToken } from '../auth/jwt.js';
import { isAccessTokenBlacklisted } from '../auth/session-store.js';

/**
 * Request-scoped tenancy context (ARCHITECTURE.md §6). This is the
 * propagation mechanism only — the Prisma extension that *uses* it to
 * auto-scope queries is module 1.3's job (see platform/db/prisma.ts's
 * TODO). Populated here from the verified JWT when present; does not
 * reject unauthenticated requests itself (that's what requireAuth is
 * for, platform/http/guards.ts) since not every route needs a user.
 *
 * The same carrier also has to work outside Express: BullMQ workers,
 * the MQTT consumer, and the scheduler process have no request to derive
 * a context from, but the queries they run (rule evaluation, ingestion,
 * summary jobs) are just as tenant-owned as an HTTP request's — so
 * `runWithContext` lets those entrypoints establish a real context per
 * job/message. `runAsSystem`/`isSystemContext` are the "explicit and
 * named" escape hatch ARCHITECTURE.md §6 requires for the rare case that
 * genuinely has no single tenant (cross-tenant admin ops, migrations) —
 * 1.3's Prisma extension checks `isSystemContext()` to know when to skip
 * auto-scoping instead of that being an accidental side effect of a
 * missing/absent context.
 */
export interface RequestContext {
  userId: string;
  companyId: string | undefined;
  roles: string[];
  perms: string[];
  /** The access token's `jti` (module 1.2) — logout blacklists this. */
  jti: string;
  /** Unix seconds the access token expires — logout uses this for the blacklist TTL. */
  exp: number;
}

const SYSTEM_USER_ID = 'system';

export const SYSTEM_CONTEXT: RequestContext = {
  userId: SYSTEM_USER_ID,
  companyId: undefined,
  roles: ['system'],
  perms: [],
  jti: SYSTEM_USER_ID,
  exp: Number.MAX_SAFE_INTEGER,
};

export function isSystemContext(context: RequestContext | undefined): boolean {
  return context?.userId === SYSTEM_USER_ID;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Run `fn` with `context` active for the duration of the call (and anything it awaits). */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Run `fn` under the named system escape hatch — see the module doc above. */
export function runAsSystem<T>(fn: () => T): T {
  return runWithContext(SYSTEM_CONTEXT, fn);
}

/**
 * Async counterpart for wrapping **one** async call (a Prisma query, most
 * often) rather than a continuation-passing chain like Express's `next`.
 *
 * This is not just a convenience wrapper — using the sync `runWithContext`
 * for this is an easy, silent correctness bug: `AsyncLocalStorage.run()`
 * only keeps its store active for the synchronous portion of the callback
 * plus whatever async work is *actually kicked off* (an `await`/`.then()`
 * reached) during that window. Prisma's query methods return **lazy**
 * "PrismaPromise"s that don't start executing until awaited — so
 * `runWithContext(ctx, () => prisma.x.findMany(...))` returns an
 * unstarted query, the ALS scope closes the instant that synchronous call
 * returns, and by the time the *caller* awaits it outside, the extension
 * (`tenant-scoping.ts`) sees no context at all. Awaiting `fn()` **inside**
 * the ALS-run callback (below) forces that `.then()` to fire while the
 * scope is still open, which is what actually propagates it.
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => PromiseLike<T>
): Promise<T> {
  // The `await` here is load-bearing, not stylistic — see the doc comment
  // above. It's what forces the lazy thenable's `.then()` to fire
  // synchronously inside this callback's execution, while `storage.run()`'s
  // scope is still open, rather than after this function has already
  // returned an unstarted promise to the caller.
  return storage.run(context, async () => await fn());
}

export async function runAsSystemAsync<T>(fn: () => PromiseLike<T>): Promise<T> {
  return runWithContextAsync(SYSTEM_CONTEXT, fn);
}

/**
 * `redis` is required to check module 1.2's logout blacklist (D-0027) —
 * a request-context factory rather than a bare export, so it can be
 * constructed once in `app.ts` with the real client and with a fake in
 * tests, same pattern as `createApp`'s own deps.
 */
export function createRequestContextMiddleware(redis: Redis): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next();
      return;
    }

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      // Invalid/expired token on a route that doesn't require auth — let
      // it through with no context; requireAuth (guards.ts) enforces.
      next();
      return;
    }

    isAccessTokenBlacklisted(redis, claims.jti)
      .then(blacklisted => {
        if (blacklisted) {
          next();
          return;
        }
        const context: RequestContext = {
          userId: claims.sub,
          companyId: claims.companyId,
          roles: claims.roles ?? [],
          perms: claims.perms ?? [],
          jti: claims.jti,
          exp: claims.exp,
        };
        runWithContext(context, next);
      })
      .catch(next);
  };
}
