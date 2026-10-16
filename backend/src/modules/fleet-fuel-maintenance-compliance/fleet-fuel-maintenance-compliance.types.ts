/**
 * Module 4.5 (`FuelAnalyticsService.php`'s companion write-side controllers —
 * `VehicleController::storeMaintenanceSchedule/storeMaintenanceLog/storeFuelLog`,
 * `DriverController` (incidents — already closed by module 4.1, D-0077, not
 * this module's job despite the stale task-18 stub/HANDOFF still listing it;
 * see this module's DECISIONS.md entry), `ComplianceDocumentController.php`).
 *
 * `vehicle_maintenance_schedules`/`vehicle_maintenance_logs`/`fuel_logs` are
 * already registered `parent:vehicles` in `tenant-rules.ts` (module 4.1, for
 * that module's own read-only `show()` needs) — this module owns their
 * write side, no re-registration needed. `compliance_documents` is newly
 * registered here as `company`-ruled (a real own `company_id` column).
 *
 * `FuelLog` gains the 6 `extend_fuel_logs` columns (11.3, the fuel-logs
 * half) — Laravel's `storeFuelLog` validation never accepted them at all
 * (KNOWN_ISSUES 11.3 confirmed live), so there is no old-app request shape
 * to match for these fields; the new app accepts them from day one
 * (D-0077-style deliberate deviation from `openapi.yaml`'s documented old
 * behavior).
 */
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

export interface CreateMaintenanceScheduleInput {
  serviceType: string;
  intervalDays: number | null;
  intervalKm: number | null;
  lastServiceDate: Date | null;
  odometerBaselineKm: number | null;
  odometerBaselineDate: Date | null;
  lastServiceOdometerKm: number | null;
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

export interface CreateMaintenanceLogInput {
  maintenanceScheduleId: string | null;
  serviceType: string;
  serviceDate: Date;
  odometerKm: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
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
  /** 11.3 (extend_fuel_logs) */
  stationName: string | null;
  /** 11.3 (extend_fuel_logs) */
  unitPrice: number | null;
  /** 11.3 (extend_fuel_logs) */
  totalCost: number | null;
  /** 11.3 (extend_fuel_logs) */
  paymentMethod: string | null;
  /** 11.3 (extend_fuel_logs) */
  receiptReference: string | null;
  /** 11.3 (extend_fuel_logs) — tightened past a bare FK: must belong to the same vehicle this fuel log is against (Design notes; Laravel's real validation never even accepted this field, so there is no existing bug shape to match). */
  tripId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who last changed the record (`null` = never edited by a user, or an automatic change); the creator is `loggedBy`. */
  updatedBy: string | null;
}

export interface CreateFuelLogInput {
  fillDate: Date;
  volume: number;
  unit: 'liters' | 'gallons';
  cost: number | null;
  odometerKm: number | null;
  isFullTank: boolean;
  vendor: string | null;
  stationName: string | null;
  unitPrice: number | null;
  totalCost: number | null;
  paymentMethod: string | null;
  receiptReference: string | null;
  tripId: string | null;
}

/** `ComplianceDocumentController::ALLOWED_TYPES` — deliberately whitelisted, matching Laravel exactly. */
export type ComplianceDocumentableType = 'driver' | 'vehicle';

/** D-0164 (B1) — the compliance-document list's filters (on top of the owner it is scoped to); `window` undefined = the flat, unpaged list. */
export interface ComplianceDocumentListQuery {
  search?: string | undefined;
  documentType?: string | undefined;
  expiringWithinDays?: number | undefined;
  expired?: boolean | undefined;
  sortBy?: 'expiry_date' | 'created_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/**
 * `documentable_type` stores the short type string (`"driver"`/`"vehicle"`)
 * directly, not Laravel's full model FQCN (`App\Domain\Devices\Models\
 * Driver`) — a deliberate storage-format deviation (Design notes, logged in
 * DECISIONS.md): nothing outside this module ever reads the raw column
 * value (`FleetDashboardService::countExpiringCompliance` only filters by
 * `company_id`/`expiry_date`), so there is no parity reason to carry PHP
 * class names into a fresh Postgres table.
 */
export interface ComplianceDocument {
  id: string;
  companyId: string;
  documentableType: ComplianceDocumentableType;
  documentableId: string;
  documentType: string;
  documentNumber: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  filePath: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateComplianceDocumentInput {
  documentableType: ComplianceDocumentableType;
  documentableId: string;
  documentType: string;
  documentNumber: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  notes: string | null;
}

/** `fleetVehiclesDriversRepository` doubles as this module's vehicle-ownership check (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same cross-module pattern as every other fleet module. */
export interface FuelMaintenanceVehiclesLookup {
  findVehicleById(id: string): Promise<{ id: string; name: string } | undefined>;
}

/** `fleetVehiclesDriversRepository` also doubles as this module's driver-ownership check (`compliance-documents`'s `documentable_type=driver` path). */
export interface FuelMaintenanceDriversLookup {
  findDriverById(
    id: string
  ): Promise<{ id: string; firstName: string; lastName: string } | undefined>;
}

/** `fleetTripsRepository` doubles as this module's trip-ownership check for `fuel_logs.trip_id` — tightened past Laravel (which never validated this field at all) to require the trip belong to the same vehicle. */
export interface FuelMaintenanceTripsLookup {
  findTripById(id: string): Promise<{ id: string; vehicleId: string } | undefined>;
}

/** D-0169 (B3) — `PUT` bodies: only the fields that were sent (`undefined` = untouched, `null` clears a nullable field). */
export type UpdateMaintenanceScheduleInput = {
  [K in keyof CreateMaintenanceScheduleInput]?: CreateMaintenanceScheduleInput[K] | undefined;
};
export type UpdateMaintenanceLogInput = {
  [K in keyof CreateMaintenanceLogInput]?: CreateMaintenanceLogInput[K] | undefined;
};
export type UpdateFuelLogInput = {
  [K in keyof CreateFuelLogInput]?: CreateFuelLogInput[K] | undefined;
};
export type UpdateComplianceDocumentInput = {
  documentType?: string | undefined;
  documentNumber?: string | null | undefined;
  issueDate?: Date | null | undefined;
  expiryDate?: Date | null | undefined;
  notes?: string | null | undefined;
};
