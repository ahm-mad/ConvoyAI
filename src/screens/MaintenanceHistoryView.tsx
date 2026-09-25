/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { CircleDollarSign, Hammer, Route, Truck, Wrench, Receipt } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import { useCompanyLogs } from '@hooks/useCompanyLogs';
import { useMaintenanceReport } from '@hooks/useMaintenanceReport';
import { useServerExport } from '@hooks/useServerExport';
import { useUnits } from '@hooks/useUnits';
import { formatQty } from '@utils/units';
import { useFleetCurrency } from '@utils/fleetCurrency';
import type { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import { useKpiColumns } from '@components/analytics/useKpiColumns';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile, { type Polarity } from '@components/analytics/KpiTile';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { RankBars } from '@components/analytics/bars';
import { StackedColumns } from '@components/analytics/charts';
import { useVizColors } from '@components/analytics/theme';
import { compact, decimal, int, isNum, pct } from '@components/analytics/format';

/** Column → the API's `sort_by` key (backend C2). */
const SORT_KEYS: Record<string, string> = {
  date: 'service_date',
  vehicle: 'vehicle_name',
  service: 'service_type',
  vendor: 'vendor',
  cost: 'cost',
  odometer: 'odometer_km',
};

const dateOnly = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC', // stored as a calendar date at midnight UTC
      })
    : '—';

/**
 * Maintenance → Service history: what was serviced and what it cost.
 * The KPIs and charts come from the maintenance report (backend B7 — cost, services, cost per distance,
 * vehicles serviced with the previous period; cost per period; cost by service type, vehicle category and
 * vehicle); the table below is the company-wide service log (backend C2): every completed service in the
 * range, server-paged, sorted, searched and exportable, a row opens the vehicle's Maintenance tab. Costs are
 * in the company currency; retired and sold vehicles' services count (it is a history).
 */
