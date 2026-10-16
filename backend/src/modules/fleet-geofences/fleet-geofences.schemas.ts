import { ExpectedUpdatedAtSchema } from '../../platform/http/concurrency.js';
import { z } from 'zod';
import { BboxSchema } from '../../platform/http/bbox.js';
import {
  FlagSchema,
  listQueryShape,
  optionsQueryShape,
  sortByEnum,
} from '../../platform/http/list-query.js';
import { BodyFlagSchema, bulkBodySchema } from '../../platform/http/bulk.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 4.3 (`geofences`/`geofence_events`). Request
 * shapes match `GeofenceController`'s validation exactly.
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const GeofenceIdParamSchema = z.object({ id: z.string() });

// -- POST /geofences ---------------------------------------------------------

export const CreateGeofenceRequestSchema = z.object({
  name: z.string().max(255),
  yard_id: z.union([z.number(), z.string()]).nullable().optional(),
  center_latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  center_longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  radius_m: z.coerce.number().int().min(10),
  alert_on: z.enum(['enter', 'exit', 'both']),
});

// -- PUT /geofences/{id} ------------------------------------------------------

export const UpdateGeofenceRequestSchema = z
  .object({
    name: z.string().max(255).optional(),
    radius_m: z.coerce.number().int().min(10).optional(),
    alert_on: z.enum(['enter', 'exit', 'both']).optional(),
    is_active: z.boolean().optional(),
    /** D-0162: a new centre (manual geofences only — a yard-linked one answers 422). Both or neither. */
    center_latitude: z.coerce.number().min(-90).max(90).optional(),
    center_longitude: z.coerce.number().min(-180).max(180).optional(),
    expected_updated_at: ExpectedUpdatedAtSchema,
  })
  .superRefine((body, ctx) => {
    if ((body.center_latitude === undefined) !== (body.center_longitude === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [body.center_latitude === undefined ? 'center_latitude' : 'center_longitude'],
        message: 'center_latitude and center_longitude must be provided together.',
      });
    }
  });

// -- GET /geofences/events -----------------------------------------------------

export const GEOFENCE_SORT_FIELDS = ['name', 'radius_m', 'created_at'] as const;

/** D-0164 (B1) — `GET /geofences` search/filters/sort + opt-in paging. */
export const ListGeofencesQuerySchema = z.object({
  is_active: FlagSchema,
  yard_id: z.coerce.number().int().optional(),
  /** `1` = linked to a yard, `0` = a manual geofence (no yard). */
  linked: FlagSchema,
  alert_on: z
    .enum(['enter', 'exit', 'both'], { error: 'The selected alert on is invalid.' })
    .optional(),
  /** D-0180 (B8): map viewport `minLng,minLat,maxLng,maxLat` — only geofences whose circle overlaps the box. */
  bbox: BboxSchema,
  sort_by: sortByEnum(GEOFENCE_SORT_FIELDS),
  ...listQueryShape,
});

/** D-0166 (B10): `POST /geofences/bulk-enable|bulk-disable|bulk-delete` — `{ ids }` or `{ filter }` (the geofence list's filters), ≤ 500 records. */
export const BulkGeofencesBodySchema = bulkBodySchema(
  z.object({
    search: z.string().max(255).optional(),
    is_active: BodyFlagSchema,
    yard_id: z.coerce.number().int().optional(),
    linked: BodyFlagSchema,
    alert_on: z
      .enum(['enter', 'exit', 'both'], { error: 'The selected alert on is invalid.' })
      .optional(),
  })
);

/** D-0165 (B2): `GET /geofences/options` — the geofence picker's lean, unpaginated list (active geofences only). */
export const GeofenceOptionsQuerySchema = z.object({
  /** D-0171: also offer disabled geofences (for history-filter dropdowns); default off. */
  include_inactive: FlagSchema,
  yard_id: z.coerce.number().int().optional(),
  linked: FlagSchema,
  ...optionsQueryShape,
});

export const EVENT_SORT_FIELDS = ['occurred_at'] as const;

/**
 * D-0164 (B1): the `alert_on` filter now runs in SQL *before* `limit`/paging (it used to run after `limit`, so `limit=20` could return 17
 * rows and paging was impossible). `limit` (default 50, max 200) still bounds the flat list; when `page`/`per_page` is sent, paging wins and `limit` is ignored.
 */
export const ListGeofenceEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  geofence_id: z.coerce.number().int().optional(),
  vehicle_id: z.coerce.number().int().optional(),
  trip_id: z.coerce.number().int().optional(),
  event_type: z
    .enum(['enter', 'exit'], { error: 'The selected event type is invalid.' })
    .optional(),
  /** Inclusive `occurred_at` range — ISO 8601 with an offset or `Z`. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort_by: sortByEnum(EVENT_SORT_FIELDS),
  ...listQueryShape,
});

for (const [method, path, summary] of [
  ['get', '/geofences', "Own company's geofences with yard brief"],
  [
    'post',
    '/geofences/bulk-enable',
    'D-0166 (B10): enable many geofences — body `{ ids }` or `{ filter }`, ≤ 500 records; per-record `{ id, ok, message }` results, HTTP 200 even when some fail',
  ],
  [
    'post',
    '/geofences/bulk-disable',
    'D-0166 (B10): disable many geofences — same contract as bulk-enable',
  ],
  [
    'post',
    '/geofences/bulk-delete',
    'D-0166 (B10): delete many geofences (cascades their events) — same contract as bulk-enable',
  ],
  [
    'get',
    '/geofences/options',
    'D-0165 (B2): the geofence picker — active geofences (id, name, yard_id, alert_on, radius_m); unpaginated, capped (limit ≤ 1000, `meta.truncated`); `search`, `yard_id`, `linked`',
  ],
  ['post', '/geofences', "yard_id without explicit coords defaults center to that yard's lat/lng"],
  [
    'put',
    '/geofences/{id}',
    'Partial update; D-0162: center_latitude/center_longitude (both) move a MANUAL geofence — 422 for a yard-linked one (change the yard instead)',
  ],
  ['delete', '/geofences/{id}', 'Cascades geofence_events via real FK ON DELETE CASCADE'],
  [
    'get',
    '/geofences/events',
    'Fixed (11.4): loads vehicle, not device — geofence_events has no device column',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-geofences'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

registerCsvExportPath(
  '/geofences/export',
  'fleet-geofences',
  "D-0168 (B11): every geofence matching the list's own search/filters/sort as a streamed `text/csv` download (≤ 50 000 rows, 422 above); columns id … created_at incl. the yard name"
);
registerCsvExportPath(
  '/geofences/events/export',
  'fleet-geofences',
  "D-0168 (B11): every geofence event matching the event list's own filters/sort (the geofence's alert_on applied first) as a streamed `text/csv` download (≤ 50 000 rows, 422 above)"
);
