/* eslint-disable @typescript-eslint/no-explicit-any */
import { HIGHWAY_ROUTES, YARD_LOOPS } from './routes';
import { positionModels, showcaseNow, tripModels, vehicleModels, yards } from './dataset';
import { iso, makeRng } from './rng';

/**
 * Live fleet simulation for the showcase: every tracked vehicle is bound to a real road polyline (highway between
 * two yards for in-progress trips, a delivery loop around its home yard otherwise) and its position is a pure function
 * of the wall clock, so `/fleet/positions` answers with vehicles that are genuinely moving. `demoSpeed` warps time
 * (×1 real, ×20 for videos) — see `getDemoSpeed`.
 */
type Pt = [number, number];
interface Line {
  pts: Pt[];
  cum: number[]; // km from start to each point
  km: number;
  /** Names of the yards at the first and last point (for start / destination labels). */
  names?: [string, string];
}
interface Mission {
  kind: 'trip' | 'loop' | 'parked' | 'offline';
  line?: Line;
  reverse?: boolean;
  /** trip: progress at anchor time (0..1) and how long the leg takes at ×1 (ms). */
  f0?: number;
  legMs?: number;
  /** loop: km/h and start offset (km) */
  kmh?: number;
  off0?: number;
  homeYard: number;
}

const ANCHOR = showcaseNow();
/** Simulated clock: advances at `demoSpeed`× wall time, so changing the speed never makes vehicles jump. */
let virtualMs = 0;
let lastWall = Date.now();
const KEY = 'convoyai-demo-speed-v2'; // v2: the default moved from ×20 to ×3 (old saved choices are dropped)
export const DEFAULT_DEMO_SPEED = 3;

export const getDemoSpeed = (): number => {
  try {
    const v = Number(window.localStorage.getItem(KEY));

    // Real time (×1) is barely visible below zoom 12 and ×20 looks cartoonish (~1,200 km/h): ×3 reads as fast but believable.
    return v >= 1 ? v : DEFAULT_DEMO_SPEED;
  } catch {
    return DEFAULT_DEMO_SPEED;
  }
};
export const setDemoSpeed = (v: number) => {
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore */
  }
};

const decode = (s: string): Pt[] => {
  const out: Pt[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;

  while (i < s.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let res = 0;
      let b: number;

      do {
        b = s.charCodeAt(i++) - 63;
        res |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const d = res & 1 ? ~(res >> 1) : res >> 1;

      if (axis === 0) lat += d;
      else lon += d;
    }
    out.push([lat / 1e5, lon / 1e5]);
  }

  return out;
};

const rad = (d: number) => (d * Math.PI) / 180;
const km = (a: Pt, b: Pt) => {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;

  return 12742 * Math.asin(Math.sqrt(h));
};
const bearing = (a: Pt, b: Pt) => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const build = (pts: Pt[]): Line => {
  const cum = [0];

  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + km(pts[i - 1], pts[i]));

  return { pts, cum, km: cum[cum.length - 1] };
};

const cache = new Map<string, Line>();
const highway = (a: number, b: number): { line: Line; reverse: boolean } | null => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const key = `${lo}-${hi}`;
  const src = HIGHWAY_ROUTES[key];

  if (!src) return null;
  if (!cache.has(key)) {
    const l = build(decode(src.line));

    l.names = [yards[lo]?.name, yards[hi]?.name];
    cache.set(key, l);
  }

  return { line: cache.get(key)!, reverse: a > b };
};
const loop = (yard: number, k: number): Line | null => {
  const src = YARD_LOOPS[yard]?.[k % 3];

  if (!src) return null;

  const key = `loop-${yard}-${k % 3}`;

  if (!cache.has(key)) {
    const l = build(decode(src.line));

    l.names = [yards[yard]?.name, yards[yard]?.name];
    cache.set(key, l);
  }

  return cache.get(key)!;
};

/** Point + heading at `d` km along a line (clamped). */
const at = (l: Line, d: number): { p: Pt; h: number } => {
  const x = Math.max(0, Math.min(l.km, d));
  let lo = 0;
  let hi = l.cum.length - 1;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;

    if (l.cum[mid] <= x) lo = mid;
    else hi = mid;
  }

  const seg = l.cum[hi] - l.cum[lo] || 1e-9;
  const t = (x - l.cum[lo]) / seg;
  const a = l.pts[lo];
  const b = l.pts[hi];

  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], h: bearing(a, b) };
};

// ── missions (deterministic) ─────────────────────────────────────────────
const rng = makeRng(31337);
const missions = new Map<string, Mission>();
const fracByVehicle = new Map<string, number>();
/** Where each moving mission is on its road right now (km along the stored line, and whether it travels toward higher km). */
const roadNow = new Map<string, { line: Line; d: number; up: boolean }>();

