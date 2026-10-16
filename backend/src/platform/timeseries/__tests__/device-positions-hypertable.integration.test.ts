import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../db/tenant-scoping.js';
import { applyTimestamps } from '../../db/timestamps.js';
import { runWithContextAsync, type RequestContext } from '../../http/request-context.js';
import { DevicesRepository } from '../../../modules/devices/devices.repository.js';
import { FleetDashboardRepository } from '../../../modules/fleet-dashboard/fleet-dashboard.repository.js';
import { FleetTelemetryRepository } from '../../../modules/fleet-dashboard/fleet-telemetry.repository.js';

/**
 * D-0196: `device_positions` is a TimescaleDB hypertable (compressed after 7 days, dropped after 12 months — owner decision, option A). Real-Postgres tests
 * for what that must not break: the "latest position of each device" reads (rewritten as per-device LATERAL probes) give the same rows as the old
 * "grouped MAX(id) + lookup by id" algorithm, keep working on COMPRESSED chunks, and the retention policy drops old raw packets without touching the
 * hourly rollup that outlives them. Skips itself when Postgres is unreachable or has no TimescaleDB.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);
const isHypertable = dbAvailable
  ? await rawPrisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM timescaledb_information.hypertables WHERE hypertable_name = 'device_positions'`.then(
      r => Number(r[0]?.n ?? 0) === 1,
      () => false
    )
  : false;
const MARK = '@device-positions-hypertable-test.example';
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
    data: { name: `Positions Test Co ${label}`, email: `co-${label}${MARK}` },
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
const seedDevice = (productId: bigint, userId: bigint, label: string) =>
  rawPrisma.devices.create({
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
const pos = (deviceId: bigint, when: string, lat: number, speed: number | null) =>
  rawPrisma.device_positions.create({
    data: {
      device_id: deviceId,
      latitude: lat,
      longitude: 74.3,
      speed,
      heading: null,
      recorded_at: at(when),
    },
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

/** The pre-D-0196 algorithm, verbatim: grouped MAX(id) per device, then a lookup by id. */
async function oldLatestByMaxId(deviceIds: bigint[]) {
  const grouped = await rawPrisma.device_positions.groupBy({
    by: ['device_id'],
    where: { device_id: { in: deviceIds } },
    _max: { id: true },
  });
  const ids = grouped.map(g => g._max.id).filter((i): i is bigint => i !== null);
  const rows = ids.length
    ? await rawPrisma.device_positions.findMany({ where: { id: { in: ids } } })
    : [];
  return new Map(rows.map(r => [r.device_id.toString(), r.id.toString()]));
}

