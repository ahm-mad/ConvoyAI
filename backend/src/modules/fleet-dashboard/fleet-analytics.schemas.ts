import { z } from 'zod';
import {
  FlagSchema,
  enumListParam,
  idListParam,
  listQueryShape,
  sortByEnum,
} from '../../platform/http/list-query.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { scopeQueryShape } from './fleet-dashboard.schemas.js';
import { YARD_TABLE_SORT_FIELDS } from './fleet-activity.service.js';
import { ATTENTION_TYPES } from './fleet-attention.service.js';
import {
  COMPLIANCE_KINDS,
  COMPLIANCE_TABLE_SORT_FIELDS,
} from './fleet-compliance-report.service.js';
import { DRIVER_TABLE_SORT_FIELDS } from './fleet-drivers-report.service.js';
import { UTILISATION_TABLE_SORT_FIELDS } from './fleet-utilisation-report.service.js';
import { INCIDENT_SEVERITIES } from './fleet-driver-safety.shared.js';
import { FUEL_ANOMALY_TYPES, FUEL_TABLE_SORT_FIELDS } from './fleet-fuel-report.service.js';
import { EXPIRY_STATUSES } from '../../shared/utils/expiry-buckets.js';
import { TRIP_STATUSES, TRIP_TABLE_SORT_FIELDS } from './fleet-trips-report.service.js';

const SuccessDataSchema = z.record(z.string(), z.unknown());

/** `GET /fleet/analytics/summary` (D-0185, flow 07 B1) — range, interval, comparison and the scope filters shared by every analytics endpoint (B0). */
export const AnalyticsSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  ...scopeQueryShape,
});

/** `GET /fleet/attention` (D-0185, flow 07 B2) — always paged. */
export const AttentionQuerySchema = z.object({
  severity: enumListParam(
    ['critical', 'warning', 'info'] as const,
    'The selected severity is invalid.'
  ),
  'severity[]': enumListParam(
    ['critical', 'warning', 'info'] as const,
    'The selected severity is invalid.'
  ),
  type: enumListParam(ATTENTION_TYPES, 'The selected type is invalid.'),
  'type[]': enumListParam(ATTENTION_TYPES, 'The selected type is invalid.'),
  /** An open yard stay longer than this many days is listed (default 7). */
  yard_days: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

const positiveId = z.coerce.number().int().min(1);

/** `GET /fleet/analytics/yards` (D-0187, flow 07 B9). */
export const YardSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  yard_id: positiveId.optional(),
  include_inactive: z.enum(['0', '1', 'true', 'false']).optional(),
  search: z.string().trim().max(255).optional(),
  sort_by: z.enum(YARD_TABLE_SORT_FIELDS, { error: 'The selected sort by is invalid.' }).optional(),
  sort_order: z.enum(['asc', 'desc'], { error: 'The selected sort order is invalid.' }).optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

/** `GET /geofences/events/summary` (D-0187, flow 07 B9). */
export const GeofenceEventSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['hour', 'day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  geofence_id: positiveId.optional(),
  vehicle_id: positiveId.optional(),
  yard_id: positiveId.optional(),
  top: z.coerce.number().int().min(1).max(50).optional(),
});

const TRIP_STATUS_MESSAGE = 'The selected status is invalid.';

/**
 * `GET /fleet/analytics/trips` (D-0189, flow 07 B5) — the analytics range / interval / compare and the vehicle-scope filters, plus the trip's OWN driver
 * (`driver_id` here is the driver of the trip, unlike the vehicle-scope `driver_id` of the other analytics endpoints, which means the vehicle's current driver),
 * `customer_id`, and the table's `status` / `search` / sort / paging.
 */
export const TripsReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  driver_id: idListParam('driver id'),
  'driver_id[]': idListParam('driver id'),
  customer_id: idListParam('customer id'),
  'customer_id[]': idListParam('customer id'),
  yard_id: positiveId.optional(),
  status: enumListParam(TRIP_STATUSES, TRIP_STATUS_MESSAGE),
  'status[]': enumListParam(TRIP_STATUSES, TRIP_STATUS_MESSAGE),
  sort_by: sortByEnum(TRIP_TABLE_SORT_FIELDS),
  /** How many cancellation reasons `cancellation_reasons.items` lists (default 10). */
  top_reasons: z.coerce.number().int().min(1).max(50).optional(),
  ...listQueryShape,
});

