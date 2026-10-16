import { z } from 'zod';
import { BboxSchema, MAP_LIMIT_MAX } from '../../platform/http/bbox.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/** Zod schema for module 4.8. One read-only GET, no request params. */
const SuccessDataSchema = z.record(z.string(), z.unknown());

const queryFlag = z
  .enum(['0', '1', 'true', 'false'])
  .optional()
  .transform(value => value === '1' || value === 'true');

export const PositionsQuerySchema = z.object({
  include_unassigned: queryFlag,
  /** D-0180 (B8): map viewport `minLng,minLat,maxLng,maxLat` — only trackers whose latest position is inside the box. */
  bbox: BboxSchema,
  /** D-0180 (B8): keep at most this many (the most recently reported); `meta.truncated` says whether it cut anything off. */
  limit: z.coerce.number().int().min(1).max(MAP_LIMIT_MAX).optional(),
});

export const DeviceHistoryParamSchema = z.object({ deviceId: z.string() });

/** `max(1, min(2000, (int) limit ?? 500))` (Laravel `FleetController::history`) — clamps instead of rejecting. */
export const DeviceHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform(value => {
      const parsed = Number.parseInt(value ?? '500', 10);
      return Math.max(1, Math.min(2000, Number.isNaN(parsed) ? 500 : parsed));
    }),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/fleet/positions',
  tags: ['fleet'],
  summary:
    "Latest position per device, company-wide, with each device's currently assigned vehicle. Assigned-only by default (D9); `include_unassigned=1` also returns trackers not installed in any vehicle.",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/fleet/devices/{deviceId}/history',
  tags: ['fleet'],
  summary:
    "Position history for one company device — the most recent `limit` (default 500, max 2000) points, oldest to newest. 404 when the device is not in the caller's company.",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});
