import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetDashboardRepository } from '../fleet-dashboard.repository.js';
import { RulesRepository } from '../../rules/rules.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers tenant
 * isolation for the `company`-ruled tables this module reads
 * (`vehicles`/`trips`/`alarms`/`compliance_documents`/`drivers`, all
 * auto-scoped including `groupBy`/`aggregate` — confirmed against
 * `tenant-scoping.ts`'s own `WHERE_FILTER_OPS`), the `fuel_logs`
 * parent-table company join done by hand, and — the highest-value case —
 * **KNOWN_ISSUES 11.1's golden pair**: a real acknowledged alarm with a
 * real `severity` column must not crash the query the way the old app's
 * nonexistent `rule.severity` eager-load did.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-dashboard-repo-test.example';

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Dashboard Test Co ${label}`, email: `co-${label}${MARK}` },
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

async function seedVehicle(companyId: bigint, label: string) {
  return rawPrisma.vehicles.create({
    data: { company_id: companyId, name: `Vehicle ${label}${MARK}` },
  });
}

async function seedDriver(companyId: bigint, label: string) {
  return rawPrisma.drivers.create({
    data: { company_id: companyId, first_name: 'D', last_name: label },
  });
}

async function seedCompletedTrip(
  companyId: bigint,
  vehicleId: bigint,
  driverId: bigint,
  opts: { actualStartAt: Date; distanceKm: number; durationMinutes: number; fuelUsedLiters: number }
) {
  return rawPrisma.trips.create({
    data: {
      company_id: companyId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      status: 'completed',
      planned_start_at: opts.actualStartAt,
      actual_start_at: opts.actualStartAt,
      actual_distance_km: opts.distanceKm,
      actual_duration_minutes: opts.durationMinutes,
      fuel_used_liters: opts.fuelUsedLiters,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
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
  const deviceIds = devices.map(d => d.id);
  const products = await rawPrisma.products.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const productIds = products.map(p => p.id);
  const vehicles = await rawPrisma.vehicles.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map(v => v.id);

  await rawPrisma.alarms.deleteMany({ where: { device_id: { in: deviceIds } } });
  await rawPrisma.rules.deleteMany({
    where: {
      user_id: {
        in: (
          await rawPrisma.users.findMany({
            where: { company_id: { in: companyIds } },
            select: { id: true },
          })
        ).map(u => u.id),
      },
    },
  });
  await rawPrisma.vehicle_device_assignments.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.device_positions.deleteMany({ where: { device_id: { in: deviceIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: deviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: productIds } } });
  await rawPrisma.fuel_logs.deleteMany({ where: { vehicle_id: { in: vehicleIds } } });
  await rawPrisma.trips.deleteMany({ where: { company_id: { in: companyIds } } });
  // D-0189: customers the trips-report test creates (only those of the MARK companies; trips are already gone)
  await rawPrisma.fleet_customers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.compliance_documents.deleteMany({ where: { company_id: { in: companyIds } } });
  // D-0184: rows the scope / aggregate tests create
  const yards = await rawPrisma.yards.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  // D-0187: geofences (and their events) the B9 test creates — only those of the MARK companies, events first
  const geofenceRows = await rawPrisma.geofences.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  await rawPrisma.geofence_events.deleteMany({
    where: { geofence_id: { in: geofenceRows.map(g => g.id) } },
  });
  await rawPrisma.geofences.deleteMany({ where: { company_id: { in: companyIds } } });
  const slots = await rawPrisma.yard_slots.findMany({
    where: { yard_id: { in: yards.map(y => y.id) } },
    select: { id: true },
  });
  await rawPrisma.yard_slot_events.deleteMany({
    where: { yard_slot_id: { in: slots.map(x => x.id) } },
  });
  await rawPrisma.yard_slots.deleteMany({ where: { yard_id: { in: yards.map(y => y.id) } } });
  await rawPrisma.yards.deleteMany({ where: { company_id: { in: companyIds } } });
  const driverRows = await rawPrisma.drivers.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  await rawPrisma.driver_incidents.deleteMany({
    where: { driver_id: { in: driverRows.map(d => d.id) } },
  });
  await rawPrisma.driver_vehicle_assignments.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.vehicle_maintenance_logs.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.users.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetDashboardRepository (real Postgres)', () => {
  it('vehiclesForCompany/vehicleCount: tenant-scoped', async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    await seedVehicle(companyA.id, '1');
    await seedVehicle(companyA.id, '2');
    await seedVehicle(companyB.id, '1');
    const repo = new FleetDashboardRepository(prisma);

    const [vehicles, count] = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      Promise.all([repo.vehiclesForCompany(), repo.vehicleCount()])
    );

    expect(vehicles).toHaveLength(2);
    expect(count).toBe(2);
  });

  it('D-0182 (L1): vehiclesForCompany leaves out retired and sold vehicles (same rule as vehicleCount); in_maintenance stays', async () => {
    const company = await seedCompany('l1');
    await seedVehicle(company.id, 'active');
    await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Vehicle maint${MARK}`,
        lifecycle_status: 'in_maintenance',
      },
    });
    await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Vehicle retired${MARK}`, lifecycle_status: 'retired' },
    });
    await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Vehicle sold${MARK}`, lifecycle_status: 'sold' },
    });
    const repo = new FleetDashboardRepository(prisma);
    const [vehicles, count] = await runWithContextAsync(contextFor(company.id.toString()), () =>
      Promise.all([repo.vehiclesForCompany(), repo.vehicleCount()])
    );
    expect(vehicles.map(v => v.name.replace(MARK, '')).sort()).toEqual([
      'Vehicle active',
      'Vehicle maint',
    ]);
    expect(count).toBe(2);
  });

  it('D-0183 (A1): a trip belongs to the period of its actual start, else its planned start — counts, distance, on-time (with grace), average duration and trend windows agree', async () => {
    const company = await seedCompany('a1');
    const vehicle = await seedVehicle(company.id, '1');
    const driver = await seedDriver(company.id, '1');
    const trip = (data: Record<string, unknown>) =>
      rawPrisma.trips.create({
        data: {
          company_id: company.id,
          vehicle_id: vehicle.id,
          driver_id: driver.id,
          ...data,
        } as never,
      });
    // started inside the range but PLANNED before it (Laravel's planned_start filter would have lost it)
    await trip({
      status: 'completed',
      planned_start_at: new Date('2026-08-31T20:00:00Z'),
      actual_start_at: new Date('2026-09-02T08:00:00Z'),
      planned_end_at: new Date('2026-09-02T10:00:00Z'),
      actual_end_at: new Date('2026-09-02T10:05:00Z'),
      actual_distance_km: 40,
      planned_distance_km: 35,
      actual_duration_minutes: 125,
    });
    // planned inside the range, never started
    await trip({ status: 'planned', planned_start_at: new Date('2026-09-05T08:00:00Z') });
    await trip({ status: 'cancelled', planned_start_at: new Date('2026-09-06T08:00:00Z') });
    // started AFTER the range (planned inside) — belongs to the later period, not this one
    await trip({
      status: 'completed',
      planned_start_at: new Date('2026-09-10T08:00:00Z'),
      actual_start_at: new Date('2026-10-02T08:00:00Z'),
      actual_distance_km: 99,
      actual_duration_minutes: 60,
      planned_end_at: new Date('2026-10-02T09:00:00Z'),
      actual_end_at: new Date('2026-10-02T09:00:00Z'),
    });
    // completed exactly on time
    await trip({
      status: 'completed',
      planned_start_at: new Date('2026-09-03T08:00:00Z'),
      actual_start_at: new Date('2026-09-03T08:00:00Z'),
      planned_end_at: new Date('2026-09-03T10:00:00Z'),
      actual_end_at: new Date('2026-09-03T09:59:00Z'),
      actual_distance_km: 60,
      actual_duration_minutes: 119,
    });
    const repo = new FleetDashboardRepository(prisma);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);

    expect(await inCompany(() => repo.tripStatusCountsInRange(from, to))).toEqual({
      total: 4,
      completed: 2,
      cancelled: 1,
      planned: 1,
    });
    expect(await inCompany(() => repo.tripDistanceAggInRange(from, to))).toEqual({
      plannedKm: 35,
      actualKm: 100,
    });
    expect(await inCompany(() => repo.avgCompletedDurationMinutesInRange(from, to))).toBe(122);
    // on time: trip 1 ended 5 minutes late → late with no grace, on time with a 10-minute grace; trip 2 ended a minute early
    expect(await inCompany(() => repo.onTimeCompletedCountInRange(from, to, 0))).toBe(1);
    expect(await inCompany(() => repo.onTimeCompletedCountInRange(from, to, 10))).toBe(2);
    // D-0186: the sample is the completed trips that have a planned AND an actual end — the planned / cancelled trips and any trip without a plan are not in it
    expect(await inCompany(() => repo.onTimeStatsInRange(from, to, 0))).toEqual({
      onTime: 1,
      sample: 2,
    });
    expect(await inCompany(() => repo.onTimeStatsInRange(from, to, 10))).toEqual({
      onTime: 2,
      sample: 2,
    });
    expect(
      await inCompany(() =>
        repo.tripStatusCountsInWindow(
          new Date('2026-09-02T00:00:00Z'),
          new Date('2026-09-02T23:59:59.999Z')
        )
      )
    ).toEqual({ total: 1, completed: 1, cancelled: 0 });
    expect(
      await inCompany(() =>
        repo.tripStatusCountsInWindow(
          new Date('2026-10-01T00:00:00Z'),
          new Date('2026-10-31T23:59:59.999Z')
        )
      )
    ).toEqual({ total: 1, completed: 1, cancelled: 0 });

    // A2: the distance rows the per-vehicle source classification reads (completed, actual_start in range, with a distance)
    const rows = await inCompany(() => repo.completedTripDistancesInRange(from, to));
    expect(rows.map(r => r.km).sort((a, b) => a - b)).toEqual([40, 60]);
  });

  it('D-0186: completed trips without a planned end are not judged (sample 0); planned vs actual distance is summed over the trips that have BOTH', async () => {
    const company = await seedCompany('d186');
    const vehicle = await seedVehicle(company.id, '1');
    const driver = await seedDriver(company.id, '1');
    const trip = (data: Record<string, unknown>) =>
      rawPrisma.trips.create({
        data: {
          company_id: company.id,
          vehicle_id: vehicle.id,
          driver_id: driver.id,
          status: 'completed',
          actual_start_at: new Date('2026-09-10T08:00:00Z'),
          ...data,
        } as never,
      });
    // three completed trips with NO planned end (the frontend's real case), two with an actual distance, only one of those with a planned distance
    await trip({
      actual_end_at: new Date('2026-09-10T09:00:00Z'),
      actual_distance_km: 62.65,
      planned_distance_km: 50,
    });
    await trip({ actual_end_at: new Date('2026-09-11T09:00:00Z'), actual_distance_km: 81.7 });
    await trip({ actual_end_at: new Date('2026-09-12T09:00:00Z') });
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    expect(await inCompany(() => repo.onTimeStatsInRange(from, to, 0))).toEqual({
      onTime: 0,
      sample: 0,
    });
    // the whole-set sums (unchanged): planned 50 vs actual 144.35 — different sets, which is why the variance uses the next method
    const all = await inCompany(() => repo.tripDistanceAggInRange(from, to));
    expect(all.plannedKm).toBeCloseTo(50, 2);
    expect(all.actualKm).toBeCloseTo(144.35, 2);
    const both = await inCompany(() => repo.tripDistanceVarianceInRange(from, to));
    expect(both.sample).toBe(1);
    expect(both.plannedKm).toBeCloseTo(50, 2);
    expect(both.actualKm).toBeCloseTo(62.65, 2);
    // with a plan added to a second trip, that trip joins the sample
    await trip({
      actual_end_at: new Date('2026-09-13T09:00:00Z'),
      planned_end_at: new Date('2026-09-13T09:30:00Z'),
      actual_distance_km: 20,
      planned_distance_km: 25,
    });
    expect(await inCompany(() => repo.onTimeStatsInRange(from, to, 0))).toEqual({
      onTime: 1,
      sample: 1,
    });
    expect((await inCompany(() => repo.tripDistanceVarianceInRange(from, to))).sample).toBe(2);
  });

  it('D-0183 (A3 / A5): fuel litres convert gallons and read fill_date as the LOCAL dates of the range; fills for the economy carry the odometer', async () => {
    const company = await seedCompany('a3');
    const vehicle = await seedVehicle(company.id, '1');
    const log = (
      fillDate: string,
      volume: number,
      unit: 'liters' | 'gallons',
      extra: Record<string, unknown> = {}
    ) =>
      rawPrisma.fuel_logs.create({
        data: {
          vehicle_id: vehicle.id,
          fill_date: new Date(fillDate),
          volume,
          unit,
          total_cost: volume,
          ...extra,
        },
      });
    await log('2026-09-24', 10, 'liters');
    await log('2026-09-25', 10, 'gallons', { odometer_km: 1200, is_full_tank: true }); // 37.85 L
    await log('2026-09-26', 5, 'liters');
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    // the range is 25 Sept in Karachi: 2026-09-24T19:00Z .. 2026-09-25T18:59:59.999Z — fill_date is a DATE, so only the 25th
    const from = new Date('2026-09-24T19:00:00Z');
    const to = new Date('2026-09-25T18:59:59.999Z');

    const karachi = await inCompany(() => repo.fuelAggInRange(from, to, 'Asia/Karachi'));
    expect(karachi.liters).toBeCloseTo(37.854, 2);
    // the same instants read in UTC cover 24 Sept 19:00 → 25 Sept 18:59: both the 24th and the 25th
    const utc = await inCompany(() => repo.fuelAggInRange(from, to, 'UTC'));
    expect(utc.liters).toBeCloseTo(47.854, 2);
    expect(
      (await inCompany(() => repo.fuelByVehicleInRange(from, to, 'Asia/Karachi'))).get(
        vehicle.id.toString()
      )?.liters
    ).toBeCloseTo(37.854, 2);

    const fills = await inCompany(() =>
      repo.fuelFillsInRange(
        new Date('2026-09-24T00:00:00Z'),
        new Date('2026-09-26T23:59:59.999Z'),
        'UTC'
      )
    );
    expect(fills).toHaveLength(1); // only the log that has an odometer reading
    expect(fills[0]).toMatchObject({ odometerKm: 1200, isFullTank: true });
    expect(fills[0]?.liters).toBeCloseTo(37.854, 2);
  });

  it('D-0183 (A6 / A7): maintenance cost is summed by service_date (local dates, tenant-isolated); only ACTIVE vehicles are in service', async () => {
    const companyA = await seedCompany('a6');
    const companyB = await seedCompany('a6b');
    const active = await seedVehicle(companyA.id, 'active');
    const other = await seedVehicle(companyB.id, 'other');
    await rawPrisma.vehicles.create({
      data: {
        company_id: companyA.id,
        name: `Vehicle maint${MARK}`,
        lifecycle_status: 'in_maintenance',
      },
    });
    await rawPrisma.vehicles.create({
      data: {
        company_id: companyA.id,
        name: `Vehicle retired${MARK}`,
        lifecycle_status: 'retired',
      },
    });
    const service = (vehicleId: bigint, date: string, cost: number) =>
      rawPrisma.vehicle_maintenance_logs.create({
        data: { vehicle_id: vehicleId, service_type: 'oil', service_date: new Date(date), cost },
      });
    await service(active.id, '2026-09-10', 120.5);
    await service(active.id, '2026-09-20', 80);
    await service(active.id, '2026-10-01', 999); // outside
    await service(other.id, '2026-09-10', 555); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(companyA.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    expect(await inA(() => repo.maintenanceCostInRange(from, to))).toBeCloseTo(200.5, 2);
    expect(await inA(() => repo.inServiceVehicleCount())).toBe(1);
    expect(await inA(() => repo.vehicleCount())).toBe(2); // active + in_maintenance (retired / sold are out of the fleet)
  });

  it('D-0184 (B3 / A8): the vehicle scope (category case-insensitive, cost centre, ids, current driver, yard stay) and the per-vehicle maintenance / incident aggregates', async () => {
    const company = await seedCompany('b3');
    const other = await seedCompany('b3o');
    const mk = (name: string, extra: Record<string, unknown> = {}) =>
      rawPrisma.vehicles.create({
        data: { company_id: company.id, name: `${name}${MARK}`, ...extra },
      });
    const truck = await mk('Truck', { vehicle_category: 'Truck', cost_centre: 'North' });
    const van = await mk('Van', { vehicle_category: 'van', cost_centre: 'South' });
    const bare = await mk('Bare');
    await mk('Retired truck', { vehicle_category: 'Truck', lifecycle_status: 'retired' });
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}`, vehicle_category: 'Truck' },
    });
    const driverA = await seedDriver(company.id, 'a');
    const driverB = await seedDriver(company.id, 'b');
    await rawPrisma.driver_vehicle_assignments.create({
      data: { driver_id: driverA.id, vehicle_id: truck.id, assigned_at: new Date('2026-09-01') },
    });
    await rawPrisma.driver_vehicle_assignments.create({
      data: {
        driver_id: driverB.id,
        vehicle_id: van.id,
        assigned_at: new Date('2026-08-01'),
        unassigned_at: new Date('2026-08-15'),
      },
    }); // no longer current
    const yard = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `Yard${MARK}` },
    });
    const slot = await rawPrisma.yard_slots.create({
      data: { yard_id: yard.id, slot_number: 'A1' },
    });
    await rawPrisma.yard_slot_events.create({
      data: { yard_slot_id: slot.id, vehicle_id: van.id, checked_in_at: new Date('2026-09-20') },
    }); // open stay
    await rawPrisma.yard_slot_events.create({
      data: {
        yard_slot_id: slot.id,
        vehicle_id: bare.id,
        checked_in_at: new Date('2026-09-01'),
        checked_out_at: new Date('2026-09-02'),
      },
    }); // closed
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: truck.id,
        service_type: 'oil',
        service_date: new Date('2026-09-10'),
        cost: 40,
      },
    });
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: truck.id,
        service_type: 'tyres',
        service_date: new Date('2026-09-11'),
        cost: 60.5,
      },
    });
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: van.id,
        service_type: 'oil',
        service_date: new Date('2026-10-05'),
        cost: 999,
      },
    }); // outside
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: foreign.id,
        service_type: 'oil',
        service_date: new Date('2026-09-10'),
        cost: 777,
      },
    }); // another company
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: driverA.id,
        vehicle_id: truck.id,
        incident_type: 'speeding',
        severity: 'minor',
        incident_date: new Date('2026-09-12'),
      },
    });
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: driverA.id,
        vehicle_id: truck.id,
        incident_type: 'damage',
        severity: 'severe',
        incident_date: new Date('2026-09-13'),
      },
    });
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: driverA.id,
        vehicle_id: truck.id,
        incident_type: 'old',
        severity: 'minor',
        incident_date: new Date('2026-01-13'),
      },
    }); // outside
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const names = (rows: { name: string }[]) => rows.map(r => r.name.replace(MARK, '')).sort();

    expect(names(await inCompany(() => repo.vehiclesForCompany()))).toEqual([
      'Bare',
      'Truck',
      'Van',
    ]); // retired left out, foreign never
    expect(
      names(await inCompany(() => repo.vehiclesForCompany({ vehicleCategory: 'TRUCK' })))
    ).toEqual(['Truck']);
    expect(
      names(await inCompany(() => repo.vehiclesForCompany({ vehicleCategory: 'van' })))
    ).toEqual(['Van']);
    expect(names(await inCompany(() => repo.vehiclesForCompany({ costCentre: 'South' })))).toEqual([
      'Van',
    ]);
    expect(
      names(
        await inCompany(() =>
          repo.vehiclesForCompany({
            vehicleIds: [bare.id.toString(), van.id.toString(), foreign.id.toString()],
          })
        )
      )
    ).toEqual(['Bare', 'Van']); // a foreign id matches nothing
    expect(
      names(
        await inCompany(() =>
          repo.vehiclesForCompany({ driverIds: [driverA.id.toString(), driverB.id.toString()] })
        )
      )
    ).toEqual(['Truck']); // driver B's assignment ended
    expect(
      names(await inCompany(() => repo.vehiclesForCompany({ yardId: yard.id.toString() })))
    ).toEqual(['Van']); // only the open stay
    expect(
      names(
        await inCompany(() =>
          repo.vehiclesForCompany({ vehicleCategory: 'truck', costCentre: 'South' })
        )
      )
    ).toEqual([]); // filters combine (AND)
    expect(
      (await inCompany(() => repo.vehiclesForCompany({ vehicleCategory: 'Truck' })))[0]?.category
    ).toBe('Truck');

    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const maintenance = await inCompany(() => repo.maintenanceCostByVehicleInRange(from, to));
    expect(maintenance.get(truck.id.toString())).toBeCloseTo(100.5, 2);
    expect(maintenance.has(van.id.toString())).toBe(false);
    expect(maintenance.has(foreign.id.toString())).toBe(false);
    const incidents = await inCompany(() =>
      repo.incidentCountByVehicleInRange([truck.id.toString(), van.id.toString()], from, to)
    );
    expect(incidents.get(truck.id.toString())).toBe(2);
    expect(incidents.has(van.id.toString())).toBe(false);
    expect((await inCompany(() => repo.incidentCountByVehicleInRange([], from, to))).size).toBe(0);
  });

  it('D-0185 (B2): the attention-feed queries — expiring documents / licences, severe incidents, planned trips with an unavailable vehicle or driver, long yard stays, names; all company-scoped', async () => {
    const company = await seedCompany('b2');
    const other = await seedCompany('b2o');
    const truck = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Truck${MARK}` },
    });
    const inMaint = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Maint${MARK}`, lifecycle_status: 'in_maintenance' },
    });
    const retired = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Retired${MARK}`, lifecycle_status: 'retired' },
    });
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}` },
    });
    const ada = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Ada',
        last_name: `Lovelace${MARK}`,
        license_expiry_date: new Date('2026-09-20'),
      },
    });
    const bob = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Bob',
        last_name: `Ray${MARK}`,
        license_expiry_date: new Date('2026-10-10'),
        status: 'suspended',
      },
    });
    const gone = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Old',
        last_name: `Timer${MARK}`,
        license_expiry_date: new Date('2026-01-01'),
        status: 'inactive',
      },
    });
    const far = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Far',
        last_name: `Off${MARK}`,
        license_expiry_date: new Date('2027-06-01'),
      },
    });
    const doc = (type: string, id: bigint, expiry: string) =>
      rawPrisma.compliance_documents.create({
        data: {
          company_id: company.id,
          documentable_type: type,
          documentable_id: id,
          document_type: 'Insurance',
          expiry_date: new Date(expiry),
        },
      });
    await doc('vehicle', truck.id, '2026-09-10'); // expired
    await doc('vehicle', truck.id, '2026-10-15'); // within 30 days of 2026-09-25 (cut-off 2026-10-25)
    await doc('driver', ada.id, '2027-01-01'); // far away
    await rawPrisma.compliance_documents.create({
      data: {
        company_id: other.id,
        documentable_type: 'vehicle',
        documentable_id: foreign.id,
        document_type: 'X',
        expiry_date: new Date('2026-09-01'),
      },
    });
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: ada.id,
        vehicle_id: truck.id,
        incident_type: 'collision',
        severity: 'severe',
        incident_date: new Date('2026-09-22'),
      },
    });
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: ada.id,
        incident_type: 'old',
        severity: 'severe',
        incident_date: new Date('2026-08-01'),
      },
    }); // too old
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: ada.id,
        incident_type: 'scrape',
        severity: 'minor',
        incident_date: new Date('2026-09-24'),
      },
    }); // not severe
    const trip = (
      vehicleId: bigint,
      driverId: bigint,
      plannedStart: string,
      status: 'planned' | 'completed' = 'planned'
    ) =>
      rawPrisma.trips.create({
        data: {
          company_id: company.id,
          vehicle_id: vehicleId,
          driver_id: driverId,
          status,
          planned_start_at: new Date(plannedStart),
        },
      });
    await trip(inMaint.id, ada.id, '2026-09-25T20:00:00Z'); // soon, vehicle in maintenance
    await trip(truck.id, bob.id, '2026-09-26T08:00:00Z'); // soon, driver suspended
    await trip(truck.id, ada.id, '2026-09-30T08:00:00Z'); // too far ahead
    await trip(truck.id, ada.id, '2026-09-25T18:00:00Z', 'completed'); // not planned
    const yard = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `Yard${MARK}` },
    });
    const slot = await rawPrisma.yard_slots.create({
      data: { yard_id: yard.id, slot_number: 'A1' },
    });
    const slot2 = await rawPrisma.yard_slots.create({
      data: { yard_id: yard.id, slot_number: 'A2' },
    });
    await rawPrisma.yard_slot_events.create({
      data: {
        yard_slot_id: slot.id,
        vehicle_id: truck.id,
        checked_in_at: new Date('2026-09-10T00:00:00Z'),
      },
    }); // 15 days, open
    await rawPrisma.yard_slot_events.create({
      data: {
        yard_slot_id: slot2.id,
        vehicle_id: inMaint.id,
        checked_in_at: new Date('2026-09-24T00:00:00Z'),
      },
    }); // recent
    await rawPrisma.yard_slot_events.create({
      data: {
        yard_slot_id: slot2.id,
        vehicle_id: retired.id,
        checked_in_at: new Date('2026-08-01T00:00:00Z'),
      },
    }); // retired vehicle
    await rawPrisma.yard_slot_events.create({
      data: {
        yard_slot_id: slot.id,
        vehicle_id: inMaint.id,
        checked_in_at: new Date('2026-08-01T00:00:00Z'),
        checked_out_at: new Date('2026-08-02T00:00:00Z'),
      },
    }); // closed
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const now = new Date('2026-09-25T12:00:00Z');

    const docs = await inCompany(() => repo.complianceExpiring(30, now));
    expect(docs.map(d => d.expiryDate.toISOString().slice(0, 10))).toEqual([
      '2026-09-10',
      '2026-10-15',
    ]); // ordered, far one and other company's excluded
    expect(docs[0]).toMatchObject({
      documentableType: 'vehicle',
      documentableId: truck.id.toString(),
      documentType: 'Insurance',
    });

    const licences = await inCompany(() => repo.driverLicencesExpiring(30, now));
    expect(licences.map(l => l.name.replace(MARK, ''))).toEqual(['Ada Lovelace', 'Bob Ray']); // the deactivated driver and the far one are left out
    expect(licences[0]?.expiryDate.toISOString().slice(0, 10)).toBe('2026-09-20');

    const incidents = await inCompany(() => repo.severeIncidentsSince(new Date('2026-09-18')));
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incidentType: 'collision',
      vehicleId: truck.id.toString(),
      driverId: ada.id.toString(),
    });
    expect(incidents[0]?.driverName).toBe(`Ada Lovelace${MARK}`);

    const trips = await inCompany(() =>
      repo.plannedTripsStartingBefore(new Date('2026-09-26T12:00:00Z'))
    );
    expect(trips.map(t => [t.vehicleStatus, t.driverStatus])).toEqual([
      ['in_maintenance', 'active'],
      ['active', 'suspended'],
    ]);

    const stays = await inCompany(() => repo.openYardStaysBefore(new Date('2026-09-18T12:00:00Z')));
    expect(stays.map(x => x.vehicleName.replace(MARK, ''))).toEqual(['Truck']); // open + old + not retired
    expect(stays[0]).toMatchObject({ slotNumber: 'A1' });
    expect(stays[0]?.yardName).toBe(`Yard${MARK}`);

    const names = await inCompany(() =>
      repo.vehicleNames([truck.id.toString(), foreign.id.toString()])
    );
    expect([...names.keys()]).toEqual([truck.id.toString()]); // another company's vehicle has no name here
    expect(
      (
        await inCompany(() =>
          repo.driverNames([
            ada.id.toString(),
            gone.id.toString(),
            far.id.toString(),
            bob.id.toString(),
          ])
        )
      ).size
    ).toBe(4);
    expect((await inCompany(() => repo.vehicleNames([]))).size).toBe(0);
  });

  it('D-0185 (B1 / A9): scoped aggregates, point-in-time availability and the companies-with-vehicles list', async () => {
    const company = await seedCompany('b1');
    const a = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `A${MARK}`, vehicle_category: 'Truck' },
    });
    const b = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `B${MARK}`,
        vehicle_category: 'Van',
        lifecycle_status: 'in_maintenance',
      },
    });
    await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `C${MARK}`, lifecycle_status: 'retired' },
    });
    const driver = await seedDriver(company.id, 'b1');
    const mkTrip = (vehicleId: bigint, km: number, minutes: number) =>
      rawRaw(vehicleId, driver.id, km, minutes);
    async function rawRaw(vehicleId: bigint, driverId: bigint, km: number, minutes: number) {
      return rawPrisma.trips.create({
        data: {
          company_id: company.id,
          vehicle_id: vehicleId,
          driver_id: driverId,
          status: 'completed',
          planned_start_at: new Date('2026-09-10T08:00:00Z'),
          actual_start_at: new Date('2026-09-10T08:00:00Z'),
          planned_end_at: new Date('2026-09-10T10:00:00Z'),
          actual_end_at: new Date('2026-09-10T09:00:00Z'),
          actual_distance_km: km,
          actual_duration_minutes: minutes,
        },
      });
    }
    await mkTrip(a.id, 100, 60);
    await mkTrip(b.id, 50, 30);
    await rawPrisma.fuel_logs.create({
      data: {
        vehicle_id: a.id,
        fill_date: new Date('2026-09-11'),
        volume: 10,
        unit: 'liters',
        total_cost: 20,
        odometer_km: 100,
        is_full_tank: true,
      },
    });
    await rawPrisma.fuel_logs.create({
      data: {
        vehicle_id: b.id,
        fill_date: new Date('2026-09-11'),
        volume: 30,
        unit: 'liters',
        total_cost: 60,
      },
    });
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: a.id,
        service_type: 'oil',
        service_date: new Date('2026-09-12'),
        cost: 5,
      },
    });
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: b.id,
        service_type: 'oil',
        service_date: new Date('2026-09-12'),
        cost: 7,
      },
    });
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const onlyA = [a.id.toString()];

    // every scoped aggregate looks at the scoped vehicles only; without a scope it is the whole company (unchanged behaviour)
    expect(await inCompany(() => repo.completedTripsAggInRange(from, to))).toEqual({
      totalMinutes: 90,
      totalKm: 150,
    });
    expect(await inCompany(() => repo.completedTripsAggInRange(from, to, onlyA))).toEqual({
      totalMinutes: 60,
      totalKm: 100,
    });
    expect((await inCompany(() => repo.tripStatusCountsInRange(from, to))).completed).toBe(2);
    expect((await inCompany(() => repo.tripStatusCountsInRange(from, to, onlyA))).completed).toBe(
      1
    );
    expect(await inCompany(() => repo.onTimeCompletedCountInRange(from, to, 0))).toBe(2);
    expect(await inCompany(() => repo.onTimeCompletedCountInRange(from, to, 0, onlyA))).toBe(1);
    expect((await inCompany(() => repo.fuelAggInRange(from, to))).cost).toBe(80);
    expect((await inCompany(() => repo.fuelAggInRange(from, to, 'UTC', onlyA))).cost).toBe(20);
    expect(await inCompany(() => repo.fuelFillsInRange(from, to))).toHaveLength(1); // only fills with an odometer
    expect(
      await inCompany(() => repo.fuelFillsInRange(from, to, 'UTC', [b.id.toString()]))
    ).toHaveLength(0);
    expect(await inCompany(() => repo.maintenanceCostInRange(from, to))).toBe(12);
    expect(await inCompany(() => repo.maintenanceCostInRange(from, to, 'UTC', onlyA))).toBe(5);
    expect(await inCompany(() => repo.inServiceVehicleCount())).toBe(1);
    expect(await inCompany(() => repo.inServiceVehicleCount([b.id.toString()]))).toBe(0); // b is in maintenance

    // availability is a point-in-time count over the fleet (active + in maintenance), scope-aware
    expect(await inCompany(() => repo.availabilityCounts())).toEqual({
      active: 1,
      inMaintenance: 1,
    });
    expect(await inCompany(() => repo.availabilityCounts({ vehicleCategory: 'van' }))).toEqual({
      active: 0,
      inMaintenance: 1,
    });

    // the scheduled status job's company list is read without a company scope
    expect(await repo.companyIdsWithVehicles()).toContain(company.id.toString());
  });

  it('D-0187 (B9): yardsWithSlotCounts / yardStaysTouching — slot counts, the inactive-yard switch, the yard filter, the period rule for stays, tenant isolation', async () => {
    const company = await seedCompany('b9y');
    const other = await seedCompany('b9yo');
    const van = await seedVehicle(company.id, 'van');
    const truck = await seedVehicle(company.id, 'truck');
    const foreignVehicle = await seedVehicle(other.id, 'foreign');
    const main = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `B Main${MARK}` },
    });
    const closed = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `A Closed${MARK}`, is_active: false },
    });
    const foreignYard = await rawPrisma.yards.create({
      data: { company_id: other.id, name: `Foreign${MARK}` },
    });
    const slot1 = await rawPrisma.yard_slots.create({
      data: { yard_id: main.id, slot_number: 'A1' },
    });
    const slot2 = await rawPrisma.yard_slots.create({
      data: { yard_id: main.id, slot_number: 'A2' },
    });
    const slotClosed = await rawPrisma.yard_slots.create({
      data: { yard_id: closed.id, slot_number: 'C1' },
    });
    const slotForeign = await rawPrisma.yard_slots.create({
      data: { yard_id: foreignYard.id, slot_number: 'F1' },
    });
    const stay = (slotId: bigint, vehicleId: bigint, checkedIn: string, checkedOut?: string) =>
      rawPrisma.yard_slot_events.create({
        data: {
          yard_slot_id: slotId,
          vehicle_id: vehicleId,
          checked_in_at: new Date(checkedIn),
          checked_out_at: checkedOut ? new Date(checkedOut) : null,
        },
      });
    // range: 2026-09-10 .. 2026-09-20
    await stay(slot1.id, van.id, '2026-09-01T08:00:00Z'); // open, checked in before the range — still touches it
    await stay(slot2.id, truck.id, '2026-09-12T08:00:00Z', '2026-09-12T20:00:00Z'); // wholly inside
    await stay(slot2.id, van.id, '2026-09-05T08:00:00Z', '2026-09-11T08:00:00Z'); // checked in before, checked out inside
    await stay(slot2.id, truck.id, '2026-09-05T08:00:00Z', '2026-09-06T08:00:00Z'); // wholly before — does not touch
    await stay(slot2.id, van.id, '2026-09-25T08:00:00Z', '2026-09-26T08:00:00Z'); // wholly after — does not touch
    await stay(slotClosed.id, van.id, '2026-09-13T08:00:00Z', '2026-09-14T08:00:00Z'); // in the deactivated yard
    await stay(slotForeign.id, foreignVehicle.id, '2026-09-12T08:00:00Z'); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-10T00:00:00Z');
    const to = new Date('2026-09-20T23:59:59.999Z');

    // yards: active only by default, name order, slot counts, the foreign yard never
    expect(await inCompany(() => repo.yardsWithSlotCounts(false))).toEqual([
      { id: main.id.toString(), name: `B Main${MARK}`, isActive: true, slotsTotal: 2 },
    ]);
    expect(
      (await inCompany(() => repo.yardsWithSlotCounts(true))).map(y => [
        y.name.replace(MARK, ''),
        y.isActive,
        y.slotsTotal,
      ])
    ).toEqual([
      ['A Closed', false, 1],
      ['B Main', true, 2],
    ]);
    expect(
      (await inCompany(() => repo.yardsWithSlotCounts(false, main.id.toString()))).map(y => y.id)
    ).toEqual([main.id.toString()]);
    expect(
      await inCompany(() => repo.yardsWithSlotCounts(true, foreignYard.id.toString()))
    ).toEqual([]); // a foreign yard id matches nothing
    expect(await inCompany(() => repo.yardsWithSlotCounts(false, closed.id.toString()))).toEqual(
      []
    ); // an inactive yard needs include_inactive

    // stays: open ones and the ones checked in / out inside the range; oldest check-in first; only the asked-for yards
    const mainStays = await inCompany(() => repo.yardStaysTouching(from, to, [main.id.toString()]));
    expect(
      mainStays.map(x => [
        x.slotId,
        x.checkedInAt.toISOString().slice(0, 10),
        x.checkedOutAt?.toISOString().slice(0, 10) ?? null,
      ])
    ).toEqual([
      [slot1.id.toString(), '2026-09-01', null],
      [slot2.id.toString(), '2026-09-05', '2026-09-11'],
      [slot2.id.toString(), '2026-09-12', '2026-09-12'],
    ]);
    expect(mainStays.every(x => x.yardId === main.id.toString())).toBe(true);
    expect(mainStays[0]).toMatchObject({ vehicleId: van.id.toString() });
    expect(
      (
        await inCompany(() =>
          repo.yardStaysTouching(from, to, [main.id.toString(), closed.id.toString()])
        )
      ).length
    ).toBe(4);
    expect(await inCompany(() => repo.yardStaysTouching(from, to, []))).toEqual([]);
    // tenant isolation: the foreign company's yard id yields nothing for this company's context...
    expect(
      (await inCompany(() => repo.yardStaysTouching(from, to, [foreignYard.id.toString()]))).map(
        x => x.vehicleId
      )
    ).toEqual([]);
    // ...and the same call in the foreign company's context sees its own open stay
    const foreignCtx = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.yardStaysTouching(from, to, [foreignYard.id.toString()])
    );
    expect(foreignCtx.map(x => x.vehicleId)).toEqual([foreignVehicle.id.toString()]);
  });

  it("D-0187 (B9): countVisibleGeofenceEvents / visibleGeofenceEvents — the events list's alert_on visibility rule, period, filters, tenant isolation", async () => {
    const company = await seedCompany('b9g');
    const other = await seedCompany('b9go');
    const van = await seedVehicle(company.id, 'van');
    const truck = await seedVehicle(company.id, 'truck');
    const foreignVehicle = await seedVehicle(other.id, 'foreign');
    const yard = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `Yard${MARK}` },
    });
    const geofence = (
      companyId: bigint,
      name: string,
      alertOn: 'both' | 'enter' | 'exit',
      yardId?: bigint
    ) =>
      rawPrisma.geofences.create({
        data: {
          company_id: companyId,
          name: `${name}${MARK}`,
          center_latitude: 31.5,
          center_longitude: 74.3,
          radius_m: 300,
          alert_on: alertOn,
          ...(yardId ? { yard_id: yardId } : {}),
        },
      });
    const gBoth = await geofence(company.id, 'Both', 'both', yard.id);
    const gEnter = await geofence(company.id, 'EnterOnly', 'enter');
    const gExit = await geofence(company.id, 'ExitOnly', 'exit');
    const gForeign = await geofence(other.id, 'Foreign', 'both');
    const event = (geofenceId: bigint, vehicleId: bigint, type: 'enter' | 'exit', at: string) =>
      rawPrisma.geofence_events.create({
        data: {
          geofence_id: geofenceId,
          vehicle_id: vehicleId,
          event_type: type,
          occurred_at: new Date(at),
        },
      });
    await event(gBoth.id, van.id, 'enter', '2026-09-12T08:00:00Z');
    await event(gBoth.id, van.id, 'exit', '2026-09-12T09:00:00Z');
    await event(gEnter.id, truck.id, 'enter', '2026-09-13T08:00:00Z'); // visible: alert_on = enter
    await event(gEnter.id, truck.id, 'exit', '2026-09-13T09:00:00Z'); // hidden: alert_on = enter
    await event(gExit.id, truck.id, 'enter', '2026-09-14T08:00:00Z'); // hidden: alert_on = exit
    await event(gExit.id, truck.id, 'exit', '2026-09-14T09:00:00Z'); // visible
    await event(gBoth.id, van.id, 'enter', '2026-09-30T08:00:00Z'); // after the range
    await event(gBoth.id, van.id, 'enter', '2026-09-01T08:00:00Z'); // before the range
    await event(gForeign.id, foreignVehicle.id, 'enter', '2026-09-12T08:00:00Z'); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-10T00:00:00Z');
    const to = new Date('2026-09-20T23:59:59.999Z');
    const brief = (rows: { geofenceName: string; eventType: string }[]) =>
      rows.map(r => `${r.geofenceName.replace(MARK, '')}:${r.eventType}`);

    // the visibility rule: both-geofence shows both types, an enter-only geofence hides its exits, an exit-only one hides its enters; oldest first
    const all = await inCompany(() => repo.visibleGeofenceEvents(from, to, {}));
    expect(brief(all)).toEqual(['Both:enter', 'Both:exit', 'EnterOnly:enter', 'ExitOnly:exit']);
    expect(await inCompany(() => repo.countVisibleGeofenceEvents(from, to, {}))).toBe(4); // the count uses the same rule
    expect(all[0]).toMatchObject({
      geofenceId: gBoth.id.toString(),
      yardId: yard.id.toString(),
      vehicleId: van.id.toString(),
    });
    expect(all[2]?.yardId).toBeNull();
    expect(all[0]?.occurredAt.toISOString()).toBe('2026-09-12T08:00:00.000Z');

    // filters combine with the rule
    expect(
      brief(
        await inCompany(() =>
          repo.visibleGeofenceEvents(from, to, { geofenceId: gEnter.id.toString() })
        )
      )
    ).toEqual(['EnterOnly:enter']);
    expect(
      brief(
        await inCompany(() =>
          repo.visibleGeofenceEvents(from, to, { vehicleId: truck.id.toString() })
        )
      )
    ).toEqual(['EnterOnly:enter', 'ExitOnly:exit']);
    expect(
      brief(
        await inCompany(() => repo.visibleGeofenceEvents(from, to, { yardId: yard.id.toString() }))
      )
    ).toEqual(['Both:enter', 'Both:exit']);
    expect(
      await inCompany(() =>
        repo.countVisibleGeofenceEvents(from, to, {
          vehicleId: van.id.toString(),
          yardId: yard.id.toString(),
        })
      )
    ).toBe(2);
    expect(
      await inCompany(() =>
        repo.countVisibleGeofenceEvents(from, to, {
          geofenceId: gExit.id.toString(),
          vehicleId: van.id.toString(),
        })
      )
    ).toBe(0);

    // the period is inclusive of its own events only
    expect(
      await inCompany(() =>
        repo.countVisibleGeofenceEvents(
          new Date('2026-09-01T00:00:00Z'),
          new Date('2026-09-30T23:59:59.999Z'),
          {}
        )
      )
    ).toBe(6);

    // tenant isolation: another company's geofence id / vehicle id matches nothing here, and its own context sees only its own event
    expect(
      await inCompany(() =>
        repo.countVisibleGeofenceEvents(from, to, { geofenceId: gForeign.id.toString() })
      )
    ).toBe(0);
    expect(
      await inCompany(() =>
        repo.visibleGeofenceEvents(from, to, { vehicleId: foreignVehicle.id.toString() })
      )
    ).toEqual([]);
    const foreignEvents = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.visibleGeofenceEvents(from, to, {})
    );
    expect(brief(foreignEvents)).toEqual(['Foreign:enter']);
  });

  it("D-0189 (B5): the trips-report reads — period rule, tenant isolation, vehicle scope (retired vehicles included), the trip's own driver, customers, names", async () => {
    const company = await seedCompany('b5');
    const other = await seedCompany('b5o');
    const truck = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Truck${MARK}`,
        plate: 'TRK-5',
        vehicle_category: 'Truck',
        cost_centre: 'North',
      },
    });
    const van = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Van${MARK}`,
        vehicle_category: 'van',
        lifecycle_status: 'retired',
      },
    });
    const foreignVehicle = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}`, vehicle_category: 'Truck' },
    });
    const ada = await seedDriver(company.id, 'ada');
    const bob = await seedDriver(company.id, 'bob');
    const foreignDriver = await seedDriver(other.id, 'fd');
    const customer = await rawPrisma.fleet_customers.create({
      data: { company_id: company.id, name: `Acme Ltd${MARK}` },
    });
    const foreignCustomer = await rawPrisma.fleet_customers.create({
      data: { company_id: other.id, name: `Foreign Customer${MARK}` },
    });
    const mk = (
      companyId: bigint,
      vehicleId: bigint,
      driverId: bigint,
      data: Record<string, unknown>
    ) =>
      rawPrisma.trips.create({
        data: {
          company_id: companyId,
          vehicle_id: vehicleId,
          driver_id: driverId,
          ...data,
        } as never,
      });
    // range: 2026-09-10 .. 2026-09-20
    const t1 = await mk(company.id, truck.id, ada.id, {
      status: 'completed',
      fleet_customer_id: customer.id,
      trip_reference: 'T-1',
      planned_start_at: new Date('2026-09-11T08:00:00Z'),
      actual_start_at: new Date('2026-09-11T08:05:00Z'),
      planned_end_at: new Date('2026-09-11T10:00:00Z'),
      actual_end_at: new Date('2026-09-11T10:20:00Z'),
      planned_distance_km: 50.5,
      actual_distance_km: 55.25,
      actual_duration_minutes: 135.5,
    });
    const t2 = await mk(company.id, van.id, bob.id, {
      status: 'cancelled',
      planned_start_at: new Date('2026-09-12T08:00:00Z'),
      cancellation_reason: 'No driver',
    }); // planned only, retired vehicle
    await mk(company.id, truck.id, ada.id, {
      status: 'completed',
      planned_start_at: new Date('2026-09-15T08:00:00Z'),
      actual_start_at: new Date('2026-08-01T08:00:00Z'),
    }); // planned inside, STARTED before → not this period
    await mk(company.id, truck.id, ada.id, {
      status: 'planned',
      planned_start_at: new Date('2026-10-15T08:00:00Z'),
    }); // after the range
    await mk(other.id, foreignVehicle.id, foreignDriver.id, {
      status: 'completed',
      fleet_customer_id: foreignCustomer.id,
      planned_start_at: new Date('2026-09-12T08:00:00Z'),
      actual_start_at: new Date('2026-09-12T08:00:00Z'),
    }); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-10T00:00:00Z');
    const to = new Date('2026-09-20T23:59:59.999Z');
    const ids = async (filter: Parameters<FleetDashboardRepository['tripsForReport']>[2]) =>
      (await inCompany(() => repo.tripsForReport(from, to, filter))).map(r => r.id);

    expect(await ids({})).toEqual([t1.id.toString(), t2.id.toString()]);
    expect(await inCompany(() => repo.countTripsForReport(from, to, {}))).toBe(2);
    const rows = await inCompany(() => repo.tripsForReport(from, to, {}));
    expect(rows[0]).toMatchObject({
      reference: 'T-1',
      status: 'completed',
      vehicleId: truck.id.toString(),
      driverId: ada.id.toString(),
      customerId: customer.id.toString(),
      plannedDistanceKm: 50.5,
      actualDistanceKm: 55.25,
      durationMinutes: 135.5,
      cancellationReason: null,
    });
    expect(rows[0]?.plannedEndAt?.toISOString()).toBe('2026-09-11T10:00:00.000Z');
    expect(rows[1]).toMatchObject({
      status: 'cancelled',
      actualStartAt: null,
      customerId: null,
      cancellationReason: 'No driver',
      actualDistanceKm: null,
    });

    // filters (a foreign id matches nothing; an empty vehicle list = a scope that matched nothing)
    expect(await ids({ vehicleIds: [truck.id.toString()] })).toEqual([t1.id.toString()]);
    expect(await ids({ vehicleIds: [truck.id.toString(), foreignVehicle.id.toString()] })).toEqual([
      t1.id.toString(),
    ]);
    expect(await ids({ vehicleIds: [foreignVehicle.id.toString()] })).toEqual([]);
    expect(await ids({ vehicleIds: [] })).toEqual([]);
    expect(await ids({ driverIds: [bob.id.toString()] })).toEqual([t2.id.toString()]); // the TRIP's driver
    expect(await ids({ driverIds: [foreignDriver.id.toString()] })).toEqual([]);
    expect(await ids({ customerIds: [customer.id.toString()] })).toEqual([t1.id.toString()]);
    expect(await ids({ customerIds: [foreignCustomer.id.toString()] })).toEqual([]);
    expect(
      await inCompany(() => repo.countTripsForReport(from, to, { driverIds: [ada.id.toString()] }))
    ).toBe(1);
    expect(
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.countTripsForReport(from, to, {})
      )
    ).toBe(1); // the foreign company sees only its own

    // scope → vehicle ids: retired vehicles ARE included (their trips are history), the foreign vehicle never; no restriction → undefined
    expect(await inCompany(() => repo.vehicleIdsForScope({}))).toBeUndefined();
    expect(await inCompany(() => repo.vehicleIdsForScope({ vehicleCategory: 'TRUCK' }))).toEqual([
      truck.id.toString(),
    ]);
    expect(await inCompany(() => repo.vehicleIdsForScope({ vehicleCategory: 'van' }))).toEqual([
      van.id.toString(),
    ]);
    expect(await inCompany(() => repo.vehicleIdsForScope({ costCentre: 'North' }))).toEqual([
      truck.id.toString(),
    ]);
    expect(
      await inCompany(() => repo.vehicleIdsForScope({ vehicleIds: [foreignVehicle.id.toString()] }))
    ).toEqual([]);
    expect(
      (await inCompany(() => repo.vehiclesForCompany({ vehicleCategory: 'van' }))).length
    ).toBe(0); // the fleet view still leaves the retired van out

    // names
    const briefs = await inCompany(() =>
      repo.vehicleBriefs([truck.id.toString(), van.id.toString(), foreignVehicle.id.toString()])
    );
    expect([...briefs.keys()].sort()).toEqual([truck.id.toString(), van.id.toString()].sort());
    expect(briefs.get(truck.id.toString())).toEqual({ name: `Truck${MARK}`, plate: 'TRK-5' });
    const names = await inCompany(() =>
      repo.customerNames([customer.id.toString(), foreignCustomer.id.toString()])
    );
    expect([...names.keys()]).toEqual([customer.id.toString()]);
    expect((await inCompany(() => repo.customerNames([]))).size).toBe(0);
  });

  it('D-0190 (B6): the fuel-report reads — local-date period, gallons converted, tank capacity, vehicle scope, tenant isolation', async () => {
    const company = await seedCompany('b6');
    const other = await seedCompany('b6o');
    const truck = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Truck${MARK}`,
        plate: 'TRK-6',
        vehicle_category: 'Truck',
        tank_capacity_liters: 60,
      },
    });
    const van = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Van${MARK}`,
        vehicle_category: 'van',
        lifecycle_status: 'retired',
      },
    }); // no tank capacity; retired vehicles' fills are history
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}`, tank_capacity_liters: 10 },
    });
    const mk = (
      vehicleId: bigint,
      date: string,
      volume: number,
      unit: 'liters' | 'gallons',
      extra: Record<string, unknown> = {}
    ) =>
      rawPrisma.fuel_logs.create({
        data: { vehicle_id: vehicleId, fill_date: new Date(date), volume, unit, ...extra },
      });
    const f1 = await mk(truck.id, '2026-09-05', 50, 'liters', {
      total_cost: 100,
      cost: 5,
      unit_price: 2,
      odometer_km: 1200.5,
      is_full_tank: true,
      vendor: 'Shell',
      payment_method: 'card',
      station_name: 'North',
      receipt_reference: 'R-1',
    });
    const f2 = await mk(van.id, '2026-09-10', 10, 'gallons', { cost: 40, is_full_tank: false });
    await mk(truck.id, '2026-08-01', 10, 'liters'); // before the range
    await mk(truck.id, '2026-10-01', 10, 'liters'); // after
    await mk(foreign.id, '2026-09-07', 999, 'liters', { total_cost: 999 }); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const rows = await inCompany(() => repo.fuelFillsForReport(from, to, 'UTC'));
    expect(rows.map(r => r.id)).toEqual([f1.id.toString(), f2.id.toString()]); // oldest first, the other company's and the out-of-range fills never
    expect(rows[0]).toMatchObject({
      vehicleId: truck.id.toString(),
      volume: 50,
      unit: 'liters',
      liters: 50,
      cost: 5,
      totalCost: 100,
      unitPrice: 2,
      odometerKm: 1200.5,
      isFullTank: true,
      vendor: 'Shell',
      paymentMethod: 'card',
      stationName: 'North',
      receiptReference: 'R-1',
      tripId: null,
    });
    expect(rows[0]?.vehicle).toEqual({
      name: `Truck${MARK}`,
      plate: 'TRK-6',
      category: 'Truck',
      tankCapacityLiters: 60,
    });
    expect(rows[1]).toMatchObject({
      unit: 'gallons',
      volume: 10,
      cost: 40,
      totalCost: null,
      isFullTank: false,
    });
    expect(rows[1]?.liters).toBeCloseTo(37.854, 3); // 10 US gallons
    expect(rows[1]?.vehicle).toMatchObject({ category: 'van', tankCapacityLiters: null });
    expect(await inCompany(() => repo.countFuelFillsForReport(from, to, 'UTC'))).toBe(2);

    // vehicle scope (a foreign vehicle id matches nothing; an empty list = a scope that matched nothing)
    expect(
      (
        await inCompany(() =>
          repo.fuelFillsForReport(from, to, 'UTC', [truck.id.toString(), foreign.id.toString()])
        )
      ).map(r => r.id)
    ).toEqual([f1.id.toString()]);
    expect(
      await inCompany(() => repo.fuelFillsForReport(from, to, 'UTC', [foreign.id.toString()]))
    ).toEqual([]);
    expect(await inCompany(() => repo.countFuelFillsForReport(from, to, 'UTC', []))).toBe(0);
    // fill_date is a DATE: the range is read as LOCAL calendar dates — 25 Sept in Karachi is 24 Sept 19:00Z .. 25 Sept 18:59Z, and holds no fill of this company
    expect(
      await inCompany(() =>
        repo.countFuelFillsForReport(
          new Date('2026-09-04T19:00:00Z'),
          new Date('2026-09-05T18:59:59.999Z'),
          'Asia/Karachi'
        )
      )
    ).toBe(1); // the 5 Sept fill = 5 Sept local
    expect(
      await inCompany(() =>
        repo.countFuelFillsForReport(
          new Date('2026-09-05T19:00:00Z'),
          new Date('2026-09-06T18:59:59.999Z'),
          'Asia/Karachi'
        )
      )
    ).toBe(0);
    // tenant isolation
    const foreignRows = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.fuelFillsForReport(from, to, 'UTC')
    );
    expect(foreignRows.map(r => r.vehicleId)).toEqual([foreign.id.toString()]);
    expect(foreignRows[0]?.vehicle.tankCapacityLiters).toBe(10);
  });

  it('D-0191 (B7): the maintenance / compliance report reads — local-date period, tenant isolation, deactivated drivers left out', async () => {
    const company = await seedCompany('b7');
    const other = await seedCompany('b7o');
    const truck = await rawPrisma.vehicles.create({
      data: {
        company_id: company.id,
        name: `Truck${MARK}`,
        plate: 'TRK-7',
        vehicle_category: 'Truck',
      },
    });
    const van = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Van${MARK}`, lifecycle_status: 'retired' },
    }); // retired vehicles keep their history
    const foreign = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}` },
    });
    const mk = (vehicleId: bigint, type: string, date: string, cost: number | null) =>
      rawPrisma.vehicle_maintenance_logs.create({
        data: {
          vehicle_id: vehicleId,
          service_type: type,
          service_date: new Date(date),
          ...(cost === null ? {} : { cost }),
        },
      });
    const l1 = await mk(truck.id, 'Oil', '2026-09-05', 40.5);
    const l2 = await mk(van.id, 'Brakes', '2026-09-10', null);
    await mk(truck.id, 'Old', '2026-08-01', 1); // before the range
    await mk(truck.id, 'Later', '2026-10-01', 1); // after
    await mk(foreign.id, 'Oil', '2026-09-07', 999); // another company
    const ada = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Ada',
        last_name: `Lovelace${MARK}`,
        license_number: 'L-1',
        license_expiry_date: new Date('2026-12-01'),
      },
    });
    await rawPrisma.drivers.create({
      data: { company_id: company.id, first_name: 'No', last_name: `Date${MARK}` },
    }); // no licence date: listed with a null expiry
    await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Gone',
        last_name: `Away${MARK}`,
        status: 'inactive',
        license_expiry_date: new Date('2026-01-01'),
      },
    }); // deactivated: left out
    await rawPrisma.drivers.create({
      data: {
        company_id: other.id,
        first_name: 'Foreign',
        last_name: `Driver${MARK}`,
        license_expiry_date: new Date('2026-02-01'),
      },
    });
    const doc = (
      companyId: bigint,
      type: string,
      ownerId: bigint,
      documentType: string,
      expiry: string | null,
      number?: string
    ) =>
      rawPrisma.compliance_documents.create({
        data: {
          company_id: companyId,
          documentable_type: type,
          documentable_id: ownerId,
          document_type: documentType,
          ...(expiry ? { expiry_date: new Date(expiry) } : {}),
          ...(number ? { document_number: number } : {}),
        },
      });
    const d1 = await doc(company.id, 'vehicle', truck.id, 'Insurance', '2026-10-15', 'INS-7');
    await doc(company.id, 'driver', ada.id, 'Medical', null);
    await doc(other.id, 'vehicle', foreign.id, 'Insurance', '2026-09-01');
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const logs = await inCompany(() => repo.maintenanceLogsForReport(from, to, 'UTC'));
    expect(logs.map(r => r.id)).toEqual([l1.id.toString(), l2.id.toString()]); // oldest first; another company's, out-of-range ones never
    expect(logs[0]).toMatchObject({
      vehicleId: truck.id.toString(),
      serviceType: 'Oil',
      cost: 40.5,
      vehicle: { name: `Truck${MARK}`, plate: 'TRK-7', category: 'Truck' },
    });
    expect(logs[0]?.serviceDate.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(logs[1]).toMatchObject({ cost: null, vehicle: { plate: null, category: null } });
    expect(
      (
        await inCompany(() =>
          repo.maintenanceLogsForReport(from, to, 'UTC', [
            truck.id.toString(),
            foreign.id.toString(),
          ])
        )
      ).map(r => r.id)
    ).toEqual([l1.id.toString()]); // a foreign id matches nothing
    expect(await inCompany(() => repo.maintenanceLogsForReport(from, to, 'UTC', []))).toEqual([]);
    // service_date is a DATE: the range is read as LOCAL dates — 5 Sept is inside 5 Sept Karachi (4 Sept 19:00Z .. 5 Sept 18:59Z), not inside 6 Sept
    expect(
      (
        await inCompany(() =>
          repo.maintenanceLogsForReport(
            new Date('2026-09-04T19:00:00Z'),
            new Date('2026-09-05T18:59:59.999Z'),
            'Asia/Karachi'
          )
        )
      ).length
    ).toBe(1);
    expect(
      (
        await inCompany(() =>
          repo.maintenanceLogsForReport(
            new Date('2026-09-05T19:00:00Z'),
            new Date('2026-09-06T18:59:59.999Z'),
            'Asia/Karachi'
          )
        )
      ).length
    ).toBe(0);
    expect(
      (
        await runWithContextAsync(contextFor(other.id.toString()), () =>
          repo.maintenanceLogsForReport(from, to, 'UTC')
        )
      ).map(r => r.vehicleId)
    ).toEqual([foreign.id.toString()]);

    // compliance documents: the company's only (company-ruled), all of them
    const docs = await inCompany(() => repo.complianceRecordsForReport());
    expect(docs.map(r => [r.documentType, r.documentableType])).toEqual([
      ['Insurance', 'vehicle'],
      ['Medical', 'driver'],
    ]);
    expect(docs[0]).toMatchObject({
      id: d1.id.toString(),
      documentableId: truck.id.toString(),
      documentNumber: 'INS-7',
    });
    expect(docs[0]?.expiryDate?.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(docs[1]?.expiryDate).toBeNull();

    // licences: deactivated drivers left out, a driver without a licence date listed with null, the foreign driver never
    const licences = await inCompany(() => repo.driverLicencesForReport());
    expect(
      licences.map(r => [
        r.name.replace(MARK, ''),
        r.expiryDate?.toISOString().slice(0, 10) ?? null,
        r.licenseNumber,
      ])
    ).toEqual([
      ['Ada Lovelace', '2026-12-01', 'L-1'],
      ['No Date', null, null],
    ]);
  });

  it('D-0193 (B8): incidentsForReport / countIncidentsForReport / driversForReport — local-date period, tenant isolation through the driver, driver and vehicle filters, every driver status', async () => {
    const company = await seedCompany('b8');
    const other = await seedCompany('b8o');
    const truck = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Truck${MARK}` },
    });
    const van = await rawPrisma.vehicles.create({
      data: { company_id: company.id, name: `Van${MARK}` },
    });
    const foreignVehicle = await rawPrisma.vehicles.create({
      data: { company_id: other.id, name: `Foreign${MARK}` },
    });
    const ada = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Ada',
        last_name: `Lovelace${MARK}`,
        license_number: 'L-1',
        license_expiry_date: new Date('2026-12-01'),
      },
    });
    const gone = await rawPrisma.drivers.create({
      data: {
        company_id: company.id,
        first_name: 'Gone',
        last_name: `Away${MARK}`,
        status: 'inactive',
      },
    });
    const foreign = await rawPrisma.drivers.create({
      data: { company_id: other.id, first_name: 'Foreign', last_name: `Driver${MARK}` },
    });
    const mk = (
      driverId: bigint,
      vehicleId: bigint | null,
      type: string,
      severity: 'minor' | 'moderate' | 'severe',
      date: string
    ) =>
      rawPrisma.driver_incidents.create({
        data: {
          driver_id: driverId,
          ...(vehicleId === null ? {} : { vehicle_id: vehicleId }),
          incident_type: type,
          severity,
          incident_date: new Date(date),
        },
      });
    const i1 = await mk(ada.id, truck.id, 'Collision', 'severe', '2026-09-05');
    const i2 = await mk(ada.id, null, 'Speeding', 'minor', '2026-09-10');
    const i3 = await mk(gone.id, van.id, 'Damage', 'moderate', '2026-09-12');
    await mk(ada.id, truck.id, 'Old', 'minor', '2026-08-01'); // before the range
    await mk(ada.id, truck.id, 'Later', 'minor', '2026-10-01'); // after
    await mk(foreign.id, foreignVehicle.id, 'Collision', 'severe', '2026-09-07'); // another company
    const repo = new FleetDashboardRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const all = await inCompany(() => repo.incidentsForReport(from, to, 'UTC', {}));
    expect(all.map(r => r.id)).toEqual([i1.id.toString(), i2.id.toString(), i3.id.toString()]); // oldest id first; another company's / out-of-range ones never
    expect(all[0]).toMatchObject({
      driverId: ada.id.toString(),
      vehicleId: truck.id.toString(),
      incidentType: 'Collision',
      severity: 'severe',
    });
    expect(all[0]?.incidentDate.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(all[1]?.vehicleId).toBeNull();
    expect(await inCompany(() => repo.countIncidentsForReport(from, to, 'UTC', {}))).toBe(3);
    // a vehicle filter keeps only incidents that HAVE a vehicle in the list; a driver filter the incident's own driver; a foreign id matches nothing
    expect(
      (
        await inCompany(() =>
          repo.incidentsForReport(from, to, 'UTC', { vehicleIds: [truck.id.toString()] })
        )
      ).map(r => r.id)
    ).toEqual([i1.id.toString()]);
    expect(
      (await inCompany(() => repo.incidentsForReport(from, to, 'UTC', { vehicleIds: [] }))).length
    ).toBe(0);
    expect(
      (
        await inCompany(() =>
          repo.incidentsForReport(from, to, 'UTC', { driverIds: [gone.id.toString()] })
        )
      ).map(r => r.id)
    ).toEqual([i3.id.toString()]);
    expect(
      (
        await inCompany(() =>
          repo.incidentsForReport(from, to, 'UTC', { driverIds: [foreign.id.toString()] })
        )
      ).length
    ).toBe(0);
    expect(
      await inCompany(() =>
        repo.countIncidentsForReport(from, to, 'UTC', {
          vehicleIds: [foreignVehicle.id.toString()],
        })
      )
    ).toBe(0);
    // incident_date is a DATE: read as LOCAL dates — 5 Sept is inside 5 Sept Karachi, not inside 6 Sept
    expect(
      (
        await inCompany(() =>
          repo.incidentsForReport(
            new Date('2026-09-04T19:00:00Z'),
            new Date('2026-09-05T18:59:59.999Z'),
            'Asia/Karachi',
            {}
          )
        )
      ).length
    ).toBe(1);
    expect(
      (
        await inCompany(() =>
          repo.incidentsForReport(
            new Date('2026-09-05T19:00:00Z'),
            new Date('2026-09-06T18:59:59.999Z'),
            'Asia/Karachi',
            {}
          )
        )
      ).length
    ).toBe(0);
    expect(
      (
        await runWithContextAsync(contextFor(other.id.toString()), () =>
          repo.incidentsForReport(from, to, 'UTC', {})
        )
      ).map(r => r.driverId)
    ).toEqual([foreign.id.toString()]);

    // drivers: every status of the company, the foreign driver never; optional id list
    const drivers = await inCompany(() => repo.driversForReport());
    expect(drivers.map(d => [d.name.replace(MARK, ''), d.status])).toEqual([
      ['Ada Lovelace', 'active'],
      ['Gone Away', 'inactive'],
    ]);
    expect(drivers[0]).toMatchObject({ licenseNumber: 'L-1' });
    expect(drivers[0]?.licenseExpiryDate?.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(
      (
        await inCompany(() => repo.driversForReport([ada.id.toString(), foreign.id.toString()]))
      ).map(d => d.id)
    ).toEqual([ada.id.toString()]);
  });

  it('activeDeviceAssignmentsForVehicles/latestPositionsForDevices: bulk resolution, dedupe to the latest position per device', async () => {
    const company = await seedCompany('c');
    const user = await seedUser(company.id, 'c');
    const product = await seedProduct(company.id, user.id, 'c');
    const device = await seedDevice(product.id, user.id, 'c');
    const vehicle = await seedVehicle(company.id, '1');
    await rawPrisma.vehicle_device_assignments.create({
      data: { vehicle_id: vehicle.id, device_id: device.id, assigned_at: new Date('2026-09-01') },
    });
    await rawPrisma.device_positions.createMany({
      data: [
        {
          device_id: device.id,
          latitude: 1,
          longitude: 1,
          recorded_at: new Date('2026-09-01T00:00:00Z'),
          speed: 10,
        },
        {
          device_id: device.id,
          latitude: 2,
          longitude: 2,
          recorded_at: new Date('2026-09-15T00:00:00Z'),
          speed: 42,
        },
      ],
    });
    const repo = new FleetDashboardRepository(prisma);

    const assignments = await repo.activeDeviceAssignmentsForVehicles([vehicle.id.toString()]);
    expect(assignments.get(vehicle.id.toString())).toBe(device.id.toString());

    const positions = await repo.latestPositionsForDevices([device.id.toString()]);
    expect(positions.get(device.id.toString())).toMatchObject({ speed: 42 });
  });

  it('trip aggregates: tripStatusCountsInRange/completedTripsAggInRange/completedTripsAggByVehicleInRange (real groupBy)', async () => {
    const company = await seedCompany('d');
    const vehicle1 = await seedVehicle(company.id, '1');
    const vehicle2 = await seedVehicle(company.id, '2');
    const driver = await seedDriver(company.id, '1');
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    await seedCompletedTrip(company.id, vehicle1.id, driver.id, {
      actualStartAt: new Date('2026-09-05T00:00:00Z'),
      distanceKm: 100,
      durationMinutes: 60,
      fuelUsedLiters: 10,
    });
    await seedCompletedTrip(company.id, vehicle2.id, driver.id, {
      actualStartAt: new Date('2026-09-10T00:00:00Z'),
      distanceKm: 200,
      durationMinutes: 120,
      fuelUsedLiters: 20,
    });
    const repo = new FleetDashboardRepository(prisma);

    const [statusCounts, tripAgg, byVehicle] = await runWithContextAsync(
      contextFor(company.id.toString()),
      () =>
        Promise.all([
          repo.tripStatusCountsInRange(from, to),
          repo.completedTripsAggInRange(from, to),
          repo.completedTripsAggByVehicleInRange(from, to),
        ])
    );

    expect(statusCounts).toMatchObject({ total: 2, completed: 2 });
    expect(tripAgg).toMatchObject({ totalMinutes: 180, totalKm: 300 });
    expect(byVehicle.get(vehicle1.id.toString())).toMatchObject({
      minutes: 60,
      km: 100,
      fuelLiters: 10,
      count: 1,
    });
    expect(byVehicle.get(vehicle2.id.toString())).toMatchObject({
      minutes: 120,
      km: 200,
      fuelLiters: 20,
      count: 1,
    });
  });

  it('fuelAggInRange/fuelCostByVehicleInRange: fuel_logs (parent:vehicles) joined through vehicles.company_id, tenant-isolated', async () => {
    const companyA = await seedCompany('e1');
    const companyB = await seedCompany('e2');
    const vehicleA = await seedVehicle(companyA.id, '1');
    const vehicleB = await seedVehicle(companyB.id, '1');
    await rawPrisma.fuel_logs.create({
      data: {
        vehicle_id: vehicleA.id,
        fill_date: new Date('2026-09-05'),
        volume: 40,
        unit: 'liters',
        total_cost: 74,
      },
    });
    await rawPrisma.fuel_logs.create({
      data: {
        vehicle_id: vehicleB.id,
        fill_date: new Date('2026-09-05'),
        volume: 999,
        unit: 'liters',
        total_cost: 999,
      },
    });
    const repo = new FleetDashboardRepository(prisma);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const agg = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.fuelAggInRange(from, to)
    );
    expect(agg).toMatchObject({ liters: 40, cost: 74 });

    const byVehicle = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.fuelByVehicleInRange(from, to)
    );
    expect(byVehicle.get(vehicleA.id.toString())).toMatchObject({ liters: 40, cost: 74 });
    expect(byVehicle.has(vehicleB.id.toString())).toBe(false);
  });

  it("KNOWN_ISSUES 11.1 golden pair: a real acknowledged alarm (with a real severity column) does not crash and is returned correctly — the exact condition that crashed the old app's rule.severity eager-load", async () => {
    const company = await seedCompany('f');
    const user = await seedUser(company.id, 'f');
    const product = await seedProduct(company.id, user.id, 'f');
    const device = await seedDevice(product.id, user.id, 'f');
    const rulesRepo = new RulesRepository(prisma);

    const rule = await runWithContextAsync(
      contextFor(company.id.toString(), user.id.toString()),
      () =>
        rulesRepo.create(user.id.toString(), {
          ruleName: 'High Temperature',
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

    const activeAlarm = await rulesRepo.createAlarm({
      ruleId: rule.id,
      deviceId: device.id.toString(),
      productId: product.id.toString(),
      companyId: company.id.toString(),
      severity: 'critical',
      conditionSnapshot: [],
      triggeredValue: { temp: 99 },
    });
    const toAcknowledge = await rulesRepo.createAlarm({
      ruleId: rule.id,
      deviceId: device.id.toString(),
      productId: product.id.toString(),
      companyId: company.id.toString(),
      severity: 'warning',
      conditionSnapshot: [],
      triggeredValue: { temp: 85 },
    });
    await runWithContextAsync(contextFor(company.id.toString(), user.id.toString()), () =>
      rulesRepo.acknowledgeAlarm(toAcknowledge.id, user.id.toString())
    );

    const repo = new FleetDashboardRepository(prisma);

    // This is the exact query shape that threw a real SQL error in the old
    // app the moment an acknowledged alarm existed (11.1 Bug B) — it must
    // not throw here, and must return the real alarms.severity column
    // directly rather than a broken rule join.
    const rows = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.activeAlarmsWithRuleName([])
    );
    expect(rows).toHaveLength(2);
    const acknowledged = rows.find(r => r.state === 'acknowledged');
    const active = rows.find(r => r.state === 'active');
    expect(acknowledged).toMatchObject({ severity: 'warning', ruleName: 'High Temperature' });
    expect(active).toMatchObject({
      severity: 'critical',
      ruleName: 'High Temperature',
      id: activeAlarm.id,
    });

    const counts = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.alarmSeverityCounts()
    );
    expect(counts).toEqual({ critical: 1, warning: 1, info: 0, total: 2 });

    // D-0182 (L2): the fleet_only overview counts start from every open alarm's severity + device
    const open = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.openAlarmDevices()
    );
    expect(open.map(o => o.severity).sort()).toEqual(['critical', 'warning']);
    expect(open.every(o => o.deviceId === device.id.toString())).toBe(true);
  });

  it("countExpiringCompliance/countExpiringDriverLicences: within 30 days, but NOT already-expired (a real deviation from module 4.5's own expiringSoon, which has no lower bound — Laravel's FleetDashboardService really does add >= today here, confirmed live)", async () => {
    const company = await seedCompany('g');
    const vehicle = await seedVehicle(company.id, '1');
    const driver = await seedDriver(company.id, '1');
    const now = new Date();
    const within30 = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const alreadyExpired = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const farOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    await rawPrisma.compliance_documents.create({
      data: {
        company_id: company.id,
        documentable_type: 'vehicle',
        documentable_id: vehicle.id,
        document_type: 'Registration',
        expiry_date: within30,
      },
    });
    await rawPrisma.compliance_documents.create({
      data: {
        company_id: company.id,
        documentable_type: 'vehicle',
        documentable_id: vehicle.id,
        document_type: 'Expired',
        expiry_date: alreadyExpired,
      },
    });
    await rawPrisma.compliance_documents.create({
      data: {
        company_id: company.id,
        documentable_type: 'vehicle',
        documentable_id: vehicle.id,
        document_type: 'Insurance',
        expiry_date: farOut,
      },
    });
    await rawPrisma.drivers.update({
      where: { id: driver.id },
      data: { license_expiry_date: within30 },
    });

    const repo = new FleetDashboardRepository(prisma);
    const [complianceCount, licenceCount] = await runWithContextAsync(
      contextFor(company.id.toString()),
      () => Promise.all([repo.countExpiringCompliance(30), repo.countExpiringDriverLicences(30)])
    );

    expect(complianceCount).toBe(1);
    expect(licenceCount).toBe(1);
  });

  it('D-0159 vehicleCount: retired and sold vehicles are out of the fleet; active and in_maintenance count', async () => {
    const company = await seedCompany('vc');
    const mk = (label: string, lifecycle: 'active' | 'in_maintenance' | 'retired' | 'sold') =>
      rawPrisma.vehicles.create({
        data: {
          company_id: company.id,
          name: `Vehicle ${label}${MARK}`,
          lifecycle_status: lifecycle,
        },
      });
    await mk('a', 'active');
    await mk('m', 'in_maintenance');
    await mk('r', 'retired');
    await mk('s', 'sold');
    const repo = new FleetDashboardRepository(prisma);

    const count = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.vehicleCount()
    );

    expect(count).toBe(2);
  });
});
