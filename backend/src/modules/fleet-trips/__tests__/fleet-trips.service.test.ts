import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetTripsService } from '../fleet-trips.service.js';
import { RecordingFleetRealtime } from '../../../platform/realtime/__tests__/recording-fleet-realtime.js';
import {
  fakeFleetTripsRepository,
  fakeVehiclesLookup,
  fakeDriversLookup,
  fakeAssignmentMetricsLookup,
  fakeDevicesLookup,
  fakeUsersLookup,
  fakeGeofencesLookup,
} from './fakes.js';
import type { FleetTripsRepository } from '../fleet-trips.repository.js';
import type {
  CreateTripInput,
  Trip,
  TripPlannedYard,
  TripStopEvent,
} from '../fleet-trips.types.js';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: '1',
    companyId: '1',
    roles: [],
    perms: [],
    jti: 't',
    exp: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: '1',
    companyId: '1',
    vehicleId: '1',
    driverId: '1',
    deviceId: null,
    fleetCustomerId: null,
    tripReference: 'TRP-00001',
    purpose: null,
    status: 'planned',
    originAddress: null,
    originLatitude: null,
    originLongitude: null,
    destinationAddress: null,
    destinationLatitude: null,
    destinationLongitude: null,
    plannedStartAt: null,
    plannedEndAt: null,
    plannedDistanceKm: null,
    actualStartAt: null,
    actualEndAt: null,
    actualDistanceKm: null,
    actualDurationMinutes: null,
    fuelUsedLiters: null,
    odometerStartKm: null,
    odometerEndKm: null,
    notes: null,
    cancellationReason: null,
    destinationReachedAt: null,
    createdBy: '1',
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

const MINIMAL_CREATE_INPUT: CreateTripInput = {
  vehicleId: '1',
  driverId: null,
  fleetCustomerId: null,
  tripReference: null,
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
  plannedYards: [],
};

function buildService(
  overrides: {
    repo?: Partial<ReturnType<typeof fakeFleetTripsRepository>>;
    vehiclesLookup?: Parameters<typeof fakeVehiclesLookup>[0];
    driversLookup?: Parameters<typeof fakeDriversLookup>[0];
  } = {}
) {
  const repo = fakeFleetTripsRepository(overrides.repo ?? {});
  return new FleetTripsService(
    repo,
    fakeVehiclesLookup(overrides.vehiclesLookup),
    fakeDriversLookup(overrides.driversLookup),
    fakeAssignmentMetricsLookup(),
    fakeDevicesLookup(),
    fakeUsersLookup(),
    fakeGeofencesLookup(),
    new RecordingFleetRealtime()
  );
}

describe('FleetTripsService.createTrip', () => {
  it("throws NotFoundError when the vehicle does not belong to the caller's company", async () => {
    const service = buildService({
      vehiclesLookup: { findVehicleById: () => Promise.resolve(undefined) },
    });

    await expect(
      runWithContextAsync(ctx(), () => service.createTrip(MINIMAL_CREATE_INPUT))
    ).rejects.toThrow(NotFoundError);
  });

  it('D-0151: creating a trip does NOT check for another in-progress trip — several planned trips per vehicle are allowed (the start guard is the real invariant)', async () => {
    let created = false;
    const service = buildService({
      repo: {
        // `vehicleHasActiveTrip` deliberately not stubbed: the fake throws if create still consults it.
        countTripsForCompany: () => Promise.resolve(0),
        createTrip: () => {
          created = true;
          return Promise.resolve(makeTrip());
        },
        createPlannedYards: () => Promise.resolve([]),
        listPlannedYardsForTrip: () => Promise.resolve([]),
        listStopEventsForTrip: () => Promise.resolve([]),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ id: '1', driverId: '4' }),
        currentDeviceAssignmentForVehicle: () => Promise.resolve(undefined),
      },
      driversLookup: {
        findDriverById: () =>
          Promise.resolve({ id: '4', firstName: 'A', lastName: 'B', licenseNumber: null }),
      },
    });

    await runWithContextAsync(ctx(), () => service.createTrip(MINIMAL_CREATE_INPUT));

    expect(created).toBe(true);
  });

  it("rejects an explicitly-supplied driver id that doesn't belong to the caller's company (tightened past Laravel's bare exists:drivers,id)", async () => {
    const service = buildService({
      repo: { vehicleHasActiveTrip: () => Promise.resolve(false) },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
      },
      driversLookup: { findDriverById: () => Promise.resolve(undefined) },
    });

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createTrip({ ...MINIMAL_CREATE_INPUT, driverId: '99' })
      )
    ).rejects.toThrow(ValidationError);
  });

  it('rejects when no driver_id is given and the vehicle has no current driver assignment', async () => {
    const service = buildService({
      repo: { vehicleHasActiveTrip: () => Promise.resolve(false) },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve(undefined),
      },
    });

    await expect(
      runWithContextAsync(ctx(), () => service.createTrip(MINIMAL_CREATE_INPUT))
    ).rejects.toThrow(/No driver is currently assigned/);
  });

  it('auto-snapshots the currently assigned driver and device, and generates a trip_reference, when not given', async () => {
    let created: { driverId: string; deviceId: string | null; tripReference: string } | undefined;
    const service = buildService({
      repo: {
        vehicleHasActiveTrip: () => Promise.resolve(false),
        countTripsForCompany: () => Promise.resolve(41),
        createTrip: input => {
          created = {
            driverId: input.driverId,
            deviceId: input.deviceId,
            tripReference: input.tripReference,
          };
          return Promise.resolve(
            makeTrip({ driverId: input.driverId, tripReference: input.tripReference })
          );
        },
        createPlannedYards: () => Promise.resolve([]),
        listPlannedYardsForTrip: () => Promise.resolve([]),
        listStopEventsForTrip: () => Promise.resolve([]),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ driverId: '7' }),
        currentDeviceAssignmentForVehicle: () => Promise.resolve({ deviceId: '3' }),
      },
      driversLookup: {
        findDriverById: () =>
          Promise.resolve({ id: '7', firstName: 'Jane', lastName: 'Doe', licenseNumber: null }),
      },
    });

    await runWithContextAsync(ctx(), () => service.createTrip(MINIMAL_CREATE_INPUT));

    expect(created).toEqual({ driverId: '7', deviceId: '3', tripReference: 'TRP-00042' });
  });

  it("rejects a planned_yards entry whose yard_id doesn't belong to the caller's company (tightened past Laravel's bare exists:yards,id)", async () => {
    const service = buildService({
      repo: {
        vehicleHasActiveTrip: () => Promise.resolve(false),
        findYardBrief: () => Promise.resolve(undefined),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ driverId: '7' }),
      },
    });

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createTrip({
          ...MINIMAL_CREATE_INPUT,
          plannedYards: [
            {
              yardId: '99',
              stopPurpose: null,
              plannedArrivalAt: null,
              plannedDepartureAt: null,
              notes: null,
            },
          ],
        })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a fleet_customer_id that doesn't belong to the caller's company (tightened past Laravel's bare exists:fleet_customers,id)", async () => {
    const service = buildService({
      repo: {
        vehicleHasActiveTrip: () => Promise.resolve(false),
        findFleetCustomerBrief: () => Promise.resolve(undefined),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ driverId: '7' }),
      },
    });

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createTrip({ ...MINIMAL_CREATE_INPUT, fleetCustomerId: '99' })
      )
    ).rejects.toThrow(ValidationError);
  });
});

describe('FleetTripsService.updateTrip', () => {
  it('rejects editing a completed/cancelled trip', async () => {
    const service = buildService({
      repo: { findTripById: () => Promise.resolve(makeTrip({ status: 'completed' })) },
    });

    await expect(service.updateTrip('1', {})).rejects.toThrow(
      /Only planned or in_progress trips can be edited/
    );
  });

  it("throws NotFoundError for a trip outside the caller's company", async () => {
    const service = buildService({ repo: { findTripById: () => Promise.resolve(undefined) } });

    await expect(service.updateTrip('1', {})).rejects.toThrow(NotFoundError);
  });

  it("rejects a fleet_customer_id that doesn't belong to the caller's company", async () => {
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })),
        findFleetCustomerBrief: () => Promise.resolve(undefined),
      },
    });

    await expect(service.updateTrip('1', { fleetCustomerId: '99' })).rejects.toThrow(
      ValidationError
    );
  });

  it('updates the trip and returns lean vehicle/driver briefs on success', async () => {
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })),
        updateTrip: () => Promise.resolve(makeTrip({ status: 'planned', purpose: 'delivery' })),
        listPlannedYardsForTrip: () => Promise.resolve([]),
        listStopEventsForTrip: () => Promise.resolve([]),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({
            id: '1',
            name: 'Truck',
            vehicleCategory: null,
            make: null,
            model: null,
          }),
      },
      driversLookup: {
        findDriverById: () =>
          Promise.resolve({ id: '1', firstName: 'Jane', lastName: 'Doe', licenseNumber: null }),
      },
    });

    const result = await service.updateTrip('1', { purpose: 'delivery' });

    expect(result.success).toBe(true);
    expect((result.data as unknown as { purpose: string }).purpose).toBe('delivery');
    expect(result.data.vehicle).toEqual({ id: '1', name: 'Truck' });
  });
});

