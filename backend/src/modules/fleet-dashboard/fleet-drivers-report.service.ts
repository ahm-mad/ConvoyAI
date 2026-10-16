import { ValidationError } from '../../platform/errors/app-error.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { localDateOf, startOfLocalDay, utcDatePartsOf } from '../../platform/time/zoned.js';
import { expiryStatusOf } from '../../shared/utils/expiry-buckets.js';
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
import type {
  DriverReportRow,
  IncidentReportRow,
  TripReportRow,
  VehicleScope,
} from './fleet-dashboard.types.js';
import {
  fetchIncidents,
  fetchTrips,
  incidentDateString,
  metricOf,
  per100kKm,
  requireCompany,
  round,
} from './fleet-driver-safety.shared.js';
import { judgeTrip } from './fleet-trips-report.service.js';

type Json = Record<string, unknown>;

/** D-0193 (flow 07 B8): `GET /fleet/analytics/drivers` — the drivers scorecard: trips, distance, on-time, incidents per driver, with a summary, a series and a paged table. */
export const DRIVER_TABLE_SORT_FIELDS = [
  'driver_name',
  'trips_total',
  'trips_completed',
  'cancellation_rate_pct',
  'distance_km',
  'on_time_pct',
  'avg_delay_minutes',
  'incidents',
  'severe_incidents',
  'incidents_per_100k_km',
  'last_incident_date',
] as const;
export type DriverTableSortField = (typeof DRIVER_TABLE_SORT_FIELDS)[number];

export interface DriversReportQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  /** Vehicle scope (category, cost centre, vehicle ids, yard); its `driverIds` are NOT used — see `driverIds`. */
  scope?: VehicleScope | undefined;
  /** Only these drivers. */
  driverIds?: string[] | undefined;
  /** Also list the deactivated (`inactive`) drivers that had no activity in the period. */
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  sortBy?: DriverTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
}

interface Agg {
  planned: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  judged: number;
  onTime: number;
  delaySum: number;
  durationSum: number;
  durationCount: number;
  km: number;
  minor: number;
  moderate: number;
  severe: number;
  lastIncident: Date | null;
}

const emptyAgg = (): Agg => ({
  planned: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  judged: 0,
  onTime: 0,
  delaySum: 0,
  durationSum: 0,
  durationCount: 0,
  km: 0,
  minor: 0,
  moderate: 0,
  severe: 0,
  lastIncident: null,
});
const tripsOf = (a: Agg): number => a.planned + a.in_progress + a.completed + a.cancelled;
const incidentsOf = (a: Agg): number => a.minor + a.moderate + a.severe;

/** Every driver's figures for a window: trips (the trips report's definitions — D-0183 A1, D-0186) and incidents (`incident_date` in the local range). */
function aggregate(
  trips: TripReportRow[],
  incidents: IncidentReportRow[],
  graceMinutes: number
): Map<string, Agg> {
  const map = new Map<string, Agg>();
  const of = (driverId: string): Agg => {
    let a = map.get(driverId);
    if (!a) {
      a = emptyAgg();
      map.set(driverId, a);
    }
    return a;
  };
  for (const trip of trips) {
    const a = of(trip.driverId);
    a[trip.status] += 1;
    const judged = judgeTrip(trip, graceMinutes);
    if (judged) {
      a.judged += 1;
      a.delaySum += judged.delay;
      if (judged.onTime) a.onTime += 1;
    }
    if (trip.status === 'completed' && trip.durationMinutes !== null) {
      a.durationSum += trip.durationMinutes;
      a.durationCount += 1;
    }
    // one distance definition everywhere (the trips report): every trip that has an actual distance
    if (trip.actualDistanceKm !== null) a.km += trip.actualDistanceKm;
  }
  for (const incident of incidents) {
    const a = of(incident.driverId);
    a[incident.severity] += 1;
    if (a.lastIncident === null || incident.incidentDate.getTime() > a.lastIncident.getTime())
      a.lastIncident = incident.incidentDate;
  }
  return map;
}

