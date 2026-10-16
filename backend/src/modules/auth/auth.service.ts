import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { config } from '../../platform/config/index.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signVerificationToken,
} from '../../platform/auth/jwt.js';
import { hashPassword, isLegacyBcryptHash, verifyPassword } from '../../platform/auth/password.js';
import type { ClaimsResolver } from '../../platform/auth/claims-resolver.js';
import type { CompanyLookup } from '../../platform/auth/company-lookup.js';
import type { RolesWithPermissionsLookup } from '../../platform/auth/roles-with-permissions-lookup.js';
import {
  blacklistAccessToken,
  getRefreshTokenOwner,
  revokeRefreshToken,
  storeRefreshToken,
} from '../../platform/auth/session-store.js';
import { sendMail } from '../../platform/mail/mailer.js';
import {
  renderVerifyUserEmail,
  verifyUrlFor,
  VERIFY_USER_SUBJECT,
} from '../../platform/mail/templates/verify-user.js';
import {
  AppError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../platform/errors/app-error.js';
import { AuthRepository } from './auth.repository.js';
import type {
  AuthUser,
  LoginEnrichment,
  RegisterInput,
  SocialProfile,
  TokenPair,
} from './auth.types.js';

// Laravel config/auth.php "passwords.users": not env-configurable there
// either, ported as literal constants (D-0013 exact-value match).
const PASSWORD_RESET_EXPIRE_MINUTES = 60;
const PASSWORD_RESET_THROTTLE_SECONDS = 60;

function hashResetToken(rawToken: string): string {
  // A lookup-safety hash, not a password hash — sha256 is the right tool
  // here, not argon2id (deliberately slow, wrong fit for this).
  return createHash('sha256').update(rawToken).digest('hex');
}

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly redis: Redis,
    private readonly claimsResolver: ClaimsResolver & CompanyLookup & RolesWithPermissionsLookup
  ) {}

  /**
   * D-0040: `companyId`/`roles`/`perms` come from a real lookup (module
   * 1.3's `ClaimsResolver`), not left empty — an issued token with no
   * `companyId` made every company-scoped query throw for a normal
   * logged-in user (`tenant-scoping.ts` requires a real tenant value
   * under a non-system context), not just a "guards are open" risk.
   */
  private async issueTokenPair(userId: string): Promise<TokenPair> {
    const claims = await this.claimsResolver.resolveClaims(userId);
    const accessToken = signAccessToken({
      sub: userId,
      companyId: claims.companyId,
      roles: claims.roles,
      perms: claims.perms,
    });
    const { token: refreshToken, jti } = signRefreshToken({ sub: userId });
    await storeRefreshToken(this.redis, jti, userId, config.JWT_REFRESH_TTL);
    return { accessToken, refreshToken };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: AuthUser; tokens: TokenPair; enrichment: LoginEnrichment }> {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthenticatedError('Invalid credentials');
    }
    if (user.emailVerifiedAt === null) {
      throw new ForbiddenError('Please verify your email first.');
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new UnauthenticatedError('Invalid credentials');
    }

    if (isLegacyBcryptHash(user.passwordHash)) {
      await this.authRepository.updatePassword(user.id, await hashPassword(password));
    }

    const [tokens, enrichment] = await Promise.all([
      this.issueTokenPair(user.id),
      this.buildLoginEnrichment(user),
    ]);
    return { user, tokens, enrichment };
  }

  /**
   * D-0098: `/login`'s real `company`/`roles.permissions` eager-load plus
   * the two fields Laravel computes inline. `companyInfo` matches
   * `Company::where('id', $user->company_id)->whereNotNull('email')->
   * whereNotNull('address')->exists()` exactly (both must be non-null, not
   * just the company existing). `role_type` matches
   * `$user->getRoleNames()->first()` — the first role by the same
   * `model_has_roles` query order `resolveClaims` (D-0040) already uses.
   */
  private async buildLoginEnrichment(user: AuthUser): Promise<LoginEnrichment> {
    const [company, roles] = await Promise.all([
      user.companyId
        ? this.claimsResolver.findCompanyById(user.companyId)
        : Promise.resolve(undefined),
      this.claimsResolver.findRolesWithPermissionsForUser(user.id),
    ]);

    return {
      company,
      roles,
      companyInfo: company !== undefined && company.email !== null && company.address !== null,
      roleType: roles.at(0)?.name ?? null,
    };
  }

  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const existing = await this.authRepository.findByEmail(input.email);
    if (existing) {
      throw new ValidationError('The email has already been taken.', {
        email: ['The email has already been taken.'],
      });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.authRepository.createUser(input, passwordHash);
    const tokens = await this.issueTokenPair(user.id);

    // D-0028: a distinct, narrowly-scoped token for the emailed link —
    // never usable as a bearer access token, unlike the old app's reuse
    // of one JWT for both purposes.
    const verificationToken = signVerificationToken({ sub: user.id });
    await sendMail({
      to: user.email,
      subject: VERIFY_USER_SUBJECT,
      html: renderVerifyUserEmail({
        firstName: user.firstName,
        verifyUrl: verifyUrlFor(verificationToken),
      }),
    });

    return { user, tokens };
  }

  /** Revokes the current access token (blacklist until natural expiry) and, if given, the refresh token. */
  async logout(accessJti: string, accessExpiresAt: number, refreshToken?: string): Promise<void> {
    const ttl = accessExpiresAt - Math.floor(Date.now() / 1000);
    await blacklistAccessToken(this.redis, accessJti, ttl);

    if (refreshToken) {
      try {
        const { jti } = verifyRefreshToken(refreshToken);
        await revokeRefreshToken(this.redis, jti);
      } catch {
        // Already invalid/expired — nothing to revoke, logout still succeeds.
      }
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let verified;
    try {
      verified = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthenticatedError('Invalid or expired refresh token');
    }

    const owner = await getRefreshTokenOwner(this.redis, verified.jti);
    if (!owner || owner !== verified.sub) {
      throw new UnauthenticatedError('Refresh token has been revoked');
    }

    await revokeRefreshToken(this.redis, verified.jti);
    return this.issueTokenPair(verified.sub);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthenticatedError();
    }

    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      throw new ForbiddenError('Current password does not match');
    }

    await this.authRepository.updatePassword(userId, await hashPassword(newPassword));
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new ValidationError('The selected email is invalid.', {
        email: ['The selected email is invalid.'],
      });
    }

    const existing = await this.authRepository.findPasswordResetToken(email);
    if (
      existing?.createdAt &&
      this.secondsSince(existing.createdAt) < PASSWORD_RESET_THROTTLE_SECONDS
    ) {
      throw new AppError({
        code: 'PASSWORD_RESET_THROTTLED',
        httpStatus: 500,
        message: 'Please wait before retrying.',
      });
    }

    const rawToken = randomBytes(32).toString('hex');
    await this.authRepository.upsertPasswordResetToken(email, hashResetToken(rawToken));

    const resetUrl = `${config.FRONTEND_URL}/reset-password/${rawToken}?email=${encodeURIComponent(email)}`;
    await sendMail({
      to: email,
      subject: 'Reset Your Password',
      html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  }

  /** Checks a reset token without consuming it (closes 11.7 — the frontend calls this, nothing used to answer). */
  async verifyResetToken(email: string, token: string): Promise<void> {
    await this.loadValidResetToken(email, token);
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    await this.loadValidResetToken(email, token);

    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new AppError({
        code: 'PASSWORD_RESET_FAILED',
        httpStatus: 500,
        message: "We can't find a user with that email address.",
      });
    }

    await this.authRepository.updatePassword(user.id, await hashPassword(newPassword));
    await this.authRepository.deletePasswordResetToken(email);
  }

  private async loadValidResetToken(email: string, token: string): Promise<void> {
    const row = await this.authRepository.findPasswordResetToken(email);
    if (!row) {
      throw new UnauthenticatedError('This password reset token is invalid.');
    }
    if (row.createdAt && this.secondsSince(row.createdAt) > PASSWORD_RESET_EXPIRE_MINUTES * 60) {
      throw new UnauthenticatedError('This password reset token is invalid.');
    }
    if (hashResetToken(token) !== row.tokenHash) {
      throw new UnauthenticatedError('This password reset token is invalid.');
    }
  }

  private secondsSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / 1000);
  }

  /**
   * Social find-or-create (`SocialiteController::findOrCreateUser`).
   * Company/role bootstrap for a brand-new user is 5.3's job, same split
   * as register/verify-token — a fresh social user has no company/roles
   * until that pipeline runs, matching how register-only signups already
   * work today.
   */
  async findOrCreateSocialUser(profile: SocialProfile): Promise<AuthUser> {
    const existing = await this.authRepository.findBySocialAccount(
      profile.provider,
      profile.providerId
    );
    if (existing) {
      return existing;
    }

    if (profile.email) {
      const byEmail = await this.authRepository.findByEmail(profile.email);
      if (byEmail) {
        await this.authRepository.linkSocialAccount(byEmail, profile.provider, profile.providerId);
        return { ...byEmail, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() };
      }
    }

    const [firstName, ...rest] = (profile.name ?? 'User').split(' ');
    const email = profile.email ?? `${profile.providerId}@${profile.provider}.social`;
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));

    return this.authRepository.createSocialUser({
      firstName: firstName ?? 'User',
      lastName: rest.join(' '),
      email,
      provider: profile.provider,
      providerId: profile.providerId,
      passwordHash,
    });
  }

  async issueTokensForUser(userId: string): Promise<TokenPair> {
    return this.issueTokenPair(userId);
  }

  /**
   * D-0132: what a social sign-in returns, once the user has their company/roles — the same tokens and the same
   * `company`/`roles.permissions`/`companyInfo`/`role_type` enrichment `/login` builds. Tokens are issued *after* the
   * caller's onboarding step so their `companyId`/roles claims are real (see `issueTokenPair`).
   */
  async completeSocialLogin(
    userId: string
  ): Promise<{ user: AuthUser; tokens: TokenPair; enrichment: LoginEnrichment }> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthenticatedError();
    }
    const [tokens, enrichment] = await Promise.all([
      this.issueTokenPair(user.id),
      this.buildLoginEnrichment(user),
    ]);
    return { user, tokens, enrichment };
  }
}
