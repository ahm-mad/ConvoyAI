import {
  DEFAULT_FLEET_SETTINGS,
  type FleetSettings,
  type FleetSettingsLookup,
} from '../../fleet-settings/fleet-settings.types.js';
import type {
  FleetPositionsDevicesLookup,
  FleetPositionsVehicleAssignmentLookup,
} from '../fleet-positions.types.js';

export function fakeDevicesLookup(
  overrides: Partial<FleetPositionsDevicesLookup> = {}
): FleetPositionsDevicesLookup {
  return {
    deviceIdsForCompany: overrides.deviceIdsForCompany ?? (() => Promise.resolve([])),
    findBriefByIds: overrides.findBriefByIds ?? (() => Promise.resolve([])),
    latestPositionsForDeviceIds:
      overrides.latestPositionsForDeviceIds ?? (() => Promise.resolve([])),
    deviceInCompany: overrides.deviceInCompany ?? (() => Promise.resolve(false)),
    positionHistory: overrides.positionHistory ?? (() => Promise.resolve([])),
  };
}

export function fakeAssignmentsLookup(
  overrides: Partial<FleetPositionsVehicleAssignmentLookup> = {}
): FleetPositionsVehicleAssignmentLookup {
  return {
    currentAssignmentsForDeviceIds:
      overrides.currentAssignmentsForDeviceIds ?? (() => Promise.resolve([])),
    findVehicleById: overrides.findVehicleById ?? (() => Promise.resolve(undefined)),
  };
}

/** Default company settings (15 min freshness) — override per test. */
export function fakeSettingsLookup(overrides: Partial<FleetSettings> = {}): FleetSettingsLookup {
  return { effectiveSettings: () => Promise.resolve({ ...DEFAULT_FLEET_SETTINGS, ...overrides }) };
}
