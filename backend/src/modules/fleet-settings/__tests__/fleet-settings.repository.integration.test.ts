import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { applyAuditActors } from '../../../platform/db/audit-actors.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetSettingsRepository } from '../fleet-settings.repository.js';

/** Real-Postgres integration test: the company-ruled `fleet_settings` row (D-0183). */
const rawPrisma = new PrismaClient();
const prisma = applyAuditActors(applyTimestamps(applyTenantScoping(rawPrisma)));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);
const MARK = '@fleet-settings-repo-test.example';

const contextFor = (companyId: string, userId = '1'): RequestContext => ({
  userId,
  companyId,
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});

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

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  await rawPrisma.fleet_settings.deleteMany({
    where: { company_id: { in: companies.map(c => c.id) } },
  });
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companies.map(c => c.id) } } });
});

describe.skipIf(!dbAvailable)('FleetSettingsRepository (real Postgres)', () => {
  it('no row until the first save; upsert creates it with the database defaults, then updates only what was sent; tenant-isolated; targets can be cleared', async () => {
    const a = await rawPrisma.companies.create({
      data: { name: 'Settings Co A', email: `a${MARK}` },
    });
    const b = await rawPrisma.companies.create({
      data: { name: 'Settings Co B', email: `b${MARK}` },
    });
    const userA = await seedUser(a.id, 'a');
    const userB = await seedUser(b.id, 'b');
    const repo = new FleetSettingsRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(a.id.toString(), userA.id.toString()), fn);
    const inB = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(b.id.toString(), userB.id.toString()), fn);

    expect(await inA(() => repo.find())).toBeUndefined();

    const created = await inA(() =>
      repo.upsert({ timezone: 'Asia/Karachi', utilisationTargetPct: 70 })
    );
    expect(created).toMatchObject({
      timezone: 'Asia/Karachi',
      positionFreshnessMinutes: 15, // database default
      idleThresholdMinutes: 5,
      scheduledHoursPerVehiclePerDay: 24,
      onTimeGraceMinutes: 0,
      maintenanceDueSoonDays: 7,
      maintenanceDueSoonKm: 500,
      utilisationTargetPct: 70,
      onTimeTargetPct: null,
      updatedBy: userA.id.toString(), // the audit extension fills it from the request context
    });
    expect(created.updatedAt).not.toBeNull();
    expect(await rawPrisma.fleet_settings.count({ where: { company_id: a.id } })).toBe(1);

    const updated = await inA(() =>
      repo.upsert({
        positionFreshnessMinutes: 30,
        utilisationTargetPct: null,
        scheduledHoursPerVehiclePerDay: 16.5,
      })
    );
    expect(updated.id).toBe(created.id); // same row
    expect(updated).toMatchObject({
      timezone: 'Asia/Karachi',
      positionFreshnessMinutes: 30,
      utilisationTargetPct: null,
      scheduledHoursPerVehiclePerDay: 16.5,
    });
    expect(await rawPrisma.fleet_settings.count({ where: { company_id: a.id } })).toBe(1);

    // company B never sees A's row and gets its own
    expect(await inB(() => repo.find())).toBeUndefined();
    await inB(() => repo.upsert({ timezone: 'UTC' }));
    expect((await inA(() => repo.find()))?.timezone).toBe('Asia/Karachi');
    expect(
      await rawPrisma.fleet_settings.count({ where: { company_id: { in: [a.id, b.id] } } })
    ).toBe(2);
  });

  it('D-0192 (U1): unit_system defaults to metric (database default), changes per company only, keeps the other settings, and the database refuses an unknown value', async () => {
    const a = await rawPrisma.companies.create({
      data: { name: 'Units Co A', email: `ua${MARK}` },
    });
    const b = await rawPrisma.companies.create({
      data: { name: 'Units Co B', email: `ub${MARK}` },
    });
    const userA = await seedUser(a.id, 'ua');
    const userB = await seedUser(b.id, 'ub');
    const repo = new FleetSettingsRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(a.id.toString(), userA.id.toString()), fn);
    const inB = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(b.id.toString(), userB.id.toString()), fn);

    const created = await inA(() => repo.upsert({ timezone: 'Asia/Karachi' })); // no unit sent → the column default
    expect(created.unitSystem).toBe('metric');
    await inB(() => repo.upsert({ timezone: 'UTC' }));

    const us = await inA(() => repo.upsert({ unitSystem: 'us' }));
    expect(us).toMatchObject({ id: created.id, unitSystem: 'us', timezone: 'Asia/Karachi' }); // same row, the other settings untouched
    expect((await inA(() => repo.upsert({ maintenanceDueSoonKm: 800 }))).unitSystem).toBe('us'); // an update that does not send it keeps it
    expect((await inA(() => repo.upsert({ unitSystem: 'uk' }))).unitSystem).toBe('uk');
    expect((await inB(() => repo.find()))?.unitSystem).toBe('metric'); // company B is unaffected
    expect((await inA(() => repo.upsert({ unitSystem: 'metric' }))).unitSystem).toBe('metric');

    // the CHECK constraint of migration 010 is the last line of defence
    await expect(
      rawPrisma.fleet_settings.update({
        where: { id: BigInt(created.id) },
        data: { unit_system: 'imperial' },
      })
    ).rejects.toThrow();
    expect((await inA(() => repo.find()))?.unitSystem).toBe('metric');
  });
});
