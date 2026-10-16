/**
 * Module 4.6 (`FleetDashboardController`/`FleetDashboardService.php`, 711 lines, full read —
 * `fleet-kpi-formulas.md` is the formula-by-formula spec). Five read-only KPI endpoints:
 * `overview`/`trends`/`vehicle-performance`/`alerts`/`financial`. This service is unusually
 * well-aligned with its own design doc (`Yes.txt`) — most formulas port close to as-is; the one
 * real bug (KNOWN_ISSUES 11.1, the `/alerts` endpoint) needs an actual fix, not just a port.
 *
 * Two of the task stub's own "open questions" were already resolved by earlier modules before this
 * one started, not blocking here:
 * - **Where does alarm/rule severity come from?** Module 2.5 already added `rules.severity`/
 *   `alarms.severity` (enum `rule_severity`, D-0060) — `alarms.severity` is a real, always-populated
 *   column now, so this module reads it directly instead of eager-loading a nonexistent
 *   `rule.severity` (11.1's Bug B).
 * - **Canonical 30-min offline threshold** — module 2.7 already built the shared
 *   `shared/utils/offline.ts` (`isOffline`/`OFFLINE_THRESHOLD_MINUTES`), user-approved 2026-09-15.
 *   This module imports it rather than building a new "reference implementation" the stub assumed
 *   would happen here.
 */

export interface FleetStatusCounts {
  total: number;
  moving: number;
  idle: number;
  parked: number;
  offline: number;
  /** No tracker installed (D-0183, A4). The response also carries it as the deprecated alias `unknown`. */
  noTracker: number;
  activeTrips: number;
}

/** D-0184 (B3 / A8): the scope filters the fleet analytics share — which vehicles a summary or table covers. Absent field = no restriction. */
export interface VehicleScope {
  /** Case-insensitive exact match. */
  vehicleCategory?: string | undefined;
  costCentre?: string | undefined;
  vehicleIds?: string[] | undefined;
  /** Vehicles whose CURRENT driver is one of these. */
  driverIds?: string[] | undefined;
  /** Vehicles currently checked in at a slot of this yard. */
  yardId?: string | undefined;
}

/** D-0189 (B5): the trip columns the trips report reads (dates as stored; distances / minutes as numbers). */
export interface TripReportRow {
  id: string;
  reference: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  vehicleId: string;
  driverId: string;
  customerId: string | null;
  originAddress: string | null;
  destinationAddress: string | null;
  plannedStartAt: Date | null;
  actualStartAt: Date | null;
  plannedEndAt: Date | null;
  actualEndAt: Date | null;
  plannedDistanceKm: number | null;
  actualDistanceKm: number | null;
  durationMinutes: number | null;
  cancellationReason: string | null;
}

/** D-0189 (B5): which trips a report covers besides the period — `undefined` = no restriction. */
export interface TripReportFilter {
  vehicleIds?: string[] | undefined;
  /** The trip's OWN driver (not the vehicle's current one). */
  driverIds?: string[] | undefined;
  customerIds?: string[] | undefined;
}

/** D-0190 (B6): one fuel fill with what the fuel report needs (litres already converted from gallons; the vehicle's own tank capacity for the capacity flag). */
export interface FuelReportRow {
  id: string;
  vehicleId: string;
  fillDate: Date;
  volume: number;
  unit: string;
  liters: number;
  cost: number | null;
  totalCost: number | null;
  unitPrice: number | null;
  paymentMethod: string | null;
  vendor: string | null;
  stationName: string | null;
  receiptReference: string | null;
  tripId: string | null;
  odometerKm: number | null;
  isFullTank: boolean;
  createdAt: Date | null;
  vehicle: {
    name: string;
    plate: string | null;
    category: string | null;
    tankCapacityLiters: number | null;
  };
}

/** D-0191 (B7): one maintenance log with its vehicle, for the maintenance report. */
export interface MaintenanceReportRow {
  id: string;
  vehicleId: string;
  serviceType: string;
  serviceDate: Date;
  cost: number | null;
  vehicle: { name: string; plate: string | null; category: string | null };
}

/** D-0191 (B7): a compliance document of the company, for the compliance report. */
export interface ComplianceRecordRow {
  id: string;
  documentableType: string;
  documentableId: string;
  documentType: string;
  documentNumber: string | null;
  expiryDate: Date | null;
}

/** D-0191 (B7): a driver licence (drivers that are not deactivated). */
export interface DriverLicenceRow {
  driverId: string;
  name: string;
  licenseNumber: string | null;
  expiryDate: Date | null;
}

/** D-0193 (B8): one incident with the columns the drivers scorecard and the incidents summary read (`incidentDate` is a DATE — a UTC-midnight `Date` carrying the calendar date). */
export interface IncidentReportRow {
  id: string;
  driverId: string;
  vehicleId: string | null;
  incidentType: string;
  severity: 'minor' | 'moderate' | 'severe';
  incidentDate: Date;
}

/** D-0193 (B8): which incidents a report covers besides the period — `undefined` = no restriction. `vehicleIds` keeps only incidents that HAVE a vehicle in the list. */
export interface IncidentReportFilter {
  driverIds?: string[] | undefined;
  vehicleIds?: string[] | undefined;
}

/** D-0193 (B8): a driver of the company with the columns the scorecard shows. */
export interface DriverReportRow {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'suspended';
  licenseNumber: string | null;
  licenseExpiryDate: Date | null;
}

export type AlarmSeverity = 'critical' | 'warning' | 'info';
export type AlarmState = 'active' | 'acknowledged' | 'cleared';

/** `activeAlerts()`'s per-row shape — enriched with the rule's name and the alarm's device's currently-assigned vehicle (if any). */
export interface ActiveAlarmRow {
  id: string;
  ruleName: string | null;
  severity: AlarmSeverity;
  state: AlarmState;
  deviceId: string;
  triggeredAt: Date;
  createdAt: Date | null;
}

export type VehiclePerformanceSortField =
  | 'utilisation_rate'
  | 'distance_km'
  | 'driving_hours'
  | 'idle_hours'
  | 'fuel_used_liters'
  | 'vehicle_name'
  | 'plate'
  | 'vehicle_category'
  | 'trip_count'
  | 'fuel_efficiency'
  | 'fuel_cost'
  | 'maintenance_cost'
  | 'cost_per_km'
  | 'incident_count';

/** `fleetVehiclesDriversRepository` doubles as this module's device→vehicle resolution for enriching an alarm's device with its currently-assigned vehicle's brief (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same cross-module pattern as every other fleet module. `currentVehicleIdForDevice` already exists (built for module 4.3's `GeofencesVehicleAssignmentLookup`). */
export interface FleetDashboardVehiclesLookup {
  currentVehicleIdForDevice(deviceId: string): Promise<string | undefined>;
  findVehicleById(id: string): Promise<{ id: string; name: string } | undefined>;
}
