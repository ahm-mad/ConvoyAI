import type { FleetGeofencesRepository } from '../fleet-geofences.repository.js';
import type {
  GeofencesTripsLookup,
  GeofencesVehicleAssignmentLookup,
  GeofencesVehiclesLookup,
} from '../fleet-geofences.types.js';

/**
 * Minimal per-test fake for `FleetGeofencesRepository` (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as module 4.2's `fleet-trips/__tests__/
 * fakes.ts`.
 */
export function fakeFleetGeofencesRepository(
  overrides: Partial<FleetGeofencesRepository>
): FleetGeofencesRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetGeofencesRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetGeofencesRepository;
}

export function fakeVehicleAssignmentLookup(
  overrides: Partial<GeofencesVehicleAssignmentLookup> = {}
): GeofencesVehicleAssignmentLookup {
  return {
    currentVehicleIdForDevice:
      overrides.currentVehicleIdForDevice ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeVehiclesLookup(
  overrides: Partial<GeofencesVehiclesLookup> = {}
): GeofencesVehiclesLookup {
  return {
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
  };
}

/** Default: the vehicle has no trip in progress, so the sensor→trip bridge is inert (D-0156). */
export function fakeTripsLookup(
  overrides: Partial<GeofencesTripsLookup> = {}
): GeofencesTripsLookup {
  return {
    findInProgressTripForVehicle:
      overrides.findInProgressTripForVehicle ?? (() => Promise.resolve(undefined)),
    checkDestinationProximity: overrides.checkDestinationProximity ?? (() => Promise.resolve()),
    recordGeofenceStopTransition:
      overrides.recordGeofenceStopTransition ?? (() => Promise.resolve()),
  };
}
