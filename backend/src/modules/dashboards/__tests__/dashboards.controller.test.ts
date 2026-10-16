import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { DashboardsController } from '../dashboards.controller.js';
import { DashboardsService } from '../dashboards.service.js';
import { createDashboardsRouter } from '../dashboards.routes.js';
import { fakeDashboardsRepository, fakeProductsLookup } from './fakes.js';
import type { Dashboard, Widget, WidgetSetting } from '../dashboards.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: '1',
    createdBy: '1',
    name: 'My Dashboard',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function widgetFixture(overrides: Partial<Widget> = {}): Widget {
  return {
    id: '1',
    dashboardId: '1',
    type: 'value',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    createdBy: '1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function widgetSettingFixture(overrides: Partial<WidgetSetting> = {}): WidgetSetting {
  return {
    id: '1',
    widgetId: '1',
    ruleId: '1',
    widgetName: null,
    settings: null,
    attributes: 'temp',
    yAxisLabel: null,
    device: '10',
    data: null,
    unit: null,
    icon: null,
    decimal: null,
    showTimestamp: null,
    product: '20',
    label: null,
    backgroundColor: null,
    valueColor: null,
    textColor: null,
    maxValue: null,
    tankType: null,
    graphType: null,
    graphInterval: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function ruleRowFixture() {
  return {
    id: 1n,
    user_id: 1n,
    name: null,
    execution_interval: null,
    allow_retriggering: null,
    severity: 'warning' as const,
    conditions: [],
    actions: [],
    email_data: null,
    sms_data: null,
    notification_data: null,
    is_active: true,
    is_for_widget: true,
    is_for_rule_builder: false,
    is_for_building: false,
    is_for_all: false,
    deleted_at: null,
    last_triggered: null,
    created_at: null,
    updated_at: null,
  };
}

function buildApp(repoOverrides: Parameters<typeof fakeDashboardsRepository>[0] = {}) {
  const repo = fakeDashboardsRepository(repoOverrides);
  const service = new DashboardsService(repo, fakeProductsLookup());
  const controller = new DashboardsController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createDashboardsRouter(controller));
  app.use(createErrorHandler(logger));
  return app;
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });
const ADMIN_TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: ['admin'] });
const MANAGE_USERS_TOKEN = signAccessToken({
  sub: '1',
  companyId: '1',
  roles: ['admin'],
  perms: ['manage users'],
});

describe("DashboardsController — GET /dashboards/{id}'s frozen-contract-specific 404 envelope", () => {
  it('404s with {error,status,code}, not the standard {success,message} envelope every other route uses', async () => {
    const app = buildApp({ findByIdWithWidgets: () => Promise.resolve(undefined) });

    const res = await request(app)
      .get('/api/dashboards/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Dashboard not found', status: 'error', code: 404 });
  });

  it('200s with the bare dashboard model, no {success,message,data} envelope', async () => {
    const app = buildApp({
      findByIdWithWidgets: () => Promise.resolve({ dashboard: dashboardFixture(), widgets: [] }),
    });

    const res = await request(app).get('/api/dashboards/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'My Dashboard', widgets: [] });
    expect(res.body).not.toHaveProperty('success');
  });
});

