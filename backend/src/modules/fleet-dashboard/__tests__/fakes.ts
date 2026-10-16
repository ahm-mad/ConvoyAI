import {
  DEFAULT_FLEET_SETTINGS,
  type FleetSettings,
  type FleetSettingsLookup,
} from '../../fleet-settings/fleet-settings.types.js';
import type { FleetDashboardRepository } from '../fleet-dashboard.repository.js';
import type { FleetDashboardVehiclesLookup } from '../fleet-dashboard.types.js';

/**
 * Minimal per-test fake for `FleetDashboardRepository` (CONVENTIONS.md
 * "Tests": unit tests use fakes, no DB) — same Proxy-based "only what this
 * test actually calls" pattern as every other fleet module's own fakes.
 */
export function fakeFleetDashboardRepository(
  overrides: Partial<FleetDashboardRepository>
): FleetDashboardRepository {
  const notStubbed = (prop: string | symbol) => () => {
    throw new Error(
      `fakeFleetDashboardRepository: "${String(prop)}" was called but not stubbed for this test`
    );
  };
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      const value: unknown = prop in target ? Reflect.get(target, prop, receiver) : undefined;
      return value ?? notStubbed(prop);
    },
  }) as unknown as FleetDashboardRepository;
}

export function fakeVehiclesLookup(
  overrides: Partial<FleetDashboardVehiclesLookup> = {}
): FleetDashboardVehiclesLookup {
  return {
    currentVehicleIdForDevice:
      overrides.currentVehicleIdForDevice ?? (() => Promise.resolve(undefined)),
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
  };
}

/** Default settings (UTC, 15 min freshness, 24 h/day, no grace) — override per test. */
export function fakeSettingsLookup(overrides: Partial<FleetSettings> = {}): FleetSettingsLookup {
  return { effectiveSettings: () => Promise.resolve({ ...DEFAULT_FLEET_SETTINGS, ...overrides }) };
}

/** A repository stub with every method needed for a full `overview()` call, all returning "nothing happening" defaults — tests override just the fields they care about. */
export function fakeOverviewRepository(
  overrides: Partial<FleetDashboardRepository> = {}
): FleetDashboardRepository {
  return fakeFleetDashboardRepository({
    vehiclesForCompany: () => Promise.resolve([]),
    vehicleCount: () => Promise.resolve(0),
    inServiceVehicleCount: () => Promise.resolve(0),
    availabilityCounts: () => Promise.resolve({ active: 0, inMaintenance: 0 }),
    activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map()),
    latestPositionsForDevices: () => Promise.resolve(new Map()),
    activeTripVehicleIds: () => Promise.resolve(new Set()),
    activeTripsCount: () => Promise.resolve(0),
    tripStatusCountsInRange: () =>
      Promise.resolve({ total: 0, completed: 0, cancelled: 0, planned: 0 }),
    tripDistanceAggInRange: () => Promise.resolve({ plannedKm: 0, actualKm: 0 }),
    onTimeCompletedCountInRange: () => Promise.resolve(0),
    onTimeStatsInRange: () => Promise.resolve({ onTime: 0, sample: 0 }),
    tripDistanceVarianceInRange: () => Promise.resolve({ plannedKm: 0, actualKm: 0, sample: 0 }),
    avgCompletedDurationMinutesInRange: () => Promise.resolve(null),
    completedTripsAggInRange: () => Promise.resolve({ totalMinutes: 0, totalKm: 0 }),
    fuelAggInRange: () => Promise.resolve({ liters: 0, cost: 0 }),
    fuelFillsInRange: () => Promise.resolve([]),
    fuelByVehicleInRange: () => Promise.resolve(new Map()),
    completedTripDistancesInRange: () => Promise.resolve([]),
    maintenanceCostInRange: () => Promise.resolve(0),
    openAlarmDevices: () => Promise.resolve([]),
    alarmSeverityCounts: () => Promise.resolve({ critical: 0, warning: 0, info: 0, total: 0 }),
    countExpiringCompliance: () => Promise.resolve(0),
    countExpiringDriverLicences: () => Promise.resolve(0),
    ...overrides,
  });
}