export default function MaintenanceHistoryView({
  f,
  scope,
}: {
  f: ReturnType<typeof useAnalyticsFilters>;
  /** Request parameters of the page's scope (category / vehicle). */
  scope: Record<string, unknown>;
}) {
  const { openModal } = useModal();
  const c = useVizColors();
  const u = useUnits();
  const code = useFleetCurrency();
  const kpiGrid = useKpiColumns();
  const [table, setTable] = useState<{
    page: number;
    search: string;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', sort: { key: 'date', dir: 'desc' } });
  const scopeKey = JSON.stringify(scope);

  // A new scope is a new result set: back to the first page.
  useEffect(() => setTable(s => (s.page === 1 ? s : { ...s, page: 1 })), [scopeKey]);

  const sortApi = SORT_KEYS[table.sort?.key ?? 'date'] ?? 'service_date';
  const direction = table.sort?.dir ?? 'desc';
  const m = useCompanyLogs('maintenance', {
    from: f.from,
    to: f.to,
    page: table.page,
    perPage: 15,
    search: table.search,
    sort: sortApi,
    direction,
    scope,
  });
  const r = useMaintenanceReport({
    from: f.from,
    to: f.to,
    days: f.days,
    compare: f.compare,
    compareMode: f.compareMode,
    interval: f.interval,
    scope,
  });
  const exporter = useServerExport('/api/maintenance-logs/export', 'service history');
  const prevLabel = f.compare ? f.prevLabel : undefined;

  const d = r.data;
  const S = d?.summary;
  const series = (d?.series ?? []) as any[];
  const labels = series.map(x => f.axisLabel(x.bucket));
  const per = r.interval;
  const loading = r.isLoading;
  // A total of 0 with no priced service means "no cost recorded", not "free".
  const hasCost = isNum(S?.maintenance_cost?.value) && (S?.samples?.logs_with_cost ?? 0) > 0;
  const noLogs = !loading && (S?.logs?.value ?? 0) === 0;
  const perDist = `${code}/${u.perDistance.label}`;
  const val = (key: string) => (isNum(S?.[key]?.value) ? (S[key].value as number) : null);
  const tile = (key: string, polarity: Polarity) =>
    f.compare ? { pct: S?.[key]?.delta_pct ?? null, polarity, label: prevLabel } : undefined;
  const card = {
    loading,
    error: r.error,
    onRetry: () => r.refetch(),
    fetching: r.isFetching,
  };
  const serviceTypes = d?.by_service_type;
  const categories = (d?.by_vehicle_category ?? []) as any[];
  const topVehicles = d?.top_vehicles;
  // Cost of a group; a group with no priced service shows "—" (never 0).
  const costOf = (x: any) => (isNum(x.avg_cost) && isNum(x.cost) ? x.cost : null);
  const share = (x: any) => (isNum(x.share_pct) ? ` · ${pct(x.share_pct, 0)} of cost` : '');
  const services = (n: number) => `${int(n)} ${n === 1 ? 'service' : 'services'}`;

  const columns: Column<any>[] = [
    {
      key: 'date',
      header: 'Date',
      serverSort: SORT_KEYS.date,
      render: l => <span className="text-ink-0 whitespace-nowrap">{dateOnly(l.service_date)}</span>,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      serverSort: SORT_KEYS.vehicle,
      render: l => (
        <div className="min-w-[150px]">
          <div className="font-medium text-ink-0 truncate">
            {l.vehicle?.name}
            {l.vehicle?.lifecycle_status && l.vehicle.lifecycle_status !== 'active' && (
              <span className="ml-1.5 text-[10.5px] font-normal text-ink-2 capitalize">
                {String(l.vehicle.lifecycle_status).replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-ink-2 truncate">
            {[l.vehicle?.plate, l.vehicle?.vehicle_category].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      serverSort: SORT_KEYS.service,
      render: l => (
        <div className="min-w-[160px] max-w-[280px]">
          <div className="text-ink-0 truncate">{l.service_type}</div>
          {l.notes && <div className="text-[11.5px] text-ink-2 truncate">{l.notes}</div>}
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      serverSort: SORT_KEYS.vendor,
      render: l => <span className="text-ink-1">{l.vendor || '—'}</span>,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      serverSort: SORT_KEYS.cost,
      render: l =>
        isNum(l.cost) ? (
          <span className="text-ink-0">
            {code} {l.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      key: 'odometer',
      header: 'Odometer',
      align: 'right',
      serverSort: SORT_KEYS.odometer,
      render: l =>
        isNum(l.odometer_km) ? (
          formatQty(u.distance, l.odometer_km, 0)
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
  ];

  return (
    <>
      <div
        ref={kpiGrid.ref}
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${kpiGrid.cols}, minmax(0, 1fr))` }}
      >
        <KpiTile
          label="Maintenance cost"
          icon={<CircleDollarSign size={14} />}
          value={hasCost ? compact(val('maintenance_cost'), 1) : '—'}
          unit={hasCost ? code : undefined}
          spark={series.map(x => x.cost)}
          delta={hasCost ? tile('maintenance_cost', 'down-good') : undefined}
          hint={
            hasCost
              ? `${int(S?.samples?.logs_with_cost)} of ${int(S?.logs?.value)} services have a cost`
              : 'No service in the range has a cost'
          }
          loading={loading}
          info={{
            definition: 'Sum of the cost of every service in the range.',
            basis:
              'A service logged without a cost adds nothing. It is the same figure the dashboard shows as maintenance cost.',
          }}
        />
        <KpiTile
          label="Services logged"
          icon={<Wrench size={14} />}
          value={int(S?.logs?.value)}
          spark={series.map(x => x.logs)}
          delta={tile('logs', 'neutral')}
          hint={f.compare ? undefined : 'in the selected range'}
          loading={loading}
          info={{
            definition:
              'Completed services with a service date inside the range — retired and sold vehicles included (it is a history).',
          }}
        />
        <KpiTile
          label="Average cost"
          icon={<Receipt size={14} />}
          value={val('avg_cost_per_log') === null ? '—' : compact(val('avg_cost_per_log'), 1)}
          unit={val('avg_cost_per_log') === null ? undefined : code}
          delta={tile('avg_cost_per_log', 'down-good')}
          hint={
            val('avg_cost_per_log') === null
              ? 'No service in the range has a cost'
              : f.compare
                ? undefined
                : 'per service that has a cost'
          }
          loading={loading}
          info={{ definition: 'Total cost ÷ the services that have a cost.' }}
        />
        <KpiTile
          label={`Cost per ${u.distance.label}`}
          icon={<Route size={14} />}
          value={
            val('cost_per_km') === null ? '—' : decimal(u.perDistance.from(val('cost_per_km')!), 2)
          }
          unit={val('cost_per_km') === null ? undefined : perDist}
          delta={tile('cost_per_km', 'down-good')}
          hint={
            val('cost_per_km') === null ? 'Needs maintenance cost and completed trips' : undefined
          }
          loading={loading}
          info={{
            definition: `Maintenance cost ÷ the ${u.distance.label === 'mi' ? 'miles' : 'kilometres'} of the completed trips in the same range.`,
          }}
        />
        <KpiTile
          label="Vehicles serviced"
          icon={<Truck size={14} />}
          value={int(S?.vehicles_serviced?.value)}
          delta={tile('vehicles_serviced', 'neutral')}
          hint={f.compare ? undefined : 'with at least one service'}
          loading={loading}
          info={{ definition: 'Distinct vehicles with at least one service in the range.' }}
        />
        <KpiTile
          label="In the workshop now"
          icon={<Hammer size={14} />}
          value={int(d?.fleet?.vehicles_in_maintenance_now)}
          hint="Downtime days need a status history — not recorded yet"
          loading={loading}
          info={{
            definition:
              'Vehicles whose status is “in maintenance” right now — a snapshot, so it ignores the range and has no comparison.',
            basis:
              'The API keeps only a vehicle’s current status, so days spent in maintenance cannot be measured yet.',
          }}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Maintenance cost"
          subtitle={`${code} per ${per}`}
          info={{
            definition:
              'Cost of the services per period. A service belongs to the calendar date of its service date.',
            basis: 'Services logged without a cost add nothing.',
          }}
          {...card}
          empty={
            noLogs
              ? {
                  title: 'No services in this range',
                  hint: 'Log a completed service from a vehicle’s Maintenance tab, or try a longer range.',
                }
              : !loading && !hasCost
                ? {
                    title: 'No service has a cost',
                    hint: 'Enter the cost when logging a service to see spend per period.',
                  }
                : null
          }
          table={{
            columns: ['Period', `Cost (${code})`, 'Services', 'Vehicles'],
            rows: series.map((x, i) => [labels[i], decimal(x.cost, 2), x.logs, x.vehicles]),
          }}
          skeletonHeight={240}
        >
          <StackedColumns
            labels={labels}
            series={[
              {
                key: 'cost',
                label: 'Maintenance cost',
                color: c.cost.maintenance,
                data: series.map(x => (isNum(x.cost) ? x.cost : null)),
                format: v => `${code} ${decimal(v, 2)}`,
              },
            ]}
            integer={false}
            yTickFormat={v => compact(v, 1)}
            height={220}
            ariaLabel={`Maintenance cost per ${per}`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Services"
          subtitle={`Completed services per ${per}`}
          info={{
            definition: 'Number of completed services per period.',
          }}
          {...card}
          empty={
            noLogs
              ? {
                  title: 'No services in this range',
                  hint: 'Log a completed service from a vehicle’s Maintenance tab, or try a longer range.',
                }
              : null
          }
          table={{
            columns: ['Period', 'Services', 'Vehicles'],
            rows: series.map((x, i) => [labels[i], x.logs, x.vehicles]),
          }}
          skeletonHeight={240}
        >
          <StackedColumns
            labels={labels}
            series={[
              {
                key: 'logs',
                label: 'Services',
                color: c.cost.maintenance,
                data: series.map(x => x.logs),
              },
            ]}
            height={220}
            ariaLabel={`Services per ${per}`}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-4"
          title="Cost by service type"
          subtitle={`${code} — costliest first`}
          info={{
            definition:
              'Cost grouped by the service type (case and surrounding spaces ignored), most cost first, with its share of the range’s total.',
            basis: 'A type with no priced service shows “—”.',
          }}
          {...card}
          empty={
            noLogs ? { title: 'No services in this range', hint: 'Try a longer range.' } : null
          }
          table={{
            columns: ['Service type', 'Services', `Cost (${code})`, 'Share'],
            rows: [
              ...((serviceTypes?.items ?? []) as any[]).map(x => [
                x.service_type,
                x.logs,
                isNum(costOf(x)) ? decimal(costOf(x), 2) : '—',
                isNum(x.share_pct) ? pct(x.share_pct, 1) : '—',
              ]),
              ...(serviceTypes?.other_count
                ? [['Other service types', serviceTypes.other_count, '—', '—']]
                : []),
            ],
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.cost.maintenance}
            format={v => `${code} ${compact(v, 1)}`}
            rows={[
              ...((serviceTypes?.items ?? []) as any[]).map((x, i) => ({
                key: `t${i}`,
                label: x.service_type,
                sublabel: `${services(x.logs)}${share(x)}`,
                value: costOf(x),
              })),
              ...(serviceTypes?.other_count
                ? [
                    {
                      key: 'other',
                      label: 'Other service types',
                      sublabel: `${int(serviceTypes.other_count)} more`,
                      value: null,
                      color: c.neutral,
                    },
                  ]
                : []),
            ]}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-4"
          title="Cost by vehicle category"
          subtitle={`${code} — costliest first`}
          info={{
            definition:
              'Cost of the range’s services grouped by the vehicle category as stored, with its share of the total.',
            basis: 'A vehicle with no category is listed as “Uncategorised”.',
          }}
          {...card}
          empty={
            noLogs ? { title: 'No services in this range', hint: 'Try a longer range.' } : null
          }
          table={{
            columns: ['Category', 'Vehicles', 'Services', `Cost (${code})`, 'Share'],
            rows: categories.map(x => [
              x.category ?? 'Uncategorised',
              x.vehicles,
              x.logs,
              isNum(costOf(x)) ? decimal(costOf(x), 2) : '—',
              isNum(x.share_pct) ? pct(x.share_pct, 1) : '—',
            ]),
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.cost.maintenance}
            format={v => `${code} ${compact(v, 1)}`}
            rows={categories.map((x, i) => ({
              key: `c${i}`,
              label: x.category ?? 'Uncategorised',
              sublabel: `${int(x.vehicles)} ${x.vehicles === 1 ? 'vehicle' : 'vehicles'} · ${services(x.logs)}`,
              value: costOf(x),
            }))}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-4"
          title="Costliest vehicles"
          subtitle={`${code} — click a bar to open the vehicle`}
          info={{
            definition:
              'The vehicles with the most maintenance cost in the range, with their share of the total.',
            basis: 'Retired and sold vehicles are included.',
          }}
          {...card}
          empty={
            noLogs ? { title: 'No services in this range', hint: 'Try a longer range.' } : null
          }
          table={{
            columns: ['Vehicle', 'Services', `Cost (${code})`, 'Share'],
            rows: [
              ...((topVehicles?.items ?? []) as any[]).map(x => [
                x.vehicle?.name ?? '—',
                x.logs,
                isNum(costOf(x)) ? decimal(costOf(x), 2) : '—',
                isNum(x.share_pct) ? pct(x.share_pct, 1) : '—',
              ]),
              ...(topVehicles?.other_count
                ? [['Other vehicles', topVehicles.other_count, '—', '—']]
                : []),
            ],
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.cost.maintenance}
            format={v => `${code} ${compact(v, 1)}`}
            onSelect={key =>
              key === 'other'
                ? undefined
                : openModal(<VehicleDetailModal vehicleId={key} initialTab="maintenance" />)
            }
            rows={[
              ...((topVehicles?.items ?? []) as any[]).map(x => ({
                key: String(x.vehicle?.id),
                label: x.vehicle?.name ?? '—',
                sublabel: `${x.vehicle?.plate ? `${x.vehicle.plate} · ` : ''}${services(x.logs)}${share(x)}`,
                value: costOf(x),
              })),
              ...(topVehicles?.other_count
                ? [
                    {
                      key: 'other',
                      label: 'Other vehicles',
                      sublabel: `${int(topVehicles.other_count)} more`,
                      value: null,
                      color: c.neutral,
                    },
                  ]
                : []),
            ]}
          />
        </WidgetCard>
      </div>

      <WidgetCard
        title="Service history"
        subtitle={`${int(m.total)} ${m.total === 1 ? 'service' : 'services'} — click a row to open the vehicle`}
        info={{
          definition:
            'Every completed service across the fleet, newest first. Costs are in the company currency.',
          basis: `${services(m.total)} in the range. Cost, price and distance follow the company’s currency and units.`,
        }}
        error={m.error}
        onRetry={() => m.refetch()}
        bodyClassName="px-0!"
        skeletonHeight={120}
      >
        <DataTable
          caption="Completed services with date, vehicle, vendor, cost and odometer"
          rows={m.items}
          loading={m.isLoading}
          rowKey={l => String(l.id)}
          columns={columns}
          searchText={l => `${l.service_type} ${l.vehicle?.name ?? ''} ${l.vendor ?? ''}`}
          searchPlaceholder="Search service, vendor, vehicle"
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
          onRowClick={l =>
            openModal(<VehicleDetailModal vehicleId={l.vehicle_id} initialTab="maintenance" />)
          }
          empty={{
            title: 'No services in this range',
            hint: 'Log a completed service from a vehicle’s Maintenance tab, or try a longer range.',
          }}
        />
      </WidgetCard>
    </>
  );
}
