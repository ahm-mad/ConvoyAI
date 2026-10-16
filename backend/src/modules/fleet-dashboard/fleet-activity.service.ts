import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import {
  analyticsRange,
  bucketLabel,
  generateBuckets,
  generateHourBuckets,
  localIsoDate,
  type Bucket,
} from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import { DEFINITION_VERSION, MAX_BUCKETS } from './fleet-analytics.service.js';

/**
 * Yard occupancy and geofence activity summaries (D-0187, flow 07 ask B9) — read-only views over `yard_slot_events` and `geofence_events`
 * for the Overview widgets: how full the yards are now, how long vehicles stay, and how busy the geofences are. Nothing is stored.
 */
export type ActivityInterval = 'hour' | 'day' | 'week' | 'month';

/** A range of hourly buckets is limited to a week — beyond that use a larger interval. */
export const MAX_HOUR_BUCKETS = 168;
/** A guard for the in-memory pass over geofence events. */
export const MAX_GEOFENCE_EVENTS = 200_000;

export const YARD_TABLE_SORT_FIELDS = [
  'name',
  'occupancy_pct',
  'occupied_now',
  'slots_total',
  'check_ins',
  'check_outs',
  'avg_dwell_minutes',
] as const;
export type YardTableSortField = (typeof YARD_TABLE_SORT_FIELDS)[number];

export interface YardSummaryQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: Exclude<ActivityInterval, 'hour'> | undefined;
  yardId?: string | undefined;
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  sortBy?: YardTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
}

