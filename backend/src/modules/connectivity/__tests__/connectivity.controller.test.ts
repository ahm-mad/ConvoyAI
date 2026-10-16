import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { ConnectivityController } from '../connectivity.controller.js';
import { ConnectivityService } from '../connectivity.service.js';
import { createConnectivityRouter } from '../connectivity.routes.js';
import {
  fakeMqttStateLookup,
  fakePacketsLookup,
  fakeProtocolsLookup,
  fakeQueueLookup,
} from './fakes.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp() {
  const service = new ConnectivityService(
    fakeProtocolsLookup({ HTTPS: '1', MQTT: '2' }),
    fakePacketsLookup({
      '1': { total: 10, lastMessageAt: new Date('2026-01-01T00:00:00.000Z') },
      '2': { total: 5, lastMessageAt: new Date('2026-01-02T00:00:00.000Z') },
    }),
    fakeQueueLookup(1),
    fakeMqttStateLookup({ connected: true, reconnectsTotal: 0, errorsTotal: 0 })
  );
  const controller = new ConnectivityController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createConnectivityRouter(controller));
  app.use(createErrorHandler(logger));
  return app;
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });

describe('connectivity routes (D-0104) — auth:api only, no role gate (ported as-is from Laravel)', () => {
  it('GET /connectors/health with no token: 401', async () => {
    const app = buildApp();

    const res = await request(app).get('/api/connectors/health');

    expect(res.status).toBe(401);
  });

  it('GET /connectors/health: 200 with both mqtt and webhook', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/connectors/health')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Connector health retrieved.',
      data: {
        mqtt: { connector_id: 'mqtt-central', connected: true, messages_received_total: 5 },
        webhook: { connector_id: 'webhook-central', connected: true, messages_received_total: 10 },
      },
    });
  });

  it('GET /connectors/webhook/health: 200 with a single adapter', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/connectors/webhook/health')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { connector_id: 'webhook-central', state: 'running', connected: true },
    });
  });

  it('GET /connectors/{unknown}/health: 404 with the exact Laravel message', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/connectors/bacnet/health')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Unknown connector 'bacnet'." });
  });
});
