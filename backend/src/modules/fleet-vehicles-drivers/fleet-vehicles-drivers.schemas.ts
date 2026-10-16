import { ExpectedUpdatedAtSchema } from '../../platform/http/concurrency.js';
import { z } from 'zod';
import {
  FlagSchema,
  listQueryShape,
  optionsQueryShape,
  sortByEnum,
} from '../../platform/http/list-query.js';
import { BodyFlagSchema, bulkBodySchema } from '../../platform/http/bulk.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import {
  AVAILABILITY_STATUSES,
  EMPLOYMENT_STATUSES,
  FUEL_TYPES,
  LICENSE_STATES,
  OWNERSHIP_TYPES,
} from './fleet-vehicles-drivers.constants.js';

/**
 * Zod schemas for module 4.1 (`vehicles`/`drivers`/assignment-history).
 * Request shapes match `VehicleController`/`DriverController`'s validation
 * exactly, plus the 11.3 fix (`extend_vehicles`/`extend_drivers` columns
 * accepted here — `openapi.yaml`'s own summary notes flag them as
 * currently rejected in the old app; this is the deliberate fix, not a
 * contract violation).
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const VehicleIdParamSchema = z.object({ id: z.string() });
export const VehicleIdPathParamSchema = z.object({ vehicleId: z.string() });
export const DriverIdParamSchema = z.object({ id: z.string() });
export const DriverIdPathParamSchema = z.object({ driverId: z.string() });

// -- GET /vehicles, POST /vehicles ------------------------------------------

export const VEHICLE_SORT_FIELDS = [
  'name',
  'plate',
  'created_at',
  'odometer_km',
  'lifecycle_status',
  'year',
] as const;

export const ListVehiclesQuerySchema = z.object({
  /** D-0162: deactivated (`retired`/`sold`) vehicles are left out of the default list unless `1`/`true`. */
  include_inactive: z.enum(['0', '1', 'true', 'false']).optional(),
  /** D-0164 (B1): `lifecycle_status` filter — an explicit `status` wins over `include_inactive`. */
  status: z
    .enum(['active', 'in_maintenance', 'retired', 'sold'], {
      error: 'The selected status is invalid.',
    })
    .optional(),
  vehicle_category: z.string().max(255).optional(),
  fuel_type: z.string().max(255).optional(),
  ownership_type: z.string().max(255).optional(),
  /** A tracker is currently installed / no tracker installed. */
  has_tracker: FlagSchema,
  /** An active driver is currently assigned / no active driver. */
  has_driver: FlagSchema,
  sort_by: sortByEnum(VEHICLE_SORT_FIELDS),
  ...listQueryShape,
});

/** D-0179 (B7): `GET /vehicles/counts` — the list's filters and search, never `status` / `include_inactive` / paging / sort (every status is always counted). */
export const VehicleCountsQuerySchema = ListVehiclesQuerySchema.omit({
  include_inactive: true,
  status: true,
  sort_by: true,
  sort_order: true,
  page: true,
  per_page: true,
});

/** D-0165 (B2): `GET /vehicles/options` — the vehicle picker's lean, unpaginated list (active vehicles only). */
export const VehicleOptionsQuerySchema = z.object({
  /** D-0171: also offer retired/sold vehicles (for history-filter dropdowns); default off. */
  include_inactive: FlagSchema,
  has_driver: FlagSchema,
  has_tracker: FlagSchema,
  ...optionsQueryShape,
});

/** D-0165 (B2): `GET /drivers/options` — the driver picker's lean, unpaginated list (`active` drivers only). */
export const DriverOptionsQuerySchema = z.object({
  /** D-0171: also offer deactivated and suspended drivers (for history-filter dropdowns); default off (active only). */
  include_inactive: FlagSchema,
  /** On a vehicle now (`1`) / free (`0`). */
  assigned: FlagSchema,
  availability_status: z.string().max(255).optional(),
  ...optionsQueryShape,
});

/**
 * D-0166 (B10): `POST /vehicles/bulk-deactivate|bulk-reactivate` — `{ ids }` or `{ filter }` (the list's own filters, no paging/sort), at most
 * 500 records. In filter mode `include_inactive` defaults to `false` for deactivate and `true` for reactivate (an explicit `status` always wins).
 */
