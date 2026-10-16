import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { signAccessToken } from '../../auth/jwt.js';
import {
  SYSTEM_CONTEXT,
  createRequestContextMiddleware,
  getRequestContext,
  isSystemContext,
  runAsSystem,
  runAsSystemAsync,
  runWithContext,
  runWithContextAsync,
} from '../request-context.js';

/**
 * Simulates Prisma's "lazy promise" query builders — a real `.then()`
 * that only fires when awaited/chained, not a normal eagerly-executing
 * Promise. This is exactly what makes the sync `runWithContext` silently
 * lose its AsyncLocalStorage scope for a single DB call (see
 * `runWithContextAsync`'s doc comment) — this fake reproduces that
 * failure mode without needing a real database.
 */
function lazyThenable<T>(resolveWith: () => T): PromiseLike<T> {
  return {
    then(onFulfilled) {
      return Promise.resolve().then(() => onFulfilled?.(resolveWith()));
    },
  } as PromiseLike<T>;
}

function fakeReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

function fakeRedis(blacklisted = false): Redis {
  return { get: () => Promise.resolve(blacklisted ? '1' : null) } as unknown as Redis;
}

const requestContextMiddleware = createRequestContextMiddleware(fakeRedis());

describe('request context', () => {
  it('getRequestContext() returns undefined outside any context', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('middleware populates the context from a valid bearer token', async () => {
    const token = signAccessToken({
      sub: 'user-1',
      companyId: 'company-1',
      roles: ['admin'],
      perms: ['all-devices'],
    });
    let seen: ReturnType<typeof getRequestContext>;

    // Must read getRequestContext() from inside `next` — the ALS scope
    // ends as soon as the synchronous middleware call returns.
    await new Promise<void>(resolve => {
      requestContextMiddleware(fakeReq(`Bearer ${token}`), {} as Response, () => {
        seen = getRequestContext();
        resolve();
      });
    });

    expect(seen).toMatchObject({
      userId: 'user-1',
      companyId: 'company-1',
      roles: ['admin'],
      perms: ['all-devices'],
    });
    expect(typeof seen?.jti).toBe('string');
  });

  it('middleware leaves the context unset when there is no bearer token', async () => {
    let seen: ReturnType<typeof getRequestContext> = SYSTEM_CONTEXT;
    await new Promise<void>(resolve => {
      requestContextMiddleware(fakeReq(undefined), {} as Response, () => {
        seen = getRequestContext();
        resolve();
      });
    });

    expect(seen).toBeUndefined();
  });

  it('middleware leaves the context unset when the token is invalid', async () => {
    let seen: ReturnType<typeof getRequestContext> = SYSTEM_CONTEXT;
    await new Promise<void>(resolve => {
      requestContextMiddleware(fakeReq('Bearer not-a-real-token'), {} as Response, () => {
        seen = getRequestContext();
        resolve();
      });
    });

    expect(seen).toBeUndefined();
  });

  it('middleware leaves the context unset for a blacklisted (logged-out) token', async () => {
    const token = signAccessToken({ sub: 'user-1' });
    const blacklisting = createRequestContextMiddleware(fakeRedis(true));

    let seen: ReturnType<typeof getRequestContext> = SYSTEM_CONTEXT;
    await new Promise<void>(resolve => {
      blacklisting(fakeReq(`Bearer ${token}`), {} as Response, () => {
        seen = getRequestContext();
        resolve();
      });
    });

    expect(seen).toBeUndefined();
  });

  it('runWithContext() makes a context available for non-HTTP entrypoints (workers, MQTT, scheduler)', () => {
    const context = {
      userId: 'u1',
      companyId: 'c1',
      roles: [],
      perms: [],
      jti: 'jti-1',
      exp: 9999999999,
    };

    const result = runWithContext(context, () => getRequestContext());

    expect(result).toBe(context);
    expect(getRequestContext()).toBeUndefined();
  });

  it('runAsSystem() establishes the named SYSTEM_CONTEXT escape hatch', () => {
    const result = runAsSystem(() => getRequestContext());

    expect(result).toBe(SYSTEM_CONTEXT);
    expect(isSystemContext(result)).toBe(true);
  });

  it('isSystemContext() is false for a real user context and for no context', () => {
    expect(
      isSystemContext({
        userId: 'u1',
        companyId: 'c1',
        roles: [],
        perms: [],
        jti: 'jti-1',
        exp: 9999999999,
      })
    ).toBe(false);
    expect(isSystemContext(undefined)).toBe(false);
  });

  it('the sync runWithContext() loses context for an unawaited lazy thenable (the bug runWithContextAsync fixes)', async () => {
    const context = {
      userId: 'u1',
      companyId: 'c1',
      roles: [],
      perms: [],
      jti: 'jti-1',
      exp: 9999999999,
    };

    const pending = runWithContext(context, () => lazyThenable(() => getRequestContext()));
    const seenInside = await pending;

    expect(seenInside).toBeUndefined();
  });

  it('runWithContextAsync() correctly propagates context through a lazy thenable', async () => {
    const context = {
      userId: 'u1',
      companyId: 'c1',
      roles: [],
      perms: [],
      jti: 'jti-1',
      exp: 9999999999,
    };

    const seenInside = await runWithContextAsync(context, () =>
      lazyThenable(() => getRequestContext())
    );

    expect(seenInside).toBe(context);
  });

  it('runAsSystemAsync() propagates SYSTEM_CONTEXT through a lazy thenable', async () => {
    const seenInside = await runAsSystemAsync(() => lazyThenable(() => getRequestContext()));

    expect(seenInside).toBe(SYSTEM_CONTEXT);
  });
});