describe('FleetTripsService.getTrip', () => {
  it("throws NotFoundError for a trip outside the caller's company", async () => {
    const service = buildService({ repo: { findTripById: () => Promise.resolve(undefined) } });

    await expect(service.getTrip('1')).rejects.toThrow(NotFoundError);
  });

  it('composes the rich vehicle/driver/device/customer/created_by briefs and planned yards', async () => {
    const repo = fakeFleetTripsRepository({
      findTripById: () =>
        Promise.resolve(
          makeTrip({ deviceId: '5', fleetCustomerId: '9', createdBy: '3', status: 'planned' })
        ),
      findFleetCustomerBrief: () =>
        Promise.resolve({ id: '9', name: 'Acme Co', contactName: 'Bob', contactPhone: '555-0100' }),
      listPlannedYardsForTrip: () =>
        Promise.resolve([
          {
            id: '1',
            tripId: '1',
            yardId: '2',
            sequence: 1,
            stopPurpose: null,
            plannedArrivalAt: null,
            plannedDepartureAt: null,
            actualArrivalAt: null,
            actualDepartureAt: null,
            dwellTimeMinutes: null,
            actualSource: null,
            status: 'planned' as const,
            notes: null,
            createdAt: null,
            updatedAt: null,
          },
        ]),
      findYardBrief: () =>
        Promise.resolve({
          id: '2',
          name: 'Main Yard',
          address: null,
          latitude: null,
          longitude: null,
        }),
      listStopEventsForTrip: () => Promise.resolve([]),
    });
    const service = new FleetTripsService(
      repo,
      fakeVehiclesLookup({
        findVehicleById: () =>
          Promise.resolve({
            id: '1',
            name: 'Truck',
            vehicleCategory: 'rigid',
            make: 'Volvo',
            model: 'FH16',
          }),
      }),
      fakeDriversLookup({
        findDriverById: () =>
          Promise.resolve({ id: '1', firstName: 'Jane', lastName: 'Doe', licenseNumber: 'L1' }),
      }),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup({
        findByIdUnscoped: () =>
          Promise.resolve({ id: '5', name: 'Tracker', deviceUniqueIdentifier: 'dev-5' }),
      }),
      fakeUsersLookup({
        findContactById: () => Promise.resolve({ id: '3', firstName: 'Boss', lastName: 'Person' }),
      }),
      fakeGeofencesLookup(),
      new RecordingFleetRealtime()
    );

    const result = await service.getTrip('1');

    expect(result.data.device).toMatchObject({ id: '5', name: 'Tracker' });
    expect(result.data.customer).toMatchObject({ id: '9', name: 'Acme Co' });
    expect((result.data as Record<string, unknown>)['created_by_user']).toMatchObject({
      id: '3',
      first_name: 'Boss',
    });
    expect((result.data as Record<string, unknown>)['updated_by_user']).toBeNull(); // D-0172: never edited by a user
    expect(result.data.planned_yards).toHaveLength(1);
    expect((result.data.planned_yards as { yard: unknown }[])[0]?.yard).toMatchObject({
      id: '2',
      name: 'Main Yard',
    });
    expect((result.data.planned_yards as { events: unknown }[])[0]?.events).toEqual([]);
    expect(result.data.destination_reached_at).toBeNull();
    expect(result.data.awaiting_completion).toBe(false);
    expect(result.data.vehicle).toMatchObject({ id: '1', vehicle_category: 'rigid' });
    expect(result.data.driver).toMatchObject({ id: '1', license_number: 'L1' });
  });
});

describe('FleetTripsService.startTrip', () => {
  it('rejects starting a non-planned trip', async () => {
    const service = buildService({
      repo: { findTripById: () => Promise.resolve(makeTrip({ status: 'in_progress' })) },
    });

    await expect(service.startTrip('1')).rejects.toThrow(/cannot be started/);
  });

  it('rejects when the vehicle already has a different trip in progress', async () => {
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })),
        vehicleHasActiveTrip: () => Promise.resolve(true),
      },
    });

    await expect(service.startTrip('1')).rejects.toThrow(/already has a trip in progress/);
  });

  it('re-confirms the device snapshot on success', async () => {
    let updatedDeviceId: string | null | undefined;
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned', deviceId: '1' })),
        vehicleHasActiveTrip: () => Promise.resolve(false),
        updateTrip: (_id, data) => {
          updatedDeviceId = data.deviceId;
          return Promise.resolve(
            makeTrip({ status: 'in_progress', deviceId: data.deviceId ?? null })
          );
        },
      },
      vehiclesLookup: {
        currentDeviceAssignmentForVehicle: () => Promise.resolve({ deviceId: '9' }),
      },
    });

    const result = await service.startTrip('1');

    expect(updatedDeviceId).toBe('9');
    expect(result.success).toBe(true);
  });
});

describe('FleetTripsService.completeTrip', () => {
  it('rejects completing a non-in_progress trip', async () => {
    const service = buildService({
      repo: { findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })) },
    });

    await expect(
      service.completeTrip('1', { odometerEndKm: null, fuelUsedLiters: null, notes: null })
    ).rejects.toThrow(/cannot be completed/);
  });

  it('prefers the odometer delta over GPS distance when both are available', async () => {
    let recordedDistance: number | null | undefined;
    const service = buildService({
      repo: {
        markPlannedStopsMissed: () => Promise.resolve(),
        findTripById: () =>
          Promise.resolve(
            makeTrip({
              status: 'in_progress',
              odometerStartKm: 100,
              actualStartAt: new Date(),
              deviceId: '1',
            })
          ),
        updateTrip: (_id, data) => {
          recordedDistance = data.actualDistanceKm;
          return Promise.resolve(makeTrip({ status: 'completed' }));
        },
      },
    });

    await service.completeTrip('1', { odometerEndKm: 250, fuelUsedLiters: null, notes: null });

    expect(recordedDistance).toBe(150);
  });

  it('falls back to GPS Haversine distance when no odometer reading is given', async () => {
    let recordedDistance: number | null | undefined;
    const start = new Date('2026-09-01T00:00:00.000Z');
    const service = buildService({
      repo: {
        markPlannedStopsMissed: () => Promise.resolve(),
        findTripById: () =>
          Promise.resolve(makeTrip({ status: 'in_progress', actualStartAt: start, deviceId: '1' })),
        positionsInWindow: () =>
          Promise.resolve([
            { latitude: 0, longitude: 0, speed: null, heading: null, recordedAt: start },
            {
              latitude: 0.01,
              longitude: 0,
              speed: null,
              heading: null,
              recordedAt: new Date(start.getTime() + 1000),
            },
          ]),
        updateTrip: (_id, data) => {
          recordedDistance = data.actualDistanceKm;
          return Promise.resolve(makeTrip({ status: 'completed' }));
        },
      },
    });

    await service.completeTrip('1', { odometerEndKm: null, fuelUsedLiters: null, notes: null });

    expect(recordedDistance).toBeCloseTo(1.112, 1);
  });

  it("increments the driver's assignment metrics on success", async () => {
    let metrics: { driverId: string; vehicleId: string; distanceKm: number } | undefined;
    const start = new Date('2026-09-01T00:00:00.000Z');
    const repo = fakeFleetTripsRepository({
      markPlannedStopsMissed: () => Promise.resolve(),
      findTripById: () =>
        Promise.resolve(
          makeTrip({ status: 'in_progress', driverId: '7', vehicleId: '3', actualStartAt: start })
        ),
      updateTrip: () => Promise.resolve(makeTrip({ status: 'completed' })),
    });
    const service = new FleetTripsService(
      repo,
      fakeVehiclesLookup(),
      fakeDriversLookup(),
      fakeAssignmentMetricsLookup({
        incrementAssignmentMetrics: (driverId, vehicleId, _asOf, distanceKm) => {
          metrics = { driverId, vehicleId, distanceKm };
          return Promise.resolve();
        },
      }),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      new RecordingFleetRealtime()
    );

    await service.completeTrip('1', { odometerEndKm: null, fuelUsedLiters: null, notes: null });

    expect(metrics).toEqual({ driverId: '7', vehicleId: '3', distanceKm: 0 });
  });
});

describe('FleetTripsService.cancelTrip', () => {
  it('rejects cancelling an already-completed trip', async () => {
    const service = buildService({
      repo: { findTripById: () => Promise.resolve(makeTrip({ status: 'completed' })) },
    });

    await expect(service.cancelTrip('1', { cancellationReason: null })).rejects.toThrow(
      /cannot be cancelled/
    );
  });

  it('returns the bare trip with no nested relations on success (matches Laravel exactly)', async () => {
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })),
        updateTrip: () =>
          Promise.resolve(
            makeTrip({ status: 'cancelled', cancellationReason: 'customer request' })
          ),
      },
    });

    const result = await service.cancelTrip('1', { cancellationReason: 'customer request' });

    expect(result.data).not.toHaveProperty('vehicle');
    expect(result.data).not.toHaveProperty('driver');
    expect((result.data as { status: string }).status).toBe('cancelled');
  });
});

describe('FleetTripsService.gpsTrail', () => {
  it('rejects when the trip never started or has no device assigned', async () => {
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ deviceId: null, actualStartAt: null })),
      },
    });

    await expect(service.gpsTrail('1')).rejects.toThrow(/GPS trail is not available/);
  });

  it('computes total_points and computed_distance_km from the real position window', async () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const service = buildService({
      repo: {
        findTripById: () =>
          Promise.resolve(makeTrip({ deviceId: '1', actualStartAt: start, actualEndAt: null })),
        positionsInWindow: () =>
          Promise.resolve([
            { latitude: 0, longitude: 0, speed: 10, heading: null, recordedAt: start },
            {
              latitude: 0.01,
              longitude: 0,
              speed: 20,
              heading: null,
              recordedAt: new Date(start.getTime() + 1000),
            },
          ]),
      },
    });

    const result = await service.gpsTrail('1');

    expect(result.data.total_points).toBe(2);
    expect(result.data.computed_distance_km).toBeCloseTo(1.112, 1);
  });
});

