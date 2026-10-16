import { describe, expect, it } from 'vitest';
import type { HourStat, RollupPoint } from '../telemetry-rollup.js';
import {
  HOUR,
  floorHour,
  makeTruth,
  must,
  rollThroughService,
  samplePackets,
  type SampleOptions,
  type Truth,
} from './telemetry-cadence.sim.js';

/**
 * D-0195: the telemetry rollup against a KNOWN ground truth, for every cadence an IoT tracker can be configured to (seconds to hours), with timing jitter,
 * lost reports, duplicates, outages, reconfiguration and sensors without a speed field. A simulated vehicle alternates driving (20-70 km/h) and stopping
 * (exponential lengths, mean 40 min) along the equator; packets are sampled from it and pushed through the REAL service path (assignment span, context
 * packets, per-interval gap limits), in windows of any size.
 */
const START = Date.parse('2026-03-02T00:00:00Z'); // a Monday, 00:00 UTC
const DAY = 24 * HOUR;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const covered = (rows: HourStat[]) =>
  rows.reduce((n, r) => n + r.movingSeconds + r.stoppedSeconds, 0);
const moving = (rows: HourStat[]) => rows.reduce((n, r) => n + r.movingSeconds, 0);
const distance = (rows: HourStat[]) => rows.reduce((n, r) => n + r.distanceKm, 0);
const spanOf = (pts: RollupPoint[]) =>
  [pts[0]?.at.getTime() ?? 0, pts[pts.length - 1]?.at.getTime() ?? 0] as const;

interface Run {
  rows: HourStat[];
  pts: RollupPoint[];
  truth: Truth;
  first: number;
  last: number;
}
async function simulate(
  seed: number,
  days: number,
  o: Omit<SampleOptions, 'seed'>,
  chunkHours = 0
): Promise<Run> {
  const end = START + days * DAY;
  const truth = makeTruth(seed, START, end);
  const pts = samplePackets(truth, START, end, { ...o, seed });
  const rows = await rollThroughService(pts, START, end, chunkHours);
  const [first, last] = spanOf(pts);
  return { rows, pts, truth, first, last };
}
const stats = (runs: Run[]) => {
  let cov = 0,
    signed = 0,
    abs = 0,
    dist = 0;
  for (const r of runs) {
    const elapsed = (r.last - r.first) / 1000;
    const c = covered(r.rows);
    const est = c > 0 ? moving(r.rows) / c : NaN;
    const truth = r.truth.movingSeconds(r.first, r.last) / elapsed;
    cov += c / elapsed;
    signed += est - truth;
    abs += Math.abs(est - truth);
    dist += distance(r.rows) / r.truth.distanceKm(r.first, r.last);
  }
  const n = runs.length;
  return { coverage: cov / n, signedErr: signed / n, absErr: abs / n, distanceRatio: dist / n };
};

/** The invariants that must hold for ANY input. */
function expectSane(rows: HourStat[], pts: RollupPoint[]) {
  let packets = 0;
  let prev = -Infinity;
  for (const r of rows) {
    const h = r.hourStart.getTime();
    expect(h % HOUR).toBe(0);
    expect(h).toBeGreaterThan(prev);
    prev = h;
    expect(r.movingSeconds).toBeGreaterThanOrEqual(0);
    expect(r.stoppedSeconds).toBeGreaterThanOrEqual(0);
    expect(r.movingSeconds + r.stoppedSeconds).toBeLessThanOrEqual(3601); // never more than an hour of an hour (1 s of rounding)
    expect(r.distanceKm).toBeGreaterThanOrEqual(0);
    expect(r.packets).toBeGreaterThanOrEqual(0);
    packets += r.packets;
    if (r.firstPacketAt) expect(floorHour(r.firstPacketAt.getTime())).toBe(h);
    if (r.lastPacketAt) expect(floorHour(r.lastPacketAt.getTime())).toBe(h);
    expect(r.packets > 0 || r.movingSeconds + r.stoppedSeconds > 0).toBe(true); // no empty rows
  }
  expect(packets).toBe(pts.length);
}

// [cadence in minutes, max mean |error| of the moving share, min coverage]
const CADENCES: [number, number, number][] = [
  [0.5, 0.01, 0.99],
  [1, 0.01, 0.99],
  [2, 0.01, 0.98],
  [5, 0.01, 0.98],
  [7, 0.02, 0.98],
  [10, 0.02, 0.98],
  [15, 0.03, 0.97],
  [20, 0.03, 0.97],
  [30, 0.04, 0.97],
  [45, 0.05, 0.96],
  [60, 0.07, 0.96],
  [90, 0.1, 0.95],
  [120, 0.1, 0.95],
  [180, 0.22, 0.94],
  [240, 0.15, 0.93],
];

