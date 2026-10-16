import { describe, expect, it } from 'vitest';
import {
  determineVehicleStatus,
  generateBuckets,
  parseDateRange,
  parseTrendsRange,
  sortAlarmsByStateThenRecency,
  classifyTripDistance,
  dominantDistanceSource,
  fullTankEconomyByVehicle,
  localDaysInRange,
  previousWindowOf,
  fullTankIntervals,
  localIsoDate,
} from '../fleet-dashboard.mapper.js';

const startOfDayUtc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const endOfDayUtc = (d: Date) => new Date(startOfDayUtc(d).getTime() + 86_400_000 - 1);

describe('determineVehicleStatus', () => {
  it("returns no_tracker when there is no device assignment at all (Laravel's unknown — D-0183, A4)", () => {
    expect(determineVehicleStatus(false, true, null, false)).toBe('no_tracker');
    expect(determineVehicleStatus(false, false, 10, true)).toBe('no_tracker');
  });

  it('returns offline when the position is stale or missing (assignment exists)', () => {
    expect(determineVehicleStatus(true, true, 10, true)).toBe('offline');
    expect(determineVehicleStatus(true, true, null, false)).toBe('offline');
  });

  it('returns moving when speed exceeds the 2.0 km/h GPS-noise filter', () => {
    expect(determineVehicleStatus(true, false, 2.1, false)).toBe('moving');
    expect(determineVehicleStatus(true, false, 50, true)).toBe('moving');
  });

  it('returns idle when speed is at or below 2.0 and there is an active trip', () => {
    expect(determineVehicleStatus(true, false, 2.0, true)).toBe('idle');
    expect(determineVehicleStatus(true, false, 0, true)).toBe('idle');
    expect(determineVehicleStatus(true, false, null, true)).toBe('idle');
  });

  it('returns parked when speed is at or below 2.0 and there is no active trip', () => {
    expect(determineVehicleStatus(true, false, 2.0, false)).toBe('parked');
    expect(determineVehicleStatus(true, false, null, false)).toBe('parked');
  });
});

describe('generateBuckets', () => {
  it('generates one bucket per day, inclusive of both endpoints', () => {
    const buckets = generateBuckets(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-03T00:00:00.000Z'),
      'day'
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[0]?.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(buckets[0]?.to.toISOString()).toBe('2026-09-01T23:59:59.999Z');
    expect(buckets[2]?.from.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });

  it('clamps the final bucket to the requested end date', () => {
    // A 5-day range starting mid-week — the week bucket would otherwise run past `to`.
    const buckets = generateBuckets(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-05T00:00:00.000Z'),
      'week'
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.to.toISOString()).toBe('2026-09-05T23:59:59.999Z');
  });

  it("week buckets end on Sunday (Carbon's real Monday-start default)", () => {
    // 2026-09-01 is a Tuesday — the week containing it runs Mon 08-31 .. Sun 09-06.
    const buckets = generateBuckets(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-10T00:00:00.000Z'),
      'week'
    );
    expect(buckets[0]?.to.toISOString()).toBe('2026-09-06T23:59:59.999Z');
  });

  it('month buckets run to the last calendar day of the month', () => {
    const buckets = generateBuckets(
      new Date('2026-09-15T00:00:00.000Z'),
      new Date('2026-10-15T00:00:00.000Z'),
      'month'
    );
    expect(buckets[0]?.to.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });
});

describe('sortAlarmsByStateThenRecency', () => {
  it('orders active before acknowledged, preserving triggered_at-desc order within each group (11.2c fixed without raw SQL)', () => {
    const rows = [
      { id: '1', state: 'acknowledged' as const },
      { id: '2', state: 'active' as const },
      { id: '3', state: 'active' as const },
      { id: '4', state: 'acknowledged' as const },
    ];
    const sorted = sortAlarmsByStateThenRecency(rows);
    expect(sorted.map(r => r.id)).toEqual(['2', '3', '1', '4']);
  });
});

describe('parseDateRange (FleetDashboardController::parseDateRange)', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');

  it('defaults to today (start/end of day) when neither from nor to is given', () => {
    const [from, to] = parseDateRange({}, now);
    expect(from.toISOString()).toBe(startOfDayUtc(now).toISOString());
    expect(to.toISOString()).toBe(endOfDayUtc(now).toISOString());
  });

  it("swaps a reversed range — swaps the already-computed start/end-of-day instances, matching Laravel's own [$from,$to]=[$to,$from] exactly (not a clean re-derivation)", () => {
    const [from, to] = parseDateRange(
      { from: new Date('2026-09-20T00:00:00.000Z'), to: new Date('2026-09-10T00:00:00.000Z') },
      now
    );
    expect(from.toISOString()).toBe(
      endOfDayUtc(new Date('2026-09-10T00:00:00.000Z')).toISOString()
    );
    expect(to.toISOString()).toBe(
      startOfDayUtc(new Date('2026-09-20T00:00:00.000Z')).toISOString()
    );
    expect(from.getTime()).toBeLessThan(to.getTime());
  });
});

describe("parseTrendsRange (FleetDashboardController::trends' own bespoke default)", () => {
  it('defaults to the last 30 days (29 days ago through today), with no reversed-range swap', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    const [from, to] = parseTrendsRange({}, now);
    expect(from.toISOString()).toBe('2026-08-18T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-16T23:59:59.999Z');
  });

  it('does not swap a reversed range (unlike parseDateRange)', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    const [from, to] = parseTrendsRange(
      { from: new Date('2026-09-20T00:00:00.000Z'), to: new Date('2026-09-10T00:00:00.000Z') },
      now
    );
    expect(from.getTime()).toBeGreaterThan(to.getTime());
  });
});

