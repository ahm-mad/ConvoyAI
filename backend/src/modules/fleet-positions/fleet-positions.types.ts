/**
 * Domain types for module 4.8 (fleet-positions) — `FleetController::positions()`.
 * Own no table (`devices`/`device_positions` belong to module 2.3;
 * `vehicle_device_assignments`/`vehicles` belong to module 4.1); this module
 * is purely a read-side aggregation over both, via the lookup interfaces
 * below (ARCHITECTURE.md §2 "Modules do not import each other's
 * repositories" — same interface-doubling pattern as `FleetDevicesLookup`/
 * `GeofencesVehicleAssignmentLookup`).
 */

export interface FleetPositionsDeviceBrief {
  id: string;
  name: string;
  deviceUniqueIdentifier: string;
  productId: string;
}

export interface FleetPositionsDevicePosition {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: Date;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `devicesRepository` doubles as this (module 2.3), interface-typed per ARCHITECTURE.md §2. */
export interface FleetPositionsDevicesLookup {
  deviceIdsForCompany(companyId: string): Promise<string[]>;
  findBriefByIds(ids: string[]): Promise<FleetPositionsDeviceBrief[]>;
  latestPositionsForDeviceIds(deviceIds: string[]): Promise<FleetPositionsDevicePosition[]>;
  /** `FleetController::history` (KNOWN_ISSUES 11.72 / frontend B5). */
  deviceInCompany(companyId: string, id: string): Promise<boolean>;
  positionHistory(deviceId: string, limit: number): Promise<FleetPositionsDevicePosition[]>;
}

export interface FleetPositionsVehicleAssignment {
  id: string;
  vehicleId: string;
  deviceId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface FleetPositionsVehicleBrief {
  id: string;
  name: string;
  vehicleCategory: string | null;
}

/** `fleetVehiclesDriversRepository` doubles as this (module 4.1), interface-typed per ARCHITECTURE.md §2. */
export interface FleetPositionsVehicleAssignmentLookup {
  currentAssignmentsForDeviceIds(deviceIds: string[]): Promise<FleetPositionsVehicleAssignment[]>;
  findVehicleById(id: string): Promise<FleetPositionsVehicleBrief | undefined>;
}
