/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  ShieldCheck,
  UserSquare2,
} from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import DriverDetailModal from '@components/DriverDetailModal';
import { useComplianceReport, type ComplianceStatus } from '@hooks/useComplianceReport';
import { useServerExport } from '@hooks/useServerExport';
import ViewSwitch from '@components/analytics/ViewSwitch';
import { useKpiColumns } from '@components/analytics/useKpiColumns';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile from '@components/analytics/KpiTile';
import StatusDonut from '@components/analytics/StatusDonut';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { BucketBars, RankBars } from '@components/analytics/bars';
import { StackedColumns } from '@components/analytics/charts';
import { useVizColors } from '@components/analytics/theme';
import { decimal, int, isNum, parseYmd, pct, shortDate } from '@components/analytics/format';

/** Column → the API's `sort_by` key (backend B7 compliance). */
const SORT_KEYS: Record<string, string> = {
  record: 'document_type',
  owner: 'owner_name',
  expiry: 'expiry_date',
  kind: 'kind',
};

const STATUS_ORDER: ComplianceStatus[] = [
  'expired',
  'expiring_0_7',
  'expiring_8_30',
  'expiring_31_60',
  'valid_after_60',
  'no_expiry',
];

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  expiring_0_7: 'Expires within 7 days',
  expiring_8_30: 'Expires in 8–30 days',
  expiring_31_60: 'Expires in 31–60 days',
  valid_after_60: 'Valid for 60+ days',
  no_expiry: 'No expiry date',
};

const CHIP_LABEL: Record<ComplianceStatus, string> = {
  expired: 'Expired',
  expiring_0_7: '≤ 7 days',
  expiring_8_30: '8–30 days',
  expiring_31_60: '31–60 days',
  valid_after_60: 'Valid',
  no_expiry: 'No date',
};

const HORIZONS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '180', label: '6 months', days: 180 },
  { key: '365', label: '1 year', days: 365 },
] as const;

const dateOnly = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC', // stored as a calendar date at midnight UTC
      })
    : '—';

/** "in 12 days" · "today" · "5 days ago". */
const relativeDays = (n: number | null | undefined) => {
  if (!isNum(n)) return null;

  if (n === 0) return 'today';

  const abs = Math.abs(n);
  const unit =
    abs >= 730
      ? `${Math.round(abs / 365)} years`
      : `${abs.toLocaleString()} ${abs === 1 ? 'day' : 'days'}`;

  return n > 0 ? `in ${unit}` : `${unit} ago`;
};

/**
 * Maintenance → Compliance (backend B7 compliance report): will any paperwork stop us from running?
 * Every vehicle / driver document and every active driver's licence sits in exactly one expiry class
 * against today. A snapshot of NOW (there is no compliance history), so no date range and no compare:
 * the compliance rate, the six classes (the donut is also the table filter), documents vs licences,
 * what expires over the next weeks, by document type, and a server-paged records table.
 */
