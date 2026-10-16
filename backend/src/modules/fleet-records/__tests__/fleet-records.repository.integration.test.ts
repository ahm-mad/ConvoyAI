import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetRecordsRepository } from '../fleet-records.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests") for module 4.11 (D-0188): `vehicle_maintenance_logs` / `fuel_logs` are
 * parent-ruled, so tenant isolation rests on the repository's own `vehicles.company_id` join — proven here with a foreign company's rows
 * and a foreign vehicle id — plus the filters, the null-last / relation sorts and the database-side summaries.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-records-repo-test.example';
const contextFor = (companyId: string): RequestContext => ({
  userId: '1',
  companyId,
  roles: [],
  perms: [],
  jti: 'test',
  exp: Number.MAX_SAFE_INTEGER,
});
const seedCompany = (label: string) =>
  rawPrisma.companies.create({
    data: { name: `Records Test Co ${label}`, email: `co-${label}${MARK}` },
  });
const seedVehicle = (companyId: bigint, name: string, extra: Record<string, unknown> = {}) =>
  rawPrisma.vehicles.create({ data: { company_id: companyId, name: `${name}${MARK}`, ...extra } });
const clean = (name: string) => name.replace(MARK, '');

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);
  const vehicles = await rawPrisma.vehicles.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map(v => v.id);
  await rawPrisma.fuel_logs.deleteMany({ where: { vehicle_id: { in: vehicleIds } } });
  await rawPrisma.vehicle_maintenance_logs.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.compliance_documents.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetRecordsRepository (real Postgres)', () => {
  it('D-0188 (C2): maintenance logs — tenant isolation, filters, sorts (nulls last, vehicle name), paging and the whole-set summary', async () => {
    const company = await seedCompany('m');
    const other = await seedCompany('mo');
    const truck = await seedVehicle(company.id, 'Truck', {
      vehicle_category: 'Truck',
      plate: 'TRK-1',
    });
    const van = await seedVehicle(company.id, 'Van', {
      vehicle_category: 'van',
      lifecycle_status: 'retired',
    }); // retired vehicles keep their history in the list
    const foreign = await seedVehicle(other.id, 'Foreign');
    const log = (
      vehicleId: bigint,
      serviceType: string,
      date: string,
      extra: Record<string, unknown> = {}
    ) =>
      rawPrisma.vehicle_maintenance_logs.create({
        data: {
          vehicle_id: vehicleId,
          service_type: serviceType,
          service_date: new Date(date),
          ...extra,
        },
      });
    await log(truck.id, 'Oil', '2026-09-01', { cost: 40, vendor: 'Acme', odometer_km: 1000 });
    await log(truck.id, 'Tyres', '2026-09-10', { cost: 200, vendor: 'Bolt', notes: 'front pair' });
    await log(van.id, 'oil', '2026-09-05', { cost: 60.5, vendor: 'Acme' });
    await log(van.id, 'Brakes', '2026-08-20'); // no cost, no vendor
    await log(foreign.id, 'Oil', '2026-09-05', { cost: 999, vendor: 'Acme' }); // another company
    const repo = new FleetRecordsRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const ids = async (q: Parameters<FleetRecordsRepository['listMaintenanceLogs']>[0]) =>
      (await inCompany(() => repo.listMaintenanceLogs(q, 0, 50))).items.map(
        i => `${i.serviceType}/${clean(i.vehicle.name)}`
      );

    // default order: newest service date first; the foreign company's row never appears
    expect(await ids({})).toEqual(['Tyres/Truck', 'oil/Van', 'Oil/Truck', 'Brakes/Van']);
    const first = (await inCompany(() => repo.listMaintenanceLogs({}, 0, 1))).items[0];
    expect(first).toMatchObject({
      serviceType: 'Tyres',
      cost: 200,
      vendor: 'Bolt',
      notes: 'front pair',
      vehicle: { plate: 'TRK-1', category: 'Truck', lifecycleStatus: 'active' },
    });
    expect((await inCompany(() => repo.listMaintenanceLogs({}, 0, 1))).total).toBe(4);
    expect(
      (await inCompany(() => repo.listMaintenanceLogs({}, 2, 2))).items.map(i => i.serviceType)
    ).toEqual(['Oil', 'Brakes']); // paging window

    // filters
    expect(await ids({ from: new Date('2026-09-01'), to: new Date('2026-09-05') })).toEqual([
      'oil/Van',
      'Oil/Truck',
    ]); // inclusive dates
    expect(await ids({ vehicleIds: [truck.id.toString(), foreign.id.toString()] })).toEqual([
      'Tyres/Truck',
      'Oil/Truck',
    ]); // a foreign id matches nothing
    expect(await ids({ vehicleCategory: 'VAN' })).toEqual(['oil/Van', 'Brakes/Van']); // case-insensitive
    expect(await ids({ serviceType: 'OIL' })).toEqual(['oil/Van', 'Oil/Truck']);
    expect(await ids({ vendor: 'acme' })).toEqual(['oil/Van', 'Oil/Truck']);
    expect(await ids({ minCost: 50 })).toEqual(['Tyres/Truck', 'oil/Van']);
    expect(await ids({ maxCost: 50 })).toEqual(['Oil/Truck']); // a log without a cost is not "cheap"
    expect(await ids({ search: 'front' })).toEqual(['Tyres/Truck']); // notes
    expect(await ids({ search: 'trk-1' })).toEqual(['Tyres/Truck', 'Oil/Truck']); // vehicle plate
    expect(await ids({ vehicleCategory: 'truck', serviceType: 'oil' })).toEqual(['Oil/Truck']); // filters combine

    // sorts: nulls last in both directions, the relation sort, ties by id
    expect(await ids({ sortBy: 'cost', sortOrder: 'desc' })).toEqual([
      'Tyres/Truck',
      'oil/Van',
      'Oil/Truck',
      'Brakes/Van',
    ]);
    expect(await ids({ sortBy: 'cost', sortOrder: 'asc' })).toEqual([
      'Oil/Truck',
      'oil/Van',
      'Tyres/Truck',
      'Brakes/Van',
    ]);
    expect(await ids({ sortBy: 'vendor', sortOrder: 'asc' })).toEqual([
      'Oil/Truck',
      'oil/Van',
      'Tyres/Truck',
      'Brakes/Van',
    ]); // Acme, Acme (tie by id), Bolt, null
    expect(
      (await ids({ sortBy: 'vehicle_name', sortOrder: 'asc' })).map(s => s.split('/')[1])
    ).toEqual(['Truck', 'Truck', 'Van', 'Van']);
    expect(await ids({ sortBy: 'service_date', sortOrder: 'asc' })).toEqual([
      'Brakes/Van',
      'Oil/Truck',
      'oil/Van',
      'Tyres/Truck',
    ]);

    // summary: the whole filtered set (not a page); the average is over the logs that have a cost
    expect(await inCompany(() => repo.maintenanceSummary({}))).toEqual({
      count: 4,
      totalCost: 300.5,
      withCost: 3,
    });
    expect(await inCompany(() => repo.maintenanceSummary({ vehicleCategory: 'van' }))).toEqual({
      count: 2,
      totalCost: 60.5,
      withCost: 1,
    });
    expect(await inCompany(() => repo.maintenanceSummary({ serviceType: 'nothing' }))).toEqual({
      count: 0,
      totalCost: 0,
      withCost: 0,
    });
    // the foreign company sees only its own
    const foreignSummary = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.maintenanceSummary({})
    );
    expect(foreignSummary).toEqual({ count: 1, totalCost: 999, withCost: 1 });
  });

  it('D-0188 (C3): fuel logs — tenant isolation, filters, sorts and a summary that converts gallons and judges the price over the priced logs only', async () => {
    const company = await seedCompany('f');
    const other = await seedCompany('fo');
    const truck = await seedVehicle(company.id, 'Truck', { vehicle_category: 'Truck' });
    const van = await seedVehicle(company.id, 'Van');
    const foreign = await seedVehicle(other.id, 'Foreign');
    const trip = await rawPrisma.trips.create({
      data: {
        company_id: company.id,
        vehicle_id: truck.id,
        driver_id: (
          await rawPrisma.drivers.create({
            data: { company_id: company.id, first_name: 'D', last_name: `T${MARK}` },
          })
        ).id,
        status: 'planned',
        planned_start_at: new Date('2026-09-01T08:00:00Z'),
      },
    });
    const fill = (
      vehicleId: bigint,
      date: string,
      volume: number,
      unit: 'liters' | 'gallons',
      extra: Record<string, unknown> = {}
    ) =>
      rawPrisma.fuel_logs.create({
        data: { vehicle_id: vehicleId, fill_date: new Date(date), volume, unit, ...extra },
      });
    await fill(truck.id, '2026-09-01', 50, 'liters', {
      total_cost: 100,
      unit_price: 2,
      vendor: 'Shell',
      payment_method: 'card',
      is_full_tank: true,
      odometer_km: 500,
      trip_id: trip.id,
    });
    await fill(truck.id, '2026-09-03', 10, 'gallons', {
      cost: 40,
      vendor: 'Total',
      payment_method: 'cash',
      is_full_tank: false,
    }); // cost only; 37.854 L
    await fill(van.id, '2026-09-05', 30, 'liters', {
      total_cost: 0,
      cost: 60,
      vendor: 'shell',
      station_name: 'North Station',
    }); // total_cost 0 → falls back to cost (the dashboard convention)
    await fill(van.id, '2026-09-07', 20, 'liters'); // no cost at all → counted in litres, not in the price
    await fill(foreign.id, '2026-09-05', 999, 'liters', { total_cost: 999 }); // another company
    const repo = new FleetRecordsRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);
    const dates = async (q: Parameters<FleetRecordsRepository['listFuelLogs']>[0]) =>
      (await inCompany(() => repo.listFuelLogs(q, 0, 50))).items.map(i =>
        i.fillDate.toISOString().slice(0, 10)
      );

    expect(await dates({})).toEqual(['2026-09-07', '2026-09-05', '2026-09-03', '2026-09-01']);
    const top = (
      await inCompany(() => repo.listFuelLogs({ sortBy: 'fill_date', sortOrder: 'asc' }, 0, 1))
    ).items[0];
    expect(top).toMatchObject({
      volume: 50,
      unit: 'liters',
      totalCost: 100,
      unitPrice: 2,
      vendor: 'Shell',
      paymentMethod: 'card',
      isFullTank: true,
      odometerKm: 500,
      tripId: trip.id.toString(),
      vehicle: { category: 'Truck' },
    });

    expect(await dates({ from: new Date('2026-09-03'), to: new Date('2026-09-05') })).toEqual([
      '2026-09-05',
      '2026-09-03',
    ]);
    expect(await dates({ vehicleIds: [van.id.toString(), foreign.id.toString()] })).toEqual([
      '2026-09-07',
      '2026-09-05',
    ]);
    expect(await dates({ vehicleCategory: 'truck' })).toEqual(['2026-09-03', '2026-09-01']);
    expect(await dates({ vendor: 'SHELL' })).toEqual(['2026-09-05', '2026-09-01']);
    expect(await dates({ paymentMethod: 'Cash' })).toEqual(['2026-09-03']);
    expect(await dates({ tripId: trip.id.toString() })).toEqual(['2026-09-01']);
    expect(await dates({ isFullTank: false })).toEqual(['2026-09-03']);
    expect(await dates({ search: 'north' })).toEqual(['2026-09-05']); // station name
    expect(await dates({ sortBy: 'total_cost', sortOrder: 'desc' })).toEqual([
      '2026-09-01',
      '2026-09-05',
      '2026-09-07',
      '2026-09-03',
    ]); // 100, 0, then the two NULLs last (ties by id desc)
    expect(await dates({ sortBy: 'unit_price', sortOrder: 'asc' })).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-05',
      '2026-09-07',
    ]); // the one price first, NULLs last

    // whole-set summary: litres convert gallons (10 gal = 37.854 L); cost = total_cost, else cost; price per litre over the priced logs' litres only
    const all = await inCompany(() => repo.fuelSummary({}));
    expect(all.count).toBe(4);
    expect(all.liters).toBeCloseTo(50 + 37.854 + 30 + 20, 2);
    expect(all.totalCost).toBeCloseTo(100 + 40 + 60, 2);
    expect(all.pricedLiters).toBeCloseTo(50 + 37.854 + 30, 2); // the log with no cost is NOT in the price's denominator
    expect(all.withCost).toBe(3);
    const trucks = await inCompany(() => repo.fuelSummary({ vehicleCategory: 'Truck' }));
    expect([trucks.count, trucks.totalCost, trucks.withCost]).toEqual([2, 140, 2]);
    expect(await inCompany(() => repo.fuelSummary({ vendor: 'nothing' }))).toEqual({
      count: 0,
      liters: 0,
      totalCost: 0,
      pricedLiters: 0,
      withCost: 0,
    });
    const foreignSummary = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.fuelSummary({})
    );
    expect([foreignSummary.count, foreignSummary.liters, foreignSummary.totalCost]).toEqual([
      1, 999, 999,
    ]);

    await rawPrisma.fuel_logs.deleteMany({ where: { vehicle_id: { in: [truck.id, van.id] } } });
    await rawPrisma.trips.deleteMany({ where: { id: trip.id } });
    await rawPrisma.drivers.deleteMany({ where: { company_id: company.id } });
  });

  it("D-0188 (C4): complianceRowsForCounts — the company's documents only, optional owner-type / document-type filters", async () => {
    const company = await seedCompany('c');
    const other = await seedCompany('co');
    const truck = await seedVehicle(company.id, 'Truck');
    const foreign = await seedVehicle(other.id, 'Foreign');
    const doc = (
      companyId: bigint,
      type: string,
      ownerId: bigint,
      documentType: string,
      expiry: string | null
    ) =>
      rawPrisma.compliance_documents.create({
        data: {
          company_id: companyId,
          documentable_type: type,
          documentable_id: ownerId,
          document_type: documentType,
          expiry_date: expiry ? new Date(expiry) : null,
        },
      });
    await doc(company.id, 'vehicle', truck.id, 'Insurance', '2026-09-10');
    await doc(company.id, 'vehicle', truck.id, 'Registration', null);
    await doc(company.id, 'driver', truck.id, 'Licence', '2026-12-01');
    await doc(other.id, 'vehicle', foreign.id, 'Insurance', '2026-09-01');
    const repo = new FleetRecordsRepository(prisma);
    const inCompany = <T>(fn: () => Promise<T>) =>
      runWithContextAsync(contextFor(company.id.toString()), fn);

    const all = await inCompany(() => repo.complianceRowsForCounts({}));
    expect(all.map(r => r.documentType).sort()).toEqual(['Insurance', 'Licence', 'Registration']);
    expect(all.find(r => r.documentType === 'Registration')?.expiryDate).toBeNull();
    expect(
      (await inCompany(() => repo.complianceRowsForCounts({ documentableType: 'driver' }))).map(
        r => r.documentType
      )
    ).toEqual(['Licence']);
    expect(
      (await inCompany(() => repo.complianceRowsForCounts({ documentType: 'insurance' }))).length
    ).toBe(1); // case-insensitive, and never the foreign company's
  });
});