const FUEL_ANOMALY_MESSAGE = 'The selected anomaly type is invalid.';

/**
 * `GET /fleet/analytics/fuel` (D-0190, flow 07 B6) — the analytics range / interval / compare and the vehicle-scope filters (`driver_id` is not offered: a fill has no
 * driver), and for the fills table `vendor`, `payment_method`, `is_full_tank`, `anomaly` / `anomaly_type`, `search`, sort and paging.
 */
export const FuelReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  yard_id: positiveId.optional(),
  vendor: z.string().trim().max(255).optional(),
  payment_method: z.string().trim().max(255).optional(),
  is_full_tank: FlagSchema,
  anomaly: FlagSchema,
  anomaly_type: enumListParam(FUEL_ANOMALY_TYPES, FUEL_ANOMALY_MESSAGE),
  'anomaly_type[]': enumListParam(FUEL_ANOMALY_TYPES, FUEL_ANOMALY_MESSAGE),
  sort_by: sortByEnum(FUEL_TABLE_SORT_FIELDS),
  /** How many vendors `by_vendor.items` lists (default 10). */
  top_vendors: z.coerce.number().int().min(1).max(50).optional(),
  /** How many flagged fills `anomalies.items` lists (default 20). */
  top_anomalies: z.coerce.number().int().min(1).max(100).optional(),
  /** An interval whose economy is more than this many percent below the vehicle's other intervals is flagged (default 30). */
  economy_drop_pct: z.coerce.number().min(1).max(99).optional(),
  ...listQueryShape,
});

/** `GET /fleet/analytics/maintenance` (D-0191, flow 07 B7) — the analytics range / interval / compare and the vehicle-scope filters (no `driver_id`: a log has no driver). */
export const MaintenanceReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  yard_id: positiveId.optional(),
  /** How many service types `by_service_type.items` lists (default 10). */
  top_service_types: z.coerce.number().int().min(1).max(50).optional(),
  /** How many vehicles `top_vehicles.items` lists (default 10). */
  top_vehicles: z.coerce.number().int().min(1).max(50).optional(),
});

const EXPIRY_STATUS_MESSAGE = 'The selected status is invalid.';

/** `GET /fleet/analytics/compliance` (D-0191, flow 07 B7) — point-in-time: no range / compare; `horizon_days` + `interval` shape the `upcoming` series; the rest filters the records table. */
export const ComplianceReportQuerySchema = z.object({
  horizon_days: z.coerce.number().int().min(7).max(365).optional(),
  interval: z.enum(['week', 'month'], { error: 'The selected interval is invalid.' }).optional(),
  kind: z.enum(COMPLIANCE_KINDS, { error: 'The selected kind is invalid.' }).optional(),
  status: enumListParam(EXPIRY_STATUSES, EXPIRY_STATUS_MESSAGE),
  'status[]': enumListParam(EXPIRY_STATUSES, EXPIRY_STATUS_MESSAGE),
  documentable_type: z
    .enum(['vehicle', 'driver'], { error: 'The selected documentable type is invalid.' })
    .optional(),
  document_type: z.string().trim().max(255).optional(),
  sort_by: sortByEnum(COMPLIANCE_TABLE_SORT_FIELDS),
  ...listQueryShape,
});

const INCIDENT_SEVERITY_MESSAGE = 'The selected severity is invalid.';

/**
 * `GET /fleet/analytics/drivers` (D-0193, flow 07 B8) — the analytics range / interval / compare and the vehicle-scope filters; `driver_id` = the trip's / incident's OWN driver
 * (like the trips report), `include_inactive` lists the deactivated drivers without activity too, and the table's `search` / sort / paging.
 */
