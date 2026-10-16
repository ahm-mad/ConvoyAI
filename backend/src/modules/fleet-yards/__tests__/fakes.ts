import type { FleetYardsRepository } from '../fleet-yards.repository.js';
import type { YardsGeofencesLookup } from '../../fleet-geofences/fleet-geofences.types.js';
import type { YardsVehiclesLookup } from '../fleet-yards.types.js';

/**
 * Minimal per-test fake for `FleetYardsRepository` (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as every other fleet module's own fakes.
 */
export function fakeFleetYardsRepository(
  overrides: Partial<FleetYardsRepository>
): FleetYardsRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetYardsRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetYardsRepository;
}

export function fakeVehiclesLookup(
  overrides: Partial<YardsVehiclesLookup> = {}
): YardsVehiclesLookup {
  return {
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
  };
}

/** Records what the service asks the geofences side to do (D-0162). Default: no yard has a linked geofence yet. */
export function fakeYardsGeofencesLookup(
  overrides: Partial<YardsGeofencesLookup> = {}
): YardsGeofencesLookup & {
  created: { yardId: string; name: string; latitude: number; longitude: number; radiusM: number }[];
  updated: { id: string; latitude?: number; longitude?: number; radiusM?: number }[];
} {
  const created: {
    yardId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusM: number;
  }[] = [];
  const updated: { id: string; latitude?: number; longitude?: number; radiusM?: number }[] = [];
  return {
    linkedGeofencesForYards:
      overrides.linkedGeofencesForYards ?? (() => Promise.resolve(new Map())),
    setYardGeofencesActive: overrides.setYardGeofencesActive ?? (() => Promise.resolve([])),
    createYardGeofence:
      overrides.createYardGeofence ??
      (input => {
        created.push(input);
        return Promise.resolve({ id: '900', radiusM: input.radiusM });
      }),
    updateYardGeofence:
      overrides.updateYardGeofence ??
      ((id, input) => {
        updated.push({ id, ...input });
        return Promise.resolve();
      }),
    created,
    updated,
  };
}
