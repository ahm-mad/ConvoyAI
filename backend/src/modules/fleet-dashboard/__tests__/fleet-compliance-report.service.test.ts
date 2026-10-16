import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { ComplianceReportQuerySchema } from '../fleet-analytics.schemas.js';
import {
  FleetComplianceReportService,
  LICENCE_DOCUMENT_TYPE,
  type ComplianceReportQuery,
} from '../fleet-compliance-report.service.js';
import type { ComplianceRecordRow, DriverLicenceRow } from '../fleet-dashboard.types.js';
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
const NOW = new Date('2026-09-25T12:00:00.000Z'); // today = 2026-09-25 (UTC)
const plus = (n: number | null): Date | null =>
  n === null ? null : new Date(Date.UTC(2026, 8, 25 + n));
let seq = 0;
const doc = (
  ownerType: string,
  ownerId: string,
  documentType: string,
  offset: number | null,
  documentNumber: string | null = null
): ComplianceRecordRow => {
  seq += 1;
  return {
    id: String(seq),
    documentableType: ownerType,
    documentableId: ownerId,
    documentType,
    documentNumber,
    expiryDate: plus(offset),
  };
};
const DOCS: ComplianceRecordRow[] = [
  doc('vehicle', '7', 'Insurance', -1, 'INS-1'), // expired
  doc('vehicle', '7', 'Insurance', 0), // today
  doc('vehicle', '7', 'Insurance', 7),
  doc('driver', '9', 'Medical', 8),
  doc('driver', '9', 'Medical', 30),
  doc('vehicle', '7', 'Registration', 31),
  doc('vehicle', '7', 'Registration', 61),
  doc('vehicle', '7', 'Registration', null),
];
const LICENCES: DriverLicenceRow[] = [
  { driverId: '9', name: 'Ada Lovelace', licenseNumber: 'L-9', expiryDate: plus(10) },
  { driverId: '10', name: 'Bob Ray', licenseNumber: null, expiryDate: plus(-5) },
  { driverId: '11', name: 'Cy Twombly', licenseNumber: null, expiryDate: null },
];

function service(docs = DOCS, licences = LICENCES, timezone = 'UTC') {
  const repo = fakeFleetDashboardRepository({
    complianceRecordsForReport: () => Promise.resolve(docs),
    driverLicencesForReport: () => Promise.resolve(licences),
    vehicleBriefs: () => Promise.resolve(new Map([['7', { name: 'Truck 7', plate: 'TRK-7' }]])),
    driverNames: () => Promise.resolve(new Map([['9', 'Ada Lovelace']])),
  });
  return new FleetComplianceReportService(repo, fakeSettingsLookup({ timezone }));
}

interface Block {
  total: number;
  expired: number;
  expiring_0_7: number;
  expiring_8_30: number;
  expiring_31_60: number;
  valid_after_60: number;
  no_expiry: number;
  expiring_within_30_days: number;
  compliance_rate_pct: number | null;
}
interface Row {
  kind: string;
  record_id: string;
  owner: { type: string; id: string; name: string | null };
  document_type: string;
  document_number: string | null;
  days_until_expiry: number | null;
  status: string;
  [k: string]: unknown;
}
interface Report {
  data: {
    summary: Block & { by_kind: { documents: Block; licences: Block } };
    by_owner_type: (Block & { owner_type: string })[];
    by_document_type: (Block & { document_type: string })[];
    upcoming: { bucket: string; documents: number; licences: number; total: number }[];
    table: { items: Row[]; pagination: Record<string, unknown> };
  };
  meta: Record<string, unknown>;
}
const report = async (s: FleetComplianceReportService, q: ComplianceReportQuery = {}) =>
  (await run(() => s.report(q, NOW))) as unknown as Report;

