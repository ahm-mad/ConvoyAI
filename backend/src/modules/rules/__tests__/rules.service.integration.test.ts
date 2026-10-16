import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { DevicesRepository } from '../../devices/devices.repository.js';
import { UsersRepository } from '../../users/users.repository.js';
import { ProductsRepository } from '../../products/products.repository.js';
import { RulesRepository } from '../rules.repository.js';
import { RulesService } from '../rules.service.js';
import { fakeNotificationsLookup, fakeQueuePort } from './fakes.js';

/**
 * End-to-end regression suite wiring `RulesService` to the **real**
 * `RulesRepository`/`DevicesRepository`/`UsersRepository`/
 * `ProductsRepository`, not the fakes in `fakes.ts` — same reasoning as
 * `ingestion.service.integration.test.ts`:
 * the rule-actions worker has no HTTP request context (a BullMQ job
 * handler, not a JWT session), so every cross-module lookup it calls
 * (`DevicesRepository.findByIdUnscoped`, `UsersRepository.findContactById`)
 * must work standalone. This suite exists specifically so a missing
 * `runAsSystemAsync` regression across any of these module boundaries
 * fails a test, not just a live run.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@rules-service-it-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Rules Svc IT Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '5550001111',
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

describe.skipIf(!dbAvailable)(
  'RulesService + real repositories (rule-actions worker path, no request context)',
  () => {
    it('processRuleActionsJob: matches a real rule, persists a real alarm, and enqueues real actions — zero HTTP/request context anywhere in the call chain', async () => {
      const company = await seedCompany('a');
      const user = await seedUser(company.id, 'a');
      const product = await seedProduct(company.id, user.id, 'a');
      const device = await seedDevice(product.id, user.id, 'a');

      const rulesRepository = new RulesRepository(prisma);
      const devicesRepository = new DevicesRepository(prisma);
      const usersRepository = new UsersRepository(prisma);
      const productsRepository = new ProductsRepository(prisma);
      const queue = fakeQueuePort();
      const service = new RulesService(
        rulesRepository,
        devicesRepository,
        usersRepository,
        productsRepository,
        fakeNotificationsLookup(),
        queue
      );

      const rule = await runWithContextAsync(
        contextFor(user.id.toString(), company.id.toString()),
        () =>
          rulesRepository.create(user.id.toString(), {
            ruleName: 'High Temp',
            executionInterval: 60,
            allowRetriggering: true,
            severity: 'critical',
            conditions: [
              {
                selectedProduct: null,
                selectedAttribute: 'objectJSON.temp',
                selectedCondition: 'greater_than',
                conditionValue: '30',
                logicalOperator: 'and',
              },
            ],
            actions: { sendEmail: true, sendMessage: true, systemNotification: true },
            emailData: { subject: 'Hot!', message: '{{device_name}} is at {{objectJSON.temp}}' },
            smsData: {}, // no `to` — must fall back to the contact's real `number` (D-0065)
            notificationData: { message: 'Hot device {{device_name}}' },
            isActive: true,
          })
      );

      // No runWithContextAsync at all from here — matches how a real BullMQ job handler calls this.
      await service.processRuleActionsJob({
        deviceId: device.id.toString(),
        productId: product.id.toString(),
        userId: user.id.toString(),
        cleanedPacket: { 'objectJSON.temp': 42 },
        flattenedPacket: { 'objectJSON.temp': 42 },
      });

      const alarm = await rulesRepository.findActiveOrAcknowledgedAlarm(
        rule.id,
        device.id.toString()
      );
      expect(alarm?.state).toBe('active');
      expect(alarm?.severity).toBe('critical');
      // Real bug found via live-testing: company_id was always null. Regression-tested
      // here against the real ProductsRepository, not just a fake.
      expect(alarm?.companyId).toBe(company.id.toString());

      // sendEmail with no `to` in emailData falls back to the contact's real email (real UsersRepository.findContactById).
      expect(queue.mailJobs).toHaveLength(1);
      expect(queue.mailJobs[0]?.to).toContain(MARK);
      expect(queue.mailJobs[0]?.html).toContain('Device a is at 42');

      // sendMessage with no `to` in smsData falls back to the contact's real `number` (D-0065).
      expect(queue.smsJobs).toHaveLength(1);
      expect(queue.smsJobs[0]?.to).toBe('5550001111');

      expect(queue.alarmRealtimeJobs).toEqual([
        {
          ruleId: rule.id,
          deviceId: device.id.toString(),
          userId: user.id.toString(),
          state: 'alert',
          message: 'Rule High Temp triggered alert',
        },
      ]);
    });
  }
);
