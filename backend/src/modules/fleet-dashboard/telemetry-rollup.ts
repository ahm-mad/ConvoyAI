/**
 * D-0194 / D-0195 (flow 07 ask D1): the pure part of the hourly vehicle telemetry rollup — turns one vehicle's chronological GPS packets into per-UTC-hour figures.
 *
 * A packet only says where the vehicle was and how fast it went at that instant. The rollup treats the time BETWEEN two consecutive packets as "covered"
 * only when the gap is at most that interval's GAP LIMIT (a tracker that went quiet is no-data, never guessed). The limit is worked out per interval from
 * the packet stream itself: 2.5 × the median gap of the neighbouring packets (12 either side), bounded to 5 minutes – 6 hours — so a tracker that reports
 * every minute, every 15 minutes, every hour or every 3 hours all get their time counted, one missed report is bridged, a real outage is not, and a
 * tracker reconfigured to another interval adapts within a dozen packets. Where there are too few neighbours to tell (a brand-new device) the caller's
 * fallback limit applies. A covered interval is `moving` when the earlier packet's speed is above the moving threshold (the dashboard's own 2 km/h) — or,
 * for a sensor that sends no speed, when the two positions imply more than that — otherwise `stopped`. Without an ignition signal a stopped vehicle cannot
 * be told from an idling one, so there is deliberately no `idle` figure. The distance of a covered interval is the straight line between its two packets
 * (an under-estimate on winding roads); an implausible jump (GPS glitch) and stationary drift add no distance. Intervals that cross an hour boundary
 * are split in proportion to time. Nothing here touches the database.
 */

const HOUR_MS = 3_600_000;

export interface RollupPoint {
  at: Date;
  latitude: number;
  longitude: number;
  /** km/h, `null` when the packet carried none (counted as not moving). */
  speed: number | null;
}

export interface RollupOptions {
  /** The window to produce hours for: `[from, to)`, both on UTC hour boundaries. */
  from: Date;
  to: Date;
  /** The gap limit (seconds) where a device's own report interval cannot be told yet (fewer than `MIN_GAP_SAMPLES` neighbouring gaps). */
  fallbackGapSeconds: number;
  /** Above this speed (km/h) a covered interval is moving (default 2 — the dashboard's threshold). */
  movingSpeedKmh?: number;
  /** An interval implying a higher average speed than this (km/h) is a GPS glitch: its time counts, its distance does not (default 250). */
  maxPlausibleSpeedKmh?: number;
  /** Displacement (km) between two stationary packets below which no distance is added — GPS drift at standstill (default 0.03). */
  stationaryJitterKm?: number;
}

export interface HourStat {
  hourStart: Date;
  packets: number;
  distanceKm: number;
  movingSeconds: number;
  stoppedSeconds: number;
  maxSpeedKmh: number | null;
  firstPacketAt: Date | null;
  lastPacketAt: Date | null;
}

/** The fallback gap limit — twice the company's position-freshness window (default 15 min → 30 min) — used when a device's own report interval is unknown. */
export const maxGapSecondsFor = (positionFreshnessMinutes: number): number =>
  positionFreshnessMinutes * 2 * 60;

/** Bounds of the adaptive gap limit: never tighter than 5 minutes, never looser than 6 hours. */
export const MIN_GAP_LIMIT_SECONDS = 300;
export const MAX_GAP_LIMIT_SECONDS = 6 * 3600;
/** A gap up to this many typical report intervals is bridged (one missed report on a regular tracker: 2 intervals); beyond it the tracker is treated as silent. */
export const GAP_LIMIT_INTERVALS = 2.5;
/** How many neighbouring gaps on each side say what a device's typical report interval is (the caller must supply this many packets of context at each window edge: `GAP_CONTEXT_PACKETS`). */
export const GAP_NEIGHBOURHOOD = 12;
export const GAP_CONTEXT_PACKETS = GAP_NEIGHBOURHOOD + 2;
/** Fewer usable neighbouring gaps than this and the interval's own report interval is unknown. */
export const MIN_GAP_SAMPLES = 3;
/** Gaps shorter than this are duplicates / retry bursts, not a report interval. */
export const MIN_USABLE_GAP_SECONDS = 5;

/**
 * How long one packet's state may stretch, given a typical report interval: 2.5 × the interval, bounded to 5 minutes – 6 hours; `fallbackSeconds` when the
 * interval is unknown.
 */
export function gapLimitSeconds(
  typicalIntervalSeconds: number | null,
  fallbackSeconds: number
): number {
  if (typicalIntervalSeconds === null || !(typicalIntervalSeconds > 0)) return fallbackSeconds;
  return Math.round(
    Math.min(
      MAX_GAP_LIMIT_SECONDS,
      Math.max(MIN_GAP_LIMIT_SECONDS, typicalIntervalSeconds * GAP_LIMIT_INTERVALS)
    )
  );
}

/**
 * The gap limit (seconds) of every interval `points[i] → points[i+1]`: derived from the median of the usable gaps of the 12 intervals either side
 * (the interval itself excluded, so an outage does not excuse itself); `fallbackSeconds` when fewer than 3 usable neighbours exist.
 */
