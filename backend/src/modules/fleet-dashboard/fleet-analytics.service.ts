import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  addLocalDays,
  endOfLocalDay,
  localDateOf,
  startOfLocalDay,
} from '../../platform/time/zoned.js';
import type { FleetSettings, FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type { FleetAttentionService } from './fleet-attention.service.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import {
  fullTankEconomyByVehicle,
  generateBuckets,
  localDaysInRange,
  localIsoDate,
  parseDateRange,
  previousWindowOf,
} from './fleet-dashboard.mapper.js';
import type { VehicleScope } from './fleet-dashboard.types.js';

type Json = Record<string, unknown>;

export type AnalyticsInterval = 'day' | 'week' | 'month';
export type CompareMode = 'none' | 'previous_period' | 'previous_year';

export interface SummaryQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: AnalyticsInterval | undefined;
  compare?: CompareMode | undefined;
  scope?: VehicleScope | undefined;
}

/** Version of the metric definitions — bumps when a formula changes, so a client can tell a real change from a redefinition. */
export const DEFINITION_VERSION = 1;
export const MAX_BUCKETS = 92;

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

interface WindowMetrics {
  utilisation: number | null;
  on_time_pct: number | null;
  cost_per_km: number | null;
  fuel_economy: number | null;
}

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/**
 * The Overview KPI tiles (D-0185, flow 07 ask B1): `GET /fleet/analytics/summary`. Every metric is computed for the vehicles in scope with the
 * definitions of D-0183 (trips by actual-else-planned start, fuel logs, full-tank economy, in-service hours), for the range, for the previous
 * window when `compare` asks for one, and per bucket for the sparkline.
 */
export class FleetAnalyticsService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup,
    private readonly attention: FleetAttentionService
  ) {}

  private async metrics(
    from: Date,
    to: Date,
    settings: FleetSettings,
    vehicleIds: string[] | undefined
  ): Promise<WindowMetrics> {
    const tz = settings.timezone;
    const [inService, completedAgg, onTime, fuel, maintenance, fills] = await Promise.all([
      this.repo.inServiceVehicleCount(vehicleIds),
      this.repo.completedTripsAggInRange(from, to, vehicleIds),
      this.repo.onTimeStatsInRange(from, to, settings.onTimeGraceMinutes, vehicleIds),
      this.repo.fuelAggInRange(from, to, tz, vehicleIds),
      this.repo.maintenanceCostInRange(from, to, tz, vehicleIds),
      this.repo.fuelFillsInRange(from, to, tz, vehicleIds),
    ]);
    const availableHours =
      inService * settings.scheduledHoursPerVehiclePerDay * localDaysInRange(from, to, tz);
    let ecoKm = 0;
    let ecoLiters = 0;
    for (const entry of fullTankEconomyByVehicle(fills).values()) {
      ecoKm += entry.km;
      ecoLiters += entry.liters;
    }
    return {
      utilisation:
        availableHours > 0
          ? round((completedAgg.totalMinutes / 60 / availableHours) * 100, 2)
          : null,
      // D-0186: over the completed trips that have a planned end (`null` when there are none — never a false 0 %)
      on_time_pct: onTime.sample > 0 ? round((onTime.onTime / onTime.sample) * 100, 1) : null,
      cost_per_km:
        completedAgg.totalKm > 0
          ? round((fuel.cost + maintenance) / completedAgg.totalKm, 2)
          : null,
      fuel_economy: ecoLiters > 0 ? round(ecoKm / ecoLiters, 2) : null,
    };
  }

  /** The window `compare` asks for, or `null`. */
  private previousWindow(
    from: Date,
    to: Date,
    compare: CompareMode,
    tz: string
  ): [Date, Date] | null {
    return previousWindowOf(from, to, compare, tz);
  }

  async summary(query: SummaryQuery, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const compare = query.compare ?? 'none';
    // default range: the last 7 local days, today included (the range the Overview opens with)
    const today = localDateOf(now, tz);
    const range =
      query.from || query.to
        ? parseDateRange({ from: query.from, to: query.to }, now, tz)
        : ([startOfLocalDay(addLocalDays(today, -6), tz), endOfLocalDay(today, tz)] as [
            Date,
            Date,
          ]);
    const [from, to] = range;
    const buckets = generateBuckets(from, to, interval, tz);
    if (buckets.length > MAX_BUCKETS)
      throw new ValidationError(
        `The range covers ${String(buckets.length)} ${interval} buckets; at most ${String(MAX_BUCKETS)} are allowed — use a larger interval or a shorter range.`
      );

    const scope = query.scope ?? {};
    const scoped = Object.values(scope).some(value => value !== undefined);
    const vehicles = await this.repo.vehiclesForCompany(scope);
    const vehicleIds = scoped ? vehicles.map(v => v.id) : undefined;
    const prevWindow = this.previousWindow(from, to, compare, tz);

    const [current, previous, availability, openIssues, assignments] = await Promise.all([
      this.metrics(from, to, settings, vehicleIds),
      prevWindow
        ? this.metrics(prevWindow[0], prevWindow[1], settings, vehicleIds)
        : Promise.resolve(null),
      this.repo.availabilityCounts(scope),
      this.attention.openIssues(now),
      this.repo.activeDeviceAssignmentsForVehicles(vehicles.map(v => v.id)),
    ]);
    const series: Json[] = [];
    for (const bucket of buckets) {
      const m = await this.metrics(bucket.from, bucket.to, settings, vehicleIds);
      series.push({ bucket: localIsoDate(bucket.from, tz), ...m });
    }

    const metric = (
      value: number | null,
      prev: number | null | undefined,
      target: number | null
    ): Json => {
      const deltaAbs =
        value !== null && prev !== null && prev !== undefined ? round(value - prev, 2) : null;
      return {
        value,
        previous: prev ?? null,
        delta_abs: deltaAbs,
        delta_pct:
          deltaAbs !== null && prev !== null && prev !== undefined && prev !== 0
            ? round((deltaAbs / Math.abs(prev)) * 100, 1)
            : null,
        target,
      };
    };
    const fleetSize = availability.active + availability.inMaintenance;
    const summary: Record<string, Json> = {
      // a point-in-time metric: there is no vehicle status history, so no previous value and no series
      fleet_availability: metric(
        fleetSize > 0 ? round((availability.active / fleetSize) * 100, 1) : null,
        null,
        null
      ),
      utilisation: metric(
        current.utilisation,
        previous?.utilisation,
        settings.utilisationTargetPct
      ),
      on_time_pct: metric(current.on_time_pct, previous?.on_time_pct, settings.onTimeTargetPct),
      cost_per_km: metric(current.cost_per_km, previous?.cost_per_km, settings.costPerKmTarget),
      fuel_economy: metric(
        current.fuel_economy,
        previous?.fuel_economy,
        settings.fuelEconomyTarget
      ),
      // a point-in-time metric too: the attention feed's critical + warning items right now
      open_issues: metric(openIssues, null, null),
    };

    return {
      success: true,
      message: 'Fleet summary retrieved successfully.',
      data: {
        summary,
        series,
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
        data_quality: {
          vehicles_total: vehicles.length,
          vehicles_with_tracker: assignments.size,
          basis: {
            utilisation: 'trips',
            on_time_pct: 'trips',
            cost_per_km: 'trips + fuel logs + maintenance logs',
            fuel_economy: 'full_tank',
            fleet_availability: 'current lifecycle status',
            open_issues: 'attention feed (critical + warning)',
          },
        },
      },
    };
  }
}
