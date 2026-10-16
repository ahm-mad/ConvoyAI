import {
  decodeExpiredVerificationTokenSubject,
  signVerificationToken,
  verifyVerificationToken,
} from '../../platform/auth/jwt.js';
import { sendMail } from '../../platform/mail/mailer.js';
import {
  renderVerifyUserEmail,
  verifyUrlFor,
  VERIFY_USER_SUBJECT,
} from '../../platform/mail/templates/verify-user.js';
import { NotFoundError, UnauthenticatedError } from '../../platform/errors/app-error.js';
import { runWithContextAsync, type RequestContext } from '../../platform/http/request-context.js';
import { PLACEHOLDER_PLAN } from '../plans/placeholder-plan.js';
import { extractEmailDomain, isFreeEmailDomain } from './free-email-domains.js';
import type { OnboardingPlanModule } from './onboarding.types.js';

/** Module 1.2's `AuthRepository` doubles as this (interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules"). */
export interface OnboardingUsersLookup {
  findById(
    id: string
  ): Promise<
    { id: string; firstName: string; email: string; emailVerifiedAt: Date | null } | undefined
  >;
  markVerifiedAndAssignCompany(
    userId: string,
    companyId: string,
    companyDomain: string | null
  ): Promise<unknown>;
}

/** Module 1.3's `RbacRepository` doubles as this. */
export interface OnboardingCompaniesLookup {
  findByName(name: string): Promise<{ id: string } | undefined>;
  createMinimal(name: string, email: string): Promise<{ id: string }>;
}

/** Module 1.3's `RbacRepository` doubles as this too. */
export interface OnboardingRolesLookup {
  bootstrapCompany(companyId: string): Promise<void>;
  grantModulePermissionsToBootstrapRoles(companyId: string, moduleSlugs: string[]): Promise<void>;
  findRoleIdByCompanyAndName(companyId: string, name: string): Promise<string | undefined>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
}

/** Module 5.1's `PlansRepository` doubles as this. */
export interface OnboardingPlansLookup {
  findByStripePlan(stripePlan: string): Promise<{ modules: OnboardingPlanModule[] } | undefined>;
}

/** Module 5.2's `SubscriptionsService` doubles as this — a service-level dependency (not a repository), since the idempotent "find-or-create" logic itself lives there and this module has no reason to duplicate it. */
export interface OnboardingSubscriptionsProvisioner {
  ensurePlaceholderSubscription(): Promise<unknown>;
}

/**
 * Business logic for module 5.3 (onboarding) — `verifyToken` decomposed
 * per `onboarding-verifytoken.md` §3. D-0080's placeholder-billing
 * constraint applies: step 7 calls module 5.2's provisioner, never
 * Stripe. The company-identity model (email-domain-based, with a
 * denylist carve-out for free/personal providers) and `company_domain`
 * semantics were settled directly with the user this session (not by
 * D-0080, which explicitly left them open) — see `DECISIONS.md`.
 */
export class OnboardingService {
  constructor(
    private readonly usersLookup: OnboardingUsersLookup,
    private readonly companiesLookup: OnboardingCompaniesLookup,
    private readonly rolesLookup: OnboardingRolesLookup,
    private readonly plansLookup: OnboardingPlansLookup,
    private readonly subscriptionsProvisioner: OnboardingSubscriptionsProvisioner
  ) {}

  /**
   * `verifyToken`, decomposed and reordered. Laravel marks the email
   * verified *first*, inside one transaction that rolls back everything
   * on any failure. This pipeline has no such transaction (per the
   * deep-dive's own recommendation to decompose rather than keep one
   * giant locked method) — so `email_verified_at` is written LAST
   * instead, once every other step (independently idempotent: company
   * find-or-create, role bootstrap, permission grant, role assignment,
   * placeholder subscription) has already succeeded. A failure partway
   * through leaves the token's own idempotency check unset, so the same
   * token can simply be retried from scratch — no partial "verified but
   * never onboarded" account is possible.
   */
  async verifyEmail(token: string): Promise<void> {
    let claims;
    try {
      claims = verifyVerificationToken(token);
    } catch {
      throw new UnauthenticatedError('This verification link is invalid or has expired.');
    }

    const user = await this.usersLookup.findById(claims.sub);
    if (!user) {
      throw new UnauthenticatedError('This verification link is invalid or has expired.');
    }
    if (user.emailVerifiedAt) {
      return; // Idempotent short-circuit — matches Laravel's own early-return on an already-verified user.
    }

    await this.provisionCompanyForUser(user);
  }

  /**
   * D-0132: the brand-new social-login user (Google/GitHub) gets the same company + admin role + placeholder subscription a
   * verified-by-email user gets — Laravel's `SocialiteController::findOrCreateUser` re-implements `verifyToken`'s bootstrap for
   * exactly this. Marks the email verified (social sign-in implies it). Only call for a user with no company yet — a free-email user gets a fresh company per call, same as `verifyEmail`.
   */
  async onboardSocialUser(userId: string): Promise<void> {
    const user = await this.usersLookup.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    await this.provisionCompanyForUser(user);
  }

  private async provisionCompanyForUser(user: { id: string; email: string }): Promise<void> {
    const plan = await this.plansLookup.findByStripePlan(PLACEHOLDER_PLAN.stripePlan);
    if (!plan) {
      throw new NotFoundError('No plan found for this subscription.');
    }
    const moduleSlugs = plan.modules.map(module => module.slug);

    const domain = extractEmailDomain(user.email);
    const companyIsShared = !isFreeEmailDomain(domain);
    const company = companyIsShared
      ? ((await this.companiesLookup.findByName(domain)) ??
        (await this.companiesLookup.createMinimal(domain, user.email)))
      : await this.companiesLookup.createMinimal(user.email, user.email);
    const companyDomain = companyIsShared ? domain : null;

    const context: RequestContext = {
      userId: user.id,
      companyId: company.id,
      roles: [],
      perms: [],
      jti: 'onboarding',
      exp: Number.MAX_SAFE_INTEGER,
    };

    await runWithContextAsync(context, async () => {
      await this.rolesLookup.bootstrapCompany(company.id);
      await this.rolesLookup.grantModulePermissionsToBootstrapRoles(company.id, moduleSlugs);

      const adminRoleId = await this.rolesLookup.findRoleIdByCompanyAndName(company.id, 'admin');
      if (adminRoleId) {
        await this.rolesLookup.assignRoleToUser(user.id, adminRoleId);
      }

      await this.subscriptionsProvisioner.ensurePlaceholderSubscription();
    });

    await this.usersLookup.markVerifiedAndAssignCompany(user.id, company.id, companyDomain);
  }

  /**
   * `resendVerificationEmail`. D-0028 removed the mismatched-TTL quirk
   * Laravel's own version depended on, so recovering the subject from an
   * already-expired token needs `ignoreExpiration` explicitly
   * (`decodeExpiredVerificationTokenSubject`) rather than falling out of
   * two different lifetimes for the same underlying JWT.
   */
  async resendVerificationEmail(token: string): Promise<void> {
    let userId: string;
    try {
      userId = decodeExpiredVerificationTokenSubject(token);
    } catch {
      throw new UnauthenticatedError('This verification link is invalid.');
    }

    const user = await this.usersLookup.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const freshToken = signVerificationToken({ sub: user.id });
    await sendMail({
      to: user.email,
      subject: VERIFY_USER_SUBJECT,
      html: renderVerifyUserEmail({
        firstName: user.firstName,
        verifyUrl: verifyUrlFor(freshToken),
      }),
    });
  }
}
