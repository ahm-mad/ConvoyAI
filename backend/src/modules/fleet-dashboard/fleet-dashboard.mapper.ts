import type { ActiveAlarmRow } from './fleet-dashboard.types.js';
import {
  addLocalDays,
  compareLocalDates,
  endOfLocalDay,
  endOfLocalMonthDate,
  localDateOf,
  localDateString,
  localHourLabel,
  localDayOfWeek,
  localDaysBetween,
  startOfLocalDay,
  utcDatePartsOf,
  type LocalDate,
} from '../../platform/time/zoned.js';

/**
 * Pure helpers factored out of the service for direct unit testing —
 * `fleetStatus()`'s per-vehicle status derivation and `generateBuckets()`
 * (`FleetDashboardService.php`'s exact logic, ported as-is).
 */

/**
 * Exclusive vehicle status (D-0183, ask A4): `no_tracker` (no tracker installed — Laravel's `unknown`, kept as an alias in the response
 * for one release), `offline` (a tracker is installed but its latest position is older than the company's freshness threshold, or it has
 * never reported), otherwise `moving` (speed > 2 km/h, filters GPS noise at standstill — Laravel's own threshold), `idle` (stopped with a
 * trip in progress) or `parked`. The five sum to the number of vehicles in the fleet.
 */
export type VehicleFleetStatus = 'moving' | 'idle' | 'parked' | 'offline' | 'no_tracker';

export function determineVehicleStatus(
  hasDeviceAssignment: boolean,
  positionIsOffline: boolean,
  speed: number | null,
  hasActiveTrip: boolean
): VehicleFleetStatus {
  if (!hasDeviceAssignment) return 'no_tracker';
  if (positionIsOffline) return 'offline';

  const effectiveSpeed = speed ?? 0;
  if (effectiveSpeed > 2.0) return 'moving';
  return hasActiveTrip ? 'idle' : 'parked';
}

export interface Bucket {
  from: Date;
  to: Date;
}

/**
 * Day / week / month buckets from `from` to `to` inclusive, in the company timezone (D-0183, ask A5 — with `UTC` this is exactly the earlier
 * behaviour): each bucket runs from local midnight of its first day to the last millisecond of its last local day, the last one ending on
 * the local day of `to`. Weeks start on Monday (Carbon's default, kept).
 */
export function generateBuckets(
  from: Date,
  to: Date,
  interval: 'day' | 'week' | 'month',
  timeZone = 'UTC'
): Bucket[] {
  const buckets: Bucket[] = [];
  let current = localDateOf(from, timeZone);
  const last = localDateOf(to, timeZone);

  while (compareLocalDates(current, last) <= 0) {
    let bucketLast: LocalDate;
    if (interval === 'week') {
      bucketLast = addLocalDays(current, (7 - localDayOfWeek(current)) % 7); // up to Sunday
    } else if (interval === 'month') {
      bucketLast = endOfLocalMonthDate(current);
    } else {
      bucketLast = current;
    }
    if (compareLocalDates(bucketLast, last) > 0) bucketLast = last;

    const bucketFrom = startOfLocalDay(current, timeZone);
    const bucketTo = endOfLocalDay(bucketLast, timeZone);
    buckets.push({ from: bucketFrom, to: bucketTo });
    // the next bucket starts the day after this one ends — contiguous, and Monday- / 1st-aligned after a partial first week / month
    // (the earlier port stepped a partial first week by 7 days and left the days in between out of every bucket)
    current = addLocalDays(bucketLast, 1);
  }

  return buckets;
}

/** Hour buckets from the start of the first local day to the last instant of the range (each exactly one hour; DST days simply have 23 / 25). */
export function generateHourBuckets(from: Date, to: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const hour = 3_600_000;
  for (let start = from.getTime(); start <= to.getTime(); start += hour) {
    buckets.push({ from: new Date(start), to: new Date(Math.min(start + hour - 1, to.getTime())) });
  }
  return buckets;
}

/** The bucket label of an interval: a local date for day / week / month, a local `YYYY-MM-DDTHH:00` for hour. */
export function bucketLabel(
  bucket: Bucket,
  interval: 'hour' | 'day' | 'week' | 'month',
  timeZone: string
): string {
  return interval === 'hour'
    ? localHourLabel(bucket.from, timeZone)
    : localDateString(localDateOf(bucket.from, timeZone));
}

/**
 * The range every analytics endpoint uses (D-0187): `from` / `to` are calendar dates in the company timezone; with neither given, the last 7 local
 * days, today included (the range the Overview opens with); a reversed range is swapped.
 */
