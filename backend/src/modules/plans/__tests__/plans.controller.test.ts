import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { PlansController } from '../plans.controller.js';
import { PlansService } from '../plans.service.js';
import { createPlansRouter } from '../plans.routes.js';
import { fakeModulesLookup, fakePlansRepository } from './fakes.js';
import type { Plan } from '../plans.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(seedPlans: Plan[] = [], knownModuleIds: string[] = []) {
  const { repository, state } = fakePlansRepository(seedPlans);
  const service = new PlansService(repository, fakeModulesLookup(knownModuleIds));
  const controller = new PlansController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createPlansRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

function planFixture(overrides: Partial<Plan> = {}): Plan {
  return {
    id: '1',
    name: 'Full Access (Placeholder)',
    stripePlan: 'placeholder-full-access',
    price: '0',
    description: 'placeholder',
    modules: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const OPERATOR_TOKEN = signAccessToken({ sub: '1', roles: ['platform_operator'] });
const ORDINARY_TOKEN = signAccessToken({ sub: '2', companyId: '1', roles: ['admin'] });

describe('plans routes (module 5.1, designed fresh — 11.26 had zero live routes)', () => {
  it('GET /plans with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/plans');

    expect(res.status).toBe(401);
  });

  it("GET /plans: 200 for any authenticated user, real data (not paginated — matches PlanController::index()'s bare array)", async () => {
    const { app } = buildApp([planFixture()]);

    const res = await request(app)
      .get('/api/plans')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: 1,
        name: 'Full Access (Placeholder)',
        stripe_plan: 'placeholder-full-access',
      }),
    ]);
  });

  it("GET /plans/{plan}: 200 with real data — fixes 11.25 (Laravel returned literal strings {'plan':'plan',...})", async () => {
    const { app } = buildApp([planFixture()]);

    const res = await request(app)
      .get('/api/plans/1')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Full Access (Placeholder)' });
    expect(res.body).not.toMatchObject({ plan: 'plan', intent: 'intent', modules: 'modules' });
  });

  it('GET /plans/{plan}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/plans/999')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('POST /plans without platform_operator: 403', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ name: 'Gold', stripe_plan: 'price_gold', price: '250', description: 'gold' });

    expect(res.status).toBe(403);
  });

  it('POST /plans as platform_operator: 201', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ name: 'Gold', stripe_plan: 'price_gold', price: '250', description: 'gold' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Gold', stripe_plan: 'price_gold' });
  });

  it('POST /plans with a duplicate name: 422', async () => {
    const { app } = buildApp([planFixture()]);

    const res = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ name: planFixture().name, stripe_plan: 'different', price: '0', description: 'x' });

    expect(res.status).toBe(422);
  });

  it('PUT /plans/{plan} without platform_operator: 403', async () => {
    const { app } = buildApp([planFixture()]);

    const res = await request(app)
      .put('/api/plans/1')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ price: '10' });

    expect(res.status).toBe(403);
  });

  it('PUT /plans/{plan} as platform_operator: 200', async () => {
    const { app } = buildApp([planFixture()]);

    const res = await request(app)
      .put('/api/plans/1')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ price: '10' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ price: '10' });
  });

  it('POST /plans/{planId}/assign-modules without platform_operator: 403', async () => {
    const { app } = buildApp([planFixture()], ['8']);

    const res = await request(app)
      .post('/api/plans/1/assign-modules')
      .set('Authorization', `Bearer ${ORDINARY_TOKEN}`)
      .send({ modules: [{ id: 8, permissions: ['all-fleet'] }] });

    expect(res.status).toBe(403);
  });

  it('POST /plans/{planId}/assign-modules as platform_operator: 200, additive grant', async () => {
    const { app } = buildApp([planFixture()], ['8']);

    const res = await request(app)
      .post('/api/plans/1/assign-modules')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ modules: [{ id: 8, permissions: ['all-fleet'] }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ modules: [{ id: 8, permissions: ['all-fleet'] }] });
  });

  it('POST /plans/{planId}/assign-modules with permissions omitted: defaults to []', async () => {
    const { app } = buildApp([planFixture()], ['8']);

    const res = await request(app)
      .post('/api/plans/1/assign-modules')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ modules: [{ id: 8 }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ modules: [{ id: 8, permissions: [] }] });
  });

  it('POST /plans/{planId}/assign-modules with a nonexistent module id: 422', async () => {
    const { app } = buildApp([planFixture()], []);

    const res = await request(app)
      .post('/api/plans/1/assign-modules')
      .set('Authorization', `Bearer ${OPERATOR_TOKEN}`)
      .send({ modules: [{ id: 999, permissions: [] }] });

    expect(res.status).toBe(422);
  });
});
