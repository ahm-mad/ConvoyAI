import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { RulesRepository } from '../rules.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers the
 * tenant-scoping boundary for both tables this module owns: `rules` is
 * `user`-ruled, `alarms` is `company`-ruled (`tenant-rules.ts`) — plus the
 * D-0060 `severity` enum round-trip and the system-context worker path.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@rules-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Rules Test Co ${label}`, email: `co-${label}${MARK}` },
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

async function seedProduct(companyId: bigint, createdBy: bigint, label: string) {
  return rawPrisma.products.create({
    data: {
      name: `Product ${label}${MARK}`,
      status: 'active',
      company_id: companyId,
      created_by: createdBy,
    },
  });
}

async function seedDevice(productId: bigint, userId: bigint, label: string) {
  return rawPrisma.devices.create({
    data: {
      device_unique_identifier: `dev-${label}${MARK}`,
      name: `Device ${label}`,
      status: 'active',
      location: '',
      tags: '',
      product_id: productId,
      user_id: userId,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const testUsers = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testUserIds = testUsers.map(u => u.id);
  const testCompanies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map(c => c.id);
  const testProducts = await rawPrisma.products.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);
  const testDevices = await rawPrisma.devices.findMany({
    where: { product_id: { in: testProductIds } },
    select: { id: true },
  });
  const testDeviceIds = testDevices.map(d => d.id);
  const testRules = await rawPrisma.rules.findMany({
    where: { user_id: { in: testUserIds } },
    select: { id: true },
  });
  const testRuleIds = testRules.map(r => r.id);

  await rawPrisma.alarms.deleteMany({
    where: { OR: [{ rule_id: { in: testRuleIds } }, { device_id: { in: testDeviceIds } }] },
  });
  await rawPrisma.rules.deleteMany({ where: { id: { in: testRuleIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: testDeviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('RulesRepository (real Postgres, tenant scoping)', () => {
  it("create() sets user_id from the caller's context; severity defaults to 'warning' when omitted", async () => {
    const company = await seedCompany('a');
    const user = await seedUser(company.id, 'a');
    const repo = new RulesRepository(prisma);

    const rule = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.create(user.id.toString(), {
          ruleName: 'Test Rule',
          executionInterval: 60,
          allowRetriggering: true,
          severity: undefined,
          conditions: [],
          actions: { sendEmail: false, sendMessage: false, systemNotification: false },
          emailData: undefined,
          smsData: undefined,
          notificationData: undefined,
          isActive: true,
        })
    );

    expect(rule.userId).toBe(user.id.toString());
    expect(rule.severity).toBe('warning');
    expect(rule.isForRuleBuilder).toBe(true);
  });

  it("rules is user-scoped: findById for another user's rule under the caller's own context returns nothing (extension forces user_id into the WHERE)", async () => {
    const company = await seedCompany('b');
    const owner = await seedUser(company.id, 'b-owner');
    const other = await seedUser(company.id, 'b-other');
    const repo = new RulesRepository(prisma);

    const rule = await runWithContextAsync(
      contextFor(owner.id.toString(), company.id.toString()),
      () =>
        repo.create(owner.id.toString(), {
          ruleName: "Owner's Rule",
          executionInterval: 60,
          allowRetriggering: false,
          severity: 'critical',
          conditions: [],
          actions: { sendEmail: false, sendMessage: false, systemNotification: false },
          emailData: undefined,
          smsData: undefined,
          notificationData: undefined,
          isActive: true,
        })
    );

    const asOther = await runWithContextAsync(
      contextFor(other.id.toString(), company.id.toString()),
      () => repo.findById(rule.id)
    );
    expect(asOther).toBeUndefined();

    const asOwner = await runWithContextAsync(
      contextFor(owner.id.toString(), company.id.toString()),
      () => repo.findById(rule.id)
    );
    expect(asOwner?.id).toBe(rule.id);
  });

  it('alarms is company-scoped: listAlarms for a different company sees nothing, even for the same device/rule ids', async () => {
    const companyA = await seedCompany('c-a');
    const userA = await seedUser(companyA.id, 'c-a');
    const productA = await seedProduct(companyA.id, userA.id, 'c-a');
    const deviceA = await seedDevice(productA.id, userA.id, 'c-a');
    const repo = new RulesRepository(prisma);

    const rule = await runWithContextAsync(
      contextFor(userA.id.toString(), companyA.id.toString()),
      () =>
        repo.create(userA.id.toString(), {
          ruleName: 'Alarm Rule',
          executionInterval: 60,
          allowRetriggering: false,
          severity: 'info',
          conditions: [],
          actions: { sendEmail: false, sendMessage: false, systemNotification: false },
          emailData: undefined,
          smsData: undefined,
          notificationData: undefined,
          isActive: true,
        })
    );

    await repo.createAlarm({
      ruleId: rule.id,
      deviceId: deviceA.id.toString(),
      productId: productA.id.toString(),
      companyId: companyA.id.toString(),
      severity: 'info',
      conditionSnapshot: [],
      triggeredValue: { temp: 99 },
    });

    const asCompanyA = await runWithContextAsync(
      contextFor(userA.id.toString(), companyA.id.toString()),
      () =>
        repo.listAlarms({
          companyId: companyA.id.toString(),
          state: undefined,
          deviceId: undefined,
          page: 1,
          perPage: 10,
        })
    );
    expect(asCompanyA.total).toBe(1);
    expect(asCompanyA.items[0]?.severity).toBe('info');

    const companyB = await seedCompany('c-b');
    const userB = await seedUser(companyB.id, 'c-b');
    const asCompanyB = await runWithContextAsync(
      contextFor(userB.id.toString(), companyB.id.toString()),
      () =>
        repo.listAlarms({
          companyId: companyB.id.toString(),
          state: undefined,
          deviceId: undefined,
          page: 1,
          perPage: 10,
        })
    );
    expect(asCompanyB.total).toBe(0);
  });

  it('worker path (system context): listActiveRuleBuilderRulesForUser/createAlarm/clearAlarms work with no ambient request context', async () => {
    const company = await seedCompany('d');
    const user = await seedUser(company.id, 'd');
    const product = await seedProduct(company.id, user.id, 'd');
    const device = await seedDevice(product.id, user.id, 'd');
    const repo = new RulesRepository(prisma);

    const rule = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.create(user.id.toString(), {
          ruleName: 'Worker Rule',
          executionInterval: 60,
          allowRetriggering: true,
          severity: 'critical',
          conditions: [
            {
              selectedProduct: null,
              selectedAttribute: 'temp',
              selectedCondition: 'greater_than',
              conditionValue: '10',
              logicalOperator: 'and',
            },
          ],
          actions: { sendEmail: false, sendMessage: false, systemNotification: false },
          emailData: undefined,
          smsData: undefined,
          notificationData: undefined,
          isActive: true,
        })
    );

    // No runWithContextAsync wrapper at all — this must work standalone, same as a real BullMQ job handler.
    const activeRules = await repo.listActiveRuleBuilderRulesForUser(user.id.toString());
    expect(activeRules.map(r => r.id)).toContain(rule.id);

    const alarm = await repo.createAlarm({
      ruleId: rule.id,
      deviceId: device.id.toString(),
      productId: product.id.toString(),
      companyId: company.id.toString(),
      severity: rule.severity,
      conditionSnapshot: rule.conditions,
      triggeredValue: { temp: 42 },
    });
    expect(alarm.severity).toBe('critical');

    const existing = await repo.findActiveOrAcknowledgedAlarm(rule.id, device.id.toString());
    expect(existing?.id).toBe(alarm.id);

    const clearedCount = await repo.clearAlarms(rule.id, device.id.toString());
    expect(clearedCount).toBe(1);
    const afterClear = await repo.findActiveOrAcknowledgedAlarm(rule.id, device.id.toString());
    expect(afterClear).toBeUndefined();
  });
});
