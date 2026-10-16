import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { SuperadminRepository } from '../superadmin.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). `users` is
 * `company`-ruled and `subscriptions` is `user`-ruled (`tenant-rules.ts`)
 * — every assertion here also proves `runAsSystemAsync` correctly bypasses
 * the tenant-scoping extension for this genuinely cross-tenant admin
 * query, even when run under a real (non-system) request context.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@superadmin-repo-test';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({ data: { name: `Superadmin IT Co ${label}${MARK}` } });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `superadmin-user-${label}${MARK}`,
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
  const companies = await rawPrisma.companies.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);
  const users = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);
  if (userIds.length > 0) {
    await rawPrisma.subscriptions.deleteMany({ where: { user_id: { in: userIds } } });
  }
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
  if (companyIds.length > 0) {
    await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
  }
});

describe.skipIf(!dbAvailable)('SuperadminRepository (real Postgres)', () => {
  it('totalUsersPerCompany: includes a zero-user company (withCount semantics) and runs cross-tenant even under a real single-company context', async () => {
    const repo = new SuperadminRepository(prisma);
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const userA1 = await seedUser(companyA.id, 'a1');
    await seedUser(companyA.id, 'a2');

    const result = await runWithContextAsync(
      contextFor(userA1.id.toString(), companyA.id.toString()),
      () => repo.totalUsersPerCompany()
    );

    const rowA = result.find(r => r.companyId === companyA.id.toString());
    const rowB = result.find(r => r.companyId === companyB.id.toString());
    expect(rowA?.totalUsers).toBe(2);
    expect(rowB?.totalUsers).toBe(0);
  });

  it('subscriptionStats: total + grouped-by-type counts, cross-tenant even under a real single-user context', async () => {
    const repo = new SuperadminRepository(prisma);
    const company = await seedCompany('c');
    const user1 = await seedUser(company.id, 'c1');
    const user2 = await seedUser(company.id, 'c2');
    await rawPrisma.subscriptions.create({
      data: {
        user_id: user1.id,
        type: 'default',
        stripe_id: `sa-test-1${MARK}`,
        stripe_status: 'active',
      },
    });
    await rawPrisma.subscriptions.create({
      data: {
        user_id: user2.id,
        type: 'premium',
        stripe_id: `sa-test-2${MARK}`,
        stripe_status: 'active',
      },
    });

    const result = await runWithContextAsync(
      contextFor(user1.id.toString(), company.id.toString()),
      () => repo.subscriptionStats()
    );

    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.byType['default']).toBeGreaterThanOrEqual(1);
    expect(result.byType['premium']).toBeGreaterThanOrEqual(1);
  });
});