export function gapLimits(points: RollupPoint[], fallbackSeconds: number): number[] {
  const gaps = points
    .slice(1)
    .map((p, i) => (p.at.getTime() - (points[i] as RollupPoint).at.getTime()) / 1000);
  return gaps.map((_, i) => {
    const usable: number[] = [];
    for (
      let j = Math.max(0, i - GAP_NEIGHBOURHOOD);
      j <= Math.min(gaps.length - 1, i + GAP_NEIGHBOURHOOD);
      j++
    ) {
      const g = gaps[j] as number;
      if (j !== i && g >= MIN_USABLE_GAP_SECONDS) usable.push(g);
    }
    if (usable.length < MIN_GAP_SAMPLES) return fallbackSeconds;
    usable.sort((x, y) => x - y);
    const mid = usable.length >> 1;
    const median =
      usable.length % 2 === 1
        ? (usable[mid] as number)
        : ((usable[mid - 1] as number) + (usable[mid] as number)) / 2;
    return gapLimitSeconds(median, fallbackSeconds);
  });
}

export const floorToUtcHour = (at: Date): Date =>
  new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);

/** Great-circle distance in km. */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * `points` = the vehicle's packets in time order, including — when they exist — up to `GAP_CONTEXT_PACKETS` packets BEFORE `from` and AFTER `to`
 * (so intervals crossing the window edges are covered and every interval's gap limit is worked out from the same neighbours whatever the window). Only packets inside `[from, to)` are counted as packets; intervals are clipped to the window.
 * Returns the hours that have at least one packet or some covered time, ascending.
 */
export function rollupHours(points: RollupPoint[], options: RollupOptions): HourStat[] {
  const movingSpeed = options.movingSpeedKmh ?? 2;
  const maxPlausible = options.maxPlausibleSpeedKmh ?? 250;
  const jitterKm = options.stationaryJitterKm ?? 0.03;
  const fromMs = options.from.getTime();
  const toMs = options.to.getTime();
  const hours = new Map<number, HourStat>();
  const hour = (ms: number): HourStat => {
    const key = Math.floor(ms / HOUR_MS) * HOUR_MS;
    let stat = hours.get(key);
    if (!stat) {
      stat = {
        hourStart: new Date(key),
        packets: 0,
        distanceKm: 0,
        movingSeconds: 0,
        stoppedSeconds: 0,
        maxSpeedKmh: null,
        firstPacketAt: null,
        lastPacketAt: null,
      };
      hours.set(key, stat);
    }
    return stat;
  };

  for (const point of points) {
    const ms = point.at.getTime();
    if (ms < fromMs || ms >= toMs) continue;
    const stat = hour(ms);
    stat.packets += 1;
    if (point.speed !== null)
      stat.maxSpeedKmh =
        stat.maxSpeedKmh === null ? point.speed : Math.max(stat.maxSpeedKmh, point.speed);
    if (stat.firstPacketAt === null || point.at < stat.firstPacketAt) stat.firstPacketAt = point.at;
    if (stat.lastPacketAt === null || point.at > stat.lastPacketAt) stat.lastPacketAt = point.at;
  }

  const limits = gapLimits(points, options.fallbackGapSeconds);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as RollupPoint;
    const b = points[i + 1] as RollupPoint;
    const gapMs = b.at.getTime() - a.at.getTime();
    if (gapMs <= 0 || gapMs > (limits[i] as number) * 1000) continue; // duplicate timestamp / a quiet tracker: nothing can be said about that time
    const km = haversineKm(a, b);
    const impliedKmh = km / (gapMs / HOUR_MS);
    // the earlier packet's speed says whether the vehicle was moving; a sensor that sends no speed is judged by the displacement between the two packets
    const moving =
      a.speed !== null
        ? a.speed > movingSpeed
        : impliedKmh > movingSpeed && impliedKmh <= maxPlausible && km >= jitterKm;
    let distance = impliedKmh > maxPlausible ? 0 : km;
    if (!moving && (b.speed ?? 0) <= movingSpeed && km < jitterKm) distance = 0;
    // clip to the window, then split at every hour boundary in proportion to time
    const start = Math.max(a.at.getTime(), fromMs);
    const end = Math.min(b.at.getTime(), toMs);
    for (let cursor = start; cursor < end;) {
      const next = Math.min(end, (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS);
      const share = (next - cursor) / gapMs;
      const stat = hour(cursor);
      const seconds = (next - cursor) / 1000;
      if (moving) stat.movingSeconds += seconds;
      else stat.stoppedSeconds += seconds;
      stat.distanceKm += distance * share;
      cursor = next;
    }
  }

  return [...hours.values()]
    .filter(s => s.packets > 0 || s.movingSeconds + s.stoppedSeconds > 0)
    .sort((x, y) => x.hourStart.getTime() - y.hourStart.getTime())
    .map(s => ({
      ...s,
      distanceKm: Math.round(s.distanceKm * 1000) / 1000,
      movingSeconds: Math.round(s.movingSeconds),
      stoppedSeconds: Math.round(s.stoppedSeconds),
    }));
}