// ===========================================================================
// D-0155 — manual stop arrive/depart, trip route
// ===========================================================================

function makeStop(overrides: Partial<TripPlannedYard> = {}): TripPlannedYard {
  return {
    id: '7',
    tripId: '1',
    yardId: '2',
    sequence: 1,
    stopPurpose: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    actualArrivalAt: null,
    actualDepartureAt: null,
    dwellTimeMinutes: null,
    actualSource: null,
    status: 'planned',
    notes: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

const T0 = new Date('2026-09-24T08:00:00.000Z'); // trip started
const ARRIVED = new Date('2026-09-24T09:00:00.000Z');

/** In-memory stand-in for the repository's stop + audit-log behaviour (the real transaction is covered by the integration test). */
function buildStopService(
  stop: TripPlannedYard,
  tripOverrides: Partial<Trip> = {},
  seedEvents: TripStopEvent[] = []
) {
  const state = { stop, events: [...seedEvents] };
  const realtime = new RecordingFleetRealtime();
  const service = new FleetTripsService(
    fakeFleetTripsRepository({
      findTripById: () =>
        Promise.resolve(makeTrip({ status: 'in_progress', actualStartAt: T0, ...tripOverrides })),
      findPlannedYard: (_tripId, stopId) =>
        Promise.resolve(stopId === state.stop.id ? state.stop : undefined),
      recordStopEvent: (tripId, stopId, input) => {
        state.stop = {
          ...state.stop,
          status: input.stopUpdate.status,
          actualSource: input.source,
          dwellTimeMinutes: input.stopUpdate.dwellTimeMinutes,
          actualArrivalAt: input.stopUpdate.actualArrivalAt ?? state.stop.actualArrivalAt,
          actualDepartureAt: input.stopUpdate.actualDepartureAt ?? state.stop.actualDepartureAt,
        };
        const event: TripStopEvent = {
          id: String(state.events.length + 1),
          tripPlannedYardId: stopId,
          tripId,
          eventType: input.eventType,
          occurredAt: input.occurredAt,
          source: input.source,
          reason: input.reason,
          recordedBy: input.recordedBy,
          createdAt: null,
        };
        state.events.push(event);
        return Promise.resolve({ stop: state.stop, event });
      },
      listStopEventsForTrip: () => Promise.resolve(state.events),
      listPlannedYardsForTrip: () =>
        Promise.resolve([state.stop, makeStop({ id: '99', sequence: 9 })]),
      setDestinationReachedIfUnset: () => Promise.resolve(false),
      findYardBrief: () =>
        Promise.resolve({ id: '2', name: 'Yard', address: null, latitude: 1, longitude: 2 }),
    }),
    fakeVehiclesLookup(),
    fakeDriversLookup(),
    fakeAssignmentMetricsLookup(),
    fakeDevicesLookup(),
    fakeUsersLookup({
      findContactById: () => Promise.resolve({ id: '1', firstName: 'Op', lastName: 'Erator' }),
    }),
    fakeGeofencesLookup(),
    realtime
  );
  return { service, state, realtime };
}

const inCtx = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);

describe('FleetTripsService.arriveStop / departStop (D-0155)', () => {
  it('404s a trip outside the company and a stop that is not on the trip', async () => {
    const noTrip = new FleetTripsService(
      fakeFleetTripsRepository({ findTripById: () => Promise.resolve(undefined) }),
      fakeVehiclesLookup(),
      fakeDriversLookup(),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      new RecordingFleetRealtime()
    );
    await expect(
      inCtx(() => noTrip.arriveStop('1', '7', { occurredAt: null, reason: null }))
    ).rejects.toThrow('Trip not found.');

    const { service } = buildStopService(makeStop());
    await expect(
      inCtx(() => service.arriveStop('1', '999', { occurredAt: null, reason: null }))
    ).rejects.toThrow('Stop not found.');
  });

  it.each(['planned', 'cancelled'] as const)('rejects a %s trip', async status => {
    const { service } = buildStopService(makeStop(), { status });
    await expect(
      inCtx(() => service.arriveStop('1', '7', { occurredAt: null, reason: null }))
    ).rejects.toThrow(
      'Stops can only be updated while the trip is in progress or after it has completed.'
    );
  });

  it('accepts a completed trip (late correction)', async () => {
    const { service } = buildStopService(makeStop(), {
      status: 'completed',
      actualEndAt: new Date(),
    });
    const result = await inCtx(() =>
      service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null })
    );
    expect(result.data.trip).toEqual({ id: '1', status: 'completed', awaiting_completion: false });
  });

  it('rejects a time in the future and a time before the trip started', async () => {
    const { service } = buildStopService(makeStop());
    await expect(
      inCtx(() =>
        service.arriveStop('1', '7', {
          occurredAt: new Date(Date.now() + 10 * 60_000),
          reason: null,
        })
      )
    ).rejects.toThrow("The time can't be in the future.");
    await expect(
      inCtx(() =>
        service.arriveStop('1', '7', { occurredAt: new Date(T0.getTime() - 1000), reason: null })
      )
    ).rejects.toThrow("The time can't be before the trip started.");
  });

  it('arrive: marks the stop arrived with source manual, defaults the time to now, and appends an audit event', async () => {
    const { service, state } = buildStopService(makeStop());
    const before = Date.now();

    const result = await inCtx(() =>
      service.arriveStop('1', '7', { occurredAt: null, reason: '  driver called it in  ' })
    );

    expect(result.data.stop).toMatchObject({
      id: '7',
      status: 'arrived',
      actual_source: 'manual',
      yard: { latitude: 1, longitude: 2 },
    });
    expect((result.data.stop['actual_arrival_at'] as Date).getTime()).toBeGreaterThanOrEqual(
      before - 1000
    );
    expect(result.data.trip).toEqual({
      id: '1',
      status: 'in_progress',
      awaiting_completion: false,
    });
    expect(state.events).toHaveLength(1);
    const events = result.data.stop['events'] as Record<string, unknown>[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'arrive',
      source: 'manual',
      reason: 'driver called it in',
      recorded_by: { id: '1', first_name: 'Op', last_name: 'Erator' },
    });
  });

  it("arrive: awaiting_completion mirrors the trip's destination_reached_at", async () => {
    const { service } = buildStopService(makeStop(), { destinationReachedAt: new Date() });
    const result = await inCtx(() =>
      service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null })
    );
    expect(result.data.trip).toMatchObject({ awaiting_completion: true });
  });

  it('arrive: replacing an existing arrival needs a reason, and the original stays in events[] afterwards', async () => {
    const original: TripStopEvent = {
      id: '1',
      tripPlannedYardId: '7',
      tripId: '1',
      eventType: 'arrive',
      occurredAt: ARRIVED,
      source: 'geofence_auto',
      reason: null,
      recordedBy: null,
      createdAt: null,
    };
    const { service } = buildStopService(
      makeStop({ status: 'arrived', actualArrivalAt: ARRIVED, actualSource: 'geofence_auto' }),
      {},
      [original]
    );
    const corrected = new Date('2026-09-24T08:45:00.000Z');

    await expect(
      inCtx(() => service.arriveStop('1', '7', { occurredAt: corrected, reason: null }))
    ).rejects.toThrow('A reason is required to replace an existing arrival time.');
    await expect(
      inCtx(() => service.arriveStop('1', '7', { occurredAt: corrected, reason: '   ' }))
    ).rejects.toThrow('A reason is required to replace an existing arrival time.');

    const result = await inCtx(() =>
      service.arriveStop('1', '7', { occurredAt: corrected, reason: 'GPS was offline' })
    );

    expect(result.data.stop).toMatchObject({
      actual_arrival_at: corrected,
      actual_source: 'manual',
      status: 'arrived',
    });
    const events = result.data.stop['events'] as {
      source: string;
      occurred_at: Date;
      reason: string | null;
    }[];
    expect(events.map(e => e.source)).toEqual(['geofence_auto', 'manual']); // the sensor's original is still there
    expect(events[0]?.occurred_at).toEqual(ARRIVED);
    expect(events[1]?.reason).toBe('GPS was offline');
  });

  it("arrive: can't be after an existing departure; correcting the arrival of a departed stop keeps it departed and recomputes dwell", async () => {
    const departure = new Date('2026-09-24T10:00:00.000Z');
    const { service } = buildStopService(
      makeStop({
        status: 'departed',
        actualArrivalAt: ARRIVED,
        actualDepartureAt: departure,
        dwellTimeMinutes: 60,
      })
    );

    await expect(
      inCtx(() =>
        service.arriveStop('1', '7', {
          occurredAt: new Date('2026-09-24T10:30:00.000Z'),
          reason: 'typo',
        })
      )
    ).rejects.toThrow("The arrival can't be after the departure.");

    const result = await inCtx(() =>
      service.arriveStop('1', '7', {
        occurredAt: new Date('2026-09-24T09:30:00.000Z'),
        reason: 'typo',
      })
    );
    expect(result.data.stop).toMatchObject({ status: 'departed', dwell_time_minutes: 30 });
  });

  it("depart: needs an arrival first, and can't precede it", async () => {
    const noArrival = buildStopService(makeStop());
    await expect(
      inCtx(() => noArrival.service.departStop('1', '7', { occurredAt: ARRIVED, reason: null }))
    ).rejects.toThrow('Mark the arrival before the departure.');

    const { service } = buildStopService(makeStop({ status: 'arrived', actualArrivalAt: ARRIVED }));
    await expect(
      inCtx(() =>
        service.departStop('1', '7', {
          occurredAt: new Date(ARRIVED.getTime() - 1000),
          reason: null,
        })
      )
    ).rejects.toThrow("The departure can't be before the arrival.");
  });

  it('depart: marks the stop departed and computes dwell_time_minutes to two decimals', async () => {
    const { service } = buildStopService(makeStop({ status: 'arrived', actualArrivalAt: ARRIVED }));

    const result = await inCtx(() =>
      service.departStop('1', '7', {
        occurredAt: new Date('2026-09-24T09:20:20.000Z'),
        reason: null,
      })
    );

    expect(result.data.stop).toMatchObject({
      status: 'departed',
      actual_source: 'manual',
      dwell_time_minutes: 20.33,
    });
    expect((result.data.stop['events'] as { event_type: string }[]).map(e => e.event_type)).toEqual(
      ['depart']
    );
  });

  it('depart: replacing an existing departure needs a reason', async () => {
    const { service } = buildStopService(
      makeStop({
        status: 'departed',
        actualArrivalAt: ARRIVED,
        actualDepartureAt: new Date('2026-09-24T10:00:00.000Z'),
        dwellTimeMinutes: 60,
      })
    );
    await expect(
      inCtx(() =>
        service.departStop('1', '7', {
          occurredAt: new Date('2026-09-24T10:05:00.000Z'),
          reason: null,
        })
      )
    ).rejects.toThrow('A reason is required to replace an existing departure time.');
  });
});

