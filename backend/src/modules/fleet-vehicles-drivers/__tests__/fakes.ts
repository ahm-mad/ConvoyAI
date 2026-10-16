import type { FleetVehiclesDriversRepository } from '../fleet-vehicles-drivers.repository.js';
import type {
  FleetDevicesLookup,
  FleetUsersLookup,
  FleetYardHistoryLookup,
  VehiclesTripsLookup,
} from '../fleet-vehicles-drivers.types.js';

/**
 * Minimal per-test fake for `FleetVehiclesDriversRepository` (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as module 3.1's `assets/__tests__/fakes.ts`:
 * a method a test didn't stub throws loudly instead of silently returning
 * `undefined`, so a wrong assumption about what the service calls fails the
 * test rather than passing on accident.
 */
export function fakeFleetRepository(
  overrides: Partial<FleetVehiclesDriversRepository>
): FleetVehiclesDriversRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  // D-0174: the incident name briefs are a pure enrichment — by default nobody is found, so tests that do not care about names need no stub.
  const withDefaults: Partial<FleetVehiclesDriversRepository> = {
    driverBriefsByIds: () => Promise.resolve(new Map()),
    vehicleBriefsByIds: () => Promise.resolve(new Map()),
    ...overrides,
  };
  return new Proxy(withDefaults, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetVehiclesDriversRepository;
}

export function fakeDevicesLookup(overrides: Partial<FleetDevicesLookup> = {}): FleetDevicesLookup {
  return {
    findAuthorized: overrides.findAuthorized ?? (() => Promise.resolve(undefined)),
    findByIdUnscoped: overrides.findByIdUnscoped ?? (() => Promise.resolve(undefined)),
    listAssignableTrackers: overrides.listAssignableTrackers ?? (() => Promise.resolve([])),
  };
}

export function fakeUsersLookup(overrides: Partial<FleetUsersLookup> = {}): FleetUsersLookup {
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

export function fakeYardHistoryLookup(
  overrides: Partial<FleetYardHistoryLookup> = {}
): FleetYardHistoryLookup {
  return {
    vehicleHasOpenStay: overrides.vehicleHasOpenStay ?? (() => Promise.resolve(false)),
    recentEventsForVehicle: overrides.recentEventsForVehicle ?? (() => Promise.resolve([])),
    pagedEventsForVehicle:
      overrides.pagedEventsForVehicle ?? (() => Promise.resolve({ items: [], total: 0 })),
  };
}

/** Default: no trip in progress (D-0162's deactivate-vehicle guard passes). */
export function fakeTripsLookup(overrides: Partial<VehiclesTripsLookup> = {}): VehiclesTripsLookup {
  return {
    vehicleHasActiveTrip: overrides.vehicleHasActiveTrip ?? (() => Promise.resolve(false)),
    vehicleHasPlannedTrip: overrides.vehicleHasPlannedTrip ?? (() => Promise.resolve(false)),
  };
}
