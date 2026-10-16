import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { fakeSettingsLookup } from '../../fleet-dashboard/__tests__/fakes.js';
import {
  ComplianceCountsQuerySchema,
  ListFuelLogsQuerySchema,
  ListMaintenanceLogsQuerySchema,
} from '../fleet-records.schemas.js';
import { FleetRecordsService } from '../fleet-records.service.js';
import type { FleetRecordsRepository } from '../fleet-records.repository.js';
import type { FuelLogItem, MaintenanceLogItem } from '../fleet-records.types.js';

/** The parts of a response the tests read (the service returns a loose `Json`). */
type Loose = Record<string, unknown>;
interface LogItem extends Loose {
  vehicle: unknown;
  created_by_user: unknown;
}
interface Summary extends Loose {
  avg_price_per_liter: unknown;
}
type Counts = Record<string, number>;
interface CountRow extends Loose {
  documentable_type: unknown;
  document_type: unknown;
  total: unknown;
}
interface CountsData extends Loose {
  total: unknown;
  by_status: Counts;
  by_owner_type: CountRow[];
  by_document_type: CountRow[];
}

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
const VEHICLE = {
  id: '7',
  name: 'Truck 7',
  plate: 'ABC-123',
  category: 'Truck',
  lifecycleStatus: 'active',
};

const maintenance = (over: Partial<MaintenanceLogItem> = {}): MaintenanceLogItem => ({
  id: '1',
  vehicleId: '7',
  maintenanceScheduleId: null,
  serviceType: 'oil',
  serviceDate: at('2026-09-10'),
  odometerKm: 1000,
  cost: 40,
  vendor: 'Acme',
  notes: null,
  loggedBy: '5',
  createdAt: null,
  updatedAt: null,
  updatedBy: null,
  vehicle: VEHICLE,
  ...over,
});
const fuel = (over: Partial<FuelLogItem> = {}): FuelLogItem => ({
  id: '1',
  vehicleId: '7',
  fillDate: at('2026-09-10'),
  volume: 50,
  unit: 'liters',
  cost: null,
  odometerKm: 1000,
  isFullTank: true,
  vendor: 'Shell',
  loggedBy: '5',
  stationName: null,
  unitPrice: null,
  totalCost: 100,
  paymentMethod: 'card',
  receiptReference: null,
  tripId: null,
  createdAt: null,
  updatedAt: null,
  updatedBy: null,
  vehicle: VEHICLE,
  ...over,
});

const users = {
  findContactsByIds: (ids: string[]) =>
    Promise.resolve(
      new Map(ids.filter(i => i === '5').map(i => [i, { id: i, firstName: 'Ada', lastName: 'L' }]))
    ),
};
const service = (repo: Partial<FleetRecordsRepository>, timezone = 'UTC') =>
  new FleetRecordsService(
    repo as unknown as FleetRecordsRepository,
    fakeSettingsLookup({ timezone }),
    users
  );

