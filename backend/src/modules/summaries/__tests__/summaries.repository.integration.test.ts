import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { SummariesRepository } from '../summaries.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Golden pairs
 * per the task file's own guidance (`tasks/12-summaries.md`): every
 * expected `avg`/`data_points` value here is hand-computed from the raw
 * `device_values` rows seeded in the same test, not compared against the
 * old (broken, never-ran) Laravel jobs' output — D-0074.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@summaries-repo-test.example';

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Summaries Test Co ${label}`, email: `co-${label}${MARK}` },
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

async function seedValue(
  deviceId: bigint,
  deviceUid: string,
  values: Prisma.InputJsonObject,
  createdAt: Date
) {
  return rawPrisma.device_values.create({
    data: {
      device_id: deviceId,
      device_unique_identifier: deviceUid,
      values,
      created_at: createdAt,
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
  const testProducts = await rawPrisma.products.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);
  const testDevices = await rawPrisma.devices.findMany({
    where: { product_id: { in: testProductIds } },
    select: { id: true, device_unique_identifier: true },
  });
  const testDeviceIds = testDevices.map(d => d.id);

  await rawPrisma.device_value_summaries_hourly.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  await rawPrisma.device_value_summaries_daily.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  await rawPrisma.device_value_summaries_weekly.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  await rawPrisma.device_value_summaries_monthly.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  await rawPrisma.device_values.deleteMany({ where: { device_id: { in: testDeviceIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: testDeviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { email: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('SummariesRepository (real Postgres, D-0074)', () => {
  it("refreshWindow('hourly'): averages numeric attribute values per device+attribute+hour, dropping non-numeric ones — matches 11.8's real key shape (objectJSON.*), not the old bug's object.* filter", async () => {
    const company = await seedCompany('h');
    const user = await seedUser(company.id, 'h');
    const product = await seedProduct(company.id, user.id, 'h');
    const device = await seedDevice(product.id, user.id, 'h');
    const repo = new SummariesRepository(prisma);

    const hourStart = new Date('2026-09-15T10:00:00.000Z');
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.temp': 20, 'objectJSON.status': 'ok' },
      new Date('2026-09-15T10:05:00.000Z')
    );
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.temp': 24, 'objectJSON.status': 'warn' },
      new Date('2026-09-15T10:45:00.000Z')
    );
    // Outside the window entirely — must not be counted.
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.temp': 999 },
      new Date('2026-09-15T11:05:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'hourly',
      window: { start: hourStart, end: new Date('2026-09-15T11:00:00.000Z') },
    });

    const rows = await rawPrisma.device_value_summaries_hourly.findMany({
      where: { device_id: device.id },
      orderBy: { attribute_type: 'asc' },
    });
    // "objectJSON.status" is non-numeric ("ok"/"warn") — never a row; hand-computed avg((20+24)/2) = 22.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attribute_type).toBe('objectJSON.temp');
    expect(rows[0]?.avg).toBe(22);
    expect(rows[0]?.data_points).toBe(2);
    expect(rows[0]?.hour.toISOString()).toBe('2026-09-15T10:00:00.000Z');
  });

  it("refreshWindow('hourly') is idempotent: re-running the same window replaces rather than double-counts", async () => {
    const company = await seedCompany('i');
    const user = await seedUser(company.id, 'i');
    const product = await seedProduct(company.id, user.id, 'i');
    const device = await seedDevice(product.id, user.id, 'i');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.temp': 10 },
      new Date('2026-09-15T10:05:00.000Z')
    );
    const window = {
      start: new Date('2026-09-15T10:00:00.000Z'),
      end: new Date('2026-09-15T11:00:00.000Z'),
    };

    await repo.refreshWindow({ granularity: 'hourly', window });
    await repo.refreshWindow({ granularity: 'hourly', window });

    const rows = await rawPrisma.device_value_summaries_hourly.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_points).toBe(1);
  });

  it("refreshWindow('daily'): computed directly from raw device_values, not hierarchically from the hourly table (D-0074 — no hourly rows seeded here at all)", async () => {
    const company = await seedCompany('d');
    const user = await seedUser(company.id, 'd');
    const product = await seedProduct(company.id, user.id, 'd');
    const device = await seedDevice(product.id, user.id, 'd');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.humidity': 40 },
      new Date('2026-09-15T01:00:00.000Z')
    );
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.humidity': 60 },
      new Date('2026-09-15T20:00:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'daily',
      window: {
        start: new Date('2026-09-15T00:00:00.000Z'),
        end: new Date('2026-09-16T00:00:00.000Z'),
      },
    });

    const rows = await rawPrisma.device_value_summaries_daily.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.avg).toBe(50);
    expect(rows[0]?.data_points).toBe(2);
    expect(rows[0]?.day.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it("refreshWindow('weekly'): label format matches to_char('IYYY-\"W\"IW') — 2026-09-15 falls in ISO week 2026-W38", async () => {
    const company = await seedCompany('w');
    const user = await seedUser(company.id, 'w');
    const product = await seedProduct(company.id, user.id, 'w');
    const device = await seedDevice(product.id, user.id, 'w');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.pressure': 100 },
      new Date('2026-09-15T12:00:00.000Z')
    );
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.pressure': 110 },
      new Date('2026-09-16T12:00:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'weekly',
      window: {
        start: new Date('2026-09-14T00:00:00.000Z'),
        end: new Date('2026-09-21T00:00:00.000Z'),
      },
      weekLabels: ['2026-W38'],
    });

    const rows = await rawPrisma.device_value_summaries_weekly.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.week).toBe('2026-W38');
    expect(rows[0]?.avg).toBe(105);
    expect(rows[0]?.data_points).toBe(2);
  });

  it("refreshWindow('weekly') with no labels is a no-op (never scans device_values)", async () => {
    const company = await seedCompany('z');
    const user = await seedUser(company.id, 'z');
    const product = await seedProduct(company.id, user.id, 'z');
    const device = await seedDevice(product.id, user.id, 'z');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.pressure': 100 },
      new Date('2026-09-15T12:00:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'weekly',
      window: {
        start: new Date('2026-09-14T00:00:00.000Z'),
        end: new Date('2026-09-21T00:00:00.000Z'),
      },
      weekLabels: [],
    });

    const rows = await rawPrisma.device_value_summaries_weekly.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("refreshWindow('weekly')/('monthly') with weekLabels/monthLabels entirely omitted (not just empty) is also a no-op", async () => {
    const repo = new SummariesRepository(prisma);
    const window = {
      start: new Date('2026-09-14T00:00:00.000Z'),
      end: new Date('2026-09-21T00:00:00.000Z'),
    };
    await expect(repo.refreshWindow({ granularity: 'weekly', window })).resolves.toBeUndefined();
    await expect(repo.refreshWindow({ granularity: 'monthly', window })).resolves.toBeUndefined();
  });

  it("refreshWindow('monthly') with no labels is a no-op (never scans device_values)", async () => {
    const company = await seedCompany('n');
    const user = await seedUser(company.id, 'n');
    const product = await seedProduct(company.id, user.id, 'n');
    const device = await seedDevice(product.id, user.id, 'n');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.battery': 80 },
      new Date('2026-09-01T00:30:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'monthly',
      window: {
        start: new Date('2026-09-01T00:00:00.000Z'),
        end: new Date('2026-10-01T00:00:00.000Z'),
      },
      monthLabels: [],
    });

    const rows = await rawPrisma.device_value_summaries_monthly.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("refreshWindow('monthly'): label format matches to_char('YYYY-MM')", async () => {
    const company = await seedCompany('m');
    const user = await seedUser(company.id, 'm');
    const product = await seedProduct(company.id, user.id, 'm');
    const device = await seedDevice(product.id, user.id, 'm');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.battery': 80 },
      new Date('2026-09-01T00:30:00.000Z')
    );
    await seedValue(
      device.id,
      device.device_unique_identifier,
      { 'objectJSON.battery': 60 },
      new Date('2026-09-30T23:30:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'monthly',
      window: {
        start: new Date('2026-09-01T00:00:00.000Z'),
        end: new Date('2026-10-01T00:00:00.000Z'),
      },
      monthLabels: ['2026-09'],
    });

    const rows = await rawPrisma.device_value_summaries_monthly.findMany({
      where: { device_id: device.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.month).toBe('2026-09');
    expect(rows[0]?.avg).toBe(70);
    expect(rows[0]?.data_points).toBe(2);
  });

  it('multiple devices and multiple attributes in the same window each get their own row (no cross-device/cross-attribute bleed)', async () => {
    const company = await seedCompany('x');
    const user = await seedUser(company.id, 'x');
    const product = await seedProduct(company.id, user.id, 'x');
    const deviceA = await seedDevice(product.id, user.id, 'xa');
    const deviceB = await seedDevice(product.id, user.id, 'xb');
    const repo = new SummariesRepository(prisma);

    await seedValue(
      deviceA.id,
      deviceA.device_unique_identifier,
      { 'objectJSON.temp': 10, 'objectJSON.humidity': 30 },
      new Date('2026-09-15T10:10:00.000Z')
    );
    await seedValue(
      deviceB.id,
      deviceB.device_unique_identifier,
      { 'objectJSON.temp': 50 },
      new Date('2026-09-15T10:10:00.000Z')
    );

    await repo.refreshWindow({
      granularity: 'hourly',
      window: {
        start: new Date('2026-09-15T10:00:00.000Z'),
        end: new Date('2026-09-15T11:00:00.000Z'),
      },
    });

    const rowsA = await rawPrisma.device_value_summaries_hourly.findMany({
      where: { device_id: deviceA.id },
      orderBy: { attribute_type: 'asc' },
    });
    const rowsB = await rawPrisma.device_value_summaries_hourly.findMany({
      where: { device_id: deviceB.id },
    });
    expect(rowsA.map(r => [r.attribute_type, r.avg])).toEqual([
      ['objectJSON.humidity', 30],
      ['objectJSON.temp', 10],
    ]);
    expect(rowsB.map(r => [r.attribute_type, r.avg])).toEqual([['objectJSON.temp', 50]]);
  });
});
