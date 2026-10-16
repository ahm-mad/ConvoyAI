import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { DevicesController } from '../devices.controller.js';
import { DevicesService } from '../devices.service.js';
import { createDevicesRouter } from '../devices.routes.js';
import { fakeDevicesRepository, fakeProductsLookup } from './fakes.js';
import type { Device } from '../devices.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function deviceFixture(overrides: Partial<Device & { productCompanyId: string }> = {}) {
  return {
    id: '1',
    deviceUniqueIdentifier: 'dev-1',
    name: 'Sensor',
    type: null,
    status: 'active',
    location: '',
    tags: '',
    productId: '1',
    userId: '1',
    createdAt: null,
    updatedAt: null,
    lastReportedAt: null,
    productCompanyId: '1',
    ...overrides,
  };
}

type Preferences = Record<
  string,
  {
    attributeKey: string | null;
    label: string | null;
    unit: string | null;
    isSelected: boolean;
    isUniqueIdentifier: boolean;
  }[]
>;

function buildApp(
  seedDevices: (Device & { productCompanyId: string })[] = [],
  products: { id: string; companyId: string }[] = [],
  preferences: Preferences = {}
) {
  const { repository, state } = fakeDevicesRepository(seedDevices);
  const service = new DevicesService(repository, fakeProductsLookup(products, preferences));
  const controller = new DevicesController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createDevicesRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });

describe('devices routes: CRUD (D-0022 authorization)', () => {
  it('GET /devices with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/devices');

    expect(res.status).toBe(401);
  });

  it('POST /devices: 201, sets user_id from the caller (closes 11.5)', async () => {
    const { app } = buildApp([], [{ id: '1', companyId: '1' }]);

    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_unique_identifier: 'dev-new', name: 'Sensor', product_id: 1 });

    expect(res.status).toBe(201);
    const body = res.body as { data: { user_id: number; device_unique_identifier: string } };
    expect(body.data.user_id).toBe(1);
    expect(body.data.device_unique_identifier).toBe('dev-new');
  });

  it("POST /devices: 422 when product_id doesn't belong to the caller's company", async () => {
    const { app } = buildApp([], [{ id: '1', companyId: '999' }]);

    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_unique_identifier: 'dev-new', name: 'Sensor', product_id: 1 });

    expect(res.status).toBe(422);
  });

  it('PUT /devices/{id}: 200 for an owned device', async () => {
    const { app } = buildApp([deviceFixture()]);

    const res = await request(app)
      .put('/api/devices/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    const body = res.body as { data: { name: string } };
    expect(body.data.name).toBe('Renamed');
  });

  it('PUT /devices/{id}: 404 for a cross-tenant device (D-0022 avoids an enumeration oracle)', async () => {
    const { app } = buildApp([deviceFixture({ userId: '2', productCompanyId: '2' })]);

    const res = await request(app)
      .put('/api/devices/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'x' });

    expect(res.status).toBe(404);
  });

  it('DELETE /devices/{id}: 204, no body', async () => {
    const { app } = buildApp([deviceFixture()]);

    const res = await request(app).delete('/api/devices/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('PATCH /devices/{id}/enable and /disable: 200', async () => {
    const { app } = buildApp([deviceFixture({ status: 'inactive' })]);

    const enableRes = await request(app)
      .patch('/api/devices/1/enable')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(enableRes.status).toBe(200);
    expect((enableRes.body as { data: { status: string } }).data.status).toBe('active');

    const disableRes = await request(app)
      .patch('/api/devices/1/disable')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(disableRes.status).toBe(200);
    expect((disableRes.body as { data: { status: string } }).data.status).toBe('inactive');
  });

  it('POST /devices/bulk/enable, /disable, /destroy: 200 with counts', async () => {
    const { app } = buildApp([
      deviceFixture({ id: '1', userId: '1', productCompanyId: '1' }),
      deviceFixture({ id: '2', userId: '2', productCompanyId: '2' }),
    ]);

    const enableRes = await request(app)
      .post('/api/devices/bulk/enable')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_ids: [1, 2] });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body).toMatchObject({ success: true, data: { updated_count: 1 } });
  });

  it("POST /devices/bulk/destroy: 422 when an id doesn't exist at all", async () => {
    const { app } = buildApp([deviceFixture({ id: '1' })]);

    const res = await request(app)
      .post('/api/devices/bulk/destroy')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_ids: [1, 999] });

    expect(res.status).toBe(422);
  });
});