describe('cadence sweep: any configured report interval, ±10% timing jitter, 3% lost reports', () => {
  for (const [minutes, maxAbs, minCoverage] of CADENCES) {
    it(`every ${String(minutes)} min: the time is covered, the moving share is unbiased and close to the truth, the distance is right`, async () => {
      const days = minutes < 2 ? 1 : 3;
      const runs = await Promise.all(
        SEEDS.map(seed =>
          simulate(seed, days, { cadenceMs: minutes * 60_000, jitter: 0.1, drop: 0.03 })
        )
      );
      for (const r of runs) expectSane(r.rows, r.pts);
      const s = stats(runs);
      expect(s.coverage).toBeGreaterThanOrEqual(minCoverage);
      expect(Math.abs(s.signedErr)).toBeLessThanOrEqual(0.04); // unbiased: over- and under-estimates cancel
      expect(s.absErr).toBeLessThanOrEqual(maxAbs);
      expect(s.distanceRatio).toBeGreaterThanOrEqual(0.95); // straight-line between packets on a straight road: an (almost) exact odometer...
      expect(s.distanceRatio).toBeLessThanOrEqual(1.001); // ...and never more than the truth
    }, 60_000);
  }

  it("a 6-hour cadence is beyond the design's 6-hour gap cap: mostly no-data, never invented, never a crash", async () => {
    const r = await simulate(1, 3, { cadenceMs: 6 * HOUR, jitter: 0.1 });
    expectSane(r.rows, r.pts);
    expect(covered(r.rows) / ((r.last - r.first) / 1000)).toBeLessThan(0.7);
  });
});

describe('the window never matters: rolling in windows of any size gives identical rows', () => {
  for (const minutes of [1, 7, 15, 30, 45, 60, 90, 180]) {
    it(`every ${String(minutes)} min: 1 h, 5 h, 24 h and 7-day windows == one window`, async () => {
      const days = minutes <= 15 ? 2 : 4;
      const end = START + days * DAY;
      const truth = makeTruth(11, START, end);
      const pts = samplePackets(truth, START, end, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        drop: 0.03,
        seed: 11,
      });
      const whole = await rollThroughService(pts, START, end, 0);
      for (const chunk of [1, 5, 24, 168])
        expect(await rollThroughService(pts, START, end, chunk)).toEqual(whole);
      expectSane(whole, pts);
    }, 120_000);
  }
});

