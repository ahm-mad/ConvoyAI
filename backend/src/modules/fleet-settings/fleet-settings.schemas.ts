import { z } from 'zod';
import { ExpectedUpdatedAtSchema } from '../../platform/http/concurrency.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { isValidTimeZone } from '../../platform/time/zoned.js';
import { UNIT_SYSTEMS } from './fleet-settings.types.js';

const nullableTarget = (max: number) => z.coerce.number().min(0).max(max).nullable().optional();

/** `PUT /fleet/settings` — every field optional (send only what changed); a KPI target may be set back to `null`. */
export const UpdateFleetSettingsRequestSchema = z.object({
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, {
      message: 'The timezone must be a valid IANA time zone name, for example Asia/Karachi.',
    })
    .optional(),
  position_freshness_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  idle_threshold_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  scheduled_hours_per_vehicle_per_day: z.coerce.number().min(1).max(24).optional(),
  on_time_grace_minutes: z.coerce.number().int().min(0).max(1440).optional(),
  maintenance_due_soon_days: z.coerce.number().int().min(0).max(365).optional(),
  maintenance_due_soon_km: z.coerce.number().int().min(0).max(100000).optional(),
  utilisation_target_pct: nullableTarget(100),
  on_time_target_pct: nullableTarget(100),
  cost_per_km_target: nullableTarget(99999999),
  idle_limit_pct: nullableTarget(100),
  fuel_economy_target: nullableTarget(9999),
  /** D-0192 (frontend ask U1): `metric` (default) | `us` | `uk` — a display preference; the API keeps storing and returning metric. Not nullable. */
  unit_system: z.enum(UNIT_SYSTEMS, { error: 'The selected unit system is invalid.' }).optional(),
  expected_updated_at: ExpectedUpdatedAtSchema,
});

const SuccessDataSchema = z.record(z.string(), z.unknown());

for (const [method, path, summary] of [
  [
    'get',
    '/fleet/settings',
    "D-0183 (flow 07 F1): the company's fleet settings — timezone, position freshness, idle threshold, scheduled hours per vehicle per day, on-time grace, maintenance due-soon window, KPI targets. A company that never saved any gets the defaults (`is_default: true`).",
  ],
  [
    'put',
    '/fleet/settings',
    "D-0183 (flow 07 F1): partial update (send only what changed; a KPI target may be `null`); creates the company's row on first save; optional `expected_updated_at` → 409 when someone else saved meanwhile.",
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-settings'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}