describe('FleetTripsService.route (D-0155)', () => {
  const start = new Date('2026-09-24T08:00:00.000Z');
  const pos = (lat: number, minutes: number) => ({
    latitude: lat,
    longitude: 74,
    speed: 10,
    heading: 90,
    recordedAt: new Date(start.getTime() + minutes * 60_000),
  });

  function buildRouteService(
    tripOverrides: Partial<Trip>,
    positions = [pos(31, 0), pos(31.01, 1), pos(31.02, 2)]
  ) {
    return new FleetTripsService(
      fakeFleetTripsRepository({
        findTripById: () => Promise.resolve(makeTrip({ status: 'in_progress', ...tripOverrides })),
        listPlannedYardsForTrip: () =>
          Promise.resolve([makeStop({ id: '7' }), makeStop({ id: '8', sequence: 2 })]),
        listStopEventsForTrip: () => Promise.resolve([]),
        findYardBrief: () =>
          Promise.resolve({ id: '2', name: 'Yard', address: 'Addr', latitude: 1, longitude: 2 }),
        positionsInWindow: () => Promise.resolve(positions),
        latestPosition: () => Promise.resolve(positions[positions.length - 1]),
      }),
      fakeVehiclesLookup({
        findVehicleById: () =>
          Promise.resolve({
            id: '1',
            name: 'Truck A',
            vehicleCategory: 'truck',
            make: null,
            model: null,
            plate: 'LEA-1',
          }),
      }),
      fakeDriversLookup({
        findDriverById: () =>
          Promise.resolve({ id: '3', firstName: 'Alex', lastName: 'Khan', licenseNumber: null }),
      }),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      new RecordingFleetRealtime()
    );
  }

  it('404s a trip outside the company', async () => {
    const service = buildService({ repo: { findTripById: () => Promise.resolve(undefined) } });
    await expect(service.route('1')).rejects.toThrow(NotFoundError);
  });

  it('returns summary, vehicle, driver, origin/destination, ordered stops, trail and current position', async () => {
    const service = buildRouteService({
      deviceId: '146',
      actualStartAt: start,
      originAddress: 'Lahore Depot',
      originLatitude: 31.5,
      originLongitude: 74.3,
      destinationAddress: 'Islamabad',
      destinationLatitude: 33.6,
      destinationLongitude: 73,
      destinationReachedAt: new Date(),
    });

    const { data } = await service.route('1');

    expect(data.trip).toMatchObject({ id: '1', status: 'in_progress', awaiting_completion: true });
    expect(data.vehicle).toEqual({
      id: '1',
      name: 'Truck A',
      vehicle_category: 'truck',
      plate: 'LEA-1',
    });
    expect(data.driver).toEqual({ id: '3', first_name: 'Alex', last_name: 'Khan' });
    expect(data.origin).toEqual({ address: 'Lahore Depot', latitude: 31.5, longitude: 74.3 });
    expect(data.destination).toEqual({ address: 'Islamabad', latitude: 33.6, longitude: 73 });
    expect((data.stops as { id: string }[]).map(x => x.id)).toEqual(['7', '8']);
    expect(data.trail).toMatchObject({ device_id: '146', total_points: 3 });
    expect((data.trail as { computed_distance_km: number }).computed_distance_km).toBeCloseTo(
      2.224,
      1
    );
    expect(data.current_position).toEqual({
      latitude: 31.02,
      longitude: 74,
      speed: 10,
      heading: 90,
      recorded_at: new Date(start.getTime() + 2 * 60_000),
    });
  });

  it('a planned trip (never started) has no trail and no current position, but still answers 200', async () => {
    const { data } = await buildRouteService({
      status: 'planned',
      deviceId: '146',
      actualStartAt: null,
    }).route('1');
    expect(data.trail).toBeNull();
    expect(data.current_position).toBeNull();
    expect((data.stops as unknown[]).length).toBe(2);
  });

  it('a trip without a tracker has no trail', async () => {
    const { data } = await buildRouteService({ deviceId: null, actualStartAt: start }).route('1');
    expect(data.trail).toBeNull();
    expect(data.current_position).toBeNull();
  });

  it('thins a trail over 5 000 points evenly, keeping the first and last, while total_points/distance describe the full trail', async () => {
    const many = Array.from({ length: 12_000 }, (_, i) => pos(31 + i * 0.00001, i));
    const { data } = await buildRouteService({ deviceId: '146', actualStartAt: start }, many).route(
      '1'
    );
    const trail = data.trail as {
      total_points: number;
      positions: { latitude: number }[];
      computed_distance_km: number;
    };

    expect(trail.total_points).toBe(12_000);
    expect(trail.positions).toHaveLength(5000);
    expect(trail.positions[0]?.latitude).toBe(31);
    expect(trail.positions[4999]?.latitude).toBe(many[11_999]?.latitude);
    expect(trail.computed_distance_km).toBeGreaterThan(13); // 0.00001° × 12 000 ≈ 13.3 km — from the full set, not the thinned one
  });
});

// ===========================================================================
// D-0156 — sensor -> trip bridge, trip start seed, completion side effects
// ===========================================================================

type StopWrite = Parameters<FleetTripsRepository['recordStopEvent']>;

function buildBridge(
  stops: TripPlannedYard[],
  opts: { tripOverrides?: Partial<Trip>; inside?: string[]; writeSucceeds?: boolean } = {}
) {
  const writes: { stopId: string; input: StopWrite[2] }[] = [];
  const destinationSets: { tripId: string; at: Date }[] = [];
  const odometerSets: { vehicleId: string; km: number }[] = [];
  let missedFor: string | undefined;
  const realtime = new RecordingFleetRealtime();
  const service = new FleetTripsService(
    fakeFleetTripsRepository({
      findTripById: () => Promise.resolve(makeTrip({ status: 'planned', ...opts.tripOverrides })),
      vehicleHasActiveTrip: () => Promise.resolve(false),
      updateTrip: (_id, data) =>
        Promise.resolve(
          makeTrip({
            status: data.status ?? 'in_progress',
            actualStartAt: data.actualStartAt ?? T0,
            actualEndAt: data.actualEndAt ?? null,
            ...opts.tripOverrides,
          })
        ),
      listPlannedYardsForTrip: () => Promise.resolve(stops),
      listStopEventsForTrip: () => Promise.resolve([]),
      findYardBrief: () =>
        Promise.resolve({ id: '2', name: 'Yard', address: null, latitude: 1, longitude: 2 }),
      recordStopEvent: (_tripId, stopId, input) => {
        writes.push({ stopId, input });
        if (opts.writeSucceeds === false) return Promise.resolve(undefined);
        const stop = stops.find(x => x.id === stopId) ?? makeStop();
        return Promise.resolve({
          stop,
          event: {
            id: '1',
            tripPlannedYardId: stopId,
            tripId: '1',
            eventType: input.eventType,
            occurredAt: input.occurredAt,
            source: input.source,
            reason: null,
            recordedBy: null,
            createdAt: null,
          },
        });
      },
      setDestinationReachedIfUnset: (tripId, at) => {
        destinationSets.push({ tripId, at });
        return Promise.resolve(true);
      },
      markPlannedStopsMissed: tripId => {
        missedFor = tripId;
        return Promise.resolve();
      },
      findInProgressTripForVehicleUnscoped: () =>
        Promise.resolve(
          makeTrip({ status: 'in_progress', actualStartAt: T0, ...opts.tripOverrides })
        ),
    }),
    fakeVehiclesLookup({
      setOdometerKm: (vehicleId, km) => {
        odometerSets.push({ vehicleId, km });
        return Promise.resolve();
      },
    }),
    fakeDriversLookup(),
    fakeAssignmentMetricsLookup(),
    fakeDevicesLookup(),
    fakeUsersLookup(),
    fakeGeofencesLookup({ yardIdsVehicleIsInside: () => Promise.resolve(opts.inside ?? []) }),
    realtime
  );
  return { service, writes, destinationSets, odometerSets, realtime, missed: () => missedFor };
}

const ENTER_AT = new Date('2026-09-24T09:00:00.000Z');
const EXIT_AT = new Date('2026-09-24T09:40:30.000Z');

