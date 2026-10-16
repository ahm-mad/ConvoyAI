import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { startOfLocalDay, utcDatePartsOf } from '../../platform/time/zoned.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import { bucketIndex } from './fleet-activity.service.js';
import { DEFINITION_VERSION, MAX_BUCKETS, type CompareMode } from './fleet-analytics.service.js';
import {
  analyticsRange,
  bucketLabel,
  generateBuckets,
  localIsoDate,
  previousWindowOf,
  type Bucket,
} from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type { MaintenanceReportRow, VehicleScope } from './fleet-dashboard.types.js';

type Json = Record<string, unknown>;

/** D-0191 (flow 07 B7): the schedule due states of a vehicle scope — implemented by `FleetMaintenanceDueService` (interface-typed, CONVENTIONS.md "Modules"). */
export interface MaintenanceDueStatesLookup {
  dueStatesFor(
    vehicleIds: string[] | undefined,
    now: Date
  ): Promise<
    {
      scheduleId: string;
      vehicleId: string;
      status: 'overdue' | 'due_soon' | 'ok' | 'unknown';
      daysUntilDue: number | null;
    }[]
  >;
}

/** A guard for the in-memory pass over the period's logs. */
export const MAX_REPORT_MAINTENANCE_LOGS = 200_000;

export interface MaintenanceReportQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  scope?: VehicleScope | undefined;
  topServiceTypes?: number | undefined;
  topVehicles?: number | undefined;
}

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

interface Totals {
  logs: number;
  cost: number;
  withCost: number;
  vehicles: Set<string>;
}

const emptyTotals = (): Totals => ({ logs: 0, cost: 0, withCost: 0, vehicles: new Set() });

function add(t: Totals, row: MaintenanceReportRow): void {
  t.logs += 1;
  t.vehicles.add(row.vehicleId);
  if (row.cost !== null) {
    t.cost += row.cost;
    t.withCost += 1;
  }
}

const totalsOf = (rows: MaintenanceReportRow[]): Totals => {
  const t = emptyTotals();
  for (const row of rows) add(t, row);
  return t;
};