describe('DashboardsController — auth gating matches Laravel exactly', () => {
  it('GET /widgets/{widget} requires auth (401 with no token)', async () => {
    const app = buildApp({});

    const res = await request(app).get('/api/widgets/1');

    expect(res.status).toBe(401);
  });

  it('GET /admin/dashboard requires role:admin (403 for an authenticated non-admin)', async () => {
    const app = buildApp({});

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(403);
  });

  it("POST /widgets/graph-data is genuinely unauthenticated — works with no token at all (matches openapi.yaml's security: [])", async () => {
    const app = buildApp({
      findWidgetsWithSettingsByIds: () => Promise.resolve([{ ...widgetFixture(), settings: [] }]),
    });

    const res = await request(app)
      .post('/api/widgets/graph-data')
      .send({ graph_widget: { '1': 'daily' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("DashboardsController — dashboards CRUD (happy path, each endpoint's envelope)", () => {
  it('GET /dashboards returns a Laravel-paginator envelope', async () => {
    const app = buildApp({
      listForCaller: () => Promise.resolve({ items: [dashboardFixture()], total: 1 }),
    });

    const res = await request(app).get('/api/dashboards').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { current_page: 1, total: 1, data: [{ id: 1 }] },
    });
  });

  it('POST /dashboards creates and returns 201', async () => {
    const app = buildApp({ create: () => Promise.resolve(dashboardFixture()) });

    const res = await request(app)
      .post('/api/dashboards')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'New' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { id: 1, name: 'My Dashboard' } });
  });

  it('PUT /dashboards/{id} updates and returns 200', async () => {
    const app = buildApp({
      findById: () => Promise.resolve(dashboardFixture()),
      update: () => Promise.resolve(dashboardFixture({ name: 'Renamed' })),
    });

    const res = await request(app)
      .put('/api/dashboards/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    const body = res.body as { data: { name: string } };
    expect(body.data.name).toBe('Renamed');
  });

  it('DELETE /dashboards/{id} returns {success,message}', async () => {
    const app = buildApp({
      findById: () => Promise.resolve(dashboardFixture()),
      delete: () => Promise.resolve(undefined),
    });

    const res = await request(app)
      .delete('/api/dashboards/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Dashboard deleted successfully.' });
  });

  it('GET /user/{userId}/dashboards returns id+name only', async () => {
    const app = buildApp({ listSummariesByCreatedBy: () => Promise.resolve([dashboardFixture()]) });

    const res = await request(app)
      .get('/api/user/1/dashboards')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { id: number; name: string }[] };
    expect(body.data).toEqual([{ id: 1, name: 'My Dashboard' }]);
  });

  it('GET /admin/dashboard succeeds for an admin and returns a paginator', async () => {
    const app = buildApp({
      listAllAdmin: () => Promise.resolve({ items: [dashboardFixture()], total: 1 }),
    });

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { total: number } };
    expect(body.data.total).toBe(1);
  });

  it("GET /admin/manage-users requires the literal 'manage users' permission (space, matching Laravel's odd naming) in addition to role:admin", async () => {
    const app = buildApp({});

    const withoutPermission = await request(app)
      .get('/api/admin/manage-users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(withoutPermission.status).toBe(403);

    const withPermission = await request(app)
      .get('/api/admin/manage-users')
      .set('Authorization', `Bearer ${MANAGE_USERS_TOKEN}`);
    expect(withPermission.status).toBe(200);
    expect(withPermission.body).toEqual({
      message: 'User management access granted.',
      status: 'success',
    });
  });
});

describe('DashboardsController — global stats (requireAuth only, matches Laravel exactly)', () => {
  it('GET /stats/count-all', async () => {
    const app = buildApp({
      countAll: () =>
        Promise.resolve({
          users: 1,
          user_devices: 2,
          products: 3,
          companies: 4,
          device_packets: 5,
          widgets: 6,
          device_values: 7,
          device: 8,
        }),
    });

    const res = await request(app)
      .get('/api/stats/count-all')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        users: 1,
        user_devices: 2,
        products: 3,
        companies: 4,
        device_packets: 5,
        widgets: 6,
        device_values: 7,
        device: 8,
      },
    });
  });

  it('GET /users/all', async () => {
    const app = buildApp({
      listAllUsersBasic: () =>
        Promise.resolve([
          {
            id: '1',
            firstName: 'A',
            lastName: 'B',
            email: 'a@example.com',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
    });

    const res = await request(app).get('/api/users/all').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown>[] };
    expect(body.data[0]).toMatchObject({
      id: 1,
      first_name: 'A',
      last_name: 'B',
      email: 'a@example.com',
    });
  });

  it('GET /users/monthly-registrations', async () => {
    const app = buildApp({
      monthlyRegistrations: () => Promise.resolve([{ month: '2026-01', total: 5 }]),
    });

    const res = await request(app)
      .get('/api/users/monthly-registrations?range=1m')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ month: '2026-01', total: 5 }] });
  });
});

describe('DashboardsController — analytics / packet history', () => {
  it('GET /dashboard/analytics', async () => {
    const app = buildApp({
      listDevicesForCaller: () => Promise.resolve([]),
      findLatestValueTimestamps: () => Promise.resolve(new Map()),
    });

    const res = await request(app)
      .get('/api/dashboard/analytics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { total_devices: 0 } });
  });

  it('GET /dashboard/packet-history', async () => {
    const app = buildApp({
      queryPacketHistory: () => Promise.resolve({ items: [], total: 0 }),
      listActiveNonWidgetRulesForUser: () => Promise.resolve([]),
    });

    const res = await request(app)
      .get('/api/dashboard/packet-history')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { packets: [], summary: { total: 0 } } });
  });
});

