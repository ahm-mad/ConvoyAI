import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { MaintenanceReportQuerySchema } from '../fleet-analytics.schemas.js';
import type { MaintenanceReportRow } from '../fleet-dashboard.types.js';
import {
  FleetMaintenanceReportService,
  MAX_REPORT_MAINTENANCE_LOGS,
  type MaintenanceDueStatesLookup,
  type MaintenanceReportQuery,
} from '../fleet-maintenance-report.service.js';
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
const TRUCK = { name: 'Truck 7', plate: 'TRK-7', category: 'Truck' };
const VAN = { name: 'Van 8', plate: null, category: 'van' };
let seq = 0;
const log = (date: string, over: Partial<MaintenanceReportRow> = {}): MaintenanceReportRow => {
  seq += 1;
  return {
    id: String(seq),
    vehicleId: '7',
    serviceType: 'Oil',
    serviceDate: day(date),
    cost: null,
    vehicle: TRUCK,
    ...over,
  };
};
const ROWS: MaintenanceReportRow[] = [
  log('2026-09-02', { cost: 40 }),
  log('2026-09-05', { cost: 60, serviceType: 'oil ' }), // same type, other spelling
  log('2026-09-10', { cost: 200, serviceType: 'Tyres' }),
  log('2026-09-12', { vehicleId: '8', vehicle: VAN, serviceType: 'Brakes' }), // no cost
  log('2026-09-15', { vehicleId: '8', vehicle: VAN, cost: 100 }),
];
const STATES: Awaited<ReturnType<MaintenanceDueStatesLookup['dueStatesFor']>> = [
  { scheduleId: '1', vehicleId: '7', status: 'overdue', daysUntilDue: -3 },
  { scheduleId: '2', vehicleId: '7', status: 'due_soon', daysUntilDue: 5 },
  { scheduleId: '3', vehicleId: '8', status: 'due_soon', daysUntilDue: 20 },
  { scheduleId: '4', vehicleId: '8', status: 'ok', daysUntilDue: 90 },
  { scheduleId: '5', vehicleId: '8', status: 'ok', daysUntilDue: null }, // due by odometer only
  { scheduleId: '6', vehicleId: '8', status: 'unknown', daysUntilDue: null },
];

interface Seen {
  calls: { from: Date; to: Date; vehicleIds: string[] | undefined }[];
  dueScope: (string[] | undefined)[];
}
function service(
  rows = ROWS,
  opts: {
    previous?: MaintenanceReportRow[];
    tripKm?: number;
    scope?: string[] | undefined;
    states?: typeof STATES;
    seen?: Seen;
  } = {}
) {
  const seen = opts.seen ?? { calls: [], dueScope: [] };
  const repo = fakeFleetDashboardRepository({
    vehicleIdsForScope: () => Promise.resolve(opts.scope),
    maintenanceLogsForReport: (from: Date, to: Date, _tz: string, vehicleIds?: string[]) => {
      seen.calls.push({ from, to, vehicleIds });
      return Promise.resolve(seen.calls.length === 2 && opts.previous ? opts.previous : rows);
    },
    completedTripsAggInRange: () =>
      Promise.resolve({ totalMinutes: 0, totalKm: opts.tripKm ?? 1000 }),
    availabilityCounts: () => Promise.resolve({ active: 10, inMaintenance: 3 }),
  });
  const due: MaintenanceDueStatesLookup = {
    dueStatesFor: ids => {
      seen.dueScope.push(ids);
      return Promise.resolve(opts.states ?? STATES);
    },
  };
  return new FleetMaintenanceReportService(
    repo,
    fakeSettingsLookup({ maintenanceDueSoonDays: 7, maintenanceDueSoonKm: 500 }),
    due
  );
}
const range = { from: day('2026-09-01'), to: day('2026-09-20') } as const;

interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
}
interface Report {
  data: {
    summary: {
      maintenance_cost: Metric;
      logs: Metric;
      avg_cost_per_log: Metric;
      cost_per_km: Metric;
      vehicles_serviced: Metric;
      samples: Record<string, number>;
    };
    series: { bucket: string; logs: number; cost: number; vehicles: number }[];
    by_service_type: { items: Record<string, unknown>[]; other_count: number };
    by_vehicle_category: Record<string, unknown>[];
    top_vehicles: { items: Record<string, unknown>[]; other_count: number };
    schedules: {
      total: number;
      by_status: Record<string, number>;
      by_due_window: Record<string, number>;
      overdue_pct: number | null;
    };
    fleet: Record<string, number>;
    previous_period?: unknown;
  };
  meta: Record<string, unknown>;
}
const report = async (s: FleetMaintenanceReportService, q: MaintenanceReportQuery = {}) =>
  (await run(() => s.report({ ...range, ...q }, NOW))) as unknown as Report;

describe('FleetMaintenanceReportService.report', () => {
  it('summary: cost, logs, average over the logs that have a cost, cost per km, vehicles serviced', async () => {
    const s = (await report(service())).data.summary;
    expect(s.maintenance_cost.value).toBe(400);
    expect(s.logs.value).toBe(5);
    expect(s.avg_cost_per_log.value).toBe(100); // 400 / the 4 logs that carry a cost
    expect(s.cost_per_km.value).toBe(0.4); // 400 / 1000 trip km
    expect(s.vehicles_serviced.value).toBe(2);
    expect(s.samples).toEqual({ logs_with_cost: 4 });
    expect(s.logs).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
  });

  it('no logs / no cost / no km → null figures, never 0', async () => {
    const empty = (await report(service([], { tripKm: 0 }))).data.summary;
    expect([empty.avg_cost_per_log.value, empty.cost_per_km.value]).toEqual([null, null]);
    expect(empty.maintenance_cost.value).toBe(0);
    const free = (await report(service([log('2026-09-03')]))).data.summary;
    expect(free.avg_cost_per_log.value).toBeNull();
    expect(free.cost_per_km.value).toBeNull();
    expect(free.logs.value).toBe(1);
  });

  it('series: a log in the bucket of its service date; the buckets add up', async () => {
    const r = await report(service());
    expect(r.data.series).toHaveLength(20);
    const by = Object.fromEntries(r.data.series.map(p => [p.bucket, p]));
    expect(by['2026-09-05']).toMatchObject({ logs: 1, cost: 60, vehicles: 1 });
    expect(by['2026-09-19']).toMatchObject({ logs: 0, cost: 0 });
    expect(r.data.series.reduce((n, p) => n + p.logs, 0)).toBe(5);
    expect(r.data.series.reduce((n, p) => n + p.cost, 0)).toBe(400);
  });

  it('by service type (case / spaces merged, most cost then most logs), category and top vehicles, with cost shares', async () => {
    const r = await report(service());
    // Oil = 40 + 60 + 100 = 200 over 3 logs, Tyres 200 over 1 (tie on cost → more logs first), Brakes 1 log without cost
    expect(
      r.data.by_service_type.items.map(t => [
        t['service_type'],
        t['logs'],
        t['cost'],
        t['share_pct'],
      ])
    ).toEqual([
      ['Oil', 3, 200, 50],
      ['Tyres', 1, 200, 50],
      ['Brakes', 1, 0, 0],
    ]);
    expect(r.data.by_service_type.items[0]).toMatchObject({ avg_cost: 66.67 });
    expect(r.data.by_service_type.items[2]).toMatchObject({ avg_cost: null });
    expect(r.data.by_service_type.other_count).toBe(0);
    expect(r.data.by_vehicle_category).toEqual([
      { category: 'Truck', vehicles: 1, logs: 3, cost: 300, avg_cost: 100, share_pct: 75 },
      { category: 'van', vehicles: 1, logs: 2, cost: 100, avg_cost: 100, share_pct: 25 },
    ]);
    expect(r.data.top_vehicles.items[0]).toMatchObject({
      vehicle: { id: '7', name: 'Truck 7', plate: 'TRK-7' },
      logs: 3,
      cost: 300,
      share_pct: 75,
    });
    const top1 = await report(service(), { topServiceTypes: 1, topVehicles: 1 });
    expect(top1.data.by_service_type.items).toHaveLength(1);
    expect(top1.data.by_service_type.other_count).toBe(2);
    expect(top1.data.top_vehicles.other_count).toBe(1);
  });

  it('schedules: point-in-time by status and by date window; overdue % over the schedules with a due state; vehicles in maintenance now', async () => {
    const r = await report(service());
    expect(r.data.schedules.total).toBe(6);
    expect(r.data.schedules.by_status).toEqual({ overdue: 1, due_soon: 2, ok: 2, unknown: 1 });
    expect(r.data.schedules.by_due_window).toEqual({
      overdue: 1,
      due_0_7: 1,
      due_8_30: 1,
      later: 2,
      unknown: 1,
    }); // "later" also holds an odometer-only schedule
    expect(r.data.schedules.overdue_pct).toBe(20); // 1 / (1 + 2 + 2)
    expect(r.data.fleet).toEqual({ vehicles_in_maintenance_now: 3 });
    expect(r.meta['due_soon_days']).toBe(7);
    expect((r.meta['basis'] as Record<string, string>)['downtime']).toMatch(/NOT available/);
    expect((await report(service(ROWS, { states: [] }))).data.schedules.overdue_pct).toBeNull();
  });

  it('compare: the previous window is read and filled into previous / delta_abs / delta_pct', async () => {
    const seen: Seen = { calls: [], dueScope: [] };
    const previous = [log('2026-08-20', { cost: 100 })];
    const r = await report(service(ROWS, { previous, seen }), { compare: 'previous_period' });
    expect(r.data.previous_period).toEqual({ from: '2026-08-12', to: '2026-08-31' });
    expect(seen.calls).toHaveLength(2);
    expect(r.data.summary.maintenance_cost).toMatchObject({
      value: 400,
      previous: 100,
      delta_abs: 300,
      delta_pct: 300,
    });
    expect(r.data.summary.logs).toMatchObject({
      value: 5,
      previous: 1,
      delta_abs: 4,
      delta_pct: 400,
    });
  });

  it('the vehicle scope reaches the log read and the schedule lookup', async () => {
    const seen: Seen = { calls: [], dueScope: [] };
    await report(service(ROWS, { scope: ['7'], seen }), { scope: { vehicleCategory: 'truck' } });
    expect(seen.calls[0]?.vehicleIds).toEqual(['7']);
    expect(seen.dueScope[0]).toEqual(['7']);
  });

  it('refuses more than 92 buckets and more than the log cap (422) and a caller without a company (403)', async () => {
    await expect(
      report(service(), { from: day('2025-01-01'), to: day('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError);
    const many = Array.from({ length: MAX_REPORT_MAINTENANCE_LOGS + 1 }, () => ({
      ...(ROWS[0] as MaintenanceReportRow),
    }));
    await expect(report(service(many))).rejects.toThrow(/narrow the range or add a filter/);
    await expect(service().report({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('MaintenanceReportQuerySchema', () => {
  it('accepts both id spellings and the top parameters; refuses bad values', () => {
    const ok = MaintenanceReportQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      compare: 'previous_year',
      interval: 'month',
      top_service_types: '5',
      top_vehicles: '3',
    });
    expect(ok['vehicle_id[]']).toEqual(['1', '2']);
    expect(ok.top_vehicles).toBe(3);
    expect(MaintenanceReportQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
    expect(MaintenanceReportQuerySchema.safeParse({ compare: 'x' }).success).toBe(false);
    expect(MaintenanceReportQuerySchema.safeParse({ top_vehicles: '51' }).success).toBe(false);
    expect(MaintenanceReportQuerySchema.safeParse({ vehicle_id: 'abc' }).success).toBe(false);
  });
});