/** The headline figures of a window (what `summary` compares against the previous window). */
function headline(map: Map<string, Agg>): Record<string, number | null> {
  const t = emptyAgg();
  let withTrips = 0;
  let withIncidents = 0;
  for (const a of map.values()) {
    for (const key of [
      'planned',
      'in_progress',
      'completed',
      'cancelled',
      'judged',
      'onTime',
      'delaySum',
      'durationSum',
      'durationCount',
      'km',
      'minor',
      'moderate',
      'severe',
    ] as const)
      t[key] += a[key];
    if (tripsOf(a) > 0) withTrips += 1;
    if (incidentsOf(a) > 0) withIncidents += 1;
  }
  const trips = tripsOf(t);
  const incidents = incidentsOf(t);
  return {
    trips_total: trips,
    trips_completed: t.completed,
    cancellation_rate_pct: trips > 0 ? round((t.cancelled / trips) * 100, 1) : null,
    on_time_pct: t.judged > 0 ? round((t.onTime / t.judged) * 100, 1) : null,
    avg_delay_minutes: t.judged > 0 ? round(t.delaySum / t.judged, 1) : null,
    distance_km: round(t.km, 1),
    incidents,
    severe_incidents: t.severe,
    incidents_per_100k_km: per100kKm(incidents, t.km),
    drivers_with_trips: withTrips,
    drivers_with_incidents: withIncidents,
  };
}

interface TableRow {
  driver: DriverReportRow;
  agg: Agg;
  json: Json;
  onTimePct: number | null;
  avgDelay: number | null;
  cancellationRate: number | null;
  per100k: number | null;
}

const TABLE_COLUMNS: CsvColumn<TableRow>[] = [
  { header: 'driver_id', value: r => r.driver.id },
  { header: 'driver_name', value: r => r.driver.name },
  { header: 'driver_status', value: r => r.driver.status },
  { header: 'license_number', value: r => r.driver.licenseNumber },
  {
    header: 'license_expiry_date',
    value: r =>
      r.driver.licenseExpiryDate ? incidentDateString(r.driver.licenseExpiryDate) : null,
  },
  { header: 'license_state', value: r => r.json['license_state'] },
  { header: 'trips_total', value: r => tripsOf(r.agg) },
  { header: 'trips_completed', value: r => r.agg.completed },
  { header: 'trips_cancelled', value: r => r.agg.cancelled },
  { header: 'cancellation_rate_pct', value: r => r.cancellationRate },
  { header: 'on_time_pct', value: r => r.onTimePct },
  { header: 'on_time_sample', value: r => r.agg.judged },
  { header: 'avg_delay_minutes', value: r => r.avgDelay },
  { header: 'distance_km', value: r => round(r.agg.km, 1) },
  { header: 'incidents', value: r => incidentsOf(r.agg) },
  { header: 'incidents_minor', value: r => r.agg.minor },
  { header: 'incidents_moderate', value: r => r.agg.moderate },
  { header: 'incidents_severe', value: r => r.agg.severe },
  { header: 'incidents_per_100k_km', value: r => r.per100k },
  {
    header: 'last_incident_date',
    value: r => (r.agg.lastIncident ? incidentDateString(r.agg.lastIncident) : null),
  },
];

