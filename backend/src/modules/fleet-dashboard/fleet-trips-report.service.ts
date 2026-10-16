import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
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
import type { TripReportFilter, TripReportRow, VehicleScope } from './fleet-dashboard.types.js';

type Json = Record<string, unknown>;

/** D-0189 (flow 07 B5): `GET /fleet/analytics/trips` — status series, on-time / delay, duration and delay histograms, cancellation reasons, planned-vs-actual distance and a paged trip table. */
export const TRIP_TABLE_SORT_FIELDS = [
  'period_start',
  'status',
  'vehicle_name',
  'driver_name',
  'delay_minutes',
  'duration_minutes',
  'actual_distance_km',
  'distance_variance_km',
] as const;
export type TripTableSortField = (typeof TRIP_TABLE_SORT_FIELDS)[number];
export const TRIP_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** A guard for the in-memory pass over the period's trips. */
export const MAX_REPORT_TRIPS = 100_000;

/** Completed-trip duration classes, `from` ≤ minutes < `to` (the last one is open-ended). */
export const DURATION_BUCKETS = [
  { key: 'under_30', label: 'Under 30 min', from: 0, to: 30 },
  { key: '30_to_60', label: '30 – 60 min', from: 30, to: 60 },
  { key: '1_to_2_h', label: '1 – 2 h', from: 60, to: 120 },
  { key: '2_to_4_h', label: '2 – 4 h', from: 120, to: 240 },
  { key: '4_to_8_h', label: '4 – 8 h', from: 240, to: 480 },
  { key: '8_h_plus', label: '8 h or more', from: 480, to: null },
] as const;

/** Delay classes on the SIGNED delay (actual end − planned end, minutes; negative = early). */
export const DELAY_BUCKETS = [
  { key: 'early_30_plus', label: 'More than 30 min early' },
  { key: 'early_0_30', label: 'Up to 30 min early, or on the minute' },
  { key: 'late_0_15', label: 'Up to 15 min late' },
  { key: 'late_15_60', label: '15 – 60 min late' },
  { key: 'late_60_240', label: '1 – 4 h late' },
  { key: 'late_240_plus', label: 'More than 4 h late' },
] as const;

export function delayBucketKey(delayMinutes: number): (typeof DELAY_BUCKETS)[number]['key'] {
  if (delayMinutes < -30) return 'early_30_plus';
  if (delayMinutes <= 0) return 'early_0_30';
  if (delayMinutes <= 15) return 'late_0_15';
  if (delayMinutes <= 60) return 'late_15_60';
  if (delayMinutes <= 240) return 'late_60_240';
  return 'late_240_plus';
}

export interface TripsReportQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  /** Vehicle scope (category, cost centre, vehicle ids, yard); its `driverIds` are NOT used — see `driverIds`. */
  scope?: VehicleScope | undefined;
  /** The trips' own drivers. */
  driverIds?: string[] | undefined;
  customerIds?: string[] | undefined;
  /** Narrows the TABLE only — the summary, series and histograms always cover every status. */
  statuses?: TripStatus[] | undefined;
  search?: string | undefined;
  sortBy?: TripTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
  topReasons?: number | undefined;
}

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

const periodStart = (row: TripReportRow): Date | null => row.actualStartAt ?? row.plannedStartAt;

/** On-time judgement (D-0186): only a completed trip with a planned AND an actual end can be judged. `delay` is signed minutes (negative = early). */
export function judgeTrip(
  row: TripReportRow,
  graceMinutes: number
): { delay: number; onTime: boolean } | null {
  if (row.status !== 'completed' || row.plannedEndAt === null || row.actualEndAt === null)
    return null;
  const diffMs = row.actualEndAt.getTime() - row.plannedEndAt.getTime();
  return { delay: round(diffMs / 60_000, 1), onTime: diffMs <= graceMinutes * 60_000 };
}

