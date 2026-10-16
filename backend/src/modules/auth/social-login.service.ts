import { config } from '../../platform/config/index.js';
import { logger } from '../../platform/logging/logger.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import { toLoginUserResponse } from './auth.mapper.js';
import type { AuthService } from './auth.service.js';
import type { SocialProfile, SocialProvider } from './auth.types.js';

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
}

function providerConfig(provider: SocialProvider): ProviderConfig {
  if (provider === 'google') {
    return {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scope: 'openid email profile',
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      redirectUri: config.GOOGLE_REDIRECT_URI,
    };
  }
  return {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'user:email',
    clientId: config.GITHUB_CLIENT_ID,
    clientSecret: config.GITHUB_CLIENT_SECRET,
    redirectUri: config.GITHUB_REDIRECT_URI,
  };
}

function isSupportedProvider(provider: string): provider is SocialProvider {
  return provider === 'google' || provider === 'github';
}

/**
 * Direct OAuth2 code exchange per provider (ARCHITECTURE.md §5 — no
 * Passport/Socialite). Only `redirect`/`callback` mechanics + find-or-
 * create live here; company/role bootstrap for a brand-new user is 5.3's
 * job (D-0031-adjacent — same split as register/verify-token).
 */
/** Module 5.3's `OnboardingService` (interface-typed — CONVENTIONS.md "Modules"): company + admin role + placeholder subscription for a user with no company yet. */
export interface SocialUserOnboarding {
  onboardSocialUser(userId: string): Promise<void>;
}

export class SocialLoginService {
  constructor(
    private readonly authService: AuthService,
    private readonly onboarding: SocialUserOnboarding
  ) {}

  getRedirectUrl(provider: string | undefined): string {
    if (!provider || !isSupportedProvider(provider)) {
      throw new ValidationError(`Provider [${provider ?? ''}] is not supported.`);
    }
    const cfg = providerConfig(provider);
    if (!cfg.clientId || !cfg.redirectUri) {
      throw new ValidationError(`Provider [${provider}] is not configured.`);
    }

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: cfg.scope,
    });
    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Returns the HTML page Laravel's callback returns (postMessage to the
   * opener), or — on any failure — the frontend redirect URL Laravel
   * uses instead of a JSON error (`{redirect: url}` lets the controller
   * choose `res.redirect` vs `res.send(html)`).
   */
  async handleCallback(
    provider: string | undefined,
    code: string | undefined
  ): Promise<{ redirect: string } | { html: string }> {
    const frontendUrl = config.FRONTEND_URL.replace(/\/$/, '');

    if (!provider || !isSupportedProvider(provider) || !code) {
      return { redirect: `${frontendUrl}/login?error=oauth_failed` };
    }

    try {
      const profile = await this.exchangeCodeForProfile(provider, code);
      const found = await this.authService.findOrCreateSocialUser(profile);
      // D-0132: a brand-new social user (or an email-registered one that never verified) has no company yet — give them
      // the same bootstrap `verify-token` gives, BEFORE issuing tokens so the access token's company/role claims are real.
      if (found.companyId === null) {
        await this.onboarding.onboardSocialUser(found.id);
      }
      const { user, tokens, enrichment } = await this.authService.completeSocialLogin(found.id);

      const payload = {
        type: 'GOOGLE_AUTH_SUCCESS',
        success: true,
        message: 'Login successful',
        user: toLoginUserResponse(user, enrichment),
        token: tokens.accessToken,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        packet_issues: [] as string[],
      };

      return {
        html: `<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body>
<script>
  window.opener && window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(frontendUrl)});
</script>
</body>
</html>`,
      };
    } catch (error) {
      // Laravel logs a warning here too (`Socialite [{provider}] callback failed`); before D-0133 this failure was silent.
      logger.warn({ err: error, provider }, 'Social login callback failed');
      return { redirect: `${frontendUrl}/login?error=auth_failed` };
    }
  }

  private async exchangeCodeForProfile(
    provider: SocialProvider,
    code: string
  ): Promise<SocialProfile> {
    const cfg = providerConfig(provider);
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      throw new Error(`Provider [${provider}] is not configured.`);
    }

    const tokenResponse = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`${provider} token exchange failed: ${String(tokenResponse.status)}`);
    }
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token) {
      throw new Error(`${provider} token exchange returned no access_token`);
    }

    const userResponse = await fetch(cfg.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}`, Accept: 'application/json' },
    });
    if (!userResponse.ok) {
      throw new Error(`${provider} userinfo fetch failed: ${String(userResponse.status)}`);
    }

    if (provider === 'google') {
      const body = (await userResponse.json()) as { sub: string; email?: string; name?: string };
      return { provider, providerId: body.sub, email: body.email, name: body.name };
    }

    const body = (await userResponse.json()) as {
      id: number;
      email?: string | null;
      name?: string | null;
      login?: string;
    };
    return {
      provider,
      providerId: String(body.id),
      email: body.email ?? undefined,
      name: body.name ?? body.login ?? undefined,
    };
  }
}
