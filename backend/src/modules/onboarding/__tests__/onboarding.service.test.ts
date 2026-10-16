import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../../platform/config/index.js';
import { signAccessToken, signVerificationToken } from '../../../platform/auth/jwt.js';
import { OnboardingService } from '../onboarding.service.js';
import {
  fakeCompaniesLookup,
  fakePlansLookup,
  fakeRolesLookup,
  fakeSubscriptionsProvisioner,
  fakeUsersLookup,
} from './fakes.js';

const PLAN_WITH_ONE_MODULE = { modules: [{ slug: 'fleet-management' }] };

function buildService(
  overrides: {
    users?: ReturnType<typeof fakeUsersLookup>;
    companies?: ReturnType<typeof fakeCompaniesLookup>;
    roles?: ReturnType<typeof fakeRolesLookup>;
    plans?: ReturnType<typeof fakePlansLookup>;
    subscriptions?: ReturnType<typeof fakeSubscriptionsProvisioner>;
  } = {}
) {
  const users =
    overrides.users ??
    fakeUsersLookup([{ id: '1', email: 'alice@acme.com', emailVerifiedAt: null }]);
  const companies = overrides.companies ?? fakeCompaniesLookup();
  const roles = overrides.roles ?? fakeRolesLookup();
  const plansLookup =
    overrides.plans ?? fakePlansLookup({ 'placeholder-full-access': PLAN_WITH_ONE_MODULE });
  const subscriptions = overrides.subscriptions ?? fakeSubscriptionsProvisioner();

  const service = new OnboardingService(
    users.lookup,
    companies.lookup,
    roles.lookup,
    plansLookup,
    subscriptions.provisioner
  );
  return { service, users, companies, roles, subscriptions };
}

