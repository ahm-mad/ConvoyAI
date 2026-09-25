/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertOctagon, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useUnits } from '@hooks/useUnits';
import { useServerExport } from '@hooks/useServerExport';
import { useMaintenanceSchedules, type ScheduleStatus } from '@hooks/useMaintenanceSchedules';
import { useMaintenanceReport } from '@hooks/useMaintenanceReport';
import AnalyticsShell from '@components/analytics/AnalyticsShell';
import ViewSwitch from '@components/analytics/ViewSwitch';
import { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import { useAnalyticsScope, type ScopeField } from '@components/analytics/useAnalyticsScope';
import MaintenanceHistoryView from '@screens/MaintenanceHistoryView';
import ComplianceView from '@screens/ComplianceView';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile from '@components/analytics/KpiTile';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { BucketBars } from '@components/analytics/bars';
import { useVizColors } from '@components/analytics/theme';
import { decimal, int, isNum, pct } from '@components/analytics/format';

/**
 * Scope fields the whole page honours: the service log (C2) and the schedule list (C1) only take a vehicle
 * category and vehicles, so yard / cost centre are not offered here (they would leave the tables unfiltered).
 */
const SCOPE_FIELDS: ScopeField[] = ['category', 'vehicle'];

/** Column → the API's `sort_by` key (backend C1). */
const SORT_KEYS: Record<string, string> = {
  vehicle: 'vehicle_name',
  service: 'service_type',
  status: 'status',
  nextdue: 'next_due_date',
  remaining: 'km_until_due',
  last: 'last_service_date',
};

const dateOnly = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

/** "in 12 days" · "today" · "5 days overdue". */
const relativeDays = (n: number | null | undefined) => {
  if (!isNum(n)) return null;

  if (n === 0) return 'today';

  const abs = Math.abs(n);
  const unit = `${abs.toLocaleString()} ${abs === 1 ? 'day' : 'days'}`;

  return n > 0 ? `in ${unit}` : `${unit} overdue`;
};

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  ok: 'On schedule',
  unknown: 'Not set up',
};

/**
 * Analytics → Maintenance (FLEET_ANALYTICS_DESIGN.md §4): will anything stop us from running?
 * Built on the company-wide schedule list (backend C1): the due state is computed by the server
 * (date OR odometer, the worse limit wins); the due-date buckets come from the maintenance report (B7).
 * It is a snapshot of NOW, so no date range applies. Downtime days are not available (the API keeps no
 * vehicle status history).
 */