export interface GeofenceSummaryQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: ActivityInterval | undefined;
  geofenceId?: string | undefined;
  vehicleId?: string | undefined;
  yardId?: string | undefined;
  /** How many geofences the `top_geofences` list holds (default 10). */
  top?: number | undefined;
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/** Index of the bucket an instant falls in (buckets are contiguous and ascending), or -1. */
export function bucketIndex(buckets: Bucket[], at: number): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bucket = buckets[mid] as Bucket;
    if (at < bucket.from.getTime()) hi = mid - 1;
    else if (at > bucket.to.getTime()) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export class FleetActivityService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private buckets(from: Date, to: Date, interval: ActivityInterval, tz: string): Bucket[] {
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

  /** `GET /fleet/analytics/yards` — occupancy now, dwell and check-in / out activity of the yards. */
  async yardSummary(query: YardSummaryQuery, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets = this.buckets(from, to, interval, tz);

    const allYards = await this.repo.yardsWithSlotCounts(
      query.includeInactive === true,
      query.yardId
    );
    const term = query.search?.toLowerCase();
    const yards = term ? allYards.filter(y => y.name.toLowerCase().includes(term)) : allYards;
    const stays = await this.repo.yardStaysTouching(
      from,
      to,
      yards.map(y => y.id)
    );

    const perYard = new Map(
      yards.map(y => [
        y.id,
        {
          yard: y,
          occupied: 0,
          checkIns: 0,
          checkOuts: 0,
          dwellSum: 0,
          dwellCount: 0,
          dwellMax: 0,
          longestOpen: 0,
        },
      ])
    );
    const series = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      check_ins: 0,
      check_outs: 0,
    }));
    const fromMs = from.getTime();
    const toMs = to.getTime();
    for (const stay of stays) {
      const entry = perYard.get(stay.yardId);
      if (!entry) continue;
      const inMs = stay.checkedInAt.getTime();
      if (stay.checkedOutAt === null) {
        entry.occupied += 1;
        entry.longestOpen = Math.max(entry.longestOpen, (now.getTime() - inMs) / 60_000);
      }
      if (inMs >= fromMs && inMs <= toMs) {
        entry.checkIns += 1;
        const i = bucketIndex(buckets, inMs);
        if (i >= 0) (series[i] as { check_ins: number }).check_ins += 1;
      }
      if (stay.checkedOutAt !== null) {
        const outMs = stay.checkedOutAt.getTime();
        if (outMs >= fromMs && outMs <= toMs) {
          entry.checkOuts += 1;
          const dwell = Math.max(0, (outMs - inMs) / 60_000);
          entry.dwellSum += dwell;
          entry.dwellCount += 1;
          entry.dwellMax = Math.max(entry.dwellMax, dwell);
          const i = bucketIndex(buckets, outMs);
          if (i >= 0) (series[i] as { check_outs: number }).check_outs += 1;
        }
      }
    }

    const rows = [...perYard.values()].map(e => ({
      yard_id: e.yard.id,
      name: e.yard.name,
      is_active: e.yard.isActive,
      slots_total: e.yard.slotsTotal,
      occupied_now: e.occupied,
      occupancy_pct:
        e.yard.slotsTotal > 0 ? round((e.occupied / e.yard.slotsTotal) * 100, 1) : null,
      check_ins: e.checkIns,
      check_outs: e.checkOuts,
      avg_dwell_minutes: e.dwellCount > 0 ? round(e.dwellSum / e.dwellCount, 1) : null,
      longest_dwell_minutes: e.dwellCount > 0 ? round(e.dwellMax, 1) : null,
      longest_open_stay_minutes: e.occupied > 0 ? round(e.longestOpen, 1) : null,
    }));
    const field = query.sortBy ?? 'name';
    const sign = query.sortOrder === 'desc' ? -1 : 1;
    const sorted = [...rows].sort((a, b) => {
      const x = (a as Record<string, unknown>)[field] as string | number | null;
      const y = (b as Record<string, unknown>)[field] as string | number | null;
      if (x === null && y === null) return a.yard_id.localeCompare(b.yard_id);
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0 ? cmp * sign : a.yard_id.localeCompare(b.yard_id);
    });
    const window = query.window ?? { page: 1, perPage: 20 };

    const slotsTotal = rows.reduce((n, r) => n + r.slots_total, 0);
    const occupied = rows.reduce((n, r) => n + r.occupied_now, 0);
    const dwellCount = [...perYard.values()].reduce((n, e) => n + e.dwellCount, 0);
    const dwellSum = [...perYard.values()].reduce((n, e) => n + e.dwellSum, 0);
    const dwellMax = [...perYard.values()].reduce((n, e) => Math.max(n, e.dwellMax), 0);

    return {
      success: true,
      message: 'Yard summary retrieved successfully.',
      data: {
        summary: {
          yards_total: rows.length,
          slots_total: slotsTotal,
          occupied_now: occupied,
          occupancy_pct: slotsTotal > 0 ? round((occupied / slotsTotal) * 100, 1) : null,
          check_ins: rows.reduce((n, r) => n + r.check_ins, 0),
          check_outs: rows.reduce((n, r) => n + r.check_outs, 0),
          avg_dwell_minutes: dwellCount > 0 ? round(dwellSum / dwellCount, 1) : null,
          longest_dwell_minutes: dwellCount > 0 ? round(dwellMax, 1) : null,
        },
        series,
        table: {
          items: sorted.slice((window.page - 1) * window.perPage, window.page * window.perPage),
          pagination: buildPagination(sorted.length, window),
        },
      },
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        interval,
        generated_at: now.toISOString(),
        definition_version: DEFINITION_VERSION,
        basis: {
          occupancy: 'open yard stays now ÷ slots (a point-in-time metric)',
          dwell: 'stays checked out within the period, check-out minus check-in',
        },
      },
    };
  }

  /** `GET /geofences/events/summary` — enter / exit counts per bucket, the busiest geofences, under the events list's own `alert_on` visibility rule. */
  async geofenceSummary(query: GeofenceSummaryQuery, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const [from, to] = analyticsRange(query, now, tz);
    const buckets = this.buckets(from, to, interval, tz);
    const filter = {
      geofenceId: query.geofenceId,
      vehicleId: query.vehicleId,
      yardId: query.yardId,
    };

    const count = await this.repo.countVisibleGeofenceEvents(from, to, filter);
    if (count > MAX_GEOFENCE_EVENTS) {
      throw new ValidationError(
        `This range has ${String(count)} geofence events; at most ${String(MAX_GEOFENCE_EVENTS)} can be summarised — narrow the range or add a filter.`
      );
    }
    const events = await this.repo.visibleGeofenceEvents(from, to, filter);

    const series = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      enter: 0,
      exit: 0,
      total: 0,
    }));
    const perGeofence = new Map<
      string,
      {
        geofence_id: string;
        name: string;
        yard_id: string | null;
        enter: number;
        exit: number;
        total: number;
      }
    >();
    const vehicles = new Set<string>();
    let enter = 0;
    let exit = 0;
    for (const event of events) {
      const i = bucketIndex(buckets, event.occurredAt.getTime());
      if (i >= 0) {
        const point = series[i] as { enter: number; exit: number; total: number };
        point[event.eventType] += 1;
        point.total += 1;
      }
      const entry = perGeofence.get(event.geofenceId) ?? {
        geofence_id: event.geofenceId,
        name: event.geofenceName,
        yard_id: event.yardId,
        enter: 0,
        exit: 0,
        total: 0,
      };
      entry[event.eventType] += 1;
      entry.total += 1;
      perGeofence.set(event.geofenceId, entry);
      vehicles.add(event.vehicleId);
      if (event.eventType === 'enter') enter += 1;
      else exit += 1;
    }
    const top = [...perGeofence.values()]
      .sort((a, b) => b.total - a.total || a.geofence_id.localeCompare(b.geofence_id))
      .slice(0, query.top ?? 10);
    const busiest = series.reduce<{ bucket: string; total: number } | null>(
      (best, p) =>
        p.total > 0 && (best === null || p.total > best.total)
          ? { bucket: p.bucket, total: p.total }
          : best,
      null
    );

    return {
      success: true,
      message: 'Geofence event summary retrieved successfully.',
      data: {
        summary: {
          total: events.length,
          enter,
          exit,
          geofences_with_events: perGeofence.size,
          vehicles_involved: vehicles.size,
          busiest_bucket: busiest,
        },
        series,
        top_geofences: top,
      },
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        interval,
        generated_at: now.toISOString(),
        definition_version: DEFINITION_VERSION,
        basis: {
          events:
            "real transitions shown by GET /geofences/events (a geofence's alert_on of enter / exit hides the other type)",
          bucket: 'occurred_at in the company timezone',
        },
      },
    };
  }
}