describe('devices routes: points, getByProduct', () => {
  it('GET /devices/{id}/points: 200', async () => {
    const { app, state } = buildApp(
      [deviceFixture({ id: '1', productId: '5', deviceUniqueIdentifier: 'dev-1' })],
      [{ id: '5', companyId: '1' }],
      {
        '5': [
          {
            attributeKey: 'temperature',
            label: 'Temp',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      }
    );
    state.latestValues.set('dev-1', { temperature: 21.5 });

    const res = await request(app)
      .get('/api/devices/1/points')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { points: { point_key: string; last_value: number }[] } };
    expect(body.data.points).toEqual([
      {
        point_key: 'temperature',
        label: 'Temp',
        unit: 'C',
        is_unique_identifier: false,
        is_selected: true,
        semantic_type: null,
        commandable: null,
        last_value: 21.5,
      },
    ]);
  });

  it('GET /devices/{id}/points: 404 for a missing/unauthorized device', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/devices/999/points')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('GET /devices/product/{product_id}: 404 when the product has no visible devices', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/devices/product/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'No devices found for this product.',
      data: [],
    });
  });

  it('GET /devices/product/{product_id}: 200 with is_assigned and userPreference', async () => {
    const { app, state } = buildApp([deviceFixture({ id: '1', productId: '5' })], [], {
      '5': [
        {
          attributeKey: 'temp',
          label: 'Temp',
          unit: 'C',
          isSelected: true,
          isUniqueIdentifier: false,
        },
      ],
    });
    state.assignedDeviceIds.add('1');
    state.assignedDeviceIds.add('77'); // another product's device — Laravel lists every assigned id (D-0128)

    const res = await request(app)
      .get('/api/devices/product/5')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      data: Record<string, unknown>[];
      userPreference: unknown[];
      assigned_device_ids: number[];
    };
    expect(body.data[0]).toMatchObject({ id: 1, is_assigned: true, latest_device_value: null });
    expect(Object.keys(body.data[0] ?? {})).toEqual([
      'id',
      'device_unique_identifier',
      'name',
      'type',
      'status',
      'location',
      'tags',
      'product_id',
      'user_id',
      'created_at',
      'updated_at',
      'is_assigned',
      'last_updated',
      'latest_device_value',
      'user',
    ]);
    expect(body.userPreference).toEqual([
      {
        id: 1,
        label: 'Temp',
        unit: 'C',
        attribute_key: 'temp',
        is_selected: 1,
        is_unique_identifier: false,
      },
    ]);
    expect(body.assigned_device_ids).toEqual([1, 77]);
  });
});

describe('devices routes: command sending (D-0052: publish deferred to 2.4)', () => {
  it("POST /devices/{id}/command: 500, publish isn't wired until module 2.4", async () => {
    const { app } = buildApp([deviceFixture()]);

    const res = await request(app)
      .post('/api/devices/1/command')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ command: 'reboot' });

    expect(res.status).toBe(500);
  });

  it("POST /devices/{id}/command: 404 for a device the caller doesn't own", async () => {
    const { app } = buildApp([deviceFixture({ userId: '2', productCompanyId: '2' })]);

    const res = await request(app)
      .post('/api/devices/1/command')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ command: 'reboot' });

    expect(res.status).toBe(404);
  });

  it('POST /devices/bulk/commands: 200, reports per-device results', async () => {
    const { app } = buildApp([
      deviceFixture({ id: '1', userId: '1', productCompanyId: '1' }),
      deviceFixture({ id: '2', userId: '2', productCompanyId: '2' }),
    ]);

    const res = await request(app)
      .post('/api/devices/bulk/commands')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_ids: [1, 2], command: 'reboot' });

    expect(res.status).toBe(200);
    const body = res.body as {
      data: { total_devices: number; successful: number; failed: number };
    };
    expect(body.data.total_devices).toBe(1);
    expect(body.data.failed).toBe(1);
  });
});

describe('devices routes: userDevices (11.48 closes the client-suppliable user_id IDOR)', () => {
  it("GET /userDevices/list: only returns the caller's own rows, ignoring a spoofed user_id query param", async () => {
    const { app, state } = buildApp();
    state.userDevices.set('1', {
      id: '1',
      userId: '1',
      deviceId: null,
      deviceName: 'Mine',
      deviceLocation: null,
      status: null,
      toggleStatus: true,
      notificationPhoneNumber: null,
      notificationEmail: null,
      createdAt: null,
      updatedAt: null,
    });
    state.userDevices.set('2', {
      id: '2',
      userId: '2',
      deviceId: null,
      deviceName: 'SomeoneElses',
      deviceLocation: null,
      status: null,
      toggleStatus: true,
      notificationPhoneNumber: null,
      notificationEmail: null,
      createdAt: null,
      updatedAt: null,
    });

    const res = await request(app)
      .get('/api/userDevices/list?user_id=2')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { device_name: string }[] };
    expect(body.data).toEqual([expect.objectContaining({ device_name: 'Mine' })]);
  });

  it('GET /userDevices/list: 404 when the caller has no user devices', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/userDevices/list')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('POST /userDevices/activate: 404 (11.23 — confirmed dead, not wired)', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/userDevices/activate')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ device_name: 'x', device_location: 'y' });

    expect(res.status).toBe(404);
  });
});
