import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { MqttConfigurationsController } from '../mqtt-configurations.controller.js';
import { MqttConfigurationsService } from '../mqtt-configurations.service.js';
import { createMqttConfigurationsRouter } from '../mqtt-configurations.routes.js';
import { fakeMqttConfigurationsRepository } from './fakes.js';
import type { MqttConfiguration } from '../mqtt-configurations.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(seed: MqttConfiguration[] = []) {
  const { repository, state } = fakeMqttConfigurationsRepository(seed);
  const service = new MqttConfigurationsService(repository);
  const controller = new MqttConfigurationsController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createMqttConfigurationsRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

function configFixture(overrides: Partial<MqttConfiguration> = {}): MqttConfiguration {
  return {
    id: '1',
    companyId: '1',
    name: 'Primary',
    host: 'broker.example.com',
    port: 8883,
    username: 'user',
    password: 'super-secret',
    useTls: true,
    clientIdPrefix: 'prefix',
    status: 'active',
    lastTestedAt: null,
    testResult: null,
    description: 'desc',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });
const TOKEN_NO_COMPANY = signAccessToken({ sub: '1', roles: [] });

describe('mqtt-configurations routes (module 6.5, D-0117)', () => {
  it('GET /mqtt-configurations with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/mqtt-configurations');

    expect(res.status).toBe(401);
  });

  it("GET /mqtt-configurations: 200, password never appears in the response (matches Laravel's $hidden)", async () => {
    const { app } = buildApp([configFixture()]);

    const res = await request(app)
      .get('/api/mqtt-configurations')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { success: boolean; message: string; data: Record<string, unknown>[] };
    expect(body).toMatchObject({
      success: true,
      message: 'MQTT configurations fetched successfully',
    });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty('password');
    expect(body.data[0]?.['username']).toBe('user');
  });

  it("GET /mqtt-configurations with a token that has no companyId: 404 'Company not found.'", async () => {
    const { app } = buildApp([configFixture()]);

    const res = await request(app)
      .get('/api/mqtt-configurations')
      .set('Authorization', `Bearer ${TOKEN_NO_COMPANY}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Company not found.' });
  });

  it("GET /mqtt-configurations/active: 404 'MQTT configuration not found' when none is active", async () => {
    const { app } = buildApp([configFixture({ status: 'inactive' })]);

    const res = await request(app)
      .get('/api/mqtt-configurations/active')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'MQTT configuration not found' });
  });

  it('GET /mqtt-configurations/{id}: 404 for a nonexistent id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/mqtt-configurations/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'MQTT configuration not found' });
  });

  it('POST /mqtt-configurations: 422 when host is missing', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/mqtt-configurations')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ port: 8883 });

    expect(res.status).toBe(422);
    const body = res.body as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('POST /mqtt-configurations: 201, ignores a client-supplied company_id (D-0117)', async () => {
    const { app, state } = buildApp();

    const res = await request(app)
      .post('/api/mqtt-configurations')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        company_id: 999,
        host: 'broker.example.com',
        port: 8883,
        username: 'u',
        password: 'p',
      });

    expect(res.status).toBe(201);
    const body = res.body as { data: { host: string } };
    expect(body.data.host).toBe('broker.example.com');
    const created = [...state.configs.values()][0];
    expect(created?.companyId).not.toBe('999');
  });

  it("POST /mqtt-configurations: a minimal payload's response has ONLY the keys that were sent, plus id/created_at/updated_at (real Laravel's validated()-shaped create response, confirmed live)", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/mqtt-configurations')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ host: 'minimal.example.com', port: 1883 });

    expect(res.status).toBe(201);
    const body = res.body as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(
      ['company_id', 'host', 'port', 'updated_at', 'created_at', 'id'].sort()
    );
  });

  it("DELETE /mqtt-configurations/{id}: 200, no data key (matches Laravel's response()->json(['success','message']))", async () => {
    const { app } = buildApp([configFixture()]);

    const res = await request(app)
      .delete('/api/mqtt-configurations/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'MQTT configuration deleted successfully' });
  });
});
