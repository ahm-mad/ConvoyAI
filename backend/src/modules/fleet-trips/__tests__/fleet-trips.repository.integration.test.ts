import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetTripsRepository } from '../fleet-trips.repository.js';
import { FleetVehiclesDriversRepository } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.repository.js';
import type {
  CreateVehicleInput,
  CreateDriverInput,
} from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers tenant
 * isolation for `trips` (company-ruled), the `parent`-ruled `trip_planned_
 * yards` append pattern (sequence assignment), and the company-scoped
 * `yards`/`fleet_customers` reads this module registers for its own
 * narrow needs (D-0077's class of ownership-tightening).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-trips-repo-test.example';

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

const DRIVER_INPUT: CreateDriverInput = {
  firstName: 'Jane',
  lastName: `Doe${MARK}`,
  email: null,
  phone: null,
  licenseNumber: null,
  licenseClass: null,
  licenseExpiryDate: null,
  hireDate: null,
  employmentStatus: null,
  availabilityStatus: null,
  certifications: null,
  payrollReference: null,
};

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Trips Test Co ${label}`, email: `co-${label}${MARK}` },
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

async function seedYard(companyId: bigint, label: string) {
  return rawPrisma.yards.create({ data: { company_id: companyId, name: `Yard ${label}${MARK}` } });
}

async function seedFleetCustomer(companyId: bigint, label: string) {
  return rawPrisma.fleet_customers.create({
    data: { company_id: companyId, name: `Customer ${label}${MARK}` },
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

  await rawPrisma.trips.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.yards.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.fleet_customers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.devices.deleteMany({ where: { id: { in: deviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: productIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: userIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetTripsRepository (real Postgres)', () => {
  it("createTrip/findTripById: a trip is only visible under its own company's context (tenant scoping)", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const contextA = contextFor(companyA.id.toString());
    const [vehicle, driver] = await runWithContextAsync(contextA, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
      ])
    );

    const trip = await runWithContextAsync(contextA, () =>
      repo.createTrip({
        vehicleId: vehicle.id,
        driverId: driver.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-00001',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      })
    );

    const foundOwn = await runWithContextAsync(contextA, () => repo.findTripById(trip.id));
    expect(foundOwn?.id).toBe(trip.id);
    expect(foundOwn?.status).toBe('planned');

    const foundOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findTripById(trip.id)
    );
    expect(foundOther).toBeUndefined();
  });

  it('vehicleHasActiveTrip: true only while a trip is in_progress, false again once completed, excludeTripId works', async () => {
    const company = await seedCompany('c');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const context = contextFor(company.id.toString());
    const [vehicle, driver] = await runWithContextAsync(context, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
      ])
    );
    const trip = await runWithContextAsync(context, () =>
      repo.createTrip({
        vehicleId: vehicle.id,
        driverId: driver.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-00001',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      })
    );

    expect(
      await runWithContextAsync(context, () => repo.vehicleHasActiveTrip(vehicle.id, undefined))
    ).toBe(false);
    // D-0182 (L4): a freshly created trip is `planned` — until it starts
    expect(await runWithContextAsync(context, () => repo.vehicleHasPlannedTrip(vehicle.id))).toBe(
      true
    );

    await runWithContextAsync(context, () =>
      repo.updateTrip(trip.id, { status: 'in_progress', actualStartAt: new Date() })
    );
    expect(await runWithContextAsync(context, () => repo.vehicleHasPlannedTrip(vehicle.id))).toBe(
      false
    );
    expect(
      await runWithContextAsync(context, () => repo.vehicleHasActiveTrip(vehicle.id, undefined))
    ).toBe(true);
    // Excluding the trip itself (re-start check) reports no OTHER active trip.
    expect(
      await runWithContextAsync(context, () => repo.vehicleHasActiveTrip(vehicle.id, trip.id))
    ).toBe(false);

    await runWithContextAsync(context, () =>
      repo.updateTrip(trip.id, { status: 'completed', actualEndAt: new Date() })
    );
    expect(
      await runWithContextAsync(context, () => repo.vehicleHasActiveTrip(vehicle.id, undefined))
    ).toBe(false);
  });

  it('createPlannedYards: assigns sequence in payload order, listPlannedYardsForTrip returns them in that order', async () => {
    const company = await seedCompany('d');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const context = contextFor(company.id.toString());
    const [vehicle, driver, yardA, yardB] = await runWithContextAsync(context, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
        seedYard(company.id, 'a'),
        seedYard(company.id, 'b'),
      ])
    );
    const trip = await runWithContextAsync(context, () =>
      repo.createTrip({
        vehicleId: vehicle.id,
        driverId: driver.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-00001',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      })
    );

    await repo.createPlannedYards(trip.id, [
      {
        yardId: yardB.id.toString(),
        stopPurpose: 'unload',
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
      {
        yardId: yardA.id.toString(),
        stopPurpose: 'load',
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
    ]);

    const planned = await repo.listPlannedYardsForTrip(trip.id);
    expect(planned.map(p => p.sequence)).toEqual([1, 2]);
    expect(planned.map(p => p.yardId)).toEqual([yardB.id.toString(), yardA.id.toString()]);
    expect(planned[0]?.status).toBe('planned');
  });

  it("findYardBrief/findFleetCustomerBrief: only resolve rows owned by the caller's own company (tenant isolation, D-0077's class of tightening)", async () => {
    const companyA = await seedCompany('e');
    const companyB = await seedCompany('f');
    const repo = new FleetTripsRepository(prisma);
    const [yardB, customerB] = await Promise.all([
      seedYard(companyB.id, 'e'),
      seedFleetCustomer(companyB.id, 'e'),
    ]);

    const yardFromOwnerCompany = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findYardBrief(yardB.id.toString())
    );
    expect(yardFromOwnerCompany?.name).toContain('Yard e');

    const yardFromOtherCompany = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findYardBrief(yardB.id.toString())
    );
    expect(yardFromOtherCompany).toBeUndefined();

    const customerFromOtherCompany = await runWithContextAsync(
      contextFor(companyA.id.toString()),
      () => repo.findFleetCustomerBrief(customerB.id.toString())
    );
    expect(customerFromOtherCompany).toBeUndefined();

    const customerFromOwnerCompany = await runWithContextAsync(
      contextFor(companyB.id.toString()),
      () => repo.findFleetCustomerBrief(customerB.id.toString())
    );
    expect(customerFromOwnerCompany?.name).toContain('Customer e');
  });

  it('positionsInWindow: real device_positions reads bounded by the given window', async () => {
    const company = await seedCompany('g');
    const owner = await seedUser(company.id, 'owner');
    const product = await seedProduct(company.id, owner.id, 'p');
    const device = await seedDevice(product.id, owner.id, 'd');
    const repo = new FleetTripsRepository(prisma);

    await rawPrisma.device_positions.createMany({
      data: [
        {
          device_id: device.id,
          latitude: 0,
          longitude: 0,
          recorded_at: new Date('2026-09-01T00:00:00Z'),
        },
        {
          device_id: device.id,
          latitude: 0.01,
          longitude: 0,
          recorded_at: new Date('2026-09-01T01:00:00Z'),
        },
        {
          device_id: device.id,
          latitude: 0.02,
          longitude: 0,
          recorded_at: new Date('2026-09-02T00:00:00Z'),
        },
      ],
    });

    const positions = await repo.positionsInWindow(
      device.id.toString(),
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-01T12:00:00Z')
    );

    expect(positions).toHaveLength(2);
  });

  it("countTripsForCompany / listTrips: scoped to the caller's own company, status/vehicle filters apply", async () => {
    const companyA = await seedCompany('h');
    const companyB = await seedCompany('i');
    const vehiclesRepoA = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const contextA = contextFor(companyA.id.toString());
    const [vehicle, driver] = await runWithContextAsync(contextA, () =>
      Promise.all([
        vehiclesRepoA.createVehicle(VEHICLE_INPUT),
        vehiclesRepoA.createDriver(DRIVER_INPUT),
      ])
    );
    const [vehicleB, driverB] = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      Promise.all([
        vehiclesRepoA.createVehicle(VEHICLE_INPUT),
        vehiclesRepoA.createDriver(DRIVER_INPUT),
      ])
    );

    await runWithContextAsync(contextA, () =>
      repo.createTrip({
        vehicleId: vehicle.id,
        driverId: driver.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-00001',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      })
    );
    await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.createTrip({
        vehicleId: vehicleB.id,
        driverId: driverB.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-00001',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      })
    );

    const countA = await runWithContextAsync(contextA, () => repo.countTripsForCompany());
    expect(countA).toBe(1);

    const { items, total } = await runWithContextAsync(contextA, () =>
      repo.listTrips({
        status: ['planned'],
        vehicleId: undefined,
        driverId: undefined,
        customerId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 1,
        perPage: 20,
      })
    );
    expect(total).toBe(1);
    expect(items[0]?.vehicleId).toBe(vehicle.id);

    await runWithContextAsync(contextA, () =>
      repo.updateTrip(items[0]?.id ?? '0', { plannedStartAt: new Date('2026-09-15T00:00:00Z') })
    );

    const inRange = await runWithContextAsync(contextA, () =>
      repo.listTrips({
        status: undefined,
        vehicleId: undefined,
        driverId: undefined,
        customerId: undefined,
        dateFrom: '2026-09-01',
        dateTo: '2026-09-30',
        page: 1,
        perPage: 20,
      })
    );
    expect(inRange.total).toBe(1);

    const outOfRange = await runWithContextAsync(contextA, () =>
      repo.listTrips({
        status: undefined,
        vehicleId: undefined,
        driverId: undefined,
        customerId: undefined,
        dateFrom: '2020-01-01',
        dateTo: '2020-01-31',
        page: 1,
        perPage: 20,
      })
    );
    expect(outOfRange.total).toBe(0);
  });

  it('D-0155 stops: recordStopEvent updates the stop and appends the audit event atomically; findPlannedYard is trip-scoped; events list oldest-first; cascade on trip delete', async () => {
    const company = await seedCompany('j');
    const owner = await seedUser(company.id, 'owner-j');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const context = contextFor(company.id.toString(), owner.id.toString());
    const [vehicle, driver, yard] = await runWithContextAsync(context, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
        seedYard(company.id, 'j'),
      ])
    );
    const newTrip = (reference: string) =>
      runWithContextAsync(context, () =>
        repo.createTrip({
          vehicleId: vehicle.id,
          driverId: driver.id,
          deviceId: null,
          fleetCustomerId: null,
          tripReference: reference,
          purpose: null,
          originAddress: null,
          originLatitude: null,
          originLongitude: null,
          destinationAddress: null,
          destinationLatitude: null,
          destinationLongitude: null,
          plannedStartAt: null,
          plannedEndAt: null,
          plannedDistanceKm: null,
          odometerStartKm: null,
          notes: null,
          createdBy: owner.id.toString(),
        })
      );
    const trip = await newTrip('TRP-J1');
    const otherTrip = await newTrip('TRP-J2');
    const [stop] = await repo.createPlannedYards(trip.id, [
      {
        yardId: yard.id.toString(),
        stopPurpose: null,
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
    ]);
    const stopId = stop?.id ?? '0';

    // A stop id is only resolvable through ITS trip.
    expect((await repo.findPlannedYard(trip.id, stopId))?.id).toBe(stopId);
    expect(await repo.findPlannedYard(otherTrip.id, stopId)).toBeUndefined();
    expect(await repo.findPlannedYard(trip.id, 'abc')).toBeUndefined();

    const arrivedAt = new Date('2026-09-24T09:00:00Z');
    const departedAt = new Date('2026-09-24T09:30:00Z');
    const arrive = await repo.recordStopEvent(trip.id, stopId, {
      eventType: 'arrive',
      source: 'manual',
      occurredAt: arrivedAt,
      reason: null,
      recordedBy: owner.id.toString(),
      stopUpdate: { status: 'arrived', actualArrivalAt: arrivedAt, dwellTimeMinutes: null },
    });
    expect(arrive?.stop).toMatchObject({
      status: 'arrived',
      actualSource: 'manual',
      actualArrivalAt: arrivedAt,
    });
    expect(arrive?.event).toMatchObject({
      eventType: 'arrive',
      source: 'manual',
      recordedBy: owner.id.toString(),
    });

    await repo.recordStopEvent(trip.id, stopId, {
      eventType: 'depart',
      source: 'manual',
      occurredAt: departedAt,
      reason: 'left early',
      recordedBy: owner.id.toString(),
      stopUpdate: { status: 'departed', actualDepartureAt: departedAt, dwellTimeMinutes: 30 },
    });

    const stopNow = await repo.findPlannedYard(trip.id, stopId);
    expect(stopNow).toMatchObject({
      status: 'departed',
      dwellTimeMinutes: 30,
      actualArrivalAt: arrivedAt,
      actualDepartureAt: departedAt,
    });

    const events = await repo.listStopEventsForTrip(trip.id);
    expect(events.map(e => e.eventType)).toEqual(['arrive', 'depart']);
    expect(events[1]?.reason).toBe('left early');
    expect(await repo.listStopEventsForTrip(otherTrip.id)).toEqual([]);

    // Append-only log hangs off the trip: deleting the trip removes its events (FK cascade), nothing dangles.
    await rawPrisma.trips.delete({ where: { id: BigInt(trip.id) } });
    expect(await rawPrisma.trip_stop_events.count({ where: { trip_id: BigInt(trip.id) } })).toBe(0);
  });

  it('D-0155 latestPosition: newest position at or before the cut-off, undefined when none', async () => {
    const company = await seedCompany('k');
    const owner = await seedUser(company.id, 'owner-k');
    const product = await seedProduct(company.id, owner.id, 'pk');
    const device = await seedDevice(product.id, owner.id, 'dk');
    const repo = new FleetTripsRepository(prisma);

    await rawPrisma.device_positions.createMany({
      data: [
        {
          device_id: device.id,
          latitude: 1,
          longitude: 1,
          recorded_at: new Date('2026-09-01T00:00:00Z'),
        },
        {
          device_id: device.id,
          latitude: 2,
          longitude: 2,
          recorded_at: new Date('2026-09-01T01:00:00Z'),
        },
        {
          device_id: device.id,
          latitude: 3,
          longitude: 3,
          recorded_at: new Date('2026-09-02T00:00:00Z'),
        },
      ],
    });

    const atCutoff = await repo.latestPosition(
      device.id.toString(),
      new Date('2026-09-01T12:00:00Z')
    );
    expect(atCutoff?.latitude).toBe(2);
    expect(
      await repo.latestPosition(device.id.toString(), new Date('2020-01-01T00:00:00Z'))
    ).toBeUndefined();
  });

  it('D-0156 worker-path queries: in-progress trip by vehicle (no request context, company-filtered), destination set once, planned stops -> missed, sensor writes only fill', async () => {
    const company = await seedCompany('w');
    const otherCompany = await seedCompany('w2');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const context = contextFor(company.id.toString());
    const [vehicle, driver, yard] = await runWithContextAsync(context, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
        seedYard(company.id, 'w'),
      ])
    );
    const trip = await rawPrisma.trips.create({
      data: {
        company_id: company.id,
        vehicle_id: BigInt(vehicle.id),
        driver_id: BigInt(driver.id),
        status: 'in_progress',
        actual_start_at: new Date('2026-09-24T08:00:00Z'),
      },
    });
    await rawPrisma.trips.create({
      data: {
        company_id: company.id,
        vehicle_id: BigInt(vehicle.id),
        driver_id: BigInt(driver.id),
        status: 'planned',
      },
    });

    // No request context at all (ingestion worker): works, and only returns the in_progress one of THIS company.
    const found = await repo.findInProgressTripForVehicleUnscoped(
      company.id.toString(),
      vehicle.id
    );
    expect(found?.id).toBe(trip.id.toString());
    expect(
      await repo.findInProgressTripForVehicleUnscoped(otherCompany.id.toString(), vehicle.id)
    ).toBeUndefined();

    // destination_reached_at: set once, never moved.
    const first = new Date('2026-09-24T09:00:00Z');
    expect(await repo.setDestinationReachedIfUnset(trip.id.toString(), first)).toBe(true);
    expect(
      await repo.setDestinationReachedIfUnset(trip.id.toString(), new Date('2026-09-24T10:00:00Z'))
    ).toBe(false);
    const reloaded = await rawPrisma.trips.findUniqueOrThrow({ where: { id: trip.id } });
    expect(reloaded.destination_reached_at).toEqual(first);

    // stops + sensor fill-only semantics
    const [a, b] = await repo.createPlannedYards(trip.id.toString(), [
      {
        yardId: yard.id.toString(),
        stopPurpose: null,
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
      {
        yardId: yard.id.toString(),
        stopPurpose: null,
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
    ]);
    const sensorArrive = (stopId: string, at: Date) =>
      repo.recordStopEvent(trip.id.toString(), stopId, {
        eventType: 'arrive',
        source: 'geofence_auto',
        occurredAt: at,
        reason: null,
        recordedBy: null,
        requireStatus: 'planned',
        stopUpdate: { status: 'arrived', actualArrivalAt: at, dwellTimeMinutes: null },
      });
    const written = await sensorArrive(a?.id ?? '0', first);
    expect(written?.stop).toMatchObject({ status: 'arrived', actualSource: 'geofence_auto' });
    expect(written?.event).toMatchObject({ source: 'geofence_auto', recordedBy: null });
    // the stop is no longer planned -> a second sensor write is a no-op and appends NO event
    expect(await sensorArrive(a?.id ?? '0', new Date('2026-09-24T09:30:00Z'))).toBeUndefined();
    expect(await repo.listStopEventsForTrip(trip.id.toString())).toHaveLength(1);

    // completion: only the still-planned stop becomes missed
    await repo.markPlannedStopsMissed(trip.id.toString());
    const stops = await repo.listPlannedYardsForTrip(trip.id.toString());
    expect(stops.map(x => x.status)).toEqual(['arrived', 'missed']);
    expect(b?.id).toBe(stops[1]?.id);
  });

  it("D-0162 deleteTrip: removes the trip, its planned stops and their audit events (FK cascade); geofence events keep their rows with trip_id NULL; other companies can't delete it", async () => {
    const company = await seedCompany('del');
    const other = await seedCompany('del2');
    const owner = await seedUser(company.id, 'owner-del');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetTripsRepository(prisma);
    const context = contextFor(company.id.toString(), owner.id.toString());
    const [vehicle, driver, yard] = await runWithContextAsync(context, () =>
      Promise.all([
        vehiclesRepo.createVehicle(VEHICLE_INPUT),
        vehiclesRepo.createDriver(DRIVER_INPUT),
        seedYard(company.id, 'del'),
      ])
    );
    const trip = await runWithContextAsync(context, () =>
      repo.createTrip({
        vehicleId: vehicle.id,
        driverId: driver.id,
        deviceId: null,
        fleetCustomerId: null,
        tripReference: 'TRP-DEL',
        purpose: null,
        originAddress: null,
        originLatitude: null,
        originLongitude: null,
        destinationAddress: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedStartAt: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: owner.id.toString(),
      })
    );
    const [stop] = await repo.createPlannedYards(trip.id, [
      {
        yardId: yard.id.toString(),
        stopPurpose: null,
        plannedArrivalAt: null,
        plannedDepartureAt: null,
        notes: null,
      },
    ]);
    await repo.recordStopEvent(trip.id, stop?.id ?? '0', {
      eventType: 'arrive',
      source: 'manual',
      occurredAt: new Date('2026-09-24T09:00:00Z'),
      reason: null,
      recordedBy: owner.id.toString(),
      stopUpdate: {
        status: 'arrived',
        actualArrivalAt: new Date('2026-09-24T09:00:00Z'),
        dwellTimeMinutes: null,
      },
    });
    const geofence = await rawPrisma.geofences.create({
      data: {
        company_id: company.id,
        name: 'g',
        center_latitude: 0,
        center_longitude: 0,
        radius_m: 100,
        alert_on: 'both',
      },
    });
    const gEvent = await rawPrisma.geofence_events.create({
      data: {
        geofence_id: geofence.id,
        vehicle_id: BigInt(vehicle.id),
        event_type: 'enter',
        occurred_at: new Date(),
        trip_id: BigInt(trip.id),
      },
    });

    expect(
      await runWithContextAsync(contextFor(other.id.toString()), () => repo.deleteTrip(trip.id))
    ).toBe(false);
    expect(await runWithContextAsync(context, () => repo.deleteTrip(trip.id))).toBe(true);
    expect(await runWithContextAsync(context, () => repo.deleteTrip(trip.id))).toBe(false);

    expect(await rawPrisma.trip_planned_yards.count({ where: { trip_id: BigInt(trip.id) } })).toBe(
      0
    );
    expect(await rawPrisma.trip_stop_events.count({ where: { trip_id: BigInt(trip.id) } })).toBe(0);
    const kept = await rawPrisma.geofence_events.findUniqueOrThrow({ where: { id: gEvent.id } });
    expect(kept.trip_id).toBeNull();
    await rawPrisma.geofences.deleteMany({ where: { id: geofence.id } });
  });
});

describe.skipIf(!dbAvailable)(
  'FleetTripsRepository.listTrips search / multi-status / sort / paging (D-0164, B1, real Postgres)',
  () => {
    it('status list, search across reference/address/purpose/vehicle/driver, sort_by, stable paging, company isolation', async () => {
      const company = await seedCompany('l1');
      const other = await seedCompany('l2');
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const repo = new FleetTripsRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const [truck, van] = await runWithContextAsync(ctx, () =>
        Promise.all([
          vehiclesRepo.createVehicle({
            ...VEHICLE_INPUT,
            name: `Atlas Truck${MARK}`,
            plate: 'ATL-777',
          }),
          vehiclesRepo.createVehicle({
            ...VEHICLE_INPUT,
            name: `Breeze Van${MARK}`,
            plate: 'BRZ-888',
          }),
        ])
      );
      const [ada, grace] = await runWithContextAsync(ctx, () =>
        Promise.all([
          vehiclesRepo.createDriver({
            ...DRIVER_INPUT,
            firstName: 'Ada',
            lastName: `Lovelace${MARK}`,
          }),
          vehiclesRepo.createDriver({
            ...DRIVER_INPUT,
            firstName: 'Grace',
            lastName: `Hopper${MARK}`,
          }),
        ])
      );
      const base = {
        deviceId: null,
        fleetCustomerId: null,
        originLatitude: null,
        originLongitude: null,
        destinationLatitude: null,
        destinationLongitude: null,
        plannedEndAt: null,
        plannedDistanceKm: null,
        odometerStartKm: null,
        notes: null,
        createdBy: '1',
      };
      const make = (
        reference: string,
        vehicleId: string,
        driverId: string,
        extra: {
          purpose?: string | null;
          origin?: string | null;
          destination?: string | null;
          plannedStartAt?: Date | null;
        }
      ) =>
        runWithContextAsync(ctx, () =>
          repo.createTrip({
            ...base,
            vehicleId,
            driverId,
            tripReference: reference,
            purpose: extra.purpose ?? null,
            originAddress: extra.origin ?? null,
            destinationAddress: extra.destination ?? null,
            plannedStartAt: extra.plannedStartAt ?? null,
          })
        );
      const t1 = await make('TRP-A', truck.id, ada.id, {
        purpose: 'cement delivery',
        origin: 'Lahore Depot',
        destination: 'Islamabad',
        plannedStartAt: new Date('2026-05-03T00:00:00Z'),
      });
      const t2 = await make('TRP-B', van.id, grace.id, {
        purpose: 'parcels',
        origin: 'Karachi Port',
        destination: 'Hyderabad',
        plannedStartAt: new Date('2026-05-01T00:00:00Z'),
      });
      const t3 = await make('TRP-C', truck.id, grace.id, {
        purpose: 'return',
        destination: 'Lahore Depot',
        plannedStartAt: new Date('2026-05-02T00:00:00Z'),
      });
      await rawPrisma.trips.update({
        where: { id: BigInt(t2.id) },
        data: { status: 'in_progress' },
      });
      await rawPrisma.trips.update({ where: { id: BigInt(t3.id) }, data: { status: 'completed' } });
      const otherVehicle = await runWithContextAsync(contextFor(other.id.toString()), () =>
        vehiclesRepo.createVehicle({ ...VEHICLE_INPUT, name: `Atlas Truck${MARK}` })
      );
      const otherDriver = await runWithContextAsync(contextFor(other.id.toString()), () =>
        vehiclesRepo.createDriver({ ...DRIVER_INPUT, firstName: 'Ada' })
      );
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.createTrip({
          ...base,
          vehicleId: otherVehicle.id,
          driverId: otherDriver.id,
          tripReference: 'TRP-A',
          purpose: null,
          originAddress: null,
          destinationAddress: null,
          plannedStartAt: null,
        })
      );

      const query = (q: Partial<import('../fleet-trips.types.js').ListTripsQuery> = {}) => ({
        status: undefined,
        vehicleId: undefined,
        driverId: undefined,
        customerId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 1,
        perPage: 20,
        ...q,
      });
      const refs = (items: { tripReference: string | null }[]) => items.map(t => t.tripReference);
      const list = (q: Partial<import('../fleet-trips.types.js').ListTripsQuery> = {}) =>
        runWithContextAsync(ctx, () => repo.listTrips(query(q)));

      expect((await list()).total).toBe(3); // default order: newest created first
      expect(refs((await list()).items)).toEqual(['TRP-C', 'TRP-B', 'TRP-A']);
      expect(
        refs(
          (
            await list({
              status: ['planned', 'in_progress'],
              sortBy: 'trip_reference',
              sortOrder: 'asc',
            })
          ).items
        )
      ).toEqual(['TRP-A', 'TRP-B']);
      expect(refs((await list({ status: ['completed'] })).items)).toEqual(['TRP-C']);
      expect(
        refs((await list({ search: 'LAHORE', sortBy: 'trip_reference', sortOrder: 'asc' })).items)
      ).toEqual(['TRP-A', 'TRP-C']); // origin OR destination
      expect(refs((await list({ search: 'cement' })).items)).toEqual(['TRP-A']); // purpose
      expect(refs((await list({ search: 'trp-b' })).items)).toEqual(['TRP-B']); // reference
      expect(refs((await list({ search: 'brz-888' })).items)).toEqual(['TRP-B']); // vehicle plate
      expect(
        refs((await list({ search: 'atlas', sortBy: 'trip_reference', sortOrder: 'asc' })).items)
      ).toEqual(['TRP-A', 'TRP-C']); // vehicle name (own company only)
      expect(
        refs((await list({ search: 'hopper', sortBy: 'trip_reference', sortOrder: 'asc' })).items)
      ).toEqual(['TRP-B', 'TRP-C']); // driver name
      expect(refs((await list({ search: 'atlas', status: ['completed'] })).items)).toEqual([
        'TRP-C',
      ]); // search combines with status
      expect(refs((await list({ sortBy: 'planned_start_at', sortOrder: 'asc' })).items)).toEqual([
        'TRP-B',
        'TRP-C',
        'TRP-A',
      ]);
      expect(refs((await list({ sortBy: 'planned_start_at', sortOrder: 'desc' })).items)).toEqual([
        'TRP-A',
        'TRP-C',
        'TRP-B',
      ]);

      // D-0167 (R1): a trip with no planned start sorts last in both directions
      const noStart = await make('TRP-D', truck.id, ada.id, { purpose: 'no start' });
      expect(refs((await list({ sortBy: 'planned_start_at', sortOrder: 'desc' })).items)).toEqual([
        'TRP-A',
        'TRP-C',
        'TRP-B',
        'TRP-D',
      ]);
      expect(refs((await list({ sortBy: 'planned_start_at', sortOrder: 'asc' })).items)).toEqual([
        'TRP-B',
        'TRP-C',
        'TRP-A',
        'TRP-D',
      ]);
      await rawPrisma.trips.delete({ where: { id: BigInt(noStart.id) } });

      const p1 = await list({ sortBy: 'trip_reference', sortOrder: 'asc', perPage: 2, page: 1 });
      const p2 = await list({ sortBy: 'trip_reference', sortOrder: 'asc', perPage: 2, page: 2 });
      expect(p1.total).toBe(3);
      expect([...refs(p1.items), ...refs(p2.items)]).toEqual(['TRP-A', 'TRP-B', 'TRP-C']);
      expect(t1.id).toBeDefined();
    });
    it('replacePlannedYards (D-0175, B5): one transaction — order = sequence, ids keep their stops (omitted fields kept, null clears), unlisted stops deleted, planned trips only', async () => {
      const company = await seedCompany('replace');
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const repo = new FleetTripsRepository(prisma);
      const context = contextFor(company.id.toString());
      const [vehicle, driver, yardA, yardB, yardC] = await runWithContextAsync(context, () =>
        Promise.all([
          vehiclesRepo.createVehicle(VEHICLE_INPUT),
          vehiclesRepo.createDriver(DRIVER_INPUT),
          seedYard(company.id, 'ra'),
          seedYard(company.id, 'rb'),
          seedYard(company.id, 'rc'),
        ])
      );
      const trip = await runWithContextAsync(context, () =>
        repo.createTrip({
          vehicleId: vehicle.id,
          driverId: driver.id,
          deviceId: null,
          fleetCustomerId: null,
          tripReference: 'TRP-R1',
          purpose: null,
          originAddress: null,
          originLatitude: null,
          originLongitude: null,
          destinationAddress: null,
          destinationLatitude: null,
          destinationLongitude: null,
          plannedStartAt: null,
          plannedEndAt: null,
          plannedDistanceKm: null,
          odometerStartKm: null,
          notes: null,
          createdBy: '1',
        })
      );
      const arrive = new Date('2026-10-01T08:00:00Z');
      const [s1, s2, s3] = await runWithContextAsync(context, () =>
        repo.createPlannedYards(trip.id, [
          {
            yardId: yardA.id.toString(),
            stopPurpose: 'load',
            plannedArrivalAt: arrive,
            plannedDepartureAt: null,
            notes: 'keep me',
          },
          {
            yardId: yardB.id.toString(),
            stopPurpose: 'drop',
            plannedArrivalAt: null,
            plannedDepartureAt: null,
            notes: null,
          },
          {
            yardId: yardC.id.toString(),
            stopPurpose: null,
            plannedArrivalAt: null,
            plannedDepartureAt: null,
            notes: null,
          },
        ])
      );
      if (!s1 || !s2 || !s3) throw new Error('seed failed');

      // reorder (s2 first), keep s1 (purpose cleared, notes left out), drop s3, add a new stop on yard C
      const result = await runWithContextAsync(context, () =>
        repo.replacePlannedYards(trip.id, [
          { id: s2.id, yardId: yardB.id.toString() },
          { id: s1.id, yardId: yardA.id.toString(), stopPurpose: null },
          { yardId: yardC.id.toString(), stopPurpose: 'new' },
        ])
      );

      expect(result?.map(stop => stop.sequence)).toEqual([1, 2, 3]);
      const after = await runWithContextAsync(context, () => repo.listPlannedYardsForTrip(trip.id));
      expect(after.map(stop => stop.id).slice(0, 2)).toEqual([s2.id, s1.id]);
      expect(after[2]?.id).not.toBe(s3.id); // s3 was deleted, the new stop is a new row
      expect(after[0]).toMatchObject({ stopPurpose: 'drop' }); // omitted field kept
      expect(after[1]).toMatchObject({
        stopPurpose: null,
        notes: 'keep me',
        plannedArrivalAt: arrive,
      }); // null clears, omitted keeps
      expect(after[2]).toMatchObject({
        stopPurpose: 'new',
        yardId: yardC.id.toString(),
        status: 'planned',
      });

      // an empty list clears everything
      await runWithContextAsync(context, () => repo.replacePlannedYards(trip.id, []));
      expect(
        await runWithContextAsync(context, () => repo.listPlannedYardsForTrip(trip.id))
      ).toEqual([]);

      // a started trip is refused and nothing changes
      await runWithContextAsync(context, () =>
        repo.createPlannedYards(trip.id, [
          {
            yardId: yardA.id.toString(),
            stopPurpose: null,
            plannedArrivalAt: null,
            plannedDepartureAt: null,
            notes: null,
          },
        ])
      );
      await runWithContextAsync(context, () =>
        repo.updateTrip(trip.id, { status: 'in_progress', actualStartAt: new Date() })
      );
      const refused = await runWithContextAsync(context, () =>
        repo.replacePlannedYards(trip.id, [])
      );
      expect(refused).toBeUndefined();
      expect(
        await runWithContextAsync(context, () => repo.listPlannedYardsForTrip(trip.id))
      ).toHaveLength(1);
    });
    it("tripStatusCounts (D-0179, B7): grouped per status under the list's filters, `status` ignored, company-scoped", async () => {
      const company = await seedCompany('b7t');
      const other = await seedCompany('b7u');
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const repo = new FleetTripsRepository(prisma);
      const context = contextFor(company.id.toString());
      try {
        const [vehicle, driverA, driverB] = await runWithContextAsync(context, () =>
          Promise.all([
            vehiclesRepo.createVehicle(VEHICLE_INPUT),
            vehiclesRepo.createDriver(DRIVER_INPUT),
            vehiclesRepo.createDriver({ ...DRIVER_INPUT, licenseNumber: 'B7-2' }),
          ])
        );
        const mk = (
          driverId: string,
          status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
        ) =>
          rawPrisma.trips.create({
            data: {
              company_id: company.id,
              vehicle_id: BigInt(vehicle.id),
              driver_id: BigInt(driverId),
              status,
            },
          });
        await mk(driverA.id, 'planned');
        await mk(driverA.id, 'planned');
        await mk(driverA.id, 'completed');
        await mk(driverB.id, 'completed');
        await mk(driverB.id, 'cancelled');
        const base = {
          status: undefined,
          vehicleId: undefined,
          driverId: undefined,
          customerId: undefined,
          dateFrom: undefined,
          dateTo: undefined,
        };
        const toMap = (rows: Array<{ status: string; count: number }>) =>
          Object.fromEntries(rows.map(r => [r.status, r.count]));

        expect(
          toMap(await runWithContextAsync(context, () => repo.tripStatusCounts(base)))
        ).toEqual({ planned: 2, completed: 2, cancelled: 1 });
        // a `status` filter is ignored (a chip must not zero the others) …
        expect(
          toMap(
            await runWithContextAsync(context, () =>
              repo.tripStatusCounts({ ...base, status: ['planned'] })
            )
          )
        ).toEqual({ planned: 2, completed: 2, cancelled: 1 });
        // … while the list's other filters narrow the counts
        expect(
          toMap(
            await runWithContextAsync(context, () =>
              repo.tripStatusCounts({ ...base, driverId: driverB.id })
            )
          )
        ).toEqual({ completed: 1, cancelled: 1 });
        // another company sees none of it
        expect(
          await runWithContextAsync(contextFor(other.id.toString()), () =>
            repo.tripStatusCounts(base)
          )
        ).toEqual([]);
      } finally {
        await rawPrisma.trips.deleteMany({ where: { company_id: company.id } });
      }
    });
  }
);
