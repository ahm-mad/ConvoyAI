import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAccessToken, verifyRefreshToken } from '../../../platform/auth/jwt.js';
import { hashPassword } from '../../../platform/auth/password.js';
import {
  AppError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../../platform/errors/app-error.js';
import { AuthService } from '../auth.service.js';
import { fakeAuthRepository, fakeClaimsResolver, fakeRedis } from './fakes.js';
import type { AuthUser } from '../auth.types.js';

vi.mock('../../../platform/mail/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

async function makeVerifiedUser(overrides: Partial<AuthUser> = {}): Promise<AuthUser> {
  return {
    id: '1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    number: '555',
    companyId: null,
    status: 'active',
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword('correct-password'),
    socialProvider: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('issues a token pair for a verified user with the right password', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());

      const result = await service.login(user.email, 'correct-password');

      expect(result.user.id).toBe(user.id);
      expect(verifyAccessToken(result.tokens.accessToken).sub).toBe(user.id);
      expect(verifyRefreshToken(result.tokens.refreshToken).sub).toBe(user.id);
    });

    it('rejects an unknown email', async () => {
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver());

      await expect(service.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });

    it('rejects a wrong password', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());

      await expect(service.login(user.email, 'wrong-password')).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });

    it('rejects an unverified email with 403 (matches Laravel: verify before attempting credentials)', async () => {
      const user = await makeVerifiedUser({ emailVerifiedAt: null });
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());

      await expect(service.login(user.email, 'correct-password')).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });
  });

  describe('register', () => {
    it('creates a new user, issues tokens, and sends a verification email', async () => {
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver());

      const { user, tokens } = await service.register({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        number: '555',
        password: 'longenough',
        timezone: 'UTC',
      });

      expect(user.email).toBe('grace@example.com');
      expect(user.emailVerifiedAt).toBeNull();
      expect(verifyAccessToken(tokens.accessToken).sub).toBe(user.id);

      const { sendMail } = await import('../../../platform/mail/mailer.js');
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'grace@example.com' }));
    });

    it('rejects a duplicate email', async () => {
      const existing = await makeVerifiedUser({ email: 'taken@example.com' });
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([existing]), redis, fakeClaimsResolver());

      await expect(
        service.register({
          firstName: 'X',
          lastName: 'Y',
          email: 'taken@example.com',
          number: '1',
          password: 'longenough',
          timezone: 'UTC',
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('logout + refresh (D-0027)', () => {
    it('blacklists the access token and revokes the refresh token', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());
      const { tokens } = await service.login(user.email, 'correct-password');
      const accessClaims = verifyAccessToken(tokens.accessToken);

      await service.logout(accessClaims.jti, accessClaims.exp, tokens.refreshToken);

      await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });

    it('refresh rotates: old refresh token stops working, new one works', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());
      const { tokens } = await service.login(user.email, 'correct-password');

      const rotated = await service.refresh(tokens.refreshToken);

      expect(verifyAccessToken(rotated.accessToken).sub).toBe(user.id);
      await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
      // The new refresh token works.
      await expect(service.refresh(rotated.refreshToken)).resolves.toBeDefined();
    });

    it('rejects an unknown/garbage refresh token', async () => {
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver());

      await expect(service.refresh('not-a-real-token')).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });
  });

  describe('changePassword', () => {
    it('changes the password when the current one matches', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const repository = fakeAuthRepository([user]);
      const service = new AuthService(repository, redis, fakeClaimsResolver());

      await service.changePassword(user.id, 'correct-password', 'new-password-1');

      await expect(service.login(user.email, 'new-password-1')).resolves.toBeDefined();
    });

    it('rejects when the current password is wrong', async () => {
      const user = await makeVerifiedUser();
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());

      await expect(
        service.changePassword(user.id, 'wrong', 'new-password-1')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('forgot/reset/verify-reset password', () => {
    it('full round-trip: request a reset, verify the token, reset with it', async () => {
      const user = await makeVerifiedUser({ email: 'reset-me@example.com' });
      const { redis } = fakeRedis();
      const repository = fakeAuthRepository([user]);
      const service = new AuthService(repository, redis, fakeClaimsResolver());

      await service.forgotPassword(user.email);
      const { sendMail } = await import('../../../platform/mail/mailer.js');
      const call = vi.mocked(sendMail).mock.calls.at(-1)?.[0];
      const rawToken = call?.html.match(/reset-password\/([a-f0-9]+)\?/)?.[1];
      expect(rawToken).toBeDefined();

      await expect(
        service.verifyResetToken(user.email, rawToken as string)
      ).resolves.toBeUndefined();

      await service.resetPassword(user.email, rawToken as string, 'brand-new-password');
      await expect(service.login(user.email, 'brand-new-password')).resolves.toBeDefined();
      // The token is single-use — consumed by resetPassword.
      await expect(service.verifyResetToken(user.email, rawToken as string)).rejects.toBeInstanceOf(
        UnauthenticatedError
      );
    });

    it("forgotPassword rejects an email with no account (matches Laravel's exists: validation)", async () => {
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver());

      await expect(service.forgotPassword('nobody@example.com')).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('forgotPassword throttles a second request within 60s', async () => {
      const user = await makeVerifiedUser({ email: 'throttle-me@example.com' });
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());

      await service.forgotPassword(user.email);

      await expect(service.forgotPassword(user.email)).rejects.toBeInstanceOf(AppError);
    });

    it('verifyResetToken rejects a wrong token', async () => {
      const user = await makeVerifiedUser({ email: 'wrong-token@example.com' });
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([user]), redis, fakeClaimsResolver());
      await service.forgotPassword(user.email);

      await expect(
        service.verifyResetToken(user.email, 'not-the-right-token')
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    });
  });

  describe('findOrCreateSocialUser', () => {
    it('creates a brand-new, pre-verified user when no match exists', async () => {
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver());

      const user = await service.findOrCreateSocialUser({
        provider: 'google',
        providerId: 'g-123',
        email: 'social@example.com',
        name: 'Social User',
      });

      expect(user.email).toBe('social@example.com');
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('returns the same user on a second lookup by provider+id', async () => {
      const { redis } = fakeRedis();
      const repository = fakeAuthRepository([]);
      const service = new AuthService(repository, redis, fakeClaimsResolver());
      const first = await service.findOrCreateSocialUser({
        provider: 'google',
        providerId: 'g-123',
        email: 'social@example.com',
        name: 'Social User',
      });

      const second = await service.findOrCreateSocialUser({
        provider: 'google',
        providerId: 'g-123',
        email: 'social@example.com',
        name: 'Social User',
      });

      expect(second.id).toBe(first.id);
    });

    it('links to an existing by-email user and marks their email verified', async () => {
      const existing = await makeVerifiedUser({
        email: 'link-me@example.com',
        emailVerifiedAt: null,
      });
      const { redis } = fakeRedis();
      const service = new AuthService(fakeAuthRepository([existing]), redis, fakeClaimsResolver());

      const linked = await service.findOrCreateSocialUser({
        provider: 'github',
        providerId: 'gh-456',
        email: 'link-me@example.com',
        name: 'Link Me',
      });

      expect(linked.id).toBe(existing.id);
      expect(linked.emailVerifiedAt).not.toBeNull();
    });
  });
});