/** Business logic for the maintenance report (D-0191, flow 07 ask B7, first half) — a read-only view over `vehicle_maintenance_logs` and the computed schedule due states; nothing is stored. */
export class FleetMaintenanceReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup,
    private readonly dueLookup: MaintenanceDueStatesLookup
  ) {}

  private async fetch(
    from: Date,
    to: Date,
    tz: string,
    vehicleIds: string[] | undefined
  ): Promise<MaintenanceReportRow[]> {
    return this.repo.maintenanceLogsForReport(from, to, tz, vehicleIds);
  }

  private headline(t: Totals, tripKm: number): Record<string, number | null> {
    return {
      maintenance_cost: round(t.cost, 2),
      logs: t.logs,
      avg_cost_per_log: t.withCost > 0 ? round(t.cost / t.withCost, 2) : null,
      cost_per_km: t.cost > 0 && tripKm > 0 ? round(t.cost / tripKm, 2) : null,
      vehicles_serviced: t.vehicles.size,
    };
  }

  /** `GET /fleet/analytics/maintenance`. */
  async report(query: MaintenanceReportQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const compare = query.compare ?? 'none';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets: Bucket[] = generateBuckets(from, to, interval, tz);
    if (buckets.length > MAX_BUCKETS) {
      throw new ValidationError(
        `The range covers ${String(buckets.length)} ${interval} buckets; at most ${String(MAX_BUCKETS)} are allowed — use a larger interval or a shorter range.`
      );
    }
    const scope = query.scope ?? {};
    const vehicleIds = await this.repo.vehicleIdsForScope(scope);
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [rows, previousRows, tripAgg, previousTripAgg, dueStates, availability] =
      await Promise.all([
        this.fetch(from, to, tz, vehicleIds),
        prevWindow
          ? this.fetch(prevWindow[0], prevWindow[1], tz, vehicleIds)
          : Promise.resolve(null),
        this.repo.completedTripsAggInRange(from, to, vehicleIds),
        prevWindow
          ? this.repo.completedTripsAggInRange(prevWindow[0], prevWindow[1], vehicleIds)
          : Promise.resolve(null),
        this.dueLookup.dueStatesFor(vehicleIds, now),
        this.repo.availabilityCounts(scope),
      ]);
    if (rows.length > MAX_REPORT_MAINTENANCE_LOGS) {
      throw new ValidationError(
        `This range has ${String(rows.length)} maintenance logs; at most ${String(MAX_REPORT_MAINTENANCE_LOGS)} can be analysed — narrow the range or add a filter.`
      );
    }
    const current = totalsOf(rows);
    const currentValues = this.headline(current, tripAgg.totalKm);
    const previousValues =
      previousRows && previousTripAgg
        ? this.headline(totalsOf(previousRows), previousTripAgg.totalKm)
        : null;
    const metric = (name: string): Json => {
      const value = currentValues[name] ?? null;
      const prev = previousValues ? (previousValues[name] ?? null) : null;
      const deltaAbs = value !== null && prev !== null ? round(value - prev, 2) : null;
      return {
        value,
        previous: prev,
        delta_abs: deltaAbs,
        delta_pct:
          deltaAbs !== null && prev !== null && prev !== 0
            ? round((deltaAbs / Math.abs(prev)) * 100, 1)
            : null,
      };
    };

    // series: a log sits in the bucket of its (local) service date
    const bucketTotals = buckets.map(() => emptyTotals());
    for (const row of rows) {
      const i = bucketIndex(
        buckets,
        startOfLocalDay(utcDatePartsOf(row.serviceDate), tz).getTime()
      );
      if (i >= 0) add(bucketTotals[i] as Totals, row);
    }

    const share = (cost: number): number | null =>
      current.cost > 0 ? round((cost / current.cost) * 100, 1) : null;
    const byType = new Map<string, { serviceType: string; totals: Totals }>();
    const byCategory = new Map<string, { category: string | null; totals: Totals }>();
    const byVehicle = new Map<
      string,
      { vehicleId: string; name: string; plate: string | null; totals: Totals }
    >();
    for (const row of rows) {
      const type = row.serviceType.trim();
      const typeKey = type.toLowerCase();
      const t = byType.get(typeKey) ?? { serviceType: type, totals: emptyTotals() };
      add(t.totals, row);
      byType.set(typeKey, t);
      const catKey = row.vehicle.category ?? '';
      const c = byCategory.get(catKey) ?? { category: row.vehicle.category, totals: emptyTotals() };
      add(c.totals, row);
      byCategory.set(catKey, c);
      const v = byVehicle.get(row.vehicleId) ?? {
        vehicleId: row.vehicleId,
        name: row.vehicle.name,
        plate: row.vehicle.plate,
        totals: emptyTotals(),
      };
      add(v.totals, row);
      byVehicle.set(row.vehicleId, v);
    }
    const brief = (t: Totals): Json => ({
      logs: t.logs,
      cost: round(t.cost, 2),
      avg_cost: t.withCost > 0 ? round(t.cost / t.withCost, 2) : null,
      share_pct: share(t.cost),
    });
    const types = [...byType.values()].sort(
      (a, b) =>
        b.totals.cost - a.totals.cost ||
        b.totals.logs - a.totals.logs ||
        a.serviceType.localeCompare(b.serviceType)
    );
    const categories = [...byCategory.values()].sort(
      (a, b) =>
        b.totals.cost - a.totals.cost ||
        b.totals.logs - a.totals.logs ||
        (a.category ?? '').localeCompare(b.category ?? '')
    );
    const vehicles = [...byVehicle.values()].sort(
      (a, b) =>
        b.totals.cost - a.totals.cost ||
        b.totals.logs - a.totals.logs ||
        Number(a.vehicleId) - Number(b.vehicleId)
    );
    const topTypes = query.topServiceTypes ?? 10;
    const topVehicles = query.topVehicles ?? 10;

    // schedules: point-in-time (the computed due state of C1) — by status and by date window
    const byStatus = { overdue: 0, due_soon: 0, ok: 0, unknown: 0 };
    const byWindow = { overdue: 0, due_0_7: 0, due_8_30: 0, later: 0, unknown: 0 };
    for (const s of dueStates) {
      byStatus[s.status] += 1;
      if (s.status === 'overdue') byWindow.overdue += 1;
      else if (s.status === 'unknown') byWindow.unknown += 1;
      else if (s.daysUntilDue !== null && s.daysUntilDue <= 7) byWindow.due_0_7 += 1;
      else if (s.daysUntilDue !== null && s.daysUntilDue <= 30) byWindow.due_8_30 += 1;
      else byWindow.later += 1;
    }
    const known = byStatus.overdue + byStatus.due_soon + byStatus.ok;

    return {
      success: true,
      message: 'Maintenance report retrieved successfully.',
      data: {
        summary: {
          maintenance_cost: metric('maintenance_cost'),
          logs: metric('logs'),
          avg_cost_per_log: metric('avg_cost_per_log'),
          cost_per_km: metric('cost_per_km'),
          vehicles_serviced: metric('vehicles_serviced'),
          samples: { logs_with_cost: current.withCost },
        },
        series: buckets.map((bucket, i) => {
          const t = bucketTotals[i] as Totals;
          return {
            bucket: bucketLabel(bucket, interval, tz),
            logs: t.logs,
            cost: round(t.cost, 2),
            vehicles: t.vehicles.size,
          };
        }),
        by_service_type: {
          items: types
            .slice(0, topTypes)
            .map(t => ({ service_type: t.serviceType, ...brief(t.totals) })),
          other_count: Math.max(0, types.length - topTypes),
        },
        by_vehicle_category: categories.map(c => ({
          category: c.category,
          vehicles: c.totals.vehicles.size,
          ...brief(c.totals),
        })),
        top_vehicles: {
          items: vehicles.slice(0, topVehicles).map(v => ({
            vehicle: { id: v.vehicleId, name: v.name, plate: v.plate },
            ...brief(v.totals),
          })),
          other_count: Math.max(0, vehicles.length - topVehicles),
        },
        schedules: {
          total: dueStates.length,
          by_status: byStatus,
          by_due_window: byWindow,
          overdue_pct: known > 0 ? round((byStatus.overdue / known) * 100, 1) : null,
        },
        fleet: { vehicles_in_maintenance_now: availability.inMaintenance },
        ...(prevWindow
          ? {
              previous_period: {
                from: localIsoDate(prevWindow[0], tz),
                to: localIsoDate(prevWindow[1], tz),
              },
            }
          : {}),
      },
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        interval,
        compare,
        generated_at: now.toISOString(),
        definition_version: DEFINITION_VERSION,
        due_soon_days: settings.maintenanceDueSoonDays,
        due_soon_km: settings.maintenanceDueSoonKm,
        basis: {
          period:
            'a log belongs to the local calendar date of its service_date; every vehicle of the scope counts for the costs, retired / sold ones included',
          cost: 'the sum of the logs that carry a cost; the average is over those logs',
          cost_per_km: "maintenance cost ÷ the completed trips' distance of the same range",
          schedules:
            'point-in-time (the computed due state of GET /maintenance-schedules) for the vehicles in service in scope; by_due_window is by date — overdue, due in 0-7 days, 8-30 days, later (also a schedule due by odometer only), unknown',
          downtime:
            "downtime days are NOT available — the API stores only a vehicle's current lifecycle status, no status history; vehicles_in_maintenance_now is the point-in-time count",
        },
      },
    };
  }
}