interface Metrics {
  counts: Record<TripStatus | 'total', number>;
  onTime: number;
  onTimeSample: number;
  delaySum: number;
  durationSum: number;
  durationCount: number;
  plannedKm: number;
  actualKm: number;
  varianceActualKm: number;
  variancePlannedKm: number;
  varianceSample: number;
}

function metricsOf(rows: TripReportRow[], graceMinutes: number): Metrics {
  const m: Metrics = {
    counts: { total: 0, planned: 0, in_progress: 0, completed: 0, cancelled: 0 },
    onTime: 0,
    onTimeSample: 0,
    delaySum: 0,
    durationSum: 0,
    durationCount: 0,
    plannedKm: 0,
    actualKm: 0,
    varianceActualKm: 0,
    variancePlannedKm: 0,
    varianceSample: 0,
  };
  for (const row of rows) {
    m.counts.total += 1;
    m.counts[row.status] += 1;
    const judged = judgeTrip(row, graceMinutes);
    if (judged) {
      m.onTimeSample += 1;
      m.delaySum += judged.delay;
      if (judged.onTime) m.onTime += 1;
    }
    if (row.status === 'completed' && row.durationMinutes !== null) {
      m.durationSum += row.durationMinutes;
      m.durationCount += 1;
    }
    // the dashboard's own distance definitions (D-0183 A2, D-0186): the sums cover the trips that have an actual distance; the variance the trips that have BOTH
    if (row.actualDistanceKm !== null) {
      m.actualKm += row.actualDistanceKm;
      m.plannedKm += row.plannedDistanceKm ?? 0;
      if (row.plannedDistanceKm !== null) {
        m.varianceSample += 1;
        m.varianceActualKm += row.actualDistanceKm;
        m.variancePlannedKm += row.plannedDistanceKm;
      }
    }
  }
  return m;
}

/** The headline figures of a window (the values `summary` compares against the previous window). */
function headline(m: Metrics): Record<string, number | null> {
  const all = m.counts.total;
  return {
    trips_total: m.counts.total,
    trips_completed: m.counts.completed,
    trips_cancelled: m.counts.cancelled,
    cancellation_rate_pct: all > 0 ? round((m.counts.cancelled / all) * 100, 1) : null,
    on_time_pct: m.onTimeSample > 0 ? round((m.onTime / m.onTimeSample) * 100, 1) : null,
    avg_delay_minutes: m.onTimeSample > 0 ? round(m.delaySum / m.onTimeSample, 1) : null,
    avg_duration_minutes: m.durationCount > 0 ? round(m.durationSum / m.durationCount, 1) : null,
    actual_distance_km: round(m.actualKm, 1),
    distance_variance_km:
      m.varianceSample > 0 ? round(m.varianceActualKm - m.variancePlannedKm, 1) : null,
  };
}

interface TableRow {
  row: TripReportRow;
  json: Json;
  vehicleName: string;
  driverName: string;
  delay: number | null;
  variance: number | null;
}

const TABLE_COLUMNS: CsvColumn<TableRow>[] = [
  { header: 'trip_id', value: r => r.row.id },
  { header: 'trip_reference', value: r => r.row.reference },
  { header: 'status', value: r => r.row.status },
  { header: 'vehicle_id', value: r => r.row.vehicleId },
  { header: 'vehicle_name', value: r => r.vehicleName },
  { header: 'driver_id', value: r => r.row.driverId },
  { header: 'driver_name', value: r => r.driverName },
  { header: 'customer_id', value: r => r.row.customerId },
  { header: 'origin_address', value: r => r.row.originAddress },
  { header: 'destination_address', value: r => r.row.destinationAddress },
  { header: 'planned_start_at', value: r => r.row.plannedStartAt },
  { header: 'actual_start_at', value: r => r.row.actualStartAt },
  { header: 'planned_end_at', value: r => r.row.plannedEndAt },
  { header: 'actual_end_at', value: r => r.row.actualEndAt },
  { header: 'delay_minutes', value: r => r.delay },
  { header: 'duration_minutes', value: r => r.row.durationMinutes },
  { header: 'planned_distance_km', value: r => r.row.plannedDistanceKm },
  { header: 'actual_distance_km', value: r => r.row.actualDistanceKm },
  { header: 'distance_variance_km', value: r => r.variance },
  { header: 'cancellation_reason', value: r => r.row.cancellationReason },
];

