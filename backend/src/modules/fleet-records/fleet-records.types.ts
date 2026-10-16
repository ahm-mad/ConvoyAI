/**
 * Module 4.11 (fleet-records, D-0188, flow 07 asks C2 / C3 / C4): company-wide lists of maintenance logs and fuel logs, and the
 * compliance-document counts. Read-only views over rows the fleet-fuel-maintenance-compliance module (4.5) owns — this module owns
 * no table and changes nothing. `vehicle_maintenance_logs` / `fuel_logs` are `parent:vehicles`, so every query joins
 * `vehicles.company_id` by hand; `compliance_documents` is `company`-ruled (scoped by the tenant extension).
 */
export const MAINTENANCE_LOG_SORT_FIELDS = [
  'service_date',
  'cost',
  'service_type',
  'vendor',
  'odometer_km',
  'vehicle_name',
  'created_at',
] as const;
export type MaintenanceLogSortField = (typeof MAINTENANCE_LOG_SORT_FIELDS)[number];

export const FUEL_LOG_SORT_FIELDS = [
  'fill_date',
  'volume',
  'total_cost',
  'unit_price',
  'vendor',
  'odometer_km',
  'vehicle_name',
  'created_at',
] as const;
export type FuelLogSortField = (typeof FUEL_LOG_SORT_FIELDS)[number];

/** The vehicle a log belongs to — enough for a table row (retired / sold vehicles keep their history, `lifecycleStatus` says so). */
export interface LogVehicleBrief {
  id: string;
  name: string;
  plate: string | null;
  category: string | null;
  lifecycleStatus: string;
}

export interface MaintenanceLogItem {
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
  updatedBy: string | null;
  vehicle: LogVehicleBrief;
}

export interface FuelLogItem {
  id: string;
  vehicleId: string;
  fillDate: Date;
  volume: number;
  unit: string;
  cost: number | null;
  odometerKm: number | null;
  isFullTank: boolean;
  vendor: string | null;
  loggedBy: string | null;
  stationName: string | null;
  unitPrice: number | null;
  totalCost: number | null;
  paymentMethod: string | null;
  receiptReference: string | null;
  tripId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  vehicle: LogVehicleBrief;
}

export interface MaintenanceLogFilter {
  /** Inclusive calendar dates on `service_date`. */
  from?: Date | undefined;
  to?: Date | undefined;
  vehicleIds?: string[] | undefined;
  vehicleCategory?: string | undefined;
  serviceType?: string | undefined;
  vendor?: string | undefined;
  minCost?: number | undefined;
  maxCost?: number | undefined;
  search?: string | undefined;
}

export interface FuelLogFilter {
  /** Inclusive calendar dates on `fill_date`. */
  from?: Date | undefined;
  to?: Date | undefined;
  vehicleIds?: string[] | undefined;
  vehicleCategory?: string | undefined;
  vendor?: string | undefined;
  paymentMethod?: string | undefined;
  tripId?: string | undefined;
  isFullTank?: boolean | undefined;
  search?: string | undefined;
}

export interface MaintenanceLogListQuery extends MaintenanceLogFilter {
  sortBy?: MaintenanceLogSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

export interface FuelLogListQuery extends FuelLogFilter {
  sortBy?: FuelLogSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** Raw aggregates of one filtered set of maintenance logs. */
export interface MaintenanceSummaryRaw {
  count: number;
  /** Sum of `cost` over the logs that have one. */
  totalCost: number;
  /** How many logs have a cost. */
  withCost: number;
}

/** Raw aggregates of one filtered set of fuel logs (litres already converted from gallons). */
export interface FuelSummaryRaw {
  count: number;
  liters: number;
  /** Cost of the logs that have one: `total_cost`, else `cost` (the dashboard's convention). */
  totalCost: number;
  /** Litres of exactly the logs counted in `totalCost` (the price per litre is judged over the same set). */
  pricedLiters: number;
  withCost: number;
}

/** What the compliance counts read of every document. */
export interface ComplianceCountRow {
  documentableType: string;
  documentType: string;
  expiryDate: Date | null;
}

export interface ComplianceCountFilter {
  documentableType?: 'vehicle' | 'driver' | undefined;
  documentType?: string | undefined;
}

export {
  EXPIRY_STATUSES as COMPLIANCE_STATUSES,
  type ExpiryStatus as ComplianceStatus,
} from '../../shared/utils/expiry-buckets.js';
