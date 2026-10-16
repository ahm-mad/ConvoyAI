import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { hashPassword } from '../../../platform/auth/password.js';
import { AuthController } from '../auth.controller.js';
import { AuthService } from '../auth.service.js';
import { SocialLoginService } from '../social-login.service.js';
import { createAuthRouter } from '../auth.routes.js';
import { fakeAuthRepository, fakeClaimsResolver, fakeRedis } from './fakes.js';
import type { AuthUser } from '../auth.types.js';

vi.mock('../../../platform/mail/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

function buildApp(seedUsers: AuthUser[] = []) {
  const { redis } = fakeRedis();
  const authService = new AuthService(fakeAuthRepository(seedUsers), redis, fakeClaimsResolver());
  const socialLoginService = new SocialLoginService(authService, {
    onboardSocialUser: () => Promise.resolve(),
  });
  const controller = new AuthController(authService, socialLoginService);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(redis));
  app.use(createAuthRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, authService };
}

type Body = Record<string, unknown>;

describe('auth routes (D-0026 envelope: {success, message, errors?})', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /register: 201 with the lean user + access/refresh tokens', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/register').send({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      number: '555',
      password: 'longenough',
      timezone: 'UTC',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      user: { email: 'ada@example.com', email_verified_at: null },
      token_type: 'bearer',
    });
    expect(typeof (res.body as Body)['access_token']).toBe('string');
    expect(typeof (res.body as Body)['refresh_token']).toBe('string');
  });

  it('POST /register: 422 with a field->messages bag on invalid input', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/register').send({ email: 'not-an-email' });

    expect(res.status).toBe(422);
    expect((res.body as Body)['success']).toBe(false);
    expect((res.body as Body)['errors']).toBeTruthy();
  });

  it('POST /login: 200 with packet_issues always [] (D-0030)', async () => {
    const passwordHash = await hashPassword('correct-password');
    const user: AuthUser = {
      id: '1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      number: '555',
      companyId: null,
      status: 'active',
      emailVerifiedAt: new Date(),
      passwordHash,
      socialProvider: null,
    };
    const { app } = buildApp([user]);

    const res = await request(app)
      .post('/login')
      .send({ email: user.email, password: 'correct-password' });

    expect(res.status).toBe(200);
    expect((res.body as Body)['packet_issues']).toEqual([]);
    expect((res.body as Body)['user']).not.toHaveProperty('passwordHash');
  });

  it('POST /login: 200 with the real Laravel eager-load shape (D-0098) — company/roles/companyInfo/role_type', async () => {
    const passwordHash = await hashPassword('correct-password');
    const user: AuthUser = {
      id: '1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      number: '555',
      companyId: '9',
      status: 'active',
      emailVerifiedAt: new Date(),
      passwordHash,
      socialProvider: 'google',
    };
    const company = {
      id: '9',
      name: 'Acme',
      email: 'hello@acme.test',
      address: '1 Main St',
      city: 'Metropolis',
      state: 'NY',
      country: 'US',
      zipCode: '10001',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const roles = [
      {
        id: '5',
        companyId: '9',
        name: 'admin',
        guardName: 'api',
        displayName: null,
        description: null,
        createdBy: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        permissions: [
          {
            id: '3',
            name: 'all-fleet',
            guardName: 'api',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    ];
    const { redis } = fakeRedis();
    const authService = new AuthService(
      fakeAuthRepository([user]),
      redis,
      fakeClaimsResolver({ company, roles })
    );
    const socialLoginService = new SocialLoginService(authService, {
      onboardSocialUser: () => Promise.resolve(),
    });
    const controller = new AuthController(authService, socialLoginService);
    const app = express();
    app.use(express.json());
    app.use(createRequestContextMiddleware(redis));
    app.use(createAuthRouter(controller));
    app.use(createErrorHandler(logger));

    const res = await request(app)
      .post('/login')
      .send({ email: user.email, password: 'correct-password' });

    expect(res.status).toBe(200);
    const body = res.body as Body;
    const responseUser = body['user'] as Body;
    expect(responseUser['social_provider']).toBe('google');
    expect(responseUser['companyInfo']).toBe(true);
    expect(responseUser['role_type']).toBe('admin');
    expect(responseUser['company']).toMatchObject({
      id: 9,
      name: 'Acme',
      email: 'hello@acme.test',
      currency: 'USD',
    }); // D-0162: currency rides along
    expect(responseUser['roles']).toMatchObject([
      {
        id: 5,
        name: 'admin',
        permissions: [{ id: 3, name: 'all-fleet' }],
      },
    ]);
    const rolesArray = responseUser['roles'] as Record<string, unknown>[];
    expect(rolesArray[0]).not.toHaveProperty('guard_name');
    expect(rolesArray[0]).not.toHaveProperty('pivot');
    const permissionsArray = rolesArray[0]?.['permissions'] as Record<string, unknown>[];
    expect(permissionsArray[0]).not.toHaveProperty('guard_name');
    expect(permissionsArray[0]).not.toHaveProperty('pivot');
  });

  it('POST /login: 401 on wrong credentials', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect((res.body as Body)['success']).toBe(false);
  });

  it('POST /logout without a bearer token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/logout').send({});

    expect(res.status).toBe(401);
  });

  it('POST /logout with a valid bearer token: 200, and the token is unusable afterward', async () => {
    const { app } = buildApp();
    const token = signAccessToken({ sub: '1' });

    const res = await request(app).post('/logout').set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Logged out successfully.' });

    // Same token, protected route: no longer authenticated (blacklisted).
    const second = await request(app)
      .post('/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        current_password: 'a',
        new_password: '12345678',
      });
    expect(second.status).toBe(401);
  });

  it('GET /auth/:provider/redirect: 422 for an unsupported provider', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/auth/facebook/redirect');

    expect(res.status).toBe(422);
    expect((res.body as Body)['success']).toBe(false);
  });
});