describe('misbehaving trackers', () => {
  it('one lost report is bridged, two in a row are not — at every cadence (regular tracker, no jitter)', async () => {
    for (const minutes of [1, 5, 15, 30, 60, 120]) {
      const c = minutes * 60_000;
      const end = START + 2 * DAY;
      const truth = makeTruth(3, START, end);
      const all = samplePackets(truth, START, end, { cadenceMs: c, seed: 3 });
      const cut = Math.floor(all.length / 2);
      const oneLost = all.filter((_, i) => i !== cut);
      const twoLost = all.filter((_, i) => i !== cut && i !== cut + 1);
      const base = await rollThroughService(all, START, end);
      const one = await rollThroughService(oneLost, START, end);
      const two = await rollThroughService(twoLost, START, end);
      const gapMs = must(twoLost[cut]).at.getTime() - must(twoLost[cut - 1]).at.getTime();
      expect(covered(one)).toBeGreaterThanOrEqual(covered(base) - 1); // bridged: nothing lost
      // two lost = a gap of 3 intervals: the limit 2.5 x is exceeded -> that stretch is no-data (unless the 5-minute floor still covers a very fast tracker)
      if (gapMs / 1000 > Math.max(300, 2.5 * minutes * 60))
        expect(covered(two)).toBeLessThan(covered(base) - (gapMs / 1000) * 0.9);
    }
  });

  it('an outage is no-data and never invented; coverage returns as soon as the tracker does', async () => {
    for (const minutes of [1, 5, 15, 30, 60]) {
      const end = START + 3 * DAY;
      const truth = makeTruth(5, START, end);
      const outage: [number, number] = [START + 30 * HOUR, START + 35 * HOUR];
      const pts = samplePackets(truth, START, end, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        outages: [outage],
        seed: 5,
      });
      const rows = await rollThroughService(pts, START, end);
      const byHour = new Map(
        rows.map(r => [r.hourStart.getTime(), r.movingSeconds + r.stoppedSeconds])
      );
      for (let h = START + 31 * HOUR; h < START + 34 * HOUR; h += HOUR)
        expect(byHour.get(h) ?? 0).toBe(0); // the hours well inside the silence
      for (let h = START + 36 * HOUR; h < START + 60 * HOUR; h += HOUR)
        expect(byHour.get(h) ?? 0).toBeGreaterThan(3300); // back to (almost) full coverage
      for (let h = START + 5 * HOUR; h < START + 29 * HOUR; h += HOUR)
        expect(byHour.get(h) ?? 0).toBeGreaterThan(3300);
    }
  });

  it('event-driven reporting (a gap of 1–10 minutes, random) is covered', async () => {
    const runs = await Promise.all(
      SEEDS.map(seed => simulate(seed, 2, { cadenceMs: 300_000, irregularMinutes: [1, 10] }))
    );
    for (const r of runs) expectSane(r.rows, r.pts);
    const s = stats(runs);
    expect(s.coverage).toBeGreaterThan(0.98);
    expect(s.absErr).toBeLessThan(0.03);
  });

  it('a retry burst (every report repeated 2 s later) changes nothing but the packet count', async () => {
    for (const minutes of [1, 15, 60]) {
      const plain = await simulate(2, 2, { cadenceMs: minutes * 60_000, jitter: 0.1 });
      const burst = await simulate(2, 2, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        duplicateAfterSeconds: 2,
      });
      expectSane(burst.rows, burst.pts);
      expect(burst.pts.length).toBe(plain.pts.length * 2);
      expect(
        Math.abs(moving(burst.rows) - moving(plain.rows)) / Math.max(1, moving(plain.rows))
      ).toBeLessThan(0.02);
      expect(
        Math.abs(covered(burst.rows) - covered(plain.rows)) / covered(plain.rows)
      ).toBeLessThan(0.02);
    }
  });

  it('a tracker reconfigured mid-history (15 min ↔ 60 min ↔ 5 min) keeps its coverage on both sides of the change', async () => {
    for (const [from, to] of [
      [15, 60],
      [60, 15],
      [5, 30],
      [30, 5],
      [1, 120],
    ] as const) {
      const end = START + 4 * DAY;
      const change = START + 2 * DAY;
      const truth = makeTruth(9, START, end);
      const pts = samplePackets(truth, START, end, {
        cadenceMs: from * 60_000,
        changeCadenceAt: { at: change, cadenceMs: to * 60_000 },
        jitter: 0.1,
        seed: 9,
      });
      const rows = await rollThroughService(pts, START, end);
      expectSane(rows, pts);
      const cov = (a: number, b: number) =>
        rows
          .filter(r => r.hourStart.getTime() >= a && r.hourStart.getTime() < b)
          .reduce((n, r) => n + r.movingSeconds + r.stoppedSeconds, 0) /
        ((b - a) / 1000);
      expect(cov(START + 2 * HOUR, change - 2 * HOUR)).toBeGreaterThan(0.97);
      expect(cov(change + 6 * HOUR, end - 2 * HOUR)).toBeGreaterThan(0.97);
      expect(cov(change - 2 * HOUR, change + 6 * HOUR)).toBeGreaterThan(0.85); // the transition itself
    }
  });

  it('a brand-new device seen LIVE (only its first packets exist): the freshness-based fallback until its own interval is known; with history the neighbours tell it at once', async () => {
    const end = START + 2 * DAY;
    const truth = makeTruth(4, START, end);
    const hourly = samplePackets(truth, START, end, { cadenceMs: HOUR, seed: 4 });
    const hours = (n: number) =>
      rollThroughService(hourly.slice(0, n), START, end).then(rows => covered(rows));
    // 4 packets = 3 gaps: each interval has only 2 neighbouring gaps -> the 30-minute fallback cannot bridge an hour -> nothing counted
    expect(await hours(4)).toBe(0);
    // a 5th packet gives every interval 3 neighbours -> the device's own hourly interval is known -> the hours are counted
    expect(await hours(5)).toBeGreaterThan(3.5 * 3600);
    // with the whole history the neighbours tell it from the very first interval
    expect(
      covered(await rollThroughService(hourly, START, end)) /
        ((must(hourly[hourly.length - 1]).at.getTime() - must(hourly[0]).at.getTime()) / 1000)
    ).toBeGreaterThan(0.97);
    // a 15-minute device is bridged by the fallback (30 min) from its very first interval, even live
    const quarter = samplePackets(truth, START, end, { cadenceMs: 15 * 60_000, seed: 4 });
    expect(covered(await rollThroughService(quarter.slice(0, 3), START, end))).toBeGreaterThan(
      25 * 60
    );
  });

  it('only two packets (a device just installed) and a single packet: no crash, the fallback rule, no invented time', async () => {
    const end = START + DAY;
    const truth = makeTruth(6, START, end);
    const two = samplePackets(truth, START, end, { cadenceMs: 10 * 60_000 }).slice(0, 2);
    const rows = await rollThroughService(two, START, end);
    expectSane(rows, two);
    expect(covered(rows)).toBeLessThanOrEqual(
      (must(two[1]).at.getTime() - must(two[0]).at.getTime()) / 1000 + 1
    );
    const one = samplePackets(truth, START, end, { cadenceMs: 10 * 60_000 }).slice(0, 1);
    const single = await rollThroughService(one, START, end);
    expect(single.length).toBe(1);
    expect(single[0]).toMatchObject({ packets: 1, movingSeconds: 0, stoppedSeconds: 0 });
    expect(await rollThroughService([], START, end)).toEqual([]);
  });
});

