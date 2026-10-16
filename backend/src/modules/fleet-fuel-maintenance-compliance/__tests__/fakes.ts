import type { FleetFuelMaintenanceComplianceRepository } from '../fleet-fuel-maintenance-compliance.repository.js';
import type {
  FuelMaintenanceDriversLookup,
  FuelMaintenanceTripsLookup,
  FuelMaintenanceVehiclesLookup,
} from '../fleet-fuel-maintenance-compliance.types.js';

/**
 * Minimal per-test fake for `FleetFuelMaintenanceComplianceRepository`
 * (CONVENTIONS.md "Tests": unit tests use fakes, no DB) — same Proxy-based
 * "only what this test actually calls" pattern as every other fleet
 * module's own fakes.
 */
export function fakeFleetFuelMaintenanceComplianceRepository(
  overrides: Partial<FleetFuelMaintenanceComplianceRepository>
): FleetFuelMaintenanceComplianceRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetFuelMaintenanceComplianceRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetFuelMaintenanceComplianceRepository;
}

export function fakeVehiclesLookup(
  overrides: Partial<FuelMaintenanceVehiclesLookup> = {}
): FuelMaintenanceVehiclesLookup {
  return {
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeDriversLookup(
  overrides: Partial<FuelMaintenanceDriversLookup> = {}
): FuelMaintenanceDriversLookup {
  return {
    findDriverById: overrides.findDriverById ?? (() => Promise.resolve(undefined)),
  };
}

export function fakeTripsLookup(
  overrides: Partial<FuelMaintenanceTripsLookup> = {}
): FuelMaintenanceTripsLookup {
  return {
    findTripById: overrides.findTripById ?? (() => Promise.resolve(undefined)),
  };
}
