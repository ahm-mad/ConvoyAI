import type { FleetTripsRepository } from '../fleet-trips.repository.js';
import type {
  TripsAssignmentMetricsLookup,
  TripsDevicesLookup,
  TripsDriversLookup,
  TripsGeofencesLookup,
  TripsUsersLookup,
  TripsVehiclesLookup,
} from '../fleet-trips.types.js';

/**
 * Minimal per-test fake for `FleetTripsRepository` (CONVENTIONS.md "Tests":
 * unit tests use fakes, no DB) — same Proxy-based "only what this test
 * actually calls" pattern as module 4.1's `fleet-vehicles-drivers/
 * __tests__/fakes.ts`.
 */
export function fakeFleetTripsRepository(
  overrides: Partial<FleetTripsRepository>
): FleetTripsRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetTripsRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetTripsRepository;
}

export function fakeVehiclesLookup(
  overrides: Partial<TripsVehiclesLookup> = {}
): TripsVehiclesLookup {
  return {
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
    currentAssignmentForVehicle:
      overrides.currentAssignmentForVehicle ?? (() => Promise.resolve(undefined)),
    currentDeviceAssignmentForVehicle:
      overrides.currentDeviceAssignmentForVehicle ?? (() => Promise.resolve(undefined)),
    setOdometerKm: overrides.setOdometerKm ?? (() => Promise.resolve()),
  };
}

export function fakeDriversLookup(overrides: Partial<TripsDriversLookup> = {}): TripsDriversLookup {
  return {
    findDriverById: overrides.findDriverById ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeAssignmentMetricsLookup(
  overrides: Partial<TripsAssignmentMetricsLookup> = {}
): TripsAssignmentMetricsLookup {
  return {
    incrementAssignmentMetrics:
      overrides.incrementAssignmentMetrics ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeDevicesLookup(overrides: Partial<TripsDevicesLookup> = {}): TripsDevicesLookup {
  return {
    findByIdUnscoped: overrides.findByIdUnscoped ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeUsersLookup(overrides: Partial<TripsUsersLookup> = {}): TripsUsersLookup {
  return {
    findContactById: overrides.findContactById ?? (() => Promise.resolve(undefined)),
    // D-0172 (B6): by default the batched lookup answers from `findContactById`, so a test that names a user gets the name in every "who" field.
    findContactsByIds:
      overrides.findContactsByIds ??
      (async (ids: string[]) => {
        const found = new Map<string, { id: string; firstName: string; lastName: string }>();
        for (const id of ids) {
          const user = await (overrides.findContactById?.(id) ?? Promise.resolve(undefined));
          if (user) found.set(id, user);
        }
        return found;
      }),
  };
}

/** Default: the vehicle isn't inside any stop's geofence at trip start (D-0156). */
export function fakeGeofencesLookup(
  overrides: Partial<TripsGeofencesLookup> = {}
): TripsGeofencesLookup {
  return {
    yardIdsVehicleIsInside: overrides.yardIdsVehicleIsInside ?? (() => Promise.resolve([])),
  };
}
