import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { signIngestionToken } from '../../../platform/crypto/ingestion-token.js';
import { ProductsRepository } from '../../products/products.repository.js';
import { DevicesRepository } from '../../devices/devices.repository.js';
import { ProtocolsRepository } from '../../protocols/protocols.repository.js';
import { IngestionRepository } from '../ingestion.repository.js';
import { IngestionService } from '../ingestion.service.js';
import {
  fakeAssetsLookup,
  fakeGeofencesLookup,
  fakeQueuePort,
  fakeWidgetsLookup,
} from './fakes.js';

/**
 * End-to-end regression suite wiring `IngestionService` to the **real**
 * `ProductsRepository`/`DevicesRepository`/`ProtocolsRepository`, not the
 * fakes in `fakes.ts` — those fakes are plain in-memory stand-ins with no
 * tenant-scoping-context behavior, so they can't catch a real bug this
 * exact composition surfaced during live verification: `ProductsRepository
 * .findById()` requires real request context (`products` is company-
 * ruled), but ingestion authenticates via a token/broker connection, never
 * a JWT session — calling the tenant-scoped method here threw "no request
 * context" on every real packet. Fixed by adding `ProductsRepository
 * .findByIdUnscoped()` (wraps `runAsSystemAsync` internally). This suite
 * exists specifically so a similar missing-`runAsSystemAsync` regression
 * across any of these module boundaries fails a test, not just a live
 * curl call.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@ingestion-service-it-test.example';

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Ingestion Svc Test Co ${label}`, email: `co-${label}${MARK}` },
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
  const testProducts = await rawPrisma.products.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);
  const testDevices = await rawPrisma.devices.findMany({
    where: { product_id: { in: testProductIds } },
    select: { id: true, device_unique_identifier: true },
  });
  const testDeviceIds = testDevices.map(d => d.id);

  await rawPrisma.device_positions.deleteMany({ where: { device_id: { in: testDeviceIds } } });
  await rawPrisma.device_values.deleteMany({
    where: { device_unique_identifier: { in: testDevices.map(d => d.device_unique_identifier) } },
  });
  await rawPrisma.devices.deleteMany({ where: { id: { in: testDeviceIds } } });
  await rawPrisma.raw_packet_values.deleteMany({ where: { product_id: { in: testProductIds } } });
  await rawPrisma.product_attribute_preferences.deleteMany({
    where: { product_id: { in: testProductIds } },
  });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.protocols.deleteMany({ where: { name: { contains: MARK } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)(
  'IngestionService (real repositories, real Postgres — no request context)',
  () => {
    it('ingestHttpPacket succeeds end-to-end with zero request context, exactly like a real device-facing call', async () => {
      const company = await seedCompany('a');
      const user = await seedUser(company.id, 'a');
      const product = await rawPrisma.products.create({
        data: {
          name: `Product a${MARK}`,
          status: 'active',
          company_id: company.id,
          created_by: user.id,
        },
      });
      const protocol = await rawPrisma.protocols.create({
        data: { name: `Protocol${MARK}`, category: 'transport' },
      });
      const device = await rawPrisma.devices.create({
        data: {
          device_unique_identifier: `dev-a${MARK}`,
          name: 'Sensor',
          status: 'active',
          location: '',
          tags: '',
          product_id: product.id,
          user_id: user.id,
        },
      });
      await rawPrisma.product_attribute_preferences.create({
        data: {
          product_id: product.id,
          user_id: user.id,
          attribute_key: 'deviceInfo.uid',
          is_selected: true,
          is_unique_identifier: true,
        },
      });

      const productsRepository = new ProductsRepository(prisma);
      const devicesRepository = new DevicesRepository(prisma);
      const protocolsRepository = new ProtocolsRepository(prisma);
      const ingestionRepository = new IngestionRepository(prisma);
      const queue = fakeQueuePort();
      const service = new IngestionService(
        ingestionRepository,
        productsRepository,
        devicesRepository,
        protocolsRepository,
        queue,
        fakeGeofencesLookup(),
        // No widget/asset fixtures in this Postgres integration test — this module's focus is the
        // dedup/cleaning pipeline (D-0139's widget/building live-update paths have their own unit
        // tests in ingestion.service.test.ts). Both no-op: no matching rows exist for the synthetic
        // device/product created above.
        fakeWidgetsLookup(),
        fakeAssetsLookup()
      );

      const token = signIngestionToken({
        userId: user.id.toString(),
        productId: product.id.toString(),
        protocolId: protocol.id.toString(),
      });
      // The real `get-encrypt-token` issuance flow (module 2.1) writes this
      // placeholder row up front — reproduced by hand here rather than going
      // through the HTTP layer, since this suite's job is the ingestion
      // service's own cross-repository wiring, not module 2.1's endpoint.
      await rawPrisma.raw_packet_values.create({
        data: { product_id: product.id, protocol_id: protocol.id, user_id: user.id, token },
      });

      // No runWithContextAsync/requireAuth anywhere above this line — this
      // is the exact "no request context" scenario a real webhook call is in.
      const first = await service.ingestHttpPacket(token, {
        deviceInfo: { uid: `dev-a${MARK}` },
        temp: 1,
      });
      expect(first.kind).toBe('initial_packet');

      const second = await service.ingestHttpPacket(token, {
        deviceInfo: { uid: `dev-a${MARK}` },
        temp: 2,
      });
      expect(second.kind).toBe('accepted');
      if (second.kind !== 'accepted') throw new Error('expected accepted');

      await service.processIngestionJob({ rawPacketId: second.rawPacketId });

      // Only `deviceInfo.uid` is a configured attribute preference — `temp`
      // was in the raw payload but isn't mapped, so PayloadMapper's `cleaned`
      // (what DeviceValue stores) correctly excludes it.
      const values = await rawPrisma.device_values.findMany({ where: { device_id: device.id } });
      expect(values).toHaveLength(1);
      expect(values[0]?.values).toEqual({ 'deviceInfo.uid': `dev-a${MARK}` });
      expect(queue.ruleActionsJobs).toHaveLength(1);
      expect(queue.ruleActionsJobs[0]?.flattenedPacket).toEqual({
        'deviceInfo.uid': `dev-a${MARK}`,
        temp: 2,
      });
    });
  }
);
