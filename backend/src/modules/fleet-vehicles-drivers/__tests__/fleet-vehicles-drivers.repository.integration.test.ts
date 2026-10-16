import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetVehiclesDriversRepository } from '../fleet-vehicles-drivers.repository.js';
import type { CreateDriverInput, CreateVehicleInput } from '../fleet-vehicles-drivers.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers the
 * module's two central acceptance criteria: `extend_vehicles`/
 * `extend_drivers` columns wired end-to-end (KNOWN_ISSUES 11.3) and the
 * append-only assignment-history tables (`vehicle_device_assignments`/
 * `driver_vehicle_assignments`) — a closed row is never mutated in place,
 * only `unassigned_at` set on the still-existing row — plus tenant
 * isolation for `vehicles`/`drivers` (company-ruled) via the default
 * scoping extension.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-repo-test.example';

const FULL_VEHICLE_INPUT: CreateVehicleInput = {
  name: `Truck${MARK}`,
  vehicleCategory: 'rigid',
  make: 'Volvo',
  model: 'FH16',
  lengthM: 10,
  widthM: 2.5,
  heightM: 3.5,
  acquisitionDate: new Date('2026-01-01'),
  acquisitionCost: 100000,
  plate: 'ABC-123',
  vin: '1HGCM82633A004352',
  year: 2024,
  fuelType: 'diesel',
  tankCapacityLiters: 400,
  odometerKm: 1200,
  ownershipType: 'owned',
  costCentre: 'CC-1',
  grossWeightKg: 26000,
  payloadKg: 15000,
};

