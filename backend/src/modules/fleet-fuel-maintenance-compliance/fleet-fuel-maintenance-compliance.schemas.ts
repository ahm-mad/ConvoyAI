import { ExpectedUpdatedAtSchema } from '../../platform/http/concurrency.js';
import { z } from 'zod';
import { FlagSchema, listQueryShape, sortByEnum } from '../../platform/http/list-query.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 4.5. Request shapes match `VehicleController`'s/
 * `ComplianceDocumentController`'s validation exactly, except `fuel-logs`
 * (11.3, extend_fuel_logs) — Laravel's real validation never accepted
 * `station_name`/`unit_price`/`total_cost`/`payment_method`/
 * `receipt_reference`/`trip_id` at all (confirmed live), so the new app
 * accepts them from day one (D-0077-style deliberate deviation).
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const VehicleIdRouteParamSchema = z.object({ vehicleId: z.string() });

/** D-0169 (B3): the record id in `PUT/DELETE /maintenance-schedules/{id}` etc. */
export const RecordIdParamSchema = z.object({ id: z.string() });

// -- POST /vehicles/{vehicleId}/maintenance-schedules --------------------------

export const CreateMaintenanceScheduleRequestSchema = z.object({
  service_type: z.string().max(255),
  interval_days: z.coerce.number().int().min(1).nullable().optional(),
  interval_km: z.coerce.number().int().min(1).nullable().optional(),
  last_service_date: z.coerce.date().nullable().optional(),
  odometer_baseline_km: z.coerce.number().min(0).nullable().optional(),
  odometer_baseline_date: z.coerce.date().nullable().optional(),
  last_service_odometer_km: z.coerce.number().min(0).nullable().optional(),
});

// -- POST /vehicles/{vehicleId}/maintenance-logs --------------------------------