export const BulkVehiclesBodySchema = bulkBodySchema(
  z.object({
    search: z.string().max(255).optional(),
    status: z
      .enum(['active', 'in_maintenance', 'retired', 'sold'], {
        error: 'The selected status is invalid.',
      })
      .optional(),
    vehicle_category: z.string().max(255).optional(),
    fuel_type: z.string().max(255).optional(),
    ownership_type: z.string().max(255).optional(),
    has_tracker: BodyFlagSchema,
    has_driver: BodyFlagSchema,
    include_inactive: BodyFlagSchema,
  })
);

/** D-0166 (B10): `POST /drivers/bulk-deactivate|bulk-reactivate` — same contract as the vehicle bulk endpoints. */
export const BulkDriversBodySchema = bulkBodySchema(
  z.object({
    search: z.string().max(255).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    availability_status: z.string().max(255).optional(),
    employment_status: z.string().max(255).optional(),
    assigned: BodyFlagSchema,
    license_expiring_within_days: z.coerce.number().int().min(0).max(3650).optional(),
    license_state: z
      .enum(LICENSE_STATES, { error: 'The selected license state is invalid.' })
      .optional(),
    include_inactive: BodyFlagSchema,
  })
);

export const CreateVehicleRequestSchema = z.object({
  name: z.string().min(1).max(255),
  vehicle_category: z.string().max(100).nullable().optional(),
  make: z.string().max(255).nullable().optional(),
  model: z.string().max(255).nullable().optional(),
  length_m: z.coerce.number().min(0).nullable().optional(),
  width_m: z.coerce.number().min(0).nullable().optional(),
  height_m: z.coerce.number().min(0).nullable().optional(),
  acquisition_date: z.coerce.date().nullable().optional(),
  acquisition_cost: z.coerce.number().min(0).nullable().optional(),
  // -- 11.3 (extend_vehicles) --
  plate: z.string().max(255).nullable().optional(),
  vin: z.string().max(255).nullable().optional(),
  year: z.coerce.number().int().nullable().optional(),
  fuel_type: z
    .enum(FUEL_TYPES, { error: 'The selected fuel type is invalid.' })
    .nullable()
    .optional(),
  tank_capacity_liters: z.coerce.number().min(0).nullable().optional(),
  odometer_km: z.coerce.number().min(0).nullable().optional(),
  ownership_type: z
    .enum(OWNERSHIP_TYPES, { error: 'The selected ownership type is invalid.' })
    .nullable()
    .optional(),
  cost_centre: z.string().max(255).nullable().optional(),
  gross_weight_kg: z.coerce.number().min(0).nullable().optional(),
  payload_kg: z.coerce.number().min(0).nullable().optional(),
});

// -- POST /vehicles/{id}/image -----------------------------------------------

export const VehicleImageParamSchema = z.object({ id: z.string() });

// -- POST /vehicles/{vehicleId}/assign-device --------------------------------

export const AssignDeviceRequestSchema = z.object({
  device_id: z.union([z.number(), z.string()]),
});

// -- GET /vehicles/assignable-trackers -----------------------------------------

export const AssignableTrackersQuerySchema = z.object({
  search: z.string().max(255).optional(),
  only_with_position: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform(value => value === '1' || value === 'true'),
});

// -- GET /drivers, POST /drivers ---------------------------------------------

export const DRIVER_SORT_FIELDS = [
  'name',
  'license_expiry_date',
  'hire_date',
  'created_at',
  'status',
] as const;

export const ListDriversQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  /** D-0162: deactivated (`inactive`) drivers are left out of the default list unless `1`/`true`. */
  include_inactive: z.enum(['0', '1', 'true', 'false']).optional(),
  /** D-0164 (B1) */
  availability_status: z.string().max(255).optional(),
  employment_status: z.string().max(255).optional(),
  /** Currently on a vehicle / not on a vehicle. */
  assigned: FlagSchema,
  /** Licence expiry between today and today + N days (already-expired licences are not included). */
  license_expiring_within_days: z.coerce.number().int().min(0).max(3650).optional(),
  /** D-0167 (R3): `expired|expiring|valid|none` — see `LICENSE_STATES`; combines (AND) with `license_expiring_within_days`. */
  license_state: z
    .enum(LICENSE_STATES, { error: 'The selected license state is invalid.' })
    .optional(),
  sort_by: sortByEnum(DRIVER_SORT_FIELDS),
  ...listQueryShape,
});

