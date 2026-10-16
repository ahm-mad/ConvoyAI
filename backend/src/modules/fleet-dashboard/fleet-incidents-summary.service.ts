import { ValidationError } from '../../platform/errors/app-error.js';
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
import type { IncidentReportRow, TripReportRow, VehicleScope } from './fleet-dashboard.types.js';
import {
  INCIDENT_SEVERITIES,
  fetchIncidents,
  fetchTrips,
  metricOf,
  per100kKm,
  requireCompany,
  round,
  type IncidentSeverity,
} from './fleet-driver-safety.shared.js';

type Json = Record<string, unknown>;

/** D-0193 (flow 07 B8): `GET /incidents/summary` — incidents by severity / type / period, per 100 000 km, and the vehicles and drivers with the most incidents. */
export interface IncidentsSummaryQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  /** Vehicle scope (category, cost centre, vehicle ids, yard); its `driverIds` are NOT used — see `driverIds`. */
  scope?: VehicleScope | undefined;
  /** The incident's own driver. */
  driverIds?: string[] | undefined;
  severities?: IncidentSeverity[] | undefined;
  /** Case-insensitive exact match on `incident_type`. */
  incidentType?: string | undefined;
  top?: number | undefined;
  topTypes?: number | undefined;
}

interface Totals {
  incidents: number;
  severe: number;
  drivers: Set<string>;
  vehicles: Set<string>;
  withoutVehicle: number;
}

const emptyTotals = (): Totals => ({
  incidents: 0,
  severe: 0,
  drivers: new Set(),
  vehicles: new Set(),
  withoutVehicle: 0,
});

function totalsOf(rows: IncidentReportRow[]): Totals {
  const t = emptyTotals();
  for (const row of rows) {
    t.incidents += 1;
    if (row.severity === 'severe') t.severe += 1;
    t.drivers.add(row.driverId);
    if (row.vehicleId) t.vehicles.add(row.vehicleId);
    else t.withoutVehicle += 1;
  }
  return t;
}

const kmOf = (trips: TripReportRow[]): number =>
  trips.reduce((n, trip) => n + (trip.actualDistanceKm ?? 0), 0);

