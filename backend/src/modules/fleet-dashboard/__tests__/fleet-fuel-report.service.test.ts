import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FuelReportQuerySchema } from '../fleet-analytics.schemas.js';
import type { FuelReportRow } from '../fleet-dashboard.types.js';
import {
  FleetFuelReportService,
  MAX_REPORT_FILLS,
  effectiveCost,
  type FuelReportQuery,
} from '../fleet-fuel-report.service.js';
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
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const G = 3.785411784;

const TRUCK = { name: 'Truck 7', plate: 'TRK-7', category: 'Truck', tankCapacityLiters: 60 };
const VAN = { name: 'Van 8', plate: null, category: 'van', tankCapacityLiters: null };
let seq = 0;
const fill = (over: Partial<FuelReportRow> & { date: string; liters?: number }): FuelReportRow => {
  seq += 1;
  const liters = over.liters ?? over.volume ?? 30;
  const { date, ...rest } = over;
  return {
    id: String(seq),
    vehicleId: '7',
    fillDate: day(date),
    volume: liters,
    unit: 'liters',
    liters,
    cost: null,
    totalCost: null,
    unitPrice: null,
    paymentMethod: null,
    vendor: null,
    stationName: null,
    receiptReference: null,
    tripId: null,
    odometerKm: null,
    isFullTank: true,
    createdAt: null,
    vehicle: TRUCK,
    ...rest,
  };
};

const ROWS: FuelReportRow[] = [
  fill({
    date: '2026-09-01',
    liters: 40,
    odometerKm: 1000,
    totalCost: 80,
    vendor: 'Shell',
    paymentMethod: 'card',
  }), // 1: opens the sequence
  fill({
    date: '2026-09-05',
    liters: 30,
    odometerKm: 1400,
    totalCost: 60,
    vendor: 'Shell',
    paymentMethod: 'card',
  }), // 2: 400 km / 30 L
  fill({ date: '2026-09-10', liters: 35, odometerKm: 1800, totalCost: 70, vendor: 'shell ' }), // 3: 400 km / 35 L
  fill({ date: '2026-09-15', liters: 50, odometerKm: 2100, totalCost: 100, vendor: 'Total' }), // 4: 300 km / 50 L = 6.0 → economy drop
  fill({ date: '2026-09-16', liters: 70, odometerKm: 2150, totalCost: 140, isFullTank: false }), // 5: 70 L > 60 L tank
  fill({ date: '2026-09-17', liters: 20, odometerKm: 2140, isFullTank: false }), // 6: odometer lower than fill 5
  fill({
    date: '2026-09-02',
    vehicleId: '8',
    vehicle: VAN,
    volume: 10,
    unit: 'gallons',
    liters: 10 * G,
    odometerKm: 500,
    totalCost: 0,
    cost: 60,
    vendor: 'Total',
  }), // 7: total_cost 0 → cost 60
  fill({ date: '2026-09-12', vehicleId: '8', vehicle: VAN, liters: 20, odometerKm: 800 }), // 8: 300 km / 20 L = 15.0, no cost
];

interface Seen {
  calls: { from: Date; to: Date; vehicleIds: string[] | undefined }[];
}
function service(
  rows = ROWS,
  opts: {
    count?: number;
    previous?: FuelReportRow[];
    tripKm?: number;
    scope?: string[] | undefined;
    seen?: Seen;
  } = {}
) {
  const seen = opts.seen ?? { calls: [] };
  const repo = fakeFleetDashboardRepository({
    vehicleIdsForScope: () => Promise.resolve(opts.scope),
    countFuelFillsForReport: () => Promise.resolve(opts.count ?? rows.length),
    fuelFillsForReport: (from: Date, to: Date, _tz: string, vehicleIds?: string[]) => {
      seen.calls.push({ from, to, vehicleIds });
      return Promise.resolve(seen.calls.length === 2 && opts.previous ? opts.previous : rows);
    },
    completedTripsAggInRange: () =>
      Promise.resolve({ totalMinutes: 0, totalKm: opts.tripKm ?? 500 }),
  });
  return new FleetFuelReportService(repo, fakeSettingsLookup());
}
const range = { from: day('2026-09-01'), to: day('2026-09-20') } as const;

interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
}
interface Row {
  fill_id: string;
  anomaly_types: string[];
  economy_km_per_l: number | null;
  price_per_liter: number | null;
  cost: number | null;
  vehicle: { name: string };
  [k: string]: unknown;
}
interface Report {
  data: {
    summary: {
      fills: Metric;
      liters: Metric;
      total_cost: Metric;
      avg_price_per_liter: Metric;
      fuel_economy_km_per_l: Metric;
      fuel_cost_per_km: Metric;
      samples: Record<string, number>;
    };
    series: {
      bucket: string;
      fills: number;
      liters: number;
      total_cost: number;
      avg_price_per_liter: number | null;
      fuel_economy_km_per_l: number | null;
    }[];
    by_vehicle_category: Record<string, unknown>[];
    by_vendor: { items: Record<string, unknown>[]; other_count: number };
    anomalies: { total: number; by_type: Record<string, number>; items: Record<string, unknown>[] };
    table: { items: Row[]; pagination: Record<string, unknown> };
    previous_period?: unknown;
  };
  meta: Record<string, unknown>;
}
const report = async (s: FleetFuelReportService, q: FuelReportQuery = {}) =>
  (await run(() => s.report({ ...range, ...q }, NOW))) as unknown as Report;

describe('effectiveCost', () => {
  it('total_cost, else cost; a total_cost of 0 falls back to cost; nothing → null', () => {
    expect(effectiveCost({ totalCost: 100, cost: 5 })).toBe(100);
    expect(effectiveCost({ totalCost: 0, cost: 60 })).toBe(60);
    expect(effectiveCost({ totalCost: null, cost: 40 })).toBe(40);
    expect(effectiveCost({ totalCost: null, cost: null })).toBeNull();
    expect(effectiveCost({ totalCost: 0, cost: 0 })).toBeNull();
  });
});

