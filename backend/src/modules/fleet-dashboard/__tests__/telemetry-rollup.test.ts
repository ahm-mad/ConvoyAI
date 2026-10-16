import { describe, expect, it } from 'vitest';
import {
  GAP_LIMIT_INTERVALS,
  MAX_GAP_LIMIT_SECONDS,
  MIN_GAP_LIMIT_SECONDS,
  floorToUtcHour,
  gapLimitSeconds,
  gapLimits,
  haversineKm,
  maxGapSecondsFor,
  rollupHours,
  type RollupPoint,
} from '../telemetry-rollup.js';

const at = (iso: string) => new Date(`2026-09-24T${iso}Z`);
const pt = (time: string, lng: number, speed: number | null, lat = 0): RollupPoint => ({
  at: at(time),
  latitude: lat,
  longitude: lng,
  speed,
});
const KM_PER_HUNDREDTH_DEGREE = haversineKm(
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.01 }
); // ≈ 1.112 km along the equator
const window = { from: at('10:00:00'), to: at('12:00:00'), fallbackGapSeconds: 1800 };

describe('haversineKm / floorToUtcHour', () => {
  it('one hundredth of a degree of longitude on the equator is ~1.112 km; identical points are 0', () => {
    expect(KM_PER_HUNDREDTH_DEGREE).toBeCloseTo(1.112, 3);
    expect(
      haversineKm({ latitude: 31.5, longitude: 74.3 }, { latitude: 31.5, longitude: 74.3 })
    ).toBe(0);
  });
  it('floors to the UTC hour', () => {
    expect(floorToUtcHour(at('10:59:59')).toISOString()).toBe('2026-09-24T10:00:00.000Z');
    expect(floorToUtcHour(at('11:00:00')).toISOString()).toBe('2026-09-24T11:00:00.000Z');
  });
});

describe('gapLimitSeconds / maxGapSecondsFor', () => {
  it('the fallback is twice the freshness window', () => {
    expect(maxGapSecondsFor(15)).toBe(1800);
    expect(gapLimitSeconds(null, 1800)).toBe(1800);
    expect(gapLimitSeconds(0, 1800)).toBe(1800);
    expect(gapLimitSeconds(-5, 1800)).toBe(1800);
  });
  it("follows the device's own report interval: 2.5 x, bounded to 5 minutes - 6 hours", () => {
    expect(GAP_LIMIT_INTERVALS).toBe(2.5);
    expect(gapLimitSeconds(3600, 1800)).toBe(9000); // an hourly tracker: 150 min, one missed report is bridged (120 min), two are not
    expect(gapLimitSeconds(900, 1800)).toBe(2250); // 15 min -> 37.5 min
    expect(gapLimitSeconds(10, 1800)).toBe(MIN_GAP_LIMIT_SECONDS); // a 10-second tracker: never tighter than 5 minutes
    expect(gapLimitSeconds(3 * 3600, 1800)).toBe(MAX_GAP_LIMIT_SECONDS); // a 3-hour tracker: capped at 6 hours
  });
});