describe('company timezone (D-0183, A5)', () => {
  const KARACHI = 'Asia/Karachi'; // UTC+5, no DST
  const NEW_YORK = 'America/New_York';

  it('day buckets are local days: a Karachi day starts at 19:00Z the day before', () => {
    // 2026-09-24T20:00Z is already 25 Sept 01:00 in Karachi → the range 24..25 Sept (local) is two buckets
    const [from, to] = parseDateRange(
      { from: new Date('2026-09-24T00:00:00Z'), to: new Date('2026-09-25T00:00:00Z') },
      new Date('2026-09-25T10:00:00Z'),
      KARACHI
    );
    expect(from.toISOString()).toBe('2026-09-23T19:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-25T18:59:59.999Z');
    const buckets = generateBuckets(from, to, 'day', KARACHI);
    expect(buckets.map(b => localIsoDate(b.from, KARACHI))).toEqual(['2026-09-24', '2026-09-25']);
    expect(buckets[1]?.from.toISOString()).toBe('2026-09-24T19:00:00.000Z');
    expect(buckets[1]?.to.toISOString()).toBe('2026-09-25T18:59:59.999Z');
  });

  it("'today' and the default trends range follow the local date, not the UTC date", () => {
    const now = new Date('2026-09-24T22:00:00Z'); // 25 Sept 03:00 in Karachi, still 24 Sept in New York
    expect(localIsoDate(parseDateRange({}, now, KARACHI)[0], KARACHI)).toBe('2026-09-25');
    expect(localIsoDate(parseDateRange({}, now, NEW_YORK)[0], NEW_YORK)).toBe('2026-09-24');
    const [from, to] = parseTrendsRange({}, now, KARACHI);
    expect(localIsoDate(from, KARACHI)).toBe('2026-08-27');
    expect(localIsoDate(to, KARACHI)).toBe('2026-09-25');
  });

  it('weekly buckets are contiguous and Monday-aligned after a partial first week (the earlier port left the days between buckets out)', () => {
    // Wed 2026-09-02 .. Wed 2026-09-16 (UTC)
    const buckets = generateBuckets(
      new Date('2026-09-02T00:00:00Z'),
      new Date('2026-09-16T23:59:59.999Z'),
      'week'
    );
    expect(
      buckets.map(b => [b.from.toISOString().slice(0, 10), b.to.toISOString().slice(0, 10)])
    ).toEqual([
      ['2026-09-02', '2026-09-06'], // Wed..Sun
      ['2026-09-07', '2026-09-13'], // Mon..Sun
      ['2026-09-14', '2026-09-16'], // Mon..Wed (clamped)
    ]);
    // no gap: every bucket starts 1 ms after the previous ends
    for (let i = 1; i < buckets.length; i++)
      expect((buckets[i]?.from.getTime() ?? 0) - (buckets[i - 1]?.to.getTime() ?? 0)).toBe(1);
  });

  it('a DST day is a single bucket and counts as one day', () => {
    const from = new Date('2026-03-07T05:00:00Z'); // 2026-03-07 00:00 EST
    const to = new Date('2026-03-09T03:59:59.999Z'); // 2026-03-08 23:59 EDT is 03:59Z on the 9th
    const buckets = generateBuckets(from, new Date('2026-03-09T03:59:59.999Z'), 'day', NEW_YORK);
    expect(buckets.map(b => localIsoDate(b.from, NEW_YORK))).toEqual(
      ['2026-03-07', '2026-03-08', '2026-03-09'].slice(0, buckets.length)
    );
    expect(localDaysInRange(from, to, NEW_YORK)).toBe(2); // 7th and 8th (the 9th 00:00 EDT is 04:00Z, after `to`)
  });

  it('localDaysInRange counts calendar days, min 1', () => {
    expect(
      localDaysInRange(
        new Date('2026-09-19T00:00:00Z'),
        new Date('2026-09-25T23:59:59.999Z'),
        'UTC'
      )
    ).toBe(7);
    expect(
      localDaysInRange(
        new Date('2026-09-25T00:00:00Z'),
        new Date('2026-09-25T23:59:59.999Z'),
        'UTC'
      )
    ).toBe(1);
  });
});