/** D-0179 (B7): `GET /drivers/counts` — the list's filters and search, never `status` / `include_inactive` / paging / sort. */
export const DriverCountsQuerySchema = ListDriversQuerySchema.omit({
  include_inactive: true,
  status: true,
  sort_by: true,
  sort_order: true,
  page: true,
  per_page: true,
});

/** A calendar date as `YYYY-MM-DD` (what the Laravel migration comment documented for certifications). */
const CertificationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'The date must use the YYYY-MM-DD format.')
  .refine(value => {
    // `Date.parse` rolls "2025-02-31" over to March, so compare the round-trip instead.
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'The date is not a valid calendar date.');

/** D-0157: one entry of `drivers.certifications` — `[{ name, issued_date, expiry_date }]`; unknown keys are rejected. */
const CertificationSchema = z
  .object({
    name: z.string().min(1).max(255),
    issued_date: CertificationDateSchema.nullable().optional(),
    expiry_date: CertificationDateSchema.nullable().optional(),
  })
  .strict();

export const CreateDriverRequestSchema = z.object({
  first_name: z.string().min(1).max(255),
  last_name: z.string().min(1).max(255),
  email: z.email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  license_number: z.string().max(100).nullable().optional(),
  license_class: z.string().max(50).nullable().optional(),
  license_expiry_date: z.coerce.date().nullable().optional(),
  hire_date: z.coerce.date().nullable().optional(),
  // -- 11.3 (extend_drivers) --
  employment_status: z
    .enum(EMPLOYMENT_STATUSES, { error: 'The selected employment status is invalid.' })
    .nullable()
    .optional(),
  availability_status: z
    .enum(AVAILABILITY_STATUSES, { error: 'The selected availability status is invalid.' })
    .nullable()
    .optional(),
  certifications: z.array(CertificationSchema).nullable().optional(),
  payroll_reference: z.string().max(255).nullable().optional(),
});

// -- PUT /vehicles/{id}, PUT /drivers/{id} (D-0162) --------------------------------
// Every field the create schema accepts (same enforced value lists, D-0157), all optional — send only what changed.

/** D-0176 (B13): `expected_updated_at` = the `updated_at` the client last saw; a mismatch answers 409 (opt-in). */
export const UpdateVehicleRequestSchema = CreateVehicleRequestSchema.partial().extend({
  expected_updated_at: ExpectedUpdatedAtSchema,
});
export const UpdateDriverRequestSchema = CreateDriverRequestSchema.partial().extend({
  expected_updated_at: ExpectedUpdatedAtSchema,
});

// -- POST /drivers/{driverId}/assign-vehicle ----------------------------------

export const AssignVehicleRequestSchema = z.object({
  vehicle_id: z.union([z.number(), z.string()]),
  notes: z.string().max(500).nullable().optional(),
});

// -- POST /drivers/{driverId}/unassign-vehicle --------------------------------

export const UnassignVehicleRequestSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
});

// -- POST /drivers/{driverId}/incidents ---------------------------------------

export const StoreIncidentRequestSchema = z.object({
  vehicle_id: z.union([z.number(), z.string()]).nullable().optional(),
  incident_type: z.string().min(1).max(255),
  severity: z.enum(['minor', 'moderate', 'severe']),
  incident_date: z.coerce.date(),
  description: z.string().nullable().optional(),
});

/** D-0169 (B3): `PUT /incidents/{id}` — same fields as the POST, all optional; the driver is not editable. */
export const UpdateIncidentRequestSchema = StoreIncidentRequestSchema.partial().extend({
  expected_updated_at: ExpectedUpdatedAtSchema,
});
export const IncidentIdParamSchema = z.object({ id: z.string() });

