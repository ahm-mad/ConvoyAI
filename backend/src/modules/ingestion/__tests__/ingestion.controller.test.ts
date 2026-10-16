import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { logger } from '../../../platform/logging/logger.js';
import { signIngestionToken } from '../../../platform/crypto/ingestion-token.js';
import { IngestionController } from '../ingestion.controller.js';
import { IngestionService } from '../ingestion.service.js';
import { createIngestionRouter } from '../ingestion.routes.js';
import {
  fakeDevicesLookup,
  fakeAssetsLookup,
  fakeGeofencesLookup,
  fakeIngestionRepository,
  fakeProductsLookup,
  fakeProtocolsLookup,
  fakeQueuePort,
  fakeWidgetsLookup,
} from './fakes.js';

const TOKEN = signIngestionToken({ userId: '1', productId: '1', protocolId: '1' });

const PREFS_WITH_UID = {
  '1': [
    {
      attributeKey: 'deviceInfo.uid',
      label: 'UID',
      unit: null,
      isSelected: true,
      isUniqueIdentifier: true,
    },
  ],
};

function buildApp(
  opts: {
    tokens?: string[];
    devices?: { id: string; productId: string; userId: string; deviceUniqueIdentifier: string }[];
    preferences?: Record<
      string,
      {
        attributeKey: string | null;
        label: string | null;
        unit: string | null;
        isSelected: boolean;
        isUniqueIdentifier: boolean;
      }[]
    >;
  } = {}
) {
  const { repository } = fakeIngestionRepository(opts.tokens ?? [TOKEN]);
  const productsLookup = fakeProductsLookup(
    [{ id: '1', companyId: '1', deviceProtocolId: null }],
    opts.preferences ?? PREFS_WITH_UID
  );
  const devicesLookup = fakeDevicesLookup(opts.devices ?? []);
  const protocolsLookup = fakeProtocolsLookup([]);
  const service = new IngestionService(
    repository,
    productsLookup,
    devicesLookup,
    protocolsLookup,
    fakeQueuePort(),
    fakeGeofencesLookup(),
    fakeWidgetsLookup(),
    fakeAssetsLookup()
  );
  const controller = new IngestionController(service);

  const app = express();
  app.use(express.json());
  app.use('/api', createIngestionRouter(controller));
  app.use(createErrorHandler(logger));
  return app;
}

describe('POST /webhook (device-facing, no requireAuth — security:[] in the frozen contract)', () => {
  it('401s with no token header at all', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/webhook').send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication failed' });
  });

  it("401s for a token header that doesn't exist in raw_packet_values", async () => {
    const app = buildApp({ tokens: [] });

    const res = await request(app).post('/api/webhook').set('token', TOKEN).send({});

    expect(res.status).toBe(401);
  });

  it("404s when the packet's unique-identifier value doesn't match any device", async () => {
    const app = buildApp({ devices: [] });

    const res = await request(app)
      .post('/api/webhook')
      .set('token', TOKEN)
      .send({ deviceInfo: { uid: 'no-such-device' } });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Device not found.' });
  });

  it('201s and accepts a valid packet for a resolvable device', async () => {
    const app = buildApp({
      devices: [{ id: '1', productId: '1', userId: '1', deviceUniqueIdentifier: 'dev-1' }],
    });

    const res = await request(app)
      .post('/api/webhook')
      .set('token', TOKEN)
      .send({ deviceInfo: { uid: 'dev-1' }, temp: 21.5 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
  });

  it('201s with the soft-fail shape when the product has no configured attribute preferences', async () => {
    const app = buildApp({ preferences: {} });

    const res = await request(app).post('/api/webhook').set('token', TOKEN).send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: false, message: 'no user preferences found' });
  });
});
