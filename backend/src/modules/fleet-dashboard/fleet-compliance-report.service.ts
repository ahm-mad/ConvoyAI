import { ForbiddenError } from '../../platform/errors/app-error.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  addLocalDays,
  endOfLocalDay,
  localDateOf,
  localDateString,
  startOfLocalDay,
  utcDatePartsOf,
} from '../../platform/time/zoned.js';
import {
  EXPIRY_STATUSES,
  daysUntilExpiry,
  expiryStatusOf,
  type ExpiryStatus,
} from '../../shared/utils/expiry-buckets.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import { bucketIndex } from './fleet-activity.service.js';
import { DEFINITION_VERSION } from './fleet-analytics.service.js';
import { bucketLabel, generateBuckets } from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';

type Json = Record<string, unknown>;

/** D-0191 (flow 07 B7, second half): `GET /fleet/analytics/compliance` — a point-in-time report over the company's compliance documents and driver licences. */
export const COMPLIANCE_TABLE_SORT_FIELDS = [
  'expiry_date',
  'owner_name',
  'document_type',
  'kind',
] as const;
export type ComplianceTableSortField = (typeof COMPLIANCE_TABLE_SORT_FIELDS)[number];
export type ComplianceKind = 'document' | 'licence';
export const COMPLIANCE_KINDS = ['document', 'licence'] as const;

/** The label a driver's licence carries as a record's `document_type`. */
export const LICENCE_DOCUMENT_TYPE = 'Driver licence';

export interface ComplianceReportQuery {
  /** How far ahead the `upcoming` series looks (default 90 days). */
  horizonDays?: number | undefined;
  interval?: 'week' | 'month' | undefined;
  /** Table-only filters — the summary, breakdowns and series always cover every record. */
  kind?: ComplianceKind | undefined;
  statuses?: ExpiryStatus[] | undefined;
  documentableType?: 'vehicle' | 'driver' | undefined;
  documentType?: string | undefined;
  search?: string | undefined;
  sortBy?: ComplianceTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
}

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

interface Rec {
  kind: ComplianceKind;
  id: string;
  ownerType: 'vehicle' | 'driver';
  ownerId: string;
  ownerName: string | null;
  documentType: string;
  documentNumber: string | null;
  expiry: Date | null;
  days: number | null;
  status: ExpiryStatus;
}

type Counts = Record<ExpiryStatus, number>;
const emptyCounts = (): Counts => ({
  expired: 0,
  expiring_0_7: 0,
  expiring_8_30: 0,
  expiring_31_60: 0,
  valid_after_60: 0,
  no_expiry: 0,
});
const totalOf = (c: Counts): number => EXPIRY_STATUSES.reduce((n, s) => n + c[s], 0);
/** Valid ÷ (valid + expired): a record without an expiry date is not judged. `null` when nothing can be judged. */
const rateOf = (c: Counts): number | null => {
  const valid = c.expiring_0_7 + c.expiring_8_30 + c.expiring_31_60 + c.valid_after_60;
  const judged = valid + c.expired;
  return judged > 0 ? round((valid / judged) * 100, 1) : null;
};
const block = (c: Counts): Json => ({
  total: totalOf(c),
  ...c,
  expiring_within_30_days: c.expiring_0_7 + c.expiring_8_30,
  compliance_rate_pct: rateOf(c),
});

const COLUMNS: CsvColumn<Rec>[] = [
  { header: 'kind', value: r => r.kind },
  { header: 'record_id', value: r => r.id },
  { header: 'owner_type', value: r => r.ownerType },
  { header: 'owner_id', value: r => r.ownerId },
  { header: 'owner_name', value: r => r.ownerName },
  { header: 'document_type', value: r => r.documentType },
  { header: 'document_number', value: r => r.documentNumber },
  { header: 'expiry_date', value: r => (r.expiry ? r.expiry.toISOString().slice(0, 10) : null) },
  { header: 'days_until_expiry', value: r => r.days },
  { header: 'status', value: r => r.status },
];