export function analyticsRange(
  query: { from?: Date | undefined; to?: Date | undefined },
  now: Date,
  timeZone: string
): [Date, Date] {
  if (query.from || query.to) return parseDateRange(query, now, timeZone);
  const today = localDateOf(now, timeZone);
  return [startOfLocalDay(addLocalDays(today, -6), timeZone), endOfLocalDay(today, timeZone)];
}

/** Number of local calendar days a range covers, counted in the company timezone (a 23- or 25-hour DST day still counts as one day). */
export function localDaysInRange(from: Date, to: Date, timeZone: string): number {
  return Math.max(1, localDaysBetween(localDateOf(from, timeZone), localDateOf(to, timeZone)) + 1);
}

/** Same calendar dates one year earlier (29 Feb → 28 Feb). */
export function minusOneYear(date: LocalDate): LocalDate {
  const y = date.y - 1;
  const lastDay = new Date(Date.UTC(y, date.m, 0)).getUTCDate();
  return { y, m: date.m, d: Math.min(date.d, lastDay) };
}

/**
 * The window a `compare` mode asks for (D-0185; shared with the trips report, D-0189): `previous_period` = the immediately preceding window of the same
 * number of local days, `previous_year` = the same calendar dates one year earlier, `none` = no window.
 */
export function previousWindowOf(
  from: Date,
  to: Date,
  compare: 'none' | 'previous_period' | 'previous_year',
  timeZone: string
): [Date, Date] | null {
  if (compare === 'none') return null;
  const first = localDateOf(from, timeZone);
  const last = localDateOf(to, timeZone);
  if (compare === 'previous_year')
    return [
      startOfLocalDay(minusOneYear(first), timeZone),
      endOfLocalDay(minusOneYear(last), timeZone),
    ];
  const days = localDaysInRange(from, to, timeZone);
  return [
    startOfLocalDay(addLocalDays(first, -days), timeZone),
    endOfLocalDay(addLocalDays(first, -1), timeZone),
  ];
}

/** The `YYYY-MM-DD` of the local calendar day an instant falls on in the company timezone (bucket labels, `meta.from` / `meta.to`). */
export function localIsoDate(date: Date, timeZone: string): string {
  return localDateString(localDateOf(date, timeZone));
}

export type DistanceSource = 'telemetry' | 'odometer' | 'trip';

/**
 * Where a completed trip's `actual_distance_km` came from (D-0183, ask A2). At completion the backend takes the operator's end odometer minus the
 * start odometer when both exist (`odometer`), otherwise the distance driven according to the trip's tracker (`telemetry`); a trip with neither
 * can only carry a manually entered distance (`trip`). The dashboard's one distance definition is the sum of these per vehicle / period.
 */
export function classifyTripDistance(trip: {
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  deviceId: string | null;
}): DistanceSource {
  if (trip.odometerStartKm !== null && trip.odometerEndKm !== null) return 'odometer';
  if (trip.deviceId !== null) return 'telemetry';
  return 'trip';
}

/** The source that contributed the most kilometres (ties: telemetry, odometer, trip); `null` when there is no distance at all. */
export function dominantDistanceSource(km: Record<DistanceSource, number>): DistanceSource | null {
  let best: DistanceSource | null = null;
  for (const source of ['telemetry', 'odometer', 'trip'] as const) {
    if (km[source] > 0 && (best === null || km[source] > km[best])) best = source;
  }
  return best;
}

export interface FuelFillRow {
  vehicleId: string;
  fillDate: Date;
  /** Litres (a gallons log is converted before it gets here). */
  liters: number;
  odometerKm: number | null;
  isFullTank: boolean;
}

export const LITERS_PER_US_GALLON = 3.785411784;

/**
 * Fuel economy by the **full-tank method** (D-0183, ask A3): between two consecutive full fills of a vehicle (ordered by odometer), the km
 * driven divided by the litres put in since the earlier full fill up to and including the later one (partial fills in between count).
 * Fills without an odometer reading, litres before a vehicle's first full fill, and intervals with no distance or no fuel are ignored;
 * a decreasing odometer restarts the sequence. Returns each vehicle's summed `{ km, liters }` — the caller divides (km ÷ litres), so the
 * fleet figure is the distance-weighted average, not an average of averages.
 */
export function fullTankEconomyByVehicle(
  rows: FuelFillRow[]
): Map<string, { km: number; liters: number }> {
  const result = new Map<string, { km: number; liters: number }>();
  for (const interval of fullTankIntervals(
    rows.map((row, index) => ({ ...row, key: String(index) }))
  )) {
    const entry = result.get(interval.vehicleId) ?? { km: 0, liters: 0 };
    entry.km += interval.km;
    entry.liters += interval.liters;
    result.set(interval.vehicleId, entry);
  }
  return result;
}

