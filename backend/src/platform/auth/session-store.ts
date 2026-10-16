import type { Redis } from 'ioredis';

/**
 * Refresh-token and logout-blacklist storage (D-0027). Redis, not a new
 * Postgres table — TTL-based expiry is native here, and refresh tokens
 * are purely operational/session state, not something the frozen schema
 * needs to model. Keyed by `jti`, never the raw token value.
 */
const REFRESH_PREFIX = 'auth:refresh:';
const BLACKLIST_PREFIX = 'auth:blacklist:';

export async function storeRefreshToken(
  redis: Redis,
  jti: string,
  userId: string,
  ttlSeconds: number
): Promise<void> {
  await redis.set(REFRESH_PREFIX + jti, userId, 'EX', ttlSeconds);
}

/** Returns the owning userId if the refresh token is still valid (not revoked/rotated/expired), else undefined. */
export async function getRefreshTokenOwner(redis: Redis, jti: string): Promise<string | undefined> {
  const userId = await redis.get(REFRESH_PREFIX + jti);
  return userId ?? undefined;
}

/** Revoke a refresh token (rotation, or explicit logout). Idempotent. */
export async function revokeRefreshToken(redis: Redis, jti: string): Promise<void> {
  await redis.del(REFRESH_PREFIX + jti);
}

/** Blacklist an access token's jti until it would have naturally expired (logout). */
export async function blacklistAccessToken(
  redis: Redis,
  jti: string,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) {
    return;
  }
  await redis.set(BLACKLIST_PREFIX + jti, '1', 'EX', ttlSeconds);
}

export async function isAccessTokenBlacklisted(redis: Redis, jti: string): Promise<boolean> {
  const value = await redis.get(BLACKLIST_PREFIX + jti);
  return value !== null;
}
