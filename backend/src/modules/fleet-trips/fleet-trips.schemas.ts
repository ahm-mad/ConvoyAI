import { ExpectedUpdatedAtSchema } from '../../platform/http/concurrency.js';
import { z } from 'zod';
import { listQueryShape, sortByEnum } from '../../platform/http/list-query.js';
import { bulkBodySchema } from '../../platform/http/bulk.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 4.2 (`trips`/`trip_planned_yards`). Request
 * shapes match `TripController`'s validation exactly, plus the tightened
 * `driver_id`/`fleet_customer_id`/`planned_yards.*.yard_id` ownership
 * checks (D-0077's class of finding — enforced in the service, not here;
 * these schemas only mirror Laravel's own type/shape rules).
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const TripIdParamSchema = z.object({ id: z.string() });

// -- GET /trips ----------------------------------------------------------------

export const TRIP_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export const TRIP_SORT_FIELDS = [
  'planned_start_at',
  'created_at',
  'status',
  'trip_reference',
] as const;

/** D-0164 (B1): `status=planned`, `status=planned,in_progress` or `status[]=planned&status[]=in_progress` — every value must be a real status. */
const TripStatusFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(value => {
    if (value === undefined) return undefined;
    const parts = (Array.isArray(value) ? value : [value])
      .flatMap(entry => entry.split(','))
      .map(entry => entry.trim());
    const distinct = [...new Set(parts.filter(entry => entry !== ''))];
    return distinct.length > 0 ? distinct : undefined;
  })
  .pipe(z.array(z.enum(TRIP_STATUSES, { error: 'The selected status is invalid.' })).optional());

export const ListTripsQuerySchema = z.object({
  status: TripStatusFilterSchema,
  /**
   * Express 5 parses the query string with the "simple" parser, so `status[]=planned&status[]=in_progress` arrives as a key literally
   * named `status[]` — accepted here (same rules as `status`) and merged with it by `mergedTripStatuses` (D-0164).
   */
  'status[]': TripStatusFilterSchema,
  vehicle_id: z.coerce.number().int().optional(),
  driver_id: z.coerce.number().int().optional(),
  customer_id: z.coerce.number().int().optional(),
  /** Matches trips whose `actual_start_at` OR `planned_start_at` is on/after this instant (documented in D-0164; unchanged behaviour). */
  date_from: z.string().optional(),
  /** Matches trips whose `actual_start_at` OR `planned_start_at` is on/before this instant. */
  date_to: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  /** D-0164 (B1): case-insensitive contains over reference, origin/destination address, purpose, vehicle name/plate, driver name. */
  search: listQueryShape.search,
  sort_by: sortByEnum(TRIP_SORT_FIELDS),
  sort_order: listQueryShape.sort_order,
});

/** D-0179 (B7): `GET /trips/counts` — the trip list's filters (`vehicle_id`, `driver_id`, `customer_id`, `date_from`, `date_to`, `search`), never `status` / paging / sort: every status is always counted. */
export const TripCountsQuerySchema = ListTripsQuerySchema.omit({
  status: true,
  'status[]': true,
  per_page: true,
  page: true,
  sort_by: true,
  sort_order: true,
});

/**
 * D-0166 (B10): `POST /trips/bulk-delete` — `{ ids }` or `{ filter }` (the trip list's filters: `status` as a list, `vehicle_id`, `driver_id`,
 * `customer_id`, `date_from`, `date_to`, `search`), ≤ 500 records. Only `planned` trips can be deleted — every other trip is refused per record.
 */
export const BulkTripsBodySchema = bulkBodySchema(
  z.object({
    status: z.array(z.enum(TRIP_STATUSES, { error: 'The selected status is invalid.' })).optional(),
    vehicle_id: z.coerce.number().int().optional(),
    driver_id: z.coerce.number().int().optional(),
    customer_id: z.coerce.number().int().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    search: z.string().max(255).optional(),
  })
);

/** `status` and `status[]` combined (order kept, duplicates removed); `undefined` when neither was sent. */
export function mergedTripStatuses(query: {
  status?: string[] | undefined;
  'status[]'?: string[] | undefined;
}): string[] | undefined {
  const all = [...(query.status ?? []), ...(query['status[]'] ?? [])];
  return all.length > 0 ? [...new Set(all)] : undefined;
}

// -- POST /trips -----------------------------------------------------------------

const PlannedYardInputSchema = z.object({
  yard_id: z.union([z.number(), z.string()]),
  stop_purpose: z.string().max(255).nullable().optional(),
  planned_arrival_at: z.coerce.date().nullable().optional(),
  planned_departure_at: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** D-0175 (B5): a stop in `PUT /trips/{id}`'s `planned_yards` — `id` present = keep that stop (a field left out keeps its value, `null` clears it), absent = a new stop. */
const EditPlannedYardInputSchema = PlannedYardInputSchema.extend({
  id: z.union([z.number(), z.string()]).optional(),
});

export const CreateTripRequestSchema = z.object({
  vehicle_id: z.union([z.number(), z.string()]),
  driver_id: z.union([z.number(), z.string()]).nullable().optional(),
  fleet_customer_id: z.union([z.number(), z.string()]).nullable().optional(),
  trip_reference: z.string().max(100).nullable().optional(),
  purpose: z.string().max(255).nullable().optional(),
  origin_address: z.string().max(500).nullable().optional(),
  origin_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  origin_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  destination_address: z.string().max(500).nullable().optional(),
  destination_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  destination_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  planned_start_at: z.coerce.date().nullable().optional(),
  planned_end_at: z.coerce.date().nullable().optional(),
  planned_distance_km: z.coerce.number().min(0).nullable().optional(),
  odometer_start_km: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  planned_yards: z.array(PlannedYardInputSchema).nullable().optional(),
});

// -- PUT /trips/{id} ---------------------------------------------------------------

export const UpdateTripRequestSchema = z.object({
  fleet_customer_id: z.union([z.number(), z.string()]).nullable().optional(),
  trip_reference: z.string().max(100).nullable().optional(),
  purpose: z.string().max(255).nullable().optional(),
  origin_address: z.string().max(500).nullable().optional(),
  origin_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  origin_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  destination_address: z.string().max(500).nullable().optional(),
  destination_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  destination_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  planned_start_at: z.coerce.date().nullable().optional(),
  planned_end_at: z.coerce.date().nullable().optional(),
  planned_distance_km: z.coerce.number().min(0).nullable().optional(),
  odometer_start_km: z.coerce.number().min(0).nullable().optional(),
  fuel_used_liters: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  /** D-0175 (B5): replaces the stop list while the trip is `planned` (order = sequence 1..n); omitted = stops unchanged, `[]` = no stops. */
  planned_yards: z.array(EditPlannedYardInputSchema).optional(),
  expected_updated_at: ExpectedUpdatedAtSchema,
});

// -- POST /trips/{id}/complete -----------------------------------------------------

export const CompleteTripRequestSchema = z.object({
  odometer_end_km: z.coerce.number().min(0).nullable().optional(),
  fuel_used_liters: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// -- POST /trips/{id}/cancel --------------------------------------------------------

export const CancelTripRequestSchema = z.object({
  cancellation_reason: z.string().max(500).nullable().optional(),
});

// -- POST /trips/{id}/stops/{stopId}/arrive | depart (D-0155) ---------------------------

export const TripStopParamSchema = z.object({ id: z.string(), stopId: z.string() });

/** `occurred_at`: ISO 8601 with offset or `Z` (default now); `reason`: required only when replacing an existing actual time (enforced in the service, exact strings in `05` §9). */
export const StopActionRequestSchema = z.object({
  occurred_at: z.coerce.date().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

for (const [method, path, summary] of [
  ['get', '/trips', "Own company's trips, filterable by status/vehicle/driver/customer/date range"],
  [
    'post',
    '/trips',
    "Auto-snapshots driver/device from the vehicle's current assignments if not given",
  ],
  [
    'get',
    '/trips/counts',
    "D-0179 (B7): trips per status (planned / in_progress / completed / cancelled, 0 when empty) + total, under the list's filters and search — `status` is ignored so every chip has its true count",
  ],
  [
    'post',
    '/trips/bulk-delete',
    'D-0166 (B10): delete many planned trips — body `{ ids }` or `{ filter }`, ≤ 500 records; per-record `{ id, ok, message }` results (same guards as DELETE /trips/{id}: only planned trips), HTTP 200 even when some fail',
  ],
  ['get', '/trips/{id}', 'Full detail incl. planned yards and their yard briefs'],
  ['put', '/trips/{id}', 'Only planned/in_progress trips are editable'],
  [
    'delete',
    '/trips/{id}',
    'D-0162: only while planned (422 `Only planned trips can be deleted.`); removes its planned stops',
  ],
  ['post', '/trips/{id}/start', 'planned -> in_progress'],
  [
    'post',
    '/trips/{id}/complete',
    'in_progress -> completed; distance via odometer delta or GPS Haversine',
  ],
  ['post', '/trips/{id}/cancel', 'planned|in_progress -> cancelled'],
  [
    'get',
    '/trips/{id}/gps-trail',
    'Real device_positions trail bounded by actual_start_at..actual_end_at',
  ],
  [
    'get',
    '/trips/{id}/route',
    'The one map/trip response: summary, vehicle, driver, origin/destination, ordered stops with audit events, driven trail, current position',
  ],
  [
    'post',
    '/trips/{id}/stops/{stopId}/arrive',
    "Manually mark a planned stop as arrived (in_progress or completed trips); replacing an existing time needs a reason, the original stays in the stop's events[]",
  ],
  [
    'post',
    '/trips/{id}/stops/{stopId}/depart',
    'Manually mark a planned stop as departed (needs an arrival first); computes dwell_time_minutes',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-trips'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

registerCsvExportPath(
  '/trips/export',
  'fleet-trips',
  "D-0168 (B11): every trip matching the list's own search/filters/sort as a streamed `text/csv` download (≤ 50 000 rows, 422 above; page/per_page are ignored); columns id … created_at incl. vehicle and driver names"
);
