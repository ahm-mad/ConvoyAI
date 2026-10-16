import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../platform/config/index.js';
import { AuthService } from '../auth.service.js';
import { SocialLoginService } from '../social-login.service.js';
import { fakeAuthRepository, fakeClaimsResolver, fakeRedis } from './fakes.js';

vi.mock('../../../platform/mail/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

const noOnboarding = { onboardSocialUser: () => Promise.resolve() };

describe('SocialLoginService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRedirectUrl', () => {
    it('rejects an unsupported provider', () => {
      const { redis } = fakeRedis();
      const service = new SocialLoginService(
        new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver()),
        noOnboarding
      );

      expect(() => service.getRedirectUrl('facebook')).toThrow();
    });
  });

  describe('handleCallback', () => {
    it("redirects to the frontend's oauth_failed page when the provider or code is missing", async () => {
      const { redis } = fakeRedis();
      const service = new SocialLoginService(
        new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver()),
        noOnboarding
      );

      const result = await service.handleCallback('google', undefined);

      expect(result).toHaveProperty('redirect');
      expect((result as { redirect: string }).redirect).toContain('error=oauth_failed');
    });

    it("redirects to the frontend's auth_failed page when the provider isn't configured (no client id/secret)", async () => {
      const { redis } = fakeRedis();
      const service = new SocialLoginService(
        new AuthService(fakeAuthRepository([]), redis, fakeClaimsResolver()),
        noOnboarding
      );

      const result = await service.handleCallback('google', 'some-code');

      expect(result).toHaveProperty('redirect');
      expect((result as { redirect: string }).redirect).toContain('error=auth_failed');
    });
  });

  describe('handleCallback — full Google flow with the provider mocked (D-0132)', () => {
    const googleConfig = config as {
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      GOOGLE_REDIRECT_URI?: string;
    };

    beforeEach(() => {
      googleConfig.GOOGLE_CLIENT_ID = 'test-client';
      googleConfig.GOOGLE_CLIENT_SECRET = 'test-secret';
      googleConfig.GOOGLE_REDIRECT_URI = 'http://localhost:8080/api/auth/google/callback';
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(
            new Response(
              url.includes('oauth2.googleapis.com/token')
                ? JSON.stringify({ access_token: 'at' })
                : JSON.stringify({
                    sub: 'g-123',
                    email: 'new.person@gmail.com',
                    name: 'New Person',
                  }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      googleConfig.GOOGLE_CLIENT_ID = '';
      googleConfig.GOOGLE_CLIENT_SECRET = '';
      googleConfig.GOOGLE_REDIRECT_URI = '';
    });

    function buildService(onboard: (userId: string) => Promise<void>) {
      const { redis } = fakeRedis();
      const roles = [
        {
          id: '7',
          companyId: '1',
          name: 'admin',
          guardName: 'api',
          displayName: null,
          description: null,
          createdBy: null,
          createdAt: null,
          updatedAt: null,
          permissions: [],
        },
      ];
      const authService = new AuthService(
        fakeAuthRepository([]),
        redis,
        fakeClaimsResolver({ roles })
      );
      return new SocialLoginService(authService, { onboardSocialUser: onboard });
    }

    it('a brand-new user is onboarded (company/roles) and the popup gets the full /login-style user plus tokens', async () => {
      const onboard = vi.fn(() => Promise.resolve());
      const service = buildService(onboard);

      const result = await service.handleCallback('google', 'code');

      expect(onboard).toHaveBeenCalledTimes(1);
      const html = (result as { html: string }).html;
      expect(html).toContain('GOOGLE_AUTH_SUCCESS');
      const message = JSON.parse(/postMessage\((.*), "http/s.exec(html)?.[1] ?? '{}') as {
        token: string;
        user: Record<string, unknown>;
      };
      expect(message.token).toEqual(expect.any(String));
      expect(message.user).toMatchObject({
        email: 'new.person@gmail.com',
        first_name: 'New',
        last_name: 'Person',
        social_provider: 'google',
        role_type: 'admin',
      });
      expect(message.user).toHaveProperty('companyInfo');
      expect(message.user).toHaveProperty('roles');
      expect(message.user).toHaveProperty('company');
    });

    it('onboarding runs before the tokens are issued (their company/role claims must be real)', async () => {
      const order: string[] = [];
      const { redis } = fakeRedis();
      const authService = new AuthService(fakeAuthRepository([]), redis, {
        ...fakeClaimsResolver(),
        resolveClaims: () => {
          order.push('claims');
          return Promise.resolve({ companyId: undefined, roles: [], perms: [] });
        },
      });
      const service = new SocialLoginService(authService, {
        onboardSocialUser: () => {
          order.push('onboard');
          return Promise.resolve();
        },
      });

      await service.handleCallback('google', 'code');

      expect(order.indexOf('onboard')).toBeLessThan(order.indexOf('claims'));
    });

    it("a provider failure redirects to the frontend's auth_failed page", async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('nope', { status: 400 })))
      );
      const service = buildService(() => Promise.resolve());

      const result = await service.handleCallback('google', 'code');

      expect((result as { redirect: string }).redirect).toContain('error=auth_failed');
    });
  });
});
