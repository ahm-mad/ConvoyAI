import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { UsersController } from '../users.controller.js';
import { UsersService } from '../users.service.js';
import { createUsersRouter } from '../users.routes.js';
import { fakeRoleLookup, fakeUsersRepository } from './fakes.js';
import type { Member, Profile } from '../users.types.js';
import type { Redis } from 'ioredis';
import type { LookedUpCompany } from '../../../platform/auth/company-lookup.js';

vi.mock('../../../platform/storage/r2-storage.js', () => ({
  uploadObject: vi.fn().mockResolvedValue({
    key: 'profile-images/new.png',
    url: 'https://images.example.com/profile-images/new.png',
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  keyFromUrl: () => undefined,
}));

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(
  seedProfiles: Profile[] = [],
  seedMembers: Member[] = [],
  roleIdsByName: Record<string, string> = {},
  companiesById: Record<string, LookedUpCompany> = {}
) {
  const { repository, state } = fakeUsersRepository(seedProfiles, seedMembers);
  const service = new UsersService(repository, fakeRoleLookup(roleIdsByName, companiesById));
  const controller = new UsersController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use(createUsersRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
}

const PROFILE: Profile = {
  id: '1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  number: '555',
  companyId: '1',
  status: 'Active',
  emailVerifiedAt: new Date(),
  profileImage: null,
  timezone: null,
  companyDomain: null,
  socialProvider: null,
  socialProviderId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stripeId: null,
  pmType: null,
  pmLastFour: null,
  trialEndsAt: null,
};

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });

describe('users (profile) routes', () => {
  it('GET /profile with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/profile');

    expect(res.status).toBe(401);
  });

  it('GET /profile: 200 with {success, message, data:{user, user_image}} (closes 11.43 — no user_id param needed or accepted)', async () => {
    const { app } = buildApp([PROFILE]);

    const res = await request(app).get('/profile').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { user: { id: 1, email: 'ada@example.com' }, user_image: null },
    });
  });

  it('GET /profile: 200 with the real Laravel raw-column shape (D-0099) — timezone/profile_image/company_domain/social_provider*/timestamps/company', async () => {
    const profile: Profile = { ...PROFILE, timezone: 'America/New_York', socialProvider: 'google' };
    const company: LookedUpCompany = {
      id: '1',
      name: 'Acme',
      email: 'acme@example.com',
      address: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      country: 'US',
      zipCode: '62704',
      currency: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { app } = buildApp([profile], [], {}, { '1': company });

    const res = await request(app).get('/profile').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const user = (res.body as { data: { user: Record<string, unknown> } }).data.user;
    expect(user['timezone']).toBe('America/New_York');
    expect(user['social_provider']).toBe('google');
    expect(user['company']).toMatchObject({
      id: 1,
      name: 'Acme',
      email: 'acme@example.com',
      currency: 'USD',
    }); // D-0162
  });

  it('POST /profile/{user}/update for a DIFFERENT user id: 403 (closes 11.42)', async () => {
    const { app } = buildApp([PROFILE]);

    const res = await request(app)
      .post('/profile/999/update')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('first_name', 'Ada')
      .field('last_name', 'L')
      .field('number', '555')
      .field('email', 'ada@example.com');

    expect(res.status).toBe(403);
  });

  it("POST /profile/{user}/update for the caller's own id: 200 with {success: <string>, user}", async () => {
    const { app } = buildApp([PROFILE]);

    const res = await request(app)
      .post('/profile/1/update')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('first_name', 'Ada')
      .field('last_name', 'Lovelace II')
      .field('number', '555')
      .field('email', 'ada@example.com');

    expect(res.status).toBe(200);
    const body = res.body as { success: unknown; user: { last_name: string } };
    expect(typeof body.success).toBe('string');
    expect(body.user.last_name).toBe('Lovelace II');
  });

  it('POST /profile/{user}/update with an image file: 200, uploads via r2-storage', async () => {
    const { app } = buildApp([PROFILE]);

    const res = await request(app)
      .post('/profile/1/update')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('first_name', 'Ada')
      .field('last_name', 'Lovelace')
      .field('number', '555')
      .field('email', 'ada@example.com')
      .attach('profile_image', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    const { uploadObject } = await import('../../../platform/storage/r2-storage.js');
    expect(uploadObject).toHaveBeenCalled();
  });
});

describe('users (members) routes', () => {
  it('POST /members: 201 with {success: <string>} only', async () => {
    const { app } = buildApp([], [], { Hr: '10' });

    const res = await request(app).post('/members').set('Authorization', `Bearer ${TOKEN}`).send({
      first_name: 'Grace',
      last_name: 'Hopper',
      number: '555',
      email: 'grace@example.com',
      role: 'Hr',
    });

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['success']);
    expect(typeof body['success']).toBe('string');
  });

  it('POST /members with an unknown role: 404', async () => {
    const { app } = buildApp([], [], {});

    const res = await request(app).post('/members').set('Authorization', `Bearer ${TOKEN}`).send({
      first_name: 'Grace',
      last_name: 'Hopper',
      number: '555',
      email: 'grace@example.com',
      role: 'Nope',
    });

    expect(res.status).toBe(404);
  });

  it('GET /members/{id} for a missing id: 404', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/members/999').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('DELETE /members/bulk-delete: 200 with deleted_count/not_deleted_count', async () => {
    const member: Member = {
      id: '5',
      userId: '1',
      name: 'Grace Hopper',
      address: null,
      city: null,
      state: null,
      country: null,
      companyId: '1',
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        ...PROFILE,
        id: '1',
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        number: '555',
        status: 'Active',
        roles: [],
      },
    };
    const { app } = buildApp([], [member]);

    const res = await request(app)
      .delete('/members/bulk-delete')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ids: [5] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Members deleted successfully',
      deleted_count: 1,
      not_deleted_count: 0,
    });
  });

  it("members routes require auth (no role gate, matches Laravel's apiResource under plain auth:api)", async () => {
    const { app } = buildApp();

    const res = await request(app).get('/members');

    expect(res.status).toBe(401);
  });
});
