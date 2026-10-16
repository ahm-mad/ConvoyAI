import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetGeofencesRepository } from '../fleet-geofences.repository.js';
import { FleetGeofencesService } from '../fleet-geofences.service.js';
import { NoopFleetRealtime } from '../../../platform/realtime/fleet-realtime.js';
import { FleetVehiclesDriversRepository } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.repository.js';
import type { CreateVehicleInput } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers tenant
 * isolation for `geofences` (company-ruled), the `parent`-ruled
 * `geofence_events` unscoped-by-design read/write, the real FK
 * `ON DELETE CASCADE` (`geofence_events.geofence_id -> geofences.id`,
 * same discipline as module 3.1's D-0076 verification), and — most
 * importantly — an end-to-end regression test for 11.35's fix
 * (`FleetGeofencesService.checkPosition`, wired to the real
 * `FleetVehiclesDriversRepository` for device→vehicle resolution) proving
 * an `alert_on='exit'`-only geofence now correctly records real
 * transitions against real Postgres, where Laravel's original never
 * logged anything at all (`geofence-detection.md` §2.1).
 */
/** Inert trips side — these tests exercise the detector against real Postgres without a trip in progress (D-0156 covers the bridge separately). */
const NO_TRIPS = {
  findInProgressTripForVehicle: () => Promise.resolve(undefined),
  checkDestinationProximity: () => Promise.resolve(),
  recordGeofenceStopTransition: () => Promise.resolve(),
};

const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-geofences-repo-test.example';

const VEHICLE_INPUT: CreateVehicleInput = {
  name: `Truck${MARK}`,
  vehicleCategory: null,
  make: null,
  model: null,
  lengthM: null,
  widthM: null,
  heightM: null,
  acquisitionDate: null,
  acquisitionCost: null,
  plate: null,
  vin: null,
  year: null,
  fuelType: null,
  tankCapacityLiters: null,
  odometerKm: null,
  ownershipType: null,
  costCentre: null,
  grossWeightKg: null,
  payloadKg: null,
};

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Geofences Test Co ${label}`, email: `co-${label}${MARK}` },
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
  const geofences = await rawPrisma.geofences.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const geofenceIds = geofences.map(g => g.id);

  await rawPrisma.geofence_events.deleteMany({ where: { geofence_id: { in: geofenceIds } } });
  await rawPrisma.geofences.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicle_device_assignments.deleteMany({
    where: { device_id: { in: deviceIds } },
  });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: deviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: productIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: userIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetGeofencesRepository (real Postgres)', () => {
  it("createGeofence/findGeofenceById: a geofence is only visible under its own company's context (tenant scoping)", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const repo = new FleetGeofencesRepository(prisma);
    const contextA = contextFor(companyA.id.toString());

    const geofence = await runWithContextAsync(contextA, () =>
      repo.createGeofence({
        name: `Warehouse${MARK}`,
        yardId: null,
        centerLatitude: 31.5,
        centerLongitude: 74.3,
        radiusM: 300,
        alertOn: 'both',
      })
    );
    expect(geofence.companyId).toBe(companyA.id.toString());

    const foundOwn = await runWithContextAsync(contextA, () => repo.findGeofenceById(geofence.id));
    expect(foundOwn?.id).toBe(geofence.id);

    const foundOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findGeofenceById(geofence.id)
    );
    expect(foundOther).toBeUndefined();
  });

  it('findYardBrief: real row mapping, undefined for a non-numeric or nonexistent id', async () => {
    const company = await seedCompany('y');
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const yard = await rawPrisma.yards.create({
      data: {
        company_id: company.id,
        name: `Main Yard${MARK}`,
        address: '1 Depot Rd',
        latitude: 10.5,
        longitude: 20.25,
      },
    });

    const found = await runWithContextAsync(context, () => repo.findYardBrief(yard.id.toString()));
    expect(found).toEqual({
      id: yard.id.toString(),
      name: `Main Yard${MARK}`,
      address: '1 Depot Rd',
      latitude: 10.5,
      longitude: 20.25,
    });

    expect(
      await runWithContextAsync(context, () => repo.findYardBrief('not-a-number'))
    ).toBeUndefined();
    expect(
      await runWithContextAsync(context, () => repo.findYardBrief('999999999'))
    ).toBeUndefined();

    await rawPrisma.yards.delete({ where: { id: yard.id } });
  });

  it("createGeofence: yard_id without explicit coordinates defaults the center to that yard's real lat/lng", async () => {
    const company = await seedCompany('y2');
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const yard = await rawPrisma.yards.create({
      data: { company_id: company.id, name: `Main Yard${MARK}`, latitude: 5, longitude: 6 },
    });

    const service = new FleetGeofencesService(
      repo,
      { currentVehicleIdForDevice: () => Promise.resolve(undefined) },
      {
        findVehicleById: () => Promise.resolve(undefined),
      },
      NO_TRIPS,
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const result = await runWithContextAsync(context, () =>
      service.createGeofence({
        name: `From yard${MARK}`,
        yardId: yard.id.toString(),
        centerLatitude: null,
        centerLongitude: null,
        radiusM: 50,
        alertOn: 'both',
      })
    );

    expect(result.data).toMatchObject({
      center_latitude: 5,
      center_longitude: 6,
      yard: { id: yard.id.toString() },
    });

    await rawPrisma.yards.delete({ where: { id: yard.id } });
  });

  it('updateGeofence / deleteGeofence: real update and delete against Postgres', async () => {
    const company = await seedCompany('b2');
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());

    const geofence = await runWithContextAsync(context, () =>
      repo.createGeofence({
        name: `Warehouse${MARK}`,
        yardId: null,
        centerLatitude: 31.5,
        centerLongitude: 74.3,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    const updated = await runWithContextAsync(context, () =>
      repo.updateGeofence(geofence.id, {
        name: undefined,
        radiusM: 500,
        alertOn: 'enter',
        isActive: undefined,
      })
    );
    expect(updated).toMatchObject({ radiusM: 500, alertOn: 'enter', isActive: true });

    const deleted = await runWithContextAsync(context, () => repo.deleteGeofence(geofence.id));
    expect(deleted).toBe(true);

    const gone = await runWithContextAsync(context, () => repo.findGeofenceById(geofence.id));
    expect(gone).toBeUndefined();
  });

  it('deleteGeofence cascades to geofence_events via the real FK ON DELETE CASCADE (prisma/schema.prisma)', async () => {
    const company = await seedCompany('c');
    const user = await seedUser(company.id, 'c');
    const product = await seedProduct(company.id, user.id, 'c');
    const device = await seedDevice(product.id, user.id, 'c');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());

    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    await runWithContextAsync(context, () =>
      vehiclesRepo.createDeviceAssignment(vehicle.id, device.id.toString())
    );

    const geofence = await runWithContextAsync(context, () =>
      repo.createGeofence({
        name: `Warehouse${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'both',
      })
    );
    const event = await repo.createGeofenceEvent(geofence.id, vehicle.id, 'enter');
    expect(event).toBeDefined();
    expect(await repo.findLastEventForPair(geofence.id, vehicle.id)).toMatchObject({
      id: event?.id,
    });

    await runWithContextAsync(context, () => repo.deleteGeofence(geofence.id));

    const remaining = await rawPrisma.geofence_events.findMany({
      where: { id: BigInt(event?.id ?? '0') },
    });
    expect(remaining).toHaveLength(0);
  });

  it("listRecentEventsForCompany: company-scoped via the geofence relation, filtered by the geofence's CURRENT alert_on (D-0079)", async () => {
    const companyA = await seedCompany('d1');
    const companyB = await seedCompany('d2');
    const userA = await seedUser(companyA.id, 'd1');
    const productA = await seedProduct(companyA.id, userA.id, 'd1');
    const deviceA = await seedDevice(productA.id, userA.id, 'd1');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetGeofencesRepository(prisma);
    const contextA = contextFor(companyA.id.toString());

    const vehicleA = await runWithContextAsync(contextA, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    await runWithContextAsync(contextA, () =>
      vehiclesRepo.createDeviceAssignment(vehicleA.id, deviceA.id.toString())
    );

    const exitOnlyGeofence = await runWithContextAsync(contextA, () =>
      repo.createGeofence({
        name: `Exit-only${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'exit',
      })
    );
    const bothGeofence = await runWithContextAsync(contextA, () =>
      repo.createGeofence({
        name: `Both${MARK}`,
        yardId: null,
        centerLatitude: 10,
        centerLongitude: 10,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    // The exit-only geofence has one real 'enter' recorded (persisted
    // under D-0079's always-write scheme, even though alert_on='exit'
    // doesn't want to surface it) and the both-geofence has an 'enter'
    // that SHOULD surface.
    await repo.createGeofenceEvent(exitOnlyGeofence.id, vehicleA.id, 'enter');
    await repo.createGeofenceEvent(bothGeofence.id, vehicleA.id, 'enter');

    const eventsA = (await repo.listRecentEventsForCompany(companyA.id.toString(), { limit: 50 }))
      .items;
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0]).toMatchObject({ geofenceId: bothGeofence.id, eventType: 'enter' });

    // Not visible under company B's scoping.
    const eventsB = (await repo.listRecentEventsForCompany(companyB.id.toString(), { limit: 50 }))
      .items;
    expect(eventsB).toHaveLength(0);

    // Once the exit-only geofence's `alert_on` is widened to 'both', the
    // SAME already-persisted 'enter' row now surfaces — proving the
    // filter is applied at read time against current settings, not
    // baked into the row at write time.
    await runWithContextAsync(contextA, () =>
      repo.updateGeofence(exitOnlyGeofence.id, {
        name: undefined,
        radiusM: undefined,
        alertOn: 'both',
        isActive: undefined,
      })
    );
    const eventsAfterWiden = (
      await repo.listRecentEventsForCompany(companyA.id.toString(), { limit: 50 })
    ).items;
    expect(eventsAfterWiden).toHaveLength(2);
  });

  it("11.35 FIX end-to-end: FleetGeofencesService.checkPosition, wired to the real FleetVehiclesDriversRepository, correctly records an enter->exit cycle for an alert_on='exit'-only geofence (Laravel's original never logs anything at all here)", async () => {
    const company = await seedCompany('e');
    const user = await seedUser(company.id, 'e');
    const product = await seedProduct(company.id, user.id, 'e');
    const device = await seedDevice(product.id, user.id, 'e');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const geofencesRepo = new FleetGeofencesRepository(prisma);
    const service = new FleetGeofencesService(
      geofencesRepo,
      vehiclesRepo,
      vehiclesRepo,
      NO_TRIPS,
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const context = contextFor(company.id.toString());

    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    await runWithContextAsync(context, () =>
      vehiclesRepo.createDeviceAssignment(vehicle.id, device.id.toString())
    );
    await runWithContextAsync(context, () =>
      geofencesRepo.createGeofence({
        name: `Exit-only${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'exit',
      })
    );

    // Enter: inside the geofence (0,0).
    await service.checkPosition(company.id.toString(), device.id.toString(), 0, 0);
    // Exit: far away.
    await service.checkPosition(company.id.toString(), device.id.toString(), 45, 45);
    // A repeated ping in the same "outside" state must NOT log again (dedup).
    await service.checkPosition(company.id.toString(), device.id.toString(), 46, 46);

    const geofences = (
      await runWithContextAsync(context, () => geofencesRepo.listGeofencesForCompany({}))
    ).items;
    const geofence = geofences[0];
    if (!geofence) throw new Error('expected a seeded geofence');
    const rows = await rawPrisma.geofence_events.findMany({
      where: { geofence_id: BigInt(geofence.id) },
      orderBy: { occurred_at: 'asc' },
    });
    expect(rows.map(r => r.event_type)).toEqual(['enter', 'exit']);
  });

  it('checkPosition: a device with no current vehicle assignment produces no events at all', async () => {
    const company = await seedCompany('f');
    const user = await seedUser(company.id, 'f');
    const product = await seedProduct(company.id, user.id, 'f');
    const device = await seedDevice(product.id, user.id, 'f');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const geofencesRepo = new FleetGeofencesRepository(prisma);
    const service = new FleetGeofencesService(
      geofencesRepo,
      vehiclesRepo,
      vehiclesRepo,
      NO_TRIPS,
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const context = contextFor(company.id.toString());

    await runWithContextAsync(context, () =>
      geofencesRepo.createGeofence({
        name: `Unassigned-device-test${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    // Device is never assigned to a vehicle.
    await service.checkPosition(company.id.toString(), device.id.toString(), 0, 0);

    const eventsA = (
      await geofencesRepo.listRecentEventsForCompany(company.id.toString(), { limit: 50 })
    ).items;
    expect(eventsA).toHaveLength(0);
  });

  it('D-0156 createGeofenceEvent: serialised per (geofence, vehicle) — concurrent identical transitions produce exactly ONE event, and the state machine is enforced under the lock', async () => {
    const company = await seedCompany('lock');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    const geofence = await runWithContextAsync(context, () =>
      repo.createGeofence({
        name: `Lock${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    // Exit with no history, and a bare exit, are not transitions.
    expect(await repo.createGeofenceEvent(geofence.id, vehicle.id, 'exit')).toBeUndefined();

    // Six workers see "no prior event" at once — only one may write the enter.
    const enters = await Promise.all(
      Array.from({ length: 6 }, () => repo.createGeofenceEvent(geofence.id, vehicle.id, 'enter'))
    );
    expect(enters.filter(e => e !== undefined)).toHaveLength(1);
    expect(
      await rawPrisma.geofence_events.count({ where: { geofence_id: BigInt(geofence.id) } })
    ).toBe(1);

    // enter after enter is refused; exit is accepted once; a second exit is refused.
    expect(await repo.createGeofenceEvent(geofence.id, vehicle.id, 'enter')).toBeUndefined();
    const exits = await Promise.all(
      Array.from({ length: 4 }, () => repo.createGeofenceEvent(geofence.id, vehicle.id, 'exit'))
    );
    expect(exits.filter(e => e !== undefined)).toHaveLength(1);
    expect(
      await rawPrisma.geofence_events.count({ where: { geofence_id: BigInt(geofence.id) } })
    ).toBe(2);
  });

  it('D-0156 createGeofenceEvent stamps trip_id; the FK is ON DELETE SET NULL (deleting a trip never deletes its geofence history)', async () => {
    const company = await seedCompany('tripid');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    const driver = await rawPrisma.drivers.create({
      data: { company_id: company.id, first_name: 'T', last_name: `Driver${MARK}` },
    });
    const geofence = await runWithContextAsync(context, () =>
      repo.createGeofence({
        name: `TripId${MARK}`,
        yardId: null,
        centerLatitude: 0,
        centerLongitude: 0,
        radiusM: 300,
        alertOn: 'both',
      })
    );
    const trip = await rawPrisma.trips.create({
      data: {
        company_id: company.id,
        vehicle_id: BigInt(vehicle.id),
        driver_id: driver.id,
        status: 'in_progress',
      },
    });

    const withTrip = await repo.createGeofenceEvent(
      geofence.id,
      vehicle.id,
      'enter',
      trip.id.toString()
    );
    expect(withTrip?.tripId).toBe(trip.id.toString());
    const listed = (await repo.listRecentEventsForCompany(company.id.toString(), { limit: 10 }))
      .items;
    expect(listed[0]?.tripId).toBe(trip.id.toString());

    await rawPrisma.trips.delete({ where: { id: trip.id } });
    const after = await rawPrisma.geofence_events.findMany({
      where: { geofence_id: BigInt(geofence.id) },
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.trip_id).toBeNull();
  });

  it("D-0156 yardIdsVehicleIsInside: only yards whose ACTIVE geofence's last event for the vehicle is an enter", async () => {
    const company = await seedCompany('inside');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(VEHICLE_INPUT)
    );
    const mkYard = (n: string) =>
      rawPrisma.yards.create({
        data: { company_id: company.id, name: `Yard ${n}${MARK}`, latitude: 1, longitude: 1 },
      });
    const yardIn = await mkYard('in');
    const yardOut = await mkYard('out');
    const yardNever = await mkYard('never');
    const yardInactive = await mkYard('inactive');
    const makeFence = (yardId: bigint, isActive = true) =>
      runWithContextAsync(context, async () => {
        const g = await repo.createGeofence({
          name: `F${yardId.toString()}${MARK}`,
          yardId: yardId.toString(),
          centerLatitude: 1,
          centerLongitude: 1,
          radiusM: 100,
          alertOn: 'both',
        });
        if (!isActive)
          await repo.updateGeofence(g.id, {
            name: undefined,
            radiusM: undefined,
            alertOn: undefined,
            isActive: false,
          });
        return g;
      });
    const [gIn, gOut, , gInactive] = await Promise.all([
      makeFence(yardIn.id),
      makeFence(yardOut.id),
      makeFence(yardNever.id),
      makeFence(yardInactive.id, false),
    ]);
    await repo.createGeofenceEvent(gIn.id, vehicle.id, 'enter');
    await repo.createGeofenceEvent(gOut.id, vehicle.id, 'enter');
    await repo.createGeofenceEvent(gOut.id, vehicle.id, 'exit');
    await repo.createGeofenceEvent(gInactive.id, vehicle.id, 'enter');

    const inside = await runWithContextAsync(context, () =>
      repo.yardIdsVehicleIsInside(
        vehicle.id,
        [yardIn.id, yardOut.id, yardNever.id, yardInactive.id].map(String)
      )
    );

    expect(inside).toEqual([yardIn.id.toString()]);
    expect(
      await runWithContextAsync(context, () => repo.yardIdsVehicleIsInside(vehicle.id, []))
    ).toEqual([]);
  });

  it('D-0162 updateGeofence: a new centre is stored (both coordinates) and stays put on a partial update', async () => {
    const company = await seedCompany('centre');
    const repo = new FleetGeofencesRepository(prisma);
    const context = contextFor(company.id.toString());
    const geofence = await runWithContextAsync(context, () =>
      repo.createGeofence({
        name: `Manual${MARK}`,
        yardId: null,
        centerLatitude: 1,
        centerLongitude: 2,
        radiusM: 100,
        alertOn: 'both',
      })
    );

    const moved = await runWithContextAsync(context, () =>
      repo.updateGeofence(geofence.id, {
        name: undefined,
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
        centerLatitude: 10.5,
        centerLongitude: 20.25,
      })
    );
    expect([moved?.centerLatitude, moved?.centerLongitude, moved?.radiusM]).toEqual([
      10.5, 20.25, 100,
    ]);

    const renamed = await runWithContextAsync(context, () =>
      repo.updateGeofence(geofence.id, {
        name: `Renamed${MARK}`,
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
      })
    );
    expect([renamed?.centerLatitude, renamed?.centerLongitude]).toEqual([10.5, 20.25]);
  });
});

describe.skipIf(!dbAvailable)(
  'FleetGeofencesRepository list search/filters/sort/paging + events filter-before-limit (D-0164, B1, real Postgres)',
  () => {
    async function seed(label: string) {
      const company = await seedCompany(label);
      const other = await seedCompany(`${label}x`);
      const repo = new FleetGeofencesRepository(prisma);
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const yard = await rawPrisma.yards.create({
        data: { company_id: company.id, name: `Depot${MARK}`, latitude: 1, longitude: 2 },
      });
      const mk = (
        name: string,
        extra: Partial<{
          yardId: string | null;
          radiusM: number;
          alertOn: 'enter' | 'exit' | 'both';
        }> = {}
      ) =>
        runWithContextAsync(ctx, () =>
          repo.createGeofence({
            name: `${name}${MARK}`,
            yardId: extra.yardId ?? null,
            centerLatitude: 1,
            centerLongitude: 2,
            radiusM: extra.radiusM ?? 100,
            alertOn: extra.alertOn ?? 'both',
          })
        );
      return { company, other, repo, vehiclesRepo, ctx, yard, mk };
    }
    const names = (items: { name: string }[]) => items.map(g => g.name.replace(MARK, ''));

    it("geofence list: search, is_active / yard / linked / alert_on filters, sort, paging, and another company's rows never appear", async () => {
      const { other, repo, ctx, yard, mk } = await seed('g1');
      await mk('Gate', { radiusM: 300, alertOn: 'enter' });
      const linked = await mk('Yard Fence', {
        yardId: yard.id.toString(),
        radiusM: 100,
        alertOn: 'both',
      });
      const off = await mk('Old Gate', { radiusM: 200, alertOn: 'exit' });
      await runWithContextAsync(ctx, () =>
        repo.updateGeofence(off.id, {
          name: undefined,
          radiusM: undefined,
          alertOn: undefined,
          isActive: false,
        })
      );
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.createGeofence({
          name: `Gate${MARK}`,
          yardId: null,
          centerLatitude: 0,
          centerLongitude: 0,
          radiusM: 50,
          alertOn: 'both',
        })
      );

      const list = (q: Partial<import('../fleet-geofences.types.js').GeofenceListQuery> = {}) =>
        runWithContextAsync(ctx, () => repo.listGeofencesForCompany(q));

      expect((await list()).total).toBe(3);
      expect(
        names((await list({ search: 'GATE', sortBy: 'name', sortOrder: 'asc' })).items)
      ).toEqual(['Gate', 'Old Gate']);
      expect(names((await list({ isActive: false })).items)).toEqual(['Old Gate']);
      expect(names((await list({ yardId: yard.id.toString() })).items)).toEqual(['Yard Fence']);
      expect(names((await list({ linked: true })).items)).toEqual(['Yard Fence']);
      expect(
        names((await list({ linked: false, sortBy: 'radius_m', sortOrder: 'desc' })).items)
      ).toEqual(['Gate', 'Old Gate']);
      expect(names((await list({ alertOn: 'exit' })).items)).toEqual(['Old Gate']);
      const p1 = await list({ sortBy: 'name', window: { page: 1, perPage: 2 } });
      const p2 = await list({ sortBy: 'name', window: { page: 2, perPage: 2 } });
      expect(p1.total).toBe(3);
      expect([...names(p1.items), ...names(p2.items)]).toEqual(['Gate', 'Old Gate', 'Yard Fence']);
      expect(linked.yardId).toBe(yard.id.toString());
    });

    it('D-0180 (B8) bbox: a geofence is returned when its circle overlaps the map box (centre inside, or a big circle reaching in); others and other companies never', async () => {
      const { other, repo, ctx } = await seed('g8');
      const mk = (name: string, lat: number, lng: number, radiusM: number) =>
        runWithContextAsync(ctx, () =>
          repo.createGeofence({
            name: `${name}${MARK}`,
            yardId: null,
            centerLatitude: lat,
            centerLongitude: lng,
            radiusM,
            alertOn: 'both',
          })
        );
      await mk('Inside', 31.5, 74.3, 100);
      await mk('Reaches In', 31.62, 74.3, 3000); // ~2.2 km above the box
      await mk('Too Small', 31.62, 74.3, 1000);
      await mk('Far', 24.86, 67.0, 500);
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.createGeofence({
          name: `Inside${MARK}`,
          yardId: null,
          centerLatitude: 31.5,
          centerLongitude: 74.3,
          radiusM: 50,
          alertOn: 'both',
        })
      );
      const box = { minLng: 74.2, minLat: 31.4, maxLng: 74.5, maxLat: 31.6 };
      const list = (q: Partial<import('../fleet-geofences.types.js').GeofenceListQuery> = {}) =>
        runWithContextAsync(ctx, () => repo.listGeofencesForCompany(q));

      expect(names((await list({ bbox: box })).items).sort()).toEqual(['Inside', 'Reaches In']);
      expect(
        names((await list({ bbox: { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 } })).items)
      ).toEqual([]);
      expect(names((await list({ bbox: box, search: 'reach' })).items)).toEqual(['Reaches In']);
      const paged = await list({
        bbox: box,
        sortBy: 'name',
        sortOrder: 'asc',
        window: { page: 1, perPage: 1 },
      });
      expect(paged.total).toBe(2);
      expect(names(paged.items)).toEqual(['Inside']);
    });

    it('events: the alert_on filter runs BEFORE limit/paging, so a page is full and paging is exact; geofence/vehicle/type/date/search filters', async () => {
      const { company, repo, vehiclesRepo, ctx, mk } = await seed('g2');
      const v1 = await runWithContextAsync(ctx, () =>
        vehiclesRepo.createVehicle({ ...VEHICLE_INPUT, name: `Alpha Van${MARK}` })
      );
      const v2 = await runWithContextAsync(ctx, () =>
        vehiclesRepo.createVehicle({ ...VEHICLE_INPUT, name: `Beta Van${MARK}` })
      );
      const visible = await mk('Visible Fence', { alertOn: 'both' });
      const exitOnly = await mk('Exit Fence', { alertOn: 'exit' });

      // 10 newest events belong to the exit-only geofence and are 'enter' (hidden by its alert_on); 6 older ones are visible.
      const base = Date.parse('2026-03-01T00:00:00Z');
      const insert = (
        geofenceId: string,
        vehicleId: string,
        eventType: 'enter' | 'exit',
        offsetSeconds: number
      ) =>
        rawPrisma.geofence_events.create({
          data: {
            geofence_id: BigInt(geofenceId),
            vehicle_id: BigInt(vehicleId),
            event_type: eventType,
            occurred_at: new Date(base + offsetSeconds * 1000),
          },
        });
      for (let i = 0; i < 6; i++)
        await insert(visible.id, i % 2 === 0 ? v1.id : v2.id, i % 2 === 0 ? 'enter' : 'exit', i);
      for (let i = 0; i < 10; i++) await insert(exitOnly.id, v1.id, 'enter', 100 + i);
      await insert(exitOnly.id, v1.id, 'exit', 200); // the one exit-only event that IS shown, newest of all

      const cid = company.id.toString();
      // before D-0164 `limit: 5` took the 5 newest rows (1 shown + 4 hidden) and returned 1; now it returns 5
      const flat = await repo.listRecentEventsForCompany(cid, { limit: 5 });
      expect(flat.items).toHaveLength(5);
      expect(flat.items[0]).toMatchObject({ geofenceId: exitOnly.id, eventType: 'exit' }); // newest first

      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const result = await repo.listRecentEventsForCompany(cid, {
          limit: 50,
          window: { page, perPage: 3 },
        });
        expect(result.total).toBe(7);
        seen.push(...result.items.map(event => event.id));
      }
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);

      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, geofenceId: visible.id })).items
      ).toHaveLength(6);
      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, vehicleId: v2.id })).items
      ).toHaveLength(3);
      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, eventType: 'exit' })).items
      ).toHaveLength(4);
      expect(
        (
          await repo.listRecentEventsForCompany(cid, {
            limit: 50,
            from: new Date(base + 2000),
            to: new Date(base + 4000),
          })
        ).items
      ).toHaveLength(3);
      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, search: 'beta' })).items
      ).toHaveLength(3);
      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, search: 'visible fence' })).items
      ).toHaveLength(6);
      const oldestFirst = await repo.listRecentEventsForCompany(cid, {
        limit: 50,
        sortOrder: 'asc',
      });
      expect(oldestFirst.items[0]?.geofenceId).toBe(visible.id);
      expect(
        (await repo.listRecentEventsForCompany(cid, { limit: 50, tripId: '999999999' })).items
      ).toHaveLength(0);
    });
  }
);
