import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';
import { FleetTelemetryRollupService } from '../fleet-telemetry-rollup.service.js';
import type {
  DeviceAssignmentSpan,
  FleetTelemetryRepository,
} from '../fleet-telemetry.repository.js';
import type { HourStat, RollupPoint } from '../telemetry-rollup.js';

/** A tiny seeded PRNG (mulberry32) so every simulation is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KM_PER_DEGREE = 111.19492664455873; // on the equator: 6371.0088 km × π / 180

export interface Segment {
  start: number;
  end: number;
  speed: number;
}
export interface Truth {
  segments: Segment[];
  /** Position (degrees of longitude on the equator) at time t (ms). */
  lngAt: (t: number) => number;
  /** Exact moving seconds inside [from, to) (ms). */
  movingSeconds: (from: number, to: number) => number;
  /** Exact distance (km) travelled between two instants. */
  distanceKm: (from: number, to: number) => number;
}

/** A vehicle that alternates driving (20–70 km/h, one steady speed per drive) and stopping, exponential lengths with the given mean, along the equator. */
export function makeTruth(seed: number, start: number, end: number, meanMinutes = 40): Truth {
  const rand = rng(seed);
  const segments: Segment[] = [];
  let t = start;
  let driving = rand() < 0.5;
  while (t < end) {
    const len = Math.max(5 * 60_000, -Math.log(1 - rand()) * meanMinutes * 60_000);
    segments.push({ start: t, end: Math.min(end, t + len), speed: driving ? 20 + rand() * 50 : 0 });
    t += len;
    driving = !driving;
  }
  const cum: number[] = [0]; // distance (km) at each segment start
  for (const s of segments)
    cum.push((cum[cum.length - 1] as number) + (s.speed * (s.end - s.start)) / 3_600_000);
  const distanceAt = (time: number): number => {
    const i = segments.findIndex(s => time < s.end);
    if (i < 0) return cum[cum.length - 1] as number;
    const s = segments[i] as Segment;
    return (cum[i] as number) + (s.speed * Math.max(0, time - s.start)) / 3_600_000;
  };
  return {
    segments,
    lngAt: time => distanceAt(time) / KM_PER_DEGREE,
    movingSeconds: (from, to) =>
      segments.reduce(
        (n, s) =>
          n + (s.speed > 2 ? Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)) / 1000 : 0),
        0
      ),
    distanceKm: (from, to) => distanceAt(to) - distanceAt(from),
  };
}

export interface SampleOptions {
  /** Report every `cadenceMs`, with ±`jitter` (a fraction) of random timing noise. */
  cadenceMs: number;
  jitter?: number;
  /** Probability that a scheduled report is lost. */
  drop?: number;
  /** Duplicate every report this many seconds later (a retry burst). */
  duplicateAfterSeconds?: number;
  /** The sensor sends no speed field. */
  speedNull?: boolean;
  /** Silences: no packet at all inside these [from, to) ranges (ms). */
  outages?: [number, number][];
  /** Change the cadence at this time. */
  changeCadenceAt?: { at: number; cadenceMs: number };
  /** Event-driven reporting: every gap is uniform in [min, max] minutes instead of `cadenceMs`. */
  irregularMinutes?: [number, number];
  /** GPS drift: random ±metres added to every packet's position (a stationary vehicle "wanders"). */
  driftMetres?: number;
  /** Move the packets at these indices 20 degrees of longitude (~2200 km) off — a wild GPS jump. */
  glitchAtIndices?: number[];
  seed?: number;
}