describe('FleetTripsService sensor bridge — recordGeofenceStopTransition (D-0156)', () => {
  const stops = () => [
    makeStop({ id: '1', yardId: '10', sequence: 1 }),
    makeStop({ id: '2', yardId: '20', sequence: 2 }),
    makeStop({ id: '3', yardId: '10', sequence: 3 }), // the same yard twice (ADR example)
  ];

  it('enter: the first still-planned stop of that yard becomes arrived, source geofence_auto, no recorded_by', async () => {
    const { service, writes } = buildBridge(stops());

    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '20',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      stopId: '2',
      input: {
        eventType: 'arrive',
        source: 'geofence_auto',
        recordedBy: null,
        requireStatus: 'planned',
        occurredAt: ENTER_AT,
        stopUpdate: { status: 'arrived', actualArrivalAt: ENTER_AT },
      },
    });
  });

  it('enter at a yard that is two stops: matches by sequence — the second visit fills the second stop', async () => {
    const list = [
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'departed',
        actualArrivalAt: T0,
        actualDepartureAt: ARRIVED,
      }),
      makeStop({ id: '2', yardId: '20', sequence: 2 }),
      makeStop({ id: '3', yardId: '10', sequence: 3 }),
    ];
    const { service, writes } = buildBridge(list);

    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });

    expect(writes.map(w => w.stopId)).toEqual(['3']);
  });

  it('fills only: a stop that already has a manual arrival is never touched by a later sensor enter (and the next planned stop of the yard is taken)', async () => {
    const list = [
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'arrived',
        actualArrivalAt: T0,
        actualSource: 'manual',
      }),
      makeStop({ id: '3', yardId: '10', sequence: 2 }),
    ];
    const { service, writes } = buildBridge(list);

    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });

    expect(writes.map(w => w.stopId)).toEqual(['3']);
  });

  it('enter at a yard that is not a stop of this trip does nothing (stops are never invented)', async () => {
    const { service, writes, destinationSets } = buildBridge(stops());
    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '999',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(writes).toHaveLength(0);
    expect(destinationSets).toHaveLength(0);
  });

  it("enter at the LAST stop sets destination_reached_at (owner §0); an earlier stop doesn't", async () => {
    const early = buildBridge(stops());
    await early.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '20',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(early.destinationSets).toHaveLength(0);

    const last = buildBridge(stops());
    await last.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    // yard 10 -> first planned stop is seq 1 (not the last) — no destination yet
    expect(last.destinationSets).toHaveLength(0);

    const onlyLast = buildBridge([
      makeStop({ id: '1', yardId: '10', sequence: 1 }),
      makeStop({ id: '9', yardId: '30', sequence: 2 }),
    ]);
    await onlyLast.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '30',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(onlyLast.destinationSets).toEqual([{ tripId: '1', at: ENTER_AT }]);
  });

  it("a write that lost a race (nothing written) doesn't set the destination either", async () => {
    const { service, destinationSets } = buildBridge(
      [makeStop({ id: '9', yardId: '30', sequence: 1 })],
      { writeSucceeds: false }
    );
    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '30',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(destinationSets).toHaveLength(0);
  });

  it('exit: the earliest arrived stop of that yard departs, dwell computed to two decimals from its arrival', async () => {
    const list = [
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'arrived',
        actualArrivalAt: ENTER_AT,
        actualSource: 'geofence_auto',
      }),
      makeStop({ id: '3', yardId: '10', sequence: 3 }),
    ];
    const { service, writes } = buildBridge(list);

    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'exit',
      occurredAt: EXIT_AT,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      stopId: '1',
      input: {
        eventType: 'depart',
        source: 'geofence_auto',
        requireStatus: 'arrived',
        stopUpdate: { status: 'departed', actualDepartureAt: EXIT_AT, dwellTimeMinutes: 40.5 },
      },
    });
  });

  it('exit with no arrived stop for that yard does nothing; a stop already departed is never overwritten', async () => {
    const none = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })]);
    await none.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'exit',
      occurredAt: EXIT_AT,
    });
    expect(none.writes).toHaveLength(0);

    const departed = buildBridge([
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'departed',
        actualArrivalAt: T0,
        actualDepartureAt: ARRIVED,
        actualSource: 'manual',
      }),
    ]);
    await departed.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'exit',
      occurredAt: EXIT_AT,
    });
    expect(departed.writes).toHaveLength(0);
  });

  it('exit never records a departure before the arrival (a manual arrival slightly ahead of the sensor clock)', async () => {
    const ahead = new Date(EXIT_AT.getTime() + 30_000);
    const { service, writes } = buildBridge([
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'arrived',
        actualArrivalAt: ahead,
        actualSource: 'manual',
      }),
    ]);

    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'exit',
      occurredAt: EXIT_AT,
    });

    expect(writes[0]?.input.stopUpdate).toMatchObject({
      actualDepartureAt: ahead,
      dwellTimeMinutes: 0,
    });
  });
});

describe('FleetTripsService sensor bridge — trip lookup + destination proximity (D-0156)', () => {
  const trip = (
    over: Partial<{ lat: number | null; lng: number | null; reached: Date | null }> = {}
  ) => ({
    id: '1',
    destinationLatitude: over.lat === undefined ? 31.5 : over.lat,
    destinationLongitude: over.lng === undefined ? 74.3 : over.lng,
    destinationReachedAt: over.reached === undefined ? null : over.reached,
  });

  it("findInProgressTripForVehicle maps the trip to the detector's slice and returns undefined when none", async () => {
    const { service } = buildBridge([], {
      tripOverrides: { destinationLatitude: 33.6, destinationLongitude: 73 },
    });
    expect(await service.findInProgressTripForVehicle('1', '1')).toEqual({
      id: '1',
      destinationLatitude: 33.6,
      destinationLongitude: 73,
      destinationReachedAt: null,
    });

    const none = new FleetTripsService(
      fakeFleetTripsRepository({
        findInProgressTripForVehicleUnscoped: () => Promise.resolve(undefined),
      }),
      fakeVehiclesLookup(),
      fakeDriversLookup(),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      new RecordingFleetRealtime()
    );
    expect(await none.findInProgressTripForVehicle('1', '1')).toBeUndefined();
  });

  it('within 200 m of the destination sets destination_reached_at; farther away does not', async () => {
    const near = buildBridge([]);
    // ~111 m north of the destination
    await near.service.checkDestinationProximity(trip(), 31.501, 74.3);
    expect(near.destinationSets).toHaveLength(1);
    expect(near.destinationSets[0]?.tripId).toBe('1');

    const far = buildBridge([]);
    // ~333 m north
    await far.service.checkDestinationProximity(trip(), 31.503, 74.3);
    expect(far.destinationSets).toHaveLength(0);
  });

  it('does nothing when it was already reached (never moved) or when the trip has no destination coordinates', async () => {
    const reached = buildBridge([]);
    await reached.service.checkDestinationProximity(trip({ reached: new Date() }), 31.5, 74.3);
    expect(reached.destinationSets).toHaveLength(0);

    const noCoords = buildBridge([]);
    await noCoords.service.checkDestinationProximity(trip({ lat: null, lng: null }), 31.5, 74.3);
    expect(noCoords.destinationSets).toHaveLength(0);
  });
});

describe('FleetTripsService.startTrip — seeding stops the vehicle is already inside (D-0156, 5.3)', () => {
  const list = () => [
    makeStop({ id: '1', yardId: '10', sequence: 1 }),
    makeStop({ id: '2', yardId: '20', sequence: 2 }),
    makeStop({ id: '3', yardId: '10', sequence: 3 }),
  ];

  it('marks the FIRST planned stop of each yard the vehicle is inside as arrived at the start time (geofence_auto)', async () => {
    const { service, writes } = buildBridge(list(), { inside: ['10'] });

    await service.startTrip('1');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      stopId: '1',
      input: { eventType: 'arrive', source: 'geofence_auto', requireStatus: 'planned' },
    });
    // the seed uses the trip's own start time (whole second), not a later clock reading
    expect((writes[0]?.input.occurredAt.getTime() ?? 1) % 1000).toBe(0);
  });

  it("seeds nothing when the vehicle isn't inside any stop's geofence", async () => {
    const { service, writes } = buildBridge(list(), { inside: [] });
    await service.startTrip('1');
    expect(writes).toHaveLength(0);
  });

  it('seeding the LAST stop counts as destination reached', async () => {
    const { service, destinationSets } = buildBridge(list(), { inside: ['20'] });
    // seq 2 is not last (seq 3 is) -> no destination
    await service.startTrip('1');
    expect(destinationSets).toHaveLength(0);

    const lastOnly = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })], {
      inside: ['10'],
    });
    await lastOnly.service.startTrip('1');
    expect(lastOnly.destinationSets).toHaveLength(1);
  });
});

describe('FleetTripsService.completeTrip — missed stops + vehicle odometer (D-0156, 5.5)', () => {
  it('marks still-planned stops missed and sets the vehicle odometer when odometer_end_km is given', async () => {
    const { service, missed, odometerSets } = buildBridge([], {
      tripOverrides: { status: 'in_progress', actualStartAt: T0, odometerStartKm: 100 },
    });

    await service.completeTrip('1', { odometerEndKm: 250.5, fuelUsedLiters: null, notes: null });

    expect(missed()).toBe('1');
    expect(odometerSets).toEqual([{ vehicleId: '1', km: 250.5 }]);
  });

  it('leaves the vehicle odometer alone when no end reading is given', async () => {
    const { service, missed, odometerSets } = buildBridge([], {
      tripOverrides: { status: 'in_progress', actualStartAt: T0 },
    });

    await service.completeTrip('1', { odometerEndKm: null, fuelUsedLiters: null, notes: null });

    expect(missed()).toBe('1');
    expect(odometerSets).toHaveLength(0);
  });
});