describe('FleetFuelReportService.report', () => {
  it('summary: litres (gallons converted), cost (total_cost else cost), price per litre over the priced fills only, full-tank economy, fuel cost per km', async () => {
    const s = (await report(service())).data.summary;
    expect(s.fills.value).toBe(8);
    expect(s.liters.value).toBeCloseTo(40 + 30 + 35 + 50 + 70 + 20 + 10 * G + 20, 2);
    expect(s.total_cost.value).toBe(510); // 80 + 60 + 70 + 100 + 140 + 60 (the van's total_cost 0 falls back to cost 60)
    expect(s.avg_price_per_liter.value).toBeCloseTo(510 / (40 + 30 + 35 + 50 + 70 + 10 * G), 3); // the two fills without a cost are NOT in the denominator
    expect(s.samples).toEqual({ priced_fills: 6, economy_intervals: 4, fills_with_odometer: 8 });
    expect(s.fuel_economy_km_per_l.value).toBe(10.37); // (400 + 400 + 300 + 300) km / (30 + 35 + 50 + 20) L
    expect(s.fuel_cost_per_km.value).toBe(1.02); // 510 / 500 trip km
    expect(s.fills).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
  });

  it('no fills / no odometer / no cost → null figures, never 0', async () => {
    const empty = (await report(service([], { tripKm: 0 }))).data.summary;
    expect([
      empty.avg_price_per_liter.value,
      empty.fuel_economy_km_per_l.value,
      empty.fuel_cost_per_km.value,
    ]).toEqual([null, null, null]);
    const noOdo = (await report(service([fill({ date: '2026-09-03', liters: 10 })]))).data.summary;
    expect(noOdo.fuel_economy_km_per_l.value).toBeNull();
    expect(noOdo.avg_price_per_liter.value).toBeNull();
    expect(noOdo.fills.value).toBe(1);
  });

  it('series: a fill in the bucket of its date, an economy interval in the bucket of the fill that CLOSED it; the buckets add up to the range', async () => {
    const r = await report(service());
    expect(r.data.series).toHaveLength(20);
    const by = Object.fromEntries(r.data.series.map(p => [p.bucket, p]));
    expect(by['2026-09-05']).toMatchObject({
      fills: 1,
      liters: 30,
      total_cost: 60,
      avg_price_per_liter: 2,
      fuel_economy_km_per_l: 13.33,
    });
    expect(by['2026-09-15']).toMatchObject({ fuel_economy_km_per_l: 6 });
    expect(by['2026-09-16']).toMatchObject({ fills: 1, fuel_economy_km_per_l: null }); // a partial fill closes no interval
    expect(by['2026-09-19']).toMatchObject({
      fills: 0,
      liters: 0,
      avg_price_per_liter: null,
      fuel_economy_km_per_l: null,
    });
    expect(r.data.series.reduce((n, p) => n + p.fills, 0)).toBe(8);
    expect(r.data.series.reduce((n, p) => n + p.total_cost, 0)).toBe(510);
  });

  it('breakdown by vehicle category (stored spelling) with economy per category, and by vendor (case / spaces ignored, top N + the rest)', async () => {
    const r = await report(service());
    const cats = Object.fromEntries(
      r.data.by_vehicle_category.map(c => [c['category'] as string, c])
    );
    expect(cats['Truck']).toMatchObject({
      vehicles: 1,
      fills: 6,
      total_cost: 450,
      fuel_economy_km_per_l: 9.57,
    }); // 1100 km / 115 L
    expect(cats['van']).toMatchObject({
      vehicles: 1,
      fills: 2,
      total_cost: 60,
      fuel_economy_km_per_l: 15,
    });
    expect(r.data.by_vehicle_category[0]?.['category']).toBe('Truck'); // most litres first
    const vendors = r.data.by_vendor.items;
    // Shell: fills 1, 2, 3 (the "shell " spelling merges) = 210; Total: fills 4, 7 = 160; no vendor: 5, 6, 8 = 140
    expect(vendors.map(v => [v['vendor'], v['fills'], v['total_cost']])).toEqual([
      ['Shell', 3, 210],
      ['Total', 2, 160],
      [null, 3, 140],
    ]);
    expect(r.data.by_vendor.other_count).toBe(0);
    const top1 = await report(service(), { topVendors: 1 });
    expect(top1.data.by_vendor.items).toHaveLength(1);
    expect(top1.data.by_vendor.other_count).toBe(2);
  });

  it("anomalies: over capacity, economy drop against the vehicle's OTHER intervals, odometer going backwards", async () => {
    const r = await report(service());
    expect(r.data.anomalies.total).toBe(3);
    expect(r.data.anomalies.by_type).toEqual({
      over_capacity: 1,
      economy_drop: 1,
      odometer_backwards: 1,
    });
    const items = r.data.anomalies.items;
    expect(items.map(i => i['types'])).toEqual([
      ['odometer_backwards'],
      ['over_capacity'],
      ['economy_drop'],
    ]); // newest first
    expect(items[1]).toMatchObject({ liters: 70, tank_capacity_liters: 60 });
    expect(items[2]).toMatchObject({
      economy_km_per_l: 6,
      baseline_economy_km_per_l: 12.31,
      drop_pct: 51.3,
    }); // baseline = (400 + 400) km / (30 + 35) L
    expect(items[0]).toMatchObject({ odometer_km: 2140, previous_odometer_km: 2150 });
    // a higher threshold clears the economy flag; the vehicle with a single interval never has a baseline
    const strict = await report(service(), { economyDropPct: 60 });
    expect(strict.data.anomalies.by_type['economy_drop']).toBe(0);
    expect(strict.meta['economy_drop_pct']).toBe(60);
    expect(r.meta['economy_drop_pct']).toBe(30);
  });

  it('table: newest fill first, per-fill economy (closing full fills only), price per litre, anomaly types; table filters never change the summary', async () => {
    const r = await report(service(), { window: { page: 1, perPage: 4 } });
    expect(r.data.table.pagination).toEqual({ page: 1, per_page: 4, total: 8, total_pages: 2 });
    expect(r.data.table.items.map(i => i.fill_id)).toEqual(['6', '5', '4', '8']);
    const f4 = r.data.table.items.find(i => i.fill_id === '4');
    expect(f4).toMatchObject({
      economy_km_per_l: 6,
      price_per_liter: 2,
      anomaly_types: ['economy_drop'],
    });
    const flagged = await report(service(), { anomaly: true });
    expect(flagged.data.table.pagination['total']).toBe(3);
    expect(flagged.data.summary.fills.value).toBe(8);
    expect((await report(service(), { anomaly: false })).data.table.pagination['total']).toBe(5);
    expect(
      (await report(service(), { anomalyTypes: ['over_capacity'] })).data.table.pagination['total']
    ).toBe(1);
    expect((await report(service(), { vendor: 'SHELL' })).data.table.pagination['total']).toBe(3);
    expect(
      (await report(service(), { paymentMethod: 'CARD' })).data.table.pagination['total']
    ).toBe(2);
    expect((await report(service(), { isFullTank: false })).data.table.pagination['total']).toBe(2);
    expect((await report(service(), { search: 'trk-7' })).data.table.pagination['total']).toBe(6);
  });

  it('table sorts: empty values last in both directions (price per litre, economy)', async () => {
    for (const order of ['asc', 'desc'] as const) {
      const price = (
        await report(service(), {
          sortBy: 'price_per_liter',
          sortOrder: order,
          window: { page: 1, perPage: 100 },
        })
      ).data.table.items;
      expect(price.slice(-2).every(i => i.price_per_liter === null)).toBe(true);
      const eco = (
        await report(service(), {
          sortBy: 'economy_km_per_l',
          sortOrder: order,
          window: { page: 1, perPage: 100 },
        })
      ).data.table.items;
      expect(eco.slice(-4).every(i => i.economy_km_per_l === null)).toBe(true);
    }
    const desc = (await report(service(), { sortBy: 'liters', sortOrder: 'desc' })).data.table
      .items;
    expect(desc[0]?.['liters']).toBe(70);
  });

  it('compare: the previous window is read and filled into previous / delta_abs / delta_pct', async () => {
    const seen: Seen = { calls: [] };
    const previous = [fill({ date: '2026-08-20', liters: 100, totalCost: 100, odometerKm: 100 })];
    const r = await report(service(ROWS, { previous, seen }), { compare: 'previous_period' });
    expect(r.data.previous_period).toEqual({ from: '2026-08-12', to: '2026-08-31' });
    expect(seen.calls).toHaveLength(2);
    expect(r.data.summary.fills).toMatchObject({
      value: 8,
      previous: 1,
      delta_abs: 7,
      delta_pct: 700,
    });
    expect(r.data.summary.total_cost).toMatchObject({
      previous: 100,
      delta_abs: 410,
      delta_pct: 410,
    });
  });

  it('the scope is resolved to vehicle ids and passed to the reads', async () => {
    const seen: Seen = { calls: [] };
    await report(service(ROWS, { scope: ['7'], seen }), { scope: { vehicleCategory: 'truck' } });
    expect(seen.calls[0]?.vehicleIds).toEqual(['7']);
  });

  it('refuses more than 92 buckets and more than the fill cap (422) and a caller without a company (403)', async () => {
    await expect(
      report(service(), { from: day('2025-01-01'), to: day('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(report(service(ROWS, { count: MAX_REPORT_FILLS + 1 }))).rejects.toThrow(
      /narrow the range or add a filter/
    );
    await expect(service().report({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the CSV export carries the table's filters / sort, converted litres and the anomaly flags", async () => {
    const plan = await run(() =>
      service().exportRows({ ...range, anomaly: true, sortBy: 'liters', sortOrder: 'desc' }, NOW)
    );
    expect(plan.name).toBe('fuel-report');
    expect(plan.total).toBe(3);
    expect(plan.columns.map(c => c.header)).toEqual(
      expect.arrayContaining([
        'fill_id',
        'fill_date',
        'liters',
        'price_per_liter',
        'economy_km_per_l',
        'anomalies',
      ])
    );
    const first = (await plan.batches().next()).value as { types: string[]; row: FuelReportRow }[];
    expect(first.map(r => r.row.liters)).toEqual([70, 50, 20]);
    expect(plan.columns.find(c => c.header === 'anomalies')?.value(first[1] as never)).toBe(
      'economy_drop'
    );
    expect(plan.columns.find(c => c.header === 'fill_date')?.value(first[0] as never)).toBe(
      '2026-09-16'
    );
  });
});

describe('FuelReportQuerySchema', () => {
  it('accepts both id spellings, flags, anomaly lists; refuses bad values with fixed messages', () => {
    const ok = FuelReportQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      anomaly: '1',
      is_full_tank: 'false',
      anomaly_type: 'over_capacity,economy_drop',
      'anomaly_type[]': ['odometer_backwards'],
      compare: 'previous_year',
      economy_drop_pct: '40',
      top_vendors: '5',
      sort_by: 'economy_km_per_l',
    });
    expect(ok['vehicle_id[]']).toEqual(['1', '2']);
    expect(ok.anomaly_type).toEqual(['over_capacity', 'economy_drop']);
    expect(ok.economy_drop_pct).toBe(40);
    expect(FuelReportQuerySchema.safeParse({ anomaly_type: 'flat_tyre' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ economy_drop_pct: '0' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ economy_drop_pct: '100' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ top_anomalies: '101' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ anomaly: 'maybe' }).success).toBe(false);
    expect(FuelReportQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
  });
});