/** Business logic for the trips report (D-0189, flow 07 ask B5) — a read-only view over `trips`; nothing is stored. */
export class FleetTripsReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async fetch(from: Date, to: Date, filter: TripReportFilter): Promise<TripReportRow[]> {
    const count = await this.repo.countTripsForReport(from, to, filter);
    if (count > MAX_REPORT_TRIPS) {
      throw new ValidationError(
        `This range has ${String(count)} trips; at most ${String(MAX_REPORT_TRIPS)} can be analysed — narrow the range or add a filter.`
      );
    }
    return this.repo.tripsForReport(from, to, filter);
  }

  private async filterOf(query: TripsReportQuery): Promise<TripReportFilter> {
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    return { vehicleIds, driverIds: query.driverIds, customerIds: query.customerIds };
  }

  /** The table rows (all statuses) with names, delay and variance resolved. */
  private async tableRows(
    rows: TripReportRow[],
    tz: string,
    graceMinutes: number
  ): Promise<TableRow[]> {
    const [vehicles, drivers, customers] = await Promise.all([
      this.repo.vehicleBriefs([...new Set(rows.map(r => r.vehicleId))]),
      this.repo.driverNames([...new Set(rows.map(r => r.driverId))]),
      this.repo.customerNames([
        ...new Set(rows.flatMap(r => (r.customerId ? [r.customerId] : []))),
      ]),
    ]);
    return rows.map(row => {
      const vehicle = vehicles.get(row.vehicleId);
      const driverName = drivers.get(row.driverId) ?? '';
      const judged = judgeTrip(row, graceMinutes);
      const variance =
        row.actualDistanceKm !== null && row.plannedDistanceKm !== null
          ? round(row.actualDistanceKm - row.plannedDistanceKm, 1)
          : null;
      const start = periodStart(row);
      return {
        row,
        vehicleName: vehicle?.name ?? '',
        driverName,
        delay: judged ? judged.delay : null,
        variance,
        json: {
          trip_id: row.id,
          trip_reference: row.reference,
          status: row.status,
          vehicle: vehicle ? { id: row.vehicleId, name: vehicle.name, plate: vehicle.plate } : null,
          driver: { id: row.driverId, name: driverName },
          customer: row.customerId
            ? { id: row.customerId, name: customers.get(row.customerId) ?? null }
            : null,
          origin_address: row.originAddress,
          destination_address: row.destinationAddress,
          period_start: start,
          period_date: start ? localIsoDate(start, tz) : null,
          planned_start_at: row.plannedStartAt,
          actual_start_at: row.actualStartAt,
          planned_end_at: row.plannedEndAt,
          actual_end_at: row.actualEndAt,
          delay_minutes: judged ? judged.delay : null,
          on_time: judged ? judged.onTime : null,
          duration_minutes: row.durationMinutes,
          planned_distance_km: row.plannedDistanceKm,
          actual_distance_km: row.actualDistanceKm,
          distance_variance_km: variance,
          cancellation_reason: row.cancellationReason,
        },
      };
    });
  }

  private filteredAndSorted(all: TableRow[], query: TripsReportQuery): TableRow[] {
    const term = query.search?.toLowerCase();
    const rows = all.filter(r => {
      if (query.statuses && !query.statuses.includes(r.row.status)) return false;
      if (!term) return true;
      const hay = [
        r.row.reference,
        r.row.originAddress,
        r.row.destinationAddress,
        r.vehicleName,
        r.driverName,
      ].map(v => (v ?? '').toLowerCase());
      return hay.some(v => v.includes(term));
    });
    const field = query.sortBy ?? 'period_start';
    const sign = (query.sortOrder ?? (query.sortBy ? 'asc' : 'desc')) === 'desc' ? -1 : 1;
    const key = (r: TableRow): number | string | null => {
      switch (field) {
        case 'period_start': {
          const start = periodStart(r.row);
          return start ? start.getTime() : null;
        }
        case 'status':
          return r.row.status;
        case 'vehicle_name':
          return r.vehicleName.toLowerCase();
        case 'driver_name':
          return r.driverName.toLowerCase();
        case 'delay_minutes':
          return r.delay;
        case 'duration_minutes':
          return r.row.durationMinutes;
        case 'actual_distance_km':
          return r.row.actualDistanceKm;
        case 'distance_variance_km':
          return r.variance;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null) return Number(a.row.id) - Number(b.row.id);
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0 ? cmp * sign : (Number(a.row.id) - Number(b.row.id)) * sign;
    });
  }

  /** `GET /fleet/analytics/trips`. */
  async report(query: TripsReportQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const grace = settings.onTimeGraceMinutes;
    const interval = query.interval ?? 'day';
    const compare = query.compare ?? 'none';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets: Bucket[] = generateBuckets(from, to, interval, tz);
    if (buckets.length > MAX_BUCKETS) {
      throw new ValidationError(
        `The range covers ${String(buckets.length)} ${interval} buckets; at most ${String(MAX_BUCKETS)} are allowed — use a larger interval or a shorter range.`
      );
    }
    const filter = await this.filterOf(query);
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [rows, previousRows] = await Promise.all([
      this.fetch(from, to, filter),
      prevWindow ? this.fetch(prevWindow[0], prevWindow[1], filter) : Promise.resolve(null),
    ]);

    const current = metricsOf(rows, grace);
    const previous = previousRows ? headline(metricsOf(previousRows, grace)) : null;
    const currentValues = headline(current);
    const metric = (name: string): Json => {
      const value = currentValues[name] ?? null;
      const prev = previous ? (previous[name] ?? null) : null;
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

    // series: every trip in the bucket of its period start
    const series = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      total: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      judged: 0,
      onTime: 0,
    }));
    const durationCounts = DURATION_BUCKETS.map(() => 0);
    const delayCounts = new Map<string, number>(DELAY_BUCKETS.map(b => [b.key, 0]));
    const reasons = new Map<string, { reason: string | null; count: number }>();
    for (const row of rows) {
      const start = periodStart(row);
      const i = start ? bucketIndex(buckets, start.getTime()) : -1;
      const judged = judgeTrip(row, grace);
      if (i >= 0) {
        const point = series[i] as (typeof series)[number];
        point.total += 1;
        point[row.status] += 1;
        if (judged) {
          point.judged += 1;
          if (judged.onTime) point.onTime += 1;
        }
      }
      // a duration just below zero is a rounding artefact (a trip started and completed in the same second stores -0.01): it counts as "under 30 min"
      const minutes = row.durationMinutes === null ? null : Math.max(0, row.durationMinutes);
      if (row.status === 'completed' && minutes !== null) {
        const d = DURATION_BUCKETS.findIndex(
          b => minutes >= b.from && (b.to === null || minutes < b.to)
        );
        if (d >= 0) durationCounts[d] = (durationCounts[d] ?? 0) + 1;
      }
      if (judged)
        delayCounts.set(
          delayBucketKey(judged.delay),
          (delayCounts.get(delayBucketKey(judged.delay)) ?? 0) + 1
        );
      if (row.status === 'cancelled') {
        const text = row.cancellationReason?.trim() || null;
        const key = text ? text.toLowerCase() : '';
        const entry = reasons.get(key) ?? { reason: text, count: 0 };
        entry.count += 1;
        reasons.set(key, entry);
      }
    }
    const cancelledTotal = current.counts.cancelled;
    const reasonList = [...reasons.values()].sort(
      (a, b) =>
        b.count - a.count ||
        (a.reason === null ? 1 : b.reason === null ? -1 : a.reason.localeCompare(b.reason))
    );
    const topN = query.topReasons ?? 10;
    const pct = (n: number, total: number): number | null =>
      total > 0 ? round((n / total) * 100, 1) : null;

    const table = this.filteredAndSorted(await this.tableRows(rows, tz, grace), query);
    const paging = query.window ?? { page: 1, perPage: 20 };
    const tableCounts: Record<string, number> = {
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const r of table) tableCounts[r.row.status] = (tableCounts[r.row.status] ?? 0) + 1;

    return {
      success: true,
      message: 'Trips report retrieved successfully.',
      data: {
        summary: {
          trips_total: metric('trips_total'),
          trips_completed: metric('trips_completed'),
          trips_cancelled: metric('trips_cancelled'),
          cancellation_rate_pct: metric('cancellation_rate_pct'),
          on_time_pct: { ...metric('on_time_pct'), target: settings.onTimeTargetPct },
          avg_delay_minutes: metric('avg_delay_minutes'),
          avg_duration_minutes: metric('avg_duration_minutes'),
          actual_distance_km: metric('actual_distance_km'),
          distance_variance_km: metric('distance_variance_km'),
          counts: current.counts,
          samples: {
            on_time: current.onTimeSample,
            distance_variance: current.varianceSample,
            duration: current.durationCount,
          },
          late_trips: current.onTimeSample - current.onTime,
          planned_distance_km: round(current.plannedKm, 1),
        },
        series: series.map(p => ({
          bucket: p.bucket,
          total: p.total,
          planned: p.planned,
          in_progress: p.in_progress,
          completed: p.completed,
          cancelled: p.cancelled,
          on_time_pct: p.judged > 0 ? round((p.onTime / p.judged) * 100, 1) : null,
          on_time_sample: p.judged,
        })),
        duration_histogram: DURATION_BUCKETS.map((b, i) => ({
          key: b.key,
          label: b.label,
          from_minutes: b.from,
          to_minutes: b.to,
          count: durationCounts[i] ?? 0,
        })),
        delay_histogram: DELAY_BUCKETS.map(b => ({
          key: b.key,
          label: b.label,
          count: delayCounts.get(b.key) ?? 0,
        })),
        cancellation_reasons: {
          total: cancelledTotal,
          items: reasonList
            .slice(0, topN)
            .map(r => ({ reason: r.reason, count: r.count, pct: pct(r.count, cancelledTotal) })),
          other_count: reasonList.slice(topN).reduce((n, r) => n + r.count, 0),
        },
        table: {
          items: table
            .slice((paging.page - 1) * paging.perPage, paging.page * paging.perPage)
            .map(r => r.json),
          pagination: buildPagination(table.length, paging),
        },
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
        on_time_grace_minutes: grace,
        table_counts: tableCounts,
        basis: {
          period: 'a trip belongs to the period of its actual start, else its planned start',
          on_time:
            'completed trips that have a planned and an actual end; on time = actual end within the company grace of the planned end',
          delay_minutes:
            'actual end minus planned end, signed (negative = early), for the same trips',
          distance:
            'planned / actual sums cover the trips that have an actual distance; the variance the trips that have both',
          cancellation_rate_pct: 'cancelled trips ÷ all trips of the period',
        },
      },
    };
  }

  /** `GET /fleet/analytics/trips/export` — the table's own filters / sort, every matching trip as CSV. */
  async exportRows(query: Omit<TripsReportQuery, 'window'>, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const [from, to] = analyticsRange(query, now, tz);
    const rows = await this.fetch(from, to, await this.filterOf(query));
    const ordered = this.filteredAndSorted(
      await this.tableRows(rows, tz, settings.onTimeGraceMinutes),
      query
    );
    return planExport('trips-report', TABLE_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}