describe('FleetComplianceReportService.report', () => {
  it('summary: every record (documents + licences) in exactly one class; compliance rate = not expired ÷ having an expiry date', async () => {
    const s = (await report(service())).data.summary;
    expect(s.total).toBe(11);
    expect([
      s.expired,
      s.expiring_0_7,
      s.expiring_8_30,
      s.expiring_31_60,
      s.valid_after_60,
      s.no_expiry,
    ]).toEqual([2, 2, 3, 1, 1, 2]);
    expect(s.expiring_within_30_days).toBe(5);
    expect(s.compliance_rate_pct).toBe(77.8); // 7 valid ÷ (7 + 2 expired); the two no_expiry records are not judged
    expect(s.by_kind.documents).toMatchObject({
      total: 8,
      expired: 1,
      no_expiry: 1,
      compliance_rate_pct: 85.7,
    }); // 6 ÷ 7
    expect(s.by_kind.licences).toMatchObject({
      total: 3,
      expired: 1,
      expiring_8_30: 1,
      no_expiry: 1,
      compliance_rate_pct: 50,
    });
  });

  it('nothing to judge → the rate is null, never 0 %; no records → zeros', async () => {
    const r = (await report(service([doc('vehicle', '7', 'X', null)], []))).data.summary;
    expect(r.total).toBe(1);
    expect(r.compliance_rate_pct).toBeNull();
    const none = (await report(service([], []))).data.summary;
    expect([none.total, none.compliance_rate_pct]).toEqual([0, null]);
  });

  it('by document type (documents only, most first, ties by name) and by owner type', async () => {
    const r = await report(service());
    expect(r.data.by_document_type.map(t => [t.document_type, t.total])).toEqual([
      ['Insurance', 3],
      ['Registration', 3],
      ['Medical', 2],
    ]);
    expect(r.data.by_document_type[0]).toMatchObject({
      expired: 1,
      expiring_0_7: 2,
      compliance_rate_pct: 66.7,
    });
    expect(r.data.by_owner_type.map(o => [o.owner_type, o.total])).toEqual([
      ['driver', 2],
      ['vehicle', 6],
    ]);
  });

  it('upcoming: what expires within the horizon per weekly bucket (today is day one); expired records are not in it', async () => {
    const r = await report(service());
    const u = r.data.upcoming;
    expect(u[0]).toMatchObject({ bucket: '2026-09-25', documents: 1, licences: 0, total: 1 }); // the document expiring today
    expect(u.find(p => p.bucket === '2026-09-28')).toMatchObject({ documents: 2, licences: 0 }); // +7, +8
    expect(u.find(p => p.bucket === '2026-10-05')).toMatchObject({ documents: 0, licences: 1 }); // the licence at +10
    expect(u.reduce((n, p) => n + p.total, 0)).toBe(7); // 0, +7, +8, +10, +30, +31, +61 — not the expired, not the no-expiry
    const narrow = await report(service(), { horizonDays: 14 });
    expect(narrow.data.upcoming.reduce((n, p) => n + p.total, 0)).toBe(4); // 0, +7, +8, +10
    const monthly = await report(service(), { interval: 'month' });
    expect(monthly.data.upcoming.map(p => p.bucket)).toEqual([
      '2026-09-25',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]); // today + 90 days = 24 Dec
    expect(monthly.data.upcoming.reduce((n, p) => n + p.total, 0)).toBe(7);
    expect(monthly.meta['horizon_days']).toBe(90);
  });

  it('table: worst first (expired, then soonest; no expiry last), owner names, days until expiry; the licence label', async () => {
    const r = await report(service());
    const items = r.data.table.items;
    expect(items.map(i => i.days_until_expiry)).toEqual([
      -5,
      -1,
      0,
      7,
      8,
      10,
      30,
      31,
      61,
      null,
      null,
    ]);
    expect(items[0]).toMatchObject({
      kind: 'licence',
      document_type: LICENCE_DOCUMENT_TYPE,
      owner: { type: 'driver', id: '10', name: 'Bob Ray' },
      status: 'expired',
    });
    expect(items[1]).toMatchObject({
      kind: 'document',
      owner: { type: 'vehicle', id: '7', name: 'Truck 7' },
      document_number: 'INS-1',
      status: 'expired',
    });
    expect(items[5]).toMatchObject({
      kind: 'licence',
      document_number: 'L-9',
      status: 'expiring_8_30',
    });
    expect(r.data.table.pagination).toEqual({ page: 1, per_page: 20, total: 11, total_pages: 1 });
    const desc = (await report(service(), { sortOrder: 'desc' })).data.table.items;
    expect(desc[0]?.days_until_expiry).toBe(61);
    expect(desc.slice(-2).every(i => i.days_until_expiry === null)).toBe(true); // empty last in both directions
  });

  it('table filters never change the summary: kind, status, owner type, document type, search, paging', async () => {
    const s = service();
    const total = async (q: ComplianceReportQuery) =>
      (await report(s, q)).data.table.pagination['total'];
    expect(await total({ kind: 'licence' })).toBe(3);
    expect(await total({ kind: 'document' })).toBe(8);
    expect(await total({ statuses: ['expired', 'expiring_0_7'] })).toBe(4);
    expect(await total({ documentableType: 'driver' })).toBe(2); // driver DOCUMENTS only, not licences
    expect(await total({ documentType: 'insurance' })).toBe(3);
    expect(await total({ documentType: LICENCE_DOCUMENT_TYPE.toUpperCase() })).toBe(3);
    expect(await total({ search: 'lovelace' })).toBe(3); // her two documents + her licence
    expect(await total({ search: 'ins-1' })).toBe(1);
    const filtered = await report(s, { statuses: ['expired'], window: { page: 1, perPage: 1 } });
    expect(filtered.data.summary.total).toBe(11);
    expect(filtered.data.table.items).toHaveLength(1);
    expect(filtered.data.table.pagination).toEqual({
      page: 1,
      per_page: 1,
      total: 2,
      total_pages: 2,
    });
    expect(filtered.meta['table_counts']).toMatchObject({ expired: 2, expiring_0_7: 0 });
  });

  it('sorts: owner_name, document_type, kind; a deleted owner has no name (null last)', async () => {
    const s = service([doc('vehicle', '999', 'Gone', 5), ...DOCS.slice(0, 1)], []);
    const byName = (await report(s, { sortBy: 'owner_name', sortOrder: 'asc' })).data.table.items;
    expect(byName[0]?.owner.name).toBe('Truck 7');
    expect(byName[1]?.owner.name).toBeNull();
    const byType = (await report(service(), { sortBy: 'document_type', sortOrder: 'asc' })).data
      .table.items;
    expect(byType[0]?.document_type).toBe(LICENCE_DOCUMENT_TYPE);
  });

  it("'today' is the company's local date (Karachi is ahead of UTC)", async () => {
    const r = (await run(() =>
      service([doc('vehicle', '7', 'X', 0)], [], 'Asia/Karachi').report(
        {},
        new Date('2026-09-25T20:00:00Z')
      )
    )) as unknown as Report;
    expect(r.meta['today']).toBe('2026-09-26'); // 20:00Z = 01:00 on the 26th in Karachi → the 25 Sept document has expired
    expect(r.data.summary.expired).toBe(1);
  });

  it("the CSV export carries the table's filters / sort", async () => {
    const plan = await run(() =>
      service().exportRows({ statuses: ['expired'], sortBy: 'expiry_date', sortOrder: 'asc' }, NOW)
    );
    expect(plan.name).toBe('compliance-report');
    expect(plan.total).toBe(2);
    expect(plan.columns.map(c => c.header)).toEqual([
      'kind',
      'record_id',
      'owner_type',
      'owner_id',
      'owner_name',
      'document_type',
      'document_number',
      'expiry_date',
      'days_until_expiry',
      'status',
    ]);
    const first = (await plan.batches().next()).value as { kind: string }[];
    expect(first.map(r => r.kind)).toEqual(['licence', 'document']);
    expect(plan.columns.find(c => c.header === 'expiry_date')?.value(first[0] as never)).toBe(
      '2026-09-20'
    );
  });

  it('refuses a caller without a company (403)', async () => {
    await expect(service().report({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ComplianceReportQuerySchema', () => {
  it('accepts status lists in both spellings, horizon / interval / kind; refuses bad values', () => {
    const ok = ComplianceReportQuerySchema.parse({
      status: 'expired,expiring_0_7',
      'status[]': ['no_expiry'],
      horizon_days: '30',
      interval: 'month',
      kind: 'licence',
      sort_by: 'owner_name',
    });
    expect(ok.status).toEqual(['expired', 'expiring_0_7']);
    expect(ok.horizon_days).toBe(30);
    expect(ComplianceReportQuerySchema.safeParse({ status: 'soon' }).success).toBe(false);
    expect(ComplianceReportQuerySchema.safeParse({ kind: 'passport' }).success).toBe(false);
    expect(ComplianceReportQuerySchema.safeParse({ horizon_days: '6' }).success).toBe(false);
    expect(ComplianceReportQuerySchema.safeParse({ horizon_days: '366' }).success).toBe(false);
    expect(ComplianceReportQuerySchema.safeParse({ interval: 'day' }).success).toBe(false);
    expect(ComplianceReportQuerySchema.safeParse({ documentable_type: 'yard' }).success).toBe(
      false
    );
    expect(ComplianceReportQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
  });
});