// -- Paged detail sub-lists (D-0170, B9): GET /vehicles/{id}/maintenance-logs | fuel-logs | yard-history | incidents, GET /drivers/{id}/incidents --
// Always paged (`data: { items, pagination }`; `page` default 1, `per_page` default 20, max 100), company-scoped through the vehicle / driver.

const DateBoundSchema = z.coerce.date({ error: 'The date is not a valid date.' }).optional();

export const MAINTENANCE_LOG_SORT_FIELDS = ['service_date', 'created_at', 'cost'] as const;
export const FUEL_LOG_SORT_FIELDS = ['fill_date', 'volume', 'cost', 'created_at'] as const;
export const YARD_HISTORY_SORT_FIELDS = ['checked_in_at', 'checked_out_at'] as const;
export const INCIDENT_SORT_FIELDS = ['incident_date', 'severity', 'created_at'] as const;

export const VehicleMaintenanceLogsQuerySchema = z.object({
  /** Inclusive range on `service_date`. */
  date_from: DateBoundSchema,
  date_to: DateBoundSchema,
  maintenance_schedule_id: z.coerce.number().int().optional(),
  sort_by: sortByEnum(MAINTENANCE_LOG_SORT_FIELDS),
  ...listQueryShape,
});

export const VehicleFuelLogsQuerySchema = z.object({
  /** Inclusive range on `fill_date`. */
  date_from: DateBoundSchema,
  date_to: DateBoundSchema,
  trip_id: z.coerce.number().int().optional(),
  sort_by: sortByEnum(FUEL_LOG_SORT_FIELDS),
  ...listQueryShape,
});

export const VehicleYardHistoryQuerySchema = z.object({
  /** Inclusive range on `checked_in_at`. */
  date_from: DateBoundSchema,
  date_to: DateBoundSchema,
  yard_id: z.coerce.number().int().optional(),
  /** `1` = only the stay the vehicle is in right now (no check-out), `0` = only finished stays. */
  open: FlagSchema,
  sort_by: sortByEnum(YARD_HISTORY_SORT_FIELDS),
  ...listQueryShape,
});

export const IncidentsQuerySchema = z.object({
  /** Inclusive range on `incident_date`. */
  date_from: DateBoundSchema,
  date_to: DateBoundSchema,
  severity: z
    .enum(['minor', 'moderate', 'severe'], { error: 'The selected severity is invalid.' })
    .optional(),
  /** On `GET /drivers/{id}/incidents`: only incidents involving this vehicle. */
  vehicle_id: z.coerce.number().int().optional(),
  /** On `GET /vehicles/{id}/incidents`: only incidents of this driver. */
  driver_id: z.coerce.number().int().optional(),
  sort_by: sortByEnum(INCIDENT_SORT_FIELDS),
  ...listQueryShape,
});

// -- GET /drivers/{id}/assignment-history, /vehicles/{id}/assignment-history --

export const AssignmentHistoryQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  include_active: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

// -- GET /assignment-history (company-wide) ------------------------------------

export const CompanyAssignmentHistoryQuerySchema = AssignmentHistoryQuerySchema.extend({
  driver_id: z.coerce.number().int().optional(),
  vehicle_id: z.coerce.number().int().optional(),
  status: z.enum(['active', 'historical']).optional(),
});

// -- GET /fleet/options (D-0157) ------------------------------------------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/fleet/options',
  tags: ['fleet-vehicles-drivers'],
  summary:
    "The canonical value lists for the fleet dropdowns: fuel_types, ownership_types (vehicles), employment_statuses, availability_statuses (drivers) — enforced on POST /vehicles and POST /drivers; D-0167: plus vehicle_categories, the distinct (case-insensitive) categories in use in the caller's company",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