/** Business logic for the incidents summary (D-0193, flow 07 ask B8, second half) — a read-only view over `driver_incidents` (+ the trips' distance for the rate); nothing is stored. */
export class FleetIncidentsSummaryService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async windowData(
    from: Date,
    to: Date,
    tz: string,
    vehicleIds: string[] | undefined,
    driverIds: string[] | undefined,
    query: IncidentsSummaryQuery
  ) {
    const [trips, incidents] = await Promise.all([
      fetchTrips(this.repo, from, to, { vehicleIds, driverIds }),
      fetchIncidents(this.repo, from, to, tz, { vehicleIds, driverIds }),
    ]);
    const type = query.incidentType?.trim().toLowerCase();
    // severity / type narrow the incidents only — the distance behind the rate is the scope's, whatever kind of incident
    const filtered = incidents.filter(
      i =>
        (!query.severities || query.severities.includes(i.severity)) &&
        (!type || i.incidentType.trim().toLowerCase() === type)
    );
    return { trips, incidents: filtered };
  }

  private headline(rows: IncidentReportRow[], km: number): Record<string, number | null> {
    const t = totalsOf(rows);
    return {
      incidents: t.incidents,
      severe_incidents: t.severe,
      severe_share_pct: t.incidents > 0 ? round((t.severe / t.incidents) * 100, 1) : null,
      incidents_per_100k_km: per100kKm(t.incidents, km),
      distance_km: round(km, 1),
      drivers_involved: t.drivers.size,
      vehicles_involved: t.vehicles.size,
    };
  }

  /** `GET /incidents/summary`. */
  async summary(query: IncidentsSummaryQuery, now = new Date()): Promise<Json> {
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
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [current, previous] = await Promise.all([
      this.windowData(from, to, tz, vehicleIds, query.driverIds, query),
      prevWindow
        ? this.windowData(prevWindow[0], prevWindow[1], tz, vehicleIds, query.driverIds, query)
        : Promise.resolve(null),
    ]);
    const km = kmOf(current.trips);
    const currentValues = this.headline(current.incidents, km);
    const previousValues = previous
      ? this.headline(previous.incidents, kmOf(previous.trips))
      : null;
    const metric = (name: string): Json => metricOf(currentValues, previousValues, name);
    const total = current.incidents.length;
    const pct = (n: number): number | null => (total > 0 ? round((n / total) * 100, 1) : null);

    // series: an incident sits in the bucket of its (local) incident date
    const series = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      total: 0,
      minor: 0,
      moderate: 0,
      severe: 0,
    }));
    const bySeverity = new Map<IncidentSeverity, number>(INCIDENT_SEVERITIES.map(s => [s, 0]));
    const byType = new Map<string, { type: string; count: number; severe: number }>();
    const byVehicle = new Map<string, { count: number; severe: number }>();
    const byDriver = new Map<string, { count: number; severe: number }>();
    for (const incident of current.incidents) {
      const i = bucketIndex(
        buckets,
        startOfLocalDay(utcDatePartsOf(incident.incidentDate), tz).getTime()
      );
      if (i >= 0) {
        const point = series[i] as (typeof series)[number];
        point.total += 1;
        point[incident.severity] += 1;
      }
      bySeverity.set(incident.severity, (bySeverity.get(incident.severity) ?? 0) + 1);
      const type = incident.incidentType.trim();
      const typeKey = type.toLowerCase();
      const t = byType.get(typeKey) ?? { type, count: 0, severe: 0 };
      t.count += 1;
      if (incident.severity === 'severe') t.severe += 1;
      byType.set(typeKey, t);
      if (incident.vehicleId) {
        const v = byVehicle.get(incident.vehicleId) ?? { count: 0, severe: 0 };
        v.count += 1;
        if (incident.severity === 'severe') v.severe += 1;
        byVehicle.set(incident.vehicleId, v);
      }
      const d = byDriver.get(incident.driverId) ?? { count: 0, severe: 0 };
      d.count += 1;
      if (incident.severity === 'severe') d.severe += 1;
      byDriver.set(incident.driverId, d);
    }

    // distance per vehicle / driver (the same scope) for the rates
    const kmByVehicle = new Map<string, number>();
    const kmByDriver = new Map<string, number>();
    for (const trip of current.trips) {
      if (trip.actualDistanceKm === null) continue;
      kmByVehicle.set(
        trip.vehicleId,
        (kmByVehicle.get(trip.vehicleId) ?? 0) + trip.actualDistanceKm
      );
      kmByDriver.set(trip.driverId, (kmByDriver.get(trip.driverId) ?? 0) + trip.actualDistanceKm);
    }
    const top = query.top ?? 10;
    const topTypes = query.topTypes ?? 10;
    const typeList = [...byType.values()].sort(
      (a, b) => b.count - a.count || b.severe - a.severe || a.type.localeCompare(b.type)
    );
    const ranked = (map: Map<string, { count: number; severe: number }>) =>
      [...map.entries()]
        .sort(
          (a, b) =>
            b[1].count - a[1].count || b[1].severe - a[1].severe || Number(a[0]) - Number(b[0])
        )
        .slice(0, top);
    const rankedVehicles = ranked(byVehicle);
    const rankedDrivers = ranked(byDriver);
    const [vehicles, drivers] = await Promise.all([
      this.repo.vehicleBriefs(rankedVehicles.map(([id]) => id)),
      this.repo.driverNames(rankedDrivers.map(([id]) => id)),
    ]);

    return {
      success: true,
      message: 'Incidents summary retrieved successfully.',
      data: {
        summary: {
          incidents: metric('incidents'),
          severe_incidents: metric('severe_incidents'),
          severe_share_pct: metric('severe_share_pct'),
          incidents_per_100k_km: metric('incidents_per_100k_km'),
          distance_km: metric('distance_km'),
          drivers_involved: metric('drivers_involved'),
          vehicles_involved: metric('vehicles_involved'),
          without_vehicle: totalsOf(current.incidents).withoutVehicle,
        },
        series: series.map(p => ({
          bucket: p.bucket,
          total: p.total,
          minor: p.minor,
          moderate: p.moderate,
          severe: p.severe,
        })),
        by_severity: INCIDENT_SEVERITIES.map(severity => ({
          severity,
          count: bySeverity.get(severity) ?? 0,
          pct: pct(bySeverity.get(severity) ?? 0),
        })),
        by_type: {
          total,
          items: typeList.slice(0, topTypes).map(t => ({
            incident_type: t.type,
            count: t.count,
            severe_incidents: t.severe,
            pct: pct(t.count),
          })),
          other_count: typeList.slice(topTypes).reduce((n, t) => n + t.count, 0),
        },
        top_vehicles: rankedVehicles.map(([id, v]) => {
          const distance = kmByVehicle.get(id) ?? 0;
          const brief = vehicles.get(id);
          return {
            vehicle: { id, name: brief?.name ?? null, plate: brief?.plate ?? null },
            incidents: v.count,
            severe_incidents: v.severe,
            distance_km: round(distance, 1),
            incidents_per_100k_km: per100kKm(v.count, distance),
          };
        }),
        top_drivers: rankedDrivers.map(([id, d]) => {
          const distance = kmByDriver.get(id) ?? 0;
          return {
            driver: { id, name: drivers.get(id) ?? null },
            incidents: d.count,
            severe_incidents: d.severe,
            distance_km: round(distance, 1),
            incidents_per_100k_km: per100kKm(d.count, distance),
          };
        }),
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
        vehicle_scope: vehicleIds !== undefined,
        basis: {
          incidents:
            "incidents whose incident_date (a calendar date) falls in the range; driver_id = the incident's own driver; with a vehicle scope only incidents that have a vehicle in the scope; severity / incident_type narrow the incidents",
          incidents_per_100k_km:
            "incidents ÷ the distance of the trips of the same period and scope × 100 000 (distance = the trips that have an actual distance, the trips report's definition); null when the distance is 0; severity / incident_type do not change the distance",
          top_vehicles:
            'only incidents that have a vehicle; ranked by incidents, then severe incidents',
          without_vehicle: 'incidents of the period that carry no vehicle',
        },
      },
    };
  }
}