/** Business logic for the compliance report (D-0191, flow 07 ask B7) — a read-only view over `compliance_documents` and the drivers' licence dates; nothing is stored. */
export class FleetComplianceReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async records(today: ReturnType<typeof localDateOf>): Promise<Rec[]> {
    const [documents, licences] = await Promise.all([
      this.repo.complianceRecordsForReport(),
      this.repo.driverLicencesForReport(),
    ]);
    const vehicleIds = [
      ...new Set(
        documents.filter(d => d.documentableType === 'vehicle').map(d => d.documentableId)
      ),
    ];
    const driverIds = [
      ...new Set(documents.filter(d => d.documentableType === 'driver').map(d => d.documentableId)),
    ];
    const [vehicles, drivers] = await Promise.all([
      this.repo.vehicleBriefs(vehicleIds),
      this.repo.driverNames(driverIds),
    ]);
    const out: Rec[] = [];
    for (const d of documents) {
      const ownerType = d.documentableType === 'driver' ? 'driver' : 'vehicle';
      out.push({
        kind: 'document',
        id: d.id,
        ownerType,
        ownerId: d.documentableId,
        ownerName:
          ownerType === 'vehicle'
            ? (vehicles.get(d.documentableId)?.name ?? null)
            : (drivers.get(d.documentableId) ?? null),
        documentType: d.documentType,
        documentNumber: d.documentNumber,
        expiry: d.expiryDate,
        days: daysUntilExpiry(d.expiryDate, today),
        status: expiryStatusOf(d.expiryDate, today),
      });
    }
    for (const l of licences) {
      out.push({
        kind: 'licence',
        id: l.driverId,
        ownerType: 'driver',
        ownerId: l.driverId,
        ownerName: l.name,
        documentType: LICENCE_DOCUMENT_TYPE,
        documentNumber: l.licenseNumber,
        expiry: l.expiryDate,
        days: daysUntilExpiry(l.expiryDate, today),
        status: expiryStatusOf(l.expiryDate, today),
      });
    }
    return out;
  }

  private filteredAndSorted(all: Rec[], query: ComplianceReportQuery): Rec[] {
    const type = query.documentType?.trim().toLowerCase();
    const term = query.search?.toLowerCase();
    const rows = all.filter(r => {
      if (query.kind && r.kind !== query.kind) return false;
      if (query.statuses && !query.statuses.includes(r.status)) return false;
      if (
        query.documentableType &&
        (r.kind !== 'document' || r.ownerType !== query.documentableType)
      )
        return false;
      if (type && r.documentType.trim().toLowerCase() !== type) return false;
      if (!term) return true;
      return [r.ownerName, r.documentType, r.documentNumber].some(v =>
        (v ?? '').toLowerCase().includes(term)
      );
    });
    const field = query.sortBy ?? 'expiry_date';
    const sign = (query.sortOrder ?? 'asc') === 'desc' ? -1 : 1;
    const key = (r: Rec): number | string | null => {
      switch (field) {
        case 'expiry_date':
          return r.expiry ? r.expiry.getTime() : null;
        case 'owner_name':
          return r.ownerName === null ? null : r.ownerName.toLowerCase();
        case 'document_type':
          return r.documentType.toLowerCase();
        case 'kind':
          return r.kind;
      }
    };
    const tie = (a: Rec, b: Rec): number =>
      a.kind.localeCompare(b.kind) || Number(a.id) - Number(b.id);
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null) return tie(a, b);
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0 ? cmp * sign : tie(a, b) * sign;
    });
  }

  private json(r: Rec): Json {
    return {
      kind: r.kind,
      record_id: r.id,
      owner: { type: r.ownerType, id: r.ownerId, name: r.ownerName },
      document_type: r.documentType,
      document_number: r.documentNumber,
      expiry_date: r.expiry,
      days_until_expiry: r.days,
      status: r.status,
    };
  }

  /** `GET /fleet/analytics/compliance`. */
  async report(query: ComplianceReportQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const today = localDateOf(now, tz);
    const horizon = query.horizonDays ?? 90;
    const interval = query.interval ?? 'week';
    const all = await this.records(today);

    const overall = emptyCounts();
    const docs = emptyCounts();
    const lic = emptyCounts();
    const byOwner = new Map<string, Counts>();
    const byType = new Map<string, { documentType: string; counts: Counts }>();
    for (const r of all) {
      overall[r.status] += 1;
      if (r.kind === 'licence') {
        lic[r.status] += 1;
        continue;
      }
      docs[r.status] += 1;
      const owner = byOwner.get(r.ownerType) ?? emptyCounts();
      owner[r.status] += 1;
      byOwner.set(r.ownerType, owner);
      const text = r.documentType.trim();
      const entry = byType.get(text.toLowerCase()) ?? { documentType: text, counts: emptyCounts() };
      entry.counts[r.status] += 1;
      byType.set(text.toLowerCase(), entry);
    }

    // upcoming: what expires in the coming `horizon` days, per bucket (today is the first day)
    const first = startOfLocalDay(today, tz);
    const last = endOfLocalDay(addLocalDays(today, horizon), tz);
    const buckets = generateBuckets(first, last, interval, tz);
    const upcoming = buckets.map(bucket => ({
      bucket: bucketLabel(bucket, interval, tz),
      documents: 0,
      licences: 0,
      total: 0,
    }));
    for (const r of all) {
      if (r.expiry === null || r.days === null || r.days < 0 || r.days > horizon) continue;
      const i = bucketIndex(buckets, startOfLocalDay(utcDatePartsOf(r.expiry), tz).getTime());
      if (i < 0) continue;
      const point = upcoming[i] as (typeof upcoming)[number];
      if (r.kind === 'document') point.documents += 1;
      else point.licences += 1;
      point.total += 1;
    }

    const table = this.filteredAndSorted(all, query);
    const paging = query.window ?? { page: 1, perPage: 20 };
    const tableCounts = emptyCounts();
    for (const r of table) tableCounts[r.status] += 1;

    return {
      success: true,
      message: 'Compliance report retrieved successfully.',
      data: {
        summary: { ...block(overall), by_kind: { documents: block(docs), licences: block(lic) } },
        by_owner_type: [...byOwner.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([owner_type, c]) => ({ owner_type, ...block(c) })),
        by_document_type: [...byType.values()]
          .sort(
            (a, b) =>
              totalOf(b.counts) - totalOf(a.counts) || a.documentType.localeCompare(b.documentType)
          )
          .map(t => ({ document_type: t.documentType, ...block(t.counts) })),
        upcoming,
        table: {
          items: table
            .slice((paging.page - 1) * paging.perPage, paging.page * paging.perPage)
            .map(r => this.json(r)),
          pagination: buildPagination(table.length, paging),
        },
      },
      meta: {
        timezone: tz,
        today: localDateString(today),
        horizon_days: horizon,
        interval,
        generated_at: now.toISOString(),
        definition_version: DEFINITION_VERSION,
        table_counts: tableCounts,
        basis: {
          records:
            'every compliance document of the company (vehicle and driver documents) plus the licence of every driver that is not deactivated (a driver without a licence date is a no_expiry record)',
          status:
            'six exclusive classes against TODAY in the company timezone: expired, expiring_0_7, expiring_8_30, expiring_31_60, valid_after_60, no_expiry',
          compliance_rate_pct:
            'records that are not expired ÷ records that have an expiry date (no_expiry records are not judged); null when none has one',
          upcoming:
            'records expiring today … today + horizon_days, per bucket of the interval (week | month)',
          history:
            'point-in-time only — expiry dates are read as they are now; the API keeps no history of past compliance',
        },
      },
    };
  }

  /** `GET /fleet/analytics/compliance/export` — the table's own filters / sort, every matching record as CSV. */
  async exportRows(query: Omit<ComplianceReportQuery, 'window'>, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const ordered = this.filteredAndSorted(
      await this.records(localDateOf(now, settings.timezone)),
      query
    );
    return planExport('compliance-report', COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}