describe('gapLimits (per interval, from the neighbouring gaps)', () => {
  const every = (minutes: number, count: number, startMin = 0): RollupPoint[] =>
    Array.from({ length: count }, (_, i) =>
      pt(
        `${String(Math.floor((startMin + i * minutes) / 60)).padStart(2, '0')}:${String((startMin + i * minutes) % 60).padStart(2, '0')}:00`,
        0,
        0
      )
    );
  it('a regular tracker: 2.5 x its interval for every interval', () => {
    expect(gapLimits(every(15, 12), 1800)).toEqual(Array(11).fill(2250));
    expect(gapLimits(every(1, 20), 1800)).toEqual(Array(19).fill(MIN_GAP_LIMIT_SECONDS)); // 1 minute -> 2.5 min, floored to 5 min
  });
  it('too few neighbours (a brand-new device): the fallback', () => {
    expect(gapLimits(every(15, 4), 1800)).toEqual([1800, 1800, 1800]); // each interval has only 2 usable neighbours
    expect(gapLimits(every(15, 5), 1800)).toEqual([2250, 2250, 2250, 2250]); // 3 neighbours are enough
    expect(gapLimits([], 1800)).toEqual([]);
    expect(gapLimits([pt('10:00:00', 0, 0)], 1800)).toEqual([]);
  });
  it('an outage does not excuse itself: its own gap is excluded from its neighbourhood, and one long gap does not move the median', () => {
    const points = [...every(15, 6), pt('05:00:00', 0, 0)].map((p, i) =>
      i === 6 ? { ...p, at: at('05:00:00') } : p
    ); // 15-min packets to 01:15, then a 3h45m silence
    points.sort((a, b) => a.at.getTime() - b.at.getTime());
    const limits = gapLimits(points, 1800);
    expect(limits[5]).toBe(2250); // the long gap itself is judged by the neighbours' 15 minutes
    expect(limits[0]).toBe(2250);
  });
  it('a tracker reconfigured from 15 minutes to hourly adapts within a dozen packets; a mixed neighbourhood is generous, not strict', () => {
    const old = every(15, 30); // 15-minute packets over 7 h 15 min
    const last = old[old.length - 1] as RollupPoint;
    const hourly = Array.from({ length: 20 }, (_, i) => ({
      ...last,
      at: new Date(last.at.getTime() + (i + 1) * 3_600_000),
    }));
    const limits = gapLimits([...old, ...hourly], 1800);
    expect(limits[0]).toBe(2250); // deep in the old regime
    expect(limits[limits.length - 1]).toBe(9000); // deep in the new regime: 2.5 h
    expect(limits[29]).toBeGreaterThanOrEqual(3600); // the first hourly interval (after the last 15-minute one) is already bridged
  });
  it('gaps under 5 seconds (duplicates, retry bursts) are not a report interval', () => {
    const pts: RollupPoint[] = [];
    for (let i = 0; i < 10; i++)
      pts.push(
        pt(`10:${String(i * 5).padStart(2, '0')}:00`, 0, 0),
        pt(`10:${String(i * 5).padStart(2, '0')}:02`, 0, 0)
      ); // a 5-minute report each with a duplicate 2 s later
    const limits = gapLimits(
      pts.filter((_, i) => i < 16),
      1800
    );
    expect(limits.every(l => l >= 700)).toBe(true); // the 2-second duplicates are ignored: the median stays ~5 min, not 2 s
  });
});

