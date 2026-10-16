import { describe, expect, it } from 'vitest';
import { RbacService } from '../rbac.service.js';
import {
  fakeCompanyAssetsLookup,
  fakeCompanyDevicesLookup,
  fakeCompanyProductsLookup,
  fakeCompanyUsersLookup,
  fakePlansLookup,
  fakeRbacRepository,
  fakeSubscriptionsLookup,
} from './fakes.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import type { Company, CreateCompanyInput } from '../rbac.types.js';

const INPUT: CreateCompanyInput = {
  name: 'Acme',
  email: 'acme@example.com',
  address: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  country: 'US',
  zipCode: '62704',
};

const TIMESTAMPS = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const CONTEXT: RequestContext = {
  userId: '1',
  companyId: '1',
  roles: ['admin'],
  perms: [],
  jti: 'test',
  exp: Number.MAX_SAFE_INTEGER,
};

describe('RbacService', () => {
  it('createCompany persists the company and bootstraps its role skeleton (D-0038)', async () => {
    const { repository, state } = fakeRbacRepository();
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const company = await service.createCompany(INPUT);

    expect(company.name).toBe('Acme');
    expect(state.bootstrappedCompanyIds).toEqual([company.id]);
  });

  it('createCompany rejects a duplicate name with the exact Laravel message (D-0013)', async () => {
    const existing: Company = {
      id: '1',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      email: 'other@example.com',
    };
    const { repository } = fakeRbacRepository([existing]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.createCompany(INPUT)).rejects.toMatchObject({
      httpStatus: 422,
      message: 'This company name is already taken.',
    });
  });

  it('createCompany rejects a duplicate email with the exact Laravel message (D-0013)', async () => {
    const existing: Company = {
      id: '1',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      name: 'Other Co',
    };
    const { repository } = fakeRbacRepository([existing]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.createCompany(INPUT)).rejects.toMatchObject({
      httpStatus: 422,
      message: 'This email is already associated with another company.',
    });
  });

  it('getCompany throws NotFoundError for a missing id', async () => {
    const { repository } = fakeRbacRepository();
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.getCompany('999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("updateCompany allows keeping a company's own name/email (excludeId)", async () => {
    const existing: Company = { id: '1', ...TIMESTAMPS, ...INPUT, currency: 'USD' };
    const { repository } = fakeRbacRepository([existing]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const updated = await runWithContextAsync({ ...CONTEXT, companyId: '1' }, () =>
      service.updateCompany('1', { ...INPUT, city: 'Shelbyville' })
    );

    expect(updated.city).toBe('Shelbyville');
  });

  it("updateCompany still rejects colliding with a DIFFERENT company's name", async () => {
    const other: Company = {
      id: '1',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      email: 'one@example.com',
    };
    const mine: Company = {
      id: '2',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      name: 'Mine Co',
      email: 'two@example.com',
    };
    const { repository } = fakeRbacRepository([other, mine]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      runWithContextAsync({ ...CONTEXT, companyId: '2' }, () =>
        service.updateCompany('2', { ...INPUT, email: 'two@example.com' })
      )
    ).rejects.toMatchObject({
      httpStatus: 422,
      message: 'This company name is already taken.',
    });
  });

  it('updateCompany rejects a caller updating a DIFFERENT company (D-0103 — self or platform_operator only)', async () => {
    const existing: Company = { id: '1', ...TIMESTAMPS, ...INPUT, currency: 'USD' };
    const { repository } = fakeRbacRepository([existing]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      runWithContextAsync({ ...CONTEXT, companyId: '999' }, () => service.updateCompany('1', INPUT))
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('updateCompany allows a platform_operator to update ANY company (D-0103)', async () => {
    const existing: Company = { id: '1', ...TIMESTAMPS, ...INPUT, currency: 'USD' };
    const { repository } = fakeRbacRepository([existing]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const updated = await runWithContextAsync(
      { ...CONTEXT, companyId: undefined, roles: ['platform_operator'] },
      () => service.updateCompany('1', { ...INPUT, city: 'Shelbyville' })
    );

    expect(updated.city).toBe('Shelbyville');
  });

  it("bulkDeleteCompanies rejects if any id doesn't exist, deletes none", async () => {
    const a: Company = {
      id: '1',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      email: 'a@example.com',
    };
    const { repository } = fakeRbacRepository([a]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.bulkDeleteCompanies(['1', '999'])).rejects.toMatchObject({
      httpStatus: 422,
    });
    await expect(service.getCompany('1')).resolves.toBeDefined();
  });

  it('bulkDeleteCompanies deletes all given ids when every id exists', async () => {
    const a: Company = {
      id: '1',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      email: 'a@example.com',
    };
    const b: Company = {
      id: '2',
      ...TIMESTAMPS,
      ...INPUT,
      currency: 'USD',
      name: 'Beta',
      email: 'b@example.com',
    };
    const { repository } = fakeRbacRepository([a, b]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await service.bulkDeleteCompanies(['1', '2']);

    await expect(service.getCompany('1')).rejects.toMatchObject({ httpStatus: 404 });
    await expect(service.getCompany('2')).rejects.toMatchObject({ httpStatus: 404 });
  });

  // -- Roles ------------------------------------------------------------

  it('createRole rejects the reserved platform_operator name (D-0039)', async () => {
    const { repository } = fakeRbacRepository();
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      service.createRole({ name: 'platform_operator', description: undefined, moduleIds: [] })
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('createRole rejects a duplicate name within the same company', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      service.createRole({ name: 'Hr', description: undefined, moduleIds: [] })
    ).rejects.toMatchObject({
      httpStatus: 422,
    });
  });

  it('updateRole preserves the existing description when none is supplied (parity with updateRoleDetails)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: 'Human Resources',
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const updated = await service.updateRole('1', {
      name: 'Hr Renamed',
      description: undefined,
      moduleIds: [],
    });

    expect(updated.description).toBe('Human Resources');
  });

  it('updateRole rejects renaming to the reserved platform_operator name (D-0039)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      service.updateRole('1', { name: 'platform_operator', description: undefined, moduleIds: [] })
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('updateRole blocks superadmin/super_admin (ported from updateRoleDetails)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'super_admin',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(
      service.updateRole('1', { name: 'renamed', description: undefined, moduleIds: [] })
    ).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('deleteRole blocks protected role names (superadmin/super_admin/admin, ported from deleteRole)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'admin',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.deleteRole('1')).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('deleteRole blocks deleting a role assigned to users (409, ported from deleteRole)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    state.userRoleLinks.set('42', ['1']);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.deleteRole('1')).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('deleteRole succeeds for an unassigned, unprotected role', async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await service.deleteRole('1');

    await expect(service.getRoleDetails('1')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("getUserAccessPath reshapes a user's roles into the User->Role->grants chain", async () => {
    const { repository, state } = fakeRbacRepository();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [{ id: '5', code: 'hr-module', slug: 'hr' }],
      permissions: [{ id: '9', name: 'all-hr' }],
    });
    state.userRoleLinks.set('42', ['1']);
    state.userNames.set('42', 'Ada Lovelace');
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const entries = await runWithContextAsync(CONTEXT, () => service.getUserAccessPath('42'));

    expect(entries).toEqual([
      {
        relationship: 'assigned_role',
        user: { id: '42', name: 'Ada Lovelace' },
        role: { id: '1', name: 'Hr' },
        scope: { type: 'company', id: '1' },
        grants: {
          modules: [{ id: '5', slug: 'hr', code: 'hr-module' }],
          permissions: [{ id: '9', name: 'all-hr' }],
        },
      },
    ]);
  });

  // -- Modules ------------------------------------------------------------

  it('createModule rejects a duplicate code', async () => {
    const { repository } = fakeRbacRepository([], [{ id: '1', code: 'fleet', slug: 'fleet' }]);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.createModule('fleet')).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('createModule succeeds for a new code', async () => {
    const { repository } = fakeRbacRepository();
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await service.createModule('fleet');

    const modules = await service.listModulesForAdmin();
    expect(modules.map(m => m.code)).toEqual(['fleet']);
  });

  // -- Permissions ----------------------------------------------------------

  it('deletePermission blocks critical permissions (all/all-access, ported from deletePermission)', async () => {
    const { repository, state } = fakeRbacRepository();
    state.permissions.set('1', { id: '1', name: 'all' });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.deletePermission('1')).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('deletePermission 404s for a missing id', async () => {
    const { repository } = fakeRbacRepository();
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    await expect(service.deletePermission('999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('deletePermission succeeds for a non-critical permission', async () => {
    const { repository, state } = fakeRbacRepository();
    state.permissions.set('1', { id: '1', name: 'all-hr' });
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      fakeCompanyUsersLookup(),
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );

    const deleted = await service.deletePermission('1');

    expect(deleted.name).toBe('all-hr');
  });

  describe('getUserModules (module 5.2, D-0086 — fixes 11.55/11.22)', () => {
    it("403s when requesting another user's modules (11.22's IDOR half — Laravel had zero ownership check)", async () => {
      const { repository } = fakeRbacRepository();
      const service = new RbacService(
        repository,
        fakeSubscriptionsLookup(),
        fakePlansLookup(),
        fakeCompanyUsersLookup(),
        fakeCompanyAssetsLookup(),
        fakeCompanyProductsLookup(),
        fakeCompanyDevicesLookup()
      );

      await expect(
        runWithContextAsync(CONTEXT, () => service.getUserModules('999'))
      ).rejects.toMatchObject({
        httpStatus: 403,
      });
    });

    it('403s with the exact Laravel message when the user has no active subscription', async () => {
      const { repository } = fakeRbacRepository();
      const service = new RbacService(
        repository,
        fakeSubscriptionsLookup(),
        fakePlansLookup(),
        fakeCompanyUsersLookup(),
        fakeCompanyAssetsLookup(),
        fakeCompanyProductsLookup(),
        fakeCompanyDevicesLookup()
      );

      await expect(
        runWithContextAsync(CONTEXT, () => service.getUserModules(CONTEXT.userId))
      ).rejects.toMatchObject({
        httpStatus: 403,
        message: 'User has no active subscription.',
      });
    });

    it('404s with the exact Laravel message when the subscription has no stripe_price', async () => {
      const { repository } = fakeRbacRepository();
      const subscriptionsLookup = fakeSubscriptionsLookup({
        [CONTEXT.userId]: { stripePrice: null },
      });
      const service = new RbacService(
        repository,
        subscriptionsLookup,
        fakePlansLookup(),
        fakeCompanyUsersLookup(),
        fakeCompanyAssetsLookup(),
        fakeCompanyProductsLookup(),
        fakeCompanyDevicesLookup()
      );

      await expect(
        runWithContextAsync(CONTEXT, () => service.getUserModules(CONTEXT.userId))
      ).rejects.toMatchObject({
        httpStatus: 404,
        message: 'No plan found for this subscription.',
      });
    });

    it("404s when the subscription's stripe_price matches no real plan (the soft-join's own failure mode, platform-billing-stripe.md §1.4)", async () => {
      const { repository } = fakeRbacRepository();
      const subscriptionsLookup = fakeSubscriptionsLookup({
        [CONTEXT.userId]: { stripePrice: 'price_orphaned' },
      });
      const service = new RbacService(
        repository,
        subscriptionsLookup,
        fakePlansLookup({}),
        fakeCompanyUsersLookup(),
        fakeCompanyAssetsLookup(),
        fakeCompanyProductsLookup(),
        fakeCompanyDevicesLookup()
      );

      await expect(
        runWithContextAsync(CONTEXT, () => service.getUserModules(CONTEXT.userId))
      ).rejects.toMatchObject({
        httpStatus: 404,
        message: 'No plan found for this subscription.',
      });
    });

    it("returns the plan's module codes and de-duplicated, flattened permissions on success (fixes 11.55 — uses the correct activeSubscription lookup, not getUserModulesWithPermissions' buggy $subscription->first() chain)", async () => {
      const { repository } = fakeRbacRepository();
      const subscriptionsLookup = fakeSubscriptionsLookup({
        [CONTEXT.userId]: { stripePrice: 'placeholder-full-access' },
      });
      const plansLookup = fakePlansLookup({
        'placeholder-full-access': {
          modules: [
            { code: 'Dashboard', permissions: ['all-dashboard'] },
            { code: 'Fleet Management', permissions: ['all-dashboard', 'all-fleet'] },
          ],
        },
      });
      const service = new RbacService(
        repository,
        subscriptionsLookup,
        plansLookup,
        fakeCompanyUsersLookup(),
        fakeCompanyAssetsLookup(),
        fakeCompanyProductsLookup(),
        fakeCompanyDevicesLookup()
      );

      const result = await runWithContextAsync(CONTEXT, () =>
        service.getUserModules(CONTEXT.userId)
      );

      expect(result.modules).toEqual(['Dashboard', 'Fleet Management']);
      expect(result.permissions.sort()).toEqual(['all-dashboard', 'all-fleet']);
    });
  });
});
