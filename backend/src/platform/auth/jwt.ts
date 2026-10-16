import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';

/**
 * JWT sign/verify (ARCHITECTURE.md §5). Claims shape is the contract
 * every guard and the realtime handshake rely on — keep `sub` as the
 * user id string; `companyId`/`roles`/`perms` are populated by module
 * 1.2 (auth) once real user resolution exists. Pure functions only —
 * no DB access, no route/controller here (that's module 1.2's job).
 *
 * Every access/refresh token gets its own `jti` (D-0027): logout
 * blacklists an access token's `jti` until natural expiry, and refresh
 * rotation keys Redis storage by the refresh token's `jti`, never the
 * raw token value.
 */
export interface AccessTokenClaims {
  sub: string;
  companyId?: string | undefined;
  roles?: string[];
  perms?: string[];
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  jti: string;
  /** Unix seconds — logout (D-0027) uses this to blacklist for exactly the remaining lifetime. */
  exp: number;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Invalid access token payload');
  }
  return payload as VerifiedAccessToken;
}

export interface RefreshTokenClaims {
  sub: string;
}

export interface VerifiedRefreshToken extends RefreshTokenClaims {
  jti: string;
}

export function signRefreshToken(claims: RefreshTokenClaims): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign(claims, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL,
    jwtid: jti,
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): VerifiedRefreshToken {
  const payload = jwt.verify(token, config.JWT_REFRESH_SECRET);
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('Invalid refresh token payload');
  }
  return { sub: payload.sub, jti: payload.jti };
}

/**
 * Email-verification tokens (D-0028): a distinct secret/TTL from access
 * tokens, so a leaked/logged verification link can never double as a
 * bearer auth token — signature verification fails outright, not just a
 * claim check that a future change could accidentally skip. Minted by
 * module 1.2's `register`; consumed by module 5.3's `/verify-token`.
 */
export interface VerificationTokenClaims {
  sub: string;
}

export function signVerificationToken(claims: VerificationTokenClaims): string {
  return jwt.sign(claims, config.JWT_VERIFICATION_SECRET, {
    expiresIn: config.JWT_VERIFICATION_TTL,
  });
}

export function verifyVerificationToken(token: string): VerificationTokenClaims {
  const payload = jwt.verify(token, config.JWT_VERIFICATION_SECRET);
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Invalid verification token payload');
  }
  return { sub: payload.sub };
}

/**
 * Module 5.3's `/resend-verification-email` (`resendVerificationEmail` —
 * Laravel's own comment: "Get user from expired token"). D-0028 gave
 * verification tokens one real, single TTL (no more hidden shorter
 * custom-window-vs-actual-JWT-lifetime split, the mechanism Laravel's
 * version actually depended on) — so recovering the subject from a
 * token whose real `exp` has already passed needs `ignoreExpiration`
 * explicitly, not a side effect of two mismatched lifetimes. Signature
 * verification still runs in full (a tampered/forged token still throws)
 * — only the expiry check is skipped.
 */
export function decodeExpiredVerificationTokenSubject(token: string): string {
  const payload = jwt.verify(token, config.JWT_VERIFICATION_SECRET, { ignoreExpiration: true });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Invalid verification token payload');
  }
  return payload.sub;
}
