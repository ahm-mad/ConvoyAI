import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signVerificationToken } from '../../../platform/auth/jwt.js';
import { OnboardingController } from '../onboarding.controller.js';
import { OnboardingService } from '../onboarding.service.js';
import { createOnboardingRouter } from '../onboarding.routes.js';
import {
  fakeCompaniesLookup,
  fakePlansLookup,
  fakeRolesLookup,
  fakeSubscriptionsProvisioner,
  fakeUsersLookup,
} from './fakes.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp() {
  const users = fakeUsersLookup([{ id: '1', email: 'alice@acme.com', emailVerifiedAt: null }]);
  const companies = fakeCompaniesLookup();
  const roles = fakeRolesLookup();
  const plansLookup = fakePlansLookup({
    'placeholder-full-access': { modules: [{ slug: 'dashboard' }] },
  });
  const subscriptions = fakeSubscriptionsProvisioner();
  const service = new OnboardingService(
    users.lookup,
    companies.lookup,
    roles.lookup,
    plansLookup,
    subscriptions.provisioner
  );
  const controller = new OnboardingController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use('/api', createOnboardingRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, users };
}

describe('onboarding routes (module 5.3, no requireAuth — resolves the user from the token in the body)', () => {
  it('POST /verify-token with a missing token: 422', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/api/verify-token').send({});

    expect(res.status).toBe(422);
  });

  it('POST /verify-token with an invalid token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/api/verify-token').send({ token: 'garbage' });

    expect(res.status).toBe(401);
  });

  it('POST /verify-token with a real token: 200, marks the user verified', async () => {
    const { app, users } = buildApp();
    const token = signVerificationToken({ sub: '1' });

    const res = await request(app).post('/api/verify-token').send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Email verified successfully.' });
    expect(users.state.users.get('1')?.emailVerifiedAt).not.toBeNull();
  });

  it('POST /verify-token twice with the same token: 200 both times (idempotent)', async () => {
    const { app } = buildApp();
    const token = signVerificationToken({ sub: '1' });

    await request(app).post('/api/verify-token').send({ token });
    const res = await request(app).post('/api/verify-token').send({ token });

    expect(res.status).toBe(200);
  });

  it('POST /resend-verification-email with a missing token: 422', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/api/resend-verification-email').send({});

    expect(res.status).toBe(422);
  });

  it('POST /resend-verification-email with an invalid token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/resend-verification-email')
      .send({ token: 'garbage' });

    expect(res.status).toBe(401);
  });

  it('POST /resend-verification-email for a nonexistent user: 404', async () => {
    const { app } = buildApp();
    const token = signVerificationToken({ sub: '999' });

    const res = await request(app).post('/api/resend-verification-email').send({ token });

    expect(res.status).toBe(404);
  });

  it('POST /resend-verification-email with a real token: 200', async () => {
    const { app } = buildApp();
    const token = signVerificationToken({ sub: '1' });

    const res = await request(app).post('/api/resend-verification-email').send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Verification email sent.' });
  });
});
