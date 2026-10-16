import { z } from 'zod';
import { idListParam, listQueryShape } from '../../platform/http/list-query.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';

/**
 * Zod schemas for module 4.6. Query params only — all 5 endpoints are
 * read-only GETs. Date defaulting/range-swap logic lives in the controller
 * (`FleetDashboardController::parseDateRange`/`trends`'s own bespoke
 * default ported exactly — see fleet-dashboard.controller.ts).
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());

export const DateRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** D-0182 (L2): `GET /fleet/dashboard` — the date range plus `fleet_only` (same spelling as `/alerts`; default off). */
export const OverviewQuerySchema = DateRangeQuerySchema.extend({
  /** `1`/`true` → the `alerts` counts cover only alarms of devices currently installed in a vehicle. */
  fleet_only: z.enum(['0', '1', 'true', 'false']).optional(),
});

export const TrendsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z.enum(['day', 'week', 'month']).optional(),
});

/** D-0184 (B3 / A8): which vehicles a summary or table covers — the scope filters of `flows/07` B0. All optional; `[]` spelling (`vehicle_id[]=1`) accepted like on the trips list. */
export const scopeQueryShape = {
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  driver_id: idListParam('driver id'),
  'driver_id[]': idListParam('driver id'),
  yard_id: z.coerce.number().int().min(1).optional(),
};

export const VehiclePerformanceQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Any column of the table (an unknown value falls back to `utilisation_rate`, as it always did). */
  sort: z.string().optional(),
  direction: z.string().optional(),
  /** D-0184 (A8): `sort_by` / `sort_order` are accepted as aliases of `sort` / `direction`. */
  sort_by: z.string().optional(),
  ...scopeQueryShape,
  ...listQueryShape,
});

/** D-0184 (B3): `GET /fleet/status-summary` — the scope filters only. */
export const StatusSummaryQuerySchema = z.object(scopeQueryShape);

export const AlertsQuerySchema = z.object({
  severity: z.string().optional(),
  /** D-0159: `1`/`true` → only alarms of devices currently installed in a vehicle (the fleet's own alarms). */
  fleet_only: z.enum(['0', '1', 'true', 'false']).optional(),
});

for (const [method, path, summary] of [
  [
    'get',
    '/fleet/dashboard',
    'API #1 -- full snapshot. Real-time sections (status,alerts) ignore from/to',
  ],
  [
    'get',
    '/fleet/dashboard/trends',
    'API #2 -- time-series for charts. Default: last 30 days, day interval',
  ],
  ['get', '/fleet/dashboard/vehicle-performance', 'API #3 -- per-vehicle KPI ranking table'],
  [
    'get',
    '/fleet/dashboard/alerts',
    'API #4. KNOWN_ISSUES 11.1 fixed: real active/acknowledged states, alarms.severity read directly (not a nonexistent rule.severity column), Postgres-native ordering',
  ],
  [
    'get',
    '/fleet/status-summary',
    'D-0184 (flow 07 B3): exclusive status counts (moving / idle / parked / offline / no_tracker) for the vehicles in scope, split by vehicle category, plus tracker coverage. Scope filters: vehicle_category, cost_centre, vehicle_id, driver_id, yard_id',
  ],
  [
    'get',
    '/fleet/dashboard/financial',
    'API #5. Costs available now; revenue/profit null until billing (4.7) is wired',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['fleet-dashboard'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

registerCsvExportPath(
  '/fleet/dashboard/vehicle-performance/export',
  'fleet-dashboard',
  "D-0184 (flow 07 A8): the vehicle-performance table's own range / search / scope filters / sort, every row as CSV (streamed; 422 above 50 000 rows)"
);
