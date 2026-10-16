import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signVerificationToken,
  verifyVerificationToken,
  decodeExpiredVerificationTokenSubject,
} from '../jwt.js';

describe('jwt (D-0027/D-0028: jti-bearing access/refresh tokens, distinct verification tokens)', () => {
  it('access tokens carry a unique jti and round-trip the claims', () => {
    const token = signAccessToken({
      sub: 'u1',
      companyId: 'c1',
      roles: ['admin'],
      perms: ['all-devices'],
    });

    const claims = verifyAccessToken(token);

    expect(claims).toMatchObject({
      sub: 'u1',
      companyId: 'c1',
      roles: ['admin'],
      perms: ['all-devices'],
    });
    expect(typeof claims.jti).toBe('string');
    expect(claims.jti.length).toBeGreaterThan(0);
  });

  it('two access tokens for the same user get different jtis', () => {
    const a = verifyAccessToken(signAccessToken({ sub: 'u1' }));
    const b = verifyAccessToken(signAccessToken({ sub: 'u1' }));

    expect(a.jti).not.toBe(b.jti);
  });

  it('signRefreshToken returns the token and its jti together (for immediate Redis storage)', () => {
    const { token, jti } = signRefreshToken({ sub: 'u1' });

    const verified = verifyRefreshToken(token);

    expect(verified).toEqual({ sub: 'u1', jti });
  });

  it('verifyAccessToken rejects a token signed with the refresh secret', () => {
    const { token } = signRefreshToken({ sub: 'u1' });

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('verification tokens are signed with a distinct secret and are not usable as access tokens', () => {
    const verificationToken = signVerificationToken({ sub: 'u1' });

    expect(verifyVerificationToken(verificationToken)).toEqual({ sub: 'u1' });
    expect(() => verifyAccessToken(verificationToken)).toThrow();
  });

  it('an access token is not usable as a verification token', () => {
    const accessToken = signAccessToken({ sub: 'u1' });

    expect(() => verifyVerificationToken(accessToken)).toThrow();
  });

  it('verifyVerificationToken rejects an expired verification token (real exp enforced)', () => {
    const expired = jwt.sign({ sub: 'u1' }, config.JWT_VERIFICATION_SECRET, { expiresIn: -10 });

    expect(() => verifyVerificationToken(expired)).toThrow();
  });

  it("decodeExpiredVerificationTokenSubject recovers the subject from an expired-but-validly-signed token (D-0028, module 5.3's resend endpoint)", () => {
    const expired = jwt.sign({ sub: 'u1' }, config.JWT_VERIFICATION_SECRET, { expiresIn: -10 });

    expect(decodeExpiredVerificationTokenSubject(expired)).toBe('u1');
  });

  it('decodeExpiredVerificationTokenSubject still rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: 'u1' }, 'wrong-secret', { expiresIn: -10 });

    expect(() => decodeExpiredVerificationTokenSubject(forged)).toThrow();
  });
});
