import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { localDateOf, localDayOfWeek } from '../../platform/time/zoned.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import { bucketIndex, MAX_HOUR_BUCKETS } from './fleet-activity.service.js';
import { DEFINITION_VERSION, MAX_BUCKETS, type CompareMode } from './fleet-analytics.service.js';
import {
  analyticsRange,
  bucketLabel,
  generateBuckets,
  generateHourBuckets,
  localDaysInRange,
  localIsoDate,
  previousWindowOf,
  type Bucket,
} from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type { VehicleScope } from './fleet-dashboard.types.js';
import type { FleetTelemetryRepository, HourlyStatRow } from './fleet-telemetry.repository.js';
import { maxGapSecondsFor } from './telemetry-rollup.js';

type Json = Record<string, unknown>;

/** D-0194 (flow 07 B4, on the D1 rollup): `GET /fleet/analytics/utilisation` — GPS-based utilisation: distance, moving / stopped hours, the day × hour heatmap and a per-vehicle table. */
export const UTILISATION_TABLE_SORT_FIELDS = [
  'vehicle_name',
  'distance_km',
  'moving_hours',
  'stopped_hours',
  'utilisation_pct',
  'coverage_pct',
  'moving_share_pct',
  'max_speed_kmh',
  'last_packet_at',
] as const;
export type UtilisationTableSortField = (typeof UTILISATION_TABLE_SORT_FIELDS)[number];

/** A guard for the in-memory pass over the stored hours (70 vehicles × 92 days ≈ 155 000 rows). */
export const MAX_REPORT_HOUR_ROWS = 600_000;

export interface UtilisationReportQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'hour' | 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  scope?: VehicleScope | undefined;
  search?: string | undefined;
  sortBy?: UtilisationTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
}

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};
const hoursOf = (seconds: number): number => round(seconds / 3600, 2);

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

interface Totals {
  distanceKm: number;
  movingSeconds: number;
  stoppedSeconds: number;
  packets: number;
  maxSpeed: number | null;
  vehicles: Set<string>;
  lastPacketAt: Date | null;
}
const emptyTotals = (): Totals => ({
  distanceKm: 0,
  movingSeconds: 0,
  stoppedSeconds: 0,
  packets: 0,
  maxSpeed: null,
  vehicles: new Set(),
  lastPacketAt: null,
});
function add(t: Totals, row: HourlyStatRow): void {
  t.distanceKm += row.distanceKm;
  t.movingSeconds += row.movingSeconds;
  t.stoppedSeconds += row.stoppedSeconds;
  t.packets += row.packets;
  if (row.maxSpeedKmh !== null)
    t.maxSpeed = t.maxSpeed === null ? row.maxSpeedKmh : Math.max(t.maxSpeed, row.maxSpeedKmh);
  t.vehicles.add(row.vehicleId);
  if (row.lastPacketAt && (t.lastPacketAt === null || row.lastPacketAt > t.lastPacketAt))
    t.lastPacketAt = row.lastPacketAt;
}
const totalsOf = (rows: HourlyStatRow[]): Totals => {
  const t = emptyTotals();
  for (const row of rows) add(t, row);
  return t;
};

interface Rates {
  utilisationPct: number | null;
  coveragePct: number | null;
  movingSharePct: number | null;
}
/** The percentages of some totals over `vehicles` vehicles and `days` days: utilisation = moving ÷ the scheduled hours, coverage = vouched-for time ÷ 24 h, moving share = moving ÷ vouched-for time. */
function ratesOf(t: Totals, vehicles: number, days: number, scheduledHoursPerDay: number): Rates {
  const covered = t.movingSeconds + t.stoppedSeconds;
  const scheduledSeconds = vehicles * scheduledHoursPerDay * days * 3600;
  const wallSeconds = vehicles * 24 * days * 3600;
  return {
    utilisationPct:
      scheduledSeconds > 0 ? round((t.movingSeconds / scheduledSeconds) * 100, 1) : null,
    coveragePct: wallSeconds > 0 ? round((covered / wallSeconds) * 100, 1) : null,
    movingSharePct: covered > 0 ? round((t.movingSeconds / covered) * 100, 1) : null,
  };
}

interface TableRow {
  vehicle: { id: string; name: string; plate: string | null; category: string | null };
  totals: Totals;
  hasTelemetry: boolean;
  rates: Rates;
  json: Json;
}

