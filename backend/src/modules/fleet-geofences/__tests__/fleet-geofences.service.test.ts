import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetGeofencesService } from '../fleet-geofences.service.js';
import { RecordingFleetRealtime } from '../../../platform/realtime/__tests__/recording-fleet-realtime.js';
import {
  fakeFleetGeofencesRepository,
  fakeTripsLookup,
  fakeVehicleAssignmentLookup,
  fakeVehiclesLookup,
} from './fakes.js';
import type { Geofence, GeofenceEventWithAlertOn } from '../fleet-geofences.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

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

function makeGeofence(overrides: Partial<Geofence> = {}): Geofence {
  return {
    id: '1',
    companyId: '1',
    yardId: null,
    name: 'Warehouse',
    centerLatitude: 31.5,
    centerLongitude: 74.3,
    radiusM: 300,
    alertOn: 'both',
    isActive: true,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function buildService(
  overrides: {
    repo?: Partial<ReturnType<typeof fakeFleetGeofencesRepository>>;
    vehicleAssignmentLookup?: Parameters<typeof fakeVehicleAssignmentLookup>[0];
    vehiclesLookup?: Parameters<typeof fakeVehiclesLookup>[0];
    tripsLookup?: Parameters<typeof fakeTripsLookup>[0];
    realtime?: RecordingFleetRealtime;
  } = {}
) {
  const repo = fakeFleetGeofencesRepository(overrides.repo ?? {});
  const vehicleAssignmentLookup = fakeVehicleAssignmentLookup(
    overrides.vehicleAssignmentLookup ?? {}
  );
  const vehiclesLookup = fakeVehiclesLookup(overrides.vehiclesLookup ?? {});
  return new FleetGeofencesService(
    repo,
    vehicleAssignmentLookup,
    vehiclesLookup,
    fakeTripsLookup(overrides.tripsLookup),
    overrides.realtime ?? new RecordingFleetRealtime(),
    NO_ACTORS
  );
}

describe('FleetGeofencesService.createGeofence (GeofenceController::store equivalent)', () => {
  it('creates with explicit coordinates', async () => {
    let created: unknown;
    const service = buildService({
      repo: {
        createGeofence: input => {
          created = input;
          return Promise.resolve(makeGeofence());
        },
      },
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.createGeofence({
        name: 'Warehouse',
        yardId: null,
        centerLatitude: 31.5,
        centerLongitude: 74.3,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    expect(created).toMatchObject({ centerLatitude: 31.5, centerLongitude: 74.3 });
    expect(result).toMatchObject({ success: true, message: 'Geofence created successfully.' });
  });

  it("defaults center to the yard's own lat/lng when yard_id is given without explicit coordinates ('highest-leverage case', geofence-detection.md §4)", async () => {
    let created: unknown;
    const service = buildService({
      repo: {
        findYardBrief: id =>
          Promise.resolve(
            id === '9'
              ? { id: '9', name: 'Main Yard', address: null, latitude: 10, longitude: 20 }
              : undefined
          ),
        createGeofence: input => {
          created = input;
          return Promise.resolve(
            makeGeofence({ yardId: '9', centerLatitude: 10, centerLongitude: 20 })
          );
        },
      },
    });

    await runWithContextAsync(ctx(), () =>
      service.createGeofence({
        name: 'From yard',
        yardId: '9',
        centerLatitude: null,
        centerLongitude: null,
        radiusM: 300,
        alertOn: 'both',
      })
    );

    expect(created).toMatchObject({ centerLatitude: 10, centerLongitude: 20 });
  });

  it('422s when neither coordinates nor a yard with coordinates are given (falls through, matching Laravel exactly)', async () => {
    const service = buildService({
      repo: { findYardBrief: () => Promise.resolve(undefined) },
    });

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createGeofence({
          name: 'No coords',
          yardId: '9',
          centerLatitude: null,
          centerLongitude: null,
          radiusM: 300,
          alertOn: 'both',
        })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('422s when the referenced yard has no coordinates set', async () => {
    const service = buildService({
      repo: {
        findYardBrief: () =>
          Promise.resolve({
            id: '9',
            name: 'Empty Yard',
            address: null,
            latitude: null,
            longitude: null,
          }),
      },
    });

    await expect(
      runWithContextAsync(ctx(), () =>
        service.createGeofence({
          name: 'No coords',
          yardId: '9',
          centerLatitude: null,
          centerLongitude: null,
          radiusM: 300,
          alertOn: 'both',
        })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('FleetGeofencesService.updateGeofence / deleteGeofence', () => {
  it("404s when the geofence doesn't exist (or belongs to another company — tenant-scoping extension handles that)", async () => {
    const service = buildService({ repo: { updateGeofence: () => Promise.resolve(undefined) } });
    await expect(
      service.updateGeofence('999', {
        name: undefined,
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s deleting a nonexistent geofence', async () => {
    const service = buildService({ repo: { deleteGeofence: () => Promise.resolve(false) } });
    await expect(service.deleteGeofence('999')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates successfully', async () => {
    const service = buildService({
      repo: {
        updateGeofence: () => Promise.resolve(makeGeofence({ alertOn: 'enter', isActive: false })),
      },
    });
    const result = await service.updateGeofence('1', {
      name: undefined,
      radiusM: undefined,
      alertOn: 'enter',
      isActive: false,
    });
    expect(result).toMatchObject({ success: true, data: { alert_on: 'enter', is_active: false } });
  });

  it('deletes successfully', async () => {
    const service = buildService({ repo: { deleteGeofence: () => Promise.resolve(true) } });
    const result = await service.deleteGeofence('1');
    expect(result).toEqual({ success: true, message: 'Geofence deleted successfully.' });
  });
});

describe('FleetGeofencesService.listGeofences (GeofenceController::index equivalent)', () => {
  it('includes a yard brief when the geofence has a yard_id, null otherwise', async () => {
    const service = buildService({
      repo: {
        listGeofencesForCompany: () =>
          Promise.resolve({
            items: [
              makeGeofence({ id: '1', yardId: '9' }),
              makeGeofence({ id: '2', yardId: null }),
            ],
            total: 2,
          }),
        findYardBrief: id =>
          Promise.resolve(
            id === '9'
              ? { id: '9', name: 'Main Yard', address: null, latitude: 1, longitude: 2 }
              : undefined
          ),
      },
    });

    const result = await service.listGeofences({});

    expect(result.data).toEqual([
      expect.objectContaining({ id: '1', yard: { id: '9', name: 'Main Yard' } }),
      expect.objectContaining({ id: '2', yard: null }),
    ]);
  });
});

describe('FleetGeofencesService.listEvents (11.4 fix: loads vehicle, not device; D-0079: alert_on-filtered at read time)', () => {
  function makeEvent(overrides: Partial<GeofenceEventWithAlertOn> = {}): GeofenceEventWithAlertOn {
    return {
      id: '1',
      geofenceId: '1',
      vehicleId: '5',
      eventType: 'enter',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      tripId: null,
      createdAt: null,
      updatedAt: null,
      geofenceAlertOn: 'both',
      geofenceName: 'Main Yard Fence',
      geofenceYardId: '9',
      ...overrides,
    };
  }

  it("includes the geofence's id/name/yard_id (11.79 — the UI showed blank names without it)", async () => {
    const service = buildService({
      repo: {
        listRecentEventsForCompany: () =>
          Promise.resolve({ items: [makeEvent({ geofenceYardId: null })], total: 1 }),
      },
      vehiclesLookup: { findVehicleById: () => Promise.resolve(undefined) },
    });

    const result = await runWithContextAsync(ctx(), () => service.listEvents({ limit: 50 }));

    expect(
      ((result.data as Record<string, unknown>[])[0] as Record<string, unknown>)['geofence']
    ).toEqual({
      id: '1',
      name: 'Main Yard Fence',
      yard_id: null,
    });
  });

  it('includes a vehicle brief, not a device', async () => {
    const service = buildService({
      repo: {
        listRecentEventsForCompany: () => Promise.resolve({ items: [makeEvent()], total: 1 }),
      },
      vehiclesLookup: {
        findVehicleById: id =>
          Promise.resolve(id === '5' ? { id: '5', name: 'Truck 5' } : undefined),
      },
    });

    const result = await runWithContextAsync(ctx(), () => service.listEvents({ limit: 50 }));

    expect(result.data).toEqual([
      expect.objectContaining({
        id: '1',
        vehicle_id: '5',
        event_type: 'enter',
        vehicle: { id: '5', name: 'Truck 5' },
      }),
    ]);
    expect(
      ((result.data as Record<string, unknown>[])[0] as Record<string, unknown>)['device']
    ).toBeUndefined();
  });

  it("passes the caller's companyId and limit straight through to the repository (the actual alert_on filtering happens there, exercised by the real-Postgres integration suite)", async () => {
    let calledWith: unknown;
    const service = buildService({
      repo: {
        listRecentEventsForCompany: (companyId, query) => {
          calledWith = { companyId, limit: query.limit };
          return Promise.resolve({ items: [], total: 0 });
        },
      },
    });

    await runWithContextAsync(ctx({ companyId: '42' }), () => service.listEvents({ limit: 77 }));

    expect(calledWith).toEqual({ companyId: '42', limit: 77 });
  });
});

describe('FleetGeofencesService.checkPosition (GeofenceService::checkPosition equivalent — the ingestion-wired detector, D-0079)', () => {
  it("does nothing when the device isn't currently assigned to any vehicle", async () => {
    let listedGeofences = false;
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () => {
          listedGeofences = true;
          return Promise.resolve([]);
        },
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve(undefined) },
    });

    await service.checkPosition('1', 'device-1', 31.5, 74.3);

    expect(listedGeofences).toBe(false);
  });

  it("writes an 'enter' event when a vehicle newly enters a geofence's radius, regardless of alert_on (D-0079 — always persists the real transition)", async () => {
    const writes: { geofenceId: string; vehicleId: string; eventType: string }[] = [];
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([
            makeGeofence({
              id: '10',
              centerLatitude: 31.5,
              centerLongitude: 74.3,
              radiusM: 300,
              alertOn: 'exit',
            }),
          ]),
        findLastEventForPair: () => Promise.resolve(undefined),
        createGeofenceEvent: (geofenceId, vehicleId, eventType) => {
          writes.push({ geofenceId, vehicleId, eventType });
          return Promise.resolve({
            id: '1',
            geofenceId,
            vehicleId,
            eventType,
            occurredAt: new Date(),
            tripId: null,
            createdAt: null,
            updatedAt: null,
          });
        },
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve('5') },
    });

    // Same point as the geofence's own center -> distance 0 -> inside.
    await service.checkPosition('1', 'device-1', 31.5, 74.3);

    expect(writes).toEqual([{ geofenceId: '10', vehicleId: '5', eventType: 'enter' }]);
  });

  it("does not write anything when the vehicle is outside and there's no prior history (dedup — matches step 5 exactly)", async () => {
    const writes: unknown[] = [];
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([
            makeGeofence({
              id: '10',
              centerLatitude: 0,
              centerLongitude: 0,
              radiusM: 300,
              alertOn: 'both',
            }),
          ]),
        findLastEventForPair: () => Promise.resolve(undefined),
        createGeofenceEvent: (geofenceId, vehicleId, eventType) => {
          writes.push({ geofenceId, vehicleId, eventType });
          return Promise.resolve({
            id: '1',
            geofenceId,
            vehicleId,
            eventType,
            occurredAt: new Date(),
            tripId: null,
            createdAt: null,
            updatedAt: null,
          });
        },
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve('5') },
    });

    // Far from (0,0) -> outside; no prior event -> wasInside=false -> dedup.
    await service.checkPosition('1', 'device-1', 31.5, 74.3);

    expect(writes).toEqual([]);
  });

  it("11.35 FIX end-to-end: an alert_on='exit'-only geofence correctly records an enter then an exit across two calls (Laravel's bug records neither)", async () => {
    const events: { vehicleId: string; eventType: 'enter' | 'exit'; occurredAt: Date }[] = [];
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([
            makeGeofence({
              id: '10',
              centerLatitude: 0,
              centerLongitude: 0,
              radiusM: 300,
              alertOn: 'exit',
            }),
          ]),
        findLastEventForPair: (_geofenceId, vehicleId) => {
          const last = [...events].reverse().find(e => e.vehicleId === vehicleId);
          return Promise.resolve(
            last && {
              id: 'x',
              geofenceId: '10',
              vehicleId,
              eventType: last.eventType,
              occurredAt: last.occurredAt,
              tripId: null,
              createdAt: null,
              updatedAt: null,
            }
          );
        },
        createGeofenceEvent: (geofenceId, vehicleId, eventType) => {
          const row = {
            id: String(events.length + 1),
            geofenceId,
            vehicleId,
            eventType,
            occurredAt: new Date(),
            tripId: null,
            createdAt: null,
            updatedAt: null,
          };
          events.push({ vehicleId, eventType, occurredAt: row.occurredAt });
          return Promise.resolve(row);
        },
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve('5') },
    });

    // Enter (inside the geofence).
    await service.checkPosition('1', 'device-1', 0, 0);
    // Exit (far away).
    await service.checkPosition('1', 'device-1', 45, 45);

    expect(events.map(e => e.eventType)).toEqual(['enter', 'exit']);
  });
});

describe('FleetGeofencesService.checkPosition — sensor→trip bridge wiring (D-0156)', () => {
  const trip = {
    id: '77',
    destinationLatitude: null,
    destinationLongitude: null,
    destinationReachedAt: null,
  };
  const event = (eventType: 'enter' | 'exit', tripId: string | null) => ({
    id: '1',
    geofenceId: '10',
    vehicleId: '5',
    eventType,
    occurredAt: new Date('2026-09-24T09:00:00.000Z'),
    tripId,
    createdAt: null,
    updatedAt: null,
  });

  function harness(over: {
    geofence?: Partial<Geofence>;
    trip?: typeof trip | undefined;
    created?: 'event' | 'raced';
  }) {
    const created: { tripId: string | null | undefined }[] = [];
    const transitions: unknown[] = [];
    const proximity: unknown[] = [];
    const findTrip: string[] = [];
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([
            makeGeofence({ id: '10', radiusM: 300, alertOn: 'both', ...over.geofence }),
          ]),
        findLastEventForPair: () => Promise.resolve(undefined),
        createGeofenceEvent: (_g, _v, eventType, tripId) => {
          created.push({ tripId });
          return Promise.resolve(
            over.created === 'raced' ? undefined : event(eventType, tripId ?? null)
          );
        },
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve('5') },
      tripsLookup: {
        findInProgressTripForVehicle: (companyId, vehicleId) => {
          findTrip.push(`${companyId}/${vehicleId}`);
          return Promise.resolve(over.trip);
        },
        checkDestinationProximity: (t, lat, lng) => {
          proximity.push({ t, lat, lng });
          return Promise.resolve();
        },
        recordGeofenceStopTransition: input => {
          transitions.push(input);
          return Promise.resolve();
        },
      },
    });
    return { service, created, transitions, proximity, findTrip };
  }

  it('with a trip in progress: the event is stamped with trip_id, the destination is checked, and a yard-linked geofence drives the stop bridge', async () => {
    const h = harness({ trip, geofence: { yardId: '20' } });

    await h.service.checkPosition('1', 'device-1', 31.5, 74.3);

    expect(h.findTrip).toEqual(['1/5']);
    expect(h.created).toEqual([{ tripId: '77' }]);
    expect(h.proximity).toEqual([{ t: trip, lat: 31.5, lng: 74.3 }]);
    expect(h.transitions).toEqual([
      {
        tripId: '77',
        yardId: '20',
        eventType: 'enter',
        occurredAt: new Date('2026-09-24T09:00:00.000Z'),
      },
    ]);
  });

  it('a geofence NOT linked to a yard is stamped with the trip but never touches the stops', async () => {
    const h = harness({ trip, geofence: { yardId: null } });
    await h.service.checkPosition('1', 'device-1', 31.5, 74.3);
    expect(h.created).toEqual([{ tripId: '77' }]);
    expect(h.transitions).toHaveLength(0);
  });

  it('with no trip in progress: trip_id is null and the bridge is inert', async () => {
    const h = harness({ trip: undefined, geofence: { yardId: '20' } });
    await h.service.checkPosition('1', 'device-1', 31.5, 74.3);
    expect(h.created).toEqual([{ tripId: null }]);
    expect(h.proximity).toHaveLength(0);
    expect(h.transitions).toHaveLength(0);
  });

  it('when the repository reports a concurrent packet already made the transition (no event written), the bridge is skipped', async () => {
    const h = harness({ trip, geofence: { yardId: '20' }, created: 'raced' });
    await h.service.checkPosition('1', 'device-1', 31.5, 74.3);
    expect(h.transitions).toHaveLength(0);
  });

  it('a device with no vehicle never even looks up a trip', async () => {
    const found: string[] = [];
    const service = buildService({
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve(undefined) },
      tripsLookup: {
        findInProgressTripForVehicle: () => {
          found.push('called');
          return Promise.resolve(undefined);
        },
      },
    });
    await service.checkPosition('1', 'device-1', 31.5, 74.3);
    expect(found).toEqual([]);
  });
});

describe('FleetGeofencesService.checkPosition — fleet:position / geofence:event publications (D-0161)', () => {
  const tripCtx = {
    id: '77',
    destinationLatitude: null,
    destinationLongitude: null,
    destinationReachedAt: null,
  };
  const POSITION = { speed: 40, heading: 90, recordedAt: new Date('2026-09-24T09:00:00.000Z') };

  function run(
    over: {
      tripCtx?: typeof tripCtx | undefined;
      geofence?: Partial<Geofence>;
      vehicle?: boolean;
    } = {}
  ) {
    const realtime = new RecordingFleetRealtime();
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([
            makeGeofence({
              id: '10',
              name: 'Yard fence',
              yardId: '20',
              radiusM: 300,
              ...over.geofence,
            }),
          ]),
        findLastEventForPair: () => Promise.resolve(undefined),
        createGeofenceEvent: (_g, _v, eventType, tripId) =>
          Promise.resolve({
            id: '5',
            geofenceId: '10',
            vehicleId: '5',
            eventType,
            occurredAt: new Date('2026-09-24T09:00:00.000Z'),
            tripId: tripId ?? null,
            createdAt: null,
            updatedAt: null,
          }),
      },
      vehicleAssignmentLookup: {
        currentVehicleIdForDevice: () => Promise.resolve(over.vehicle === false ? undefined : '5'),
      },
      vehiclesLookup: { findVehicleById: () => Promise.resolve({ id: '5', name: 'Truck A' }) },
      tripsLookup: { findInProgressTripForVehicle: () => Promise.resolve(over.tripCtx) },
      realtime,
    });
    return { service, realtime };
  }

  it('publishes fleet:position for a tracker installed in a vehicle, with the trip id (or null)', async () => {
    const withTrip = run({ tripCtx });
    await withTrip.service.checkPosition('1', 'device-1', 31.5, 74.3, POSITION);
    expect(withTrip.realtime.positions).toEqual([
      {
        companyId: '1',
        payload: {
          vehicleId: '5',
          deviceId: 'device-1',
          latitude: 31.5,
          longitude: 74.3,
          speed: 40,
          heading: 90,
          recordedAt: '2026-09-24T09:00:00.000Z',
          tripId: '77',
        },
      },
    ]);

    const noTrip = run();
    await noTrip.service.checkPosition('1', 'device-1', 31.5, 74.3, POSITION);
    expect(noTrip.realtime.positions[0]?.payload.tripId).toBeNull();
  });

  it('publishes nothing for a device that is not installed in a vehicle, and no position when the caller passes none', async () => {
    const orphan = run({ vehicle: false });
    await orphan.service.checkPosition('1', 'device-1', 31.5, 74.3, POSITION);
    expect(orphan.realtime.positions).toEqual([]);
    expect(orphan.realtime.geofenceEvents).toEqual([]);

    const bare = run();
    await bare.service.checkPosition('1', 'device-1', 31.5, 74.3);
    expect(bare.realtime.positions).toEqual([]);
    expect(bare.realtime.geofenceEvents).toHaveLength(1); // the geofence event itself is independent of the position payload
  });

  it('publishes geofence:event with the geofence + vehicle names, yard id, event type and trip id — for every real transition regardless of alert_on', async () => {
    const { service, realtime } = run({ tripCtx, geofence: { alertOn: 'exit' } });

    await service.checkPosition('1', 'device-1', 31.5, 74.3, POSITION);

    expect(realtime.geofenceEvents).toEqual([
      {
        companyId: '1',
        payload: {
          id: '5',
          geofenceId: '10',
          geofenceName: 'Yard fence',
          yardId: '20',
          vehicleId: '5',
          vehicleName: 'Truck A',
          eventType: 'enter',
          occurredAt: '2026-09-24T09:00:00.000Z',
          tripId: '77',
        },
      },
    ]);
  });

  it('a transition lost to a concurrent packet publishes no geofence:event', async () => {
    const realtime = new RecordingFleetRealtime();
    const service = buildService({
      repo: {
        listActiveGeofencesForCompanyUnscoped: () =>
          Promise.resolve([makeGeofence({ id: '10', radiusM: 300 })]),
        findLastEventForPair: () => Promise.resolve(undefined),
        createGeofenceEvent: () => Promise.resolve(undefined),
      },
      vehicleAssignmentLookup: { currentVehicleIdForDevice: () => Promise.resolve('5') },
      realtime,
    });
    await service.checkPosition('1', 'device-1', 31.5, 74.3, POSITION);
    expect(realtime.geofenceEvents).toEqual([]);
  });
});

