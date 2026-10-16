import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { TripsReportQuerySchema } from '../fleet-analytics.schemas.js';
import type { TripReportFilter, TripReportRow } from '../fleet-dashboard.types.js';
import {
  DELAY_BUCKETS,
  DURATION_BUCKETS,
  FleetTripsReportService,
  MAX_REPORT_TRIPS,
  delayBucketKey,
  judgeTrip,
  type TripsReportQuery,
} from '../fleet-trips-report.service.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';

const ctx = (): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});
const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);
const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

let seq = 0;
const trip = (over: Partial<TripReportRow> = {}): TripReportRow => {
  seq += 1;
  return {
    id: String(seq),
    reference: null,
    status: 'completed',
    vehicleId: '7',
    driverId: '9',
    customerId: null,
    originAddress: null,
    destinationAddress: null,
    plannedStartAt: at('2026-09-24T08:00:00Z'),
    actualStartAt: at('2026-09-24T08:00:00Z'),
    plannedEndAt: at('2026-09-24T10:00:00Z'),
    actualEndAt: at('2026-09-24T10:00:00Z'),
    plannedDistanceKm: 50,
    actualDistanceKm: 50,
    durationMinutes: 120,
    cancellationReason: null,
    ...over,
  };
};

const CURRENT = [
  trip({ actualEndAt: at('2026-09-24T09:50:00Z'), durationMinutes: 110 }), // 10 min early → on time
  trip({ actualEndAt: at('2026-09-24T10:30:00Z'), durationMinutes: 150, actualDistanceKm: 60 }), // 30 min late, variance +10
  trip({
    actualEndAt: at('2026-09-24T13:00:00Z'),
    durationMinutes: 300,
    plannedDistanceKm: null,
    actualDistanceKm: 100,
  }), // 180 min late, no planned distance
  trip({ plannedEndAt: null, actualEndAt: at('2026-09-24T11:00:00Z'), durationMinutes: 20 }), // no plan → not judged
  trip({
    status: 'cancelled',
    actualStartAt: null,
    plannedStartAt: at('2026-09-25T08:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
    plannedDistanceKm: null,
    cancellationReason: 'Customer cancelled',
  }),
  trip({
    status: 'cancelled',
    actualStartAt: null,
    plannedStartAt: at('2026-09-25T09:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
    plannedDistanceKm: null,
    cancellationReason: '  customer CANCELLED ',
  }),
  trip({
    status: 'cancelled',
    actualStartAt: null,
    plannedStartAt: at('2026-09-23T09:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
    plannedDistanceKm: null,
    cancellationReason: null,
  }),
  trip({
    status: 'planned',
    actualStartAt: null,
    plannedStartAt: at('2026-09-25T15:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
  }),
  trip({
    status: 'in_progress',
    actualStartAt: at('2026-09-25T06:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
  }),
];

interface Seen {
  filters: TripReportFilter[];
  ranges: [Date, Date][];
}
function service(
  rows: TripReportRow[] = CURRENT,
  opts: {
    count?: number;
    settings?: Parameters<typeof fakeSettingsLookup>[0];
    previous?: TripReportRow[];
    seen?: Seen;
  } = {}
) {
  const seen = opts.seen ?? { filters: [], ranges: [] };
  const repo = fakeFleetDashboardRepository({
    vehicleIdsForScope: () => Promise.resolve(undefined),
    countTripsForReport: () => Promise.resolve(opts.count ?? rows.length),
    tripsForReport: (from: Date, to: Date, filter: TripReportFilter) => {
      seen.filters.push(filter);
      seen.ranges.push([from, to]);
      return Promise.resolve(seen.ranges.length === 2 && opts.previous ? opts.previous : rows);
    },
    vehicleBriefs: () => Promise.resolve(new Map([['7', { name: 'Truck 7', plate: 'ABC-7' }]])),
    driverNames: () => Promise.resolve(new Map([['9', 'Ada Lovelace']])),
    customerNames: () => Promise.resolve(new Map()),
  });
  return new FleetTripsReportService(repo, fakeSettingsLookup(opts.settings ?? {}));
}
const range = { from: at('2026-09-23'), to: at('2026-09-25') } as const;
/** The parts of a response the tests read (the service returns a loose `Json`). */
interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  target?: number | null;
}
interface TableItem {
  status: string;
  period_start: Date | null;
  delay_minutes: number | null;
  on_time: boolean | null;
  duration_minutes: number | null;
  distance_variance_km: number | null;
  [key: string]: unknown;
}
interface Summary {
  counts: Record<string, number>;
  trips_total: Metric;
  trips_cancelled: Metric;
  cancellation_rate_pct: Metric;
  on_time_pct: Metric;
  avg_delay_minutes: Metric;
  avg_duration_minutes: Metric;
  actual_distance_km: Metric;
  distance_variance_km: Metric;
  samples: Record<string, number>;
  late_trips: number;
  planned_distance_km: number;
}
interface Report {
  data: {
    summary: Summary;
    series: Record<string, unknown>[];
    duration_histogram: { key: string; count: number }[];
    delay_histogram: { key: string; count: number }[];
    cancellation_reasons: { total: number; items: unknown[]; other_count: number };
    table: { items: TableItem[]; pagination: Record<string, unknown> };
    previous_period?: unknown;
  };
  meta: Record<string, unknown>;
}
const report = async (s: FleetTripsReportService, q: TripsReportQuery = {}) =>
  (await run(() => s.report({ ...range, ...q }, NOW))) as unknown as Report;

describe('trip judgement helpers', () => {
  it('judgeTrip: only a completed trip with a planned and an actual end; signed delay; grace', () => {
    expect(judgeTrip(trip({ actualEndAt: at('2026-09-24T09:50:00Z') }), 0)).toEqual({
      delay: -10,
      onTime: true,
    });
    expect(judgeTrip(trip({ actualEndAt: at('2026-09-24T10:05:00Z') }), 0)).toEqual({
      delay: 5,
      onTime: false,
    });
    expect(judgeTrip(trip({ actualEndAt: at('2026-09-24T10:05:00Z') }), 10)).toEqual({
      delay: 5,
      onTime: true,
    }); // within the grace
    expect(judgeTrip(trip({ plannedEndAt: null }), 0)).toBeNull();
    expect(judgeTrip(trip({ status: 'cancelled' }), 0)).toBeNull();
  });
  it('delayBucketKey boundaries: −31, −30, 0, 0.1, 15, 15.1, 60, 60.1, 240, 240.1', () => {
    const keys = [-31, -30, 0, 0.1, 15, 15.1, 60, 60.1, 240, 240.1].map(delayBucketKey);
    expect(keys).toEqual([
      'early_30_plus',
      'early_0_30',
      'early_0_30',
      'late_0_15',
      'late_0_15',
      'late_15_60',
      'late_15_60',
      'late_60_240',
      'late_60_240',
      'late_240_plus',
    ]);
    expect(new Set(keys).size).toBe(DELAY_BUCKETS.length);
  });
});

describe('FleetTripsReportService.report', () => {
  it('summary: counts by status, D-0186 on-time over the judged trips, delay, duration, distance and variance', async () => {
    const r = await report(service());
    const s = r.data.summary;
    expect(s.counts).toEqual({ total: 9, planned: 1, in_progress: 1, completed: 4, cancelled: 3 });
    expect(s.trips_total.value).toBe(9);
    expect(s.trips_cancelled.value).toBe(3);
    expect(s.cancellation_rate_pct.value).toBe(33.3);
    // judged = the 3 completed trips with a planned end; on time = only the first (−10 min)
    expect(s.samples).toEqual({ on_time: 3, distance_variance: 3, duration: 4 });
    expect(s.on_time_pct.value).toBe(33.3);
    expect(s.late_trips).toBe(2);
    expect(s.avg_delay_minutes.value).toBe(66.7); // (−10 + 30 + 180) / 3
    expect(s.avg_duration_minutes.value).toBe(145); // (110 + 150 + 300 + 20) / 4
    // distance: every trip with an actual distance (50 + 60 + 100 + 50 = 260 km); the variance over the trips that have BOTH (50/50, 50/60, 50/50 → +10)
    expect(s.actual_distance_km.value).toBe(260);
    expect(s.distance_variance_km.value).toBe(10);
    expect(s.planned_distance_km).toBe(150);
    expect(s.on_time_pct.target).toBeNull();
    expect(s.trips_total).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
    expect(r.data.previous_period).toBeUndefined();
    expect(r.meta['on_time_grace_minutes']).toBe(0);
  });

  it('with no judged trip the on-time / delay / variance figures are null, never 0', async () => {
    const r = await report(
      service([
        trip({ plannedEndAt: null, plannedDistanceKm: null }),
        trip({
          status: 'planned',
          actualStartAt: null,
          actualDistanceKm: null,
          plannedDistanceKm: null,
        }),
      ])
    );
    const s = r.data.summary;
    expect([s.on_time_pct.value, s.avg_delay_minutes.value, s.distance_variance_km.value]).toEqual([
      null,
      null,
      null,
    ]);
    expect(s.samples).toMatchObject({ on_time: 0, distance_variance: 0 });
  });

  it('the company grace changes who is on time (30 min grace → the 30-minute-late trip is on time)', async () => {
    const r = await report(service(CURRENT, { settings: { onTimeGraceMinutes: 30 } }));
    expect(r.data.summary.on_time_pct.value).toBe(66.7);
    expect(r.meta['on_time_grace_minutes']).toBe(30);
  });

  it('series: one point per daily bucket, trips in the bucket of their period start (actual else planned), on-time per bucket', async () => {
    const r = await report(service());
    const series = r.data.series;
    expect(series.map(p => p['bucket'])).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(series[0]).toMatchObject({
      total: 1,
      cancelled: 1,
      on_time_pct: null,
      on_time_sample: 0,
    });
    expect(series[1]).toMatchObject({
      total: 4,
      completed: 4,
      on_time_sample: 3,
      on_time_pct: 33.3,
    });
    expect(series[2]).toMatchObject({ total: 4, cancelled: 2, planned: 1, in_progress: 1 });
    expect(series.reduce((n, p) => n + (p['total'] as number), 0)).toBe(9);
  });

  it('duration histogram (completed trips only) and delay histogram (judged trips only)', async () => {
    const r = await report(service());
    const dur = Object.fromEntries(r.data.duration_histogram.map(b => [b.key, b.count]));
    // durations 110, 150, 300, 20 → 1-2 h, 2-4 h, 4-8 h, under 30
    expect(dur).toEqual({
      under_30: 1,
      '30_to_60': 0,
      '1_to_2_h': 1,
      '2_to_4_h': 1,
      '4_to_8_h': 1,
      '8_h_plus': 0,
    });
    expect(r.data.duration_histogram.length).toBe(DURATION_BUCKETS.length);
    const delay = Object.fromEntries(r.data.delay_histogram.map(b => [b.key, b.count]));
    // delays −10, 30, 180
    expect(delay).toEqual({
      early_30_plus: 0,
      early_0_30: 1,
      late_0_15: 0,
      late_15_60: 1,
      late_60_240: 1,
      late_240_plus: 0,
    });
  });

  it('a duration just below zero (a same-second start / complete stores -0.01) still lands in the first class, so the histogram adds up to the completed trips with a duration', async () => {
    const r = await report(
      service([trip({ durationMinutes: -0.01 }), trip({ durationMinutes: 45 })])
    );
    const dur = Object.fromEntries(r.data.duration_histogram.map(b => [b.key, b.count]));
    expect(dur).toMatchObject({ under_30: 1, '30_to_60': 1 });
    expect(r.data.duration_histogram.reduce((n, b) => n + b.count, 0)).toBe(
      r.data.summary.samples['duration']
    );
  });

  it('cancellation reasons: grouped ignoring case / spaces, most first, null reason kept, top N with the rest counted', async () => {
    const r = await report(service());
    const c = r.data.cancellation_reasons;
    expect(c.total).toBe(3);
    expect(c.items).toEqual([
      { reason: 'Customer cancelled', count: 2, pct: 66.7 },
      { reason: null, count: 1, pct: 33.3 },
    ]);
    expect(c.other_count).toBe(0);
    const top1 = (await report(service(), { topReasons: 1 })).data.cancellation_reasons;
    expect(top1.items).toHaveLength(1);
    expect(top1.other_count).toBe(1);
  });

  it('table: paged, newest period start first by default, names, delay / on-time / variance per trip; `table_counts` follow the status filter, the summary does not', async () => {
    const r = await report(service(), { window: { page: 1, perPage: 3 } });
    const t = r.data.table;
    expect(t.pagination).toEqual({ page: 1, per_page: 3, total: 9, total_pages: 3 });
    expect(t.items[0]?.period_start).toEqual(at('2026-09-25T15:00:00Z')); // the planned trip (planned start 15:00 on the 25th)
    const done = (
      await report(service(), {
        statuses: ['completed'],
        sortBy: 'delay_minutes',
        sortOrder: 'desc',
      })
    ).data.table.items;
    expect(done.map(i => i.delay_minutes)).toEqual([180, 30, -10, null]); // null (not judged) last
    expect(done[0]).toMatchObject({
      status: 'completed',
      vehicle: { id: '7', name: 'Truck 7', plate: 'ABC-7' },
      driver: { id: '9', name: 'Ada Lovelace' },
      on_time: false,
      distance_variance_km: null,
      customer: null,
    });
    expect(done[1]).toMatchObject({ distance_variance_km: 10, on_time: false });
    const filtered = await report(service(), { statuses: ['cancelled'] });
    expect(filtered.data.table.pagination['total']).toBe(3);
    expect(filtered.data.summary.counts['total']).toBe(9); // the summary still covers every status
    expect(filtered.meta['table_counts']).toEqual({
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 3,
    });
  });

  it('table search (reference / addresses / vehicle / driver) and empty-last sorting in both directions', async () => {
    const rows = [
      trip({ reference: 'TRIP-A', durationMinutes: null }),
      trip({ reference: 'TRIP-B', durationMinutes: 50 }),
      trip({ reference: null, originAddress: 'North Depot', durationMinutes: 10 }),
    ];
    const s = service(rows);
    expect((await report(s, { search: 'trip-b' })).data.table.items).toHaveLength(1);
    expect((await report(s, { search: 'north' })).data.table.items).toHaveLength(1);
    expect((await report(s, { search: 'ada' })).data.table.items).toHaveLength(3); // the driver's name
    for (const order of ['asc', 'desc'] as const) {
      const items = (await report(s, { sortBy: 'duration_minutes', sortOrder: order })).data.table
        .items;
      expect(items[items.length - 1]?.duration_minutes).toBeNull();
    }
  });

  it('compare: previous_period fetches the preceding window and fills previous / delta_abs / delta_pct', async () => {
    const seen: Seen = { filters: [], ranges: [] };
    const previous = [
      trip({ actualEndAt: at('2026-09-20T09:00:00Z') }),
      trip({ status: 'cancelled', actualEndAt: null, durationMinutes: null }),
    ];
    const r = await report(service(CURRENT, { previous, seen }), { compare: 'previous_period' });
    expect(r.data.previous_period).toEqual({ from: '2026-09-20', to: '2026-09-22' }); // the 3 days before 23–25 Sept
    expect(seen.ranges).toHaveLength(2);
    expect(r.data.summary.trips_total).toMatchObject({
      value: 9,
      previous: 2,
      delta_abs: 7,
      delta_pct: 350,
    });
    expect(r.data.summary.on_time_pct).toMatchObject({
      value: 33.3,
      previous: 100,
      delta_abs: -66.7,
      delta_pct: -66.7,
    });
  });

  it("filters reach the repository: scope → vehicle ids, the trip's own drivers, customers", async () => {
    const seen: Seen = { filters: [], ranges: [] };
    const repo = fakeFleetDashboardRepository({
      vehicleIdsForScope: () => Promise.resolve(['7', '8']),
      countTripsForReport: () => Promise.resolve(0),
      tripsForReport: (from: Date, to: Date, filter: TripReportFilter) => {
        seen.filters.push(filter);
        return Promise.resolve([]);
      },
      vehicleBriefs: () => Promise.resolve(new Map()),
      driverNames: () => Promise.resolve(new Map()),
      customerNames: () => Promise.resolve(new Map()),
    });
    const s = new FleetTripsReportService(repo, fakeSettingsLookup());
    await report(s, { scope: { vehicleCategory: 'truck' }, driverIds: ['9'], customerIds: ['3'] });
    expect(seen.filters[0]).toEqual({
      vehicleIds: ['7', '8'],
      driverIds: ['9'],
      customerIds: ['3'],
    });
  });

  it('refuses more than 92 buckets (422 naming the fix), more than the trip cap (422), and a caller without a company (403)', async () => {
    await expect(
      report(service(), { from: at('2025-01-01'), to: at('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(report(service(CURRENT, { count: MAX_REPORT_TRIPS + 1 }))).rejects.toThrow(
      /narrow the range or add a filter/
    );
    await expect(service().report({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('default range = the last 7 local days (7 daily buckets); the company timezone drives the bucket labels', async () => {
    const r = (await run(() => service().report({}, NOW))) as unknown as Report;
    expect(r.data.series.length).toBe(7);
    expect(r.meta).toMatchObject({
      from: '2026-09-19',
      to: '2026-09-25',
      timezone: 'UTC',
      interval: 'day',
      compare: 'none',
      definition_version: 1,
    });
  });

  it("the CSV export carries the table's filters and sort, with a header and one row per trip", async () => {
    const plan = await run(() =>
      service().exportRows(
        { ...range, statuses: ['completed'], sortBy: 'delay_minutes', sortOrder: 'asc' },
        NOW
      )
    );
    expect(plan.name).toBe('trips-report');
    expect(plan.total).toBe(4);
    expect(plan.columns.map(c => c.header).slice(0, 6)).toEqual([
      'trip_id',
      'trip_reference',
      'status',
      'vehicle_id',
      'vehicle_name',
      'driver_id',
    ]);
    const first = (await plan.batches().next()).value as { delay: number | null }[];
    expect(first.map(r => r.delay)).toEqual([-10, 30, 180, null]);
  });
});

describe('TripsReportQuerySchema', () => {
  it('accepts both id spellings, status lists, compare / interval; refuses bad values with fixed messages', () => {
    const ok = TripsReportQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      driver_id: '3,4',
      customer_id: '5',
      status: 'completed,cancelled',
      'status[]': ['planned'],
      compare: 'previous_year',
      interval: 'week',
      top_reasons: '5',
      sort_by: 'delay_minutes',
    });
    expect(ok['vehicle_id[]']).toEqual(['1', '2']);
    expect(ok.driver_id).toEqual(['3', '4']);
    expect(ok.status).toEqual(['completed', 'cancelled']);
    expect(TripsReportQuerySchema.safeParse({ status: 'flying' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ compare: 'yesterday' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ customer_id: 'abc' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ top_reasons: '51' }).success).toBe(false);
    expect(TripsReportQuerySchema.safeParse({ per_page: '101' }).success).toBe(false);
  });
});
