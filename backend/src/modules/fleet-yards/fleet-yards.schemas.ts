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
 * Zod schemas for module 4.4 (`yards`/`yard_layouts`/`yard_slots`/
 * `yard_slot_events`). Request shapes match `YardController`'s
 * validation exactly.
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const YardIdParamSchema = z.object({ id: z.string() });
export const YardIdRouteParamSchema = z.object({ yardId: z.string() });
export const SlotIdParamSchema = z.object({ slotId: z.string() });

// -- POST /yards --------------------------------------------------------------

export const CreateYardRequestSchema = z.object({
  name: z.string().max(255),
  address: z.string().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  /** D-0162: the linked geofence's radius in metres (default 100, min 10). Used only when the yard has coordinates. */
  radius_m: z.coerce.number().int().min(10).optional(),
});

// -- PUT /yards/{id} (D-0162) ---------------------------------------------------

export const UpdateYardRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    address: z.string().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    radius_m: z.coerce.number().int().min(10).optional(),
    expected_updated_at: ExpectedUpdatedAtSchema,
  })
  .superRefine((body, ctx) => {
    if ((body.latitude === undefined) !== (body.longitude === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [body.latitude === undefined ? 'latitude' : 'longitude'],
        message: 'latitude and longitude must be provided together.',
      });
    }
  });

// -- PUT /yard-slots/{slotId} (D-0162) --------------------------------------------

export const UpdateYardSlotRequestSchema = z.object({
  slot_number: z.string().min(1).max(50).optional(),
  position_x: z.coerce.number().min(0).max(1).nullable().optional(),
  position_y: z.coerce.number().min(0).max(1).nullable().optional(),
  max_length_m: z.coerce.number().min(0).nullable().optional(),
  expected_updated_at: ExpectedUpdatedAtSchema,
});

// -- GET /yards (D-0162) ------------------------------------------------------------

export const YARD_SORT_FIELDS = ['name', 'created_at', 'slots_count', 'radius_m'] as const;

export const ListYardsQuerySchema = z.object({
  include_inactive: z.enum(['0', '1', 'true', 'false']).optional(),
  /** D-0164 (B1): the yard has / has not got coordinates. */
  has_coordinates: FlagSchema,
  /** D-0164 (B1): a layout image has / has not been uploaded. */
  has_layout: FlagSchema,
  /** D-0167 (R3): `1` = active yards only, `0` = deactivated yards only; when given it wins over `include_inactive`. */
  is_active: FlagSchema,
  /** D-0167 (R3): the yard has at least one slot (`1`) / no slot (`0`). */
  has_slots: FlagSchema,
  /** D-0167 (R3): the yard has at least N slots. */
  min_slots: z.coerce.number().int().min(0).max(100000).optional(),
  /** D-0180 (B8): map viewport `minLng,minLat,maxLng,maxLat` — only yards whose circle (their linked geofence's radius, else the centre point) overlaps the box; yards without coordinates are left out. */
  bbox: BboxSchema,
  sort_by: sortByEnum(YARD_SORT_FIELDS),
  ...listQueryShape,
});

/** D-0166 (B10): `POST /yards/bulk-deactivate|bulk-reactivate` — `{ ids }` or `{ filter }` (the yard list's filters), ≤ 500 records. `include_inactive` defaults to `false` for deactivate, `true` for reactivate. */
export const BulkYardsBodySchema = bulkBodySchema(
  z.object({
    search: z.string().max(255).optional(),
    has_coordinates: BodyFlagSchema,
    has_layout: BodyFlagSchema,
    is_active: BodyFlagSchema,
    has_slots: BodyFlagSchema,
    min_slots: z.coerce.number().int().min(0).max(100000).optional(),
    include_inactive: BodyFlagSchema,
  })
);

/** D-0165 (B2): `GET /yards/options` — the yard picker's lean, unpaginated list (active yards only). */
export const YardOptionsQuerySchema = z.object({
  /** D-0171: also offer deactivated yards (for history-filter dropdowns); default off. */
  include_inactive: FlagSchema,
  has_coordinates: FlagSchema,
  ...optionsQueryShape,
});