describe('what the packets contain', () => {
  it('a stationary vehicle that only drifts: no movement, no distance, at any cadence', async () => {
    for (const minutes of [1, 15, 60]) {
      const end = START + DAY;
      const flat = {
        segments: [{ start: START, end, speed: 0 }],
        lngAt: () => 0,
        movingSeconds: () => 0,
        distanceKm: () => 0,
      } satisfies Truth;
      const pts = samplePackets(flat, START, end, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        driftMetres: 10,
        seed: 2,
      });
      const rows = await rollThroughService(pts, START, end);
      expect(moving(rows)).toBe(0);
      expect(distance(rows)).toBe(0);
      expect(covered(rows)).toBeGreaterThan(
        0.95 * ((must(pts[pts.length - 1]).at.getTime() - must(pts[0]).at.getTime()) / 1000)
      );
    }
  });

  it('a GPS glitch (one packet 2200 km away) costs no distance and no coverage', async () => {
    for (const minutes of [1, 15, 60]) {
      const clean = await simulate(3, 1, { cadenceMs: minutes * 60_000, jitter: 0.05 });
      const glitched = await simulate(3, 1, {
        cadenceMs: minutes * 60_000,
        jitter: 0.05,
        glitchAtIndices: [Math.floor(clean.pts.length / 2)],
      });
      expectSane(glitched.rows, glitched.pts);
      expect(distance(glitched.rows)).toBeLessThanOrEqual(distance(clean.rows) + 0.001); // never a phantom 2200 km
      expect(distance(glitched.rows)).toBeGreaterThan(distance(clean.rows) * 0.9);
      expect(covered(glitched.rows)).toBeGreaterThanOrEqual(covered(clean.rows) * 0.98);
    }
  });

  it('a sensor without a speed field: judged by displacement — accurate for fast reporters, an over-estimate (never an under-estimate) for slow ones', async () => {
    const at = async (minutes: number) =>
      stats(
        await Promise.all(
          SEEDS.map(seed =>
            simulate(seed, 3, { cadenceMs: minutes * 60_000, jitter: 0.1, speedNull: true })
          )
        )
      );
    expect((await at(1)).absErr).toBeLessThan(0.03);
    expect((await at(5)).absErr).toBeLessThan(0.08); // an interval with any real driving looks moving: ~5% at 5 minutes
    const s60 = await at(60);
    expect(s60.coverage).toBeGreaterThan(0.95);
    expect(s60.signedErr).toBeGreaterThan(-0.02); // a slow sensor with no speed over-states movement (an interval with any driving looks moving)
    expect(s60.distanceRatio).toBeGreaterThan(0.95);
  });
});

describe('hour arithmetic', () => {
  it('odd cadences that do not divide the hour (7, 11, 13, 17 min): every hour stays within an hour and the packet counts add up', async () => {
    for (const minutes of [7, 11, 13, 17, 29, 59, 61, 89]) {
      const r = await simulate(minutes, 2, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        drop: 0.03,
      });
      expectSane(r.rows, r.pts);
      expect(covered(r.rows) / ((r.last - r.first) / 1000)).toBeGreaterThan(0.94);
    }
  });

  it('a fast tracker over a long history stays fast (30 days at one packet a minute)', async () => {
    const t0 = Date.now();
    const days = 30;
    const end = START + days * DAY;
    const truth = makeTruth(1, START, end);
    const pts = samplePackets(truth, START, end, { cadenceMs: 60_000, seed: 1 });
    expect(pts.length).toBeGreaterThan(40_000);
    const rows = await rollThroughService(pts, START, end, 168);
    expectSane(rows, pts);
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 60_000);
});