export function samplePackets(
  truth: Truth,
  start: number,
  end: number,
  o: SampleOptions
): RollupPoint[] {
  const rand = rng((o.seed ?? 1) + 7919);
  const points: RollupPoint[] = [];
  let t = start + Math.floor(rand() * o.cadenceMs);
  while (t < end) {
    const cadence =
      o.changeCadenceAt && t >= o.changeCadenceAt.at ? o.changeCadenceAt.cadenceMs : o.cadenceMs;
    const at = Math.round(t / 1000) * 1000; // recorded_at has one-second resolution
    const lost = rand() < (o.drop ?? 0) || (o.outages ?? []).some(([a, b]) => at >= a && at < b);
    if (!lost) {
      const seg = must(
        truth.segments.find(s => at < s.end) ?? truth.segments[truth.segments.length - 1]
      );
      const drift = o.driftMetres ? ((rand() * 2 - 1) * o.driftMetres) / (KM_PER_DEGREE * 1000) : 0;
      const p: RollupPoint = {
        at: new Date(at),
        latitude: drift,
        longitude: truth.lngAt(at) + drift,
        speed: o.speedNull ? null : Math.round(seg.speed * 100) / 100,
      };
      points.push(p);
      if (o.duplicateAfterSeconds)
        points.push({ ...p, at: new Date(at + o.duplicateAfterSeconds * 1000) });
    }
    t += o.irregularMinutes
      ? (o.irregularMinutes[0] + rand() * (o.irregularMinutes[1] - o.irregularMinutes[0])) * 60_000
      : cadence * (1 + (rand() * 2 - 1) * (o.jitter ?? 0));
  }
  points.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const i of o.glitchAtIndices ?? [])
    if (points[i]) points[i] = { ...points[i], longitude: points[i].longitude + 20 }; // 2200 km off
  return points;
}

/** An in-memory stand-in for the repository's packet reads (same semantics as the SQL). */
export function memoryRepo(points: RollupPoint[]): FleetTelemetryRepository {
  return {
    positionsBetween: (_d: string, from: Date, to: Date) =>
      Promise.resolve(points.filter(p => p.at >= from && p.at < to)),
    positionsBefore: (_d: string, before: Date, limit: number) =>
      Promise.resolve(points.filter(p => p.at < before).slice(-limit)),
    positionsAtOrAfter: (_d: string, at: Date, limit: number) =>
      Promise.resolve(points.filter(p => p.at >= at).slice(0, limit)),
    positionAtOrAfter: (_d: string, at: Date) =>
      Promise.resolve(points.find(p => p.at >= at) ?? null),
  } as unknown as FleetTelemetryRepository;
}

/** A value that must exist (tests only). */
export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}

export const HOUR = 3_600_000;
export const floorHour = (ms: number): number => Math.floor(ms / HOUR) * HOUR;

/** Rolls `points` up through the REAL service path (assignment span, context packets, per-interval gap limits) in windows of `chunkHours` (0 = one window). */
export async function rollThroughService(
  points: RollupPoint[],
  start: number,
  end: number,
  chunkHours = 0,
  fallbackFreshnessMinutes = 15
): Promise<HourStat[]> {
  const from0 = floorHour(start);
  const to0 = floorHour(end) + HOUR;
  const span: DeviceAssignmentSpan = {
    vehicleId: '1',
    deviceId: 'd',
    assignedAt: new Date(from0 - 30 * 24 * HOUR),
    unassignedAt: null,
  };
  const service = new FleetTelemetryRollupService(
    fakeFleetDashboardRepository({}),
    memoryRepo(points),
    fakeSettingsLookup({ positionFreshnessMinutes: fallbackFreshnessMinutes })
  );
  const out = new Map<number, HourStat>();
  const step = chunkHours > 0 ? chunkHours * HOUR : to0 - from0;
  for (let from = from0; from < to0; from += step) {
    const to = Math.min(to0, from + step);
    for (const row of await service.windowRows(
      [span],
      new Date(from),
      new Date(to),
      fallbackFreshnessMinutes * 2 * 60
    ))
      out.set(row.hourStart.getTime(), row);
  }
  return [...out.values()].sort((a, b) => a.hourStart.getTime() - b.hourStart.getTime());
}