/** One full-tank economy interval: the fill that CLOSED it, the km driven since the previous full fill and the litres put in since (D-0190, the trips / fuel reports need each interval, not only the vehicle sums). */
export interface FullTankInterval {
  /** The `key` of the closing (later) full fill. */
  key: string;
  vehicleId: string;
  fillDate: Date;
  km: number;
  liters: number;
}

/**
 * The intervals `fullTankEconomyByVehicle` sums (D-0183 A3), one per closing full fill: fills without an odometer reading are ignored, fills are ordered
 * by odometer (then date), litres before a vehicle's first full fill are ignored, an interval with no distance or no fuel is skipped. Vehicle sums of these
 * intervals ARE `fullTankEconomyByVehicle` — the one rule lives here.
 */
export function fullTankIntervals(rows: (FuelFillRow & { key: string })[]): FullTankInterval[] {
  const byVehicle = new Map<string, (FuelFillRow & { key: string })[]>();
  for (const row of rows) {
    if (row.odometerKm === null) continue;
    const list = byVehicle.get(row.vehicleId) ?? [];
    list.push(row);
    byVehicle.set(row.vehicleId, list);
  }
  const result: FullTankInterval[] = [];
  for (const [vehicleId, fills] of byVehicle) {
    fills.sort(
      (a, b) =>
        (a.odometerKm ?? 0) - (b.odometerKm ?? 0) || a.fillDate.getTime() - b.fillDate.getTime()
    );
    let lastFullOdo: number | null = null;
    let litersSince = 0;
    for (const fill of fills) {
      const odo = fill.odometerKm ?? 0;
      if (lastFullOdo === null) {
        if (fill.isFullTank) {
          lastFullOdo = odo;
          litersSince = 0;
        }
        continue;
      }
      litersSince += fill.liters;
      if (fill.isFullTank) {
        const driven = odo - lastFullOdo;
        if (driven > 0 && litersSince > 0)
          result.push({
            key: fill.key,
            vehicleId,
            fillDate: fill.fillDate,
            km: driven,
            liters: litersSince,
          });
        lastFullOdo = odo;
        litersSince = 0;
      }
    }
  }
  return result;
}

/**
 * `activeAlerts()`'s ordering (11.1 Bug C fixed): `state = 'active'` before
 * `'acknowledged'`, `triggered_at` descending within each group. The
 * repository already fetches ordered by `triggered_at desc`; this is a
 * stable sort on top (Array.prototype.sort is stable per spec), same
 * "small bounded dataset, sort in app code" discipline
 * `vehiclePerformance`'s own sort already established in the old app —
 * replaces the MySQL-only `FIELD()` (11.2c) with no raw SQL needed.
 */
const STATE_PRIORITY: Record<ActiveAlarmRow['state'], number> = {
  active: 0,
  acknowledged: 1,
  cleared: 2,
};

export function sortAlarmsByStateThenRecency<T extends Pick<ActiveAlarmRow, 'state'>>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state]);
}

// ===========================================================================
// Date-range parsing/defaulting — `FleetDashboardController`'s own logic, now in the company timezone (D-0183, ask A5; `UTC` = the earlier behaviour).
// `from` / `to` are read as calendar dates (their own UTC date parts: `2026-09-01` is 1 Sept, whatever the zone); a missing `to` is today's local date.
// ===========================================================================

/** `FleetDashboardController::parseDateRange` — defaults to today (local), swaps a reversed range. Used by `overview`/`vehiclePerformance`/`financial`. */
export function parseDateRange(
  query: { from?: Date | undefined; to?: Date | undefined },
  now: Date,
  timeZone = 'UTC'
): [Date, Date] {
  const today = localDateOf(now, timeZone);
  let from = startOfLocalDay(query.from ? utcDatePartsOf(query.from) : today, timeZone);
  let to = endOfLocalDay(query.to ? utcDatePartsOf(query.to) : today, timeZone);

  if (from.getTime() > to.getTime()) {
    [from, to] = [to, from];
  }

  return [from, to];
}

/** `FleetDashboardController::trends`'s own bespoke default — the last 30 local days, no reversed-range swap (matching Laravel exactly). */
export function parseTrendsRange(
  query: { from?: Date | undefined; to?: Date | undefined },
  now: Date,
  timeZone = 'UTC'
): [Date, Date] {
  const today = localDateOf(now, timeZone);
  const from = startOfLocalDay(
    query.from ? utcDatePartsOf(query.from) : addLocalDays(today, -29),
    timeZone
  );
  const to = endOfLocalDay(query.to ? utcDatePartsOf(query.to) : today, timeZone);
  return [from, to];
}