// -- POST /yards/{yardId}/slots -------------------------------------------------

export const CreateYardSlotRequestSchema = z.object({
  slot_number: z.string().max(50),
  position_x: z.coerce.number().min(0).max(1).nullable().optional(),
  position_y: z.coerce.number().min(0).max(1).nullable().optional(),
  max_length_m: z.coerce.number().min(0).nullable().optional(),
});

// -- POST /yard-slots/{slotId}/check-in ------------------------------------------

export const CheckInRequestSchema = z.object({
  vehicle_id: z.union([z.number(), z.string()]),
});

for (const [method, path, summary] of [
  [
    'get',
    '/yards',
    'withCount(slots); D-0162: radius_m (of the linked geofence) + is_active on every yard, deactivated yards hidden unless ?include_inactive=1',
  ],
  [
    'post',
    '/yards',
    'Create a yard; D-0162: radius_m (default 100, min 10) — a yard with coordinates gets its linked geofence automatically (response `geofence: { id, radius_m }`)',
  ],
  [
    'put',
    '/yards/{id}',
    'D-0162: name/address/latitude+longitude/radius_m — moves or resizes the linked geofence in the same call (creates it if the yard gains coordinates)',
  ],
  [
    'post',
    '/yards/bulk-deactivate',
    'D-0166 (B10): deactivate many yards — body `{ ids }` or `{ filter }`, ≤ 500 records; per-record `{ id, ok, message }` results (same guards as POST /yards/{id}/deactivate), HTTP 200 even when some fail',
  ],
  [
    'post',
    '/yards/bulk-reactivate',
    'D-0166 (B10): reactivate many yards — same contract as bulk-deactivate',
  ],
  [
    'post',
    '/yards/bulk-delete',
    'D-0178 (C14): guarded hard delete of many yards — same contract as POST /vehicles/bulk-delete',
  ],
  [
    'delete',
    '/yards/{id}',
    'D-0178 (C14): hard delete — only a never-used yard (else 422 naming what is in the way); its empty slots, layout and linked geofence go with it; deactivate stays the default',
  ],
  [
    'get',
    '/yards/options',
    'D-0165 (B2): the yard picker — active yards (id, name, address, coordinates, slots_count); unpaginated, capped (limit ≤ 1000, `meta.truncated`); `search`, `has_coordinates`',
  ],
  ['post', '/yards/{id}/deactivate', 'D-0162: is_active=false; 422 while vehicles are checked in'],
  ['post', '/yards/{id}/reactivate', 'D-0162: is_active=true'],
  ['put', '/yard-slots/{slotId}', 'D-0162: slot_number/position_x/position_y/max_length_m'],
  ['get', '/yards/{id}', 'Includes layout + slots.currentEvent.vehicle'],
  [
    'post',
    '/yards/{yardId}/layout',
    'Replace-on-reupload, same pattern as floor plans (200 `Layout replaced.` when one exists, 201 when new); the slots keep their relative positions',
  ],
  [
    'delete',
    '/yards/{yardId}/layout',
    'D-0169 (B4): removes the layout image (stored file + row); the slots stay with their relative positions; idempotent — 200 even when there is no layout',
  ],
  [
    'delete',
    '/yard-slots/{slotId}',
    "D-0169 (B4): 422 `This slot has a vehicle checked in. Check it out first.` while occupied and 422 `This slot has check-in history and can't be deleted.` when it has any history (deleting would erase it)",
  ],
  ['post', '/yards/{yardId}/slots', 'Place a numbered slot on the layout'],
  [
    'post',
    '/yard-slots/{slotId}/check-in',
    'The slip concept — one open stay per slot. Also enforces vehicle length <= slot max_length_m',
  ],
  [
    'post',
    '/yard-slots/{slotId}/check-out',
    'Closes the open stay. Dwell = checked_out_at - checked_in_at',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-yards'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

registerCsvExportPath(
  '/yards/export',
  'fleet-yards',
  "D-0168 (B11): every yard matching the list's own search/filters/sort as a streamed `text/csv` download (≤ 50 000 rows, 422 above); columns id … created_at incl. radius_m and slots_count"
);