describe('distance source (D-0183, A2)', () => {
  it("classifies a completed trip's distance: operator odometers → odometer, else a tracker → telemetry, else trip", () => {
    expect(classifyTripDistance({ odometerStartKm: 100, odometerEndKm: 150, deviceId: '9' })).toBe(
      'odometer'
    );
    expect(
      classifyTripDistance({ odometerStartKm: null, odometerEndKm: null, deviceId: '9' })
    ).toBe('telemetry');
    expect(classifyTripDistance({ odometerStartKm: 100, odometerEndKm: null, deviceId: '9' })).toBe(
      'telemetry'
    );
    expect(
      classifyTripDistance({ odometerStartKm: null, odometerEndKm: null, deviceId: null })
    ).toBe('trip');
  });

  it('dominantDistanceSource is the source with the most km (ties: telemetry, odometer, trip); null without distance', () => {
    expect(dominantDistanceSource({ telemetry: 10, odometer: 50, trip: 0 })).toBe('odometer');
    expect(dominantDistanceSource({ telemetry: 30, odometer: 30, trip: 30 })).toBe('telemetry');
    expect(dominantDistanceSource({ telemetry: 0, odometer: 0, trip: 5 })).toBe('trip');
    expect(dominantDistanceSource({ telemetry: 0, odometer: 0, trip: 0 })).toBeNull();
  });
});

describe('fullTankEconomyByVehicle (D-0183, A3 — the full-tank method)', () => {
  const fill = (
    vehicleId: string,
    odo: number | null,
    liters: number,
    isFullTank: boolean,
    day = 1
  ) => ({
    vehicleId,
    fillDate: new Date(Date.UTC(2026, 8, day)),
    liters,
    odometerKm: odo,
    isFullTank,
  });

  it('km between two full fills ÷ the litres put in since the earlier one (partial fills in between count)', () => {
    const result = fullTankEconomyByVehicle([
      fill('1', 1000, 40, true, 1), // first full fill: starts the sequence, its own litres belong to the previous interval
      fill('1', 1200, 15, false, 2), // partial
      fill('1', 1500, 25, true, 3), // full: 500 km on 15 + 25 = 40 L
    ]);
    expect(result.get('1')).toEqual({ km: 500, liters: 40 });
  });

  it('sums several intervals per vehicle, ignores fills without an odometer and litres before the first full fill, and is per vehicle', () => {
    const result = fullTankEconomyByVehicle([
      fill('1', 900, 10, false, 1), // before the first full fill → ignored
      fill('1', 1000, 40, true, 2),
      fill('1', null, 99, true, 3), // no odometer → ignored
      fill('1', 1400, 30, true, 4), // 400 km / 30 L
      fill('1', 1900, 50, true, 5), // 500 km / 50 L
      fill('2', 50, 5, true, 1),
      fill('2', 250, 20, true, 2), // 200 km / 20 L
    ]);
    expect(result.get('1')).toEqual({ km: 900, liters: 80 });
    expect(result.get('2')).toEqual({ km: 200, liters: 20 });
  });

  it('no valid interval → no entry; a decreasing odometer restarts the sequence; zero litres or zero km never divide', () => {
    expect(
      fullTankEconomyByVehicle([fill('1', 1000, 40, true), fill('1', 1000, 30, true, 2)]).size
    ).toBe(0); // 0 km
    expect(
      fullTankEconomyByVehicle([fill('1', 1000, 40, false), fill('1', 1500, 30, false, 2)]).size
    ).toBe(0); // never a full fill
    expect(fullTankEconomyByVehicle([fill('1', 1000, 40, true)]).size).toBe(0); // a single full fill
    // sorted by odometer, so an out-of-order entry is placed correctly rather than treated as a reset
    const sorted = fullTankEconomyByVehicle([
      fill('1', 1500, 25, true, 3),
      fill('1', 1000, 40, true, 1),
    ]);
    expect(sorted.get('1')).toEqual({ km: 500, liters: 25 });
  });
});

