import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import {
  DEFAULT_FLEET_SETTINGS,
  type FleetSettings,
} from '../../fleet-settings/fleet-settings.types.js';
import { FleetMaintenanceDueService } from '../fleet-maintenance-due.service.js';
import type { FleetMaintenanceDueRepository } from '../fleet-maintenance-due.repository.js';
import type { ScheduleWithVehicle } from '../fleet-maintenance-due.types.js';
import { ListMaintenanceSchedulesQuerySchema } from '../fleet-maintenance-due.schemas.js';

const ctx = (overrides: Partial<RequestContext> = {}): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
  ...overrides,
});
const NOW = new Date('2026-09-25T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

let seq = 0;
function schedule(
  vehicle: string,
  serviceType: string,
  overrides: Partial<ScheduleWithVehicle> = {},
  odometerKm: number | null = null,
  category: string | null = 'Truck'
): ScheduleWithVehicle {
  seq += 1;
  return {
    id: String(seq),
    vehicleId: vehicle,
    serviceType,
    intervalDays: null,
    intervalKm: null,
    lastServiceDate: null,
    odometerBaselineKm: null,
    odometerBaselineDate: null,
    lastServiceOdometerKm: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    vehicle: {
      id: vehicle,
      name: `Vehicle ${vehicle}`,
      plate: `PL-${vehicle}`,
      category,
      odometerKm,
    },
    ...overrides,
  };
}

// overdue (date), due_soon (date), ok, unknown, overdue (odometer)
const ROWS = (): ScheduleWithVehicle[] => [
  schedule('1', 'Oil change', { intervalDays: 30, lastServiceDate: day(-35) }), // due 5 days ago
  schedule('2', 'Brake check', { intervalDays: 30, lastServiceDate: day(-25) }, null, 'Van'), // due in 5 days
  schedule('3', 'Oil change', { intervalDays: 30, lastServiceDate: day(-5) }), // due in 25 days
  schedule('4', 'Inspection'), // nothing computable
  schedule('5', 'Tyres', { intervalKm: 10_000, lastServiceOdometerKm: 40_000 }, 50_200), // 200 km over
];

function build(
  rows: ScheduleWithVehicle[],
  settings: Partial<FleetSettings> = {},
  seen?: { includeInactive?: boolean }
) {
  const repo = {
    listSchedulesForCompany: (includeInactive: boolean) => {
      if (seen) seen.includeInactive = includeInactive;
      return Promise.resolve(rows);
    },
  } as unknown as FleetMaintenanceDueRepository;
  const users = { findContactsByIds: () => Promise.resolve(new Map()) };
  return new FleetMaintenanceDueService(
    repo,
    { effectiveSettings: () => Promise.resolve({ ...DEFAULT_FLEET_SETTINGS, ...settings }) },
    users
  );
}

const list = (
  service: FleetMaintenanceDueService,
  query: Parameters<FleetMaintenanceDueService['list']>[0] = {}
) =>
  runWithContextAsync(ctx(), () => service.list(query, NOW)) as Promise<{
    data: { items: Record<string, unknown>[]; pagination: unknown };
    meta: Record<string, unknown>;
  }>;
const ids = (r: { data: { items: Record<string, unknown>[] } }) => r.data.items.map(i => i['id']);

describe('FleetMaintenanceDueService.list (flow 07 C1)', () => {
  it("computes each schedule's due state; the default order is next due date ascending with empty due dates last; always paged", async () => {
    const result = await list(build(ROWS()));
    expect(result.data.items.map(i => [i['vehicle_id'], i['status'], i['due_by']])).toEqual([
      ['1', 'overdue', 'date'],
      ['2', 'due_soon', 'date'],
      ['3', 'ok', null],
      ['4', 'unknown', null],
      ['5', 'overdue', 'odometer'],
    ]);
    expect(result.data.pagination).toEqual({ page: 1, per_page: 20, total: 5, total_pages: 1 });
  });

  it('meta.counts covers the filtered set WITHOUT the status filter (chips never zero each other); the status filter narrows the page', async () => {
    const service = build(ROWS());
    const all = await list(service);
    expect(all.meta['counts']).toEqual({ total: 5, overdue: 2, due_soon: 1, ok: 1, unknown: 1 });
    expect(all.meta).toMatchObject({ due_soon_days: 7, due_soon_km: 500 });
    const overdue = await list(service, { statuses: ['overdue'] });
    expect(overdue.data.items).toHaveLength(2);
    expect(overdue.meta['counts']).toEqual({
      total: 5,
      overdue: 2,
      due_soon: 1,
      ok: 1,
      unknown: 1,
    });
    expect((overdue.data.pagination as { total: number }).total).toBe(2);
    const two = await list(service, { statuses: ['overdue', 'due_soon'] });
    expect(two.data.items).toHaveLength(3);
  });

  it("the company's due-soon window comes from its settings", async () => {
    const wide = await list(build(ROWS(), { maintenanceDueSoonDays: 30 }));
    expect(wide.meta['counts']).toMatchObject({ overdue: 2, due_soon: 2, ok: 0 }); // the 25-days-out one is now due_soon too
  });

  it('filters: vehicle, service type (case-insensitive, exact), category, due_before, search; include_inactive is passed to the repository', async () => {
    const seen: { includeInactive?: boolean } = {};
    const service = build(ROWS(), {}, seen);
    expect(ids(await list(service, { vehicleIds: ['2', '3'] }))).toHaveLength(2);
    expect((await list(service, { serviceType: 'OIL CHANGE' })).data.items).toHaveLength(2);
    expect(
      (await list(service, { vehicleCategory: 'van' })).data.items.map(i => i['vehicle_id'])
    ).toEqual(['2']);
    // due on or before 10 days from now: the overdue one and the due-soon one (schedules with no due date never match)
    expect(
      (await list(service, { dueBefore: day(10) })).data.items.map(i => i['vehicle_id'])
    ).toEqual(['1', '2']);
    expect((await list(service, { search: 'pl-5' })).data.items.map(i => i['vehicle_id'])).toEqual([
      '5',
    ]);
    expect(seen.includeInactive).toBe(false);
    await list(service, { includeInactive: true });
    expect(seen.includeInactive).toBe(true);
  });

  it('sorting: next_due_date asc puts empty last in both directions; status sorts worst first; ties by id; paging', async () => {
    const service = build(ROWS());
    const asc = await list(service, { sortBy: 'next_due_date', sortOrder: 'asc' });
    expect(asc.data.items.map(i => i['vehicle_id'])).toEqual(['1', '2', '3', '4', '5']);
    const desc = await list(service, { sortBy: 'next_due_date', sortOrder: 'desc' });
    expect(desc.data.items.map(i => i['vehicle_id'])).toEqual(['3', '2', '1', '4', '5']); // empty due dates stay last
    const byStatus = await list(service, { sortBy: 'status', sortOrder: 'asc' });
    expect(byStatus.data.items.map(i => i['status'])).toEqual([
      'overdue',
      'overdue',
      'due_soon',
      'ok',
      'unknown',
    ]);
    const page2 = await list(service, { sortBy: 'vehicle_name', window: { page: 2, perPage: 2 } });
    expect(page2.data.items.map(i => i['vehicle_id'])).toEqual(['3', '4']);
    expect(page2.data.pagination).toEqual({ page: 2, per_page: 2, total: 5, total_pages: 3 });
  });

  it('an item carries the vehicle brief, both due limits and the audit fields', async () => {
    const result = await list(
      build([
        schedule(
          '1',
          'Oil change',
          {
            intervalDays: 30,
            intervalKm: 5_000,
            lastServiceDate: day(-5),
            lastServiceOdometerKm: 10_000,
          },
          12_000
        ),
      ])
    );
    expect(result.data.items[0]).toMatchObject({
      vehicle: {
        id: '1',
        name: 'Vehicle 1',
        plate: 'PL-1',
        vehicle_category: 'Truck',
        odometer_km: 12_000,
      },
      next_due_odometer_km: 15_000,
      km_until_due: 3_000,
      days_until_due: 25,
      status: 'ok',
      created_by: null,
      updated_by_user: null,
    });
  });

  it('export covers every matching row; a caller without a company is refused', async () => {
    const service = build(ROWS());
    const plan = await runWithContextAsync(ctx(), () =>
      service.exportRows({ statuses: ['overdue'] }, NOW)
    );
    expect(plan.total).toBe(2);
    expect(plan.columns.map(c => c.header)).toEqual(
      expect.arrayContaining(['status', 'next_due_date', 'km_until_due'])
    );
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () => service.list({}, NOW))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('FleetMaintenanceDueService.attentionSchedules (D-0185, feeds the attention feed)', () => {
  it('returns only the overdue and due-soon schedules, with the vehicle name and the due date; a caller without a company is refused', async () => {
    const service = build(ROWS());
    const rows = await runWithContextAsync(ctx(), () => service.attentionSchedules(NOW));
    expect(rows.map(r => [r.vehicleId, r.status]).sort()).toEqual([
      ['1', 'overdue'],
      ['2', 'due_soon'],
      ['5', 'overdue'],
    ]);
    expect(rows.find(r => r.vehicleId === '1')).toMatchObject({
      vehicleName: 'Vehicle 1',
      serviceType: 'Oil change',
    });
    expect(rows.find(r => r.vehicleId === '1')?.nextDueDate).toBeInstanceOf(Date);
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () => service.attentionSchedules(NOW))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ListMaintenanceSchedulesQuerySchema', () => {
  it('accepts comma lists and the [] spelling, and rejects an unknown status / sort with the fixed message', () => {
    const parsed = ListMaintenanceSchedulesQuerySchema.parse({
      status: 'overdue,due_soon',
      'status[]': ['ok'],
      vehicle_id: '1,2',
      due_before: '2026-10-01',
      per_page: '50',
    });
    expect(parsed.status).toEqual(['overdue', 'due_soon']);
    expect(parsed['status[]']).toEqual(['ok']);
    expect(parsed.vehicle_id).toEqual(['1', '2']);
    expect(
      ListMaintenanceSchedulesQuerySchema.safeParse({ status: 'late' }).error?.issues[0]?.message
    ).toBe('The selected status is invalid.');
    expect(
      ListMaintenanceSchedulesQuerySchema.safeParse({ sort_by: 'cost' }).error?.issues[0]?.message
    ).toBe('The selected sort by is invalid.');
    expect(
      ListMaintenanceSchedulesQuerySchema.safeParse({ vehicle_id: '1,x' }).error?.issues[0]?.message
    ).toBe('The vehicle id must be a list of ids.');
  });
});

describe("FleetMaintenanceDueService.dueStatesFor (D-0191, B7: the maintenance report's schedule buckets)", () => {
  it("returns every schedule's computed status and days until due for the vehicles in scope (vehicles in service only)", async () => {
    const seen: { includeInactive?: boolean } = {};
    const service = build(ROWS(), {}, seen);
    const states = await runWithContextAsync(ctx(), () => service.dueStatesFor(undefined, NOW));
    expect(states.map(x => [x.vehicleId, x.status])).toEqual([
      ['1', 'overdue'],
      ['2', 'due_soon'],
      ['3', 'ok'],
      ['4', 'unknown'],
      ['5', 'overdue'],
    ]);
    expect(states[0]?.daysUntilDue).toBe(-5);
    expect(states[1]?.daysUntilDue).toBe(5);
    expect(states[3]?.daysUntilDue).toBeNull();
    expect(seen.includeInactive).toBe(false);
  });
  it('a vehicle scope narrows the schedules (an empty scope matches nothing); no company → 403', async () => {
    const service = build(ROWS());
    expect(
      (await runWithContextAsync(ctx(), () => service.dueStatesFor(['2', '5', '999'], NOW))).map(
        x => x.vehicleId
      )
    ).toEqual(['2', '5']);
    expect(await runWithContextAsync(ctx(), () => service.dueStatesFor([], NOW))).toEqual([]);
    await expect(service.dueStatesFor(undefined, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