describe('OnboardingService.verifyEmail', () => {
  it('401s for a malformed/invalid token', async () => {
    const { service } = buildService();

    await expect(service.verifyEmail('not-a-real-token')).rejects.toMatchObject({
      httpStatus: 401,
    });
  });

  it('401s for a token signed with the wrong secret (e.g. an access token)', async () => {
    const { service } = buildService();
    const accessToken = signAccessToken({ sub: '1', roles: [] });

    await expect(service.verifyEmail(accessToken)).rejects.toMatchObject({ httpStatus: 401 });
  });

  it("401s when the token's subject doesn't resolve to a real user", async () => {
    const { service } = buildService({ users: fakeUsersLookup([]) });
    const token = signVerificationToken({ sub: '999' });

    await expect(service.verifyEmail(token)).rejects.toMatchObject({ httpStatus: 401 });
  });

  it('is idempotent — returns immediately for an already-verified user, no side effects', async () => {
    const users = fakeUsersLookup([
      { id: '1', email: 'alice@acme.com', emailVerifiedAt: new Date('2026-01-01') },
    ]);
    const { service, roles, subscriptions } = buildService({ users });
    const token = signVerificationToken({ sub: '1' });

    await service.verifyEmail(token);

    expect(roles.state.bootstrappedCompanyIds).toHaveLength(0);
    expect(subscriptions.state.calls).toBe(0);
  });

  it("404s when the placeholder plan doesn't exist, before any mutation happens", async () => {
    const { service, users, companies } = buildService({ plans: fakePlansLookup({}) });
    const token = signVerificationToken({ sub: '1' });

    await expect(service.verifyEmail(token)).rejects.toMatchObject({ httpStatus: 404 });

    expect(users.state.users.get('1')?.emailVerifiedAt).toBeNull();
    expect(companies.state.companies.size).toBe(0);
  });

  it('a corporate-domain user gets a new company named after the domain, company_domain set', async () => {
    const { service, users, companies } = buildService();
    const token = signVerificationToken({ sub: '1' });

    await service.verifyEmail(token);

    const company = [...companies.state.companies.values()][0];
    expect(company?.name).toBe('acme.com');
    expect(users.state.users.get('1')?.emailVerifiedAt).not.toBeNull();
  });

  it('a second user at the same corporate domain joins the existing company, not a new one', async () => {
    const users = fakeUsersLookup([
      { id: '1', email: 'alice@acme.com', emailVerifiedAt: null },
      { id: '2', email: 'bob@acme.com', emailVerifiedAt: null },
    ]);
    const { service, companies } = buildService({ users });

    await service.verifyEmail(signVerificationToken({ sub: '1' }));
    await service.verifyEmail(signVerificationToken({ sub: '2' }));

    expect(companies.state.companies.size).toBe(1);
  });

  it('a free-email-domain user (gmail.com) gets their own unique company, never grouped', async () => {
    const users = fakeUsersLookup([
      { id: '1', email: 'alice@gmail.com', emailVerifiedAt: null },
      { id: '2', email: 'bob@gmail.com', emailVerifiedAt: null },
    ]);
    const { service, companies } = buildService({ users });

    await service.verifyEmail(signVerificationToken({ sub: '1' }));
    await service.verifyEmail(signVerificationToken({ sub: '2' }));

    expect(companies.state.companies.size).toBe(2);
    const names = [...companies.state.companies.values()].map(c => c.name).sort();
    expect(names).toEqual(['alice@gmail.com', 'bob@gmail.com']);
  });

  it("bootstraps roles, grants the plan's module permissions, assigns the admin role, and provisions a placeholder subscription", async () => {
    const { service, roles, subscriptions } = buildService();
    const token = signVerificationToken({ sub: '1' });

    await service.verifyEmail(token);

    expect(roles.state.bootstrappedCompanyIds).toHaveLength(1);
    expect(roles.state.grantedPermissions[0]?.moduleSlugs).toEqual(['fleet-management']);
    expect(roles.state.assignedRoles).toHaveLength(1);
    expect(roles.state.assignedRoles[0]?.userId).toBe('1');
    expect(roles.state.assignedRoles[0]?.roleId).toMatch(/^role-admin-/);
    expect(subscriptions.state.calls).toBe(1);
  });

  it('marks the user verified only after every other step succeeds (order matters for retry-safety)', async () => {
    const { service, users, roles } = buildService();
    const token = signVerificationToken({ sub: '1' });

    await service.verifyEmail(token);

    expect(users.state.users.get('1')?.emailVerifiedAt).not.toBeNull();
    expect(roles.state.bootstrappedCompanyIds).toHaveLength(1);
  });
});

describe('OnboardingService.resendVerificationEmail', () => {
  it('401s for a malformed token', async () => {
    const { service } = buildService();

    await expect(service.resendVerificationEmail('garbage')).rejects.toMatchObject({
      httpStatus: 401,
    });
  });

  it('401s for a token signed with the wrong secret', async () => {
    const { service } = buildService();
    const accessToken = signAccessToken({ sub: '1', roles: [] });

    await expect(service.resendVerificationEmail(accessToken)).rejects.toMatchObject({
      httpStatus: 401,
    });
  });

  it("404s when the token's subject doesn't resolve to a real user", async () => {
    const { service } = buildService({ users: fakeUsersLookup([]) });
    const token = signVerificationToken({ sub: '999' });

    await expect(service.resendVerificationEmail(token)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('succeeds for a real user with a currently-valid token', async () => {
    const { service } = buildService();
    const token = signVerificationToken({ sub: '1' });

    await expect(service.resendVerificationEmail(token)).resolves.toBeUndefined();
  });

  it("also succeeds for a genuinely expired-but-validly-signed token — the whole point of this endpoint (jwt.test.ts proves decodeExpiredVerificationTokenSubject's ignoreExpiration behavior directly)", async () => {
    const { service } = buildService();
    const expiredToken = jwt.sign({ sub: '1' }, config.JWT_VERIFICATION_SECRET, { expiresIn: -10 });

    await expect(service.resendVerificationEmail(expiredToken)).resolves.toBeUndefined();
  });
});
