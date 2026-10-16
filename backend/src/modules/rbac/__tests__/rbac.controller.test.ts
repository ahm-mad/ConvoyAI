import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { RbacController } from '../rbac.controller.js';
import { RbacService } from '../rbac.service.js';
import { createRbacRouter } from '../rbac.routes.js';
import {
  fakeCompanyAssetsLookup,
  fakeCompanyDevicesLookup,
  fakeCompanyProductsLookup,
  fakeCompanyUsersLookup,
  fakePlansLookup,
  fakeRbacRepository,
  fakeSubscriptionsLookup,
} from './fakes.js';
import type {
  RbacCompanyAssetsLookup,
  RbacCompanyDevicesLookup,
  RbacCompanyProductsLookup,
  RbacCompanyUsersLookup,
  RbacPlansLookup,
  RbacSubscriptionsLookup,
} from '../rbac.service.js';
import type { Company, ModuleCatalogEntry } from '../rbac.types.js';
import type { Redis } from 'ioredis';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(
  seedCompanies: Company[] = [],
  seedModules: ModuleCatalogEntry[] = [],
  subscriptionsLookup: RbacSubscriptionsLookup = fakeSubscriptionsLookup(),
  plansLookup: RbacPlansLookup = fakePlansLookup(),
  companyUsersLookup: RbacCompanyUsersLookup = fakeCompanyUsersLookup(),
  companyAssetsLookup: RbacCompanyAssetsLookup = fakeCompanyAssetsLookup(),
  companyProductsLookup: RbacCompanyProductsLookup = fakeCompanyProductsLookup(),
  companyDevicesLookup: RbacCompanyDevicesLookup = fakeCompanyDevicesLookup()
) {
  const { repository, state } = fakeRbacRepository(seedCompanies, seedModules);
  const service = new RbacService(
    repository,
    subscriptionsLookup,
    plansLookup,
    companyUsersLookup,
    companyAssetsLookup,
    companyProductsLookup,
    companyDevicesLookup
  );
  const controller = new RbacController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use(createRbacRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

const OPERATOR_TOKEN = signAccessToken({ sub: '1', roles: ['platform_operator'] });
const ORDINARY_TOKEN = signAccessToken({ sub: '2', companyId: '1', roles: ['admin'] });
const PLAIN_TOKEN = signAccessToken({ sub: '3', companyId: '1', roles: [] });

describe("rbac (companies) routes — D-0039's platform_operator gate", () => {
  it('GET /companies with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/companies');

    expect(res.status).toBe(401);
  });

  it('GET /companies authenticated but without the platform_operator role: 403', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/companies')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('GET /companies with the platform_operator role: 200 with a paginated list', async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .get('/companies')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { items: [{ id: 1, name: 'Acme' }], pagination: { total: 1 } },
    });
  });

  it('GET /companies with the platform_operator role: 200 with the real Laravel eager-load shape (D-0100) — users/assets/products + withCount', async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const companyUsersLookup = fakeCompanyUsersLookup({
      '1': [
        {
          id: '42',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          number: '555',
          timezone: null,
          profileImage: null,
          companyId: '1',
          companyDomain: null,
          status: 'active',
          emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
          socialProvider: null,
          socialProviderId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          stripeId: null,
          pmType: null,
          pmLastFour: null,
          trialEndsAt: null,
        },
      ],
    });
    const companyAssetsLookup = fakeCompanyAssetsLookup({
      '1': [
        {
          id: '7',
          name: 'Yard A',
          icon: 'yard',
          type: 'yard',
          companyId: '1',
          description: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const companyProductsLookup = fakeCompanyProductsLookup({
      '1': [
        {
          id: '9',
          createdBy: '42',
          name: 'Tracker',
          status: 'active',
          companyId: '1',
          deviceProtocolId: null,
          preconfigureTemplateId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    const companyDevicesLookup = fakeCompanyDevicesLookup(3);
    const { app } = buildApp(
      [company],
      [],
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      companyUsersLookup,
      companyAssetsLookup,
      companyProductsLookup,
      companyDevicesLookup
    );

    const res = await request(app)
      .get('/companies')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(200);
    const item = (res.body as { data: { items: Record<string, unknown>[] } }).data
      .items[0] as Record<string, unknown>;
    expect(item['users']).toMatchObject([{ id: 42, email: 'ada@example.com' }]);
    expect(item['assets']).toMatchObject([{ id: 7, name: 'Yard A' }]);
    expect(item['products']).toMatchObject([{ id: 9, name: 'Tracker' }]);
    expect(item['users_count']).toBe(1);
    expect(item['assets_count']).toBe(1);
    expect(item['products_count']).toBe(1);
    expect(item['devices_count']).toBe(3);
  });

  it('GET /companies/{id} with the platform_operator role: 200 with the real Laravel eager-load shape (D-0100) — users.roles + products, no assets', async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const companyUsersLookup = fakeCompanyUsersLookup({
      '1': [
        {
          id: '42',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          number: '555',
          timezone: null,
          profileImage: null,
          companyId: '1',
          companyDomain: null,
          status: 'active',
          emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
          socialProvider: null,
          socialProviderId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          stripeId: null,
          pmType: null,
          pmLastFour: null,
          trialEndsAt: null,
        },
      ],
    });
    const { repository } = fakeRbacRepository([company]);
    const rolesForUser = [
      {
        id: '5',
        companyId: '1',
        name: 'admin',
        guardName: 'api',
        displayName: null,
        description: null,
        createdBy: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        permissions: [],
      },
    ];
    (
      repository as unknown as {
        findRolesWithPermissionsForUser: (userId: string) => Promise<unknown[]>;
      }
    ).findRolesWithPermissionsForUser = () => Promise.resolve(rolesForUser);
    const service = new RbacService(
      repository,
      fakeSubscriptionsLookup(),
      fakePlansLookup(),
      companyUsersLookup,
      fakeCompanyAssetsLookup(),
      fakeCompanyProductsLookup(),
      fakeCompanyDevicesLookup()
    );
    const controller = new RbacController(service);
    const app = express();
    app.use(express.json());
    app.use(createRequestContextMiddleware(fakeRedis()));
    app.use(createRbacRouter(controller));
    app.use(createErrorHandler(logger));

    const res = await request(app)
      .get('/companies/1')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data['assets']).toBeUndefined();
    expect(data['users']).toMatchObject([
      {
        id: 42,
        email: 'ada@example.com',
        roles: [{ id: 5, name: 'admin', pivot: { role_id: 5, model_id: 42 } }],
      },
    ]);
    const firstUser = (data['users'] as Record<string, unknown>[]).at(0);
    const rolesOnFirstUser = (firstUser?.['roles'] as Record<string, unknown>[] | undefined)?.at(0);
    expect(rolesOnFirstUser).not.toHaveProperty('permissions');
  });

  it('POST /companies as platform_operator: 201, bootstraps role skeleton implicitly (service-level test covers the assertion)', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({
        name: 'Acme',
        email: 'acme@example.com',
        address: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        country: 'US',
        zip_code: '62704',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { name: 'Acme' } });
  });

  it("DELETE /companies/{id}: 201 (NOT 200/204 — matches the frozen contract's quirk)", async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: null,
      city: null,
      state: null,
      country: null,
      zipCode: null,
      currency: 'USD',
      createdAt: null,
      updatedAt: null,
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .delete('/companies/1')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, message: 'Company deleted successfully.' });
  });

  it('GET /companies/{id} for a missing id: 404', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/companies/999')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it("GET /companies/{id} for the caller's OWN company (not platform_operator): 200 (D-0103)", async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .get('/companies/1')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { id: 1, name: 'Acme' } });
  });

  it('GET /companies/{id} for a DIFFERENT company (not platform_operator): 403 (D-0103)', async () => {
    const company: Company = {
      id: '2',
      name: 'Other Co',
      email: null,
      address: null,
      city: null,
      state: null,
      country: null,
      zipCode: null,
      currency: 'USD',
      createdAt: null,
      updatedAt: null,
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .get('/companies/2')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it("PUT /companies/{id} for the caller's OWN company (not platform_operator): 200 (D-0103 — fixes the real bug the user hit)", async () => {
    const company: Company = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .put('/companies/1')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({
        name: 'Acme',
        email: 'acme@example.com',
        address: 'Lahore',
        city: 'Lahore',
        state: 'Punjab',
        country: 'PK',
        zip_code: '848',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { city: 'Lahore' } });
  });

  it('PUT /companies/{id} for a DIFFERENT company (not platform_operator): 403 (D-0103)', async () => {
    const company: Company = {
      id: '2',
      name: 'Other Co',
      email: 'other@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: null,
      updatedAt: null,
    };
    const { app } = buildApp([company]);

    const res = await request(app)
      .put('/companies/2')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({
        name: 'Other Co',
        email: 'other@example.com',
        address: 'hacked',
        city: 'hacked',
        state: 'hacked',
        country: 'PK',
        zip_code: '000',
      });

    expect(res.status).toBe(403);
  });
});

describe('rbac (modules) routes — auth only, no role gate (ported as-is from Laravel)', () => {
  it('GET /modules with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/modules');

    expect(res.status).toBe(401);
  });

  it('GET /modules authenticated (no admin role needed): 200 with the raw {success, modules} shape', async () => {
    const { app } = buildApp([], [{ id: '1', code: 'fleet', slug: 'fleet' }]);

    const res = await request(app).get('/modules').set('Authorization', `Bearer ${PLAIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, modules: [{ id: 1, code: 'fleet', slug: 'fleet' }] });
  });

  it('POST /modules/create: 201 with the {success, module, message} shape (module is the code string, not an object)', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/modules/create')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`)
      .send({ code: 'fleet' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      module: 'fleet',
      message: 'Module created with permissions.',
    });
  });

  it('POST /modules/create rejects a duplicate code: 422', async () => {
    const { app } = buildApp([], [{ id: '1', code: 'fleet', slug: 'fleet' }]);

    const res = await request(app)
      .post('/modules/create')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`)
      .send({ code: 'fleet' });

    expect(res.status).toBe(422);
  });
});

describe('rbac (roles/permissions) routes — GET is auth-only, writes require role:admin', () => {
  it("GET /roles/company: 400 when the caller's own account has no company (D-0113 — company_id is derived from the caller's context, not a query param)", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/roles/company')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);

    expect(res.status).toBe(400);
  });

  it('GET /roles/company, no admin role needed: 200 with {success, message, roles}', async () => {
    const { app, state } = buildApp();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });

    const res = await request(app)
      .get('/roles/company')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, roles: [{ id: 1, name: 'Hr' }] });
  });

  it('GET /roles/{roleId}: 200 with {success, role} (no message key) for an existing role', async () => {
    const { app, state } = buildApp();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });

    const res = await request(app).get('/roles/1').set('Authorization', `Bearer ${PLAIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      role: {
        id: 1,
        company_id: 1,
        name: 'Hr',
        guard_name: 'api',
        description: null,
        modules: [],
        permissions: [],
      },
    });
  });

  it('POST /roles/create without the admin role: 403', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/roles/create')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`)
      .send({ name: 'Hr', module_ids: [] });

    expect(res.status).toBe(403);
  });

  it('POST /roles/create as admin: 201 with {success, message, role}', async () => {
    const { app } = buildApp([], [{ id: '1', code: 'fleet', slug: 'fleet' }]);

    const res = await request(app)
      .post('/roles/create')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ name: 'Hr', module_ids: [1] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Role created successfully',
      role: { name: 'Hr' },
    });
  });

  it("POST /roles/create with an empty module_ids array: 422 (matches Laravel's required|array|min:1)", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/roles/create')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ name: 'Hr', module_ids: [] });

    expect(res.status).toBe(422);
  });

  it('POST /roles/create rejects the reserved platform_operator name: 422', async () => {
    const { app } = buildApp([], [{ id: '1', code: 'fleet', slug: 'fleet' }]);

    const res = await request(app)
      .post('/roles/create')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ name: 'platform_operator', module_ids: [1] });

    expect(res.status).toBe(422);
  });

  it('DELETE /roles/{roleId}/delete without the admin role: 403', async () => {
    const { app, state } = buildApp();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'Hr',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });

    const res = await request(app)
      .delete('/roles/1/delete')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it("DELETE /roles/{roleId}/delete as admin: 200, and blocks the protected 'admin' role name", async () => {
    const { app, state } = buildApp();
    state.roles.set('1', {
      id: '1',
      companyId: '1',
      name: 'admin',
      guardName: 'api',
      description: null,
      modules: [],
      permissions: [],
    });

    const res = await request(app)
      .delete('/roles/1/delete')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'This role cannot be deleted.' });
  });

  it('DELETE /permissions/{permissionId}/delete without the admin role: 403', async () => {
    const { app, state } = buildApp();
    state.permissions.set('1', { id: '1', name: 'all-hr' });

    const res = await request(app)
      .delete('/permissions/1/delete')
      .set('Authorization', `Bearer ${PLAIN_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('DELETE /permissions/{permissionId}/delete as admin: 200 with {success, message}', async () => {
    const { app, state } = buildApp();
    state.permissions.set('1', { id: '1', name: 'all-hr' });

    const res = await request(app)
      .delete('/permissions/1/delete')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Permission deleted successfully.' });
  });

  describe('GET /modules/user/{userId} (module 5.2, D-0086 — fixes 11.55/11.22)', () => {
    it('with no token: 401', async () => {
      const { app } = buildApp();

      const res = await request(app).get('/modules/user/2');

      expect(res.status).toBe(401);
    });

    it("requesting another user's modules: 403 (11.22's IDOR half)", async () => {
      const { app } = buildApp();

      const res = await request(app)
        .get('/modules/user/999')
        .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('no active subscription: 403 with the exact Laravel message', async () => {
      const { app } = buildApp([], [], fakeSubscriptionsLookup());

      const res = await request(app)
        .get('/modules/user/2')
        .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, message: 'User has no active subscription.' });
    });

    it("no plan for the subscription's stripe_price: 404 with the exact Laravel message", async () => {
      const subscriptionsLookup = fakeSubscriptionsLookup({
        '2': { stripePrice: 'price_orphaned' },
      });
      const { app } = buildApp([], [], subscriptionsLookup, fakePlansLookup());

      const res = await request(app)
        .get('/modules/user/2')
        .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'No plan found for this subscription.' });
    });

    it("success: 200 with the plan's module codes and flattened permissions", async () => {
      const subscriptionsLookup = fakeSubscriptionsLookup({
        '2': { stripePrice: 'placeholder-full-access' },
      });
      const plansLookup = fakePlansLookup({
        'placeholder-full-access': {
          modules: [{ code: 'Fleet Management', permissions: ['all-fleet'] }],
        },
      });
      const { app } = buildApp([], [], subscriptionsLookup, plansLookup);

      const res = await request(app)
        .get('/modules/user/2')
        .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Modules and permissions retrieved successfully.',
        modules: ['Fleet Management'],
        permissions: ['all-fleet'],
      });
    });
  });
});