positionModels.forEach((p, i) => {
  const v = vehicleModels.find(x => x.id === p._vehicleId)!;
  const home = v.yardIdx;
  const trip = tripModels.find(t => t.vehicle_id === v.id && t.status === 'in_progress');

  if (trip) {
    const h = highway(trip._oi, trip._di);

    if (h) {
      const start = Date.parse(trip.actual_start_at);
      const legMs = Math.max(1, Date.parse(trip.planned_end_at) - start);

      missions.set(v.id, {
        kind: 'trip',
        line: h.line,
        reverse: h.reverse,
        f0: (ANCHOR - start) / legMs,
        legMs,
        homeYard: home,
      });

      return;
    }
  }
  if (i % 5 === 0) return void missions.set(v.id, { kind: 'offline', homeYard: home });
  if (i % 4 === 0) return void missions.set(v.id, { kind: 'parked', homeYard: home });

  const l = loop(home, i);

  if (l)
    missions.set(v.id, {
      kind: 'loop',
      line: l,
      kmh: rng.int(34, 58),
      off0: rng.float(0, l.km),
      homeYard: home,
    });
  else missions.set(v.id, { kind: 'parked', homeYard: home });
});

/**
 * Trapezoid motion profile over one leg: accelerate for the first `a`, cruise, brake for the last `a`.
 * Returns the covered share `p` (0..1) and the speed as a share of cruise speed `v` (0..1).
 */
const trapezoid = (u: number, a = 0.035): { p: number; v: number } => {
  const vmax = 1 / (1 - a);

  if (u <= 0) return { p: 0, v: 0 };
  if (u >= 1) return { p: 1, v: 0 };
  if (u < a) return { p: (vmax * u * u) / (2 * a), v: u / a };
  if (u > 1 - a) return { p: 1 - (vmax * (1 - u) ** 2) / (2 * a), v: (1 - u) / a };

  return { p: vmax * (u - a / 2), v: 1 };
};

/** Every third tracker sometimes speeds (6 minutes in every 20 of simulated time): feeds the map's alert strip. */
const overspeed = (pid: number, virtual: number) =>
  pid % 3 === 0 && (virtual / 60_000 + pid * 3) % 20 < 6 ? 22 : 0;

/** Where one tracked vehicle is at `virtual` ms of simulated time (shared by the live positions and the recorded trail). */
function stateAt(p: any, virtual: number) {
  const m = missions.get(p._vehicleId);
  const pid = Number(p.id);
  let lat = p.latitude;
  let lon = p.longitude;
  let heading = p.heading ?? 0;
  let speed = 0;
  let age = p.age_seconds;

  if (m?.kind === 'trip' && m.line) {
    const f = (m.f0 ?? 0) + virtual / (m.legMs ?? 1);
    const g = ((f % 2) + 2) % 2; // 0..2 ping-pong
    const t = g <= 1 ? g : 2 - g;
    const fwd = g <= 1 !== !!m.reverse;
    // Each end of the leg is a short stop (the vehicle sits at the yard), then it accelerates away.
    const DWELL = 0.03;
    const u = Math.min(1, Math.max(0, (t - DWELL) / (1 - 2 * DWELL)));
    const prof = trapezoid(u);
    const frac = Math.min(0.995, Math.max(0.005, t <= DWELL ? 0 : t >= 1 - DWELL ? 1 : prof.p));
    const d = (m.reverse ? 1 - frac : frac) * m.line.km;
    const pos = at(m.line, d);

    lat = pos.p[0];
    lon = pos.p[1];
    heading = fwd ? pos.h : (pos.h + 180) % 360;
    speed =
      t <= DWELL || t >= 1 - DWELL
        ? 0
        : prof.v * (58 + 14 * Math.sin(virtual / 90_000 + pid) + overspeed(pid, virtual));
    age = 4;

    return { lat, lon, heading, speed, age, frac, road: { line: m.line, d, up: fwd } };
  }
  if (m?.kind === 'loop' && m.line) {
    // Every 9th two-minute window the vehicle really stops (its position freezes, not just the speed reading).
    const W = 120_000;
    const K = Math.floor(virtual / W);
    const r = (9 - (pid % 9)) % 9;
    const stopped = K % 9 === r;
    const before = K > r ? Math.floor((K - 1 - r) / 9) + 1 : 0; // stopped windows fully behind us
    const eff = stopped ? K * W - before * W : virtual - before * W;
    const d =
      ((((m.off0 ?? 0) + ((m.kmh ?? 40) * eff) / 3_600_000) % m.line.km) + m.line.km) % m.line.km;
    const pos = at(m.line, d);

    lat = pos.p[0];
    lon = pos.p[1];
    heading = pos.h;
    speed = stopped
      ? 0
      : (m.kmh ?? 40) + 6 * Math.sin(virtual / 40_000 + pid) + overspeed(pid, virtual);
    age = 5;

    return {
      lat,
      lon,
      heading,
      speed,
      age,
      frac: null as number | null,
      road: { line: m.line, d, up: true },
    };
  } else if (m?.kind === 'parked') {
    const y = yards[m.homeYard];

    lat = y.latitude + Math.sin(pid) * 0.0009;
    lon = y.longitude + Math.cos(pid) * 0.0009;
    heading = (pid * 37) % 360;
    age = 30;
  }

  return { lat, lon, heading, speed, age, frac: null as number | null, road: null };
}

