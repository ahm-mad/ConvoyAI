import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetTelemetryRepository } from '../fleet-telemetry.repository.js';
import type { HourStat } from '../telemetry-rollup.js';

/** Real-Postgres integration test (CONVENTIONS.md "Tests") for the hourly telemetry rollup's repository (D-0194); skips itself when Postgres is unreachable. */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);
const MARK = '@fleet-telemetry-repo-test.example';
const at = (iso: string) => new Date(`${iso}Z`);

const contextFor = (companyId: string): RequestContext => ({
  userId: '1',
  companyId,
  roles: [],
  perms: [],
  jti: 'test',
  exp: Number.MAX_SAFE_INTEGER,
});

async function seedCompany(label: string) {
  const company = await rawPrisma.companies.create({
    data: { name: `Telemetry Test Co ${label}`, email: `co-${label}${MARK}` },
  });
  const user = await rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: company.id,
    },
  });
  const product = await rawPrisma.products.create({
    data: {
      name: `Product ${label}${MARK}`,
      status: 'active',
      company_id: company.id,
      created_by: user.id,
    },
  });
  return { company, user, product };
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
const hour = (h: string, over: Partial<HourStat> = {}): HourStat => ({
  hourStart: at(`2026-09-24T${h}:00:00`),
  packets: 3,
  distanceKm: 12.345,
  movingSeconds: 1800,
  stoppedSeconds: 900,
  maxSpeedKmh: 55.5,
  firstPacketAt: at(`2026-09-24T${h}:01:00`),
  lastPacketAt: at(`2026-09-24T${h}:50:00`),
  ...over,
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);
  const devices = await rawPrisma.devices.findMany({
    where: { device_unique_identifier: { contains: MARK } },
    select: { id: true },
  });
  const vehicles = await rawPrisma.vehicles.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  await rawPrisma.vehicle_hourly_stats.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.device_positions.deleteMany({
    where: { device_id: { in: devices.map(d => d.id) } },
  });
  await rawPrisma.vehicle_device_assignments.deleteMany({
    where: { vehicle_id: { in: vehicles.map(v => v.id) } },
  });
  await rawPrisma.devices.deleteMany({ where: { id: { in: devices.map(d => d.id) } } });
  await rawPrisma.products.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.users.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});
afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe.skipIf(!dbAvailable)('FleetTelemetryRepository (real Postgres)', () => {
  it('assignments, position reads and the per-vehicle watermarks — company-scoped through the vehicle', async () => {
    const a = await seedCompany('a');
    const b = await seedCompany('b');
    const truck = await rawPrisma.vehicles.create({
      data: { company_id: a.company.id, name: `Truck${MARK}` },
    });
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: b.company.id, name: `Foreign${MARK}` },
    });
    const dev = await seedDevice(a.product.id, a.user.id, 'a1');
    const foreignDev = await seedDevice(b.product.id, b.user.id, 'b1');
    await rawPrisma.vehicle_device_assignments.create({
      data: { vehicle_id: truck.id, device_id: dev.id, assigned_at: at('2026-09-24T00:00:00') },
    });
    await rawPrisma.vehicle_device_assignments.create({
      data: {
        vehicle_id: foreign.id,
        device_id: foreignDev.id,
        assigned_at: at('2026-09-24T00:00:00'),
        unassigned_at: at('2026-09-24T20:00:00'),
      },
    });
    const pos = (deviceId: bigint, time: string, lng: number, speed: number | null) =>
      rawPrisma.device_positions.create({
        data: {
          device_id: deviceId,
          latitude: 31.5,
          longitude: lng,
          speed,
          heading: null,
          recorded_at: at(`2026-09-24T${time}`),
        },
      });
    await pos(dev.id, '09:50:00', 74.1, 30);
    await pos(dev.id, '10:10:00', 74.2, null);
    await pos(dev.id, '10:40:00', 74.3, 0);
    await pos(dev.id, '11:20:00', 74.4, 12.5);
    await pos(foreignDev.id, '10:15:00', 1, 1);
    const repo = new FleetTelemetryRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(a.company.id.toString()), fn);

    const spans = await inA(() => repo.allAssignments());
    expect(spans).toEqual([
      {
        vehicleId: truck.id.toString(),
        deviceId: dev.id.toString(),
        assignedAt: at('2026-09-24T00:00:00'),
        unassignedAt: null,
      },
    ]); // the foreign assignment never
    const between = await inA(() =>
      repo.positionsBetween(dev.id.toString(), at('2026-09-24T10:00:00'), at('2026-09-24T11:00:00'))
    );
    expect(between.map(p => [p.at.toISOString().slice(11, 16), p.speed])).toEqual([
      ['10:10', null],
      ['10:40', 0],
    ]); // [from, to), oldest first, a missing speed stays null
    expect(between[0]).toMatchObject({ latitude: 31.5, longitude: 74.2 });
    // context reads: the last / first N packets around a point, oldest first, bounded by `limit`
    const before = await inA(() =>
      repo.positionsBefore(dev.id.toString(), at('2026-09-24T11:00:00'), 2)
    );
    expect(before.map(p => p.at.toISOString().slice(11, 16))).toEqual(['10:10', '10:40']); // the two latest before 11:00, oldest first
    expect(
      (await inA(() => repo.positionsBefore(dev.id.toString(), at('2026-09-24T10:10:00'), 5))).map(
        p => p.at.toISOString().slice(11, 16)
      )
    ).toEqual(['09:50']); // strictly before
    expect(
      await inA(() => repo.positionsBefore(dev.id.toString(), at('2026-09-24T09:00:00'), 5))
    ).toEqual([]);
    const after = await inA(() =>
      repo.positionsAtOrAfter(dev.id.toString(), at('2026-09-24T10:10:00'), 2)
    );
    expect(after.map(p => p.at.toISOString().slice(11, 16))).toEqual(['10:10', '10:40']); // at or after, oldest first, limited
    expect(
      await inA(() => repo.positionsAtOrAfter(dev.id.toString(), at('2026-09-24T12:00:00'), 5))
    ).toEqual([]);
    expect(
      (await inA(() => repo.positionAtOrAfter(dev.id.toString(), at('2026-09-24T10:10:00'))))?.at
    ).toEqual(at('2026-09-24T10:10:00'));
    expect(
      await inA(() => repo.positionAtOrAfter(dev.id.toString(), at('2026-09-24T12:00:00')))
    ).toBeNull();

    // the newest packet per device, in one grouped query (an unknown / foreign device simply has none)
    const newest = await inA(() =>
      repo.newestPositionAt([dev.id.toString(), foreignDev.id.toString(), '999999999'])
    );
    expect(newest.get(dev.id.toString())).toEqual(at('2026-09-24T11:20:00'));
    expect(await inA(() => repo.newestPositionAt([]))).toEqual(new Map());
  });

  it('replaceHours is idempotent and per vehicle; hour reads and the watermarks are tenant-isolated; company_id is forced by the extension', async () => {
    const a = await seedCompany('c');
    const b = await seedCompany('d');
    const truck = await rawPrisma.vehicles.create({
      data: { company_id: a.company.id, name: `Truck${MARK}` },
    });
    const van = await rawPrisma.vehicles.create({
      data: { company_id: a.company.id, name: `Van${MARK}` },
    });
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: b.company.id, name: `Foreign${MARK}` },
    });
    const repo = new FleetTelemetryRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(a.company.id.toString()), fn);
    const inB = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(b.company.id.toString()), fn);
    const from = at('2026-09-24T08:00:00');
    const to = at('2026-09-24T12:00:00');

    await inA(() =>
      repo.replaceHours(truck.id.toString(), from, to, [
        hour('08'),
        hour('09', {
          maxSpeedKmh: null,
          firstPacketAt: null,
          lastPacketAt: null,
          packets: 0,
          movingSeconds: 600,
          stoppedSeconds: 0,
        }),
      ])
    );
    await inA(() =>
      repo.replaceHours(van.id.toString(), from, to, [hour('08', { distanceKm: 1 })])
    );
    await inB(() =>
      repo.replaceHours(foreign.id.toString(), from, to, [hour('08', { distanceKm: 999 })])
    );
    const rows = await inA(() => repo.hourStats(from, to));
    expect(
      rows.map(r => [
        r.vehicleId === truck.id.toString() ? 'truck' : 'van',
        r.hourStart.toISOString().slice(11, 13),
        r.distanceKm,
      ])
    ).toEqual([
      ['truck', '08', 12.345],
      ['van', '08', 1],
      ['truck', '09', 12.345],
    ]); // hour then vehicle order; the foreign row never
    expect(rows[0]).toMatchObject({
      packets: 3,
      movingSeconds: 1800,
      stoppedSeconds: 900,
      maxSpeedKmh: 55.5,
      firstPacketAt: at('2026-09-24T08:01:00'),
      lastPacketAt: at('2026-09-24T08:50:00'),
    });
    expect(rows[2]).toMatchObject({
      packets: 0,
      maxSpeedKmh: null,
      firstPacketAt: null,
      lastPacketAt: null,
    });
    expect(
      (await rawPrisma.vehicle_hourly_stats.findFirst({ where: { vehicle_id: truck.id } }))
        ?.company_id
    ).toBe(a.company.id); // filled from the caller's company

    // replacing the same window again with fewer hours leaves exactly those hours (no duplicates, no stale rows), other vehicles untouched
    await inA(() =>
      repo.replaceHours(truck.id.toString(), from, to, [hour('09', { distanceKm: 7 })])
    );
    await inA(() =>
      repo.replaceHours(truck.id.toString(), from, to, [hour('09', { distanceKm: 7 })])
    );
    const after = await inA(() => repo.hourStats(from, to, [truck.id.toString()]));
    expect(after.map(r => [r.hourStart.toISOString().slice(11, 13), r.distanceKm])).toEqual([
      ['09', 7],
    ]);
    expect((await inA(() => repo.hourStats(from, to, [van.id.toString()]))).length).toBe(1);
    // a window that lies elsewhere is left alone; an empty replacement clears the window
    await inA(() =>
      repo.replaceHours(
        truck.id.toString(),
        at('2026-09-24T10:00:00'),
        at('2026-09-24T11:00:00'),
        []
      )
    );
    expect((await inA(() => repo.hourStats(from, to, [truck.id.toString()]))).length).toBe(1);
    await inA(() => repo.replaceHours(truck.id.toString(), from, to, []));
    expect(await inA(() => repo.hourStats(from, to, [truck.id.toString()]))).toEqual([]);

    // counts, filters by vehicle (a foreign id matches nothing), watermarks
    expect(await inA(() => repo.countHourStats(from, to))).toBe(1);
    expect(await inA(() => repo.countHourStats(from, to, [foreign.id.toString()]))).toBe(0);
    expect(await inA(() => repo.hourStats(from, to, []))).toEqual([]);
    const marks = await inA(() => repo.rolledWatermarks());
    expect([...marks.entries()]).toEqual([
      [
        van.id.toString(),
        { hourStart: at('2026-09-24T08:00:00'), lastPacketAt: at('2026-09-24T08:50:00') },
      ],
    ]);
    expect(await inA(() => repo.latestRolledHour())).toEqual(at('2026-09-24T08:00:00'));
    expect((await inB(() => repo.rolledWatermarks())).size).toBe(1);
  });

  it('the table is a TimescaleDB hypertable with a compression policy (when the extension is present)', async () => {
    const ext = await rawPrisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM pg_extension WHERE extname = 'timescaledb'`;
    if (Number(ext[0]?.n ?? 0) === 0) return;
    const ht = await rawPrisma.$queryRaw<
      { compression_enabled: boolean }[]
    >`SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'vehicle_hourly_stats'`;
    expect(ht[0]?.compression_enabled).toBe(true);
    const jobs = await rawPrisma.$queryRaw<
      { proc_name: string }[]
    >`SELECT proc_name FROM timescaledb_information.jobs WHERE hypertable_name = 'vehicle_hourly_stats'`;
    expect(jobs.map(j => j.proc_name)).toContain('policy_compression');
  });
});