/** Business logic for the drivers scorecard (D-0193, flow 07 ask B8, first half) — a read-only view over `trips`, `driver_incidents` and `drivers`; nothing is stored. */
export class FleetDriversReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async windowData(
    from: Date,
    to: Date,
    tz: string,
    vehicleIds: string[] | undefined,
    driverIds: string[] | undefined
  ) {
    const [trips, incidents] = await Promise.all([
      fetchTrips(this.repo, from, to, { vehicleIds, driverIds }),
      fetchIncidents(this.repo, from, to, tz, { vehicleIds, driverIds }),
    ]);
    return { trips, incidents };
  }

  /** The table rows: the drivers to list with their figures resolved. */
  private async tableRows(
    map: Map<string, Agg>,
    query: DriversReportQuery,
    restricted: boolean,
    tz: string,
    now: Date
  ): Promise<TableRow[]> {
    const drivers = await this.repo.driversForReport(query.driverIds);
    const today = localDateOf(now, tz);
    const rows: TableRow[] = [];
    for (const driver of drivers) {
      const agg = map.get(driver.id) ?? emptyAgg();
      const active = tripsOf(agg) + incidentsOf(agg) > 0;
      // with a vehicle scope only the drivers that did something in it are listed; otherwise every driver that is not deactivated, plus deactivated ones with activity (or all with `include_inactive`)
      if (restricted ? !active : driver.status === 'inactive' && !active && !query.includeInactive)
        continue;
      const trips = tripsOf(agg);
      const incidents = incidentsOf(agg);
      const onTimePct = agg.judged > 0 ? round((agg.onTime / agg.judged) * 100, 1) : null;
      const avgDelay = agg.judged > 0 ? round(agg.delaySum / agg.judged, 1) : null;
      const cancellationRate = trips > 0 ? round((agg.cancelled / trips) * 100, 1) : null;
      const per100k = per100kKm(incidents, agg.km);
      rows.push({
        driver,
        agg,
        onTimePct,
        avgDelay,
        cancellationRate,
        per100k,
        json: {
          driver: { id: driver.id, name: driver.name, status: driver.status },
          license_number: driver.licenseNumber,
          license_expiry_date: driver.licenseExpiryDate
            ? incidentDateString(driver.licenseExpiryDate)
            : null,
          license_state: expiryStatusOf(driver.licenseExpiryDate, today),
          trips_total: trips,
          trips_completed: agg.completed,
          trips_cancelled: agg.cancelled,
          trips_in_progress: agg.in_progress,
          trips_planned: agg.planned,
          cancellation_rate_pct: cancellationRate,
          on_time_pct: onTimePct,
          on_time_sample: agg.judged,
          avg_delay_minutes: avgDelay,
          avg_duration_minutes:
            agg.durationCount > 0 ? round(agg.durationSum / agg.durationCount, 1) : null,
          distance_km: round(agg.km, 1),
          incidents,
          incidents_minor: agg.minor,
          incidents_moderate: agg.moderate,
          incidents_severe: agg.severe,
          incidents_per_100k_km: per100k,
          last_incident_date: agg.lastIncident ? incidentDateString(agg.lastIncident) : null,
        },
      });
    }
    return rows;
  }

  private filteredAndSorted(all: TableRow[], query: DriversReportQuery): TableRow[] {
    const term = query.search?.toLowerCase();
    const rows = all.filter(
      r =>
        !term ||
        [r.driver.name, r.driver.licenseNumber ?? ''].some(v => v.toLowerCase().includes(term))
    );
    const field = query.sortBy ?? 'trips_total';
    const sign =
      (query.sortOrder ?? (field === 'driver_name' ? 'asc' : 'desc')) === 'desc' ? -1 : 1;
    const key = (r: TableRow): number | string | null => {
      switch (field) {
        case 'driver_name':
          return r.driver.name.toLowerCase();
        case 'trips_total':
          return tripsOf(r.agg);
        case 'trips_completed':
          return r.agg.completed;
        case 'cancellation_rate_pct':
          return r.cancellationRate;
        case 'distance_km':
          return r.agg.km;
        case 'on_time_pct':
          return r.onTimePct;
        case 'avg_delay_minutes':
          return r.avgDelay;
        case 'incidents':
          return incidentsOf(r.agg);
        case 'severe_incidents':
          return r.agg.severe;
        case 'incidents_per_100k_km':
          return r.per100k;
        case 'last_incident_date':
          return r.agg.lastIncident ? r.agg.lastIncident.getTime() : null;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null)
        return (
          a.driver.name.localeCompare(b.driver.name) || Number(a.driver.id) - Number(b.driver.id)
        );
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0
        ? cmp * sign
        : a.driver.name.localeCompare(b.driver.name) || Number(a.driver.id) - Number(b.driver.id);
    });
  }

  /** `GET /fleet/analytics/drivers`. */
  async report(query: DriversReportQuery, now = new Date()): Promise<Json> {
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
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [current, previous] = await Promise.all([
      this.windowData(from, to, tz, vehicleIds, query.driverIds),
      prevWindow
        ? this.windowData(prevWindow[0], prevWindow[1], tz, vehicleIds, query.driverIds)
        : Promise.resolve(null),
    ]);
    const map = aggregate(current.trips, current.incidents, grace);
    const currentValues = headline(map);
    const previousValues = previous
      ? headline(aggregate(previous.trips, previous.incidents, grace))
      : null;
    const metric = (name: string): Json => metricOf(currentValues, previousValues, name);

    // series: a trip sits in the bucket of its period start, an incident in the bucket of its local date
    const series = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      trips: 0,
      completed: 0,
      cancelled: 0,
      judged: 0,
      onTime: 0,
      incidents: 0,
      severe: 0,
    }));
    for (const trip of current.trips) {
      const start = trip.actualStartAt ?? trip.plannedStartAt;
      const i = start ? bucketIndex(buckets, start.getTime()) : -1;
      if (i < 0) continue;
      const point = series[i] as (typeof series)[number];
      point.trips += 1;
      if (trip.status === 'completed') point.completed += 1;
      if (trip.status === 'cancelled') point.cancelled += 1;
      const judged = judgeTrip(trip, grace);
      if (judged) {
        point.judged += 1;
        if (judged.onTime) point.onTime += 1;
      }
    }
    for (const incident of current.incidents) {
      const i = bucketIndex(
        buckets,
        startOfLocalDay(utcDatePartsOf(incident.incidentDate), tz).getTime()
      );
      if (i < 0) continue;
      const point = series[i] as (typeof series)[number];
      point.incidents += 1;
      if (incident.severity === 'severe') point.severe += 1;
    }

    const restricted = vehicleIds !== undefined;
    const allRows = await this.tableRows(map, query, restricted, tz, now);
    const table = this.filteredAndSorted(allRows, query);
    const paging = query.window ?? { page: 1, perPage: 20 };

    return {
      success: true,
      message: 'Drivers report retrieved successfully.',
      data: {
        summary: {
          trips_total: metric('trips_total'),
          trips_completed: metric('trips_completed'),
          cancellation_rate_pct: metric('cancellation_rate_pct'),
          on_time_pct: { ...metric('on_time_pct'), target: settings.onTimeTargetPct },
          avg_delay_minutes: metric('avg_delay_minutes'),
          distance_km: metric('distance_km'),
          incidents: metric('incidents'),
          severe_incidents: metric('severe_incidents'),
          incidents_per_100k_km: metric('incidents_per_100k_km'),
          drivers_with_trips: metric('drivers_with_trips'),
          drivers_with_incidents: metric('drivers_with_incidents'),
          drivers_listed: allRows.length,
          samples: { on_time: [...map.values()].reduce((n, a) => n + a.judged, 0) },
        },
        series: series.map(p => ({
          bucket: p.bucket,
          trips: p.trips,
          completed: p.completed,
          cancelled: p.cancelled,
          on_time_pct: p.judged > 0 ? round((p.onTime / p.judged) * 100, 1) : null,
          on_time_sample: p.judged,
          incidents: p.incidents,
          severe_incidents: p.severe,
        })),
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
        vehicle_scope: restricted,
        basis: {
          trips:
            "the trips report's definitions: a trip belongs to the period of its actual start, else its planned start, and to the trip's OWN driver; on-time only over completed trips that have a planned and an actual end (null when none); distance = the trips that have an actual distance",
          incidents:
            "incidents whose incident_date (a calendar date) falls in the range, by the incident's own driver; with a vehicle scope only incidents that have a vehicle in the scope",
          incidents_per_100k_km:
            "incidents ÷ the driver's distance × 100 000; null when the distance is 0",
          rows: 'every driver that is not deactivated, plus deactivated drivers with trips or incidents in the period (all of them with include_inactive); with a vehicle scope only the drivers that did something in it',
          not_available:
            'idle time and harsh-driving events (no telemetry role carries them yet — flow 07 D1)',
        },
      },
    };
  }

  /** `GET /fleet/analytics/drivers/export` — the table's own filters / sort, every matching driver as CSV. */
  async exportRows(query: Omit<DriversReportQuery, 'window'>, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const [from, to] = analyticsRange(query, now, tz);
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    const data = await this.windowData(from, to, tz, vehicleIds, query.driverIds);
    const map = aggregate(data.trips, data.incidents, settings.onTimeGraceMinutes);
    const ordered = this.filteredAndSorted(
      await this.tableRows(map, query, vehicleIds !== undefined, tz, now),
      query
    );
    return planExport('drivers-report', TABLE_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}