describe('FleetTripsService.arriveStop — destination reached by the last stop (D-0156)', () => {
  it('a manual arrival at the LAST stop of an in-progress trip sets destination_reached_at and reports awaiting_completion', async () => {
    const stop = makeStop({ id: '7', sequence: 2 });
    const { service, destinationSets } = buildBridgeForManual(
      [makeStop({ id: '6', sequence: 1 }), stop],
      stop
    );

    const result = await inCtx(() =>
      service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null })
    );

    expect(destinationSets).toEqual([{ tripId: '1', at: ARRIVED }]);
    expect(result.data.trip).toEqual({ id: '1', status: 'in_progress', awaiting_completion: true });
  });

  it('an earlier stop, or a completed trip, does not', async () => {
    const stop = makeStop({ id: '6', sequence: 1 });
    const early = buildBridgeForManual([stop, makeStop({ id: '7', sequence: 2 })], stop);
    const r1 = await inCtx(() =>
      early.service.arriveStop('1', '6', { occurredAt: ARRIVED, reason: null })
    );
    expect(early.destinationSets).toHaveLength(0);
    expect(r1.data.trip).toMatchObject({ awaiting_completion: false });

    const last = makeStop({ id: '7', sequence: 2 });
    const done = buildBridgeForManual([makeStop({ id: '6', sequence: 1 }), last], last, {
      status: 'completed',
      actualEndAt: new Date(),
    });
    await inCtx(() => done.service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null }));
    expect(done.destinationSets).toHaveLength(0);
  });
});

function buildBridgeForManual(
  stops: TripPlannedYard[],
  target: TripPlannedYard,
  tripOverrides: Partial<Trip> = {}
) {
  const destinationSets: { tripId: string; at: Date }[] = [];
  const realtime = new RecordingFleetRealtime();
  const service = new FleetTripsService(
    fakeFleetTripsRepository({
      findTripById: () =>
        Promise.resolve(makeTrip({ status: 'in_progress', actualStartAt: T0, ...tripOverrides })),
      findPlannedYard: (_t, stopId) => Promise.resolve(stops.find(s => s.id === stopId)),
      listPlannedYardsForTrip: () => Promise.resolve(stops),
      listStopEventsForTrip: () => Promise.resolve([]),
      recordStopEvent: (tripId, stopId, input) =>
        Promise.resolve({
          stop: {
            ...target,
            status: 'arrived',
            actualArrivalAt: input.occurredAt,
            actualSource: 'manual',
          },
          event: {
            id: '1',
            tripPlannedYardId: stopId,
            tripId,
            eventType: input.eventType,
            occurredAt: input.occurredAt,
            source: input.source,
            reason: null,
            recordedBy: input.recordedBy,
            createdAt: null,
          },
        }),
      setDestinationReachedIfUnset: (tripId, at) => {
        destinationSets.push({ tripId, at });
        return Promise.resolve(true);
      },
      findYardBrief: () =>
        Promise.resolve({ id: '2', name: 'Yard', address: null, latitude: 1, longitude: 2 }),
    }),
    fakeVehiclesLookup(),
    fakeDriversLookup(),
    fakeAssignmentMetricsLookup(),
    fakeDevicesLookup(),
    fakeUsersLookup(),
    fakeGeofencesLookup(),
    realtime
  );
  return { service, destinationSets, realtime };
}

// ===========================================================================
// D-0161 — trip:update publications (05 §7)
// ===========================================================================

describe('FleetTripsService publishes trip:update (D-0161)', () => {
  const reasons = (r: RecordingFleetRealtime) => r.tripUpdates.map(u => u.payload.reason);

  it("startTrip publishes `started` (company room = the trip's company, stop null); a seeded stop adds `stop_arrived` and, for the last stop, `destination_reached`", async () => {
    const { service, realtime } = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })], {
      inside: ['10'],
    });

    await service.startTrip('1');

    expect(reasons(realtime)).toEqual(['started', 'stop_arrived', 'destination_reached']);
    expect(realtime.tripUpdates[0]).toMatchObject({
      companyId: '1',
      payload: { tripId: '1', reason: 'started', stop: null },
    });
    expect(realtime.tripUpdates[1]?.payload.stop).toMatchObject({
      id: '1',
      yard: { name: 'Yard' },
    });
    expect(realtime.tripUpdates[2]?.payload.stop).toBeNull();
    expect(realtime.tripUpdates[0]?.payload.occurredAt).toMatch(/Z$/);
  });

  it('completeTrip publishes `completed`', async () => {
    const { service, realtime } = buildBridge([], {
      tripOverrides: { status: 'in_progress', actualStartAt: T0 },
    });
    await service.completeTrip('1', { odometerEndKm: null, fuelUsedLiters: null, notes: null });
    expect(reasons(realtime)).toEqual(['completed']);
  });

  it('cancelTrip publishes `cancelled`', async () => {
    const { service, realtime } = buildBridge([], { tripOverrides: { status: 'planned' } });
    await service.cancelTrip('1', { cancellationReason: null });
    expect(reasons(realtime)).toEqual(['cancelled']);
  });

  it('sensor enter -> `stop_arrived` with the full stop; last stop -> also `destination_reached`', async () => {
    const { service, realtime } = buildBridge([makeStop({ id: '9', yardId: '30', sequence: 1 })]);
    await service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '30',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(reasons(realtime)).toEqual(['stop_arrived', 'destination_reached']);
    expect(realtime.tripUpdates[0]?.payload.stop).toMatchObject({ id: '9', events: [] });
    expect(realtime.tripUpdates[0]?.payload.occurredAt).toBe(ENTER_AT.toISOString());
  });

  it('sensor exit -> `stop_departed`; nothing is published when the sensor wrote nothing (race lost / no matching stop)', async () => {
    const departing = buildBridge([
      makeStop({
        id: '1',
        yardId: '10',
        sequence: 1,
        status: 'arrived',
        actualArrivalAt: ENTER_AT,
        actualSource: 'geofence_auto',
      }),
    ]);
    await departing.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'exit',
      occurredAt: EXIT_AT,
    });
    expect(reasons(departing.realtime)).toEqual(['stop_departed']);

    const lost = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })], {
      writeSucceeds: false,
    });
    await lost.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '10',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    const none = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })]);
    await none.service.recordGeofenceStopTransition({
      tripId: '1',
      yardId: '99',
      eventType: 'enter',
      occurredAt: ENTER_AT,
    });
    expect(lost.realtime.tripUpdates).toEqual([]);
    expect(none.realtime.tripUpdates).toEqual([]);
  });

  it('destination by proximity -> `destination_reached` once; already reached / too far -> nothing', async () => {
    const trip = {
      id: '1',
      destinationLatitude: 31.5,
      destinationLongitude: 74.3,
      destinationReachedAt: null,
    };
    const near = buildBridge([]);
    await near.service.checkDestinationProximity(trip, 31.501, 74.3);
    expect(reasons(near.realtime)).toEqual(['destination_reached']);

    const far = buildBridge([]);
    await far.service.checkDestinationProximity(trip, 31.503, 74.3);
    expect(far.realtime.tripUpdates).toEqual([]);
  });

  it('manual arrive -> `stop_arrived`; replacing an existing arrival -> `stop_updated`; manual departure -> `stop_departed`', async () => {
    const first = buildStopService(makeStop());
    await inCtx(() => first.service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null }));
    expect(reasons(first.realtime)).toEqual(['stop_arrived']);

    const replacing = buildStopService(
      makeStop({ status: 'arrived', actualArrivalAt: ARRIVED, actualSource: 'geofence_auto' })
    );
    await inCtx(() =>
      replacing.service.arriveStop('1', '7', {
        occurredAt: new Date(ARRIVED.getTime() - 60_000),
        reason: 'GPS offline',
      })
    );
    expect(reasons(replacing.realtime)).toEqual(['stop_updated']);
    expect(replacing.realtime.tripUpdates[0]?.payload.stop?.['events']).toHaveLength(1);

    const departing = buildStopService(makeStop({ status: 'arrived', actualArrivalAt: ARRIVED }));
    await inCtx(() =>
      departing.service.departStop('1', '7', {
        occurredAt: new Date(ARRIVED.getTime() + 60_000),
        reason: null,
      })
    );
    expect(reasons(departing.realtime)).toEqual(['stop_departed']);
  });

  it('manual arrival at the LAST stop -> `stop_arrived` then `destination_reached` (awaitingCompletion is true on both)', async () => {
    const stop = makeStop({ id: '7', sequence: 2 });
    const { service, realtime } = buildBridgeForManual(
      [makeStop({ id: '6', sequence: 1 }), stop],
      stop
    );
    await inCtx(() => service.arriveStop('1', '7', { occurredAt: ARRIVED, reason: null }));
    expect(reasons(realtime)).toEqual(['stop_arrived', 'destination_reached']);
  });

  it('a realtime failure never fails the operation (publishing is best-effort)', async () => {
    const { service } = buildBridge([makeStop({ id: '1', yardId: '10', sequence: 1 })]);
    (service as unknown as { realtime: unknown }).realtime = {
      publishTripUpdate: () => Promise.reject(new Error('queue down')),
    };
    await expect(
      service.recordGeofenceStopTransition({
        tripId: '1',
        yardId: '10',
        eventType: 'enter',
        occurredAt: ENTER_AT,
      })
    ).resolves.toBeUndefined();
  });
});

