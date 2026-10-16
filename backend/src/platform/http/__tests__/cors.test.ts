import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  return { config: { ...actual.config, CORS_ALLOWED_ORIGINS: ['http://localhost:3000'] } };
});

describe('cors (platform/http, D-0096 — the app had zero CORS handling before this)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows a request with no Origin header at all (server-to-server/curl, never subject to CORS)', async () => {
    const { createCorsMiddleware } = await import('../cors.js');
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('sets Access-Control-Allow-Origin for a request from an allowed origin', async () => {
    const { createCorsMiddleware } = await import('../cors.js');
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not set Access-Control-Allow-Origin for a request from a non-allowed origin', async () => {
    const { createCorsMiddleware } = await import('../cors.js');
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    const res = await request(app).get('/health').set('Origin', 'http://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight OPTIONS request for an allowed origin with the real methods', async () => {
    const { createCorsMiddleware } = await import('../cors.js');
    const app = express();
    app.use(createCorsMiddleware());
    app.post('/api/login', (_req, res) => res.json({ success: true }));

    const res = await request(app)
      .options('/api/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it("exposes the CSV export's file-name and row-count headers to an allowed origin (D-0168, B11)", async () => {
    const { createCorsMiddleware } = await import('../cors.js');
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/vehicles/export', (_req, res) => {
      res.setHeader('Content-Disposition', 'attachment; filename="vehicles.csv"');
      res.setHeader('X-Export-Row-Count', '3');
      res.type('text/csv').send('id\r\n');
    });

    const res = await request(app)
      .get('/api/vehicles/export')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-expose-headers']).toBe(
      'Content-Disposition,X-Export-Row-Count'
    );
    expect(res.headers['content-disposition']).toContain('vehicles.csv');
  });
});