for (const [method, path, summary] of [
  [
    'get',
    '/vehicles',
    "Own company's vehicles, current device/driver assignment; D-0162: retired/sold hidden unless ?include_inactive=1",
  ],
  ['post', '/vehicles', '11.3: extend_vehicles columns now accepted'],
  [
    'put',
    '/vehicles/{id}',
    'D-0162: any POST /vehicles field (same value lists), send only what changed; lifecycle_status is changed by deactivate/reactivate',
  ],
  [
    'post',
    '/vehicles/{id}/deactivate',
    'D-0162: lifecycle_status=retired; 422 while a trip is in progress or a driver/tracker is assigned (D-0182: also while checked in at a yard or with planned trips)',
  ],
  ['post', '/vehicles/{id}/reactivate', 'D-0162: lifecycle_status=active'],
  [
    'put',
    '/drivers/{id}',
    'D-0162: any POST /drivers field (same value lists + certification shape), send only what changed; status is changed by deactivate/reactivate',
  ],
  [
    'post',
    '/drivers/{id}/deactivate',
    'D-0162: status=inactive; 422 while the driver is assigned to a vehicle',
  ],
  ['post', '/drivers/{id}/reactivate', 'D-0162: status=active'],
  [
    'get',
    '/vehicles/assignable-trackers',
    'Devices the caller may assign that are not installed in any vehicle (id, name, DevEUI, status, has_position, product) — the tracker dropdown; `search`, `only_with_position`',
  ],
  [
    'post',
    '/vehicles/bulk-deactivate',
    'D-0166 (B10): deactivate many vehicles — body `{ ids }` or `{ filter }`, ≤ 500 records; per-record `{ id, ok, message }` results (same guards as POST /vehicles/{id}/deactivate), HTTP 200 even when some fail',
  ],
  [
    'post',
    '/vehicles/bulk-reactivate',
    'D-0166 (B10): reactivate many vehicles — same contract as bulk-deactivate',
  ],
  [
    'get',
    '/vehicles/counts',
    "D-0179 (B7): vehicles per lifecycle status (active / in_maintenance / retired / sold, 0 when empty) + total, under the list's filters and search — `status` and `include_inactive` are ignored so every chip has its true count",
  ],
  [
    'get',
    '/drivers/counts',
    "D-0179 (B7): drivers per status (active / inactive / suspended) + total, under the list's filters and search — `status` and `include_inactive` are ignored",
  ],
  [
    'get',
    '/incidents',
    'D-0179 (B7): every incident of the company, always paged — `date_from`/`date_to`, `severity`, `driver_id`, `vehicle_id`, `search` (type, description), `sort_by` (incident_date default desc, severity, created_at); same incident object as the per-driver / per-vehicle lists',
  ],
  [
    'post',
    '/vehicles/bulk-delete',
    'D-0178 (C14): guarded hard delete of many vehicles — body `{ ids }` or `{ filter }`, ≤ 500; each record is deleted only if never used, else refused with its own message',
  ],
  [
    'delete',
    '/vehicles/{id}',
    'D-0178 (C14): hard delete — only a never-used vehicle (else 422 naming what is in the way); deactivate stays the default',
  ],
  [
    'post',
    '/drivers/bulk-delete',
    'D-0178 (C14): guarded hard delete of many drivers — same contract as POST /vehicles/bulk-delete',
  ],
  [
    'delete',
    '/drivers/{id}',
    'D-0178 (C14): hard delete — only a never-used driver (else 422 naming what is in the way); deactivate stays the default',
  ],
  [
    'post',
    '/drivers/bulk-deactivate',
    'D-0166 (B10): deactivate many drivers — body `{ ids }` or `{ filter }`, ≤ 500 records; per-record results (same guards as POST /drivers/{id}/deactivate)',
  ],
  [
    'post',
    '/drivers/bulk-reactivate',
    'D-0166 (B10): reactivate many drivers — same contract as bulk-deactivate',
  ],
  [
    'put',
    '/incidents/{id}',
    'D-0169 (B3): incident_type / severity / incident_date / description / vehicle_id, send only what changed (`vehicle_id: null` clears it); the driver is not editable',
  ],
  ['delete', '/incidents/{id}', 'D-0169 (B3): deletes the incident record'],
  [
    'delete',
    '/vehicles/{id}/image',
    "D-0169 (B4): removes the vehicle's image (the stored file and `image_path`); idempotent — 200 even when the vehicle has no image",
  ],
  [
    'get',
    '/vehicles/{id}/maintenance-logs',
    "D-0170 (B9): the vehicle's maintenance logs, paged — `date_from`/`date_to` (service_date), `maintenance_schedule_id`, `search` (service type, vendor, notes), `sort_by` (service_date default desc, created_at, cost); the detail response still embeds only the latest 20",
  ],
  [
    'get',
    '/vehicles/{id}/fuel-logs',
    "D-0170 (B9): the vehicle's fuel logs, paged — `date_from`/`date_to` (fill_date), `trip_id`, `search` (vendor, station, receipt), `sort_by` (fill_date default desc, volume, cost, created_at)",
  ],
  [
    'get',
    '/vehicles/{id}/yard-history',
    "D-0170 (B9): the vehicle's yard check-ins/outs, paged — `date_from`/`date_to` (checked_in_at), `yard_id`, `open`, `search` (yard name, slot number), `sort_by` (checked_in_at default desc, checked_out_at)",
  ],
  [
    'get',
    '/vehicles/{id}/incidents',
    'D-0170 (B9): incidents that involved the vehicle, paged — `date_from`/`date_to`, `severity`, `driver_id`, `search`, `sort_by` (incident_date default desc, severity, created_at)',
  ],
  [
    'get',
    '/drivers/{id}/incidents',
    "D-0170 (B9): the driver's incidents, paged — `date_from`/`date_to`, `severity`, `vehicle_id`, `search`, `sort_by` (incident_date default desc, severity, created_at); the detail response still embeds only the latest few",
  ],
  [
    'get',
    '/vehicles/options',
    'D-0165 (B2): the vehicle picker — active vehicles, lean fields + has_driver/has_tracker/checked_in flags; unpaginated, capped (limit ≤ 1000, `meta.truncated`); `search`, `has_driver`, `has_tracker`',
  ],
  [
    'get',
    '/drivers/options',
    'D-0165 (B2): the driver picker — `active` drivers, lean fields + `assigned` flag; unpaginated, capped (limit ≤ 1000, `meta.truncated`); `search`, `assigned`, `availability_status`',
  ],
  [
    'get',
    '/vehicles/{id}',
    'Rich detail -- current position, 7/30d stats, maintenance, fuel, driver assignment history',
  ],
  ['post', '/vehicles/{id}/image', 'Real-content image validation (D-0076 precedent)'],
  [
    'post',
    '/vehicles/{vehicleId}/assign-device',
    'Tightened: device must belong to the caller (new finding, not in Laravel)',
  ],
  [
    'post',
    '/vehicles/{vehicleId}/unassign-device',
    'Closes the assignment (unassigned_at=now()), never deletes',
  ],
  [
    'get',
    '/vehicles/{id}/assignment-history',
    'Same params as driver assignment history; logic lives in one place',
  ],
  [
    'get',
    '/drivers',
    "Own company's drivers, current vehicle assignment; D-0162: inactive drivers hidden unless ?include_inactive=1 (an explicit ?status= filter always wins)",
  ],
  ['post', '/drivers', '11.3: extend_drivers columns now accepted'],
  ['get', '/drivers/{id}', 'Current state + recent assignment history + incidents'],
  [
    'post',
    '/drivers/{driverId}/assign-vehicle',
    "Tightened: vehicle must belong to the caller's company (new finding)",
  ],
  ['post', '/drivers/{driverId}/unassign-vehicle', 'Closes the assignment, never deletes'],
  ['post', '/drivers/{driverId}/incidents', 'Logs a driver safety incident'],
  ['get', '/drivers/{id}/assignment-history', 'Full paginated history for a single driver'],
  ['get', '/assignment-history', 'Company-wide, all drivers x all vehicles'],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-vehicles-drivers'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

registerCsvExportPath(
  '/vehicles/export',
  'fleet-vehicles-drivers',
  "D-0168 (B11): every vehicle matching the list's own search/filters/sort as a streamed `text/csv` download (≤ 50 000 rows, 422 above); columns id … created_at incl. has_driver/has_tracker/checked_in"
);
registerCsvExportPath(
  '/drivers/export',
  'fleet-vehicles-drivers',
  "D-0168 (B11): every driver matching the list's own search/filters/sort as a streamed `text/csv` download (≤ 50 000 rows, 422 above); columns id … created_at incl. `assigned`"
);