describe('FleetTripsService.deleteTrip (D-0162)', () => {
  it('deletes a planned trip', async () => {
    let deleted: string | undefined;
    const service = buildService({
      repo: {
        findTripById: () => Promise.resolve(makeTrip({ status: 'planned' })),
        deleteTrip: id => {
          deleted = id;
          return Promise.resolve(true);
        },
      },
    });
    expect(await service.deleteTrip('1')).toEqual({
      success: true,
      message: 'Trip deleted successfully.',
    });
    expect(deleted).toBe('1');
  });

  it.each(['in_progress', 'completed', 'cancelled'] as const)(
    'refuses a %s trip with the fixed message and deletes nothing',
    async status => {
      let deleted = false;
      const service = buildService({
        repo: {
          findTripById: () => Promise.resolve(makeTrip({ status })),
          deleteTrip: () => {
            deleted = true;
            return Promise.resolve(true);
          },
        },
      });
      await expect(service.deleteTrip('1')).rejects.toThrow('Only planned trips can be deleted.');
      expect(deleted).toBe(false);
    }
  );

  it("404 for a trip outside the caller's company", async () => {
    const service = buildService({ repo: { findTripById: () => Promise.resolve(undefined) } });
    await expect(service.deleteTrip('9')).rejects.toThrow(NotFoundError);
  });
});

describe('FleetTripsService publishes `created` and `deleted` (D-0163)', () => {
  it("createTrip publishes `created` to the trip's company room with the trip after creation (planned, no stop)", async () => {
    const realtime = new RecordingFleetRealtime();
    const service = new FleetTripsService(
      fakeFleetTripsRepository({
        vehicleHasActiveTrip: () => Promise.resolve(false),
        countTripsForCompany: () => Promise.resolve(0),
        createTrip: () =>
          Promise.resolve(
            makeTrip({
              id: '31',
              companyId: '4',
              status: 'planned',
              createdAt: new Date('2026-09-24T09:00:00.000Z'),
            })
          ),
        createPlannedYards: () => Promise.resolve([]),
        findTripById: () =>
          Promise.resolve(makeTrip({ id: '31', companyId: '4', status: 'planned' })),
        listPlannedYardsForTrip: () => Promise.resolve([]),
        listStopEventsForTrip: () => Promise.resolve([]),
      }),
      fakeVehiclesLookup({
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ driverId: '7' }),
      }),
      fakeDriversLookup({
        findDriverById: () =>
          Promise.resolve({ id: '7', firstName: 'J', lastName: 'D', licenseNumber: null }),
      }),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      realtime
    );

    await runWithContextAsync(ctx(), () => service.createTrip(MINIMAL_CREATE_INPUT));

    expect(realtime.tripUpdates).toHaveLength(1);
    expect(realtime.tripUpdates[0]).toMatchObject({
      companyId: '4',
      payload: {
        tripId: '31',
        reason: 'created',
        status: 'planned',
        awaitingCompletion: false,
        stop: null,
      },
    });
  });

  it('deleteTrip publishes `deleted` from the pre-delete snapshot (the trip no longer exists afterwards); a refused delete publishes nothing', async () => {
    const realtime = new RecordingFleetRealtime();
    const build = (status: Trip['status']) =>
      new FleetTripsService(
        fakeFleetTripsRepository({
          findTripById: () => Promise.resolve(makeTrip({ id: '31', companyId: '4', status })),
          deleteTrip: () => Promise.resolve(true),
        }),
        fakeVehiclesLookup(),
        fakeDriversLookup(),
        fakeAssignmentMetricsLookup(),
        fakeDevicesLookup(),
        fakeUsersLookup(),
        fakeGeofencesLookup(),
        realtime
      );

    await expect(build('in_progress').deleteTrip('31')).rejects.toThrow(
      'Only planned trips can be deleted.'
    );
    expect(realtime.tripUpdates).toEqual([]);

    await build('planned').deleteTrip('31');
    expect(realtime.tripUpdates).toHaveLength(1);
    expect(realtime.tripUpdates[0]).toMatchObject({
      companyId: '4',
      payload: {
        tripId: '31',
        reason: 'deleted',
        status: 'planned',
        awaitingCompletion: false,
        destinationReachedAt: null,
        stop: null,
      },
    });
  });
});

describe('FleetTripsService.bulkDeleteTrips (D-0166, B10)', () => {
  it('ids mode: each trip goes through the single-trip delete — only planned trips go, the rest are refused per record', async () => {
    const deleted: string[] = [];
    const service = buildService({
      repo: {
        findTripById: id =>
          Promise.resolve(
            id === '9' ? undefined : makeTrip({ id, status: id === '2' ? 'completed' : 'planned' })
          ),
        deleteTrip: id => {
          deleted.push(id);
          return Promise.resolve(true);
        },
      },
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.bulkDeleteTrips({ ids: ['1', '2', '9'] })
    );

    expect(deleted).toEqual(['1']);
    expect(result.data.results).toEqual([
      {
        id: '1',
        ok: true,
        changed: true,
        label: 'TRP-00001',
        message: 'Trip deleted successfully.',
      },
      {
        id: '2',
        ok: false,
        changed: false,
        label: 'TRP-00001',
        message: 'Only planned trips can be deleted.',
      },
      { id: '9', ok: false, changed: false, label: null, message: 'Trip not found.' },
    ]);
    expect(result.message).toBe('1 of 3 succeeded.');
  });

  it('filter mode: resolves the trips list filter (page 1, 500) and refuses more than 500 matches', async () => {
    const listTrips = vi.fn(() =>
      Promise.resolve({ items: [makeTrip({ id: '7', status: 'planned' })], total: 1 })
    );
    const service = buildService({
      repo: {
        listTrips,
        findTripById: () => Promise.resolve(makeTrip({ id: '7', status: 'planned' })),
        deleteTrip: () => Promise.resolve(true),
      },
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.bulkDeleteTrips({
        filter: { status: ['planned'], search: 'zz', vehicleId: '3' } as never,
      })
    );

    expect(listTrips).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['planned'],
        search: 'zz',
        vehicleId: '3',
        page: 1,
        perPage: 500,
      })
    );
    expect(result.data.summary).toMatchObject({ mode: 'filter', matched: 1, succeeded: 1 });

    const tooMany = buildService({
      repo: { listTrips: () => Promise.resolve({ items: [], total: 501 }) },
    });
    await expect(
      runWithContextAsync(ctx(), () => tooMany.bulkDeleteTrips({ filter: {} as never }))
    ).rejects.toThrow('Narrow the filter.');
  });
});

describe('FleetTripsService.exportTrips (D-0168, B11)', () => {
  it("looks each distinct vehicle / driver up once for the whole export and passes the list's filters", async () => {
    const findVehicleById = vi.fn(() => Promise.resolve({ id: '1', name: 'Truck 1' }));
    const findDriverById = vi.fn(() =>
      Promise.resolve({ id: '1', firstName: 'Jane', lastName: 'Doe' })
    );
    const listTrips = vi.fn(() =>
      Promise.resolve({
        items: [makeTrip({ id: '1' }), makeTrip({ id: '2' }), makeTrip({ id: '3' })],
        total: 3,
      })
    );
    const service = buildService({
      repo: { listTrips },
      vehiclesLookup: { findVehicleById } as never,
      driversLookup: { findDriverById } as never,
    });

    const plan = await service.exportTrips({
      status: ['planned'],
      vehicleId: undefined,
      driverId: undefined,
      customerId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: 'zz',
    });
    const batches = await collect(plan.batches());

    expect(listTrips).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['planned'], search: 'zz', page: 1, perPage: 500 })
    );
    expect(findVehicleById).toHaveBeenCalledTimes(1);
    expect(findDriverById).toHaveBeenCalledTimes(1);
    const rows = (batches[0] as never[]).map(r =>
      Object.fromEntries(plan.columns.map(c => [c.header, c.value(r)]))
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: '1', vehicle: 'Truck 1', driver: 'Jane Doe' });
    expect(plan.columns.map(c => c.header).slice(0, 8)).toEqual([
      'id',
      'trip_reference',
      'status',
      'purpose',
      'vehicle_id',
      'vehicle',
      'driver_id',
      'driver',
    ]);
  });
});

async function collect<T>(batches: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = [];
  for await (const batch of batches) out.push(batch);
  return out;
}