const FULL_DRIVER_INPUT: CreateDriverInput = {
  firstName: 'Jane',
  lastName: `Doe${MARK}`,
  email: `jane${MARK}`,
  phone: '555-0100',
  licenseNumber: 'L123',
  licenseClass: 'C',
  licenseExpiryDate: new Date('2027-01-01'),
  hireDate: new Date('2025-01-01'),
  employmentStatus: 'full_time',
  availabilityStatus: 'available',
  certifications: [{ name: 'HazMat', issued_date: '2025-01-01' }],
  payrollReference: 'PR-1',
};

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Fleet Test Co ${label}`, email: `co-${label}${MARK}` },
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
  const users = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);
  const products = await rawPrisma.products.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const productIds = products.map(p => p.id);
  const devices = await rawPrisma.devices.findMany({
    where: { product_id: { in: productIds } },
    select: { id: true },
  });
  const deviceIds = devices.map(d => d.id);

  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);

  await rawPrisma.vehicle_device_assignments.deleteMany({
    where: { device_id: { in: deviceIds } },
  });
  await rawPrisma.driver_vehicle_assignments.deleteMany({
    where: {
      OR: [{ assigned_by: { in: userIds } }, { drivers: { company_id: { in: companyIds } } }],
    },
  });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: deviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: productIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: userIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetVehiclesDriversRepository (real Postgres)', () => {
  it('createVehicle: every extend_vehicles column is wired end-to-end (KNOWN_ISSUES 11.3)', async () => {
    const company = await seedCompany('a');
    const repo = new FleetVehiclesDriversRepository(prisma);

    const created = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );

    expect(created).toMatchObject({
      plate: 'ABC-123',
      vin: '1HGCM82633A004352',
      year: 2024,
      fuelType: 'diesel',
      tankCapacityLiters: 400,
      odometerKm: 1200,
      ownershipType: 'owned',
      costCentre: 'CC-1',
      grossWeightKg: 26000,
      payloadKg: 15000,
    });

    const found = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.findVehicleById(created.id)
    );
    expect(found).toMatchObject({ plate: 'ABC-123', vin: '1HGCM82633A004352', year: 2024 });
  });

  it('createDriver: every extend_drivers column is wired end-to-end (KNOWN_ISSUES 11.3)', async () => {
    const company = await seedCompany('b');
    const repo = new FleetVehiclesDriversRepository(prisma);

    const created = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.createDriver(FULL_DRIVER_INPUT)
    );

    expect(created).toMatchObject({
      employmentStatus: 'full_time',
      availabilityStatus: 'available',
      payrollReference: 'PR-1',
    });
    expect(created.certifications).toEqual([{ name: 'HazMat', issued_date: '2025-01-01' }]);
  });

  it("vehicles/drivers are only visible under their own company's context (tenant scoping)", async () => {
    const companyA = await seedCompany('c');
    const companyB = await seedCompany('d');
    const repo = new FleetVehiclesDriversRepository(prisma);

    const vehicle = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );
    const driver = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.createDriver(FULL_DRIVER_INPUT)
    );

    const vehicleFromOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findVehicleById(vehicle.id)
    );
    const driverFromOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findDriverById(driver.id)
    );
    expect(vehicleFromOther).toBeUndefined();
    expect(driverFromOther).toBeUndefined();

    const vehicleFromOwn = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findVehicleById(vehicle.id)
    );
    expect(vehicleFromOwn?.id).toBe(vehicle.id);
  });

  it('vehicle_device_assignments: append + close — closing preserves the row id and unassigned_at, never mutated back to open', async () => {
    const company = await seedCompany('e');
    const owner = await seedUser(company.id, 'owner');
    const product = await seedProduct(company.id, owner.id, 'p');
    const device = await seedDevice(product.id, owner.id, 'd');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const vehicle = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );

    expect(await repo.vehicleHasActiveDeviceAssignment(vehicle.id)).toBe(false);
    expect(await repo.deviceHasActiveAssignment(device.id.toString())).toBe(false);

    const created = await repo.createDeviceAssignment(vehicle.id, device.id.toString());
    expect(await repo.vehicleHasActiveDeviceAssignment(vehicle.id)).toBe(true);
    // Global — matches Laravel's own unscoped `deviceAlreadyInstalled` check.
    expect(await repo.deviceHasActiveAssignment(device.id.toString())).toBe(true);

    const closed = await repo.closeActiveDeviceAssignment(vehicle.id);
    expect(closed?.id).toBe(created.id);
    expect(closed?.unassignedAt).not.toBeNull();
    expect(await repo.vehicleHasActiveDeviceAssignment(vehicle.id)).toBe(false);

    // A second close is a no-op (nothing active left) — never re-mutates the closed row.
    const secondClose = await repo.closeActiveDeviceAssignment(vehicle.id);
    expect(secondClose).toBeUndefined();

    // The original row is still there, just closed — not deleted, not duplicated.
    const rows = await rawPrisma.vehicle_device_assignments.findMany({
      where: { vehicle_id: BigInt(vehicle.id) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id.toString()).toBe(created.id);
  });

  it('driver_vehicle_assignments: append + close — closing preserves the row id, sets unassigned_by/notes, never mutated back to open', async () => {
    const company = await seedCompany('f');
    const manager = await seedUser(company.id, 'manager');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const [vehicle, driver] = await runWithContextAsync(contextFor(company.id.toString()), () =>
      Promise.all([repo.createVehicle(FULL_VEHICLE_INPUT), repo.createDriver(FULL_DRIVER_INPUT)])
    );

    expect(await repo.driverHasActiveAssignment(driver.id)).toBe(false);

    const created = await repo.createDriverVehicleAssignment(
      driver.id,
      vehicle.id,
      manager.id.toString(),
      'start'
    );
    expect(await repo.driverHasActiveAssignment(driver.id)).toBe(true);

    const closed = await repo.closeActiveAssignmentForDriver(
      driver.id,
      manager.id.toString(),
      'end'
    );
    expect(closed?.id).toBe(created.id);
    expect(closed?.unassignedAt).not.toBeNull();
    expect(closed?.unassignedBy).toBe(manager.id.toString());
    expect(closed?.notes).toBe('end');
    expect(await repo.driverHasActiveAssignment(driver.id)).toBe(false);

    const rows = await rawPrisma.driver_vehicle_assignments.findMany({
      where: { driver_id: BigInt(driver.id) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id.toString()).toBe(created.id);
  });

  it("listCompanyAssignmentHistory: scopes via the owning driver's company, isolating another company's assignments", async () => {
    const companyA = await seedCompany('g');
    const companyB = await seedCompany('h');
    const managerA = await seedUser(companyA.id, 'mgrA');
    const managerB = await seedUser(companyB.id, 'mgrB');
    const repo = new FleetVehiclesDriversRepository(prisma);

    const [vehicleA, driverA] = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      Promise.all([repo.createVehicle(FULL_VEHICLE_INPUT), repo.createDriver(FULL_DRIVER_INPUT)])
    );
    const [vehicleB, driverB] = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      Promise.all([repo.createVehicle(FULL_VEHICLE_INPUT), repo.createDriver(FULL_DRIVER_INPUT)])
    );
    await repo.createDriverVehicleAssignment(driverA.id, vehicleA.id, managerA.id.toString(), null);
    await repo.createDriverVehicleAssignment(driverB.id, vehicleB.id, managerB.id.toString(), null);

    const filters = {
      dateFrom: undefined,
      dateTo: undefined,
      includeActive: true,
      status: undefined,
    };
    const { items, total } = await repo.listCompanyAssignmentHistory(
      companyA.id.toString(),
      { ...filters, driverId: undefined, vehicleId: undefined },
      1,
      20
    );

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.driverId).toBe(driverA.id);
  });

  it("listVehicles/listDrivers: scoped to the caller's own company, listDrivers filters by status", async () => {
    const company = await seedCompany('i');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());

    await runWithContextAsync(context, () => repo.createVehicle(FULL_VEHICLE_INPUT));
    await runWithContextAsync(context, () => repo.createDriver(FULL_DRIVER_INPUT));
    await runWithContextAsync(context, () =>
      repo.createDriver({ ...FULL_DRIVER_INPUT, lastName: `Inactive${MARK}` })
    );
    await rawPrisma.drivers.updateMany({
      where: { last_name: `Inactive${MARK}` },
      data: { status: 'inactive' },
    });

    const vehicles = await runWithContextAsync(context, () =>
      repo.listVehicles({ includeInactive: false })
    );
    expect(vehicles.items).toHaveLength(1);

    const activeDrivers = await runWithContextAsync(context, () =>
      repo.listDrivers({ includeInactive: false, status: 'active' })
    );
    expect(activeDrivers.items).toHaveLength(1);
    // D-0162: deactivated (`inactive`) drivers are left out of the default list; an explicit status filter or include_inactive brings them back.
    const defaultDrivers = await runWithContextAsync(context, () =>
      repo.listDrivers({ includeInactive: false })
    );
    expect(defaultDrivers.items).toHaveLength(1);
    const inactiveOnly = await runWithContextAsync(context, () =>
      repo.listDrivers({ includeInactive: false, status: 'inactive' })
    );
    expect(inactiveOnly.items).toHaveLength(1);
    const allDrivers = await runWithContextAsync(context, () =>
      repo.listDrivers({ includeInactive: true })
    );
    expect(allDrivers.items).toHaveLength(2);
  });

  it('updateVehicleImagePath / currentDeviceAssignmentForVehicle / currentAssignmentForVehicle / currentAssignmentForDriver', async () => {
    const company = await seedCompany('j');
    const owner = await seedUser(company.id, 'owner');
    const product = await seedProduct(company.id, owner.id, 'p');
    const device = await seedDevice(product.id, owner.id, 'd');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());

    const [vehicle, driver] = await runWithContextAsync(context, () =>
      Promise.all([repo.createVehicle(FULL_VEHICLE_INPUT), repo.createDriver(FULL_DRIVER_INPUT)])
    );

    const updated = await runWithContextAsync(context, () =>
      repo.updateVehicleImagePath(vehicle.id, 'https://images.example.com/vehicles/x.png')
    );
    expect(updated?.imagePath).toBe('https://images.example.com/vehicles/x.png');

    expect(await repo.currentDeviceAssignmentForVehicle(vehicle.id)).toBeUndefined();
    await repo.createDeviceAssignment(vehicle.id, device.id.toString());
    const currentDevice = await repo.currentDeviceAssignmentForVehicle(vehicle.id);
    expect(currentDevice?.deviceId).toBe(device.id.toString());

    expect(await repo.currentAssignmentForVehicle(vehicle.id)).toBeUndefined();
    expect(await repo.currentAssignmentForDriver(driver.id)).toBeUndefined();
    await repo.createDriverVehicleAssignment(driver.id, vehicle.id, owner.id.toString(), null);
    const currentForVehicle = await repo.currentAssignmentForVehicle(vehicle.id);
    const currentForDriver = await repo.currentAssignmentForDriver(driver.id);
    expect(currentForVehicle?.driverId).toBe(driver.id);
    expect(currentForDriver?.vehicleId).toBe(vehicle.id);
  });

  it('listDriverAssignmentHistory/listVehicleAssignmentHistory: date-range filtering, pagination, and summary/unique aggregates', async () => {
    const company = await seedCompany('k');
    const manager = await seedUser(company.id, 'mgr');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());
    const [vehicle1, vehicle2, driver] = await runWithContextAsync(context, () =>
      Promise.all([
        repo.createVehicle(FULL_VEHICLE_INPUT),
        repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: 'XYZ-999' }),
        repo.createDriver(FULL_DRIVER_INPUT),
      ])
    );

    // A closed assignment well outside any date window, and a currently-open one.
    const old = await repo.createDriverVehicleAssignment(
      driver.id,
      vehicle1.id,
      manager.id.toString(),
      null
    );
    await rawPrisma.driver_vehicle_assignments.update({
      where: { id: BigInt(old.id) },
      data: {
        assigned_at: new Date('2020-01-01T00:00:00.000Z'),
        unassigned_at: new Date('2020-01-05T00:00:00.000Z'),
        trip_count: 3,
        distance_km: 42.5,
      },
    });
    await repo.createDriverVehicleAssignment(driver.id, vehicle2.id, manager.id.toString(), null);

    const noFilter = {
      dateFrom: undefined,
      dateTo: undefined,
      includeActive: true,
      status: undefined,
    };
    const both = await repo.listDriverAssignmentHistory(driver.id, noFilter, 1, 20);
    expect(both.total).toBe(2);

    const excludingActive = await repo.listDriverAssignmentHistory(
      driver.id,
      { ...noFilter, includeActive: false },
      1,
      20
    );
    expect(excludingActive.total).toBe(1);
    expect(excludingActive.items[0]?.id).toBe(old.id);

    const inRange = await repo.listDriverAssignmentHistory(
      driver.id,
      { ...noFilter, dateFrom: '2019-12-01', dateTo: '2020-02-01' },
      1,
      20
    );
    expect(inRange.total).toBe(1);
    expect(inRange.items[0]?.id).toBe(old.id);

    // dateFrom-only / dateTo-only branches (both endpoints unset above).
    const fromOnly = await repo.listDriverAssignmentHistory(
      driver.id,
      { ...noFilter, dateFrom: '2019-12-01' },
      1,
      20
    );
    expect(fromOnly.total).toBe(2); // the still-open one always matches "unassigned_at IS NULL OR >= from"
    const toOnly = await repo.listDriverAssignmentHistory(
      driver.id,
      { ...noFilter, dateTo: '2020-02-01' },
      1,
      20
    );
    expect(toOnly.total).toBe(1);
    expect(toOnly.items[0]?.id).toBe(old.id);

    const summaryRows = await repo.driverAssignmentSummaryRows(driver.id, noFilter);
    expect(summaryRows).toHaveLength(2);
    expect(summaryRows.some(r => r.tripCount === 3 && r.distanceKm === 42.5)).toBe(true);

    // Unaffected by the date filter — matches Laravel's own unfiltered `distinct()->count()`.
    const uniqueVehicles = await repo.uniqueVehiclesForDriver(driver.id);
    expect(uniqueVehicles).toBe(2);

    const vehicleHistory = await repo.listVehicleAssignmentHistory(vehicle1.id, noFilter, 1, 20);
    expect(vehicleHistory.total).toBe(1);
    const uniqueDrivers = await repo.uniqueDriversForVehicle(vehicle1.id);
    expect(uniqueDrivers).toBe(1);
    const vehicleSummaryRows = await repo.vehicleAssignmentSummaryRows(vehicle1.id, noFilter);
    expect(vehicleSummaryRows).toHaveLength(1);
  });

  it('createIncident/recentIncidentsForDriver/recentAssignmentsForDriver/driverAssignmentHistoryForVehicle', async () => {
    const company = await seedCompany('l');
    const manager = await seedUser(company.id, 'mgr2');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());
    const [vehicle, driver] = await runWithContextAsync(context, () =>
      Promise.all([repo.createVehicle(FULL_VEHICLE_INPUT), repo.createDriver(FULL_DRIVER_INPUT)])
    );

    const incident = await repo.createIncident(driver.id, manager.id.toString(), {
      vehicleId: vehicle.id,
      incidentType: 'speeding',
      severity: 'minor',
      incidentDate: new Date('2026-09-01'),
      description: 'Doing 80 in a 60',
    });
    expect(incident.loggedBy).toBe(manager.id.toString());

    const incidents = await repo.recentIncidentsForDriver(driver.id, 20);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.id).toBe(incident.id);

    await repo.createDriverVehicleAssignment(driver.id, vehicle.id, manager.id.toString(), null);
    const recent = await repo.recentAssignmentsForDriver(driver.id, 10);
    expect(recent).toHaveLength(1);

    const vehicleHistory = await repo.driverAssignmentHistoryForVehicle(vehicle.id);
    expect(vehicleHistory).toHaveLength(1);
    expect(vehicleHistory[0]?.driverId).toBe(driver.id);

    // D-0182 (L6): `limit` keeps the newest N (assigned_at, then id — both descending)
    const second = await repo.createDriverVehicleAssignment(
      driver.id,
      vehicle.id,
      manager.id.toString(),
      null
    );
    expect(await repo.driverAssignmentHistoryForVehicle(vehicle.id)).toHaveLength(2);
    const newest = await repo.driverAssignmentHistoryForVehicle(vehicle.id, 1);
    expect(newest.map(a => a.id)).toEqual([second.id]);
  });

  it('positionsInWindow/latestPosition: real device_positions reads, ordered as expected', async () => {
    const company = await seedCompany('m');
    const owner = await seedUser(company.id, 'owner2');
    const product = await seedProduct(company.id, owner.id, 'p2');
    const device = await seedDevice(product.id, owner.id, 'd2');
    const repo = new FleetVehiclesDriversRepository(prisma);

    await rawPrisma.device_positions.createMany({
      data: [
        {
          device_id: device.id,
          latitude: 0,
          longitude: 0,
          speed: 10,
          recorded_at: new Date('2026-09-10T00:00:00Z'),
        },
        {
          device_id: device.id,
          latitude: 0.01,
          longitude: 0,
          speed: 20,
          recorded_at: new Date('2026-09-10T01:00:00Z'),
        },
      ],
    });

    const positions = await repo.positionsInWindow(device.id.toString(), undefined);
    expect(positions).toHaveLength(2);
    expect(positions[0]?.speed).toBe(10);

    const latest = await repo.latestPosition(device.id.toString());
    expect(latest?.speed).toBe(20);
  });

  it("maintenanceSchedulesForVehicle/maintenanceLogsForVehicle/fuelLogsForVehicle/fullTankFuelLogsForVehicle: real reads against module 18's not-yet-built write side", async () => {
    const company = await seedCompany('n');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const vehicle = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );

    await rawPrisma.vehicle_maintenance_schedules.create({
      data: { vehicle_id: BigInt(vehicle.id), service_type: 'Oil change', interval_days: 90 },
    });
    await rawPrisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: BigInt(vehicle.id),
        service_type: 'Oil change',
        service_date: new Date('2026-09-01'),
      },
    });
    await rawPrisma.fuel_logs.createMany({
      data: [
        {
          vehicle_id: BigInt(vehicle.id),
          fill_date: new Date('2026-09-01'),
          volume: 40,
          unit: 'liters',
          odometer_km: 1000,
          is_full_tank: true,
          // extend_fuel_logs (11.3) — module 4.5's write side; asserted below
          // to confirm `show()`'s embedded fuel_logs stays a full-column
          // reflection once real values exist, not just the base columns.
          station_name: 'Shell Main St',
          unit_price: 1.85,
          total_cost: 74,
          payment_method: 'fleet_card',
          receipt_reference: 'RCPT-001',
        },
        {
          vehicle_id: BigInt(vehicle.id),
          fill_date: new Date('2026-09-10'),
          volume: 40,
          unit: 'liters',
          odometer_km: 1400,
          is_full_tank: true,
        },
        {
          vehicle_id: BigInt(vehicle.id),
          fill_date: new Date('2026-09-15'),
          volume: 20,
          unit: 'liters',
          odometer_km: null,
          is_full_tank: false,
        },
      ],
    });

    const schedules = await repo.maintenanceSchedulesForVehicle(vehicle.id);
    expect(schedules).toHaveLength(1);
    const logs = await repo.maintenanceLogsForVehicle(vehicle.id, 20);
    expect(logs).toHaveLength(1);
    const fuelLogs = await repo.fuelLogsForVehicle(vehicle.id, 20);
    expect(fuelLogs).toHaveLength(3);
    // `fuelLogsForVehicle` orders by fill_date desc — the 2026-09-01 fill
    // (the one seeded with extend_fuel_logs values) sorts last.
    const oldestFuelLog = fuelLogs[fuelLogs.length - 1];
    expect(oldestFuelLog).toMatchObject({
      stationName: 'Shell Main St',
      unitPrice: 1.85,
      totalCost: 74,
      paymentMethod: 'fleet_card',
      receiptReference: 'RCPT-001',
      tripId: null,
    });
    // Excludes the partial (non-full-tank) fill — `FuelAnalyticsService`'s exact input set.
    const fullTankLogs = await repo.fullTankFuelLogsForVehicle(vehicle.id);
    expect(fullTankLogs).toHaveLength(2);
  });

  it('D-0162 updateVehicle/updateDriver: only the sent fields change (null clears), lifecycle/status setters, default lists hide retired/sold and inactive', async () => {
    const company = await seedCompany('step7');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );
    const driver = await runWithContextAsync(context, () => repo.createDriver(FULL_DRIVER_INPUT));

    const updated = await runWithContextAsync(context, () =>
      repo.updateVehicle(vehicle.id, { plate: 'NEW-123', fuelType: null, odometerKm: 500 })
    );
    expect(updated).toMatchObject({
      plate: 'NEW-123',
      fuelType: null,
      odometerKm: 500,
      name: vehicle.name,
      make: vehicle.make,
    });
    expect(
      await runWithContextAsync(context, () => repo.updateVehicle('999999999', { plate: 'x' }))
    ).toBeUndefined();

    const driverUpdated = await runWithContextAsync(context, () =>
      repo.updateDriver(driver.id, { phone: '555-1', certifications: null })
    );
    expect(driverUpdated).toMatchObject({
      phone: '555-1',
      certifications: null,
      firstName: driver.firstName,
    });

    // retire / sold vehicles leave the default list; include_inactive brings them back
    await runWithContextAsync(context, () => repo.setVehicleLifecycleStatus(vehicle.id, 'retired'));
    expect(
      (await runWithContextAsync(context, () => repo.listVehicles({ includeInactive: false })))
        .items
    ).toHaveLength(0);
    expect(
      (await runWithContextAsync(context, () => repo.listVehicles({ includeInactive: true }))).items
    ).toHaveLength(1);
    const reactivated = await runWithContextAsync(context, () =>
      repo.setVehicleLifecycleStatus(vehicle.id, 'active')
    );
    expect(reactivated?.lifecycleStatus).toBe('active');
    expect(
      (await runWithContextAsync(context, () => repo.listVehicles({ includeInactive: false })))
        .items
    ).toHaveLength(1);

    await runWithContextAsync(context, () => repo.setDriverStatus(driver.id, 'inactive'));
    expect(
      (await runWithContextAsync(context, () => repo.listDrivers({ includeInactive: false }))).items
    ).toHaveLength(0);
    expect(
      (await runWithContextAsync(context, () => repo.listDrivers({ includeInactive: true }))).items
    ).toHaveLength(1);
  });
});

describe.skipIf(!dbAvailable)(
  'FleetVehiclesDriversRepository list search/filters/sort/paging (D-0164, B1, real Postgres)',
  () => {
    async function seedVehicles(companyId: string) {
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(companyId);
      const make = (input: Partial<CreateVehicleInput> & { name: string }) =>
        runWithContextAsync(ctx, () =>
          repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: null, vin: null, ...input })
        );
      const alpha = await make({
        name: `Alpha Truck${MARK}`,
        plate: 'AAA-111',
        vehicleCategory: 'rigid',
        fuelType: 'diesel',
        odometerKm: 300,
      });
      const bravo = await make({
        name: `Bravo Van${MARK}`,
        plate: 'BBB-222',
        vehicleCategory: 'van',
        fuelType: 'petrol',
        ownershipType: 'leased',
        odometerKm: 100,
      });
      const charlie = await make({
        name: `Charlie Truck${MARK}`,
        vin: 'VIN-CHARLIE-9',
        vehicleCategory: 'rigid',
        fuelType: 'diesel',
        odometerKm: 200,
      });
      return { repo, ctx, alpha, bravo, charlie };
    }

    const names = (items: { name: string }[]) => items.map(v => v.name.replace(MARK, ''));

    it('search matches name/plate/VIN case-insensitively; filters combine; default order is name asc', async () => {
      const company = await seedCompany('l1');
      const { repo, ctx } = await seedVehicles(company.id.toString());

      const all = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false })
      );
      expect(names(all.items)).toEqual(['Alpha Truck', 'Bravo Van', 'Charlie Truck']);
      expect(all.total).toBe(3);

      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: false, search: 'TRUCK' })
            )
          ).items
        )
      ).toEqual(['Alpha Truck', 'Charlie Truck']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: false, search: 'bbb-2' })
            )
          ).items
        )
      ).toEqual(['Bravo Van']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: false, search: 'charlie-9' })
            )
          ).items
        )
      ).toEqual(['Charlie Truck']);
      expect(
        (
          await runWithContextAsync(ctx, () =>
            repo.listVehicles({ includeInactive: false, search: 'nothing-matches' })
          )
        ).items
      ).toEqual([]);

      const combined = await runWithContextAsync(ctx, () =>
        repo.listVehicles({
          includeInactive: false,
          vehicleCategory: 'rigid',
          fuelType: 'diesel',
          search: 'alpha',
        })
      );
      expect(names(combined.items)).toEqual(['Alpha Truck']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: false, ownershipType: 'leased' })
            )
          ).items
        )
      ).toEqual(['Bravo Van']);
    });

    it('sorts by the whitelisted column in either direction, and pages without duplicating or dropping rows', async () => {
      const company = await seedCompany('l2');
      const { repo, ctx } = await seedVehicles(company.id.toString());

      const byOdometerDesc = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false, sortBy: 'odometer_km', sortOrder: 'desc' })
      );
      expect(names(byOdometerDesc.items)).toEqual(['Alpha Truck', 'Charlie Truck', 'Bravo Van']);
      const byNameDesc = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false, sortBy: 'name', sortOrder: 'desc' })
      );
      expect(names(byNameDesc.items)).toEqual(['Charlie Truck', 'Bravo Van', 'Alpha Truck']);

      const page1 = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false, window: { page: 1, perPage: 2 } })
      );
      const page2 = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false, window: { page: 2, perPage: 2 } })
      );
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
      expect(names(page1.items)).toEqual(['Alpha Truck', 'Bravo Van']);
      expect(names(page2.items)).toEqual(['Charlie Truck']);

      // sorting on a column where every row ties (created_at within one second) must still page stably (id tie-break, D-0147)
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const result = await runWithContextAsync(ctx, () =>
          repo.listVehicles({
            includeInactive: false,
            sortBy: 'created_at',
            sortOrder: 'asc',
            window: { page, perPage: 1 },
          })
        );
        seen.push(...result.items.map(v => v.id));
      }
      expect(new Set(seen).size).toBe(3);
    });

    it('status wins over include_inactive; has_tracker / has_driver follow the open assignments', async () => {
      const company = await seedCompany('l3');
      const { repo, ctx, alpha, bravo, charlie } = await seedVehicles(company.id.toString());
      const user = await seedUser(company.id, 'l3');
      const product = await seedProduct(company.id, user.id, 'l3');
      const device = await seedDevice(product.id, user.id, 'l3');
      const driver = await runWithContextAsync(ctx, () => repo.createDriver(FULL_DRIVER_INPUT));

      await runWithContextAsync(ctx, () => repo.setVehicleLifecycleStatus(charlie.id, 'retired'));
      await rawPrisma.vehicle_device_assignments.create({
        data: { vehicle_id: BigInt(alpha.id), device_id: device.id, assigned_at: new Date() },
      });
      await rawPrisma.driver_vehicle_assignments.create({
        data: {
          vehicle_id: BigInt(bravo.id),
          driver_id: BigInt(driver.id),
          assigned_at: new Date(),
        },
      });

      expect(
        names(
          (await runWithContextAsync(ctx, () => repo.listVehicles({ includeInactive: false })))
            .items
        )
      ).toEqual(['Alpha Truck', 'Bravo Van']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: false, status: 'retired' })
            )
          ).items
        )
      ).toEqual(['Charlie Truck']);
      expect(
        names(
          (await runWithContextAsync(ctx, () => repo.listVehicles({ includeInactive: true }))).items
        )
      ).toEqual(['Alpha Truck', 'Bravo Van', 'Charlie Truck']);

      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: true, hasTracker: true })
            )
          ).items
        )
      ).toEqual(['Alpha Truck']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: true, hasTracker: false })
            )
          ).items
        )
      ).toEqual(['Bravo Van', 'Charlie Truck']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: true, hasDriver: true })
            )
          ).items
        )
      ).toEqual(['Bravo Van']);
      expect(
        names(
          (
            await runWithContextAsync(ctx, () =>
              repo.listVehicles({ includeInactive: true, hasDriver: false })
            )
          ).items
        )
      ).toEqual(['Alpha Truck', 'Charlie Truck']);
    });

    it("never returns another company's vehicles", async () => {
      const mine = await seedCompany('l4a');
      const theirs = await seedCompany('l4b');
      const { repo, ctx } = await seedVehicles(mine.id.toString());
      await seedVehicles(theirs.id.toString());

      const result = await runWithContextAsync(ctx, () =>
        repo.listVehicles({
          includeInactive: false,
          search: 'Truck',
          window: { page: 1, perPage: 50 },
        })
      );
      expect(result.total).toBe(2);
    });

    it("drivers: search by 'first last' in either order, assigned / licence-expiry / status filters, name sort, paging", async () => {
      const company = await seedCompany('l5');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const soon = new Date(Date.now() + 10 * 86_400_000);
      const later = new Date(Date.now() + 200 * 86_400_000);
      const past = new Date(Date.now() - 5 * 86_400_000);
      const make = (input: Partial<CreateDriverInput>) =>
        runWithContextAsync(ctx, () =>
          repo.createDriver({ ...FULL_DRIVER_INPUT, email: null, phone: null, ...input })
        );
      const ada = await make({
        firstName: 'Ada',
        lastName: `Lovelace${MARK}`,
        licenseNumber: 'LIC-ADA',
        licenseExpiryDate: soon,
        availabilityStatus: 'available',
        employmentStatus: 'full_time',
      });
      await make({
        firstName: 'Grace',
        lastName: `Hopper${MARK}`,
        licenseNumber: 'LIC-GRACE',
        licenseExpiryDate: later,
        availabilityStatus: 'on_leave',
        employmentStatus: 'contractor',
      });
      await make({
        firstName: 'Alan',
        lastName: `Turing${MARK}`,
        licenseNumber: 'LIC-ALAN',
        licenseExpiryDate: past,
        availabilityStatus: 'available',
        employmentStatus: 'part_time',
      });
      const vehicle = await runWithContextAsync(ctx, () => repo.createVehicle(FULL_VEHICLE_INPUT));
      await rawPrisma.driver_vehicle_assignments.create({
        data: {
          vehicle_id: BigInt(vehicle.id),
          driver_id: BigInt(ada.id),
          assigned_at: new Date(),
        },
      });

      const last = (items: { lastName: string }[]) => items.map(d => d.lastName.replace(MARK, ''));
      const list = (q: Partial<import('../fleet-vehicles-drivers.types.js').DriverListQuery>) =>
        runWithContextAsync(ctx, () => repo.listDrivers({ includeInactive: false, ...q }));

      expect(last((await list({})).items)).toEqual(['Hopper', 'Lovelace', 'Turing']); // default: last name asc
      expect(last((await list({ search: 'ada love' })).items)).toEqual(['Lovelace']);
      expect(last((await list({ search: 'lovelace ada' })).items)).toEqual(['Lovelace']);
      expect(last((await list({ search: 'LIC-GRACE' })).items)).toEqual(['Hopper']);
      expect(last((await list({ availabilityStatus: 'available' })).items)).toEqual([
        'Lovelace',
        'Turing',
      ]);
      expect(last((await list({ employmentStatus: 'contractor' })).items)).toEqual(['Hopper']);
      expect(last((await list({ assigned: true })).items)).toEqual(['Lovelace']);
      expect(last((await list({ assigned: false })).items)).toEqual(['Hopper', 'Turing']);
      // only licences that expire between today and +30 days; the already-expired one (Turing) is not "expiring"
      expect(last((await list({ licenseExpiringWithinDays: 30 })).items)).toEqual(['Lovelace']);
      expect(
        last((await list({ sortBy: 'license_expiry_date', sortOrder: 'desc' })).items)
      ).toEqual(['Hopper', 'Lovelace', 'Turing']);
      expect(last((await list({ sortBy: 'name', sortOrder: 'desc' })).items)).toEqual([
        'Turing',
        'Lovelace',
        'Hopper',
      ]);
      const paged = await list({ window: { page: 2, perPage: 2 } });
      expect(paged.total).toBe(3);
      expect(last(paged.items)).toEqual(['Turing']);
    });
  }
);

describe.skipIf(!dbAvailable)(
  'FleetVehiclesDriversRepository.vehicleOptions / driverOptions (D-0165, B2, real Postgres)',
  () => {
    it('vehicle options: active only, name order, flags for driver / tracker / yard check-in, filters, cap + total', async () => {
      const company = await seedCompany('o1');
      const user = await seedUser(company.id, 'o1');
      const product = await seedProduct(company.id, user.id, 'o1');
      const device = await seedDevice(product.id, user.id, 'o1');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const make = (name: string) =>
        runWithContextAsync(ctx, () =>
          repo.createVehicle({
            ...FULL_VEHICLE_INPUT,
            name: `${name}${MARK}`,
            plate: null,
            vin: null,
          })
        );
      const a = await make('Opt A');
      const b = await make('Opt B');
      const c = await make('Opt C');
      const retired = await make('Opt Retired');
      await runWithContextAsync(ctx, () => repo.setVehicleLifecycleStatus(retired.id, 'retired'));
      const driver = await runWithContextAsync(ctx, () => repo.createDriver(FULL_DRIVER_INPUT));
      await rawPrisma.driver_vehicle_assignments.create({
        data: { vehicle_id: BigInt(a.id), driver_id: BigInt(driver.id), assigned_at: new Date() },
      });
      await rawPrisma.vehicle_device_assignments.create({
        data: { vehicle_id: BigInt(b.id), device_id: device.id, assigned_at: new Date() },
      });
      const yard = await rawPrisma.yards.create({
        data: { company_id: company.id, name: `Opt Yard${MARK}` },
      });
      const slot = await rawPrisma.yard_slots.create({
        data: { yard_id: yard.id, slot_number: 'S1' },
      });
      await rawPrisma.yard_slot_events.create({
        data: { yard_slot_id: slot.id, vehicle_id: BigInt(c.id), checked_in_at: new Date() },
      });

      const all = await runWithContextAsync(ctx, () => repo.vehicleOptions({ limit: 1000 }));
      expect(all.total).toBe(3); // the retired vehicle is not offered
      expect(
        all.items.map(o => [
          o.vehicle.name.replace(MARK, ''),
          o.hasDriver,
          o.hasTracker,
          o.checkedIn,
        ])
      ).toEqual([
        ['Opt A', true, false, false],
        ['Opt B', false, true, false],
        ['Opt C', false, false, true],
      ]);
      const free = await runWithContextAsync(ctx, () =>
        repo.vehicleOptions({ limit: 1000, hasDriver: false })
      );
      expect(free.items.map(o => o.vehicle.name.replace(MARK, ''))).toEqual(['Opt B', 'Opt C']);
      expect(
        (
          await runWithContextAsync(ctx, () =>
            repo.vehicleOptions({ limit: 1000, search: 'opt c' })
          )
        ).items
      ).toHaveLength(1);
      const capped = await runWithContextAsync(ctx, () => repo.vehicleOptions({ limit: 2 }));
      expect(capped.items).toHaveLength(2);
      expect(capped.total).toBe(3); // total is the full match count, so the caller can tell it was cut off
    });

    it('driver options: active drivers only (deactivated / suspended not offered), assigned flag and filter, availability filter, search', async () => {
      const company = await seedCompany('o2');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const make = (firstName: string, extra: Partial<CreateDriverInput> = {}) =>
        runWithContextAsync(ctx, () =>
          repo.createDriver({
            ...FULL_DRIVER_INPUT,
            firstName,
            lastName: `${firstName}${MARK}`,
            email: null,
            phone: null,
            ...extra,
          })
        );
      const ann = await make('Ann', { availabilityStatus: 'available' });
      await make('Ben', { availabilityStatus: 'on_leave' });
      const gone = await make('Gone');
      const susp = await make('Susp');
      await runWithContextAsync(ctx, () => repo.setDriverStatus(gone.id, 'inactive'));
      await rawPrisma.drivers.update({
        where: { id: BigInt(susp.id) },
        data: { status: 'suspended' },
      });
      const vehicle = await runWithContextAsync(ctx, () => repo.createVehicle(FULL_VEHICLE_INPUT));
      await rawPrisma.driver_vehicle_assignments.create({
        data: {
          vehicle_id: BigInt(vehicle.id),
          driver_id: BigInt(ann.id),
          assigned_at: new Date(),
        },
      });

      const first = (items: { driver: { firstName: string } }[]) =>
        items.map(o => o.driver.firstName);
      const all = await runWithContextAsync(ctx, () => repo.driverOptions({ limit: 1000 }));
      expect(all.total).toBe(2);
      expect(all.items.map(o => [o.driver.firstName, o.assigned])).toEqual([
        ['Ann', true],
        ['Ben', false],
      ]);
      expect(
        first(
          (
            await runWithContextAsync(ctx, () =>
              repo.driverOptions({ limit: 1000, assigned: false })
            )
          ).items
        )
      ).toEqual(['Ben']);
      expect(
        first(
          (
            await runWithContextAsync(ctx, () =>
              repo.driverOptions({ limit: 1000, availabilityStatus: 'on_leave' })
            )
          ).items
        )
      ).toEqual(['Ben']);
      expect(
        first(
          (await runWithContextAsync(ctx, () => repo.driverOptions({ limit: 1000, search: 'ann' })))
            .items
        )
      ).toEqual(['Ann']);
      expect((await runWithContextAsync(ctx, () => repo.driverOptions({ limit: 1 }))).total).toBe(
        2
      );
    });
  }
);

describe.skipIf(!dbAvailable)(
  'D-0167 refinements (R1 nulls last, R2 categories, R3 year / status / license_state) — real Postgres',
  () => {
    it('R1: sort_by puts NULLs last in both directions (odometer_km, plate, year, license_expiry_date), while a default order is unchanged', async () => {
      const company = await seedCompany('r1');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const make = (name: string, odometerKm: number | null, year: number | null) =>
        runWithContextAsync(ctx, () =>
          repo.createVehicle({
            ...FULL_VEHICLE_INPUT,
            name: `${name}${MARK}`,
            odometerKm,
            year,
            plate: null,
            vin: null,
          })
        );
      await make('Low', 100, 2015);
      await make('High', 900, 2024);
      await make('Empty', null, null);
      const names = (items: { name: string }[]) => items.map(v => v.name.replace(MARK, ''));
      const list = (q: Partial<import('../fleet-vehicles-drivers.types.js').VehicleListQuery>) =>
        runWithContextAsync(ctx, () => repo.listVehicles({ includeInactive: false, ...q }));

      expect(names((await list({ sortBy: 'odometer_km', sortOrder: 'desc' })).items)).toEqual([
        'High',
        'Low',
        'Empty',
      ]);
      expect(names((await list({ sortBy: 'odometer_km', sortOrder: 'asc' })).items)).toEqual([
        'Low',
        'High',
        'Empty',
      ]);
      expect(names((await list({ sortBy: 'year', sortOrder: 'desc' })).items)).toEqual([
        'High',
        'Low',
        'Empty',
      ]); // R3: sort_by=year
      expect(names((await list({ sortBy: 'year', sortOrder: 'asc' })).items)).toEqual([
        'Low',
        'High',
        'Empty',
      ]);
      expect(names((await list({ sortBy: 'plate', sortOrder: 'desc' })).items)).toHaveLength(3); // every plate is NULL — ties fall back to id, no error

      const dctx = contextFor((await seedCompany('r1d')).id.toString());
      const makeDriver = (last: string, expiry: Date | null) =>
        runWithContextAsync(dctx, () =>
          repo.createDriver({
            ...FULL_DRIVER_INPUT,
            firstName: 'A',
            lastName: `${last}${MARK}`,
            licenseExpiryDate: expiry,
            email: null,
            phone: null,
          })
        );
      await makeDriver('Early', new Date('2027-01-01'));
      await makeDriver('Late', new Date('2029-01-01'));
      await makeDriver('Blank', null);
      const last = (items: { lastName: string }[]) => items.map(d => d.lastName.replace(MARK, ''));
      const dl = (q: Partial<import('../fleet-vehicles-drivers.types.js').DriverListQuery>) =>
        runWithContextAsync(dctx, () => repo.listDrivers({ includeInactive: false, ...q }));
      expect(last((await dl({ sortBy: 'license_expiry_date', sortOrder: 'desc' })).items)).toEqual([
        'Late',
        'Early',
        'Blank',
      ]);
      expect(last((await dl({ sortBy: 'license_expiry_date', sortOrder: 'asc' })).items)).toEqual([
        'Early',
        'Late',
        'Blank',
      ]);
      expect(last((await dl({})).items)).toEqual(['Blank', 'Early', 'Late']); // default: last name asc, unchanged
    });

    it('R2: the category filter is case-insensitive and distinctVehicleCategories collapses spellings', async () => {
      const company = await seedCompany('r2');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const make = (name: string, category: string | null) =>
        runWithContextAsync(ctx, () =>
          repo.createVehicle({
            ...FULL_VEHICLE_INPUT,
            name: `${name}${MARK}`,
            vehicleCategory: category,
            plate: null,
            vin: null,
          })
        );
      await make('A', 'Van');
      await make('B', 'van');
      await make('C', 'Rigid');
      await make('D', null);
      await make('E', '  ');

      const found = await runWithContextAsync(ctx, () =>
        repo.listVehicles({ includeInactive: false, vehicleCategory: 'VAN' })
      );
      expect(found.items.map(v => v.name.replace(MARK, '')).sort()).toEqual(['A', 'B']);
      expect(await runWithContextAsync(ctx, () => repo.distinctVehicleCategories())).toEqual([
        'Rigid',
        'Van',
      ]);
      // another company's categories never leak in
      const other = contextFor((await seedCompany('r2x')).id.toString());
      await runWithContextAsync(other, () =>
        repo.createVehicle({
          ...FULL_VEHICLE_INPUT,
          name: `Z${MARK}`,
          vehicleCategory: 'Tanker',
          plate: null,
          vin: null,
        })
      );
      expect(await runWithContextAsync(ctx, () => repo.distinctVehicleCategories())).toEqual([
        'Rigid',
        'Van',
      ]);
    });

    it('R3: drivers license_state (expired / expiring / valid / none) and sort_by=status', async () => {
      const company = await seedCompany('r3');
      const repo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const day = 86_400_000;
      const at = (days: number) => new Date(Date.now() + days * day);
      const make = (last: string, expiry: Date | null) =>
        runWithContextAsync(ctx, () =>
          repo.createDriver({
            ...FULL_DRIVER_INPUT,
            firstName: 'S',
            lastName: `${last}${MARK}`,
            licenseExpiryDate: expiry,
            email: null,
            phone: null,
          })
        );
      await make('Expired', at(-3));
      await make('Soon', at(10));
      await make('Later', at(90));
      await make('Nodate', null);
      const susp = await make('Susp', at(90));
      await rawPrisma.drivers.update({
        where: { id: BigInt(susp.id) },
        data: { status: 'suspended' },
      });
      const last = (items: { lastName: string }[]) =>
        items.map(d => d.lastName.replace(MARK, '')).sort();
      const dl = (q: Partial<import('../fleet-vehicles-drivers.types.js').DriverListQuery>) =>
        runWithContextAsync(ctx, () => repo.listDrivers({ includeInactive: false, ...q }));

      expect(last((await dl({ licenseState: 'expired' })).items)).toEqual(['Expired']);
      expect(last((await dl({ licenseState: 'expiring' })).items)).toEqual(['Soon']);
      expect(last((await dl({ licenseState: 'valid' })).items)).toEqual(['Later', 'Susp']);
      expect(last((await dl({ licenseState: 'none' })).items)).toEqual(['Nodate']);
      expect(
        last((await dl({ licenseState: 'valid', licenseExpiringWithinDays: 5 })).items)
      ).toEqual([]); // both filters apply (AND)
      const byStatus = await dl({ sortBy: 'status', sortOrder: 'desc' });
      expect(byStatus.items[0]?.lastName.replace(MARK, '')).toBe('Susp'); // suspended > active alphabetically, descending
      expect(
        (await dl({ sortBy: 'status', sortOrder: 'asc' })).items.at(-1)?.lastName.replace(MARK, '')
      ).toBe('Susp');
    });
  }
);

describe.skipIf(!dbAvailable)('D-0170 (B9) paged detail sub-lists — real Postgres', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const win = (page: number, perPage: number) => ({ page, perPage });

  it('maintenance logs: date range, schedule filter, search, sort (NULL cost last), stable paging, own vehicle only', async () => {
    const company = await seedCompany('b9a');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const ctx = contextFor(company.id.toString());
    const v1 = await runWithContextAsync(ctx, () => repo.createVehicle(FULL_VEHICLE_INPUT));
    const v2 = await runWithContextAsync(ctx, () =>
      repo.createVehicle({ ...FULL_VEHICLE_INPUT, name: `Other${MARK}` })
    );
    const schedule = await rawPrisma.vehicle_maintenance_schedules.create({
      data: { vehicle_id: BigInt(v1.id), service_type: 'Oil' },
    });
    const mk = (
      vehicleId: string,
      date: string,
      type: string,
      cost: number | null,
      extra: { vendor?: string; scheduleId?: bigint } = {}
    ) =>
      rawPrisma.vehicle_maintenance_logs.create({
        data: {
          vehicle_id: BigInt(vehicleId),
          service_type: type,
          service_date: day(date),
          cost,
          vendor: extra.vendor ?? null,
          maintenance_schedule_id: extra.scheduleId ?? null,
        },
      });
    await mk(v1.id, '2026-01-10', 'Oil change', 50, { vendor: 'Acme', scheduleId: schedule.id });
    await mk(v1.id, '2026-03-10', 'Brakes', null);
    await mk(v1.id, '2026-05-10', 'Tyres', 300, { vendor: 'TyreCo' });
    await mk(v1.id, '2026-07-10', 'Oil change', 60, { scheduleId: schedule.id });
    await mk(v2.id, '2026-04-04', 'Other vehicle', 1);

    const list = (
      q: Partial<import('../fleet-vehicles-drivers.types.js').MaintenanceLogListQuery> = {}
    ) =>
      runWithContextAsync(ctx, () =>
        repo.listMaintenanceLogsForVehicle(v1.id, { window: win(1, 50), ...q })
      );
    const types = (r: { items: { serviceType: string }[] }) => r.items.map(l => l.serviceType);

    expect(types(await list())).toEqual(['Oil change', 'Tyres', 'Brakes', 'Oil change']); // default: newest service date first
    expect((await list()).total).toBe(4); // the other vehicle's log is not included
    expect(types(await list({ dateFrom: day('2026-03-01'), dateTo: day('2026-05-31') }))).toEqual([
      'Tyres',
      'Brakes',
    ]);
    expect(types(await list({ maintenanceScheduleId: schedule.id.toString() }))).toEqual([
      'Oil change',
      'Oil change',
    ]);
    expect(types(await list({ search: 'tyreco' }))).toEqual(['Tyres']); // vendor
    expect(types(await list({ search: 'brak' }))).toEqual(['Brakes']);
    expect(types(await list({ sortBy: 'cost', sortOrder: 'desc' }))).toEqual([
      'Tyres',
      'Oil change',
      'Oil change',
      'Brakes',
    ]); // NULL cost last
    expect(types(await list({ sortBy: 'cost', sortOrder: 'asc' }))).toEqual([
      'Oil change',
      'Oil change',
      'Tyres',
      'Brakes',
    ]);
    const p1 = await list({ window: win(1, 3) });
    const p2 = await list({ window: win(2, 3) });
    expect([p1.items.length, p2.items.length, p1.total]).toEqual([3, 1, 4]);
    expect(new Set([...p1.items, ...p2.items].map(l => l.id)).size).toBe(4);
    await rawPrisma.vehicle_maintenance_logs.deleteMany({
      where: { vehicle_id: { in: [BigInt(v1.id), BigInt(v2.id)] } },
    });
    await rawPrisma.vehicle_maintenance_schedules.deleteMany({
      where: { vehicle_id: BigInt(v1.id) },
    });
  });

  it('fuel logs: date range, trip filter, search, sort and paging', async () => {
    const company = await seedCompany('b9b');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const ctx = contextFor(company.id.toString());
    const v = await runWithContextAsync(ctx, () => repo.createVehicle(FULL_VEHICLE_INPUT));
    const mk = (
      date: string,
      volume: number,
      extra: { vendor?: string; station?: string; cost?: number } = {}
    ) =>
      rawPrisma.fuel_logs.create({
        data: {
          vehicle_id: BigInt(v.id),
          fill_date: day(date),
          volume,
          unit: 'liters',
          vendor: extra.vendor ?? null,
          station_name: extra.station ?? null,
          cost: extra.cost ?? null,
        },
      });
    await mk('2026-01-01', 40, { vendor: 'Shell' });
    await mk('2026-02-01', 55, { station: 'Total Lahore', cost: 90 });
    await mk('2026-03-01', 30);
    const list = (q: Partial<import('../fleet-vehicles-drivers.types.js').FuelLogListQuery> = {}) =>
      runWithContextAsync(ctx, () =>
        repo.listFuelLogsForVehicle(v.id, { window: win(1, 50), ...q })
      );
    const vols = (r: { items: { volume: number }[] }) => r.items.map(f => f.volume);

    expect(vols(await list())).toEqual([30, 55, 40]);
    expect(vols(await list({ dateFrom: day('2026-01-15') }))).toEqual([30, 55]);
    expect(vols(await list({ search: 'lahore' }))).toEqual([55]); // station
    expect(vols(await list({ search: 'shell' }))).toEqual([40]); // vendor
    expect(vols(await list({ sortBy: 'volume', sortOrder: 'desc' }))).toEqual([55, 40, 30]);
    expect(vols(await list({ sortBy: 'cost', sortOrder: 'desc' }))).toEqual([55, 30, 40]); // only one has a cost -> it leads; the NULL-cost rows follow, tie-broken by id in the same direction
    expect((await list({ tripId: '99999999' })).total).toBe(0);
    expect((await list({ window: win(2, 2) })).items).toHaveLength(1);
    await rawPrisma.fuel_logs.deleteMany({ where: { vehicle_id: BigInt(v.id) } });
  });

  it('incidents: scoped to a driver or to a vehicle, severity / date / search filters, sort', async () => {
    const company = await seedCompany('b9c');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const ctx = contextFor(company.id.toString());
    const v = await runWithContextAsync(ctx, () => repo.createVehicle(FULL_VEHICLE_INPUT));
    const d1 = await runWithContextAsync(ctx, () => repo.createDriver(FULL_DRIVER_INPUT));
    const d2 = await runWithContextAsync(ctx, () =>
      repo.createDriver({ ...FULL_DRIVER_INPUT, lastName: `Two${MARK}` })
    );
    const user = await seedUser(company.id, 'b9c');
    const mk = (
      driverId: string,
      vehicleId: string | null,
      date: string,
      severity: 'minor' | 'moderate' | 'severe',
      type: string
    ) =>
      rawPrisma.driver_incidents.create({
        data: {
          driver_id: BigInt(driverId),
          vehicle_id: vehicleId ? BigInt(vehicleId) : null,
          incident_date: day(date),
          severity,
          incident_type: type,
          logged_by: user.id,
        },
      });
    await mk(d1.id, v.id, '2026-02-01', 'minor', 'speeding');
    await mk(d1.id, null, '2026-04-01', 'severe', 'collision');
    await mk(d2.id, v.id, '2026-06-01', 'moderate', 'harsh braking');
    const inc = (
      scope: { driverId?: string; vehicleId?: string },
      q: Partial<import('../fleet-vehicles-drivers.types.js').IncidentListQuery> = {}
    ) => runWithContextAsync(ctx, () => repo.listIncidents(scope, { window: win(1, 50), ...q }));
    const types = (r: { items: { incidentType: string }[] }) => r.items.map(i => i.incidentType);

    expect(types(await inc({ driverId: d1.id }))).toEqual(['collision', 'speeding']);
    expect(types(await inc({ vehicleId: v.id }))).toEqual(['harsh braking', 'speeding']);
    expect(types(await inc({ driverId: d1.id }, { severity: 'severe' }))).toEqual(['collision']);
    expect(types(await inc({ vehicleId: v.id }, { driverId: d2.id }))).toEqual(['harsh braking']);
    expect(types(await inc({ driverId: d1.id }, { vehicleId: v.id }))).toEqual(['speeding']);
    expect(types(await inc({ vehicleId: v.id }, { dateFrom: day('2026-05-01') }))).toEqual([
      'harsh braking',
    ]);
    expect(types(await inc({ driverId: d1.id }, { search: 'COLL' }))).toEqual(['collision']);
    expect(
      types(await inc({ driverId: d1.id }, { sortBy: 'incident_date', sortOrder: 'asc' }))
    ).toEqual(['speeding', 'collision']);
    expect(
      (await inc({ driverId: d1.id }, { window: win(2, 1) })).items.map(i => i.incidentType)
    ).toEqual(['speeding']);
    await rawPrisma.driver_incidents.deleteMany({
      where: { driver_id: { in: [BigInt(d1.id), BigInt(d2.id)] } },
    });
  });
});

describe.skipIf(!dbAvailable)('options include_inactive (D-0171) — real Postgres', () => {
  it('vehicles: retired/sold appear only with include_inactive; drivers: inactive and suspended appear only with it', async () => {
    const company = await seedCompany('o3');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const ctx = contextFor(company.id.toString());
    const mkV = (name: string) =>
      runWithContextAsync(ctx, () =>
        repo.createVehicle({
          ...FULL_VEHICLE_INPUT,
          name: `${name}${MARK}`,
          plate: null,
          vin: null,
        })
      );
    await mkV('Live');
    const retired = await mkV('Retired');
    const sold = await mkV('Sold');
    await runWithContextAsync(ctx, () => repo.setVehicleLifecycleStatus(retired.id, 'retired'));
    await rawPrisma.vehicles.update({
      where: { id: BigInt(sold.id) },
      data: { lifecycle_status: 'sold' },
    });
    const names = (items: { vehicle: { name: string } }[]) =>
      items.map(o => o.vehicle.name.replace(MARK, '')).sort();
    expect(
      names((await runWithContextAsync(ctx, () => repo.vehicleOptions({ limit: 1000 }))).items)
    ).toEqual(['Live']);
    expect(
      names(
        (
          await runWithContextAsync(ctx, () =>
            repo.vehicleOptions({ limit: 1000, includeInactive: true })
          )
        ).items
      )
    ).toEqual(['Live', 'Retired', 'Sold']);

    const mkD = (last: string) =>
      runWithContextAsync(ctx, () =>
        repo.createDriver({
          ...FULL_DRIVER_INPUT,
          lastName: `${last}${MARK}`,
          email: null,
          phone: null,
        })
      );
    await mkD('Active');
    const gone = await mkD('Gone');
    const susp = await mkD('Susp');
    await runWithContextAsync(ctx, () => repo.setDriverStatus(gone.id, 'inactive'));
    await rawPrisma.drivers.update({
      where: { id: BigInt(susp.id) },
      data: { status: 'suspended' },
    });
    const dn = (items: { driver: { lastName: string } }[]) =>
      items.map(o => o.driver.lastName.replace(MARK, '')).sort();
    expect(
      dn((await runWithContextAsync(ctx, () => repo.driverOptions({ limit: 1000 }))).items)
    ).toEqual(['Active']);
    expect(
      dn(
        (
          await runWithContextAsync(ctx, () =>
            repo.driverOptions({ limit: 1000, includeInactive: true })
          )
        ).items
      )
    ).toEqual(['Active', 'Gone', 'Susp']);
  });
  it('driver / vehicle briefs (D-0174) resolve a whole page in one query and never cross a company boundary', async () => {
    const companyA = await seedCompany('briefA');
    const companyB = await seedCompany('briefB');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const vehicle = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.createVehicle(FULL_VEHICLE_INPUT)
    );
    const driver = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.createDriver(FULL_DRIVER_INPUT)
    );

    const own = await runWithContextAsync(contextFor(companyA.id.toString()), async () => ({
      drivers: await repo.driverBriefsByIds([driver.id, 'not-a-number', '999999999']),
      vehicles: await repo.vehicleBriefsByIds([vehicle.id, 'x']),
    }));
    expect(own.drivers.get(driver.id)).toEqual({
      id: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
    });
    expect(own.drivers.size).toBe(1);
    expect(own.vehicles.get(vehicle.id)).toEqual({
      id: vehicle.id,
      name: vehicle.name,
      plate: vehicle.plate,
    });

    const foreign = await runWithContextAsync(contextFor(companyB.id.toString()), async () => ({
      drivers: await repo.driverBriefsByIds([driver.id]),
      vehicles: await repo.vehicleBriefsByIds([vehicle.id]),
    }));
    expect(foreign.drivers.size).toBe(0);
    expect(foreign.vehicles.size).toBe(0);
    expect(
      (
        await runWithContextAsync(contextFor(companyA.id.toString()), () =>
          repo.driverBriefsByIds([])
        )
      ).size
    ).toBe(0);
  });
  it('vehicleUsage / driverUsage / deleteVehicle / deleteDriver (D-0178, C14): only a never-used record is deletable; every kind of reference blocks', async () => {
    const company = await seedCompany('c14a');
    try {
      const repo = new FleetVehiclesDriversRepository(prisma);
      const context = contextFor(company.id.toString());
      const vehicle = await runWithContextAsync(context, () =>
        repo.createVehicle(FULL_VEHICLE_INPUT)
      );
      const driver = await runWithContextAsync(context, () => repo.createDriver(FULL_DRIVER_INPUT));
      const vId = BigInt(vehicle.id);
      const dId = BigInt(driver.id);
      const usage = async () => ({
        v: await runWithContextAsync(context, () => repo.vehicleUsage(vehicle.id)),
        d: await runWithContextAsync(context, () => repo.driverUsage(driver.id)),
      });

      expect(await usage()).toEqual({ v: [], d: [] }); // brand new = never used

      await rawPrisma.fuel_logs.create({
        data: { vehicle_id: vId, fill_date: new Date('2026-09-01'), volume: 5 },
      });
      await rawPrisma.vehicle_maintenance_schedules.create({
        data: { vehicle_id: vId, service_type: 'oil' },
      });
      await rawPrisma.vehicle_maintenance_logs.create({
        data: { vehicle_id: vId, service_type: 'oil', service_date: new Date('2026-09-01') },
      });
      await rawPrisma.driver_incidents.create({
        data: {
          driver_id: dId,
          vehicle_id: vId,
          incident_type: 'x',
          incident_date: new Date('2026-09-01'),
        },
      });
      await rawPrisma.driver_vehicle_assignments.create({
        data: { driver_id: dId, vehicle_id: vId, assigned_at: new Date() },
      });
      await rawPrisma.compliance_documents.create({
        data: {
          company_id: company.id,
          documentable_type: 'vehicle',
          documentable_id: vId,
          document_type: 'Insurance',
        },
      });
      await rawPrisma.compliance_documents.create({
        data: {
          company_id: company.id,
          documentable_type: 'driver',
          documentable_id: dId,
          document_type: 'Licence',
        },
      });
      const withHistory = await usage();
      expect(withHistory.v).toEqual([
        'driver assignments',
        'fuel logs',
        'maintenance logs',
        'maintenance schedules',
        'incidents',
        'compliance documents',
      ]);
      expect(withHistory.d).toEqual(['vehicle assignments', 'incidents', 'compliance documents']);

      await rawPrisma.trips.create({
        data: { company_id: company.id, vehicle_id: vId, driver_id: dId, status: 'planned' },
      });
      expect((await usage()).v[0]).toBe('trips');
      expect((await usage()).d[0]).toBe('trips');
      // the database itself also refuses a delete while a trip exists (RESTRICT) — the app check is the friendly layer on top
      await expect(
        runWithContextAsync(context, () => repo.deleteVehicle(vehicle.id))
      ).rejects.toThrow();
      await expect(
        runWithContextAsync(context, () => repo.deleteDriver(driver.id))
      ).rejects.toThrow();

      // another company can neither see nor delete them
      const other = await seedCompany('c14b');
      expect(
        await runWithContextAsync(contextFor(other.id.toString()), () =>
          repo.deleteVehicle(vehicle.id)
        )
      ).toBe(false);

      // a never-used vehicle / driver is really deleted
      const freshVehicle = await runWithContextAsync(context, () =>
        repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: 'ZZ-EMPTY', vin: null })
      );
      const freshDriver = await runWithContextAsync(context, () =>
        repo.createDriver({ ...FULL_DRIVER_INPUT, licenseNumber: 'EMPTY' })
      );
      expect(await runWithContextAsync(context, () => repo.deleteVehicle(freshVehicle.id))).toBe(
        true
      );
      expect(await runWithContextAsync(context, () => repo.deleteDriver(freshDriver.id))).toBe(
        true
      );
      expect(
        await runWithContextAsync(context, () => repo.findVehicleById(freshVehicle.id))
      ).toBeUndefined();
      expect(
        await runWithContextAsync(context, () => repo.findDriverById(freshDriver.id))
      ).toBeUndefined();
      expect(await runWithContextAsync(context, () => repo.deleteVehicle(freshVehicle.id))).toBe(
        false
      ); // already gone
    } finally {
      await rawPrisma.trips.deleteMany({ where: { company_id: company.id } });
    }
  });
  it("status counts (D-0179, B7): grouped per status under the list's filters, ignoring status / include_inactive; company incidents are scoped through the driver", async () => {
    const company = await seedCompany('b7a');
    const other = await seedCompany('b7b');
    const repo = new FleetVehiclesDriversRepository(prisma);
    const context = contextFor(company.id.toString());
    const v1 = await runWithContextAsync(context, () =>
      repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: 'B7-1', vin: null })
    );
    await runWithContextAsync(context, () =>
      repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: 'B7-2', vin: null })
    );
    const v3 = await runWithContextAsync(context, () =>
      repo.createVehicle({
        ...FULL_VEHICLE_INPUT,
        plate: 'B7-3',
        vin: null,
        vehicleCategory: 'other',
      })
    );
    await rawPrisma.vehicles.update({
      where: { id: BigInt(v1.id) },
      data: { lifecycle_status: 'retired' },
    });
    await rawPrisma.vehicles.update({
      where: { id: BigInt(v3.id) },
      data: { lifecycle_status: 'in_maintenance' },
    });
    await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.createVehicle({ ...FULL_VEHICLE_INPUT, plate: 'B7-X', vin: null })
    );

    const all = await runWithContextAsync(context, () =>
      repo.vehicleStatusCounts({ includeInactive: false, status: 'active' })
    );
    const byStatus = Object.fromEntries(all.map(row => [row.status, row.count]));
    expect(byStatus).toEqual({ active: 1, retired: 1, in_maintenance: 1 }); // status + includeInactive ignored; the other company's vehicle never counted
    const filtered = await runWithContextAsync(context, () =>
      repo.vehicleStatusCounts({ includeInactive: false, vehicleCategory: 'other' })
    );
    expect(filtered).toEqual([{ status: 'in_maintenance', count: 1 }]); // the list's own filter still narrows the counts

    // company-wide incidents: only this company's drivers' incidents
    const driver = await runWithContextAsync(context, () =>
      repo.createDriver({ ...FULL_DRIVER_INPUT, licenseNumber: 'B7D' })
    );
    const otherDriver = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.createDriver({ ...FULL_DRIVER_INPUT, licenseNumber: 'B7O' })
    );
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: BigInt(driver.id),
        incident_type: 'mine',
        incident_date: new Date('2026-09-01'),
      },
    });
    await rawPrisma.driver_incidents.create({
      data: {
        driver_id: BigInt(otherDriver.id),
        incident_type: 'theirs',
        incident_date: new Date('2026-09-01'),
      },
    });
    const window = { page: 1, perPage: 20 };
    const mine = await runWithContextAsync(context, () =>
      repo.listIncidents({ companyId: company.id.toString() }, { window })
    );
    expect(mine.items.map(i => i.incidentType)).toEqual(['mine']);
    expect(mine.total).toBe(1);
    const theirs = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.listIncidents({ companyId: other.id.toString() }, { window })
    );
    expect(theirs.items.map(i => i.incidentType)).toEqual(['theirs']);
  });
});
