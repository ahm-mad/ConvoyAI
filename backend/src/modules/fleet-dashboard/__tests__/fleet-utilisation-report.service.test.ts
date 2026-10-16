import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { UtilisationReportQuerySchema } from '../fleet-analytics.schemas.js';
import type { VehicleScope } from '../fleet-dashboard.types.js';
import type { FleetTelemetryRepository, HourlyStatRow } from '../fleet-telemetry.repository.js';
import {
  FleetUtilisationReportService,
  MAX_REPORT_HOUR_ROWS,
  type UtilisationReportQuery,
} from '../fleet-utilisation-report.service.js';
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

const row = (
  vehicleId: string,
  hour: string,
  over: Partial<HourlyStatRow> = {}
): HourlyStatRow => ({
  vehicleId,
  hourStart: at(`${hour}:00:00Z`),
  packets: 4,
  distanceKm: 10,
  movingSeconds: 1800,
  stoppedSeconds: 1800,
  maxSpeedKmh: 60,
  firstPacketAt: at(`${hour}:01:00Z`),
  lastPacketAt: at(`${hour}:59:00Z`),
  ...over,
});

// 2026-09-23 is a Wednesday, 2026-09-24 a Thursday
const VEHICLES = [
  { id: '7', name: 'Truck 7', plate: 'T-7', category: 'Truck' },
  { id: '8', name: 'Van 8', plate: null, category: 'Van' },
  { id: '9', name: 'Idle Trailer', plate: 'TR-9', category: 'Trailer' }, // no telemetry
];
const ROWS: HourlyStatRow[] = [
  row('7', '2026-09-23T08'), // Wed 08:00 — 30 min moving, 30 min stopped, 10 km
  row('7', '2026-09-23T09', {
    movingSeconds: 3600,
    stoppedSeconds: 0,
    distanceKm: 50,
    maxSpeedKmh: 90,
  }), // Wed 09:00 — fully moving
  row('7', '2026-09-24T08', {
    movingSeconds: 0,
    stoppedSeconds: 3600,
    distanceKm: 0,
    maxSpeedKmh: 0,
    packets: 6,
  }), // Thu 08:00 — parked
  row('8', '2026-09-24T08', {
    movingSeconds: 900,
    stoppedSeconds: 900,
    distanceKm: 5,
    maxSpeedKmh: 40,
  }), // only half the hour is vouched for
];
const range = { from: at('2026-09-23'), to: at('2026-09-24') } as const;

interface Seen {
  ranges: [Date, Date][];
  vehicleIds: string[][];
  scopes: VehicleScope[];
}
function service(
  opts: {
    rows?: HourlyStatRow[];
    previous?: HourlyStatRow[];
    vehicles?: typeof VEHICLES;
    count?: number;
    latest?: Date | null;
    settings?: Parameters<typeof fakeSettingsLookup>[0];
    seen?: Seen;
  } = {}
) {
  const seen = opts.seen ?? { ranges: [], vehicleIds: [], scopes: [] };
  const telemetry = {
    countHourStats: () => Promise.resolve(opts.count ?? 0),
    hourStats: (from: Date, to: Date, ids: string[]) => {
      seen.ranges.push([from, to]);
      seen.vehicleIds.push(ids);
      // the report reads the current window first, then (with `compare`) the previous one
      return Promise.resolve(
        seen.ranges.length === 2 ? (opts.previous ?? []) : (opts.rows ?? ROWS)
      );
    },
    latestRolledHour: () =>
      Promise.resolve(opts.latest === undefined ? at('2026-09-25T11:00:00Z') : opts.latest),
  } as unknown as FleetTelemetryRepository;
  const repo = fakeFleetDashboardRepository({
    vehiclesForCompany: (scope: VehicleScope) => {
      seen.scopes.push(scope);
      return Promise.resolve(opts.vehicles ?? VEHICLES);
    },
  });
  return new FleetUtilisationReportService(
    repo,
    telemetry,
    fakeSettingsLookup(opts.settings ?? {})
  );
}

interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  target?: number | null;
}
interface Item {
  vehicle: { id: string; name: string };
  has_telemetry: boolean;
  distance_km: number | null;
  moving_hours: number | null;
  stopped_hours: number | null;
  moving_share_pct: number | null;
  coverage_pct: number | null;
  utilisation_pct: number | null;
  max_speed_kmh: number | null;
  packets: number | null;
  trend: number[] | null;
  last_packet_at: Date | null;
}
interface Report {
  data: {
    summary: Record<string, Metric> & { covered_hours: number };
    series: {
      bucket: string;
      distance_km: number;
      moving_hours: number;
      stopped_hours: number;
      utilisation_pct: number | null;
      coverage_pct: number | null;
      vehicles_reporting: number;
      packets: number;
    }[];
    heatmap: {
      dow: number;
      hour: number;
      moving_pct: number | null;
      moving_hours: number;
      covered_hours: number;
    }[];
    table: { items: Item[]; pagination: Record<string, unknown> };
    previous_period?: { from: string; to: string };
  };
  meta: { data_quality: Record<string, unknown>; [key: string]: unknown };
}
const report = async (s: FleetUtilisationReportService, q: UtilisationReportQuery = {}) =>
  (await run(() => s.report({ ...range, ...q }, NOW))) as unknown as Report;