describe('FleetRecordsService — maintenance logs (C2)', () => {
  it('shapes the per-vehicle log JSON plus the vehicle brief and audit names; the summary covers the whole filtered set; paging defaults to 1 / 20', async () => {
    const seen: { skip: number; take: number }[] = [];
    const s = service({
      listMaintenanceLogs: (_q, skip, take) => {
        seen.push({ skip, take });
        return Promise.resolve({ items: [maintenance()], total: 45 });
      },
      maintenanceSummary: () => Promise.resolve({ count: 45, totalCost: 1234.567, withCost: 40 }),
    });
    const r = (await run(() => s.listMaintenanceLogs({}, NOW))) as {
      data: { items: LogItem[]; pagination: unknown };
      meta: { summary: unknown };
    };
    expect(seen).toEqual([{ skip: 0, take: 20 }]);
    expect(r.data.pagination).toEqual({ page: 1, per_page: 20, total: 45, total_pages: 3 });
    const item = r.data.items[0] as LogItem;
    expect(Object.keys(item)).toEqual(
      expect.arrayContaining([
        'id',
        'vehicle_id',
        'maintenance_schedule_id',
        'service_type',
        'service_date',
        'odometer_km',
        'cost',
        'vendor',
        'notes',
        'logged_by',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by',
        'created_by_user',
        'updated_by_user',
        'vehicle',
      ])
    );
    expect(item.vehicle).toEqual({
      id: '7',
      name: 'Truck 7',
      plate: 'ABC-123',
      vehicle_category: 'Truck',
      lifecycle_status: 'active',
    });
    expect(item.created_by_user).toEqual({ id: '5', first_name: 'Ada', last_name: 'L' });
    expect(r.meta.summary).toEqual({
      count: 45,
      total_cost: 1234.57,
      avg_cost: 30.86,
      logs_with_cost: 40,
    });
  });

  it('second page window → skip; an empty set has a null average; a reversed date range is swapped', async () => {
    let seenQuery: { from?: Date | undefined; to?: Date | undefined } = {};
    let seenSkip = -1;
    const s = service({
      listMaintenanceLogs: (q, skip) => {
        seenQuery = q;
        seenSkip = skip;
        return Promise.resolve({ items: [], total: 0 });
      },
      maintenanceSummary: () => Promise.resolve({ count: 0, totalCost: 0, withCost: 0 }),
    });
    const r = (await run(() =>
      s.listMaintenanceLogs(
        { from: at('2026-09-30'), to: at('2026-09-01'), window: { page: 3, perPage: 10 } },
        NOW
      )
    )) as { meta: { summary: Record<string, unknown> } };
    expect(seenSkip).toBe(20);
    expect(seenQuery.from).toEqual(at('2026-09-01'));
    expect(seenQuery.to).toEqual(at('2026-09-30'));
    expect(r.meta.summary).toEqual({ count: 0, total_cost: 0, avg_cost: null, logs_with_cost: 0 });
  });

  it('refuses a caller without a company (403)', async () => {
    await expect(service({}).listMaintenanceLogs({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the CSV export carries the list's filters, streams in batches and writes date-only service dates", async () => {
    const calls: { skip: number; take: number }[] = [];
    const s = service({
      listMaintenanceLogs: (_q, skip, take) => {
        calls.push({ skip, take });
        return Promise.resolve({ items: [maintenance({ notes: '=cmd' })], total: 1 });
      },
    });
    const plan = await run(() => s.exportMaintenanceLogs({}));
    expect(plan.name).toBe('maintenance-logs');
    expect(plan.total).toBe(1);
    expect(plan.columns.map(c => c.header)).toEqual([
      'id',
      'vehicle_id',
      'vehicle_name',
      'plate',
      'service_date',
      'service_type',
      'odometer_km',
      'cost',
      'vendor',
      'notes',
      'maintenance_schedule_id',
      'created_at',
    ]);
    const row = maintenance();
    expect(plan.columns.find(c => c.header === 'service_date')?.value(row)).toBe('2026-09-10');
    expect(calls).toEqual([{ skip: 0, take: 500 }]);
  });
});

describe('FleetRecordsService — fuel logs (C3)', () => {
  it("shapes the per-vehicle fuel JSON plus the vehicle; the summary's price per litre is judged over the priced logs' litres", async () => {
    const s = service({
      listFuelLogs: () => Promise.resolve({ items: [fuel()], total: 1 }),
      fuelSummary: () =>
        Promise.resolve({
          count: 3,
          liters: 200.005,
          totalCost: 300,
          pricedLiters: 150,
          withCost: 2,
        }),
    });
    const r = (await run(() => s.listFuelLogs({}, NOW))) as {
      data: { items: LogItem[] };
      meta: { summary: unknown };
    };
    const item = r.data.items[0] as LogItem;
    expect(Object.keys(item)).toEqual(
      expect.arrayContaining([
        'fill_date',
        'volume',
        'unit',
        'cost',
        'odometer_km',
        'is_full_tank',
        'vendor',
        'logged_by',
        'station_name',
        'unit_price',
        'total_cost',
        'payment_method',
        'receipt_reference',
        'trip_id',
        'vehicle',
      ])
    );
    expect(r.meta.summary).toEqual({
      count: 3,
      liters: 200.01,
      total_cost: 300,
      avg_price_per_liter: 2,
      logs_with_cost: 2,
    });
  });

  it('no priced log → the average price is null, never 0', async () => {
    const s = service({
      listFuelLogs: () => Promise.resolve({ items: [], total: 0 }),
      fuelSummary: () =>
        Promise.resolve({ count: 2, liters: 40, totalCost: 0, pricedLiters: 0, withCost: 0 }),
    });
    const r = (await run(() => s.listFuelLogs({}, NOW))) as { meta: { summary: Summary } };
    expect(r.meta.summary.avg_price_per_liter).toBeNull();
  });

  it('the CSV export adds converted litres for gallon logs', async () => {
    const s = service({ listFuelLogs: () => Promise.resolve({ items: [], total: 0 }) });
    const plan = await run(() => s.exportFuelLogs({}));
    const litres = plan.columns.find(c => c.header === 'liters');
    expect(litres?.value(fuel({ volume: 10, unit: 'gallons' }))).toBeCloseTo(37.854, 3);
    expect(litres?.value(fuel({ volume: 10, unit: 'liters' }))).toBe(10);
    expect(plan.columns.find(c => c.header === 'fill_date')?.value(fuel())).toBe('2026-09-10');
  });
});

describe('FleetRecordsService — compliance counts (C4)', () => {
  const doc = (documentableType: string, documentType: string, expiry: string | null) => ({
    documentableType,
    documentType,
    expiryDate: expiry ? at(expiry) : null,
  });
  // today = 2026-09-25 (UTC): +7 = 10-02, +30 = 10-25, +60 = 11-24
  const rows = [
    doc('vehicle', 'Insurance', '2026-09-24'), // expired (yesterday)
    doc('vehicle', 'Insurance', '2026-09-25'), // today → 0-7
    doc('vehicle', 'Insurance', '2026-10-02'), // +7 → 0-7
    doc('driver', 'Licence', '2026-10-03'), // +8 → 8-30
    doc('driver', 'Licence', '2026-10-25'), // +30 → 8-30
    doc('driver', 'Licence', '2026-10-26'), // +31 → 31-60
    doc('vehicle', 'Registration', '2026-11-24'), // +60 → 31-60
    doc('vehicle', 'Registration', '2026-11-25'), // +61 → later
    doc('vehicle', 'Registration', null), // no expiry
  ];

  it('puts every document in exactly one bucket (boundaries: today, +7, +8, +30, +31, +60, +61), overall / by owner / by document type', async () => {
    const s = service({ complianceRowsForCounts: () => Promise.resolve(rows) });
    const r = (await run(() => s.complianceCounts({}, NOW))) as { data: CountsData; meta: unknown };
    expect(r.data.total).toBe(9);
    expect(r.data.by_status).toEqual({
      expired: 1,
      expiring_0_7: 2,
      expiring_8_30: 2,
      expiring_31_60: 2,
      valid_after_60: 1,
      no_expiry: 1,
    });
    const owners = r.data.by_owner_type;
    expect(owners.map(o => [o.documentable_type, o.total])).toEqual([
      ['driver', 3],
      ['vehicle', 6],
    ]);
    const types = r.data.by_document_type;
    expect(types.map(t => [t.document_type, t.total])).toEqual([
      ['Insurance', 3],
      ['Licence', 3],
      ['Registration', 3],
    ]); // ties by name
    expect(types[0]).toMatchObject({ expired: 1, expiring_0_7: 2 });
    expect(r.meta).toMatchObject({ timezone: 'UTC', today: '2026-09-25' });
  });

  it("'today' is the company's local date: 2026-09-24T22:00Z is already 25 Sept in Karachi", async () => {
    const s = service(
      { complianceRowsForCounts: () => Promise.resolve([doc('vehicle', 'X', '2026-09-25')]) },
      'Asia/Karachi'
    );
    const r = (await run(() => s.complianceCounts({}, at('2026-09-25T20:00:00Z')))) as {
      data: { by_status: { expired: number; expiring_0_7: number } };
      meta: { today: string };
    };
    expect(r.meta.today).toBe('2026-09-26'); // 20:00Z = 01:00 on the 26th in Karachi
    expect(r.data.by_status.expired).toBe(1); // 25 Sept is yesterday there
    const same = (await run(() => s.complianceCounts({}, at('2026-09-24T22:00:00Z')))) as {
      data: { by_status: { expired: number; expiring_0_7: number } };
      meta: { today: string };
    };
    expect(same.meta.today).toBe('2026-09-25');
    expect(same.data.by_status.expiring_0_7).toBe(1);
  });

  it('no documents → all zeros, empty breakdowns', async () => {
    const s = service({ complianceRowsForCounts: () => Promise.resolve([]) });
    const r = (await run(() => s.complianceCounts({}, NOW))) as { data: CountsData };
    expect(r.data).toMatchObject({
      total: 0,
      by_status: {
        expired: 0,
        expiring_0_7: 0,
        expiring_8_30: 0,
        expiring_31_60: 0,
        valid_after_60: 0,
        no_expiry: 0,
      },
      by_owner_type: [],
      by_document_type: [],
    });
  });
});

describe('fleet-records query schemas', () => {
  it('maintenance: both id spellings, costs, dates; a bad sort_by / id / negative cost is refused', () => {
    const ok = ListMaintenanceLogsQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      vehicle_id: '3',
      min_cost: '10',
      max_cost: '50',
      from: '2026-09-01',
      sort_by: 'vehicle_name',
      per_page: '50',
    });
    expect(ok['vehicle_id[]']).toEqual(['1', '2']);
    expect(ok.vehicle_id).toEqual(['3']);
    expect(ok.min_cost).toBe(10);
    expect(ListMaintenanceLogsQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
    expect(ListMaintenanceLogsQuerySchema.safeParse({ vehicle_id: 'abc' }).success).toBe(false);
    expect(ListMaintenanceLogsQuerySchema.safeParse({ min_cost: '-1' }).success).toBe(false);
    expect(ListMaintenanceLogsQuerySchema.safeParse({ per_page: '101' }).success).toBe(false);
  });

  it('fuel: flag, trip id, sort whitelist', () => {
    const ok = ListFuelLogsQuerySchema.parse({
      is_full_tank: '1',
      trip_id: '9',
      sort_by: 'unit_price',
    });
    expect(ok.is_full_tank).toBe('1');
    expect(ok.trip_id).toBe(9);
    expect(ListFuelLogsQuerySchema.safeParse({ is_full_tank: 'maybe' }).success).toBe(false);
    expect(ListFuelLogsQuerySchema.safeParse({ sort_by: 'service_date' }).success).toBe(false);
  });

  it('compliance counts: documentable_type is vehicle | driver', () => {
    expect(
      ComplianceCountsQuerySchema.parse({ documentable_type: 'driver' }).documentable_type
    ).toBe('driver');
    expect(ComplianceCountsQuerySchema.safeParse({ documentable_type: 'yard' }).success).toBe(
      false
    );
  });
});
