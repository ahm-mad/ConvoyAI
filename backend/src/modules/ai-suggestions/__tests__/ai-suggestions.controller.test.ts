import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';

const completeChatMock = vi.fn();
vi.mock('../../../platform/ai/groq-client.js', () => ({ completeChat: completeChatMock }));

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

async function buildApp() {
  const { createErrorHandler } = await import('../../../platform/errors/error-handler.js');
  const { createRequestContextMiddleware } =
    await import('../../../platform/http/request-context.js');
  const { logger } = await import('../../../platform/logging/logger.js');
  const { signAccessToken } = await import('../../../platform/auth/jwt.js');
  const { AiSuggestionsService } = await import('../ai-suggestions.service.js');
  const { AiSuggestionsController } = await import('../ai-suggestions.controller.js');
  const { createAiSuggestionsRouter } = await import('../ai-suggestions.routes.js');

  const service = new AiSuggestionsService();
  const controller = new AiSuggestionsController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createAiSuggestionsRouter(controller));
  app.use(createErrorHandler(logger));

  const token = signAccessToken({ sub: '1', companyId: '1', roles: [] });
  return { app, token };
}

describe('POST /highlight-attributes (module 6.3, matches GroqController::highlight)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('with no token: 401', async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post('/api/highlight-attributes')
      .send({ keys: ['temp'] });
    expect(res.status).toBe(401);
  });

  it('with an empty keys array: 422 (min:1 validation)', async () => {
    const { app, token } = await buildApp();
    const res = await request(app)
      .post('/api/highlight-attributes')
      .set('Authorization', `Bearer ${token}`)
      .send({ keys: [] });
    expect(res.status).toBe(422);
  });

  it("defaults context to 'Building automation' when omitted, matching GroqController::highlight exactly", async () => {
    completeChatMock.mockResolvedValue('temp');
    const { app, token } = await buildApp();

    await request(app)
      .post('/api/highlight-attributes')
      .set('Authorization', `Bearer ${token}`)
      .send({ keys: ['temp'] });

    expect(completeChatMock).toHaveBeenCalledWith(expect.stringContaining("'Building automation'"));
  });

  it('200 with real suggestions when Groq returns usable content', async () => {
    completeChatMock.mockResolvedValue('temp, humidity');
    const { app, token } = await buildApp();

    const res = await request(app)
      .post('/api/highlight-attributes')
      .set('Authorization', `Bearer ${token}`)
      .send({ keys: ['temp', 'humidity', 'door_open'], context: 'fridge monitoring' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, highlighted_keys: ['temp', 'humidity'] });
  });

  it("404 with a real message (not Laravel's missing translation key) when Groq returns nothing usable", async () => {
    completeChatMock.mockResolvedValue(undefined);
    const { app, token } = await buildApp();

    const res = await request(app)
      .post('/api/highlight-attributes')
      .set('Authorization', `Bearer ${token}`)
      .send({ keys: ['temp'] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'No relevant attributes could be suggested.',
      highlighted_keys: [],
    });
  });
});
