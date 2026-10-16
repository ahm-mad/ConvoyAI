import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { IngestionRepository } from '../ingestion.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). All access here
 * runs under `runAsSystemAsync` internally (see the repository's own doc
 * comment) — ingestion has no request-context user, so this test never
 * needs `runWithContextAsync` the way tenant-scoped repositories' tests do.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@ingestion-repo-test.example';

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Ingestion Test Co ${label}`, email: `co-${label}${MARK}` },
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

async function seedProtocol(label: string) {
  return rawPrisma.protocols.create({
    data: { name: `Protocol${label}${MARK}`, category: 'transport' },
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
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.protocols.deleteMany({ where: { name: { contains: MARK } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('IngestionRepository (real Postgres)', () => {
  it('tokenExists reflects a created raw_packet_values row', async () => {
    const company = await seedCompany('a');
    const user = await seedUser(company.id, 'a');
    const product = await seedProduct(company.id, user.id, 'a');
    const protocol = await seedProtocol('a');
    const repo = new IngestionRepository(prisma);

    expect(await repo.tokenExists(`tok-a${MARK}`)).toBe(false);

    await repo.create({
      productId: product.id.toString(),
      protocolId: protocol.id.toString(),
      deviceProtocolId: null,
      userId: user.id.toString(),
      jsonBody: { a: 1 },
      deviceIds: [],
      token: `tok-a${MARK}`,
      packetHash: `hash-a${MARK}`,
    });

    expect(await repo.tokenExists(`tok-a${MARK}`)).toBe(true);
  });

  it('findRecentByHash finds a hash created within the window and not one created outside it', async () => {
    const company = await seedCompany('b');
    const user = await seedUser(company.id, 'b');
    const product = await seedProduct(company.id, user.id, 'b');
    const protocol = await seedProtocol('b');
    const repo = new IngestionRepository(prisma);
    const hash = `hash-b${MARK}`;

    expect(await repo.findRecentByHash(hash, 5)).toBeUndefined();

    const created = await repo.create({
      productId: product.id.toString(),
      protocolId: protocol.id.toString(),
      deviceProtocolId: null,
      userId: user.id.toString(),
      jsonBody: { a: 1 },
      deviceIds: [],
      token: undefined,
      packetHash: hash,
    });

    const found = await repo.findRecentByHash(hash, 5);
    expect(found?.id).toBe(created.id);

    // A different hash never matches, regardless of window.
    expect(await repo.findRecentByHash(`${hash}-other`, 5)).toBeUndefined();
  });

  it('findLegacyPlaceholder only matches a row with a null json_body', async () => {
    const company = await seedCompany('c');
    const user = await seedUser(company.id, 'c');
    const product = await seedProduct(company.id, user.id, 'c');
    const protocol = await seedProtocol('c');
    const repo = new IngestionRepository(prisma);

    // `json_body` deliberately omitted, not set to `Prisma.JsonNull` — this
    // matches the real placeholder row `ProductsRepository.createIngestionToken`
    // (module 2.1) actually creates (a genuine SQL NULL, not a JSON-null
    // literal). Using `Prisma.JsonNull` here previously masked a real bug —
    // see `findLegacyPlaceholder`'s doc comment.
    const placeholder = await rawPrisma.raw_packet_values.create({
      data: {
        product_id: product.id,
        protocol_id: protocol.id,
        user_id: user.id,
        token: `tok-c${MARK}`,
      },
    });

    const found = await repo.findLegacyPlaceholder(
      product.id.toString(),
      protocol.id.toString(),
      user.id.toString(),
      `tok-c${MARK}`
    );
    expect(found?.id).toBe(placeholder.id.toString());
    if (!found) throw new Error('expected findLegacyPlaceholder to return the placeholder row');

    await repo.updatePlaceholder(found.id, { real: 'data' }, `hash-c${MARK}`, [`dev-c${MARK}`]);

    // Now that json_body is set, it's no longer a placeholder.
    expect(
      await repo.findLegacyPlaceholder(
        product.id.toString(),
        protocol.id.toString(),
        user.id.toString(),
        `tok-c${MARK}`
      )
    ).toBeUndefined();
  });

  it('createDeviceValue and createDevicePosition write real rows against the (now hypertable) device_values/device_positions tables', async () => {
    const company = await seedCompany('d');
    const user = await seedUser(company.id, 'd');
    const product = await seedProduct(company.id, user.id, 'd');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-d${MARK}`,
        name: 'Sensor',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: user.id,
      },
    });
    const repo = new IngestionRepository(prisma);

    await repo.createDeviceValue(device.id.toString(), device.device_unique_identifier, {
      temp: 21.5,
    });
    await repo.createDevicePosition(device.id.toString(), 40.7128, -74.006, 5, 90);

    const values = await rawPrisma.device_values.findMany({ where: { device_id: device.id } });
    expect(values).toHaveLength(1);
    expect(values[0]?.values).toEqual({ temp: 21.5 });
    expect(values[0]?.created_at).not.toBeNull(); // D-0051's timestamps extension

    const positions = await rawPrisma.device_positions.findMany({
      where: { device_id: device.id },
    });
    expect(positions).toHaveLength(1);
    expect(Number(positions[0]?.latitude)).toBeCloseTo(40.7128, 4);
  });
});