const names = (r: Report) => r.data.table.items.map(i => i.vehicle.name);

describe('FleetUtilisationReportService.report', () => {
  it('summary: hours, distance, utilisation over the vehicles that have telemetry, coverage, moving share, max speed', async () => {
    const s = (await report(service())).data.summary;
    expect(s['distance_km']?.value).toBe(65); // 10 + 50 + 0 + 5
    expect(s['moving_hours']?.value).toBe(1.75); // (1800 + 3600 + 0 + 900) s
    expect(s['stopped_hours']?.value).toBe(1.75); // (1800 + 0 + 3600 + 900) s
    expect(s.covered_hours).toBe(3.5);
    expect(s['vehicles_reporting']?.value).toBe(2);
    expect(s['packets']?.value).toBe(18);
    expect(s['max_speed_kmh']?.value).toBe(90);
    // 2 vehicles with telemetry × 24 scheduled h × 2 local days = 96 h
    expect(s['utilisation_pct']?.value).toBe(1.8); // 1.75 / 96
    expect(s['utilisation_pct']?.target).toBeNull();
    expect(s['coverage_pct']?.value).toBe(3.6); // 3.5 / 96
    expect(s['moving_share_pct']?.value).toBe(50);
    expect(s['distance_km']).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
  });

  it('the scheduled hours per vehicle per day and the utilisation target come from the company settings', async () => {
    const s = (
      await report(
        service({ settings: { scheduledHoursPerVehiclePerDay: 8, utilisationTargetPct: 60 } })
      )
    ).data.summary;
    expect(s['utilisation_pct']?.value).toBe(5.5); // 1.75 / (2 × 8 × 2 = 32)
    expect(s['utilisation_pct']?.target).toBe(60);
    expect(s['coverage_pct']?.value).toBe(3.6); // coverage is always against 24 h
  });

  it("series: one point per local day; the vehicle set is the range's so buckets are comparable", async () => {
    const r = await report(service());
    expect(r.data.series).toEqual([
      {
        bucket: '2026-09-23',
        distance_km: 60,
        moving_hours: 1.5,
        stopped_hours: 0.5,
        utilisation_pct: 3.1,
        coverage_pct: 4.2,
        vehicles_reporting: 1,
        packets: 8,
      },
      {
        bucket: '2026-09-24',
        distance_km: 5,
        moving_hours: 0.25,
        stopped_hours: 1.25,
        utilisation_pct: 0.5,
        coverage_pct: 3.1,
        vehicles_reporting: 2,
        packets: 10,
      },
    ]);
  });

  it('interval = hour: one point per hour, an hour of a vehicle is judged against one hour', async () => {
    const r = await report(service({ rows: ROWS.slice(0, 2) }), {
      interval: 'hour',
      to: at('2026-09-23'),
    });
    expect(r.data.series.length).toBe(24);
    expect(r.data.series[8]).toMatchObject({
      bucket: '2026-09-23T08:00',
      moving_hours: 0.5,
      utilisation_pct: 50,
      coverage_pct: 100,
      vehicles_reporting: 1,
    });
    expect(r.data.series[9]).toMatchObject({
      bucket: '2026-09-23T09:00',
      moving_hours: 1,
      utilisation_pct: 100,
    });
    expect(r.data.series[10]).toMatchObject({
      moving_hours: 0,
      vehicles_reporting: 0,
      distance_km: 0,
    });
    await expect(
      report(service(), { interval: 'hour', from: at('2026-09-15'), to: at('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError); // > 168 hourly buckets
  });

  it('heatmap: 168 cells, Monday = 1 … Sunday = 7, the share of the vouched-for time spent moving', async () => {
    const h = (await report(service())).data.heatmap;
    expect(h.length).toBe(168);
    const cell = (dow: number, hour: number) => h.find(c => c.dow === dow && c.hour === hour);
    expect(cell(3, 8)).toEqual({
      dow: 3,
      hour: 8,
      moving_pct: 50,
      moving_hours: 0.5,
      covered_hours: 1,
    }); // Wednesday 08:00
    expect(cell(3, 9)).toEqual({
      dow: 3,
      hour: 9,
      moving_pct: 100,
      moving_hours: 1,
      covered_hours: 1,
    });
    expect(cell(4, 8)).toEqual({
      dow: 4,
      hour: 8,
      moving_pct: 16.7,
      moving_hours: 0.25,
      covered_hours: 1.5,
    }); // Thursday: two vehicles, 900 moving of 5400 vouched-for seconds
    expect(cell(1, 0)).toEqual({
      dow: 1,
      hour: 0,
      moving_pct: null,
      moving_hours: 0,
      covered_hours: 0,
    });
  });

  it('the heatmap follows the company timezone (Karachi = UTC+5: Wednesday 08:00Z is 13:00, 20:00Z is Thursday 01:00)', async () => {
    const rows = [
      ...ROWS.slice(0, 2),
      row('7', '2026-09-23T20', { movingSeconds: 3600, stoppedSeconds: 0 }),
    ];
    const h = (await report(service({ rows, settings: { timezone: 'Asia/Karachi' } }))).data
      .heatmap;
    const cell = (dow: number, hour: number) => h.find(c => c.dow === dow && c.hour === hour);
    expect(cell(3, 13)?.moving_pct).toBe(50);
    expect(cell(3, 14)?.moving_pct).toBe(100);
    expect(cell(4, 1)?.moving_pct).toBe(100);
    expect(cell(3, 8)?.moving_pct).toBeNull();
  });

  it('table: every in-service vehicle in scope; vehicles without telemetry listed with nulls (last); rates per vehicle; trend per bucket', async () => {
    const r = await report(service());
    expect(names(r)).toEqual(['Truck 7', 'Van 8', 'Idle Trailer']); // default: moving hours desc, no telemetry last
    const [truck, van, trailer] = r.data.table.items as [Item, Item, Item];
    expect(truck).toMatchObject({
      has_telemetry: true,
      distance_km: 60,
      moving_hours: 1.5,
      stopped_hours: 1.5,
      moving_share_pct: 50,
      coverage_pct: 6.3,
      utilisation_pct: 3.1,
      max_speed_kmh: 90,
      packets: 14,
      trend: [1.5, 0],
    });
    expect(truck.last_packet_at).toEqual(at('2026-09-24T08:59:00Z'));
    expect(van).toMatchObject({
      distance_km: 5,
      moving_hours: 0.25,
      coverage_pct: 1,
      utilisation_pct: 0.5,
      trend: [0, 0.25],
    });
    expect(trailer).toMatchObject({
      has_telemetry: false,
      distance_km: null,
      moving_hours: null,
      utilisation_pct: null,
      coverage_pct: null,
      max_speed_kmh: null,
      packets: null,
      trend: null,
      last_packet_at: null,
    });
  });

  it('search, sorts (empty values last in both directions), paging', async () => {
    const s = service();
    expect(names(await report(s, { search: 'tr' }))).toEqual(['Truck 7', 'Idle Trailer']); // name or plate
    expect(names(await report(s, { sortBy: 'vehicle_name' }))).toEqual([
      'Idle Trailer',
      'Truck 7',
      'Van 8',
    ]);
    expect(names(await report(s, { sortBy: 'vehicle_name', sortOrder: 'desc' }))).toEqual([
      'Van 8',
      'Truck 7',
      'Idle Trailer',
    ]);
    expect(names(await report(s, { sortBy: 'utilisation_pct', sortOrder: 'asc' }))).toEqual([
      'Van 8',
      'Truck 7',
      'Idle Trailer',
    ]);
    expect(names(await report(s, { sortBy: 'utilisation_pct', sortOrder: 'desc' }))).toEqual([
      'Truck 7',
      'Van 8',
      'Idle Trailer',
    ]);
    expect(names(await report(s, { sortBy: 'max_speed_kmh' }))).toEqual([
      'Truck 7',
      'Van 8',
      'Idle Trailer',
    ]);
    expect(names(await report(s, { sortBy: 'last_packet_at' }))).toEqual([
      'Truck 7',
      'Van 8',
      'Idle Trailer',
    ]);
    const paged = await report(s, { window: { page: 2, perPage: 2 } });
    expect(names(paged)).toEqual(['Idle Trailer']);
    expect(paged.data.table.pagination).toMatchObject({ total: 3, page: 2, per_page: 2 });
    expect((await report(s, { search: 'tr' })).data.summary['distance_km']?.value).toBe(65); // the summary does not follow the search
  });

  it('the scope goes to the vehicle lookup and the rows are read for exactly those vehicles', async () => {
    const seen: Seen = { ranges: [], vehicleIds: [], scopes: [] };
    await report(service({ seen }), { scope: { vehicleCategory: 'Truck', driverIds: ['4'] } });
    expect(seen.scopes[0]).toEqual({ vehicleCategory: 'Truck', driverIds: ['4'] });
    expect(seen.vehicleIds[0]).toEqual(['7', '8', '9']);
  });

  it('compare = previous_period fills previous / delta with its own vehicle set and days, and names the window', async () => {
    const r = await report(service({ previous: [row('7', '2026-09-21T08')] }), {
      compare: 'previous_period',
    });
    expect(r.data.previous_period).toEqual({ from: '2026-09-21', to: '2026-09-22' });
    expect(r.data.summary['distance_km']).toMatchObject({
      value: 65,
      previous: 10,
      delta_abs: 55,
      delta_pct: 550,
    });
    expect(r.data.summary['vehicles_reporting']).toMatchObject({
      value: 2,
      previous: 1,
      delta_abs: 1,
    });
    expect(r.data.summary['utilisation_pct']).toMatchObject({
      value: 1.8,
      previous: 1,
      delta_abs: 0.8,
    }); // previous: 0.5 h / (1 × 24 × 2)
  });

  it('data_quality: vehicle counts, the latest rolled hour, the fallback gap limit from the freshness setting and the adaptive rule', async () => {
    const q = (await report(service({ settings: { positionFreshnessMinutes: 20 } }))).meta
      .data_quality;
    const { gap_limit_rule: rule, ...rest } = q;
    expect(rest).toEqual({
      vehicles_total: 3,
      vehicles_with_telemetry: 2,
      rollup_latest_hour: '2026-09-25T11:00:00.000Z',
      default_gap_limit_minutes: 40,
      moving_threshold_kmh: 2,
      idle_available: false,
    });
    expect(String(rule)).toContain("2.5 × the device's typical report interval");
    expect(
      (await report(service({ latest: null }))).meta.data_quality['rollup_latest_hour']
    ).toBeNull();
  });

  it('no vehicles / no rows: zeros and nulls, never NaN; the heatmap still has its 168 empty cells', async () => {
    const r = await report(service({ vehicles: [], rows: [] }));
    expect(r.data.summary['distance_km']?.value).toBe(0);
    expect(r.data.summary['utilisation_pct']?.value).toBeNull();
    expect(r.data.summary['coverage_pct']?.value).toBeNull();
    expect(r.data.summary['max_speed_kmh']?.value).toBeNull();
    expect(r.data.table.items).toEqual([]);
    expect(r.data.heatmap.length).toBe(168);
    expect(r.data.series.every(p => p.utilisation_pct === null && p.moving_hours === 0)).toBe(true);
  });

  it('refuses ranges that are too big, and needs a company', async () => {
    await expect(report(service({ count: MAX_REPORT_HOUR_ROWS + 1 }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      report(service(), { from: at('2020-01-01'), to: at('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError); // > 92 day buckets
    await expect(service().report({ ...range }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('FleetUtilisationReportService.exportRows', () => {
  it("plans a CSV of every matching vehicle with the table's filters / sort", async () => {
    const plan = await run(() => service().exportRows({ ...range }, NOW));
    expect(plan.name).toBe('utilisation-report');
    expect(plan.total).toBe(3);
    expect(plan.columns.map(c => c.header).slice(0, 6)).toEqual([
      'vehicle_id',
      'vehicle_name',
      'plate',
      'category',
      'has_telemetry',
      'distance_km',
    ]);
    const rows: unknown[][] = [];
    for await (const batch of plan.batches())
      for (const r of batch) rows.push(plan.columns.map(c => c.value(r)));
    expect(rows[0]).toEqual([
      '7',
      'Truck 7',
      'T-7',
      'Truck',
      true,
      60,
      1.5,
      1.5,
      50,
      6.3,
      3.1,
      90,
      14,
      at('2026-09-24T08:59:00Z'),
    ]);
    expect(rows[2]).toEqual([
      '9',
      'Idle Trailer',
      'TR-9',
      'Trailer',
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect((await run(() => service().exportRows({ ...range, search: 'van' }, NOW))).total).toBe(1);
  });
});

describe('UtilisationReportQuerySchema', () => {
  it('accepts the shared scope spellings, the hour interval and the table params; rejects bad values', () => {
    const ok = UtilisationReportQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      driver_id: '3,4',
      interval: 'hour',
      sort_by: 'utilisation_pct',
      sort_order: 'desc',
      page: '2',
      per_page: '50',
      search: 'truck',
    });
    expect(ok.interval).toBe('hour');
    expect(UtilisationReportQuerySchema.safeParse({ interval: 'minute' }).success).toBe(false);
    expect(UtilisationReportQuerySchema.safeParse({ compare: 'yesterday' }).success).toBe(false);
    expect(UtilisationReportQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
    expect(UtilisationReportQuerySchema.safeParse({ per_page: '101' }).success).toBe(false);
    expect(UtilisationReportQuerySchema.safeParse({ vehicle_id: 'abc' }).success).toBe(false);
  });
});
