import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { UsersRepository } from '../users.repository.js';
import type { CreateMemberInput } from '../users.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"), same
 * skip-if-unreachable convention as this project's other integration
 * suites.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@users-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Users Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: companyId,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const testCompanies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map(c => c.id);
  const testUsers = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testUserIds = testUsers.map(u => u.id);

  await rawPrisma.model_has_roles.deleteMany({
    where: { model_type: 'App\\Domain\\Auth\\Models\\User', model_id: { in: testUserIds } },
  });
  await rawPrisma.members.deleteMany({ where: { company_id: { in: testCompanyIds } } });
  await rawPrisma.roles.deleteMany({ where: { company_id: { in: testCompanyIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('UsersRepository (real Postgres)', () => {
  it('findProfileById/updateProfile work for a user with no company yet (pre-onboarding, D-0045)', async () => {
    const user = await rawPrisma.users.create({
      data: {
        first_name: 'Pending',
        last_name: 'User',
        email: `pending${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: null,
      },
    });
    const repo = new UsersRepository(prisma);

    const profile = await repo.findProfileById(user.id.toString());
    expect(profile?.companyId).toBeNull();

    const updated = await repo.updateProfile(user.id.toString(), {
      firstName: 'Pending',
      lastName: 'Updated',
      email: `pending${MARK}`,
      number: '1',
    });
    expect(updated.lastName).toBe('Updated');
  });

  it("emailTakenByAnotherUser/emailExists see across companies, not just the caller's own (global unique index)", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const userA = await seedUser(companyA.id, 'a');
    await seedUser(companyB.id, 'b');
    const repo = new UsersRepository(prisma);

    expect(await repo.emailExists(`user-b${MARK}`)).toBe(true);
    expect(await repo.emailTakenByAnotherUser(`user-b${MARK}`, userA.id.toString())).toBe(true);
    expect(await repo.emailTakenByAnotherUser(`user-a${MARK}`, userA.id.toString())).toBe(false);
  });

  it("createMember creates a User + model_has_roles link + Member row, scoped to the caller's own company", async () => {
    const company = await seedCompany('c');
    const creator = await seedUser(company.id, 'creator');
    const role = await rawPrisma.roles.create({
      data: { company_id: company.id, name: 'Hr', guard_name: 'api' },
    });
    const repo = new UsersRepository(prisma);
    const input: CreateMemberInput = {
      firstName: 'Grace',
      lastName: 'Hopper',
      number: '555',
      email: `grace${MARK}`,
      address: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      role: 'Hr',
      password: 'longenough',
    };

    const member = await runWithContextAsync(
      contextFor(creator.id.toString(), company.id.toString()),
      () => repo.createMember(input, 'hashed', role.id.toString(), creator.id.toString())
    );

    expect(member.companyId).toBe(company.id.toString());
    expect(member.user.email).toBe(`grace${MARK}`);

    const link = await rawPrisma.model_has_roles.findFirst({
      where: {
        role_id: role.id,
        model_id: BigInt(member.userId),
        model_type: 'App\\Domain\\Auth\\Models\\User',
      },
    });
    expect(link).not.toBeNull();
  });

  it('findMemberById is scoped: a cross-tenant member id returns undefined', async () => {
    const companyA = await seedCompany('d');
    const companyB = await seedCompany('e');
    const creatorB = await seedUser(companyB.id, 'creatorB');
    const roleB = await rawPrisma.roles.create({
      data: { company_id: companyB.id, name: 'Hr', guard_name: 'api' },
    });
    const repo = new UsersRepository(prisma);
    const contextB = contextFor(creatorB.id.toString(), companyB.id.toString());

    const memberB = await runWithContextAsync(contextB, () =>
      repo.createMember(
        {
          firstName: 'Grace',
          lastName: 'Hopper',
          number: '555',
          email: `grace2${MARK}`,
          address: undefined,
          city: undefined,
          state: undefined,
          country: undefined,
          role: 'Hr',
          password: 'longenough',
        },
        'hashed',
        roleB.id.toString(),
        creatorB.id.toString()
      )
    );

    const seenAsA = await runWithContextAsync(contextFor('0', companyA.id.toString()), () =>
      repo.findMemberById(memberB.id)
    );

    expect(seenAsA).toBeUndefined();
  });

  it('bulkDeleteMembersByUserIds deletes the users (members cascade automatically) and their model_has_roles links', async () => {
    const company = await seedCompany('f');
    const creator = await seedUser(company.id, 'creatorF');
    const role = await rawPrisma.roles.create({
      data: { company_id: company.id, name: 'Hr', guard_name: 'api' },
    });
    const repo = new UsersRepository(prisma);
    const context = contextFor(creator.id.toString(), company.id.toString());

    const member = await runWithContextAsync(context, () =>
      repo.createMember(
        {
          firstName: 'Grace',
          lastName: 'Hopper',
          number: '555',
          email: `grace3${MARK}`,
          address: undefined,
          city: undefined,
          state: undefined,
          country: undefined,
          role: 'Hr',
          password: 'longenough',
        },
        'hashed',
        role.id.toString(),
        creator.id.toString()
      )
    );

    const deletedCount = await runWithContextAsync(context, () =>
      repo.bulkDeleteMembersByUserIds([member.userId])
    );

    expect(deletedCount).toBe(1);
    expect(await rawPrisma.users.findUnique({ where: { id: BigInt(member.userId) } })).toBeNull();
    expect(await rawPrisma.members.findUnique({ where: { id: BigInt(member.id) } })).toBeNull();
    expect(
      await rawPrisma.model_has_roles.findFirst({
        where: { model_id: BigInt(member.userId), model_type: 'App\\Domain\\Auth\\Models\\User' },
      })
    ).toBeNull();
  });
});