function SchedulesView({ today, scope }: { today: string; scope: Record<string, unknown> }) {
  const { openModal } = useModal();
  const c = useVizColors();
  const { settings } = useFleetSettings();
  const u = useUnits();
  const [table, setTable] = useState<{
    page: number;
    search: string;
    status: ScheduleStatus | null;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', status: null, sort: { key: 'nextdue', dir: 'asc' } });
  const scopeKey = JSON.stringify(scope);

  // A new scope is a new result set: back to the first page.
  useEffect(() => setTable(s => (s.page === 1 ? s : { ...s, page: 1 })), [scopeKey]);

  const sortApi = SORT_KEYS[table.sort?.key ?? 'nextdue'] ?? 'next_due_date';
  const direction = table.sort?.dir ?? 'asc';
  const m = useMaintenanceSchedules({
    page: table.page,
    perPage: 15,
    status: table.status,
    search: table.search,
    sort: sortApi,
    direction,
    scope,
  });
  const exporter = useServerExport('/api/maintenance-schedules/export', 'maintenance schedules');
  // Only the report's point-in-time blocks (`schedules`, `fleet`) are used here, so a one-day window keeps it cheap.
  const rep = useMaintenanceReport({ from: today, to: today, days: 1, compare: false, scope });
  const due = rep.data?.schedules;
  const counts = m.counts;
  const days = counts?.due_soon_days ?? settings?.maintenance_due_soon_days ?? 7;
  // The window is stored in km; it is shown in the company's distance unit.
  const km = Math.round(
    u.distance.from(counts?.due_soon_km ?? settings?.maintenance_due_soon_km ?? 500)
  );
  const dist = u.distance.label;

  const tone: Record<ScheduleStatus, { color: string; Icon: typeof AlertOctagon }> = {
    overdue: { color: c.bucket.overdue, Icon: AlertOctagon },
    due_soon: { color: c.bucket.soon, Icon: AlertTriangle },
    ok: { color: c.bucket.ok, Icon: CheckCircle2 },
    unknown: { color: c.neutral, Icon: HelpCircle },
  };

  const tiles: { key: ScheduleStatus; hint: string; definition: string }[] = [
    {
      key: 'overdue',
      hint: 'past the due date or odometer',
      definition:
        'The due date has strictly passed, or the vehicle’s odometer is at or past the due reading. The worse of the two limits decides.',
    },
    {
      key: 'due_soon',
      hint: `within ${days} days or ${int(km)} ${dist}`,
      definition: `Not overdue yet, but due within the company’s due-soon window (${days} days or ${int(km)} ${dist} — Fleet settings).`,
    },
    {
      key: 'ok',
      hint: 'not due yet',
      definition: 'Comfortably inside its interval, on both date and distance.',
    },
    {
      key: 'unknown',
      hint: 'no interval or starting point',
      definition:
        'The due date cannot be worked out — the schedule has no interval, or no last service / starting odometer to count from. Nothing is guessed.',
    },
  ];

  const columns: Column<any>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      serverSort: SORT_KEYS.vehicle,
      render: r => (
        <div className="min-w-[150px]">
          <div className="font-medium text-ink-0 truncate">{r.vehicle?.name}</div>
          <div className="text-[11.5px] text-ink-2 truncate">
            {[r.vehicle?.plate, r.vehicle?.vehicle_category].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      serverSort: SORT_KEYS.service,
      render: r => <span className="text-ink-0">{r.service_type}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      serverSort: SORT_KEYS.status,
      render: r => {
        const s: ScheduleStatus = r.status;
        const { color, Icon } = tone[s] ?? tone.unknown;

        return (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-0">
            <Icon size={13} style={{ color }} aria-hidden="true" />
            {STATUS_LABEL[s] ?? s}
          </span>
        );
      },
    },
    {
      key: 'nextdue',
      header: 'Next due',
      serverSort: SORT_KEYS.nextdue,
      render: r =>
        r.next_due_date ? (
          <div>
            <div className="text-ink-0">{dateOnly(r.next_due_date)}</div>
            <div className="text-[11.5px] text-ink-2">
              {relativeDays(r.days_until_due)}
              {r.due_by === 'odometer' ? ' · by distance' : ''}
            </div>
          </div>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: 'remaining',
      header: 'Distance left',
      align: 'right',
      serverSort: SORT_KEYS.remaining,
      render: r =>
        isNum(r.km_until_due) ? (
          <span className={r.km_until_due < 0 ? 'text-ink-0 font-medium' : ''}>
            {r.km_until_due < 0 ? '−' : ''}
            {decimal(u.distance.from(Math.abs(r.km_until_due)), 0)} {dist}
          </span>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: 'last',
      header: 'Last service',
      serverSort: SORT_KEYS.last,
      render: r => <span className="text-ink-1">{dateOnly(r.last_service_date)}</span>,
    },
  ];

  return (
    <>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        {tiles.map(t => {
          const { color, Icon } = tone[t.key];
          const active = table.status === t.key;

          return (
            <div
              key={t.key}
              className={`rounded-xl transition-shadow ${active ? 'ring-2 ring-accent-cyan' : ''}`}
            >
              <KpiTile
                label={STATUS_LABEL[t.key]}
                icon={<Icon size={14} style={{ color }} />}
                value={counts ? int(counts[t.key]) : '—'}
                hint={active ? 'showing only these · click to clear' : t.hint}
                loading={m.isLoading}
                info={{ definition: t.definition }}
                onClick={() =>
                  setTable(s => ({ ...s, page: 1, status: s.status === t.key ? null : t.key }))
                }
              />
            </div>
          );
        })}
      </div>

      <WidgetCard
        title="When services fall due"
        subtitle={
          isNum(rep.data?.fleet?.vehicles_in_maintenance_now)
            ? `${int(rep.data.fleet.vehicles_in_maintenance_now)} ${rep.data.fleet.vehicles_in_maintenance_now === 1 ? 'vehicle is' : 'vehicles are'} in the workshop right now`
            : 'By due date, across every schedule'
        }
        info={{
          definition:
            'Every schedule of a vehicle in service, grouped by when it falls due: overdue (any limit passed), in 0–7 days, in 8–30 days, later, or not computable. Schedules due only by odometer sit in “Later”.',
          basis: `${isNum(due?.overdue_pct) ? `${pct(due.overdue_pct, 0)} of schedules with a due state are overdue. ` : ''}A snapshot of now — it has no period comparison. Retired and sold vehicles are left out.`,
        }}
        loading={rep.isLoading}
        error={rep.error}
        onRetry={() => rep.refetch()}
        fetching={rep.isFetching}
        empty={
          !rep.isLoading && (due?.total ?? 0) === 0
            ? {
                title: 'No maintenance schedules yet',
                hint: 'Add a schedule from a vehicle’s Maintenance tab.',
              }
            : null
        }
        table={{
          columns: ['Due', 'Schedules'],
          rows: [
            ['Overdue', due?.by_due_window?.overdue ?? 0],
            ['In 0–7 days', due?.by_due_window?.due_0_7 ?? 0],
            ['In 8–30 days', due?.by_due_window?.due_8_30 ?? 0],
            ['Later', due?.by_due_window?.later ?? 0],
            ['Not computable', due?.by_due_window?.unknown ?? 0],
          ],
        }}
        skeletonHeight={110}
      >
        <BucketBars
          surface={c.surface}
          legend={[
            { key: 'overdue', label: 'Overdue', color: c.bucket.overdue },
            { key: 'due_0_7', label: 'In 0–7 days', color: c.bucket.soon },
            { key: 'due_8_30', label: 'In 8–30 days', color: c.bucket.upcoming },
            { key: 'later', label: 'Later', color: c.bucket.ok },
            { key: 'unknown', label: 'Not computable', color: c.neutral },
          ]}
          rows={[
            {
              key: 'all',
              label: 'All schedules',
              segments: [
                {
                  key: 'overdue',
                  label: 'Overdue',
                  value: due?.by_due_window?.overdue ?? 0,
                  color: c.bucket.overdue,
                },
                {
                  key: 'due_0_7',
                  label: 'In 0–7 days',
                  value: due?.by_due_window?.due_0_7 ?? 0,
                  color: c.bucket.soon,
                },
                {
                  key: 'due_8_30',
                  label: 'In 8–30 days',
                  value: due?.by_due_window?.due_8_30 ?? 0,
                  color: c.bucket.upcoming,
                },
                {
                  key: 'later',
                  label: 'Later',
                  value: due?.by_due_window?.later ?? 0,
                  color: c.bucket.ok,
                },
                {
                  key: 'unknown',
                  label: 'Not computable',
                  value: due?.by_due_window?.unknown ?? 0,
                  color: c.neutral,
                },
              ],
            },
          ]}
        />
      </WidgetCard>

      <WidgetCard
        title="Service schedules"
        subtitle={`${int(counts?.total)} schedules across the fleet — click a row to open the vehicle`}
        info={{
          definition:
            'Every recurring service (oil change, inspection…) with its next due date and odometer, counted from the last service — or, if never serviced, from the starting point entered on the schedule.',
          basis: `Due-soon window: ${days} days / ${int(km)} ${dist} (Fleet settings). Retired and sold vehicles are left out.`,
        }}
        error={m.error}
        onRetry={() => m.refetch()}
        bodyClassName="px-0!"
        skeletonHeight={120}
        right={
          <Link
            href="/fleet-management/settings"
            className="text-[11.5px] text-ink-2 hover:text-ink-0 underline-offset-2 hover:underline"
          >
            Change due-soon window
          </Link>
        }
      >
        <DataTable
          caption="Maintenance schedules with computed due state"
          rows={m.items}
          loading={m.isLoading}
          rowKey={r => String(r.id)}
          columns={columns}
          searchText={r => `${r.service_type} ${r.vehicle?.name ?? ''}`}
          searchPlaceholder="Search service or vehicle"
          pageSize={15}
          server={{
            total: m.total,
            page: table.page,
            onPage: page => setTable(s => ({ ...s, page })),
            sort: table.sort,
            onSort: sort => setTable(s => ({ ...s, sort })),
            onQuery: search => setTable(s => (s.search === search ? s : { ...s, search, page: 1 })),
            fetching: m.isFetching,
            exporting: exporter.busy,
            onExport: () => exporter.run(m.exportParams),
          }}
          onRowClick={r =>
            openModal(<VehicleDetailModal vehicleId={r.vehicle_id} initialTab="maintenance" />)
          }
          empty={{
            title: table.status ? 'No schedules in this state' : 'No maintenance schedules yet',
            hint: table.status
              ? 'Click the active tile again to see every schedule.'
              : 'Add a schedule from a vehicle’s Maintenance tab.',
          }}
        />
      </WidgetCard>
    </>
  );
}

type View = 'schedules' | 'history' | 'compliance';

/**
 * Analytics → Maintenance (FLEET_ANALYTICS_DESIGN.md §4): will anything stop us from running?
 * Three views of the same question: what is due NOW (the schedule list, backend C1, plus the due-date
 * buckets of B7 — a snapshot, no date range), what was done and what it cost (the service history, backend
 * C2 + the B7 maintenance report — follows the date range and compares with the previous period), and which
 * paperwork is expiring (the compliance report, backend B7 — a snapshot). The view lives in the URL
 * (`?view=history` | `?view=compliance`) so it can be linked.
 */
export default function FleetMaintenanceAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params?.get('view');
  const view: View = raw === 'history' || raw === 'compliance' ? raw : 'schedules';
  const f = useAnalyticsFilters();
  const scope = useAnalyticsScope(SCOPE_FIELDS);

  const setView = (v: View) => {
    const sp = new URLSearchParams(params?.toString() ?? '');

    if (v === 'schedules') sp.delete('view');
    else sp.set('view', v);

    const qs = sp.toString();

    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <AnalyticsShell
      title="Maintenance"
      subtitle={
        view === 'schedules'
          ? 'Will anything stop us from running? · a snapshot of now'
          : view === 'compliance'
            ? 'Will any paperwork stop us from running? · a snapshot of now'
            : 'What was serviced and what it cost'
      }
      filters={view === 'history' ? f : undefined}
      comparable={view === 'history'}
      // The compliance report is company-wide paperwork with no vehicle scope, so it shows no scope row.
      scope={view === 'compliance' ? undefined : scope}
      intervalControl={view === 'history'}
      // The service history has no live "updated" stamp of its own; the filter bar shows its refresh state.
    >
      <ViewSwitch
        label="Maintenance view"
        value={view}
        onChange={setView}
        options={[
          { key: 'schedules', label: 'Schedules' },
          { key: 'history', label: 'Service history' },
          { key: 'compliance', label: 'Compliance' },
        ]}
      />
      {view === 'schedules' ? (
        <SchedulesView today={f.today} scope={scope.api} />
      ) : view === 'compliance' ? (
        <ComplianceView />
      ) : (
        <MaintenanceHistoryView f={f} scope={scope.api} />
      )}
    </AnalyticsShell>
  );
}
