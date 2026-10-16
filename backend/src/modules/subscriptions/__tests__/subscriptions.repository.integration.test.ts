import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { SubscriptionsRepository } from '../subscriptions.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). `subscriptions`
 * is `user`-ruled (`tenant-rules.ts`) — every assertion here also proves
 * the tenant-scoping extension makes cross-user access structurally
 * impossible for this table, not just checked for.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@subscriptions-repo-test';

function contextFor(userId: string): RequestContext {
  return {
    userId,
    companyId: undefined,
    roles: [],
    perms: [],
    jti: 'test',
    exp: Number.MAX_SAFE_INTEGER,
  };
}

async function seedUser(label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `sub-user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: null,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const users = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);
  if (userIds.length > 0) {
    await rawPrisma.subscriptions.deleteMany({ where: { user_id: { in: userIds } } });
  }
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('SubscriptionsRepository (real Postgres)', () => {
  it("createPlaceholder writes a real row satisfying activeSubscription()'s filter; findActiveForUser finds it", async () => {
    const repo = new SubscriptionsRepository(prisma);
    const user = await seedUser('a');

    const created = await runWithContextAsync(contextFor(user.id.toString()), () =>
      repo.createPlaceholder(user.id.toString())
    );
    expect(created.stripeStatus).toBe('active');
    expect(created.stripeId).toMatch(/^placeholder-/);
    expect(created.stripePrice).toBeNull();
    expect(created.trialEndsAt).toBeNull();

    const found = await runWithContextAsync(contextFor(user.id.toString()), () =>
      repo.findActiveForUser(user.id.toString())
    );
    expect(found?.id).toBe(created.id);
  });

  it('findActiveForUser ignores a canceled subscription (not in the active/trialing filter)', async () => {
    const repo = new SubscriptionsRepository(prisma);
    const user = await seedUser('b');
    await rawPrisma.subscriptions.create({
      data: {
        user_id: user.id,
        type: 'default',
        stripe_id: `placeholder-canceled${MARK}`,
        stripe_status: 'canceled',
      },
    });

    const found = await runWithContextAsync(contextFor(user.id.toString()), () =>
      repo.findActiveForUser(user.id.toString())
    );
    expect(found).toBeUndefined();
  });

  it("cross-user access is structurally impossible — the tenant-scoping extension forces the context's own user_id regardless of the id argument", async () => {
    const repo = new SubscriptionsRepository(prisma);
    const owner = await seedUser('c');
    const other = await seedUser('d');
    const ownersSubscription = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.createPlaceholder(owner.id.toString())
    );

    // Running under `other`'s context, even passing `owner`'s id as the argument, still only ever queries `other`'s own row.
    const foundUnderOther = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.findActiveForUser(owner.id.toString())
    );
    expect(foundUnderOther).toBeUndefined();

    const foundUnderOwner = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.findActiveForUser(other.id.toString())
    );
    expect(foundUnderOwner?.id).toBe(ownersSubscription.id);
  });

  it('createPlaceholder generates a unique stripe_id even for concurrent users (real unique constraint never collides)', async () => {
    const repo = new SubscriptionsRepository(prisma);
    const userA = await seedUser('e');
    const userB = await seedUser('f');

    const [a, b] = await Promise.all([
      runWithContextAsync(contextFor(userA.id.toString()), () =>
        repo.createPlaceholder(userA.id.toString())
      ),
      runWithContextAsync(contextFor(userB.id.toString()), () =>
        repo.createPlaceholder(userB.id.toString())
      ),
    ]);

    expect(a.stripeId).not.toBe(b.stripeId);
  });
});
