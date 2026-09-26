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
const KEY = 'convoyai-demo-speed';

export const getDemoSpeed = (): number => {
  try {
    const v = Number(window.localStorage.getItem(KEY));

    // Real time is far too slow to see on a map; videos default to ×20 until the operator picks another speed.
    return v >= 1 ? v : 20;
  } catch {
    return 20;
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
  if (!cache.has(key)) cache.set(key, build(decode(src.line)));

  return { line: cache.get(key)!, reverse: a > b };
};
const loop = (yard: number, k: number): Line | null => {
  const src = YARD_LOOPS[yard]?.[k % 3];

  if (!src) return null;

  const key = `loop-${yard}-${k % 3}`;

  if (!cache.has(key)) cache.set(key, build(decode(src.line)));

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

/** Position reports for the whole tracked fleet at wall-clock `now` (ms) — same shape as GET /fleet/positions items. */
export function simulatedPositions(now = Date.now(), demoSpeed = getDemoSpeed()): any[] {
  virtualMs += Math.max(0, now - lastWall) * demoSpeed;
  lastWall = now;

  const virtual = virtualMs; // ms of simulated time since page anchor

  return positionModels.map(p => {
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
      const dwell = t < 0.02 || t > 0.98;
      const frac = Math.min(0.995, Math.max(0.005, t));

      fracByVehicle.set(p._vehicleId, frac);
      const d = (m.reverse ? 1 - frac : frac) * m.line.km;
      const pos = at(m.line, d);
      const fwd = g <= 1 !== !!m.reverse;

      lat = pos.p[0];
      lon = pos.p[1];
      heading = fwd ? pos.h : (pos.h + 180) % 360;
      speed = dwell ? 0 : 58 + 14 * Math.sin(virtual / 90_000 + pid);
      age = 4;
    } else if (m?.kind === 'loop' && m.line) {
      const d = ((m.off0 ?? 0) + ((m.kmh ?? 40) * virtual) / 3_600_000) % m.line.km;
      const pos = at(m.line, d);
      const stopped = Math.floor(virtual / 120_000 + pid) % 9 === 0;

      lat = pos.p[0];
      lon = pos.p[1];
      heading = pos.h;
      speed = stopped ? 0 : (m.kmh ?? 40) + 6 * Math.sin(virtual / 40_000 + pid);
      age = 5;
    } else if (m?.kind === 'parked') {
      const y = yards[m.homeYard];

      lat = y.latitude + Math.sin(pid) * 0.0009;
      lon = y.longitude + Math.cos(pid) * 0.0009;
      heading = (pid * 37) % 360;
      age = 30;
    }

    const stale = m?.kind === 'offline';

    return {
      ...p,
      latitude: lat,
      longitude: lon,
      heading: Math.round(heading),
      speed: Math.max(0, Math.round(speed)),
      age_seconds: age,
      fresh: !stale && age < 900,
      recorded_at: iso(now - age * 1000),
    };
  });
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