describe('FleetTripsService.bulkDeleteTrips labels (D-0171)', () => {
  it("each result carries the trip's reference, read before the trip is deleted (null when the trip has none or does not exist)", async () => {
    const service = buildService({
      repo: {
        findTripById: id =>
          Promise.resolve(
            id === '9'
              ? undefined
              : makeTrip({ id, status: 'planned', tripReference: id === '2' ? null : `TRP-${id}` })
          ),
        deleteTrip: () => Promise.resolve(true),
      },
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.bulkDeleteTrips({ ids: ['1', '2', '9'] })
    );
    expect(result.data.results.map(r => [r.id, r.ok, r.changed, r.label])).toEqual([
      ['1', true, true, 'TRP-1'],
      ['2', true, true, null],
      ['9', false, false, null],
    ]);
  });
});

describe('FleetTripsService.updateTrip — stop editing on planned trips (D-0175, B5)', () => {
  const existing = [
    makeStop({
      id: '10',
      yardId: '5',
      sequence: 1,
      stopPurpose: 'load',
      plannedArrivalAt: new Date('2026-10-01T08:00:00Z'),
      plannedDepartureAt: new Date('2026-10-01T09:00:00Z'),
      notes: 'keep me',
    }),
    makeStop({ id: '11', yardId: '6', sequence: 2 }),
  ];

  function build(
    status: Trip['status'] = 'planned',
    repoOverrides: Parameters<typeof fakeFleetTripsRepository>[0] = {}
  ) {
    const realtime = new RecordingFleetRealtime();
    const replace = vi.fn((_tripId: string, _stops: unknown) =>
      Promise.resolve<TripPlannedYard[] | undefined>([])
    );
    const service = new FleetTripsService(
      fakeFleetTripsRepository({
        findTripById: () => Promise.resolve(makeTrip({ status })),
        updateTrip: () => Promise.resolve(makeTrip({ status })),
        listPlannedYardsForTrip: () => Promise.resolve(existing),
        listStopEventsForTrip: () => Promise.resolve([]),
        findYardBrief: (id: string) =>
          Promise.resolve(
            id === '999'
              ? undefined
              : { id, name: `Yard ${id}`, address: null, latitude: null, longitude: null }
          ),
        replacePlannedYards: replace,
        ...repoOverrides,
      }),
      fakeVehiclesLookup({
        findVehicleById: () =>
          Promise.resolve({
            id: '1',
            name: 'Truck',
            vehicleCategory: null,
            make: null,
            model: null,
          }),
      }),
      fakeDriversLookup({
        findDriverById: () =>
          Promise.resolve({ id: '1', firstName: 'Jane', lastName: 'Doe', licenseNumber: null }),
      }),
      fakeAssignmentMetricsLookup(),
      fakeDevicesLookup(),
      fakeUsersLookup(),
      fakeGeofencesLookup(),
      realtime
    );
    return { service, realtime, replace };
  }

  it('replaces the stop list in the order sent — ids keep their stops, omitted fields keep their values — and tells other operators (`updated`)', async () => {
    const { service, realtime, replace } = build();
    const stops = [
      { id: '11', yardId: '6' },
      { yardId: '7', stopPurpose: 'unload', plannedArrivalAt: new Date('2026-10-01T12:00:00Z') },
      { id: '10', yardId: '5', stopPurpose: null },
    ];

    const result = await runWithContextAsync(ctx(), () =>
      service.updateTrip('1', { plannedYards: stops })
    );

    expect(replace).toHaveBeenCalledWith('1', stops);
    expect(result.data).toHaveProperty('planned_yards');
    expect(realtime.tripUpdates.map(u => u.payload.reason)).toEqual(['updated']);
    expect(realtime.tripUpdates[0]?.payload).toMatchObject({
      tripId: '1',
      status: 'planned',
      stop: null,
    });
  });

  it('a plain trip edit (no stops) leaves the stops alone but still announces `updated`', async () => {
    const { service, realtime, replace } = build();
    await runWithContextAsync(ctx(), () => service.updateTrip('1', { purpose: 'delivery' }));
    expect(replace).not.toHaveBeenCalled();
    expect(realtime.tripUpdates.map(u => u.payload.reason)).toEqual(['updated']);
  });

  it('an empty list is allowed and clears the stops', async () => {
    const { service, replace } = build();
    await runWithContextAsync(ctx(), () => service.updateTrip('1', { plannedYards: [] }));
    expect(replace).toHaveBeenCalledWith('1', []);
  });

  it('refuses to touch stops once the trip has started (fields can still be edited) — nothing is written or announced', async () => {
    const { service, realtime, replace } = build('in_progress');
    await expect(
      runWithContextAsync(ctx(), () => service.updateTrip('1', { plannedYards: [] }))
    ).rejects.toThrow('Stops can only be edited while the trip is planned.');
    expect(replace).not.toHaveBeenCalled();
    expect(realtime.tripUpdates).toEqual([]);
    await expect(
      runWithContextAsync(ctx(), () => service.updateTrip('1', { purpose: 'ok' }))
    ).resolves.toMatchObject({ success: true });
  });

  it('a trip started between the check and the write is refused too (the repository transaction re-checks)', async () => {
    const { service } = build('planned', { replacePlannedYards: () => Promise.resolve(undefined) });
    await expect(
      runWithContextAsync(ctx(), () => service.updateTrip('1', { plannedYards: [{ yardId: '5' }] }))
    ).rejects.toThrow('Stops can only be edited while the trip is planned.');
  });

  it('validates every stop: unknown or repeated stop id, departure before arrival (also against the value a kept stop already has), too many stops', async () => {
    const { service } = build();
    const errorsOf = async (
      plannedYards: Parameters<typeof service.updateTrip>[1]['plannedYards']
    ) => {
      try {
        await runWithContextAsync(ctx(), () => service.updateTrip('1', { plannedYards }));
      } catch (error) {
        return (error as ValidationError).details;
      }
      return undefined;
    };

    expect(await errorsOf([{ id: '99', yardId: '5' }])).toEqual({
      'planned_yards.0.id': ['The selected stop id is invalid.'],
    });
    expect(
      await errorsOf([
        { id: '10', yardId: '5' },
        { id: '10', yardId: '5' },
      ])
    ).toEqual({ 'planned_yards.1.id': ["The same stop can't appear twice."] });
    expect(
      await errorsOf([
        {
          yardId: '5',
          plannedArrivalAt: new Date('2026-10-02T10:00:00Z'),
          plannedDepartureAt: new Date('2026-10-02T09:00:00Z'),
        },
      ])
    ).toEqual({
      'planned_yards.0.planned_departure_at': [
        "The planned departure can't be before the planned arrival.",
      ],
    });
    // kept stop 10 already arrives 08:00 → sending only an earlier departure is wrong once merged
    expect(
      await errorsOf([
        { id: '10', yardId: '5', plannedDepartureAt: new Date('2026-10-01T07:00:00Z') },
      ])
    ).toEqual({
      'planned_yards.0.planned_departure_at': [
        "The planned departure can't be before the planned arrival.",
      ],
    });
    expect(await errorsOf(Array.from({ length: 101 }, () => ({ yardId: '5' })))).toEqual({
      planned_yards: ['A trip can have at most 100 stops.'],
    });
    // the same yard twice / back to back and out-of-order times are fine (owner Q18)
    expect(await errorsOf([{ yardId: '5' }, { yardId: '5' }])).toBeUndefined();
  });

  it("every stop's yard must be one of the caller's yards (same 422 as create, keyed by the stop's position)", async () => {
    const { service, replace } = build();
    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateTrip('1', { plannedYards: [{ yardId: '5' }, { yardId: '999' }] })
      )
    ).rejects.toMatchObject({
      details: { 'planned_yards.1.yard_id': ['The selected yard id is invalid.'] },
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('POST /trips shares the two new sanity checks', async () => {
    const service = buildService({
      repo: {
        findYardBrief: () =>
          Promise.resolve({ id: '5', name: 'Y', address: null, latitude: null, longitude: null }),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({ id: '1', name: 'T', vehicleCategory: null, make: null, model: null }),
        currentAssignmentForVehicle: () => Promise.resolve({ id: '1', driverId: '4' }),
      },
      driversLookup: {
        findDriverById: () =>
          Promise.resolve({ id: '4', firstName: 'A', lastName: 'B', licenseNumber: null }),
      },
    });
    const stop = {
      yardId: '5',
      stopPurpose: null,
      plannedArrivalAt: new Date('2026-10-02T10:00:00Z'),
      plannedDepartureAt: new Date('2026-10-02T09:00:00Z'),
      notes: null,
    };
    await expect(
      runWithContextAsync(ctx(), () =>
        service.createTrip({ ...MINIMAL_CREATE_INPUT, plannedYards: [stop] })
      )
    ).rejects.toMatchObject({
      details: {
        'planned_yards.0.planned_departure_at': [
          "The planned departure can't be before the planned arrival.",
        ],
      },
    });
    await expect(
      runWithContextAsync(ctx(), () =>
        service.createTrip({
          ...MINIMAL_CREATE_INPUT,
          plannedYards: Array.from({ length: 101 }, () => ({ ...stop, plannedDepartureAt: null })),
        })
      )
    ).rejects.toMatchObject({
      details: { planned_yards: ['A trip can have at most 100 stops.'] },
    });
  });
});

describe('FleetTripsService.updateTrip — optimistic concurrency (D-0176, B13)', () => {
  it('a stale trip edit answers 409 before any other rule (even a stop edit) and writes nothing', async () => {
    const replace = vi.fn(() => Promise.resolve([]));
    const update = vi.fn(() => Promise.resolve(makeTrip()));
    const service = buildService({
      repo: {
        findTripById: () =>
          Promise.resolve(
            makeTrip({ status: 'planned', updatedAt: new Date('2026-09-25T10:07:00Z') })
          ),
        updateTrip: update,
        replacePlannedYards: replace,
      },
    });
    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateTrip('1', { plannedYards: [] }, new Date('2026-09-25T10:00:00Z'))
      )
    ).rejects.toMatchObject({ httpStatus: 409, details: { current: { id: '1' } } });
    expect(replace).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('FleetTripsService.tripCounts (D-0179, B7)', () => {
  it('counts every trip status (0 when empty) with a total', async () => {
    const service = buildService({
      repo: {
        tripStatusCounts: () =>
          Promise.resolve([
            { status: 'completed', count: 31 },
            { status: 'planned', count: 4 },
          ]),
      },
    });
    const result = await service.tripCounts({
      status: undefined,
      vehicleId: undefined,
      driverId: undefined,
      customerId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(result.data).toEqual({
      total: 35,
      by_status: { planned: 4, in_progress: 0, completed: 31, cancelled: 0 },
    });
  });
});