describe('previousWindowOf (D-0189: shared by the KPI summary and the trips report)', () => {
  const day = (iso: string) => iso.slice(0, 10);
  it('none → null; previous_period = the same number of local days right before; previous_year = the same dates a year earlier', () => {
    const from = new Date('2026-09-23T00:00:00Z');
    const to = new Date('2026-09-25T23:59:59.999Z');
    expect(previousWindowOf(from, to, 'none', 'UTC')).toBeNull();
    const period = previousWindowOf(from, to, 'previous_period', 'UTC');
    expect(period && [day(period[0].toISOString()), day(period[1].toISOString())]).toEqual([
      '2026-09-20',
      '2026-09-22',
    ]);
    const year = previousWindowOf(from, to, 'previous_year', 'UTC');
    expect(year && [day(year[0].toISOString()), day(year[1].toISOString())]).toEqual([
      '2025-09-23',
      '2025-09-25',
    ]);
  });
  it('29 Feb maps to 28 Feb a year earlier; the company timezone decides the local days', () => {
    const leap = previousWindowOf(
      new Date('2028-02-29T00:00:00Z'),
      new Date('2028-02-29T23:59:59.999Z'),
      'previous_year',
      'UTC'
    );
    expect(leap && day(leap[0].toISOString())).toBe('2027-02-28');
    // Karachi (UTC+5): 2026-09-24T19:00Z is already 25 Sept locally — the previous single day is 24 Sept local = 23 Sept 19:00Z
    const karachi = previousWindowOf(
      new Date('2026-09-24T19:00:00Z'),
      new Date('2026-09-25T18:59:59.999Z'),
      'previous_period',
      'Asia/Karachi'
    );
    expect(karachi?.[0].toISOString()).toBe('2026-09-23T19:00:00.000Z');
    expect(karachi?.[1].toISOString()).toBe('2026-09-24T18:59:59.999Z');
  });
});

describe('fullTankIntervals (D-0190: the one economy rule, shared by the dashboard and the fuel report)', () => {
  const fill = (
    key: string,
    odo: number | null,
    liters: number,
    isFullTank: boolean,
    vehicleId = '1',
    date = '2026-09-01'
  ) => ({
    key,
    vehicleId,
    fillDate: new Date(`${date}T00:00:00Z`),
    liters,
    odometerKm: odo,
    isFullTank,
  });
  const rows = [
    fill('a', 1000, 40, true), // opens the sequence
    fill('b', 1200, 10, false), // partial: counts toward the next interval
    fill('c', 1400, 20, true, '1', '2026-09-05'), // closes: 400 km / (10 + 20) L
    fill('d', null, 99, true), // no odometer → ignored
    fill('e', 1800, 25, true, '1', '2026-09-10'), // closes: 400 km / 25 L
    fill('f', 100, 5, true, '2'), // another vehicle, single full fill → no interval
    fill('g', 300, 10, true, '3'),
    fill('h', 300, 10, true, '3', '2026-09-02'), // no distance → skipped
  ];
  it("one interval per closing full fill, with the closing fill's key and date", () => {
    const intervals = fullTankIntervals(rows);
    expect(intervals.map(i => [i.key, i.vehicleId, i.km, i.liters])).toEqual([
      ['c', '1', 400, 30],
      ['e', '1', 400, 25],
    ]);
    expect(intervals[0]?.fillDate.toISOString().slice(0, 10)).toBe('2026-09-05');
  });
  it('the vehicle sums of the intervals ARE fullTankEconomyByVehicle', () => {
    const sums = new Map<string, { km: number; liters: number }>();
    for (const i of fullTankIntervals(rows)) {
      const t = sums.get(i.vehicleId) ?? { km: 0, liters: 0 };
      t.km += i.km;
      t.liters += i.liters;
      sums.set(i.vehicleId, t);
    }
    expect(fullTankEconomyByVehicle(rows.map(({ key: _key, ...rest }) => rest))).toEqual(sums);
  });
});