export const CreateMaintenanceLogRequestSchema = z.object({
  maintenance_schedule_id: z.union([z.number(), z.string()]).nullable().optional(),
  service_type: z.string().max(255),
  service_date: z.coerce.date(),
  odometer_km: z.coerce.number().min(0).nullable().optional(),
  cost: z.coerce.number().min(0).nullable().optional(),
  vendor: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// -- POST /vehicles/{vehicleId}/fuel-logs ---------------------------------------

export const CreateFuelLogRequestSchema = z.object({
  fill_date: z.coerce.date(),
  volume: z.coerce.number().min(0.01),
  unit: z.enum(['liters', 'gallons']),
  cost: z.coerce.number().min(0).nullable().optional(),
  odometer_km: z.coerce.number().min(0).nullable().optional(),
  is_full_tank: z.coerce.boolean().optional(),
  vendor: z.string().max(255).nullable().optional(),
  // 11.3 (extend_fuel_logs) — accepted from day one, not ported from Laravel's broken validation.
  station_name: z.string().max(255).nullable().optional(),
  unit_price: z.coerce.number().min(0).nullable().optional(),
  total_cost: z.coerce.number().min(0).nullable().optional(),
  payment_method: z.string().max(255).nullable().optional(),
  receipt_reference: z.string().max(255).nullable().optional(),
  trip_id: z.union([z.number(), z.string()]).nullable().optional(),
});

// -- PUT /maintenance-schedules/{id}, /maintenance-logs/{id}, /fuel-logs/{id}, /compliance-documents/{id} (D-0169, B3) --
// Same fields as the matching POST, all optional — send only what changed; `null` clears a nullable field.

export const UpdateMaintenanceScheduleRequestSchema =
  CreateMaintenanceScheduleRequestSchema.partial().extend({
    expected_updated_at: ExpectedUpdatedAtSchema,
  });
export const UpdateMaintenanceLogRequestSchema = CreateMaintenanceLogRequestSchema.partial().extend(
  { expected_updated_at: ExpectedUpdatedAtSchema }
);
export const UpdateFuelLogRequestSchema = CreateFuelLogRequestSchema.partial().extend({
  expected_updated_at: ExpectedUpdatedAtSchema,
});

// -- GET/POST /compliance-documents ---------------------------------------------

export const ComplianceDocumentableTypeSchema = z.enum(['driver', 'vehicle']);

export const COMPLIANCE_SORT_FIELDS = ['expiry_date', 'created_at'] as const;

export const ListComplianceDocumentsQuerySchema = z.object({
  documentable_type: ComplianceDocumentableTypeSchema,
  documentable_id: z.coerce.string(),
  /** D-0164 (B1) */
  document_type: z.string().max(255).optional(),
  /** Expiry date between today and today + N days (already-expired documents are not included — use `expired=1` for those). */
  expiring_within_days: z.coerce.number().int().min(0).max(3650).optional(),
  /** `1` = expiry date before today, `0` = no expiry date or not yet expired. */
  expired: FlagSchema,
  sort_by: sortByEnum(COMPLIANCE_SORT_FIELDS),
  ...listQueryShape,
});

/** `GET /compliance-documents/expiring-soon` (D-0188, flow 07 C4): the window is optional — without it the endpoint keeps its 30 days. */
export const ExpiringSoonQuerySchema = z.object({
  within_days: z.coerce.number().int().min(1).max(365).optional(),
});

export const CreateComplianceDocumentRequestSchema = z.object({
  documentable_type: ComplianceDocumentableTypeSchema,
  documentable_id: z.union([z.number(), z.string()]),
  document_type: z.string().max(255),
  document_number: z.string().max(255).nullable().optional(),
  issue_date: z.coerce.date().nullable().optional(),
  expiry_date: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** D-0169 (B3): the owner (`documentable_type` / `documentable_id`) is not editable; everything else is, all optional. */
export const UpdateComplianceDocumentRequestSchema = z.object({
  document_type: z.string().max(255).optional(),
  document_number: z.string().max(255).nullable().optional(),
  issue_date: z.coerce.date().nullable().optional(),
  expiry_date: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  expected_updated_at: ExpectedUpdatedAtSchema,
});

for (const [method, path, summary] of [
  ['post', '/vehicles/{vehicleId}/maintenance-schedules', 'Create a maintenance schedule'],
  [
    'post',
    '/vehicles/{vehicleId}/maintenance-logs',
    "Updates the linked schedule's last_service_date/last_service_odometer_km if a schedule id is given",
  ],
  [
    'post',
    '/vehicles/{vehicleId}/fuel-logs',
    'KNOWN_ISSUES 11.3 closed: extend_fuel_logs columns wired end-to-end',
  ],
  [
    'get',
    '/compliance-documents',
    'Polymorphic. documentable_type stored as a short type string, not a class name',
  ],
  ['post', '/compliance-documents', 'Create a compliance document for a driver or vehicle'],
  [
    'get',
    '/compliance-documents/expiring-soon',
    'Within 30 days (or `within_days`, 1-365 — D-0188) OR already expired, company-wide across both types',
  ],
  [
    'put',
    '/maintenance-schedules/{id}',
    "D-0169 (B3): any POST field, send only what changed (`null` clears a nullable field); the schedule's vehicle must belong to the caller's company",
  ],
  [
    'delete',
    '/maintenance-schedules/{id}',
    'D-0169 (B3): deletes the schedule; its maintenance logs are KEPT as history and unlinked (`maintenance_schedule_id` becomes null)',
  ],
  [
    'put',
    '/maintenance-logs/{id}',
    "D-0169 (B3): any POST field (incl. re-linking `maintenance_schedule_id` to another schedule of the same vehicle); afterwards each affected schedule's last_service_date/odometer is recomputed from its newest remaining linked log",
  ],
  [
    'delete',
    '/maintenance-logs/{id}',
    "D-0169 (B3): deletes the log; the linked schedule's last_service_date/odometer is recomputed from its newest remaining linked log (unchanged when none remains)",
  ],
  [
    'put',
    '/fuel-logs/{id}',
    'D-0169 (B3): any POST field, send only what changed; `trip_id` must belong to the same vehicle',
  ],
  [
    'delete',
    '/fuel-logs/{id}',
    'D-0169 (B3): deletes the fuel log (fuel-economy figures are computed on read, so they follow)',
  ],
  [
    'put',
    '/compliance-documents/{id}',
    'D-0169 (B3): document_type / document_number / issue_date / expiry_date / notes, send only what changed; the owner (driver or vehicle) is not editable',
  ],
  [
    'delete',
    '/compliance-documents/{id}',
    'D-0169 (B3): deletes the document record (metadata only — no file is attached)',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-fuel-maintenance-compliance'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}