export const DriversReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  driver_id: idListParam('driver id'),
  'driver_id[]': idListParam('driver id'),
  yard_id: positiveId.optional(),
  include_inactive: FlagSchema,
  sort_by: sortByEnum(DRIVER_TABLE_SORT_FIELDS),
  ...listQueryShape,
});

/** `GET /incidents/summary` (D-0193, flow 07 B8) — the analytics range / interval / compare, the vehicle-scope filters, the incident's own driver, severity and type. */
export const IncidentsSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  cost_centre: z.string().trim().max(255).optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  driver_id: idListParam('driver id'),
  'driver_id[]': idListParam('driver id'),
  yard_id: positiveId.optional(),
  severity: enumListParam(INCIDENT_SEVERITIES, INCIDENT_SEVERITY_MESSAGE),
  'severity[]': enumListParam(INCIDENT_SEVERITIES, INCIDENT_SEVERITY_MESSAGE),
  incident_type: z.string().trim().max(255).optional(),
  /** How many vehicles / drivers `top_vehicles` / `top_drivers` list (default 10). */
  top: z.coerce.number().int().min(1).max(50).optional(),
  /** How many incident types `by_type.items` lists (default 10). */
  top_types: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * `GET /fleet/analytics/utilisation` (D-0194, flow 07 D1 + B4) — the analytics range / interval (`hour` too, up to 168 buckets) / compare and the scope filters shared by the
 * summary endpoint (`driver_id` = the vehicle's CURRENT driver), and the per-vehicle table's `search` / sort / paging.
 */
export const UtilisationReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interval: z
    .enum(['hour', 'day', 'week', 'month'], { error: 'The selected interval is invalid.' })
    .optional(),
  compare: z
    .enum(['none', 'previous_period', 'previous_year'], {
      error: 'The selected compare is invalid.',
    })
    .optional(),
  ...scopeQueryShape,
  sort_by: sortByEnum(UTILISATION_TABLE_SORT_FIELDS),
  ...listQueryShape,
});

