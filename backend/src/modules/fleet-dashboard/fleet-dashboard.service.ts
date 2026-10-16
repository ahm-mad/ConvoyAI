import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError } from '../../platform/errors/app-error.js';
import { isOffline } from '../../shared/utils/offline.js';
import { fromJsDate, toRelative } from '../../shared/utils/dates.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import type { FleetSettings, FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import {
  classifyTripDistance,
  determineVehicleStatus,
  dominantDistanceSource,
  fullTankEconomyByVehicle,
  generateBuckets,
  localDaysInRange,
  localIsoDate,
  parseDateRange,
  parseTrendsRange,
  sortAlarmsByStateThenRecency,
  type DistanceSource,
  type VehicleFleetStatus,
} from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type {
  AlarmSeverity,
  FleetDashboardVehiclesLookup,
  FleetStatusCounts,
  VehiclePerformanceSortField,
  VehicleScope,
} from './fleet-dashboard.types.js';

type Json = Record<string, unknown>;

/** The `from` / `to` query values (calendar dates; parsed in the company timezone by the service, D-0183 A5). */
export interface RangeQuery {
  from?: Date | undefined;
  to?: Date | undefined;
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** D-0184 (A8): every column of the table can be sorted on; empty (`null`) values come last in both directions. The first five are the original ones. */
const ALLOWED_SORT_FIELDS: VehiclePerformanceSortField[] = [
  'utilisation_rate',
  'distance_km',
  'driving_hours',
  'idle_hours',
  'fuel_used_liters',
  'vehicle_name',
  'plate',
  'vehicle_category',
  'trip_count',
  'fuel_efficiency',
  'fuel_cost',
  'maintenance_cost',
  'cost_per_km',
  'incident_count',
];

export interface PerformanceOptions {
  scope?: VehicleScope | undefined;
  /** Case-insensitive contains over the vehicle's name and plate. */
  search?: string | undefined;
  /** Present = paged response (`{ items, pagination }`); absent = the flat array. */
  window?: ListWindow | undefined;
}

interface PerformanceRow {
  vehicle_id: string;
  vehicle_name: string;
  plate: string | null;
  vehicle_category: string | null;
  has_tracker: boolean;
  distance_km: number;
  distance_source: string | null;
  driving_hours: number;
  utilisation_rate: number;
  trip_count: number;
  fuel_used_liters: number;
  fuel_efficiency: number | null;
  fuel_cost: number;
  maintenance_cost: number;
  cost_per_km: number | null;
  incident_count: number;
}

const PERFORMANCE_EXPORT_COLUMNS: CsvColumn<PerformanceRow>[] = [
  { header: 'vehicle_id', value: r => r.vehicle_id },
  { header: 'vehicle_name', value: r => r.vehicle_name },
  { header: 'plate', value: r => r.plate },
  { header: 'vehicle_category', value: r => r.vehicle_category },
  { header: 'has_tracker', value: r => r.has_tracker },
  { header: 'distance_km', value: r => r.distance_km },
  { header: 'distance_source', value: r => r.distance_source },
  { header: 'driving_hours', value: r => r.driving_hours },
  { header: 'utilisation_rate', value: r => r.utilisation_rate },
  { header: 'trip_count', value: r => r.trip_count },
  { header: 'fuel_used_liters', value: r => r.fuel_used_liters },
  { header: 'fuel_efficiency', value: r => r.fuel_efficiency },
  { header: 'fuel_cost', value: r => r.fuel_cost },
  { header: 'maintenance_cost', value: r => r.maintenance_cost },
  { header: 'cost_per_km', value: r => r.cost_per_km },
  { header: 'incident_count', value: r => r.incident_count },
];

/**
 * Business logic for module 4.6 (`FleetDashboardController`/
 * `FleetDashboardService.php`, 711 lines, full read). Design rule from
 * `Yes.txt` §26, ported as-is: backend calculates, frontend visualises;
 * real-time sections (`fleet_status`/`alerts`) always reflect now,
 * ignoring the requested date range; historical aggregates respect it.
 *
 * KNOWN_ISSUES 11.1 fixed here (not ported as-is, per the task's own "do
 * not port as-is" instruction on the frozen `openapi.yaml` summary):
 * `alarms.state` filtered against the real enum (`active`/`acknowledged`,
 * not `open`), severity read directly off `alarms.severity` (a real column
 * since module 2.5's D-0060, not eager-loaded from a nonexistent
 * `rule.severity`), ordering done by a stable JS sort on state-then-
 * recency rather than MySQL's `FIELD()` (11.2c, fixed in the same pass per
 * the task's own instruction — it would have started mattering the moment
 * 11.1's Bug A stopped masking it).
 */
export class FleetDashboardService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly vehiclesLookup: FleetDashboardVehiclesLookup,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  /** The company's settings + the requested range in its timezone (D-0183: F1 / A5). */
  private async scope(
    query: RangeQuery,
    trends = false,
    now = new Date()
  ): Promise<{ settings: FleetSettings; from: Date; to: Date; tz: string }> {
    const settings = await this.settingsLookup.effectiveSettings();
    const [from, to] = trends
      ? parseTrendsRange(query, now, settings.timezone)
      : parseDateRange(query, now, settings.timezone);
    return { settings, from, to, tz: settings.timezone };
  }

