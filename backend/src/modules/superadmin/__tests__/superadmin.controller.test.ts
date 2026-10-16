import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { SuperadminController } from '../superadmin.controller.js';
import { SuperadminService } from '../superadmin.service.js';
import { createSuperadminRouter } from '../superadmin.routes.js';
import { fakeSuperadminRepository } from './fakes.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp() {
  const repository = fakeSuperadminRepository({
    totalUsersPerCompany: () =>
      Promise.resolve([{ companyId: '1', companyName: 'Acme', totalUsers: 3 }]),
    subscriptionStats: () => Promise.resolve({ total: 2, byType: { default: 2 } }),
  });
  const service = new SuperadminService(repository);
  const controller = new SuperadminController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createSuperadminRouter(controller));
  app.use(createErrorHandler(logger));
  return app;
}

const OPERATOR_TOKEN = signAccessToken({ sub: '1', roles: ['platform_operator'] });
const ORDINARY_TOKEN = signAccessToken({ sub: '2', companyId: '1', roles: ['admin'] });

/**
 * D-0091/KNOWN_ISSUES 11.14a: live Laravel has zero auth middleware on any
 * of these routes at all. The task file's own primary acceptance criterion
 * is an explicit unauthenticated-request-rejected test for every route —
 * these are that test.
 */
describe('superadmin routes (module 6.2, D-0091 — closes 11.14a)', () => {
  it('GET /superadmin/companies/users with no token: 401', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/superadmin/companies/users');
    expect(res.status).toBe(401);
  });

  it('GET /superadmin/companies/users as an ordinary authenticated user (not platform_operator): 403', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/superadmin/companies/users')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it("GET /superadmin/companies/users as platform_operator: 200, status:'success' envelope (matches SuperAdminController::totalUsersPerCompany exactly)", async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/superadmin/companies/users')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      message: 'User count per company fetched successfully.',
      data: [{ company_id: 1, company_name: 'Acme', total_users: 3 }],
    });
  });

  it('GET /superadmin/subscriptions with no token: 401', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/superadmin/subscriptions');
    expect(res.status).toBe(401);
  });

  it('GET /superadmin/subscriptions as an ordinary authenticated user (not platform_operator): 403', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/superadmin/subscriptions')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it("GET /superadmin/subscriptions as platform_operator: 200, status:'success' envelope", async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/superadmin/subscriptions')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      message: 'Subscription statistics fetched successfully.',
      total_subscriptions: 2,
      subscriptions_by_type: { default: 2 },
    });
  });

  it('GET /get-encryption-key does not exist at all (11.14a: the pattern itself must never be ported, not even behind auth)', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/get-encryption-key')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('encrypt_key');
  });
});
