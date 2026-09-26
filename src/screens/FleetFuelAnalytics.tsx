/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { CircleDollarSign, Flag, Fuel, Gauge, Route, Tag } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useFuelReport, type FuelTankFilter } from '@hooks/useFuelReport';
import { useServerExport } from '@hooks/useServerExport';
import { useUnits } from '@hooks/useUnits';
import { formatQty } from '@utils/units';
import { useFleetCurrency } from '@utils/fleetCurrency';
import AnalyticsShell from '@components/analytics/AnalyticsShell';
import { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import { useKpiColumns } from '@components/analytics/useKpiColumns';
import { useAnalyticsScope, type ScopeField } from '@components/analytics/useAnalyticsScope';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile, { type Polarity } from '@components/analytics/KpiTile';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { RankBars } from '@components/analytics/bars';
import { StackedColumns, TrendLine } from '@components/analytics/charts';
import { STATUS, useVizColors } from '@components/analytics/theme';
import { compact, decimal, int, isNum } from '@components/analytics/format';

/** Scope fields the whole page honours (backend B6: category, vehicle, yard, cost centre — a fill has no driver). */
const SCOPE_FIELDS: ScopeField[] = ['category', 'vehicle', 'yard', 'costCentre'];
const SCOPE_HINTS = { yard: 'Vehicles currently checked in at this yard' };

/** Column → the API's `sort_by` key (backend B6). */
const SORT_KEYS: Record<string, string> = {
  date: 'fill_date',
  vehicle: 'vehicle_name',
  volume: 'liters',
  economy: 'economy_km_per_l',
  cost: 'cost',
  price: 'price_per_liter',
  odometer: 'odometer_km',
  vendor: 'vendor',
};

/** The three anomaly flags — worded as "check", never as verdicts (backend §25.3). */
const FLAG_LABEL: Record<string, string> = {
  over_capacity: 'Above tank capacity',
  economy_drop: 'Economy drop',
  odometer_backwards: 'Odometer went backwards',
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
 * Analytics → Fuel & efficiency (FLEET_ANALYTICS_DESIGN.md §4): are we wasting fuel?
 * Everything comes from ONE call to the fuel report (backend B6): KPI summary with the previous period,
 * economy / price / litres / cost per period, economy by vehicle category, spend by vendor, the fills worth
 * a second look, and a server-paged fills table. Volumes, prices and economy follow the company's unit
 * system (the API is metric). A fill counts once, on its own calendar date.
 */
export default function FleetFuelAnalytics() {
  const { openModal } = useModal();
  const c = useVizColors();
  const u = useUnits();
  const code = useFleetCurrency();
  const { settings } = useFleetSettings();
  const f = useAnalyticsFilters();
  const scope = useAnalyticsScope(SCOPE_FIELDS);
  const kpiGrid = useKpiColumns();
  const [table, setTable] = useState<{
    page: number;
    search: string;
    filter: FuelTankFilter;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', filter: null, sort: { key: 'date', dir: 'desc' } });
  // A new scope is a new result set: back to the first page.
  useEffect(() => setTable(s => (s.page === 1 ? s : { ...s, page: 1 })), [scope.key]);
  const r = useFuelReport({
    from: f.from,
    to: f.to,
    days: f.days,
    compare: f.compare,
    compareMode: f.compareMode,
    interval: f.interval,
    page: table.page,
    perPage: 15,
    filter: table.filter,
    search: table.search,
    sort: SORT_KEYS[table.sort?.key ?? 'date'] ?? 'fill_date',
    direction: table.sort?.dir ?? 'desc',
    scope: scope.api,
  });
  const exporter = useServerExport('/api/fleet/analytics/fuel/export', 'fuel fill-ups');
  const prevLabel = f.compare ? f.prevLabel : undefined;

  const d = r.data;
  const S = d?.summary;
  const samples = S?.samples;
  const series = (d?.series ?? []) as any[];
  const labels = series.map(x => f.axisLabel(x.bucket));
  const per = r.interval;
  const loading = r.isLoading;
  const vol = u.volume.label;
  const eco = u.economy.label;
  const perDist = `${code}/${u.perDistance.label}`;
  const anomalies = d?.anomalies;
  const ecoTarget = settings?.fuel_economy_target;
  // A total of 0 with no priced fill means "no cost recorded", not "free fuel".
  const hasCost = isNum(S?.total_cost?.value) && (samples?.priced_fills ?? 0) > 0;

  // Metric API value → what the company reads (all conversions in one place).
  const inVol = (v: unknown) => (isNum(v) ? u.volume.from(v) : null);
  const inEco = (v: unknown) => (isNum(v) ? u.economy.from(v) : null);
  const inPrice = (v: unknown) => (isNum(v) ? v * u.volume.to(1) : null); // per litre → per display unit
  const inPerDist = (v: unknown) => (isNum(v) ? u.perDistance.from(v) : null);
  const conv: Record<string, (v: unknown) => number | null> = {
    liters: inVol,
    fuel_economy_km_per_l: inEco,
    avg_price_per_liter: inPrice,
    fuel_cost_per_km: inPerDist,
  };
  const val = (key: string) => {
    const v = S?.[key]?.value;

    return isNum(v) ? (conv[key] ? conv[key](v) : v) : null;
  };
  const spark = (key: string, skipEmpty = false) => {
    const pts = series.map(x => (conv[key] ? conv[key](x[key]) : isNum(x[key]) ? x[key] : null));

    // Sparse series (economy closes an interval only on some days): draw through the days that have a value.
    return skipEmpty ? pts.filter(isNum) : pts;
  };
  const tile = (key: string, polarity: Polarity) =>
    f.compare ? { pct: S?.[key]?.delta_pct ?? null, polarity, label: prevLabel } : undefined;

  const noFills = !loading && (S?.fills?.value ?? 0) === 0;
  const noEconomy = !loading && series.every(x => !isNum(x.fuel_economy_km_per_l));
  const noPrice = !loading && series.every(x => !isNum(x.avg_price_per_liter));

  /** One human sentence per flag, in the company's units. */
  const flagDetail = (a: any, type: string): string => {
    if (type === 'over_capacity') {
      return `${formatQty(u.volume, a.liters, 1)} filled, the tank holds ${formatQty(u.volume, a.tank_capacity_liters, 0)}`;
    }

    if (type === 'economy_drop') {
      return `${decimal(inEco(a.economy_km_per_l), 1)} ${eco} against a usual ${decimal(inEco(a.baseline_economy_km_per_l), 1)} (${isNum(a.drop_pct) ? `−${decimal(a.drop_pct, 0)}%` : '—'})`;
    }

    return `${formatQty(u.distance, a.odometer_km, 0)} after ${formatQty(u.distance, a.previous_odometer_km, 0)}`;
  };

  const categories = ((d?.by_vehicle_category ?? []) as any[])
    .map(x => ({ ...x, eco: inEco(x.fuel_economy_km_per_l) }))
    .sort((a, b) => (b.eco ?? -1) - (a.eco ?? -1));
  const vendors = d?.by_vendor;

  const openVehicle = (id: unknown) =>
    openModal(<VehicleDetailModal vehicleId={id as any} initialTab="fuel" />);

  const columns: Column<any>[] = [
    {
      key: 'date',
      header: 'Date',
      serverSort: SORT_KEYS.date,
      render: l => <span className="text-ink-0 whitespace-nowrap">{dateOnly(l.fill_date)}</span>,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      serverSort: SORT_KEYS.vehicle,
      render: l => (
        <div className="min-w-[150px]">
          <div className="font-medium text-ink-0 truncate">{l.vehicle?.name}</div>
          <div className="text-[11.5px] text-ink-2 truncate">
            {[l.vehicle?.plate, l.vehicle?.vehicle_category].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'volume',
      header: 'Fuel',
      align: 'right',
      serverSort: SORT_KEYS.volume,
      render: l => (
        <div>
          <div className="text-ink-0">{formatQty(u.volume, l.liters, 1)}</div>
          <div className="text-[11.5px] text-ink-2">
            {l.is_full_tank ? 'Full tank' : 'Partial fill'}
          </div>
        </div>
      ),
    },
    {
      key: 'economy',
      header: 'Economy',
      align: 'right',
      serverSort: SORT_KEYS.economy,
      render: l =>
        isNum(l.economy_km_per_l) ? (
          <span className="text-ink-0">
            {decimal(inEco(l.economy_km_per_l), 1)}{' '}
            <span className="text-ink-2 text-[11.5px]">{eco}</span>
          </span>
        ) : (
          <span className="text-ink-2" title="Shown on a full-tank fill that closes an interval">
            —
          </span>
        ),
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
      key: 'price',
      header: `Price / ${vol}`,
      align: 'right',
      serverSort: SORT_KEYS.price,
      render: l =>
        isNum(l.price_per_liter) ? (
          decimal(inPrice(l.price_per_liter), 2)
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
    {
      key: 'vendor',
      header: 'Station',
      serverSort: SORT_KEYS.vendor,
      render: l => (
        <div className="min-w-[120px] max-w-[220px]">
          <div className="text-ink-1 truncate">{l.station_name || l.vendor || '—'}</div>
          {l.station_name && l.vendor && (
            <div className="text-[11.5px] text-ink-2 truncate">{l.vendor}</div>
          )}
        </div>
      ),
    },
    {
      key: 'check',
      header: 'Check',
      render: l =>
        (l.anomaly_types ?? []).length ? (
          <span className="inline-flex flex-col gap-0.5">
            {(l.anomaly_types as string[]).map(t => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[12px] text-ink-0">
                <Flag size={12} style={{ color: STATUS.warning }} aria-hidden="true" />
                {FLAG_LABEL[t] ?? t}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
  ];

  const chips: { key: FuelTankFilter; label: string; n?: number }[] = [
    { key: null, label: 'All fill-ups' },
    { key: 'full', label: 'Full tank' },
    { key: 'partial', label: 'Partial' },
    { key: 'check', label: 'To check', n: anomalies?.total },
  ];

  const card = {
    loading,
    error: r.error,
    onRetry: () => r.refetch(),
    fetching: r.isFetching,
  };

  return (
    <AnalyticsShell
      title="Fuel & efficiency"
      subtitle="Are we wasting fuel?"
      filters={f}
      scope={scope}
      scopeHints={SCOPE_HINTS}
      intervalControl
      onRefresh={() => r.refetch()}
      fetching={r.isFetching}
      updatedAt={r.meta?.generated_at}
    >
      <div
        ref={kpiGrid.ref}
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${kpiGrid.cols}, minmax(0, 1fr))` }}
      >
        <KpiTile
          label="Fuel economy"
          icon={<Gauge size={14} />}
          value={
            val('fuel_economy_km_per_l') === null ? '—' : decimal(val('fuel_economy_km_per_l'), 2)
          }
          unit={val('fuel_economy_km_per_l') === null ? undefined : eco}
          spark={spark('fuel_economy_km_per_l', true)}
          delta={tile('fuel_economy_km_per_l', 'up-good')}
          hint={
            val('fuel_economy_km_per_l') === null
              ? 'Needs two full fill-ups with odometer readings'
              : isNum(ecoTarget)
                ? `Target ${decimal(inEco(ecoTarget), 2)} ${eco}`
                : `based on ${int(samples?.economy_intervals)} ${samples?.economy_intervals === 1 ? 'interval' : 'intervals'}`
          }
          loading={loading}
          info={{
            definition:
              u.economy.label === 'km/L'
                ? 'Kilometres between two full fill-ups divided by the litres put in since the earlier one (full-tank method).'
                : `Miles between two full fill-ups divided by the ${u.system === 'us' ? 'US' : 'imperial'} gallons put in since the earlier one (full-tank method).`,
            basis: `Only fills of the selected range count — the opening full fill of an interval must be inside it, so short ranges often show “—”. Based on ${int(samples?.economy_intervals)} intervals.`,
          }}
        />
        <KpiTile
          label="Fuel cost"
          icon={<CircleDollarSign size={14} />}
          value={hasCost ? compact(S.total_cost.value, 1) : '—'}
          unit={hasCost ? code : undefined}
          spark={series.map(x => x.total_cost).filter(isNum)}
          delta={hasCost ? tile('total_cost', 'neutral') : undefined}
          hint={
            hasCost
              ? `${int(samples?.priced_fills)} of ${int(S?.fills?.value)} fill-ups have a cost`
              : 'No fill-up in the range has a cost'
          }
          loading={loading}
          info={{
            definition:
              'Sum of the cost of every fill-up in the range (the total cost, else the cost, of each fill).',
            basis: 'A fill-up logged without a cost adds nothing and is not in the average price.',
          }}
        />
        <KpiTile
          label="Fuel bought"
          icon={<Fuel size={14} />}
          value={val('liters') === null ? '—' : compact(val('liters'), 1)}
          unit={val('liters') === null ? undefined : vol}
          spark={spark('liters')}
          delta={tile('liters', 'neutral')}
          loading={loading}
          info={{
            definition: 'Total fuel put in the vehicles in the range.',
            basis:
              'A fill-up logged in gallons is converted; the total is shown in the company’s fuel unit.',
          }}
        />
        <KpiTile
          label={`Average price per ${vol}`}
          icon={<Tag size={14} />}
          value={val('avg_price_per_liter') === null ? '—' : decimal(val('avg_price_per_liter'), 2)}
          unit={val('avg_price_per_liter') === null ? undefined : `${code}/${vol}`}
          spark={spark('avg_price_per_liter', true)}
          delta={tile('avg_price_per_liter', 'down-good')}
          hint={
            val('avg_price_per_liter') === null ? 'No fill-up in the range has a cost' : undefined
          }
          loading={loading}
          info={{ definition: 'Cost ÷ fuel of exactly the fill-ups that have a cost.' }}
        />
        <KpiTile
          label={`Fuel cost per ${u.distance.label}`}
          icon={<Route size={14} />}
          value={val('fuel_cost_per_km') === null ? '—' : decimal(val('fuel_cost_per_km'), 2)}
          unit={val('fuel_cost_per_km') === null ? undefined : perDist}
          delta={tile('fuel_cost_per_km', 'down-good')}
          hint={
            val('fuel_cost_per_km') === null ? 'Needs fuel cost and completed trips' : undefined
          }
          loading={loading}
          info={{
            definition: `Fuel cost ÷ the ${u.distance.label === 'mi' ? 'miles' : 'kilometres'} of the completed trips in the same range.`,
            basis: 'The same figure the dashboard uses for its fuel cost per distance.',
          }}
        />
        <KpiTile
          label="Fill-ups"
          icon={<Fuel size={14} />}
          value={int(S?.fills?.value)}
          spark={series.map(x => x.fills)}
          delta={tile('fills', 'neutral')}
          hint={
            (anomalies?.total ?? 0) > 0
              ? `${int(anomalies.total)} to check`
              : `${int(samples?.fills_with_odometer)} with an odometer reading`
          }
          loading={loading}
          info={{
            definition:
              'Fuel fill-ups dated inside the range, for every vehicle (retired and sold ones included).',
          }}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Fuel economy"
          subtitle={`Distance per ${vol} of fuel, per ${per}`}
          info={{
            definition:
              'For each period: the economy of the full-tank intervals that CLOSED in it (distance since the previous full fill ÷ fuel since).',
            basis: isNum(ecoTarget)
              ? `Target ${decimal(inEco(ecoTarget), 2)} ${eco} (Fleet settings). A period that closes no interval is left blank.`
              : 'Set a target in Fleet settings to draw a target line. A period that closes no interval is left blank.',
          }}
          {...card}
          empty={
            noEconomy
              ? {
                  title: 'Not enough full fill-ups',
                  hint: 'Economy needs two consecutive full-tank fills with odometer readings inside the range.',
                }
              : null
          }
          table={{
            columns: ['Period', `Economy (${eco})`, 'Fill-ups'],
            rows: series.map((x, i) => [
              labels[i],
              isNum(x.fuel_economy_km_per_l) ? decimal(inEco(x.fuel_economy_km_per_l), 2) : '—',
              x.fills,
            ]),
          }}
          skeletonHeight={240}
        >
          <TrendLine
            labels={labels}
            series={[
              {
                key: 'economy',
                label: 'Economy',
                color: c.series(0),
                data: series.map(x => inEco(x.fuel_economy_km_per_l)),
                format: v => `${decimal(v, 2)} ${eco}`,
              },
            ]}
            target={
              isNum(ecoTarget)
                ? {
                    value: inEco(ecoTarget) as number,
                    label: `Target ${decimal(inEco(ecoTarget), 1)} ${eco}`,
                  }
                : null
            }
            yTickFormat={v => decimal(v, 1)}
            height={220}
            ariaLabel={`Fuel economy per ${per}`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Price per fuel unit"
          subtitle={`Average price paid per ${vol}, per ${per}`}
          info={{
            definition: 'Cost ÷ fuel of the fill-ups that have a cost, for each period.',
            basis: 'A period with no priced fill-up is left blank.',
          }}
          {...card}
          empty={
            noPrice
              ? {
                  title: 'No fill-up has a cost',
                  hint: 'Enter the cost when logging a fill-up to see the price trend.',
                }
              : null
          }
          table={{
            columns: ['Period', `Price (${code}/${vol})`],
            rows: series.map((x, i) => [
              labels[i],
              isNum(x.avg_price_per_liter) ? decimal(inPrice(x.avg_price_per_liter), 2) : '—',
            ]),
          }}
          skeletonHeight={240}
        >
          <TrendLine
            labels={labels}
            series={[
              {
                key: 'price',
                label: 'Price',
                color: c.series(0),
                data: series.map(x => inPrice(x.avg_price_per_liter)),
                format: v => `${code} ${decimal(v, 2)} / ${vol}`,
              },
            ]}
            yTickFormat={v => decimal(v, 2)}
            height={220}
            ariaLabel={`Average fuel price per ${per}`}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Fuel bought"
          subtitle={`${vol} per ${per}`}
          info={{
            definition:
              'Fuel put in per period. A fill-up belongs to the calendar date of its fill date.',
            basis: 'Gallons are converted; the axis shows the company’s fuel unit.',
          }}
          {...card}
          empty={
            noFills ? { title: 'No fill-ups in this range', hint: 'Try a longer range.' } : null
          }
          table={{
            columns: ['Period', `Fuel (${vol})`, 'Fill-ups'],
            rows: series.map((x, i) => [labels[i], decimal(inVol(x.liters), 1), x.fills]),
          }}
          skeletonHeight={240}
        >
          <StackedColumns
            labels={labels}
            series={[
              {
                key: 'liters',
                label: 'Fuel',
                color: c.cost.fuel,
                data: series.map(x => inVol(x.liters)),
                format: v => `${decimal(v, 1)} ${vol}`,
              },
            ]}
            integer={false}
            yTickFormat={v => compact(v, 1)}
            height={220}
            ariaLabel={`Fuel bought per ${per}`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Fuel cost"
          subtitle={`${code} per ${per}`}
          info={{
            definition: 'Cost of the fill-ups per period (the total cost, else the cost, of each).',
            basis: 'Fill-ups logged without a cost add nothing.',
          }}
          {...card}
          empty={
            !loading && !hasCost
              ? {
                  title: 'No fill-up has a cost',
                  hint: 'Enter the cost when logging a fill-up to see spend per period.',
                }
              : null
          }
          table={{
            columns: ['Period', `Cost (${code})`],
            rows: series.map((x, i) => [
              labels[i],
              isNum(x.total_cost) ? decimal(x.total_cost, 2) : '—',
            ]),
          }}
          skeletonHeight={240}
        >
          <StackedColumns
            labels={labels}
            series={[
              {
                key: 'cost',
                label: 'Fuel cost',
                color: c.cost.fuel,
                data: series.map(x => (isNum(x.total_cost) ? x.total_cost : null)),
                format: v => `${code} ${decimal(v, 2)}`,
              },
            ]}
            integer={false}
            yTickFormat={v => compact(v, 1)}
            height={220}
            ariaLabel={`Fuel cost per ${per}`}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Efficiency by vehicle category"
          subtitle={`Fuel economy (${eco}) — higher is better`}
          info={{
            definition:
              'The full-tank economy of each vehicle category over the range, best first. Vehicles are grouped by the category as stored.',
            basis: 'A category with no closed full-tank interval shows “—”.',
          }}
          {...card}
          empty={
            !loading && categories.length === 0
              ? { title: 'No fill-ups in this range', hint: 'Try a longer range.' }
              : null
          }
          table={{
            columns: ['Category', 'Vehicles', 'Fill-ups', `Fuel (${vol})`, `Economy (${eco})`],
            rows: categories.map(x => [
              x.category ?? 'Uncategorised',
              x.vehicles,
              x.fills,
              decimal(inVol(x.liters), 1),
              isNum(x.eco) ? decimal(x.eco, 2) : '—',
            ]),
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.series(0)}
            format={v => `${decimal(v, 1)} ${eco}`}
            rows={categories.map((x, i) => ({
              key: `cat${i}`,
              label: x.category ?? 'Uncategorised',
              sublabel: `${int(x.vehicles)} ${x.vehicles === 1 ? 'vehicle' : 'vehicles'} · ${int(x.fills)} ${x.fills === 1 ? 'fill-up' : 'fill-ups'}`,
              value: isNum(x.eco) ? x.eco : null,
            }))}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Spend by vendor"
          subtitle={`${code} — most spend first`}
          info={{
            definition:
              'Fuel cost grouped by the vendor recorded on the fill-up (case and surrounding spaces ignored).',
            basis: 'A fill-up without a vendor is listed as “No vendor recorded”.',
          }}
          {...card}
          empty={
            !loading && !hasCost
              ? {
                  title: 'No fill-up has a cost',
                  hint: 'Spend appears once fill-ups are logged with a cost.',
                }
              : null
          }
          table={{
            columns: ['Vendor', 'Fill-ups', `Fuel (${vol})`, `Cost (${code})`],
            rows: [
              ...((vendors?.items ?? []) as any[]).map(x => [
                x.vendor ?? 'No vendor recorded',
                x.fills,
                decimal(inVol(x.liters), 1),
                decimal(x.total_cost, 2),
              ]),
              ...(vendors?.other_count ? [['Other vendors', vendors.other_count, '—', '—']] : []),
            ],
          }}
          skeletonHeight={200}
        >
          <RankBars
            color={c.cost.fuel}
            format={v => `${code} ${compact(v, 1)}`}
            rows={[
              ...((vendors?.items ?? []) as any[]).map((x, i) => ({
                key: `v${i}`,
                label: x.vendor ?? 'No vendor recorded',
                sublabel: `${int(x.fills)} ${x.fills === 1 ? 'fill-up' : 'fill-ups'}${
                  isNum(x.avg_price_per_liter)
                    ? ` · ${decimal(inPrice(x.avg_price_per_liter), 2)} ${code}/${vol}`
                    : ''
                }`,
                value: isNum(x.total_cost) && isNum(x.avg_price_per_liter) ? x.total_cost : null,
              })),
              ...(vendors?.other_count
                ? [
                    {
                      key: 'other',
                      label: 'Other vendors',
                      sublabel: `${int(vendors.other_count)} vendors`,
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
        title="Fill-ups worth a second look"
        subtitle={
          (anomalies?.total ?? 0) > 0
            ? `${int(anomalies.total)} flagged — these are for a person to check, not verdicts`
            : 'Flags for a person to check, not verdicts'
        }
        info={{
          definition:
            'A fill above the vehicle’s tank capacity, a full-tank interval whose economy is far below the vehicle’s usual, or an odometer reading lower than the previous fill.',
          basis: `The economy drop is flagged at ${int(r.meta?.economy_drop_pct ?? 30)}% below the vehicle’s other intervals in the range. Newest first.`,
        }}
        {...card}
        empty={
          !loading && (anomalies?.total ?? 0) === 0
            ? {
                title: 'Nothing to check',
                hint: 'No fill above tank capacity, no sharp economy drop and no odometer going backwards in this range.',
              }
            : null
        }
        table={{
          columns: ['Date', 'Vehicle', 'Flag', 'Detail'],
          rows: ((anomalies?.items ?? []) as any[]).flatMap(a =>
            (a.types as string[]).map(t => [
              dateOnly(a.fill_date),
              a.vehicle?.name ?? '—',
              FLAG_LABEL[t] ?? t,
              flagDetail(a, t),
            ])
          ),
        }}
        skeletonHeight={120}
        footer={
          (anomalies?.total ?? 0) > (anomalies?.items?.length ?? 0) ? (
            <button
              type="button"
              onClick={() => setTable(s => ({ ...s, page: 1, filter: 'check' }))}
              className="text-[12px] text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded"
            >
              Showing the newest {int(anomalies?.items?.length)} of {int(anomalies?.total)} — filter
              the table below to see them all
            </button>
          ) : undefined
        }
      >
        <ul className="grid grid-cols-1 xl:grid-cols-2 gap-x-10 -my-1">
          {((anomalies?.items ?? []) as any[]).map(a => (
            <li
              key={a.fill_id}
              className="border-b border-line-soft last:border-b-0 xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
            >
              <button
                type="button"
                onClick={() => openVehicle(a.vehicle?.id)}
                className="w-full text-left py-2.5 px-2 -mx-2 rounded-md hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink-0 truncate">
                    {a.vehicle?.name ?? '—'}
                    {a.vehicle?.plate && (
                      <span className="ml-1.5 text-[11.5px] font-normal text-ink-2">
                        {a.vehicle.plate}
                      </span>
                    )}
                  </span>
                  <span className="text-[11.5px] text-ink-2 shrink-0">{dateOnly(a.fill_date)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {(a.types as string[]).map(t => (
                    <li key={t} className="flex items-start gap-1.5 text-[12.5px] text-ink-1">
                      <Flag
                        size={12}
                        className="mt-[3px] shrink-0"
                        style={{ color: STATUS.warning }}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="text-ink-0">{FLAG_LABEL[t] ?? t}</span> —{' '}
                        {flagDetail(a, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard
        title="Fill-ups"
        subtitle={`${int(d?.table?.pagination?.total)} ${d?.table?.pagination?.total === 1 ? 'fill-up' : 'fill-ups'} — click a row to open the vehicle`}
        info={{
          definition:
            'Every fuel fill-up in the range, newest first. Volumes and prices are shown in the company’s units whichever unit the fill-up was logged in.',
          basis:
            'Filtering narrows this table only — the charts above keep their totals. Economy appears on a full-tank fill that closes an interval.',
        }}
        error={r.error}
        onRetry={() => r.refetch()}
        bodyClassName="px-0!"
        skeletonHeight={120}
      >
        <div role="group" aria-label="Filter fill-ups" className="flex flex-wrap gap-1.5 px-5 pb-3">
          {chips.map(ch => {
            const on = table.filter === ch.key;

            return (
              <button
                key={String(ch.key)}
                type="button"
                aria-pressed={on}
                onClick={() => setTable(s => ({ ...s, page: 1, filter: ch.key }))}
                className={`inline-flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                  on
                    ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
                    : 'border-line-soft text-ink-1 hover:bg-surface-2'
                }`}
              >
                {ch.label}
                {isNum(ch.n) && <b className="tabular-nums">{ch.n.toLocaleString()}</b>}
              </button>
            );
          })}
        </div>
        <DataTable
          caption="Fuel fill-ups with date, vehicle, fuel, economy, cost, price and odometer"
          rows={(d?.table?.items ?? []) as any[]}
          loading={loading}
          rowKey={l => String(l.fill_id)}
          columns={columns}
          searchText={l => `${l.vehicle?.name ?? ''} ${l.vendor ?? ''} ${l.station_name ?? ''}`}
          searchPlaceholder="Search vehicle, station, vendor, receipt"
          pageSize={15}
          server={{
            total: d?.table?.pagination?.total ?? 0,
            page: table.page,
            onPage: page => setTable(s => ({ ...s, page })),
            sort: table.sort,
            onSort: sort => setTable(s => ({ ...s, sort })),
            onQuery: search => setTable(s => (s.search === search ? s : { ...s, search, page: 1 })),
            fetching: r.isFetching,
            exporting: exporter.busy,
            onExport: () => exporter.run(r.exportParams),
          }}
          onRowClick={l => openVehicle(l.vehicle?.id)}
          empty={{
            title: table.filter === 'check' ? 'Nothing to check' : 'No fill-ups match',
            hint: table.filter
              ? 'Choose “All fill-ups” to see every fill-up in the range.'
              : 'Log a fill-up from a vehicle’s Fuel tab, or try a longer range.',
          }}
        />
      </WidgetCard>

      <p className="text-[11.5px] text-ink-2 -mt-1">
        Server CSV exports stay in metric units (litres, kilometres).
      </p>
    </AnalyticsShell>
  );
}