const TABLE_COLUMNS: CsvColumn<TableRow>[] = [
  { header: 'vehicle_id', value: r => r.vehicle.id },
  { header: 'vehicle_name', value: r => r.vehicle.name },
  { header: 'plate', value: r => r.vehicle.plate },
  { header: 'category', value: r => r.vehicle.category },
  { header: 'has_telemetry', value: r => r.hasTelemetry },
  { header: 'distance_km', value: r => (r.hasTelemetry ? round(r.totals.distanceKm, 1) : null) },
  { header: 'moving_hours', value: r => (r.hasTelemetry ? hoursOf(r.totals.movingSeconds) : null) },
  {
    header: 'stopped_hours',
    value: r => (r.hasTelemetry ? hoursOf(r.totals.stoppedSeconds) : null),
  },
  { header: 'moving_share_pct', value: r => r.rates.movingSharePct },
  { header: 'coverage_pct', value: r => r.rates.coveragePct },
  { header: 'utilisation_pct', value: r => r.rates.utilisationPct },
  { header: 'max_speed_kmh', value: r => r.totals.maxSpeed },
  { header: 'packets', value: r => (r.hasTelemetry ? r.totals.packets : null) },
  { header: 'last_packet_at', value: r => r.totals.lastPacketAt },
];

/** Business logic for the GPS-based utilisation report (D-0194, flow 07 asks D1 + B4) — a read-only view over the hourly rollup `vehicle_hourly_stats`; nothing is stored here. */
export class FleetUtilisationReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly telemetry: FleetTelemetryRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async fetchHours(from: Date, to: Date, vehicleIds: string[]): Promise<HourlyStatRow[]> {
    if (vehicleIds.length === 0) return [];
    const count = await this.telemetry.countHourStats(from, to, vehicleIds);
    if (count > MAX_REPORT_HOUR_ROWS) {
      throw new ValidationError(
        `This range has ${String(count)} hourly rows; at most ${String(MAX_REPORT_HOUR_ROWS)} can be analysed — narrow the range or add a filter.`
      );
    }
    return this.telemetry.hourStats(from, to, vehicleIds);
  }

  private buckets(
    from: Date,
    to: Date,
    interval: 'hour' | 'day' | 'week' | 'month',
    tz: string
  ): Bucket[] {
    const buckets =
      interval === 'hour' ? generateHourBuckets(from, to) : generateBuckets(from, to, interval, tz);
    const max = interval === 'hour' ? MAX_HOUR_BUCKETS : MAX_BUCKETS;
    if (buckets.length > max) {
      throw new ValidationError(
        `The range covers ${String(buckets.length)} ${interval} buckets; at most ${String(max)} are allowed — use a larger interval or a shorter range.`
      );
    }
    return buckets;
  }

  private tableRows(
    vehicles: { id: string; name: string; plate: string | null; category?: string | null }[],
    rows: HourlyStatRow[],
    buckets: Bucket[],
    days: number,
    scheduled: number
  ): TableRow[] {
    const byVehicle = new Map<string, HourlyStatRow[]>();
    for (const row of rows) {
      const list = byVehicle.get(row.vehicleId);
      if (list) list.push(row);
      else byVehicle.set(row.vehicleId, [row]);
    }
    return vehicles.map(v => {
      const own = byVehicle.get(v.id) ?? [];
      const totals = totalsOf(own);
      const hasTelemetry = own.length > 0;
      const rates = hasTelemetry
        ? ratesOf(totals, 1, days, scheduled)
        : { utilisationPct: null, coveragePct: null, movingSharePct: null };
      const trend = buckets.map(() => 0);
      for (const row of own) {
        const i = bucketIndex(buckets, row.hourStart.getTime());
        if (i >= 0) trend[i] = (trend[i] ?? 0) + row.movingSeconds;
      }
      return {
        vehicle: { id: v.id, name: v.name, plate: v.plate, category: v.category ?? null },
        totals,
        hasTelemetry,
        rates,
        json: {
          vehicle: { id: v.id, name: v.name, plate: v.plate, category: v.category ?? null },
          has_telemetry: hasTelemetry,
          distance_km: hasTelemetry ? round(totals.distanceKm, 1) : null,
          moving_hours: hasTelemetry ? hoursOf(totals.movingSeconds) : null,
          stopped_hours: hasTelemetry ? hoursOf(totals.stoppedSeconds) : null,
          moving_share_pct: rates.movingSharePct,
          coverage_pct: rates.coveragePct,
          utilisation_pct: rates.utilisationPct,
          max_speed_kmh: totals.maxSpeed,
          packets: hasTelemetry ? totals.packets : null,
          last_packet_at: totals.lastPacketAt,
          trend: hasTelemetry ? trend.map(s => hoursOf(s)) : null,
        },
      };
    });
  }

  private filteredAndSorted(all: TableRow[], query: UtilisationReportQuery): TableRow[] {
    const term = query.search?.toLowerCase();
    const rows = all.filter(
      r =>
        !term || [r.vehicle.name, r.vehicle.plate ?? ''].some(v => v.toLowerCase().includes(term))
    );
    const field = query.sortBy ?? 'moving_hours';
    const sign =
      (query.sortOrder ?? (field === 'vehicle_name' ? 'asc' : 'desc')) === 'desc' ? -1 : 1;
    const key = (r: TableRow): number | string | null => {
      if (field === 'vehicle_name') return r.vehicle.name.toLowerCase();
      if (!r.hasTelemetry) return null;
      switch (field) {
        case 'distance_km':
          return r.totals.distanceKm;
        case 'moving_hours':
          return r.totals.movingSeconds;
        case 'stopped_hours':
          return r.totals.stoppedSeconds;
        case 'utilisation_pct':
          return r.rates.utilisationPct;
        case 'coverage_pct':
          return r.rates.coveragePct;
        case 'moving_share_pct':
          return r.rates.movingSharePct;
        case 'max_speed_kmh':
          return r.totals.maxSpeed;
        case 'last_packet_at':
          return r.totals.lastPacketAt ? r.totals.lastPacketAt.getTime() : null;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null)
        return (
          a.vehicle.name.localeCompare(b.vehicle.name) ||
          Number(a.vehicle.id) - Number(b.vehicle.id)
        );
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0
        ? cmp * sign
        : a.vehicle.name.localeCompare(b.vehicle.name) ||
            Number(a.vehicle.id) - Number(b.vehicle.id);
    });
  }

  /** `GET /fleet/analytics/utilisation`. */
  async report(query: UtilisationReportQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const scheduled = settings.scheduledHoursPerVehiclePerDay;
    const interval = query.interval ?? 'day';
    const compare = query.compare ?? 'none';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets = this.buckets(from, to, interval, tz);
    const vehicles = await this.repo.vehiclesForCompany(query.scope ?? {});
    const vehicleIds = vehicles.map(v => v.id);
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [rows, previousRows, latestHour] = await Promise.all([
      this.fetchHours(from, to, vehicleIds),
      prevWindow
        ? this.fetchHours(prevWindow[0], prevWindow[1], vehicleIds)
        : Promise.resolve(null),
      this.telemetry.latestRolledHour(),
    ]);
    const days = localDaysInRange(from, to, tz);
    const current = totalsOf(rows);
    const headline = (t: Totals, d: number): Record<string, number | null> => {
      const rates = ratesOf(t, t.vehicles.size, d, scheduled);
      return {
        distance_km: round(t.distanceKm, 1),
        moving_hours: hoursOf(t.movingSeconds),
        stopped_hours: hoursOf(t.stoppedSeconds),
        utilisation_pct: rates.utilisationPct,
        coverage_pct: rates.coveragePct,
        moving_share_pct: rates.movingSharePct,
        max_speed_kmh: t.maxSpeed,
        vehicles_reporting: t.vehicles.size,
        packets: t.packets,
      };
    };
    const currentValues = headline(current, days);
    const previousValues =
      previousRows && prevWindow
        ? headline(totalsOf(previousRows), localDaysInRange(prevWindow[0], prevWindow[1], tz))
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

    // series: an hour row sits in the bucket of its UTC hour start; the vehicle set is the range's, so buckets are comparable
    const bucketTotals = buckets.map(() => emptyTotals());
    for (const row of rows) {
      const i = bucketIndex(buckets, row.hourStart.getTime());
      if (i >= 0) add(bucketTotals[i] as Totals, row);
    }
    const series = buckets.map((bucket, i) => {
      const t = bucketTotals[i] as Totals;
      const bucketDays =
        interval === 'hour' ? 1 / 24 : localDaysInRange(bucket.from, bucket.to, tz);
      const rates = ratesOf(t, current.vehicles.size, bucketDays, scheduled);
      return {
        bucket: bucketLabel(bucket, interval, tz),
        distance_km: round(t.distanceKm, 1),
        moving_hours: hoursOf(t.movingSeconds),
        stopped_hours: hoursOf(t.stoppedSeconds),
        utilisation_pct: current.vehicles.size > 0 ? rates.utilisationPct : null,
        coverage_pct: current.vehicles.size > 0 ? rates.coveragePct : null,
        vehicles_reporting: t.vehicles.size,
        packets: t.packets,
      };
    });

    // heatmap: local day of week (1 = Monday … 7 = Sunday) × local hour of the day; a cell is the share of its vouched-for time spent moving
    const cells = new Map<string, { moving: number; covered: number }>();
    const hourFormat = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    for (const row of rows) {
      const wall = localDateOf(row.hourStart, tz);
      const dow = ((localDayOfWeek(wall) + 6) % 7) + 1;
      const hour = Number(hourFormat.format(row.hourStart));
      const key = `${String(dow)}-${String(hour)}`;
      const cell = cells.get(key) ?? { moving: 0, covered: 0 };
      cell.moving += row.movingSeconds;
      cell.covered += row.movingSeconds + row.stoppedSeconds;
      cells.set(key, cell);
    }
    const heatmap: Json[] = [];
    for (let dow = 1; dow <= 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const cell = cells.get(`${String(dow)}-${String(hour)}`);
        heatmap.push({
          dow,
          hour,
          moving_pct:
            cell && cell.covered > 0 ? round((cell.moving / cell.covered) * 100, 1) : null,
          moving_hours: cell ? hoursOf(cell.moving) : 0,
          covered_hours: cell ? hoursOf(cell.covered) : 0,
        });
      }
    }

    const all = this.tableRows(vehicles, rows, buckets, days, scheduled);
    const table = this.filteredAndSorted(all, query);
    const paging = query.window ?? { page: 1, perPage: 20 };
    const withTelemetry = all.filter(r => r.hasTelemetry).length;

    return {
      success: true,
      message: 'Utilisation report retrieved successfully.',
      data: {
        summary: {
          distance_km: metric('distance_km'),
          moving_hours: metric('moving_hours'),
          stopped_hours: metric('stopped_hours'),
          utilisation_pct: { ...metric('utilisation_pct'), target: settings.utilisationTargetPct },
          coverage_pct: metric('coverage_pct'),
          moving_share_pct: metric('moving_share_pct'),
          max_speed_kmh: metric('max_speed_kmh'),
          vehicles_reporting: metric('vehicles_reporting'),
          packets: metric('packets'),
          covered_hours: hoursOf(current.movingSeconds + current.stoppedSeconds),
        },
        series,
        heatmap,
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
        scheduled_hours_per_vehicle_per_day: scheduled,
        data_quality: {
          vehicles_total: vehicles.length,
          vehicles_with_telemetry: withTelemetry,
          rollup_latest_hour: latestHour ? latestHour.toISOString() : null,
          default_gap_limit_minutes: maxGapSecondsFor(settings.positionFreshnessMinutes) / 60,
          gap_limit_rule:
            "2.5 × the device's typical report interval, between 5 minutes and 6 hours; the default gap limit when the interval is unknown",
          moving_threshold_kmh: 2,
          idle_available: false,
        },
        basis: {
          source:
            'the hourly rollup of the GPS packets (vehicle_hourly_stats), attributed to the vehicle the device was assigned to at that moment; the rollup job runs every 15 minutes',
          moving_stopped:
            "the time between two consecutive packets is vouched for only when the gap is at most the gap limit (2.5 × the device's own typical report interval, 5 min – 6 h — so an hourly tracker still counts); it is moving when the earlier packet's speed is above 2 km/h, otherwise stopped. Idle time cannot be told from parked time without an ignition signal, so there is no idle figure",
          utilisation_pct:
            'moving hours ÷ (vehicles that have telemetry × scheduled hours per vehicle per day × local days)',
          coverage_pct:
            'vouched-for hours ÷ (vehicles that have telemetry × 24 h × local days) — how much of the time the packets can speak for',
          distance_km:
            'straight-line distance between consecutive covered packets (an under-estimate on winding roads); GPS jumps and stationary drift add none',
        },
      },
    };
  }

  /** `GET /fleet/analytics/utilisation/export` — the table's own filters / sort, every matching vehicle as CSV. */
  async exportRows(query: Omit<UtilisationReportQuery, 'window'>, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets = this.buckets(from, to, interval, tz);
    const vehicles = await this.repo.vehiclesForCompany(query.scope ?? {});
    const rows = await this.fetchHours(
      from,
      to,
      vehicles.map(v => v.id)
    );
    const ordered = this.filteredAndSorted(
      this.tableRows(
        vehicles,
        rows,
        buckets,
        localDaysInRange(from, to, tz),
        settings.scheduledHoursPerVehiclePerDay
      ),
      query
    );
    return planExport('utilisation-report', TABLE_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}