for (const [path, summary] of [
  [
    '/fleet/analytics/summary',
    "D-0185 (flow 07 B1): the Overview KPI tiles — fleet_availability, utilisation, on_time_pct, cost_per_km, fuel_economy, open_issues — each with value, previous, delta_abs, delta_pct and the company's target; a per-bucket series for the sparklines; `compare` = none | previous_period | previous_year; scope filters as on /fleet/status-summary",
  ],
  [
    '/fleet/attention',
    'D-0185 (flow 07 B2): ONE merged worklist — fleet alarms, maintenance overdue / due soon, documents and driver licences expired / expiring, trackers silent > 24 h, severe incidents (7 days), planned trips at risk, long yard stays — most severe first; always paged; filters severity, type, yard_days; meta.counts by severity and by type',
  ],
  [
    '/fleet/analytics/yards',
    'D-0187 (flow 07 B9): yard occupancy and activity — summary (yards, slots, occupied now, occupancy %, check-ins / outs, average and longest dwell), a check-in / check-out series per day | week | month, and a paged per-yard table (search, sort_by, sort_order, page, per_page, include_inactive, yard_id); default range last 7 days; dwell = stays checked out in the period',
  ],
  [
    '/geofences/events/summary',
    'D-0187 (flow 07 B9): geofence activity — enter / exit totals, a series per hour | day | week | month (hour up to 168 buckets), the busiest geofences (top 1-50, default 10), busiest bucket; filters geofence_id, vehicle_id, yard_id; the same alert_on visibility as GET /geofences/events; default range last 7 days; 422 above 200000 events',
  ],
  [
    '/fleet/analytics/trips',
    "D-0189 (flow 07 B5): the trips report — summary (trips, completed, cancelled, cancellation rate, on-time %, average delay, average duration, distance and planned-vs-actual variance, each with the previous period when compare is set), a status + on-time series per day | week | month, a completed-trip duration histogram, a delay histogram, cancellation reasons (top N) and a paged trip table with delay minutes; filters vehicle scope, the trip's own driver, customer, status (table only), search",
  ],
  [
    '/fleet/analytics/fuel',
    'D-0190 (flow 07 B6): the fuel report — summary (fills, litres, cost, average price per litre, full-tank economy, fuel cost per km, each with the previous period when compare is set), a litres / cost / price / economy series per day | week | month, breakdowns by vehicle category and by vendor, anomaly flags (fill above the tank capacity, economy drop, odometer going backwards) with a list, and a paged fills table; filters vehicle scope, and for the table vendor, payment method, full tank, anomaly, search',
  ],
  [
    '/fleet/analytics/maintenance',
    'D-0191 (flow 07 B7): the maintenance report — cost, logs, average cost per log, cost per km and vehicles serviced (each with the previous period when compare is set), a cost series per day | week | month, breakdowns by service type, vehicle category and top vehicles, and the point-in-time schedule due buckets (by status and by date window); downtime days are not available (no status history)',
  ],
  [
    '/fleet/analytics/compliance',
    "D-0191 (flow 07 B7): the compliance report — point-in-time counts of the company's documents and driver licences in six expiry classes, the compliance rate (not expired ÷ having an expiry date), by document type and owner type, an upcoming-expiries series per week | month, and a paged records table",
  ],
  [
    '/fleet/analytics/drivers',
    "D-0193 (flow 07 B8): the drivers scorecard — summary (trips, completed, cancellation rate, on-time %, average delay, distance, incidents, severe incidents, incidents per 100 000 km, drivers with trips / incidents, each with the previous period when compare is set), a trips / on-time / incidents series per day | week | month, and a paged per-driver table (search, sort_by, sort_order, page, per_page, include_inactive); filters vehicle scope and the trip's / incident's own driver; idle time and harsh events are not available (no telemetry role)",
  ],
  [
    '/incidents/summary',
    "D-0193 (flow 07 B8): the incidents summary — incidents, severe incidents and share, incidents per 100 000 km, drivers / vehicles involved (each with the previous period when compare is set), a series per severity per day | week | month, by severity, by type (top N), and the vehicles and drivers with the most incidents with their rate per 100 000 km; filters vehicle scope, the incident's own driver, severity, incident_type",
  ],
  [
    '/fleet/analytics/utilisation',
    'D-0194 (flow 07 D1 + B4): GPS-based utilisation from the hourly telemetry rollup — summary (distance, moving / stopped hours, utilisation %, coverage %, moving share, max speed, vehicles reporting, packets; each with the previous period when compare is set), a series per hour | day | week | month, the day-of-week x hour heatmap (share of the vouched-for time spent moving), and a paged per-vehicle table with a trend; scope filters as on /fleet/status-summary; there is no idle figure (no ignition signal)',
  ],
] as const) {
  openApiRegistry.registerPath({
    method: 'get',
    path,
    tags: ['fleet-analytics'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}
registerCsvExportPath(
  '/fleet/analytics/trips/export',
  'fleet-analytics',
  "D-0189 (flow 07 B5): the trips table's own filters / sort, every matching trip as CSV (streamed)"
);
registerCsvExportPath(
  '/fleet/analytics/fuel/export',
  'fleet-analytics',
  "D-0190 (flow 07 B6): the fills table's own filters / sort, every matching fill as CSV (streamed)"
);
registerCsvExportPath(
  '/fleet/analytics/drivers/export',
  'fleet-analytics',
  "D-0193 (flow 07 B8): the drivers table's own filters / sort, every matching driver as CSV (streamed)"
);
registerCsvExportPath(
  '/fleet/analytics/utilisation/export',
  'fleet-analytics',
  "D-0194 (flow 07 B4): the utilisation table's own filters / sort, every matching vehicle as CSV (streamed)"
);
registerCsvExportPath(
  '/fleet/analytics/compliance/export',
  'fleet-analytics',
  "D-0191 (flow 07 B7): the compliance table's own filters / sort, every matching record as CSV (streamed)"
);
