import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { ProtocolsController } from '../protocols.controller.js';
import { ProtocolsService } from '../protocols.service.js';
import { createProtocolsRouter } from '../protocols.routes.js';
import { fakeProtocolsRepository } from './fakes.js';
import type { Protocol } from '../protocols.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(seedProtocols: Protocol[] = []) {
  const { repository, state } = fakeProtocolsRepository(seedProtocols);
  const service = new ProtocolsService(repository);
  const controller = new ProtocolsController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createProtocolsRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

function protocolFixture(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: '1',
    name: 'MQTTS',
    category: 'transport',
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });

describe("protocols routes (D-0050: requireAuth, closing 11.47's zero-auth gap)", () => {
  it('GET /protocols with no token: 401 (11.47 fix — Laravel itself has zero auth here)', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/api/protocols');

    expect(res.status).toBe(401);
  });

  it('GET /protocols: 200, Laravel default paginator shape, no envelope', async () => {
    const { app } = buildApp([protocolFixture()]);

    const res = await request(app).get('/api/protocols').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      current_page: 1,
      data: [{ id: 1, name: 'MQTTS', category: 'transport' }],
      per_page: 10,
      total: 1,
    });
    expect(res.body).toHaveProperty('links');
    expect(res.body).toHaveProperty('last_page_url');
  });

  it('GET /protocols?category=device_protocol filters the list', async () => {
    const { app } = buildApp([
      protocolFixture({ id: '1', name: 'HTTPS', category: 'transport' }),
      protocolFixture({ id: '2', name: 'LoRaWAN', category: 'device_protocol' }),
    ]);

    const res = await request(app)
      .get('/api/protocols?category=device_protocol')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as { data: { name: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.name).toBe('LoRaWAN');
  });

  it('POST /protocols: 201, bare model, description accepted but dropped', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/protocols')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'OPC UA', description: 'should be silently discarded' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'OPC UA', category: 'transport' });
    expect(res.body).not.toHaveProperty('description');
  });

  it('GET /protocols/{protocol}: 200, bare model', async () => {
    const { app } = buildApp([protocolFixture()]);

    const res = await request(app).get('/api/protocols/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'MQTTS' });
  });

  it('GET /protocols/{protocol}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/protocols/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('PUT /protocols/{protocol}: 200, bare model', async () => {
    const { app } = buildApp([protocolFixture()]);

    const res = await request(app)
      .put('/api/protocols/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'MQTTS Renamed' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'MQTTS Renamed' });
  });

  it('PUT /protocols/{protocol}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .put('/api/protocols/999')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(404);
  });

  it('DELETE /protocols/{protocol}: 200 with the Laravel record_deleted message', async () => {
    const { app } = buildApp([protocolFixture()]);

    const res = await request(app)
      .delete('/api/protocols/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Record deleted successfully.' });
  });

  it('DELETE /protocols/{protocol}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .delete('/api/protocols/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });
});