  // ===========================================================================
  // API #1 — overview
  // ===========================================================================

  /** `fleetOnly` (D-0182, L2): the `alerts.total / critical / warning / info` counts cover only alarms of devices currently installed in a vehicle (same rule as `GET /fleet/dashboard/alerts?fleet_only=1`); default off = the company-wide counts. */
  async overview(query: RangeQuery, fleetOnly = false, now = new Date()) {
    requireCompanyContext();
    const { settings, from, to, tz } = await this.scope(query, false, now);
    const fleetStatus = await this.fleetStatus(settings, now);
    const [trips, alerts, utilisation, fuel, financial] = await Promise.all([
      this.tripSummary(from, to, settings),
      this.alertSummary(fleetStatus.offline, fleetOnly),
      this.utilisationSummary(from, to, settings),
      this.fuelSummary(from, to, settings),
      this.financialSummary(from, to, settings),
    ]);

    return {
      success: true,
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        generated_at: new Date().toISOString(),
      },
      data: {
        fleet_status: this.fleetStatusJson(fleetStatus),
        trips,
        alerts,
        utilisation,
        fuel,
        financial,
      },
    };
  }

  // ===========================================================================
  // API #2 — trends
  // ===========================================================================

  async trends(query: RangeQuery, interval: 'day' | 'week' | 'month', now = new Date()) {
    requireCompanyContext();
    const { settings, from, to, tz } = await this.scope(query, true, now);
    const [utilisation, distance, fuel, trips] = await Promise.all([
      this.utilisationTrend(from, to, interval, settings),
      this.distanceTrend(from, to, interval, tz),
      this.fuelTrend(from, to, interval, tz),
      this.tripTrend(from, to, interval, tz),
    ]);

    return {
      success: true,
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        interval,
        timezone: tz,
        generated_at: new Date().toISOString(),
      },
      data: { utilisation, distance, fuel, trips },
    };
  }

  // ===========================================================================
  // API #3 — vehicle performance ranking
  // ===========================================================================

  /**
   * `GET /fleet/dashboard/vehicle-performance` without paging — the flat array it always was (now with the extra row fields; D-0184, A8).
   * `search` (name / plate) and the scope filters narrow the rows; every column can be sorted on (an unknown `sort` falls back to `utilisation_rate`, as before).
   */
  async vehiclePerformance(
    query: RangeQuery,
    sortBy: string,
    sortDir: string,
    options: Omit<PerformanceOptions, 'window'> = {},
    now = new Date()
  ) {
    requireCompanyContext();
    const { rows, from, to, tz, field, direction } = await this.performanceRows(
      query,
      sortBy,
      sortDir,
      options,
      now
    );
    return {
      success: true,
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        sort: field,
        direction,
        generated_at: new Date().toISOString(),
      },
      data: rows,
    };
  }

  /** The same table paged (D-0184, A8): `data: { items, pagination }`, `meta.total`. */
  async vehiclePerformancePaged(
    query: RangeQuery,
    sortBy: string,
    sortDir: string,
    options: PerformanceOptions & { window: ListWindow },
    now = new Date()
  ) {
    requireCompanyContext();
    const { rows, from, to, tz, field, direction } = await this.performanceRows(
      query,
      sortBy,
      sortDir,
      options,
      now
    );
    const { window } = options;
    return {
      success: true,
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        sort: field,
        direction,
        total: rows.length,
        generated_at: new Date().toISOString(),
      },
      data: {
        items: rows.slice((window.page - 1) * window.perPage, window.page * window.perPage),
        pagination: buildPagination(rows.length, window),
      },
    };
  }

  /** Every matching row, filtered and sorted (the CSV export and the paged / flat response both start from here). */
  private async performanceRows(
    query: RangeQuery,
    sortBy: string,
    sortDir: string,
    options: Omit<PerformanceOptions, 'window'>,
    now: Date
  ) {
    const { settings, from, to, tz } = await this.scope(query, false, now);
    const scoped = await this.repo.vehiclesForCompany(options.scope ?? {});
    const term = options.search?.toLowerCase();
    const vehicles = term
      ? scoped.filter(
          v => v.name.toLowerCase().includes(term) || (v.plate ?? '').toLowerCase().includes(term)
        )
      : scoped;
    const vehicleIds = vehicles.map(v => v.id);
    const [
      tripAgg,
      distances,
      fuelByVehicle,
      fills,
      maintenanceByVehicle,
      incidents,
      deviceAssignments,
    ] = await Promise.all([
      this.repo.completedTripsAggByVehicleInRange(from, to),
      this.repo.completedTripDistancesInRange(from, to),
      this.repo.fuelByVehicleInRange(from, to, tz),
      this.repo.fuelFillsInRange(from, to, tz),
      this.repo.maintenanceCostByVehicleInRange(from, to, tz),
      this.repo.incidentCountByVehicleInRange(vehicleIds, from, to, tz),
      this.repo.activeDeviceAssignmentsForVehicles(vehicleIds),
    ]);
    // one distance definition (D-0183, A2): the completed trips' `actual_distance_km`; each vehicle reports where most of it came from
    const sources = this.distanceSourcesByVehicle(distances);
    const economy = fullTankEconomyByVehicle(fills);
    const periodHours = localDaysInRange(from, to, tz) * settings.scheduledHoursPerVehiclePerDay;

    const rows = vehicles.map(vehicle => {
      const agg = tripAgg.get(vehicle.id) ?? { minutes: 0, km: 0, fuelLiters: 0, count: 0 };
      const drivingHours = agg.minutes / 60;
      const utilisationRate = round((drivingHours / periodHours) * 100, 2);
      const fuel = fuelByVehicle.get(vehicle.id) ?? { liters: 0, cost: 0 };
      const eco = economy.get(vehicle.id);
      const maintenanceCost = maintenanceByVehicle.get(vehicle.id) ?? 0;

      return {
        vehicle_id: vehicle.id,
        vehicle_name: vehicle.name,
        plate: vehicle.plate,
        vehicle_category: vehicle.category ?? null,
        has_tracker: deviceAssignments.has(vehicle.id),
        distance_km: round(agg.km, 1),
        distance_source: sources.get(vehicle.id)?.dominant ?? null,
        driving_hours: round(drivingHours, 1),
        idle_hours: 0.0,
        utilisation_rate: utilisationRate,
        utilisation_basis: 'trips',
        trip_count: agg.count,
        fuel_used_liters: round(fuel.liters, 1),
        fuel_efficiency: eco ? round(eco.km / eco.liters, 2) : null,
        fuel_cost: round(fuel.cost, 2),
        maintenance_cost: round(maintenanceCost, 2),
        /** (fuel + maintenance) ÷ the period's distance; `null` without distance. */
        cost_per_km: agg.km > 0 ? round((fuel.cost + maintenanceCost) / agg.km, 2) : null,
        incident_count: incidents.get(vehicle.id) ?? 0,
      };
    });

    const field: VehiclePerformanceSortField = (ALLOWED_SORT_FIELDS as string[]).includes(sortBy)
      ? (sortBy as VehiclePerformanceSortField)
      : 'utilisation_rate';
    const sign = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      const x = (a as Record<string, unknown>)[field] as string | number | boolean | null;
      const y = (b as Record<string, unknown>)[field] as string | number | boolean | null;
      if (x === null && y === null) return 0;
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y)) * sign;
      return (Number(x) - Number(y)) * sign;
    });
    return { rows: sorted, from, to, tz, field, direction: sortDir === 'asc' ? 'asc' : 'desc' };
  }

  /** `GET /fleet/dashboard/vehicle-performance/export` (D-0184, A8) — the table's own filters / search / sort, every row as CSV. */
  async exportVehiclePerformance(
    query: RangeQuery,
    sortBy: string,
    sortDir: string,
    options: Omit<PerformanceOptions, 'window'> = {},
    now = new Date()
  ) {
    requireCompanyContext();
    const { rows } = await this.performanceRows(query, sortBy, sortDir, options, now);
    return planExport('vehicle-performance', PERFORMANCE_EXPORT_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: rows.slice((page - 1) * perPage, page * perPage),
        total: rows.length,
      })
    );
  }

  /** D-0185 (A9): the company's exclusive status counts, for the scheduled realtime announcement (`fleet:status_summary`). */
  async statusCountsForBroadcast(now = new Date()) {
    requireCompanyContext();
    const settings = await this.settingsLookup.effectiveSettings();
    const counts = await this.fleetStatus(settings, now);
    return {
      total: counts.total,
      moving: counts.moving,
      idle: counts.idle,
      parked: counts.parked,
      offline: counts.offline,
      no_tracker: counts.noTracker,
    };
  }

  // ===========================================================================
  // B3 — status summary
  // ===========================================================================

  /**
   * `GET /fleet/status-summary` (D-0184, flow 07 B3): the exclusive fleet status counts (the same rules as `GET /fleet/dashboard` →
   * `fleet_status`) for the vehicles in scope, plus the split by vehicle category and the tracker coverage.
   */
  async statusSummary(scope: VehicleScope, now = new Date()) {
    requireCompanyContext();
    const settings = await this.settingsLookup.effectiveSettings();
    const statuses = await this.vehicleStatuses(settings, now, scope);
    const empty = () => ({ total: 0, moving: 0, idle: 0, parked: 0, offline: 0, no_tracker: 0 });
    const total = empty();
    const byCategory = new Map<string, ReturnType<typeof empty>>();
    for (const { category, status } of statuses.vehicles) {
      total.total += 1;
      total[status] += 1;
      const key = category ?? '';
      const entry = byCategory.get(key) ?? empty();
      entry.total += 1;
      entry[status] += 1;
      byCategory.set(key, entry);
    }
    const withTracker = total.total - total.no_tracker;
    return {
      success: true,
      meta: {
        timezone: settings.timezone,
        position_freshness_minutes: settings.positionFreshnessMinutes,
        generated_at: new Date().toISOString(),
      },
      data: {
        total: total.total,
        by_status: {
          moving: total.moving,
          idle: total.idle,
          parked: total.parked,
          offline: total.offline,
          no_tracker: total.no_tracker,
        },
        by_category: [...byCategory.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, counts]) => ({
            category: category === '' ? null : category,
            ...counts,
          })),
        coverage: {
          with_tracker: withTracker,
          no_tracker: total.no_tracker,
          tracker_pct: total.total > 0 ? round((withTracker / total.total) * 100, 1) : null,
        },
        active_trips: statuses.activeTrips,
      },
    };
  }

  /** Per vehicle: km by source and the dominant one (D-0183, A2). */
  private distanceSourcesByVehicle(
    trips: {
      vehicleId: string;
      km: number;
      odometerStartKm: number | null;
      odometerEndKm: number | null;
      deviceId: string | null;
    }[]
  ): Map<string, { km: Record<DistanceSource, number>; dominant: DistanceSource | null }> {
    const result = new Map<
      string,
      { km: Record<DistanceSource, number>; dominant: DistanceSource | null }
    >();
    for (const trip of trips) {
      const entry = result.get(trip.vehicleId) ?? {
        km: { telemetry: 0, odometer: 0, trip: 0 },
        dominant: null,
      };
      entry.km[classifyTripDistance(trip)] += trip.km;
      result.set(trip.vehicleId, entry);
    }
    for (const entry of result.values()) entry.dominant = dominantDistanceSource(entry.km);
    return result;
  }

  // ===========================================================================
  // API #4 — active alerts
  // ===========================================================================

  /** `fleetOnly` (D-0159, owner decision on frontend F6): drop alarms whose device isn't currently installed in a vehicle — the default (`false`) keeps Laravel's company-wide list. */
  async activeAlerts(severities: AlarmSeverity[], fleetOnly = false) {
    const rows = await this.repo.activeAlarmsWithRuleName(severities);
    const sorted = sortAlarmsByStateThenRecency(rows);

    const data: Json[] = [];
    for (const row of sorted) {
      const vehicleId = await this.vehiclesLookup.currentVehicleIdForDevice(row.deviceId);
      const vehicle = vehicleId ? await this.vehiclesLookup.findVehicleById(vehicleId) : undefined;
      if (fleetOnly && !vehicle) continue;

      data.push({
        id: row.id,
        type: row.ruleName ?? 'unknown',
        severity: row.severity,
        state: row.state,
        vehicle_id: vehicle?.id ?? null,
        vehicle_name: vehicle?.name ?? null,
        device_id: row.deviceId,
        message: this.alarmMessage(row.ruleName, vehicle?.name, row.deviceId, row.triggeredAt),
        triggered_at: row.triggeredAt.toISOString(),
        created_at: row.createdAt ? row.createdAt.toISOString() : null,
      });
    }

    return {
      success: true,
      meta: { generated_at: new Date().toISOString(), total: data.length },
      data,
    };
  }

  private alarmMessage(
    ruleName: string | null,
    vehicleName: string | undefined,
    deviceId: string,
    triggeredAt: Date
  ): string {
    const name = ruleName ?? 'Alert';
    const subject = vehicleName ?? `Device #${deviceId}`;
    const ago = toRelative(fromJsDate(triggeredAt));
    return `${subject}: ${name}${ago ? ` (${ago})` : ''}`;
  }

  // ===========================================================================
  // API #5 — financial breakdown
  // ===========================================================================

  async financial(query: RangeQuery, now = new Date()) {
    requireCompanyContext();
    const { settings, from, to, tz } = await this.scope(query, false, now);
    const data = await this.financialSummary(from, to, settings);
    return {
      success: true,
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        generated_at: new Date().toISOString(),
      },
      data,
    };
  }

  // ===========================================================================
  // Internal — fleet status
  // ===========================================================================

  /** Per-vehicle exclusive status for the vehicles in scope (D-0183 A4; D-0184 scope): moving / idle / parked / offline / no_tracker, `offline` = a tracker whose latest position is older than the company's freshness threshold. */
  private async vehicleStatuses(
    settings: FleetSettings,
    now: Date,
    scope: VehicleScope = {}
  ): Promise<{
    vehicles: { id: string; category: string | null; status: VehicleFleetStatus }[];
    activeTrips: number;
    allActiveTrips: number;
  }> {
    const vehicles = await this.repo.vehiclesForCompany(scope);
    const vehicleIds = vehicles.map(v => v.id);
    const [deviceAssignments, activeTripVehicleIds] = await Promise.all([
      this.repo.activeDeviceAssignmentsForVehicles(vehicleIds),
      this.repo.activeTripVehicleIds(),
    ]);
    const deviceIds = [...new Set(deviceAssignments.values())];
    const positions = await this.repo.latestPositionsForDevices(deviceIds);

    const result = vehicles.map(vehicle => {
      const deviceId = deviceAssignments.get(vehicle.id);
      const position = deviceId ? positions.get(deviceId) : undefined;
      const status = determineVehicleStatus(
        deviceId !== undefined,
        isOffline(position?.recordedAt ?? null, now, settings.positionFreshnessMinutes),
        position?.speed ?? null,
        activeTripVehicleIds.has(vehicle.id)
      );
      return { id: vehicle.id, category: vehicle.category ?? null, status };
    });
    // an in-progress trip counts for the vehicles in scope only
    const activeTrips = vehicleIds.filter(id => activeTripVehicleIds.has(id)).length;
    return { vehicles: result, activeTrips, allActiveTrips: activeTripVehicleIds.size };
  }

  /** Exclusive status of every vehicle in the fleet (D-0183 A4) as the counts `fleet_status` reports. */
  private async fleetStatus(settings: FleetSettings, now: Date): Promise<FleetStatusCounts> {
    const { vehicles, allActiveTrips } = await this.vehicleStatuses(settings, now);
    const counts = {
      total: vehicles.length,
      moving: 0,
      idle: 0,
      parked: 0,
      offline: 0,
      noTracker: 0,
    };
    for (const { status } of vehicles) {
      if (status === 'no_tracker') counts.noTracker += 1;
      else counts[status] += 1;
    }
    // `active_trips` keeps its earlier meaning: every trip in progress of the company (a trip of a retired vehicle included)
    return { ...counts, activeTrips: allActiveTrips };
  }

  private fleetStatusJson(status: FleetStatusCounts): Json {
    return {
      total: status.total,
      moving: status.moving,
      idle: status.idle,
      parked: status.parked,
      offline: status.offline,
      no_tracker: status.noTracker,
      /** Deprecated alias of `no_tracker` (D-0183, A4) — kept for one release. */
      unknown: status.noTracker,
      active_trips: status.activeTrips,
    };
  }

  // ===========================================================================
  // Internal — trips
  // ===========================================================================

  private async tripSummary(from: Date, to: Date, settings: FleetSettings): Promise<Json> {
    const [counts, inProgress, distanceAgg, variance, onTime, avgMinutes] = await Promise.all([
      this.repo.tripStatusCountsInRange(from, to),
      this.repo.activeTripsCount(),
      this.repo.tripDistanceAggInRange(from, to),
      this.repo.tripDistanceVarianceInRange(from, to),
      this.repo.onTimeStatsInRange(from, to, settings.onTimeGraceMinutes),
      this.repo.avgCompletedDurationMinutesInRange(from, to),
    ]);

    // D-0186: on-time % is defined over the completed trips that HAVE a plan (`on_time_sample`); with none there is no figure — `null`, never a false 0 %
    const ontimePct = onTime.sample > 0 ? round((onTime.onTime / onTime.sample) * 100, 1) : null;

    return {
      total: counts.total,
      completed: counts.completed,
      in_progress: inProgress,
      cancelled: counts.cancelled,
      planned: counts.planned,
      planned_distance_km: round(distanceAgg.plannedKm, 1),
      actual_distance_km: round(distanceAgg.actualKm, 1),
      // D-0186: variance = actual − planned over the trips that have BOTH distances (`distance_variance_sample`); `null` when none does
      distance_variance_km:
        variance.sample > 0 ? round(variance.actualKm - variance.plannedKm, 1) : null,
      distance_variance_sample: variance.sample,
      on_time_pct: ontimePct,
      on_time_sample: onTime.sample,
      avg_duration_minutes: avgMinutes !== null ? round(avgMinutes, 1) : null,
    };
  }

  // ===========================================================================
  // Internal — utilisation
  // ===========================================================================

  /**
   * D-0183 (A7): available hours = vehicles in service (`active` — not in maintenance, retired or sold, by their current status) × the company's
   * scheduled hours per vehicle per day × the local days of the period; `rate` has two decimals; `basis` says the figure comes from completed
   * trips (there is no telemetry rollup yet).
   */
  private async utilisationSummary(from: Date, to: Date, settings: FleetSettings): Promise<Json> {
    const [vehicleCount, agg] = await Promise.all([
      this.repo.inServiceVehicleCount(),
      this.repo.completedTripsAggInRange(from, to),
    ]);
    const days = localDaysInRange(from, to, settings.timezone);
    const availableHours = vehicleCount * settings.scheduledHoursPerVehiclePerDay * days;
    const drivingHours = agg.totalMinutes / 60;
    const idleHours = 0.0;
    const utilisationRate =
      availableHours > 0 ? round((drivingHours / availableHours) * 100, 2) : 0.0;

    return {
      rate: utilisationRate,
      driving_hours: round(drivingHours, 1),
      idle_hours: round(idleHours, 1),
      parked_hours: round(availableHours - drivingHours, 1),
      distance_km: round(agg.totalKm, 1),
      available_hours: round(availableHours, 1),
      basis: 'trips',
      vehicles_in_scope: vehicleCount,
      scheduled_hours_per_day: settings.scheduledHoursPerVehiclePerDay,
    };
  }

  // ===========================================================================
  // Internal — fuel
  // ===========================================================================

  /**
   * D-0183 (A3): fuel used = the period's fuel LOGS (litres; a gallons log is converted); economy = the **full-tank method** (km between two full
   * fills ÷ litres put in since the earlier one; `null` when no vehicle has two full fills with odometer readings in the period); cost per km =
   * fuel-log cost ÷ the period's trip distance (unchanged).
   */
  private async fuelSummary(from: Date, to: Date, settings: FleetSettings): Promise<Json> {
    const tz = settings.timezone;
    const [fuelAgg, tripAgg, fills] = await Promise.all([
      this.repo.fuelAggInRange(from, to, tz),
      this.repo.completedTripsAggInRange(from, to),
      this.repo.fuelFillsInRange(from, to, tz),
    ]);
    let ecoKm = 0;
    let ecoLiters = 0;
    for (const entry of fullTankEconomyByVehicle(fills).values()) {
      ecoKm += entry.km;
      ecoLiters += entry.liters;
    }
    const efficiency = ecoLiters > 0 ? round(ecoKm / ecoLiters, 2) : null;
    const costPerKm =
      fuelAgg.cost > 0 && tripAgg.totalKm > 0 ? round(fuelAgg.cost / tripAgg.totalKm, 2) : null;

    return {
      used_liters: round(fuelAgg.liters, 1),
      total_cost: round(fuelAgg.cost, 2),
      average_efficiency_km_per_liter: efficiency,
      efficiency_basis: 'full_tank',
      cost_per_km: costPerKm,
      idle_fuel_liters: null,
    };
  }

  // ===========================================================================
  // Internal — financial
  // ===========================================================================

  /** D-0183 (A6): `cost_breakdown.maintenance` = the period's maintenance-log costs and `total_cost` = the breakdown's sum (fuel + maintenance). */
  private async financialSummary(from: Date, to: Date, settings: FleetSettings): Promise<Json> {
    const [fuelAgg, maintenanceCost] = await Promise.all([
      this.repo.fuelAggInRange(from, to, settings.timezone),
      this.repo.maintenanceCostInRange(from, to, settings.timezone),
    ]);
    const fuelCost = round(fuelAgg.cost, 2);
    const maintenance = round(maintenanceCost, 2);

    return {
      revenue: null,
      total_cost: round(fuelCost + maintenance, 2),
      profit: null,
      margin: null,
      outstanding: null,
      overdue: null,
      cost_breakdown: { fuel: fuelCost, maintenance, driver: null, tolls: null, other: null },
      _note:
        'revenue, profit and payment data will be populated once the billing module is integrated.',
    };
  }

  // ===========================================================================
  // Internal — alert summary (overview endpoint's alerts section)
  // ===========================================================================

  /** D-0182 (L2): severity counts of the open alarms whose device is installed in a vehicle right now. */
  private async fleetAlarmCounts(): Promise<{
    critical: number;
    warning: number;
    info: number;
    total: number;
  }> {
    const alarms = await this.repo.openAlarmDevices();
    const deviceIds = [...new Set(alarms.map(alarm => alarm.deviceId))];
    const installed = new Set<string>();
    await Promise.all(
      deviceIds.map(async deviceId => {
        if (await this.vehiclesLookup.currentVehicleIdForDevice(deviceId)) installed.add(deviceId);
      })
    );
    const counts = { critical: 0, warning: 0, info: 0 };
    let total = 0;
    for (const alarm of alarms) {
      if (!installed.has(alarm.deviceId)) continue;
      counts[alarm.severity] += 1;
      total += 1;
    }
    return { ...counts, total };
  }

  private async alertSummary(offlineCount: number, fleetOnly = false): Promise<Json> {
    const [counts, expiringDocs, expiringLicences] = await Promise.all([
      fleetOnly ? this.fleetAlarmCounts() : this.repo.alarmSeverityCounts(),
      this.repo.countExpiringCompliance(30),
      this.repo.countExpiringDriverLicences(30),
    ]);

    return {
      total: counts.total,
      critical: counts.critical,
      warning: counts.warning,
      info: counts.info,
      offline_vehicles: offlineCount,
      expiring_documents: expiringDocs,
      expiring_driver_licences: expiringLicences,
    };
  }

  // ===========================================================================
  // Internal — trends
  // ===========================================================================

  private async utilisationTrend(
    from: Date,
    to: Date,
    interval: 'day' | 'week' | 'month',
    settings: FleetSettings
  ): Promise<Json[]> {
    const tz = settings.timezone;
    const vehicleCount = Math.max(1, await this.repo.inServiceVehicleCount());
    const buckets = generateBuckets(from, to, interval, tz);
    const result: Json[] = [];

    for (const bucket of buckets) {
      const availableHours =
        vehicleCount *
        settings.scheduledHoursPerVehiclePerDay *
        localDaysInRange(bucket.from, bucket.to, tz);
      const agg = await this.repo.completedTripsAggInRange(bucket.from, bucket.to);
      const drivingHours = agg.totalMinutes / 60;
      const rate = round((drivingHours / availableHours) * 100, 2);

      result.push({ date: localIsoDate(bucket.from, tz), rate, hours: round(drivingHours, 1) });
    }

    return result;
  }

  private async distanceTrend(
    from: Date,
    to: Date,
    interval: 'day' | 'week' | 'month',
    tz: string
  ): Promise<Json[]> {
    const buckets = generateBuckets(from, to, interval, tz);
    const result: Json[] = [];

    for (const bucket of buckets) {
      const agg = await this.repo.completedTripsAggInRange(bucket.from, bucket.to);
      result.push({ date: localIsoDate(bucket.from, tz), km: round(agg.totalKm, 1) });
    }

    return result;
  }

  private async fuelTrend(
    from: Date,
    to: Date,
    interval: 'day' | 'week' | 'month',
    tz: string
  ): Promise<Json[]> {
    const buckets = generateBuckets(from, to, interval, tz);
    const result: Json[] = [];

    for (const bucket of buckets) {
      const agg = await this.repo.fuelAggInRange(bucket.from, bucket.to, tz);
      result.push({
        date: localIsoDate(bucket.from, tz),
        liters: round(agg.liters, 1),
        cost: round(agg.cost, 2),
      });
    }

    return result;
  }

  private async tripTrend(
    from: Date,
    to: Date,
    interval: 'day' | 'week' | 'month',
    tz: string
  ): Promise<Json[]> {
    const buckets = generateBuckets(from, to, interval, tz);
    const result: Json[] = [];

    for (const bucket of buckets) {
      const counts = await this.repo.tripStatusCountsInWindow(bucket.from, bucket.to);
      result.push({
        date: localIsoDate(bucket.from, tz),
        total: counts.total,
        completed: counts.completed,
        cancelled: counts.cancelled,
      });
    }

    return result;
  }
}

function requireCompanyContext() {
  const context = getRequestContext();
  if (!context?.companyId) throw new ForbiddenError('Unauthorized action.');
}