export default function ComplianceView() {
  const { openModal } = useModal();
  const c = useVizColors();
  const kpiGrid = useKpiColumns(5);
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]['key']>('90');
  const [table, setTable] = useState<{
    page: number;
    search: string;
    kind: 'document' | 'licence' | null;
    status: ComplianceStatus | null;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', kind: null, status: null, sort: { key: 'expiry', dir: 'asc' } });
  const r = useComplianceReport({
    horizonDays: HORIZONS.find(h => h.key === horizon)?.days ?? 90,
    page: table.page,
    perPage: 15,
    kind: table.kind,
    status: table.status,
    search: table.search,
    sort: SORT_KEYS[table.sort?.key ?? 'expiry'] ?? 'expiry_date',
    direction: table.sort?.dir ?? 'asc',
  });
  const exporter = useServerExport('/api/fleet/analytics/compliance/export', 'compliance records');

  const d = r.data;
  const S = d?.summary;
  const loading = r.isLoading;
  const total = S?.total ?? 0;
  const noRecords = !loading && total === 0;
  const upcoming = (d?.upcoming ?? []) as any[];
  const docTypes = (d?.by_document_type ?? []) as any[];
  const counts = r.meta?.table_counts as Partial<Record<ComplianceStatus, number>> | undefined;
  const tableTotal = d?.table?.pagination?.total ?? 0;

  /** One colour per expiry class (status palette; the mid classes escalate serious → warning → blue). */
  const color: Record<ComplianceStatus, string> = {
    expired: c.bucket.overdue,
    expiring_0_7: '#ec835a',
    expiring_8_30: c.bucket.soon,
    expiring_31_60: c.bucket.upcoming,
    valid_after_60: c.bucket.ok,
    no_expiry: c.neutral,
  };
  const icon: Record<ComplianceStatus, typeof Clock> = {
    expired: AlertOctagon,
    expiring_0_7: AlertTriangle,
    expiring_8_30: AlertTriangle,
    expiring_31_60: Clock,
    valid_after_60: CheckCircle2,
    no_expiry: HelpCircle,
  };
  const segments = (b: any) =>
    STATUS_ORDER.map(k => ({
      key: k,
      label: CHIP_LABEL[k],
      value: (b?.[k] ?? 0) as number,
      color: color[k],
    }));

  const card = {
    loading,
    error: r.error,
    onRetry: () => r.refetch(),
    fetching: r.isFetching,
  };
  const pickStatus = (status: ComplianceStatus | null) =>
    setTable(s => ({ ...s, page: 1, status: s.status === status ? null : status }));
  const scrollToRecords = () =>
    document
      .getElementById('compliance-records')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const openOwner = (row: any) =>
    row.owner?.type === 'vehicle'
      ? openModal(<VehicleDetailModal vehicleId={row.owner.id} initialTab="compliance" />)
      : openModal(<DriverDetailModal driverId={row.owner?.id} initialTab="compliance" />);

  const columns: Column<any>[] = [
    {
      key: 'record',
      header: 'Record',
      serverSort: SORT_KEYS.record,
      render: x => (
        <div className="min-w-[170px] flex items-center gap-2">
          {x.kind === 'licence' ? (
            <UserSquare2 size={15} className="text-ink-2 shrink-0" aria-hidden="true" />
          ) : (
            <FileText size={15} className="text-ink-2 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="text-ink-0 truncate">{x.document_type}</div>
            <div className="text-[11.5px] text-ink-2 truncate">
              {x.document_number || (x.kind === 'licence' ? 'Driver licence' : 'No number')}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Belongs to',
      serverSort: SORT_KEYS.owner,
      render: x => (
        <div className="min-w-[140px]">
          <div className="text-ink-0 truncate">{x.owner?.name ?? '—'}</div>
          <div className="text-[11.5px] text-ink-2 capitalize">{x.owner?.type}</div>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      serverSort: SORT_KEYS.expiry,
      render: x =>
        x.expiry_date ? (
          <div>
            <div className="text-ink-0 whitespace-nowrap">{dateOnly(x.expiry_date)}</div>
            <div className="text-[11.5px] text-ink-2">{relativeDays(x.days_until_expiry)}</div>
          </div>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: x => {
        const st = x.status as ComplianceStatus;
        const Icon = icon[st] ?? HelpCircle;

        return (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-0 whitespace-nowrap">
            <Icon size={13} style={{ color: color[st] }} aria-hidden="true" />
            {STATUS_LABEL[st] ?? st}
          </span>
        );
      },
    },
  ];

  const kindChips: { key: 'document' | 'licence' | null; label: string }[] = [
    { key: null, label: 'Documents & licences' },
    { key: 'document', label: 'Documents' },
    { key: 'licence', label: 'Driver licences' },
  ];

  return (
    <>
      <div
        ref={kpiGrid.ref}
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${kpiGrid.cols}, minmax(0, 1fr))` }}
      >
        <KpiTile
          label="Compliance rate"
          icon={<ShieldCheck size={14} />}
          value={isNum(S?.compliance_rate_pct) ? decimal(S.compliance_rate_pct, 1) : '—'}
          unit={isNum(S?.compliance_rate_pct) ? '%' : undefined}
          hint={
            isNum(S?.compliance_rate_pct)
              ? `${int(total - (S?.no_expiry ?? 0) - (S?.expired ?? 0))} of ${int(total - (S?.no_expiry ?? 0))} records in date`
              : 'No record has an expiry date'
          }
          loading={loading}
          info={{
            definition:
              'Records that are not expired ÷ records that have an expiry date. Records with no expiry date are not judged.',
            basis:
              'A snapshot of today in the company timezone — the API keeps no compliance history, so there is no comparison.',
          }}
        />
        <KpiTile
          label="Expired"
          icon={<AlertOctagon size={14} style={{ color: color.expired }} />}
          value={int(S?.expired)}
          hint={S?.expired ? 'click to list them' : 'nothing has expired'}
          loading={loading}
          onClick={
            S?.expired
              ? () => {
                  pickStatus('expired');
                  scrollToRecords();
                }
              : undefined
          }
          info={{ definition: 'Records whose expiry date is before today.' }}
        />
        <KpiTile
          label="Expiring soon"
          icon={<CalendarClock size={14} style={{ color: color.expiring_8_30 }} />}
          value={int(S?.expiring_within_30_days)}
          hint={`within 30 days · ${int(S?.expiring_0_7)} within 7 days`}
          loading={loading}
          info={{ definition: 'Records that expire today or within the next 30 days.' }}
        />
        <KpiTile
          label="Records"
          icon={<FileText size={14} />}
          value={int(total)}
          hint={`${int(S?.by_kind?.documents?.total)} ${S?.by_kind?.documents?.total === 1 ? 'document' : 'documents'} · ${int(S?.by_kind?.licences?.total)} ${S?.by_kind?.licences?.total === 1 ? 'licence' : 'licences'}`}
          loading={loading}
          info={{
            definition:
              'Every vehicle and driver compliance document, plus the licence of every driver that is not deactivated.',
          }}
        />
        <KpiTile
          label="No expiry date"
          icon={<HelpCircle size={14} />}
          value={int(S?.no_expiry)}
          hint="not judged"
          loading={loading}
          info={{
            definition:
              'Records with no expiry date (for example a driver with no licence date). They are not counted in the compliance rate.',
          }}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-5"
          title="Records by expiry"
          subtitle="Where every record stands today — click a class to filter the table"
          info={{
            definition:
              'Each record is in exactly one class: expired, expiring within 7 days, in 8–30 days, in 31–60 days, valid for more than 60 days, or with no expiry date.',
          }}
          {...card}
          empty={
            noRecords
              ? {
                  title: 'No compliance records yet',
                  hint: 'Add documents from a vehicle or driver’s Compliance tab.',
                }
              : null
          }
          table={{
            columns: ['Class', 'Records', 'Share'],
            rows: STATUS_ORDER.map(k => [
              STATUS_LABEL[k],
              S?.[k] ?? 0,
              total ? pct(((S?.[k] ?? 0) / total) * 100, 1) : '—',
            ]),
          }}
          skeletonHeight={220}
          centerBody
        >
          <StatusDonut
            slices={STATUS_ORDER.map(k => ({
              key: k,
              label: STATUS_LABEL[k],
              value: S?.[k] ?? 0,
              color: color[k],
            }))}
            total={total}
            centerLabel="records"
            surface={c.surface}
            onSelect={key => {
              pickStatus(key as ComplianceStatus);
              scrollToRecords();
            }}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-7"
          title="Documents and licences"
          subtitle="The same six classes, split by what the record is"
          info={{
            definition:
              'Vehicle and driver documents on one line, driver licences on the other; each bar is split into the expiry classes.',
          }}
          {...card}
          empty={noRecords ? { title: 'No compliance records yet' } : null}
          centerBody
          table={{
            columns: ['Kind', 'Records', ...STATUS_ORDER.map(k => CHIP_LABEL[k]), 'Rate'],
            rows: (['documents', 'licences'] as const).map(k => [
              k === 'documents' ? 'Documents' : 'Driver licences',
              S?.by_kind?.[k]?.total ?? 0,
              ...STATUS_ORDER.map(st => S?.by_kind?.[k]?.[st] ?? 0),
              isNum(S?.by_kind?.[k]?.compliance_rate_pct)
                ? pct(S.by_kind[k].compliance_rate_pct, 1)
                : '—',
            ]),
          }}
          skeletonHeight={220}
        >
          <BucketBars
            surface={c.surface}
            legend={STATUS_ORDER.map(k => ({ key: k, label: CHIP_LABEL[k], color: color[k] }))}
            rows={(['documents', 'licences'] as const).map(k => ({
              key: k,
              label: k === 'documents' ? 'Vehicle & driver documents' : 'Driver licences',
              segments: segments(S?.by_kind?.[k]),
              note: isNum(S?.by_kind?.[k]?.compliance_rate_pct)
                ? `${decimal(S.by_kind[k].compliance_rate_pct, 1)}% in date`
                : undefined,
              onClick: () => {
                setTable(s => ({
                  ...s,
                  page: 1,
                  kind: k === 'documents' ? 'document' : 'licence',
                }));
                scrollToRecords();
              },
            }))}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-7"
          title="What expires next"
          subtitle={`Records expiring per ${r.interval}, from today`}
          info={{
            definition:
              'Records whose expiry date falls from today through the chosen horizon, per week (per month for a year). Already-expired records and records with no date are not in it.',
            basis: 'Today is the first day, so the first period can be partial.',
          }}
          right={
            <ViewSwitch
              label="Look-ahead"
              value={horizon}
              onChange={setHorizon}
              options={HORIZONS.map(h => ({ key: h.key, label: h.label }))}
            />
          }
          {...card}
          empty={noRecords ? { title: 'No compliance records yet' } : null}
          table={{
            columns: ['Period starting', 'Documents', 'Licences', 'Total'],
            rows: upcoming.map(x => [
              shortDate(parseYmd(x.bucket)),
              x.documents,
              x.licences,
              x.total,
            ]),
          }}
          skeletonHeight={240}
        >
          <StackedColumns
            labels={upcoming.map(x => shortDate(parseYmd(x.bucket)))}
            series={[
              {
                key: 'documents',
                label: 'Documents',
                color: c.series(0),
                data: upcoming.map(x => x.documents),
              },
              {
                key: 'licences',
                label: 'Driver licences',
                color: c.series(1),
                data: upcoming.map(x => x.licences),
              },
            ]}
            height={220}
            ariaLabel={`Records expiring per ${r.interval}`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-5"
          title="By document type"
          subtitle="Records per type — most first"
          info={{
            definition:
              'Vehicle and driver documents grouped by their type (case and spaces ignored). Driver licences are not in this list — they have no document type.',
          }}
          {...card}
          empty={
            !loading && docTypes.length === 0
              ? {
                  title: 'No documents yet',
                  hint: 'Documents added on a vehicle or driver’s Compliance tab appear here.',
                }
              : null
          }
          table={{
            columns: ['Type', 'Records', 'Expired', 'Expiring ≤ 30 d', 'Rate'],
            rows: docTypes.map(x => [
              x.document_type,
              x.total,
              x.expired,
              x.expiring_within_30_days,
              isNum(x.compliance_rate_pct) ? pct(x.compliance_rate_pct, 1) : '—',
            ]),
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.series(0)}
            format={v => int(v)}
            rows={docTypes.map((x, i) => ({
              key: `dt${i}`,
              label: x.document_type,
              sublabel: `${int(x.expired)} expired · ${int(x.expiring_within_30_days)} expiring soon`,
              value: x.total,
            }))}
          />
        </WidgetCard>
      </div>

      <div id="compliance-records" className="scroll-mt-4">
        <WidgetCard
          title="Records"
          subtitle={`${int(tableTotal)} ${tableTotal === 1 ? 'record' : 'records'} — soonest to expire first, click a row to open the owner`}
          info={{
            definition:
              'Every compliance document and every active driver’s licence with its expiry date and class.',
            basis:
              'Filtering narrows this table only — the charts above keep their totals. A licence opens its driver; a document opens its vehicle or driver.',
          }}
          error={r.error}
          onRetry={() => r.refetch()}
          bodyClassName="px-0!"
          skeletonHeight={120}
        >
          <div className="flex flex-col gap-2 px-5 pb-3">
            <div
              role="group"
              aria-label="Filter records by kind"
              className="flex flex-wrap gap-1.5"
            >
              {kindChips.map(ch => {
                const on = table.kind === ch.key;

                return (
                  <button
                    key={String(ch.key)}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTable(s => ({ ...s, page: 1, kind: ch.key }))}
                    className={`text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                      on
                        ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
                        : 'border-line-soft text-ink-1 hover:bg-surface-2'
                    }`}
                  >
                    {ch.label}
                  </button>
                );
              })}
            </div>
            <div
              role="group"
              aria-label="Filter records by expiry class"
              className="flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                aria-pressed={table.status === null}
                onClick={() => setTable(s => ({ ...s, page: 1, status: null }))}
                className={`inline-flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                  table.status === null
                    ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
                    : 'border-line-soft text-ink-1 hover:bg-surface-2'
                }`}
              >
                All{' '}
                <b className="tabular-nums">
                  {int(STATUS_ORDER.reduce((a, k) => a + (counts?.[k] ?? 0), 0))}
                </b>
              </button>
              {STATUS_ORDER.map(k => {
                const on = table.status === k;
                const Icon = icon[k];

                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTable(s => ({ ...s, page: 1, status: s.status === k ? null : k }))
                    }
                    className={`inline-flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                      on
                        ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
                        : 'border-line-soft text-ink-1 hover:bg-surface-2'
                    }`}
                  >
                    <Icon size={12} style={{ color: color[k] }} aria-hidden="true" />
                    {CHIP_LABEL[k]}{' '}
                    <b className="tabular-nums">{isNum(counts?.[k]) ? int(counts?.[k]) : '—'}</b>
                  </button>
                );
              })}
            </div>
          </div>
          <DataTable
            caption="Compliance documents and driver licences with expiry date and class"
            rows={(d?.table?.items ?? []) as any[]}
            loading={loading}
            rowKey={x => `${x.kind}-${x.record_id}`}
            columns={columns}
            searchText={x => `${x.owner?.name ?? ''} ${x.document_type} ${x.document_number ?? ''}`}
            searchPlaceholder="Search owner, type, number"
            pageSize={15}
            server={{
              total: tableTotal,
              page: table.page,
              onPage: page => setTable(s => ({ ...s, page })),
              sort: table.sort,
              onSort: sort => setTable(s => ({ ...s, sort })),
              onQuery: search =>
                setTable(s => (s.search === search ? s : { ...s, search, page: 1 })),
              fetching: r.isFetching,
              exporting: exporter.busy,
              onExport: () => exporter.run(r.exportParams),
            }}
            onRowClick={openOwner}
            empty={{
              title: 'No records match',
              hint:
                table.status || table.kind
                  ? 'Clear a filter above to see more records.'
                  : 'Add documents from a vehicle or driver’s Compliance tab.',
            }}
          />
        </WidgetCard>
      </div>
    </>
  );
}
