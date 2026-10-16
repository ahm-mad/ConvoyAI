import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import type { AuthUser, RegisterInput, SocialProvider } from './auth.types.js';
import { toAuthUser } from './auth.mapper.js';

/**
 * All Prisma access for module 1.2 (ARCHITECTURE.md §2 — repositories
 * own the DB, services never touch Prisma directly). `users` is
 * `company`-ruled in module 1.3's tenant-scoping extension, but every
 * query here legitimately runs *before* tenancy is established (looking
 * a user up by email/id/provider during login/register/password-reset,
 * with no request context at all) — so every `users`-table call is
 * wrapped in `runAsSystemAsync()` (not the sync `runAsSystem()` — Prisma's
 * query methods return lazy promises, see that function's doc comment for
 * why the distinction matters). `password_reset_tokens` is `none`-ruled
 * and needs no wrapping, but the extension would still reject an
 * unwrapped `users` call outright (no context) if this weren't here.
 */
export class AuthRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findByEmail(email: string): Promise<AuthUser | undefined> {
    const row = await runAsSystemAsync(() => this.prisma.users.findUnique({ where: { email } }));
    return row ? toAuthUser(row) : undefined;
  }

  async findById(id: string): Promise<AuthUser | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findUnique({ where: { id: BigInt(id) } })
    );
    return row ? toAuthUser(row) : undefined;
  }

  async findBySocialAccount(
    provider: SocialProvider,
    providerId: string
  ): Promise<AuthUser | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findFirst({
        where: { social_provider: provider, social_provider_id: providerId },
      })
    );
    return row ? toAuthUser(row) : undefined;
  }

  async createUser(input: RegisterInput, passwordHash: string): Promise<AuthUser> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.create({
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          number: input.number,
          timezone: input.timezone,
          password: passwordHash,
          status: 'active',
          company_id: null,
          email_verified_at: null,
        },
      })
    );
    return toAuthUser(row);
  }

  /**
   * Social find-or-create's "create" path (`SocialiteController::findOrCreateUser`
   * step 3) — pre-verified (the provider already confirmed the email/identity),
   * no password ever used to log in, so a random unguessable placeholder hash
   * fills the required `password` column.
   */
  async createSocialUser(params: {
    firstName: string;
    lastName: string;
    email: string;
    provider: SocialProvider;
    providerId: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.create({
        data: {
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          number: '',
          timezone: 'UTC',
          password: params.passwordHash,
          status: 'active',
          company_id: null,
          email_verified_at: new Date(),
          social_provider: params.provider,
          social_provider_id: params.providerId,
        },
      })
    );
    return toAuthUser(row);
  }

  /**
   * Links a social account to an existing (by-email) user and, per
   * `SocialiteController::findOrCreateUser` step 2, marks the email
   * verified if it wasn't already — the provider already confirmed it.
   */
  async linkSocialAccount(
    user: AuthUser,
    provider: SocialProvider,
    providerId: string
  ): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.users.update({
        where: { id: BigInt(user.id) },
        data: {
          social_provider: provider,
          social_provider_id: providerId,
          email_verified_at: user.emailVerifiedAt ?? new Date(),
        },
      })
    );
  }

  /**
   * `RbacCompanyUsersLookup` implementation (D-0100) — module 1.3's
   * `GET /companies` eager-loads `users` for an arbitrary target company
   * (the platform_operator viewing another company's row), never the
   * caller's own scoped context, so `runAsSystemAsync` + an explicit
   * `company_id` filter, same posture as `RbacRepository.bootstrapCompany`.
   * Returns every raw column except `password`/`remember_token` (Laravel's
   * own `$hidden` list) — the full shape Laravel's `Company::with('users')`
   * actually serializes.
   */
  async findAllForCompany(companyId: string) {
    const rows = await runAsSystemAsync(() =>
      this.prisma.users.findMany({ where: { company_id: BigInt(companyId) } })
    );
    return rows.map(row => ({
      id: row.id.toString(),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      number: row.number,
      timezone: row.timezone,
      profileImage: row.profile_image,
      companyId: row.company_id === null ? null : row.company_id.toString(),
      companyDomain: row.company_domain,
      status: row.status,
      emailVerifiedAt: row.email_verified_at,
      socialProvider: row.social_provider,
      socialProviderId: row.social_provider_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stripeId: row.stripe_id,
      pmType: row.pm_type,
      pmLastFour: row.pm_last_four,
      trialEndsAt: row.trial_ends_at,
    }));
  }

  /** `RbacCompanyUsersLookup`'s count half — the `withCount('users')` figure. */
  async countForCompany(companyId: string): Promise<number> {
    return runAsSystemAsync(() =>
      this.prisma.users.count({ where: { company_id: BigInt(companyId) } })
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.users.update({ where: { id: BigInt(userId) }, data: { password: passwordHash } })
    );
  }

  /**
   * Module 5.3's onboarding pipeline's final, single write — deliberately
   * the LAST step of the whole cascade (company resolution, role
   * bootstrap, permission grant, role assignment, placeholder subscription
   * all happen first). Laravel's original order marks the email verified
   * *first*, inside one transaction that rolls back everything on any
   * failure; this app's decomposed, non-transactional pipeline doesn't
   * have that safety net, so the order is deliberately inverted instead —
   * every step before this one is independently idempotent (safe to
   * retry), and only this write signals "onboarding fully complete." A
   * failure after this point can't happen (nothing follows it); a failure
   * before it means the same verification token can be retried from
   * scratch, since `email_verified_at` is still null.
   */
  async markVerifiedAndAssignCompany(
    userId: string,
    companyId: string,
    companyDomain: string | null
  ): Promise<AuthUser> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.update({
        where: { id: BigInt(userId) },
        data: {
          email_verified_at: new Date(),
          company_id: BigInt(companyId),
          company_domain: companyDomain,
        },
      })
    );
    return toAuthUser(row);
  }

  // -- Password reset (password_reset_tokens: email is the primary key,
  // matching Laravel's DatabaseTokenRepository — one live token per email) --

  async upsertPasswordResetToken(email: string, tokenHash: string): Promise<void> {
    await this.prisma.password_reset_tokens.upsert({
      where: { email },
      create: { email, token: tokenHash, created_at: new Date() },
      update: { token: tokenHash, created_at: new Date() },
    });
  }

  async findPasswordResetToken(
    email: string
  ): Promise<{ tokenHash: string; createdAt: Date | null } | undefined> {
    const row = await this.prisma.password_reset_tokens.findUnique({ where: { email } });
    return row ? { tokenHash: row.token, createdAt: row.created_at } : undefined;
  }

  async deletePasswordResetToken(email: string): Promise<void> {
    await this.prisma.password_reset_tokens.deleteMany({ where: { email } });
  }
}
