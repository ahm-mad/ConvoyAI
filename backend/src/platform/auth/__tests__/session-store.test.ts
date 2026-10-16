import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  blacklistAccessToken,
  getRefreshTokenOwner,
  isAccessTokenBlacklisted,
  revokeRefreshToken,
  storeRefreshToken,
} from '../session-store.js';

function fakeRedis() {
  const store = new Map<string, string>();
  const set = vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  const get = vi.fn((key: string) => Promise.resolve(store.get(key) ?? null));
  const del = vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve(1);
  });
  return { redis: { set, get, del } as unknown as Redis, set, get, del };
}

describe('session-store (D-0027: Redis-backed refresh tokens + logout blacklist)', () => {
  it("stores and reads back a refresh token's owning userId", async () => {
    const { redis, set } = fakeRedis();

    await storeRefreshToken(redis, 'jti-1', 'user-1', 3600);

    await expect(getRefreshTokenOwner(redis, 'jti-1')).resolves.toBe('user-1');
    expect(set).toHaveBeenCalledWith('auth:refresh:jti-1', 'user-1', 'EX', 3600);
  });

  it('returns undefined for an unknown/expired/revoked refresh token', async () => {
    const { redis } = fakeRedis();

    await expect(getRefreshTokenOwner(redis, 'never-issued')).resolves.toBeUndefined();
  });

  it('revoking a refresh token makes it unresolvable (rotation/logout)', async () => {
    const { redis } = fakeRedis();
    await storeRefreshToken(redis, 'jti-1', 'user-1', 3600);

    await revokeRefreshToken(redis, 'jti-1');

    await expect(getRefreshTokenOwner(redis, 'jti-1')).resolves.toBeUndefined();
  });

  it('blacklisting an access token jti makes isAccessTokenBlacklisted true', async () => {
    const { redis } = fakeRedis();

    await blacklistAccessToken(redis, 'jti-2', 900);

    await expect(isAccessTokenBlacklisted(redis, 'jti-2')).resolves.toBe(true);
    await expect(isAccessTokenBlacklisted(redis, 'jti-not-blacklisted')).resolves.toBe(false);
  });

  it('blacklisting with a non-positive TTL is a no-op (token already expired, nothing to blacklist)', async () => {
    const { redis, set } = fakeRedis();

    await blacklistAccessToken(redis, 'jti-3', 0);

    expect(set).not.toHaveBeenCalled();
  });
});