describe('rollupHours', () => {
  it("a moving interval: the earlier packet's state, the straight-line distance, packets / max speed / first / last", () => {
    const [h, ...rest] = rollupHours([pt('10:00:00', 0, 40), pt('10:10:00', 0.01, 0)], window);
    expect(rest).toEqual([]);
    expect(h).toMatchObject({
      hourStart: at('10:00:00'),
      packets: 2,
      movingSeconds: 600,
      stoppedSeconds: 0,
      maxSpeedKmh: 40,
      firstPacketAt: at('10:00:00'),
      lastPacketAt: at('10:10:00'),
    });
    expect(h?.distanceKm).toBeCloseTo(1.112, 3);
  });

  it('a stopped interval adds no distance for GPS drift, but real displacement between two stationary packets counts', () => {
    const drift = rollupHours([pt('10:00:00', 0, 0), pt('10:10:00', 0.0001, 0)], window)[0]; // ~11 m
    expect(drift).toMatchObject({ movingSeconds: 0, stoppedSeconds: 600, distanceKm: 0 });
    const drove = rollupHours([pt('10:00:00', 0, 0), pt('10:10:00', 0.05, 0)], window)[0]; // parked at A, drove ~5.6 km, parked at B
    expect(drove).toMatchObject({ movingSeconds: 0, stoppedSeconds: 600 });
    expect(drove?.distanceKm).toBeCloseTo(5.56, 2);
  });

  it('the moving threshold is 2 km/h exclusive; a missing speed is not moving', () => {
    expect(rollupHours([pt('10:00:00', 0, 2), pt('10:01:00', 0, 0)], window)[0]).toMatchObject({
      movingSeconds: 0,
      stoppedSeconds: 60,
    });
    expect(rollupHours([pt('10:00:00', 0, 2.01), pt('10:01:00', 0, 0)], window)[0]).toMatchObject({
      movingSeconds: 60,
      stoppedSeconds: 0,
    });
    expect(
      rollupHours([pt('10:00:00', 0, null), pt('10:01:00', 0, null)], window)[0]
    ).toMatchObject({ movingSeconds: 0, stoppedSeconds: 60, maxSpeedKmh: null });
  });

  it('a gap longer than the limit is no-data (the packets still count); exactly the limit is covered', () => {
    const quiet = rollupHours([pt('10:00:00', 0, 50), pt('10:31:00', 0.1, 50)], window);
    expect(
      quiet.map(h => [
        h.hourStart.toISOString(),
        h.packets,
        h.movingSeconds + h.stoppedSeconds,
        h.distanceKm,
      ])
    ).toEqual([['2026-09-24T10:00:00.000Z', 2, 0, 0]]);
    const edge = rollupHours([pt('10:00:00', 0, 50), pt('10:30:00', 0.1, 50)], window)[0];
    expect(edge?.movingSeconds).toBe(1800);
  });

  it('an interval that crosses an hour boundary is split in proportion to time (seconds and distance)', () => {
    const hours = rollupHours([pt('10:50:00', 0, 30), pt('11:10:00', 0.02, 30)], window);
    expect(
      hours.map(h => [h.hourStart.toISOString().slice(11, 16), h.packets, h.movingSeconds])
    ).toEqual([
      ['10:00', 1, 600],
      ['11:00', 1, 600],
    ]);
    expect(hours[0]?.distanceKm).toBeCloseTo(KM_PER_HUNDREDTH_DEGREE, 3); // half of 2 × 1.112
    expect(hours[1]?.distanceKm).toBeCloseTo(KM_PER_HUNDREDTH_DEGREE, 3);
  });

  it('the window clips intervals: the packet before `from` closes an interval into it without being counted; the packet after `to` does the same at the end', () => {
    const hours = rollupHours(
      [
        pt('09:55:00', 0, 30),
        pt('10:05:00', 0.02, 30),
        pt('11:55:00', 0.04, 30),
        pt('12:05:00', 0.06, 30),
      ],
      window
    );
    // 09:55→10:05 is 10 min, half of it (5 min = 300 s) inside the window; 10:05→11:55 is 110 min > 30 → no-data; 11:55→12:05: 5 min inside
    expect(
      hours.map(h => [h.hourStart.toISOString().slice(11, 16), h.packets, h.movingSeconds])
    ).toEqual([
      ['10:00', 1, 300],
      ['11:00', 1, 300],
    ]);
    expect(hours[0]?.distanceKm).toBeCloseTo(KM_PER_HUNDREDTH_DEGREE, 3); // half of the 2.224 km leg
  });

  it('an implausible jump (GPS glitch) keeps its time but adds no distance; duplicate timestamps are skipped', () => {
    const glitch = rollupHours([pt('10:00:00', 0, 30), pt('10:01:00', 5, 30)], window)[0]; // ~556 km in a minute
    expect(glitch).toMatchObject({ movingSeconds: 60, distanceKm: 0 });
    const dup = rollupHours(
      [pt('10:00:00', 0, 30), pt('10:00:00', 0.5, 30), pt('10:01:00', 0.5, 0)],
      window
    )[0];
    expect(dup).toMatchObject({ packets: 3, movingSeconds: 60 }); // the 0-second interval is skipped; the second packet's state (30) drives the next minute
  });

  it('returns only hours that have data, ascending; empty input → nothing', () => {
    expect(rollupHours([], window)).toEqual([]);
    const hours = rollupHours(
      [pt('11:30:00', 0, 0), pt('10:15:00', 0, 0)].sort((a, b) => a.at.getTime() - b.at.getTime()),
      window
    );
    expect(hours.map(h => h.hourStart.toISOString().slice(11, 13))).toEqual(['10', '11']);
    expect(hours.every(h => h.movingSeconds + h.stoppedSeconds === 0 && h.packets === 1)).toBe(
      true
    );
  });

  it('packets outside the window are not counted', () => {
    const hours = rollupHours([pt('09:00:00', 0, 30), pt('13:00:00', 0, 30)], window);
    expect(hours).toEqual([]);
  });

  it('a sensor that sends no speed is judged by the displacement between its packets', () => {
    const moved = rollupHours([pt('10:00:00', 0, null), pt('10:10:00', 0.01, null)], window)[0]; // ~1.11 km in 10 min = 6.7 km/h
    expect(moved).toMatchObject({ movingSeconds: 600, stoppedSeconds: 0 });
    expect(moved?.distanceKm).toBeCloseTo(1.112, 3);
    const still = rollupHours([pt('10:00:00', 0, null), pt('10:10:00', 0.0001, null)], window)[0]; // 11 m of drift
    expect(still).toMatchObject({ movingSeconds: 0, stoppedSeconds: 600, distanceKm: 0 });
    const crawl = rollupHours([pt('10:00:00', 0, null), pt('10:20:00', 0.004, null)], window)[0]; // 445 m in 20 min = 1.3 km/h: below the threshold
    expect(crawl).toMatchObject({ movingSeconds: 0, stoppedSeconds: 1200 });
    const glitch = rollupHours([pt('10:00:00', 0, null), pt('10:01:00', 5, null)], window)[0]; // an impossible jump is not movement either
    expect(glitch).toMatchObject({ movingSeconds: 0, stoppedSeconds: 60, distanceKm: 0 });
    // a reported speed always wins over the displacement
    expect(rollupHours([pt('10:00:00', 0, 0), pt('10:10:00', 0.01, 0)], window)[0]).toMatchObject({
      movingSeconds: 0,
      stoppedSeconds: 600,
    });
  });
});
