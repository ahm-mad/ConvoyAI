import type { ActorDirectory } from '../../platform/http/actors.js';
/**
 * Module 4.1 (KNOWN_ISSUES 11.3's vehicles/drivers half). Domain types for
 * `vehicles`/`drivers` (both `company`-ruled, tenant-rules.ts) and their
 * two append-only assignment-history tables `vehicle_device_assignments`/
 * `driver_vehicle_assignments` (`parent`-ruled — no own tenant column,
 * scoped in the repository via an already-verified parent `vehicle`/
 * `driver` row, same discipline as module 3.1's `asset_components`).
 *
 * `extend_vehicles`/`extend_drivers` columns (11.3) are modeled as plain
 * fields on `Vehicle`/`Driver` below, not a separate type — the old app's
 * migration bolted them onto the same tables, they were just never wired
 * into `$fillable`/validation. Confirmed exact column lists against the
 * real migrations (`2026_08_24_200001_extend_vehicles_table.php`,
 * `2026_08_24_200002_extend_drivers_table.php`), not just
 * `schema-tables.md`'s summary.
 */
export interface Vehicle {
  id: string;
  companyId: string;
  name: string;
  vehicleCategory: string | null;
  make: string | null;
  model: string | null;
  /** 11.3 (extend_vehicles) */
  plate: string | null;
  /** 11.3 (extend_vehicles) */
  vin: string | null;
  /** 11.3 (extend_vehicles) */
  year: number | null;
  /** 11.3 (extend_vehicles) — free text, matches Laravel (no enum column) */
  fuelType: string | null;
  /** 11.3 (extend_vehicles) */
  tankCapacityLiters: number | null;
  /** 11.3 (extend_vehicles) */
  odometerKm: number | null;
  /** 11.3 (extend_vehicles) — free text, matches Laravel (no enum column) */
  ownershipType: string | null;
  /** 11.3 (extend_vehicles) */
  costCentre: string | null;
  lifecycleStatus: string;
  acquisitionDate: Date | null;
  acquisitionCost: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  /** 11.3 (extend_vehicles) */
  grossWeightKg: number | null;
  /** 11.3 (extend_vehicles) */
  payloadKg: number | null;
  /** Holds the real R2 public URL directly (D-0044's established pattern), not a local relative path — `image_url` is served as the same value (Design notes, mirrors `users.profileImage`). */
  imagePath: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateVehicleInput {
  name: string;
  vehicleCategory: string | null;
  make: string | null;
  model: string | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  acquisitionDate: Date | null;
  acquisitionCost: number | null;
  plate: string | null;
  vin: string | null;
  year: number | null;
  fuelType: string | null;
  tankCapacityLiters: number | null;
  odometerKm: number | null;
  ownershipType: string | null;
  costCentre: string | null;
  grossWeightKg: number | null;
  payloadKg: number | null;
}

export interface Driver {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  licenseNumber: string | null;
  licenseClass: string | null;
  licenseExpiryDate: Date | null;
  status: string;
  /** 11.3 (extend_drivers) */
  employmentStatus: string | null;
  /** 11.3 (extend_drivers) */
  availabilityStatus: string | null;
  /** 11.3 (extend_drivers) — `[{name, issued_date, expiry_date}]` (Laravel's own migration comment); not further typed/validated beyond "a JSON value", matching the old app's own lack of structure enforcement */
  certifications: unknown;
  /** 11.3 (extend_drivers) */
  payrollReference: string | null;
  hireDate: Date | null;
  photoPath: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

/** D-0162 (`PUT /vehicles/{id}` / `PUT /drivers/{id}`): the fields that were sent — `undefined` = leave alone, `null` = clear (where the create schema allows null). */
/** D-0164 (B1) — what the vehicle list can be narrowed/ordered by. `window` undefined = the flat, unpaged list. */
export interface VehicleListQuery {
  includeInactive: boolean;
  status?: 'active' | 'in_maintenance' | 'retired' | 'sold' | undefined;
  search?: string | undefined;
  vehicleCategory?: string | undefined;
  fuelType?: string | undefined;
  ownershipType?: string | undefined;
  hasTracker?: boolean | undefined;
  hasDriver?: boolean | undefined;
  sortBy?:
    'name' | 'plate' | 'created_at' | 'odometer_km' | 'lifecycle_status' | 'year' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** D-0164 (B1) — the driver list's filters; `window` undefined = the flat, unpaged list. */
export interface DriverListQuery {
  includeInactive: boolean;
  status?: 'active' | 'inactive' | 'suspended' | undefined;
  search?: string | undefined;
  availabilityStatus?: string | undefined;
  employmentStatus?: string | undefined;
  assigned?: boolean | undefined;
  licenseExpiringWithinDays?: number | undefined;
  /** D-0167 (R3) */
  licenseState?: 'expired' | 'expiring' | 'valid' | 'none' | undefined;
  sortBy?: 'name' | 'license_expiry_date' | 'hire_date' | 'created_at' | 'status' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** D-0165 (B2) — what the vehicle/driver option lists can be narrowed by. */
export interface VehicleOptionsQuery {
  /** D-0171 */
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  hasDriver?: boolean | undefined;
  hasTracker?: boolean | undefined;
  limit: number;
}

export interface DriverOptionsQuery {
  /** D-0171 */
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  assigned?: boolean | undefined;
  availabilityStatus?: string | undefined;
  limit: number;
}

export interface VehicleOption {
  vehicle: Vehicle;
  hasDriver: boolean;
  hasTracker: boolean;
  /** Currently checked in to a yard slot (an open `yard_slot_events` row). */
  checkedIn: boolean;
}

export interface DriverOption {
  driver: Driver;
  assigned: boolean;
}

/** D-0169 (B3) — `PUT /incidents/{id}`: only the fields that were sent (`vehicleId: null` clears the vehicle). */
export type UpdateIncidentInput = {
  [K in keyof CreateIncidentInput]?: CreateIncidentInput[K] | undefined;
};

/** D-0170 (B9) — filters of the paged detail sub-lists; the window is always set (these endpoints are always paged). */
export interface SubListWindow {
  page: number;
  perPage: number;
}
export interface MaintenanceLogListQuery {
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  maintenanceScheduleId?: string | undefined;
  search?: string | undefined;
  sortBy?: 'service_date' | 'created_at' | 'cost' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window: SubListWindow;
}
export interface FuelLogListQuery {
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  tripId?: string | undefined;
  search?: string | undefined;
  sortBy?: 'fill_date' | 'volume' | 'cost' | 'created_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window: SubListWindow;
}
export interface YardHistoryListQuery {
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  yardId?: string | undefined;
  open?: boolean | undefined;
  search?: string | undefined;
  sortBy?: 'checked_in_at' | 'checked_out_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window: SubListWindow;
}
export interface IncidentListQuery {
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  severity?: 'minor' | 'moderate' | 'severe' | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  search?: string | undefined;
  sortBy?: 'incident_date' | 'severity' | 'created_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window: SubListWindow;
}

export type UpdateVehicleInput = {
  [K in keyof CreateVehicleInput]?: CreateVehicleInput[K] | undefined;
};

export interface CreateDriverInput {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  licenseNumber: string | null;
  licenseClass: string | null;
  licenseExpiryDate: Date | null;
  hireDate: Date | null;
  employmentStatus: string | null;
  availabilityStatus: string | null;
  certifications: unknown;
  payrollReference: string | null;
}

export interface VehicleDeviceAssignment {
  id: string;
  vehicleId: string;
  deviceId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DriverVehicleAssignment {
  id: string;
  driverId: string;
  vehicleId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  assignedBy: string | null;
  unassignedBy: string | null;
  notes: string | null;
  tripCount: number;
  distanceKm: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Matches `applyHistoryFilters`/`scopeInPeriod`/`scopeActive`/`scopeHistorical` (`DriverVehicleAssignment.php`) exactly. */
export interface AssignmentHistoryFilters {
  dateFrom: string | undefined;
  dateTo: string | undefined;
  includeActive: boolean;
  status: 'active' | 'historical' | undefined;
}

export interface DriverIncident {
  id: string;
  driverId: string;
  vehicleId: string | null;
  incidentType: string;
  severity: 'minor' | 'moderate' | 'severe';
  incidentDate: Date;
  description: string | null;
  loggedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who last changed the record (`null` = never edited by a user, or an automatic change); the creator is `loggedBy`. */
  updatedBy: string | null;
}

export interface CreateIncidentInput {
  vehicleId: string | null;
  incidentType: string;
  severity: 'minor' | 'moderate' | 'severe';
  incidentDate: Date;
  description: string | null;
}

export interface DevicePositionPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  recordedAt: Date;
}

/** Matches `reference/openapi.yaml`'s `DevicePosition` schema exactly — `show()`'s `current_position` field. */
export interface VehicleCurrentPosition {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: Date;
}

export interface MaintenanceSchedule {
  id: string;
  vehicleId: string;
  serviceType: string;
  intervalDays: number | null;
  intervalKm: number | null;
  lastServiceDate: Date | null;
  odometerBaselineKm: number | null;
  odometerBaselineDate: Date | null;
  lastServiceOdometerKm: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  maintenanceScheduleId: string | null;
  serviceType: string;
  serviceDate: Date;
  odometerKm: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  loggedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who last changed the record (`null` = never edited by a user, or an automatic change); the creator is `loggedBy`. */
  updatedBy: string | null;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  fillDate: Date;
  volume: number;
  unit: 'liters' | 'gallons';
  cost: number | null;
  odometerKm: number | null;
  isFullTank: boolean;
  vendor: string | null;
  loggedBy: string | null;
  /** 11.3 (extend_fuel_logs) — module 4.5's write side; read here purely so `show()`'s embedded `fuel_logs` list stays a real full-column reflection once 4.5 starts populating these (Laravel's raw Eloquent serialization always included them). */
  stationName: string | null;
  unitPrice: number | null;
  totalCost: number | null;
  paymentMethod: string | null;
  receiptReference: string | null;
  tripId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who last changed the record (`null` = never edited by a user, or an automatic change); the creator is `loggedBy`. */
  updatedBy: string | null;
}

/** `devicesRepository` doubles as this module's device-ownership check for `assignDevice` (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same pattern as module 3.1's `AssetsDevicesLookup`. Tightens Laravel's own `'device_id' => 'exists:devices,id'` (a bare global-existence check, no company/ownership scoping at all — the same bug class as 11.37/11.48, newly found while building this module, not previously in KNOWN_ISSUES) to the real `authorizedDeviceQuery()` OR-boundary. `findByIdUnscoped` is the unscoped read-side counterpart for display (`device:id,name,device_unique_identifier` in `show()`/index eager loads) — used only after the *vehicle*'s ownership (not the device's) has already verified the caller may see this assignment, same discipline as module 3.1's `AssetsDevicesLookup.findByIdUnscoped`. */
export interface FleetDevicesLookup {
  findAuthorized(
    id: string,
    userId: string,
    companyId: string
  ): Promise<{ id: string } | undefined>;
  findByIdUnscoped(
    id: string
  ): Promise<{ id: string; name: string; deviceUniqueIdentifier: string } | undefined>;
  /** `GET /vehicles/assignable-trackers` (frontend dropdown, D9) — devices the caller may assign that aren't installed in any vehicle. */
  listAssignableTrackers(
    userId: string,
    companyId: string,
    options: { search: string | undefined; onlyWithPosition: boolean }
  ): Promise<
    {
      id: string;
      name: string;
      deviceUniqueIdentifier: string;
      status: string;
      hasPosition: boolean;
      product: { id: string; name: string };
    }[]
  >;
}

/** `usersRepository` doubles as this module's `assignedBy`/`unassignedBy`/`logged_by` display-name lookup (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same pattern as module 2.5's `RulesUsersLookup`. */
export interface FleetUsersLookup extends ActorDirectory {
  findContactById(
    userId: string
  ): Promise<{ id: string; firstName: string; lastName: string } | undefined>;
}

/** `fleetYardsRepository` doubles as this module's `yard_history` source (`show()`, KNOWN_ISSUES 11.82) — interface-typed, same cross-module lookup pattern as `FleetDevicesLookup`. The vehicle's own company ownership is verified by `show()` before this is called. */
export type YardHistoryEntry = {
  event: {
    id: string;
    yardSlotId: string;
    vehicleId: string;
    checkedInAt: Date;
    checkedOutAt: Date | null;
    source: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  slot: {
    id: string;
    yardId: string;
    slotNumber: string;
    yard: { id: string; name: string } | null;
  } | null;
};

export interface FleetYardHistoryLookup {
  /** D-0182 (L4): the vehicle is checked in at a yard slot right now (an open stay) — deactivating it is refused. */
  vehicleHasOpenStay(vehicleId: string): Promise<boolean>;
  /** D-0170 (B9): the vehicle's yard events, filtered/sorted/paged — `total` counts the matches before paging. */
  pagedEventsForVehicle(
    vehicleId: string,
    query: YardHistoryListQuery
  ): Promise<{ items: YardHistoryEntry[]; total: number }>;
  recentEventsForVehicle(
    vehicleId: string,
    limit: number
  ): Promise<
    {
      event: {
        id: string;
        yardSlotId: string;
        vehicleId: string;
        checkedInAt: Date;
        checkedOutAt: Date | null;
        source: string;
        createdAt: Date | null;
        updatedAt: Date | null;
      };
      slot: {
        id: string;
        yardId: string;
        slotNumber: string;
        yard: { id: string; name: string } | null;
      } | null;
    }[]
  >;
}

export type UpdateDriverInput = {
  [K in keyof CreateDriverInput]?: CreateDriverInput[K] | undefined;
};

/** D-0162: `fleetTripsRepository` doubles as the deactivate-vehicle guard's "trip in progress?" lookup (interface-typed, same cross-module pattern as the others; trips depend on the vehicles *repository*, so there is no cycle). */
export interface VehiclesTripsLookup {
  vehicleHasActiveTrip(vehicleId: string, excludeTripId: string | undefined): Promise<boolean>;
  /** D-0182 (L4): the vehicle has at least one `planned` trip — deactivating it is refused. */
  vehicleHasPlannedTrip(vehicleId: string): Promise<boolean>;
}

/** D-0174: the names behind a page of incidents (`driver` / `vehicle` on the incident responses). */
export interface IncidentBriefs {
  drivers: Map<string, { id: string; firstName: string; lastName: string }>;
  vehicles: Map<string, { id: string; name: string; plate: string | null }>;
}
