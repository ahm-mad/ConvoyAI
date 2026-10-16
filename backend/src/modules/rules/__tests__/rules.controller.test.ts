import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { RulesController } from '../rules.controller.js';
import { RulesService } from '../rules.service.js';
import { createRulesRouter } from '../rules.routes.js';
import {
  fakeDevicesLookup,
  fakeNotificationsLookup,
  fakeProductsLookup,
  fakeQueuePort,
  fakeRulesRepository,
  fakeUsersLookup,
} from './fakes.js';
import type { Alarm, Rule } from '../rules.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function ruleFixture(overrides: Partial<Rule> = {}): Rule {
  return {
    id: '1',
    userId: '1',
    name: 'Temp Alert',
    executionInterval: 300,
    allowRetriggering: true,
    severity: 'warning',
    conditions: [],
    actions: { sendEmail: false, sendMessage: false, systemNotification: false },
    emailData: null,
    smsData: null,
    notificationData: null,
    isActive: true,
    isForWidget: false,
    isForRuleBuilder: true,
    isForAll: false,
    lastTriggered: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function alarmFixture(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: '1',
    ruleId: '1',
    deviceId: '1',
    productId: null,
    companyId: '1',
    state: 'active',
    severity: 'critical',
    conditionSnapshot: null,
    triggeredValue: null,
    triggeredAt: new Date('2026-01-01T00:00:00.000Z'),
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    rule: undefined,
    device: undefined,
    acknowledgedByUser: undefined,
    ...overrides,
  };
}

function buildApp(seedRules: Rule[] = [], seedAlarms: Alarm[] = []) {
  const { repository, state } = fakeRulesRepository(seedRules, seedAlarms);
  const devicesLookup = fakeDevicesLookup([
    { id: '1', name: 'Device 1', deviceUniqueIdentifier: 'eui-1', userId: '1' },
  ]);
  const usersLookup = fakeUsersLookup([
    {
      id: '1',
      email: 'owner@example.com',
      number: '+1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      timezone: 'UTC',
    },
  ]);
  const productsLookup = fakeProductsLookup([{ id: '1', companyId: '1' }]);
  const service = new RulesService(
    repository,
    devicesLookup,
    usersLookup,
    productsLookup,
    fakeNotificationsLookup(),
    fakeQueuePort()
  );
  const controller = new RulesController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createRulesRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });
const OTHER_TOKEN = signAccessToken({ sub: '2', companyId: '1', roles: [] });

describe('rules routes', () => {
  it('GET /rules with no token: 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
  });

  it("GET /rules: 200, only the caller's own rule-builder rules", async () => {
    const { app } = buildApp([
      ruleFixture({ id: '1', userId: '1' }),
      ruleFixture({ id: '2', userId: '2' }),
    ]);
    const res = await request(app).get('/api/rules').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { rules: { id: number }[] } };
    expect(body.data.rules).toHaveLength(1);
    expect(body.data.rules[0]?.id).toBe(1);
  });

  it("GET /rules/users/:user for someone else's id: 403 (D-0062, no admin bypass)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/rules/users/2')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('POST /rules/store: 201, owner set from the token', async () => {
    const { app, state } = buildApp();
    const res = await request(app)
      .post('/api/rules/store')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        ruleName: 'New Rule',
        executionInterval: 60,
        allowRetriggering: true,
        conditions: [
          {
            selectedProduct: 'p1',
            selectedAttribute: 'a',
            selectedCondition: 'equals',
            conditionValue: '1',
            logicalOperator: 'and',
          },
        ],
        actions: { sendEmail: false, sendMessage: false, systemNotification: false },
        is_active: true,
      });
    expect(res.status).toBe(201);
    const body = res.body as { data: { rule: { name: string | null } } };
    expect(body.data.rule.name).toBe('New Rule');
    expect([...state.rules.values()][0]?.userId).toBe('1');
  });

  it('PUT /rules/:id for a rule owned by someone else: 403', async () => {
    const { app } = buildApp([ruleFixture({ id: '1', userId: '2' })]);
    const res = await request(app)
      .put('/api/rules/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        ruleName: 'Hijacked',
        executionInterval: 60,
        allowRetriggering: true,
        conditions: [
          {
            selectedProduct: 'p1',
            selectedAttribute: 'a',
            selectedCondition: 'equals',
            conditionValue: '1',
            logicalOperator: 'and',
          },
        ],
        actions: { sendEmail: false, sendMessage: false, systemNotification: false },
        is_active: true,
      });
    expect(res.status).toBe(403);
  });

  it('DELETE /rules/:id: 200 for the owner', async () => {
    const { app, state } = buildApp([ruleFixture({ id: '1', userId: '1' })]);
    const res = await request(app).delete('/api/rules/1').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(state.rules.has('1')).toBe(false);
  });

  it('GET /rules/:id: 404 for a nonexistent id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/rules/999').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('POST /rules/bulk/activate: only owned ids get updated, no error for the rest', async () => {
    const { app, state } = buildApp([
      ruleFixture({ id: '1', userId: '1', isActive: false }),
      ruleFixture({ id: '2', userId: '2', isActive: false }),
    ]);
    const res = await request(app)
      .post('/api/rules/bulk/activate')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ rule_ids: [1, 2] });
    expect(res.status).toBe(200);
    const body = res.body as { data: { updated_count: number } };
    expect(body.data.updated_count).toBe(1);
    expect(state.rules.get('1')?.isActive).toBe(true);
    expect(state.rules.get('2')?.isActive).toBe(false);
  });

  it('GET /alarms: company-scoped list', async () => {
    const { app } = buildApp(
      [],
      [alarmFixture({ id: '1', companyId: '1' }), alarmFixture({ id: '2', companyId: '2' })]
    );
    const res = await request(app).get('/api/alarms').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      data: { current_page: number; total: number; data: { id: number }[] };
    };
    expect(body.data.data).toHaveLength(1);
    expect(body.data.data[0]?.id).toBe(1);
    expect(body.data.total).toBe(1);
  });

  it('POST /alarms/:id/acknowledge: 200 from active, 422 if already acknowledged', async () => {
    const { app } = buildApp([], [alarmFixture({ id: '1', state: 'active' })]);
    const res = await request(app)
      .post('/api/alarms/1/acknowledge')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { state: string } };
    expect(body.data.state).toBe('acknowledged');

    const res2 = await request(app)
      .post('/api/alarms/1/acknowledge')
      .set('Authorization', `Bearer ${OTHER_TOKEN}`);
    expect(res2.status).toBe(422);
  });

  it('POST /alarms/:id/acknowledge: 404 for a nonexistent alarm', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/alarms/999/acknowledge')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });
});