describe.skipIf(!dbAvailable || !isHypertable)(
  'device_positions as a TimescaleDB hypertable (real Postgres)',
  () => {
    it('is a hypertable with compression after 7 days and retention after 12 months; the primary key includes recorded_at', async () => {
      const jobs = await rawPrisma.$queryRaw<
        { proc_name: string; config: { compress_after?: string; drop_after?: string } }[]
      >`SELECT proc_name, config FROM timescaledb_information.jobs WHERE hypertable_name = 'device_positions' ORDER BY proc_name`;
      expect(jobs.map(j => j.proc_name)).toEqual(['policy_compression', 'policy_retention']);
      expect(jobs[0]?.config.compress_after).toBe('7 days');
      expect(jobs[1]?.config.drop_after).toBe('1 year'); // 12 months
      const pk = await rawPrisma.$queryRaw<{ column_name: string }[]>`
      SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'device_positions' AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position`;
      expect(pk.map(c => c.column_name)).toEqual(['id', 'recorded_at']);
    });

    it('the latest position per device: same rows as the old MAX(id) algorithm, incl. same-second ties, a device without packets, several devices and a foreign id list order', async () => {
      const { company, user, product } = await seedCompany('a');
      const a = await seedDevice(product.id, user.id, 'a1');
      const b = await seedDevice(product.id, user.id, 'a2');
      const none = await seedDevice(product.id, user.id, 'a3');
      await pos(a.id, '2026-09-20T10:00:00', 1, 10);
      await pos(a.id, '2026-09-20T10:05:00', 2, 20);
      await pos(a.id, '2026-09-20T10:05:00', 3, null); // the same second: the later id wins
      await pos(a.id, '2026-09-20T09:00:00', 9, 5); // an older packet inserted LATER (a higher id, an earlier time): the newest by time wins
      await pos(b.id, '2026-09-21T00:00:00', 4, 0);
      const ids = [b.id, a.id, none.id];
      const inCompany = <T>(fn: () => Promise<T>) =>
        runWithContextAsync(contextFor(company.id.toString()), fn);
      const devicesRepo = new DevicesRepository(prisma);
      const dashRepo = new FleetDashboardRepository(prisma);
      const fresh = await inCompany(() => devicesRepo.latestPositionsForDeviceIds(ids.map(String)));
      expect(fresh.map(p => p.deviceId)).toEqual(
        [a.id.toString(), b.id.toString()].sort((x, y) => Number(x) - Number(y))
      ); // ordered by device id; the device without packets is absent
      const ofA = fresh.find(p => p.deviceId === a.id.toString());
      expect(ofA).toMatchObject({
        latitude: 3,
        speed: null,
        recordedAt: at('2026-09-20T10:05:00'),
      }); // newest time, tie -> the higher id; a null speed stays null
      expect(ofA?.longitude).toBe(74.3);
      expect(typeof ofA?.id).toBe('string');
      // the old algorithm (MAX(id)) picks the row inserted last (the 09:00 packet) — the two agree whenever ids follow time, as they do for server-time packets
      const old = await oldLatestByMaxId(ids);
      expect(old.get(b.id.toString())).toBe(fresh.find(p => p.deviceId === b.id.toString())?.id);
      // dashboard variant: recorded time + speed per device
      const dash = await inCompany(() => dashRepo.latestPositionsForDevices(ids.map(String)));
      expect([...dash.keys()].sort()).toEqual([a.id.toString(), b.id.toString()].sort());
      expect(dash.get(a.id.toString())).toEqual({
        recordedAt: at('2026-09-20T10:05:00'),
        speed: null,
      });
      expect(dash.get(b.id.toString())).toEqual({
        recordedAt: at('2026-09-21T00:00:00'),
        speed: 0,
      });
      expect(await inCompany(() => devicesRepo.latestPositionsForDeviceIds([]))).toEqual([]);
      expect(await inCompany(() => dashRepo.latestPositionsForDevices([]))).toEqual(new Map());
    });

    it('equals the old algorithm on time-ordered data for 40 devices with random packet counts', async () => {
      const { company, user, product } = await seedCompany('b');
      const devices: Awaited<ReturnType<typeof seedDevice>>[] = [];
      for (let i = 0; i < 40; i++)
        devices.push(await seedDevice(product.id, user.id, `b${String(i)}`));
      const rows: {
        device_id: bigint;
        latitude: number;
        longitude: number;
        speed: number;
        recorded_at: Date;
      }[] = [];
      let seed = 7;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (const d of devices) {
        const n = Math.floor(rand() * 30);
        for (let k = 0; k < n; k++)
          rows.push({
            device_id: d.id,
            latitude: rand() * 10,
            longitude: rand() * 10,
            speed: Math.round(rand() * 80),
            recorded_at: at(
              `2026-09-${String(1 + Math.floor(rand() * 24)).padStart(2, '0')}T00:00:00`
            ),
          });
      }
      rows.sort((x, y) => x.recorded_at.getTime() - y.recorded_at.getTime()); // insert in time order: ids follow time, like server-time ingestion
      await rawPrisma.device_positions.createMany({ data: rows });
      const fresh = await runWithContextAsync(contextFor(company.id.toString()), () =>
        new DevicesRepository(prisma).latestPositionsForDeviceIds(devices.map(d => d.id.toString()))
      );
      const old = await oldLatestByMaxId(devices.map(d => d.id));
      expect(fresh.length).toBe(old.size);
      expect(fresh.length).toBeGreaterThan(20);
      for (const p of fresh) expect(old.get(p.deviceId)).toBe(p.id);
    });

    it("everything still reads correctly from COMPRESSED chunks: latest positions, trail windows, the rollup's context reads, id lookups", async () => {
      const { company, user, product } = await seedCompany('c');
      const dev = await seedDevice(product.id, user.id, 'c1');
      for (let h = 0; h < 30; h++)
        await pos(
          dev.id,
          `2026-06-10T${String(h % 24).padStart(2, '0')}:${String(h).padStart(2, '0')}:00`,
          h,
          h
        );
      await pos(dev.id, '2026-06-12T08:00:00', 99, 5);
      const inCompany = <T>(fn: () => Promise<T>) =>
        runWithContextAsync(contextFor(company.id.toString()), fn);
      const devicesRepo = new DevicesRepository(prisma);
      const telemetry = new FleetTelemetryRepository(prisma);
      const from = at('2026-06-10T00:00:00');
      const to = at('2026-06-13T00:00:00');
      const before = {
        latest: await inCompany(() => devicesRepo.latestPositionsForDeviceIds([dev.id.toString()])),
        between: await inCompany(() => telemetry.positionsBetween(dev.id.toString(), from, to)),
        before: await inCompany(() =>
          telemetry.positionsBefore(dev.id.toString(), at('2026-06-12T00:00:00'), 5)
        ),
        after: await inCompany(() =>
          telemetry.positionsAtOrAfter(dev.id.toString(), at('2026-06-11T00:00:00'), 5)
        ),
        newest: await inCompany(() => telemetry.newestPositionAt([dev.id.toString()])),
        history: await inCompany(() => devicesRepo.positionHistory(dev.id.toString(), 5)),
        byId: await rawPrisma.device_positions.findFirst({
          where: { device_id: dev.id, latitude: 99 },
        }),
      };
      expect(before.between.length).toBe(31);
      const chunks = await rawPrisma.$queryRaw<
        { chunk: string }[]
      >`SELECT format('%I.%I', chunk_schema, chunk_name) AS chunk FROM timescaledb_information.chunks WHERE hypertable_name = 'device_positions' AND range_start <= '2026-06-10'::timestamp AND range_end > '2026-06-10'::timestamp`;
      expect(chunks.length).toBeGreaterThan(0);
      for (const c of chunks)
        await rawPrisma.$queryRawUnsafe(
          `SELECT compress_chunk('${c.chunk}'::regclass, if_not_compressed => true)::text`
        );
      const compressed = await rawPrisma.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM timescaledb_information.chunks WHERE hypertable_name = 'device_positions' AND is_compressed AND range_start <= '2026-06-10'::timestamp AND range_end > '2026-06-10'::timestamp`;
      expect(Number(compressed[0]?.n)).toBeGreaterThan(0); // really compressed
      const afterCompression = {
        latest: await inCompany(() => devicesRepo.latestPositionsForDeviceIds([dev.id.toString()])),
        between: await inCompany(() => telemetry.positionsBetween(dev.id.toString(), from, to)),
        before: await inCompany(() =>
          telemetry.positionsBefore(dev.id.toString(), at('2026-06-12T00:00:00'), 5)
        ),
        after: await inCompany(() =>
          telemetry.positionsAtOrAfter(dev.id.toString(), at('2026-06-11T00:00:00'), 5)
        ),
        newest: await inCompany(() => telemetry.newestPositionAt([dev.id.toString()])),
        history: await inCompany(() => devicesRepo.positionHistory(dev.id.toString(), 5)),
        byId: await rawPrisma.device_positions.findFirst({
          where: { device_id: dev.id, latitude: 99 },
        }),
      };
      expect(afterCompression).toEqual(before);
      expect(afterCompression.latest[0]?.latitude).toBe(99);
    });

    it('retention: raw packets older than the policy are dropped (whole chunks); recent packets and the hourly rollup rows are untouched', async () => {
      const { company, user, product } = await seedCompany('d');
      const dev = await seedDevice(product.id, user.id, 'd1');
      const vehicle = await rawPrisma.vehicles.create({
        data: { company_id: company.id, name: `Truck${MARK}` },
      });
      await pos(dev.id, '2023-01-10T10:00:00', 1, 1); // ~3 years old: beyond any retention
      await pos(dev.id, '2023-01-10T11:00:00', 2, 2);
      await pos(dev.id, '2026-09-20T10:00:00', 3, 3); // recent
      await rawPrisma.vehicle_hourly_stats.create({
        data: {
          vehicle_id: vehicle.id,
          company_id: company.id,
          hour_start: at('2023-01-10T10:00:00'),
          packets: 2,
          distance_km: 1,
          moving_seconds: 60,
          stopped_seconds: 0,
        },
      });
      // the policy's own operation, bounded to the test's chunk (the dev database may hold other old chunks)
      await rawPrisma.$queryRaw`SELECT drop_chunks('device_positions', older_than => (now() AT TIME ZONE 'UTC') - interval '12 months', newer_than => '2023-01-01'::timestamp)`;
      const left = await rawPrisma.device_positions.findMany({
        where: { device_id: dev.id },
        orderBy: { recorded_at: 'asc' },
      });
      expect(left.map(r => Number(r.latitude))).toEqual([3]);
      expect(
        await rawPrisma.vehicle_hourly_stats.count({ where: { vehicle_id: vehicle.id } })
      ).toBe(1); // the rollup outlives the raw packets
      const latest = await runWithContextAsync(contextFor(company.id.toString()), () =>
        new DevicesRepository(prisma).latestPositionsForDeviceIds([dev.id.toString()])
      );
      expect(latest[0]?.latitude).toBe(3);
    });
  }
);