describe('DashboardsController — widgets CRUD', () => {
  it('GET /widgets scoped to the caller', async () => {
    const app = buildApp({ listWidgetsForCaller: () => Promise.resolve([widgetFixture()]) });

    const res = await request(app).get('/api/widgets').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown>[] };
    expect(body.data).toEqual([expect.objectContaining({ id: 1 })]);
  });

  it('POST /widgets creates and returns 201', async () => {
    const app = buildApp({
      findById: () => Promise.resolve(dashboardFixture()),
      createWidget: () => Promise.resolve(widgetFixture()),
    });

    const res = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ dashboard_id: 1, x: 0, y: 0, w: 1, h: 1, type: 'value' });

    expect(res.status).toBe(201);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: 1 });
  });

  it('PUT /widgets/{widget} updates', async () => {
    const app = buildApp({
      findWidgetById: () => Promise.resolve(widgetFixture()),
      updateWidget: () => Promise.resolve(widgetFixture({ x: 5 })),
    });

    const res = await request(app)
      .put('/api/widgets/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ x: 5, y: 0, w: 1, h: 1 });

    expect(res.status).toBe(200);
    const body = res.body as { data: { x: number } };
    expect(body.data.x).toBe(5);
  });

  it('DELETE /widgets/{widget}', async () => {
    const app = buildApp({
      findWidgetById: () => Promise.resolve(widgetFixture()),
      deleteWidgetCascade: () => Promise.resolve(undefined),
    });

    const res = await request(app).delete('/api/widgets/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Widget deleted successfully.' });
  });

  it('GET /widgets/{widget} — the spread-first-setting shape', async () => {
    const app = buildApp({
      findWidgetById: () => Promise.resolve(widgetFixture()),
      findWidgetWithSettings: () =>
        Promise.resolve({ widget: widgetFixture(), settings: [widgetSettingFixture()] }),
      findDeviceById: () => Promise.resolve(undefined),
      findProductNameById: () => Promise.resolve(undefined),
    });

    const res = await request(app).get('/api/widgets/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: 1, widget_settings: [{ id: 1 }] });
  });
});

describe('DashboardsController — widget settings CRUD', () => {
  it('POST /widgets/{widget}/settings creates and returns 201 with {widget_settings,rules}', async () => {
    const app = buildApp({
      findWidgetById: () => Promise.resolve(widgetFixture()),
      createSettingWithRule: () =>
        Promise.resolve({ setting: widgetSettingFixture(), rule: ruleRowFixture() }),
    });

    const res = await request(app)
      .post('/api/widgets/1/settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ widget_settings: [{ attributes: 'temp' }] });

    expect(res.status).toBe(201);
    const body = res.body as { data: { widget_settings: unknown[]; rules: unknown[] } };
    expect(body.data.widget_settings).toHaveLength(1);
    expect(body.data.rules).toHaveLength(1);
  });

  it('POST /widget-settings (apiResource route, D-0070) accepts widget_id in the body', async () => {
    const app = buildApp({
      findWidgetById: () => Promise.resolve(widgetFixture()),
      createSettingWithRule: () =>
        Promise.resolve({ setting: widgetSettingFixture(), rule: ruleRowFixture() }),
    });

    const res = await request(app)
      .post('/api/widget-settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ widget_id: 1, widget_settings: [{ attributes: 'temp' }] });

    expect(res.status).toBe(201);
    const body = res.body as { data: { widget_settings: unknown[] } };
    expect(body.data.widget_settings).toHaveLength(1);
  });

  it('GET /widget-settings scoped to the caller', async () => {
    const app = buildApp({
      listSettingsForCaller: () => Promise.resolve([widgetSettingFixture()]),
    });

    const res = await request(app)
      .get('/api/widget-settings')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('GET /widget-settings/{widgetSetting} returns the bare model, no envelope', async () => {
    const app = buildApp({
      findSettingById: () => Promise.resolve(widgetSettingFixture()),
      findWidgetById: () => Promise.resolve(widgetFixture()),
    });

    const res = await request(app)
      .get('/api/widget-settings/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, widget_id: 1 });
    expect(res.body).not.toHaveProperty('success');
  });

  it("PUT /widget-settings/{widgetSetting} — the URL param is genuinely unused; each entry's own id drives create-vs-update", async () => {
    const app = buildApp({
      findSettingById: () => Promise.resolve(widgetSettingFixture()),
      findWidgetById: () => Promise.resolve(widgetFixture()),
      updateSettingRow: () => Promise.resolve(widgetSettingFixture({ label: 'Updated' })),
    });

    const res = await request(app)
      .put('/api/widget-settings/999')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ widget_settings: [{ id: 1, attributes: 'temp' }] });

    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('DELETE /widget-settings/{widgetSetting}', async () => {
    const app = buildApp({
      findSettingById: () => Promise.resolve(widgetSettingFixture()),
      findWidgetById: () => Promise.resolve(widgetFixture()),
      deleteSettingCascade: () => Promise.resolve(undefined),
    });

    const res = await request(app)
      .delete('/api/widget-settings/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Widget settings deleted successfully.' });
  });
});