describe('FleetGeofencesService.updateGeofence — centre edit for MANUAL geofences only (D-0162)', () => {
  it('a manual geofence accepts a new centre (passed to the repository)', async () => {
    let received: unknown;
    const service = buildService({
      repo: {
        findGeofenceById: () => Promise.resolve(makeGeofence({ id: '1', yardId: null })),
        updateGeofence: (_id, input) => {
          received = input;
          return Promise.resolve(
            makeGeofence({ id: '1', centerLatitude: 10, centerLongitude: 20 })
          );
        },
      },
    });

    const result = await service.updateGeofence('1', {
      name: undefined,
      radiusM: undefined,
      alertOn: undefined,
      isActive: undefined,
      centerLatitude: 10,
      centerLongitude: 20,
    });

    expect(received).toMatchObject({ centerLatitude: 10, centerLongitude: 20 });
    expect(result.data).toMatchObject({ center_latitude: 10, center_longitude: 20 });
  });

  it('a yard-linked geofence answers 422 with the fixed message (its centre follows the yard) — but radius/name/alert_on/is_active stay editable', async () => {
    const service = buildService({
      repo: {
        findGeofenceById: () => Promise.resolve(makeGeofence({ id: '1', yardId: '7' })),
        updateGeofence: () => Promise.resolve(makeGeofence({ id: '1', yardId: '7', radiusM: 500 })),
      },
    });
    await expect(
      service.updateGeofence('1', {
        name: undefined,
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
        centerLatitude: 10,
        centerLongitude: 20,
      })
    ).rejects.toThrow("This geofence is linked to a yard. Change the yard's location to move it.");

    const resized = await service.updateGeofence('1', {
      name: undefined,
      radiusM: 500,
      alertOn: undefined,
      isActive: undefined,
    });
    expect(resized.data).toMatchObject({ radius_m: 500 });
  });

  it('404 for an unknown geofence when a centre is sent', async () => {
    const service = buildService({ repo: { findGeofenceById: () => Promise.resolve(undefined) } });
    await expect(
      service.updateGeofence('9', {
        name: undefined,
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
        centerLatitude: 1,
        centerLongitude: 2,
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe('FleetGeofencesService publishes fleet:changed (D-0163)', () => {
  it("create / update / delete announce the geofence to the caller's company room; not-found publishes nothing", async () => {
    const realtime = new RecordingFleetRealtime();
    const service = buildService({
      repo: {
        createGeofence: () => Promise.resolve(makeGeofence({ id: '12' })),
        updateGeofence: () => Promise.resolve(makeGeofence({ id: '12' })),
        deleteGeofence: (id: string) => Promise.resolve(id === '12'),
        findYardBrief: () => Promise.resolve(undefined),
      },
      realtime,
    });

    await runWithContextAsync(ctx(), async () => {
      await service.createGeofence({
        name: 'G',
        yardId: null,
        centerLatitude: 1,
        centerLongitude: 2,
        radiusM: 100,
        alertOn: 'both',
      });
      await service.updateGeofence('12', {
        name: 'G2',
        radiusM: undefined,
        alertOn: undefined,
        isActive: undefined,
      });
      await service.deleteGeofence('12');
    });
    await expect(runWithContextAsync(ctx(), () => service.deleteGeofence('99'))).rejects.toThrow(
      NotFoundError
    );

    expect(
      realtime.fleetChanges.map(c => `${c.payload.entity}:${c.payload.id}:${c.payload.action}`)
    ).toEqual(['geofence:12:created', 'geofence:12:updated', 'geofence:12:deleted']);
    expect(realtime.fleetChanges.every(c => c.companyId === '1')).toBe(true);
  });
});

describe('FleetGeofencesService list paging (D-0164, B1)', () => {
  it('geofences and events are wrapped in { items, pagination } only when a window is requested', async () => {
    const service = buildService({
      repo: {
        listGeofencesForCompany: () =>
          Promise.resolve({ items: [makeGeofence({ id: '1', yardId: null })], total: 61 }),
        listRecentEventsForCompany: () => Promise.resolve({ items: [], total: 0 }),
      },
    });

    const paged = await service.listGeofences({ window: { page: 1, perPage: 30 } });
    expect(paged.data).toMatchObject({
      pagination: { page: 1, per_page: 30, total: 61, total_pages: 3 },
    });
    expect(Array.isArray((await service.listGeofences({})).data)).toBe(true);

    const events = await runWithContextAsync(ctx(), () =>
      service.listEvents({ limit: 50, window: { page: 1, perPage: 20 } })
    );
    expect(events.data).toMatchObject({ items: [], pagination: { total: 0, total_pages: 1 } });
  });
});

describe('FleetGeofencesService.geofenceOptions (D-0165, B2)', () => {
  it('asks for active geofences by name, capped at limit, and returns lean rows + meta', async () => {
    let seen: unknown;
    const service = buildService({
      repo: {
        listGeofencesForCompany: query => {
          seen = query;
          return Promise.resolve({ items: [makeGeofence({ id: '7', yardId: '2' })], total: 1 });
        },
      },
    });

    const result = await service.geofenceOptions({ linked: true, limit: 1000 });

    expect(seen).toMatchObject({
      isActive: true,
      linked: true,
      sortBy: 'name',
      window: { page: 1, perPage: 1000 },
    });
    expect(result.meta).toEqual({ total: 1, limit: 1000, truncated: false });
    expect(result.data).toEqual([expect.objectContaining({ id: '7', yard_id: '2' })]);
  });
});

describe('FleetGeofencesService.bulkGeofences (D-0166, B10; D-0171 changed + label)', () => {
  it('enable/disable go through updateGeofence(isActive) unless already in that state, delete through deleteGeofence; missing ids are reported, not thrown; labels come with every result', async () => {
    const updates: unknown[] = [];
    const service = buildService({
      repo: {
        findGeofenceById: id =>
          Promise.resolve(
            id === '9'
              ? undefined
              : makeGeofence({ id, name: `Fence ${id}`, isActive: id === '5' || id === '2' })
          ),
        updateGeofence: (id, input) => {
          updates.push([id, input.isActive]);
          return Promise.resolve(id === '9' ? undefined : makeGeofence({ id }));
        },
        deleteGeofence: id => Promise.resolve(id !== '9'),
      },
    });

    const enabled = await service.bulkGeofences('enable', { ids: ['1', '5', '9'] });
    expect(updates).toEqual([
      ['1', true],
      ['9', true],
    ]); // "5" is enabled already — no write
    expect(enabled.data.results).toEqual([
      {
        id: '1',
        ok: true,
        changed: true,
        label: 'Fence 1',
        message: 'Geofence updated successfully.',
      },
      {
        id: '5',
        ok: true,
        changed: false,
        label: 'Fence 5',
        message: 'Geofence is already enabled.',
      },
      { id: '9', ok: false, changed: false, label: null, message: 'Geofence not found.' },
    ]);
    expect(enabled.data.summary).toMatchObject({ succeeded: 2, changed: 1, failed: 1 });

    await service.bulkGeofences('disable', { ids: ['2'] });
    expect(updates[2]).toEqual(['2', false]);

    const deleted = await service.bulkGeofences('delete', { ids: ['3', '9'] });
    expect(deleted.data.summary).toMatchObject({ succeeded: 1, changed: 1, failed: 1 });
  });
});

describe('FleetGeofencesService.exportGeofences / exportEvents (D-0168, B11)', () => {
  it('geofences: one yard lookup per distinct yard, yard name column', async () => {
    const findYardBrief = vi.fn(() =>
      Promise.resolve({ id: '9', name: 'Main Yard', address: null, latitude: 1, longitude: 2 })
    );
    const service = buildService({
      repo: {
        listGeofencesForCompany: () =>
          Promise.resolve({
            items: [
              makeGeofence({ id: '1', yardId: '9' }),
              makeGeofence({ id: '2', yardId: '9' }),
              makeGeofence({ id: '3', yardId: null }),
            ],
            total: 3,
          }),
        findYardBrief,
      },
    });
    const plan = await service.exportGeofences({});
    const [batch] = await collect(plan.batches());
    const rows = (batch as never[]).map(r =>
      Object.fromEntries(plan.columns.map(c => [c.header, c.value(r)]))
    );
    expect(findYardBrief).toHaveBeenCalledTimes(1);
    expect(rows.map(r => r['yard'])).toEqual(['Main Yard', 'Main Yard', null]);
  });

  it("events: the list's filters + a full-size window, vehicle names cached", async () => {
    let seen: unknown;
    const findVehicleById = vi.fn(() => Promise.resolve({ id: '5', name: 'Truck 5' }));
    const service = buildService({
      repo: {
        listRecentEventsForCompany: (_companyId, query) => {
          seen = query;
          return Promise.resolve({
            items: [
              {
                id: '1',
                geofenceId: '1',
                vehicleId: '5',
                eventType: 'enter',
                occurredAt: new Date('2026-01-01T00:00:00Z'),
                tripId: null,
                createdAt: null,
                updatedAt: null,
                geofenceAlertOn: 'both',
                geofenceName: 'Gate',
                geofenceYardId: null,
              },
              {
                id: '2',
                geofenceId: '1',
                vehicleId: '5',
                eventType: 'exit',
                occurredAt: new Date('2026-01-01T01:00:00Z'),
                tripId: '7',
                createdAt: null,
                updatedAt: null,
                geofenceAlertOn: 'both',
                geofenceName: 'Gate',
                geofenceYardId: null,
              },
            ],
            total: 2,
          });
        },
      },
      vehiclesLookup: { findVehicleById },
    });

    const plan = await runWithContextAsync(ctx({ companyId: '42' }), () =>
      service.exportEvents({ eventType: 'exit', sortOrder: 'asc' })
    );
    const [batch] = await collect(plan.batches());

    expect(seen).toMatchObject({
      eventType: 'exit',
      sortOrder: 'asc',
      window: { page: 1, perPage: 500 },
    });
    expect(findVehicleById).toHaveBeenCalledTimes(1);
    const rows = (batch as never[]).map(r =>
      Object.fromEntries(plan.columns.map(c => [c.header, c.value(r)]))
    );
    expect(rows[1]).toMatchObject({
      event_type: 'exit',
      vehicle: 'Truck 5',
      trip_id: '7',
      geofence: 'Gate',
    });
  });
});

async function collect<T>(batches: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = [];
  for await (const batch of batches) out.push(batch);
  return out;
}

describe('FleetGeofencesService.geofenceOptions include_inactive (D-0171)', () => {
  it('is active-only by default, unfiltered with include_inactive, and each option carries is_active', async () => {
    const seen: (boolean | undefined)[] = [];
    const service = buildService({
      repo: {
        listGeofencesForCompany: query => {
          seen.push(query.isActive);
          return Promise.resolve({ items: [makeGeofence({ id: '7', isActive: false })], total: 1 });
        },
      },
    });
    await service.geofenceOptions({ limit: 1000 });
    const all = await service.geofenceOptions({ includeInactive: true, limit: 1000 });
    expect(seen).toEqual([true, undefined]);
    expect(all.data).toEqual([expect.objectContaining({ id: '7', is_active: false })]);
  });
});

describe('FleetGeofencesService — optimistic concurrency (D-0176, B13)', () => {
  it('a stale geofence edit answers 409 and writes nothing; a matching one goes through', async () => {
    const update = vi.fn(() => Promise.resolve(makeGeofence()));
    const service = buildService({
      repo: {
        findGeofenceById: () =>
          Promise.resolve(makeGeofence({ updatedAt: new Date('2026-09-25T10:07:00Z') })),
        updateGeofence: update,
      },
    });
    await expect(
      runWithContextAsync(ctx(), () =>
        service.updateGeofence(
          '1',
          { name: undefined, radiusM: 120, alertOn: undefined, isActive: undefined },
          new Date('2026-09-25T10:00:00Z')
        )
      )
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(update).not.toHaveBeenCalled();
    await runWithContextAsync(ctx(), () =>
      service.updateGeofence(
        '1',
        { name: undefined, radiusM: 120, alertOn: undefined, isActive: undefined },
        new Date('2026-09-25T10:07:00Z')
      )
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