/** Position reports for the whole tracked fleet at wall-clock `now` (ms) — same shape as GET /fleet/positions items. */
export function simulatedPositions(now = Date.now(), demoSpeed = getDemoSpeed()): any[] {
  virtualMs += Math.max(0, now - lastWall) * demoSpeed;
  lastWall = now;

  return positionModels.map(p => {
    const m = missions.get(p._vehicleId);
    const s = stateAt(p, virtualMs);

    if (s.frac !== null) fracByVehicle.set(p._vehicleId, s.frac);
    if (s.road) roadNow.set(p._vehicleId, s.road);
    else roadNow.delete(p._vehicleId);

    const stale = m?.kind === 'offline';

    return {
      ...p,
      latitude: s.lat,
      longitude: s.lon,
      heading: Math.round(s.heading),
      speed: Math.max(0, Math.round(s.speed)),
      age_seconds: s.age,
      fresh: !stale && s.age < 900,
      recorded_at: iso(now - s.age * 1000),
    };
  });
}

/**
 * Recorded GPS trail of a simulated tracker: its last `spanMin` simulated minutes sampled every `stepSec`, following the
 * same road geometry as the live position, so the trail always ends where the vehicle is now. null = not simulated.
 */
export function recentTrail(
  deviceId: string,
  spanMin = 14,
  stepSec = 20
):
  | { latitude: number; longitude: number; speed: number; heading: number; recorded_at: string }[]
  | null {
  const p = positionModels.find(x => String(x.device_id) === deviceId);

  if (!p) return null;

  simulatedPositions(); // advance the clock

  const n = Math.round((spanMin * 60) / stepSec);
  const out = [];

  for (let i = n; i >= 0; i--) {
    const s = stateAt(p, virtualMs - i * stepSec * 1000);

    out.push({
      latitude: s.lat,
      longitude: s.lon,
      speed: Math.round(s.speed),
      heading: Math.round(s.heading),
      recorded_at: iso(Date.now() - i * stepSec * 1000),
    });
  }

  return out;
}

/**
 * Where the whole tracked fleet has been driving lately (moving samples only): `spanMin` simulated minutes every
 * `stepSec`, as [lon, lat] pairs. Feeds the map's heat layer so it is rich from the first second.
 */
export function heatPoints(spanMin = 120, stepSec = 45): [number, number][] {
  simulatedPositions(); // advance the clock

  const n = Math.round((spanMin * 60) / stepSec);
  const out: [number, number][] = [];

  positionModels.forEach(p => {
    for (let i = 0; i <= n; i++) {
      const s = stateAt(p, virtualMs - i * stepSec * 1000);

      if (s.speed > 3) out.push([s.lon, s.lat]);
    }
  });

  return out;
}

/** Road polyline for a yard-to-yard trip, ordered origin → destination (null when the pair has no generated route). */
export function roadPath(originYard: number, destYard: number): Pt[] | null {
  const h = highway(originYard, destYard);

  if (!h) return null;

  return h.reverse ? [...h.line.pts].reverse() : h.line.pts;
}

/** How far along origin → destination the simulated vehicle of an in-progress trip is right now (0..1), or null. */
export function tripFraction(vehicleId: string): number | null {
  simulatedPositions(); // advances the simulated clock and refreshes the fractions

  return fracByVehicle.get(vehicleId) ?? null;
}

// Dev-only QA hook: inspect the simulation from the browser console (`__cvSim()`).
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production')
  (window as any).__cvSim = () => simulatedPositions();

/**
 * The road a simulated vehicle is driving right now, split at the vehicle: `ahead` (still to drive, in driving order)
 * and `behind` (already driven, nearest the vehicle first), both as [lon, lat] for MapLibre. null = not on a road.
 */
export function missionRoute(vehicleId: string): {
  ahead: [number, number][];
  behind: [number, number][];
  fromName?: string;
  toName?: string;
} | null {
  simulatedPositions(); // advance the clock

  const r = roadNow.get(vehicleId);

  if (!r) return null;

  const { line, d, up } = r;
  const idx = Math.max(
    1,
    line.cum.findIndex(c => c >= d)
  );
  const here: [number, number] = [at(line, d).p[1], at(line, d).p[0]];
  const ll = (q: Pt): [number, number] => [q[1], q[0]];
  const after = line.pts.slice(idx).map(ll);
  const before = line.pts.slice(0, idx).map(ll).reverse();

  const [lo, hi] = line.names ?? [undefined, undefined];

  return up
    ? { ahead: [here, ...after], behind: [here, ...before], fromName: lo, toName: hi }
    : { ahead: [here, ...before], behind: [here, ...after], fromName: hi, toName: lo };
}
