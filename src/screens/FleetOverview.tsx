/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Wallet, Fuel, CalendarCheck, ShieldAlert } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import DriverDetailModal from '@components/DriverDetailModal';
import TripDetailModal from '@components/TripDetailModal';
import { useFleetCurrency } from '@utils/fleetCurrency';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useUnits } from '@hooks/useUnits';
import { useOverviewData } from '@hooks/useOverviewData';
import FilterBar from '@components/analytics/FilterBar';
import { useKpiColumns } from '@components/analytics/useKpiColumns';
import { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile, { type Polarity } from '@components/analytics/KpiTile';
import StatusDonut from '@components/analytics/StatusDonut';
import Worklist, { type Severity, type WorkItem } from '@components/analytics/Worklist';
import { StackedColumns, TrendLine } from '@components/analytics/charts';
import { BucketBars, RankBars } from '@components/analytics/bars';
import { useVizColors } from '@components/analytics/theme';
import {
  addDays,
  compact,
  decimal,
  deltaPct,
  int,
  isNum,
  parseYmd,
  pct,
  shortDate,
} from '@components/analytics/format';

/** 235 → "3 h 55 min", 45 → "45 min", null → "—". */
const minutesLabel = (m: number | null | undefined) => {
  if (!isNum(m)) return '—';

  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);

  return h > 0 ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
};

/** Label of each attention-feed type (flows/07 §13.3). */
const ATTENTION_KIND: Record<string, string> = {
  alarm: 'Alarm',
  maintenance_overdue: 'Maintenance overdue',
  maintenance_due_soon: 'Maintenance due',
  document_expired: 'Document expired',
  document_expiring: 'Document expiring',
  licence_expired: 'Licence expired',
  licence_expiring: 'Licence expiring',
  vehicle_offline: 'Connectivity',
  incident_severe: 'Severe incident',
  trip_at_risk: 'Trip at risk',
  yard_long_stay: 'Long yard stay',
};

/**
 * Fleet Overview — the live-operations landing page of the new Fleet analytics area
 * (FLEET_ANALYTICS_DESIGN.md §3, route `/fleet-management/overview`, built ALONGSIDE the existing dashboard).
 * Real backend numbers where the definition-fixed endpoints exist; widgets that wait for a backend row
 * (maintenance due, yard occupancy, geofence events) carry a "Sample data" chip.
 */
export default function FleetOverview() {
  const router = useRouter();
  const { openModal } = useModal();
  const c = useVizColors();
  const code = useFleetCurrency();
  const u = useUnits();
  const { settings } = useFleetSettings();
  const f = useAnalyticsFilters();
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const [metric, setMetric] = useState<'distance_km' | 'utilisation_rate' | 'fuel_used_liters'>(
    'distance_km'
  );
  const d = useOverviewData(f, { severity: sev === 'all' ? undefined : sev, rankBy: metric });
  // The page scrolls inside its own container sized to the space under the app header, so the sidebar and
  // navbar stay in view (the shell itself scrolls as one document).
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollH, setScrollH] = useState<number | undefined>();

  useLayoutEffect(() => {
    const fit = () => {
      const top = scroller.current?.getBoundingClientRect().top ?? 0;

      setScrollH(Math.max(320, window.innerHeight - top));
    };

    fit();
    window.addEventListener('resize', fit);

    return () => window.removeEventListener('resize', fit);
  }, []);

  const kpiGrid = useKpiColumns();

  const o = d.overview;
  const p = d.previousOverview;
  const prevLabel = f.compare ? f.prevLabel : undefined;

  /* ------------------------------------------------------------------ KPIs
   * Server-side (flows/07 B1 `GET /fleet/analytics/summary`): every tile is { value, previous, delta_pct,
   * target } computed by the backend, so the numbers reconcile with the reports; a tile with nothing to
   * measure is null (shown as "—"), never 0. Availability and open issues are point-in-time. */
  const S = d.summary?.summary;
  // Tiles whose value carries a distance / economy unit are converted for display (the API is metric).
  const conv: Record<string, (v: number) => number> = {
    cost_per_km: u.perDistance.from,
    fuel_economy: u.economy.from,
  };
  const inUnit = (key: string, v: unknown) => (isNum(v) ? (conv[key] ? conv[key](v) : v) : null);
  const seriesOf = (key: string) => (d.summary?.series ?? []).map((x: any) => inUnit(key, x[key]));
  const delta = (key: string, polarity: Polarity) =>
    f.compare ? { pct: S?.[key]?.delta_pct ?? null, polarity, label: prevLabel } : undefined;
  const target = (key: string, unit: string) =>
    isNum(S?.[key]?.target) ? `Target ${decimal(inUnit(key, S[key].target), 2)}${unit}` : undefined;
  const perDist = `${code}/${u.perDistance.label}`;
  const counts = d.vehicleCounts?.by_status ?? {};
  const inService = (counts.active ?? 0) + (counts.in_maintenance ?? 0);
  const sevCounts = d.attentionCounts?.by_severity ?? {};
  const onTimeSample = o?.trips?.on_time_sample;

  const kpis: {
    key: string;
    label: string;
    value: string;
    unit?: string;
    hint?: React.ReactNode;
    delta?: { pct: number | null; polarity: Polarity; label?: string };
    spark?: (number | null)[];
    info?: { definition: string; basis?: string };
    icon: React.ReactNode;
    onClick?: () => void;
  }[] = [
    {
      key: 'availability',
      label: 'Fleet availability',
      icon: <CalendarCheck size={14} />,
      value: isNum(S?.fleet_availability?.value) ? decimal(S.fleet_availability.value, 1) : '—',
      unit: isNum(S?.fleet_availability?.value) ? '%' : undefined,
      hint: `${int(counts.in_maintenance ?? 0)} in maintenance · ${int(inService)} in service`,
      info: {
        definition:
          'Vehicles that are active (not in maintenance) divided by all vehicles in service (active + in maintenance). Retired and sold vehicles are excluded.',
        basis: 'Current status of each vehicle — a snapshot, so it has no period comparison.',
      },
    },
    {
      key: 'utilisation',
      label: 'Utilisation',
      icon: <Gauge size={14} />,
      value: isNum(S?.utilisation?.value) ? decimal(S.utilisation.value, 2) : '—',
      unit: isNum(S?.utilisation?.value) ? '%' : undefined,
      spark: seriesOf('utilisation'),
      delta: delta('utilisation', 'up-good'),
      hint: f.compare
        ? target('utilisation', '%')
        : (target('utilisation', '%') ?? `${decimal(o?.utilisation?.driving_hours, 1)} h driving`),
      info: {
        definition:
          'Driving hours divided by available hours. Available hours = in-service vehicles × scheduled hours per day × days in the range.',
        basis: `Trip-based today (${decimal(o?.utilisation?.driving_hours, 1)} h from completed trips). It becomes tracker-based when telemetry rollups ship.`,
      },
      onClick: () =>
        router.push(`/fleet-management/analytics/utilisation${window.location.search}`),
    },
    {
      key: 'ontime',
      label: 'On-time delivery',
      icon: <CalendarCheck size={14} />,
      value: isNum(S?.on_time_pct?.value) ? decimal(S.on_time_pct.value, 1) : '—',
      unit: isNum(S?.on_time_pct?.value) ? '%' : undefined,
      spark: seriesOf('on_time_pct'),
      delta: delta('on_time_pct', 'up-good'),
      hint: !isNum(S?.on_time_pct?.value)
        ? 'Needs completed trips with a planned end'
        : (target('on_time_pct', '%') ??
          (isNum(onTimeSample) && onTimeSample > 0
            ? `based on ${int(onTimeSample)} ${onTimeSample === 1 ? 'trip' : 'trips'}`
            : undefined)),
      info: {
        definition:
          'Completed trips that arrived by their planned end (plus the company grace) divided by completed trips that had a plan.',
        basis: 'Trips without a planned end time are not counted.',
      },
      onClick: () => router.push(`/fleet-management/analytics/trips${window.location.search}`),
    },
    {
      key: 'costkm',
      label: `Cost per ${u.distance.label}`,
      icon: <Wallet size={14} />,
      value: isNum(S?.cost_per_km?.value)
        ? decimal(inUnit('cost_per_km', S.cost_per_km.value), 2)
        : '—',
      unit: isNum(S?.cost_per_km?.value) ? perDist : undefined,
      spark: seriesOf('cost_per_km'),
      delta: delta('cost_per_km', 'down-good'),
      hint: f.compare
        ? target('cost_per_km', ` ${perDist}`)
        : (target('cost_per_km', ` ${perDist}`) ??
          `${code} ${compact(o?.financial?.total_cost ?? 0)} total cost`),
      info: {
        definition: `(Fuel + maintenance cost in the range) divided by ${u.distance.label === 'mi' ? 'miles' : 'kilometres'} driven in the range.`,
        basis: 'Ledger costs (tolls, fines, insurance…) join this figure when the Ledger ships.',
      },
    },
    {
      key: 'economy',
      label: 'Fuel economy',
      icon: <Fuel size={14} />,
      value: isNum(S?.fuel_economy?.value)
        ? decimal(inUnit('fuel_economy', S.fuel_economy.value), 2)
        : '—',
      unit: isNum(S?.fuel_economy?.value) ? u.economy.label : undefined,
      spark: seriesOf('fuel_economy'),
      delta: delta('fuel_economy', 'up-good'),
      hint: isNum(S?.fuel_economy?.value)
        ? (target('fuel_economy', ` ${u.economy.label}`) ??
          `${decimal(isNum(o?.fuel?.used_liters) ? u.volume.from(o.fuel.used_liters) : null, 0)} ${u.volume.label} used`)
        : 'Needs two full fill-ups with odometer readings',
      info: {
        definition:
          u.economy.label === 'km/L'
            ? 'Kilometres between two full fill-ups divided by the litres of the later fill (full-tank method).'
            : `Miles between two full fill-ups divided by the ${u.system === 'us' ? 'US' : 'imperial'} gallons of the later fill (full-tank method).`,
        basis: 'Fuel comes from fuel logs (any gallons logged are converted).',
      },
    },
    {
      key: 'issues',
      label: 'Open issues',
      icon: <ShieldAlert size={14} />,
      value: isNum(S?.open_issues?.value) ? int(S.open_issues.value) : '—',
      hint: `${int(sevCounts.critical ?? 0)} critical · ${int(sevCounts.warning ?? 0)} warning`,
      info: {
        definition:
          'Critical and warning items of the attention feed right now: open alarms, expired documents and licences, silent trackers, overdue maintenance, severe incidents, trips at risk.',
        basis: 'A snapshot of now — it has no period comparison.',
      },
      onClick: () =>
        document
          .getElementById('needs-attention')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    },
  ];

  /* ------------------------------------------------------- Fleet status */
  const st = d.statusSummary
    ? { total: d.statusSummary.total, ...d.statusSummary.by_status }
    : (o?.fleet_status ?? {});
  const statusSlices = [
    { key: 'moving', label: 'Moving', value: st.moving ?? 0, color: c.fleetStatus.moving },
    { key: 'idle', label: 'Idle', value: st.idle ?? 0, color: c.fleetStatus.idle },
    { key: 'parked', label: 'Parked', value: st.parked ?? 0, color: c.fleetStatus.parked },
    {
      key: 'offline',
      label: 'Offline',
      value: st.offline ?? 0,
      color: c.fleetStatus.offline,
      hint: `Tracker silent for more than ${settings?.position_freshness_minutes ?? 15} minutes`,
    },
    {
      key: 'no_tracker',
      label: 'No tracker',
      value: st.no_tracker ?? st.unknown ?? 0,
      color: c.fleetStatus.no_tracker,
      hint: 'No tracker assigned, or it has never reported',
    },
  ];

  /* ---------------------------------------------------- Needs attention */
  const workItems = useMemo<WorkItem[]>(
    () =>
      d.attention.map((a: any): WorkItem => {
        const e = a.entity ?? {};
        const open = () => {
          if (a.type === 'alarm') return router.push('/alarms');

          if (e.type === 'driver')
            return openModal(<DriverDetailModal driverId={e.id} initialTab="compliance" />);

          if (e.type === 'trip')
            return openModal(<TripDetailModal tripId={e.id} onListChanged={undefined} />);

          if (e.type === 'vehicle')
            return openModal(
              <VehicleDetailModal
                vehicleId={e.id}
                initialTab={
                  a.type.startsWith('maintenance')
                    ? 'maintenance'
                    : a.type.startsWith('document')
                      ? 'compliance'
                      : a.type === 'vehicle_offline'
                        ? 'tracker'
                        : a.type === 'yard_long_stay'
                          ? 'vehicle history'
                          : 'overview'
                }
              />
            );
        };

        return {
          id: a.id,
          severity: (['critical', 'warning', 'info'].includes(a.severity)
            ? a.severity
            : 'info') as Severity,
          kind: ATTENTION_KIND[a.type] ?? 'Attention',
          title: a.title,
          entity: e.name || undefined,
          since: a.since,
          onClick: e.type || a.type === 'alarm' ? open : undefined,
        };
      }),
    [d.attention, openModal, router]
  );

  /* ------------------------------------------ Maintenance & compliance */
  // Schedules: C1 counts (server-computed due state). Documents: C4 buckets (every document is in exactly
  // one of six). Licences: the drivers list's `license_state` totals. Overdue = expired, soon = expiring
  // within 30 days, OK = valid later (or no expiry date).
  const complianceRows = useMemo(() => {
    const sc = d.scheduleCounts;
    const docs = (type: string) =>
      d.docCounts?.by_owner_type?.find((x: any) => x.documentable_type === type);
    const docRow = (key: string, label: string, o: any) => ({
      key,
      label,
      overdue: o?.expired ?? 0,
      soon: (o?.expiring_0_7 ?? 0) + (o?.expiring_8_30 ?? 0),
      ok: (o?.expiring_31_60 ?? 0) + (o?.valid_after_60 ?? 0) + (o?.no_expiry ?? 0),
    });

    return [
      {
        key: 'schedules',
        label: 'Maintenance schedules',
        overdue: sc?.overdue ?? 0,
        soon: sc?.due_soon ?? 0,
        ok: sc?.ok ?? 0,
      },
      docRow('vehicle-docs', 'Vehicle documents', docs('vehicle')),
      docRow('driver-docs', 'Driver documents', docs('driver')),
      {
        key: 'licences',
        label: 'Driver licences',
        overdue: d.expiredLicenceTotal,
        soon: d.expiringLicenceTotal,
        ok: d.validLicenceTotal,
      },
    ];
  }, [
    d.scheduleCounts,
    d.docCounts,
    d.expiredLicenceTotal,
    d.expiringLicenceTotal,
    d.validLicenceTotal,
  ]);

  /* ------------------------------------------------------- Yards + geofences (B9) */
  const yardSummary = d.yards?.summary;
  const yardRows = ((d.yards?.table?.items ?? []) as any[]).filter(y => (y.slots_total ?? 0) > 0);
  const yardsWithoutSlots = ((d.yards?.table?.items ?? []) as any[]).length - yardRows.length;
  const geo = d.geofenceSummary;
  const geoSeries = (geo?.series ?? []) as any[];
  const geoLabel = (bucket: string) =>
    d.geofenceInterval === 'hour'
      ? f.days <= 1
        ? bucket.slice(11, 13)
        : `${shortDate(parseYmd(bucket.slice(0, 10)))} ${bucket.slice(11, 16)}`
      : f.axisLabel(bucket);
  const geoLabels = geoSeries.map(x => geoLabel(x.bucket));
  const per = d.geofenceInterval;

  /* --------------------------------------------------------------- Trips */
  const tr = d.trends?.trips ?? [];
  const tripLabels = tr.map((x: any) => f.axisLabel(x.date));
  const tripSeries = [
    {
      key: 'completed',
      label: 'Completed',
      color: c.tripStatus.completed,
      data: tr.map((x: any) => x.completed),
    },
    {
      key: 'open',
      label: 'Open',
      color: c.tripStatus.in_progress,
      data: tr.map((x: any) => Math.max(0, x.total - x.completed - x.cancelled)),
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      color: c.tripStatus.cancelled,
      data: tr.map((x: any) => x.cancelled),
    },
  ];
  const tripsTotal = tr.reduce((a: number, x: any) => a + (x.total || 0), 0);

  const ut = d.trends?.utilisation ?? [];
  const utLabels = ut.map((x: any) => f.axisLabel(x.date));

  /* ------------------------------------------------------------ Safety */
  const weeks = useMemo(() => {
    const monday = (s: string) => {
      const dt = parseYmd(s);
      const day = (dt.getDay() + 6) % 7;

      return addDays(s, -day);
    };
    const start = monday(addDays(f.today, -49));
    const keys = Array.from({ length: 8 }, (_, i) => addDays(start, i * 7));
    const rows = keys.map(k => ({ k, minor: 0, moderate: 0, severe: 0 }));

    d.incidents.forEach((i: any) => {
      const key = monday(String(i.incident_date).slice(0, 10));
      const row = rows.find(r => r.k === key);

      if (row && i.severity in row) (row as any)[i.severity] += 1;
    });

    return rows;
  }, [d.incidents, f.today]);
  const incidentTotal = weeks.reduce((a, w) => a + w.minor + w.moderate + w.severe, 0);

  /* -------------------------------------------------------------- Cost */
  const breakdown = o?.financial?.cost_breakdown ?? {};
  const costSlices = (['fuel', 'maintenance', 'driver', 'tolls', 'other'] as const)
    .filter(k => isNum(breakdown[k]) && breakdown[k] > 0)
    .map(k => ({
      key: k,
      label: k[0].toUpperCase() + k.slice(1),
      value: breakdown[k],
      color: c.cost[k],
    }));
  const costTotal = costSlices.reduce((a, s) => a + s.value, 0);

  /* ------------------------------------------------------ Top vehicles */
  const rankRows = useMemo(
    () =>
      d.performance
        .filter((v: any) => isNum(v[metric]) && v[metric] > 0)
        .sort((a: any, b: any) => b[metric] - a[metric])
        .slice(0, 6)
        .map((v: any) => ({
          key: String(v.vehicle_id),
          label: v.vehicle_name,
          sublabel: v.plate || undefined,
          value: v[metric] as number,
        })),
    [d.performance, metric]
  );
  const metricMeta = {
    distance_km: {
      label: 'Distance',
      format: (v: number) => `${compact(u.distance.from(v), 1)} ${u.distance.label}`,
    },
    utilisation_rate: { label: 'Utilisation', format: (v: number) => `${decimal(v, 2)}%` },
    fuel_used_liters: {
      label: 'Fuel',
      format: (v: number) => `${compact(u.volume.from(v), 1)} ${u.volume.label}`,
    },
  } as const;

  return (
    <div
      ref={scroller}
      style={{ height: scrollH }}
      className="a11y-muted overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto w-full max-w-[1760px] px-6 py-6 flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-ink-0 tracking-tight">
            Overview
          </h1>
          <p className="text-[13px] text-ink-1 mt-1">
            Fleet health at a glance · {f.label}
            {f.compare ? ` · compared ${f.prevLabel.replace('vs ', 'with ')}` : ''}
          </p>
        </div>

        <FilterBar
          preset={f.preset}
          from={f.from}
          to={f.to}
          today={f.today}
          compare={f.compare}
          prevLabel={f.prevLabel}
          timezone={f.timezone}
          onPreset={f.setPreset}
          onCustom={f.setCustom}
          onCompare={f.setCompare}
          onRefresh={d.refetchAll}
          fetching={d.fetching}
          updatedAt={d.overviewMeta?.generated_at}
        />

        {/* KPI row */}
        <div
          ref={kpiGrid.ref}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${kpiGrid.cols}, minmax(0, 1fr))` }}
        >
          {kpis.map(k => (
            <KpiTile
              key={k.key}
              label={k.label}
              value={k.value}
              unit={k.unit}
              hint={k.hint}
              delta={k.delta}
              spark={k.spark}
              info={k.info}
              icon={k.icon}
              loading={d.loading.summary || (k.key === 'availability' && d.loading.counts)}
              onClick={k.onClick}
            />
          ))}
        </div>

        {/* Status + attention */}
        <div className="grid grid-cols-12 gap-4">
          <WidgetCard
            className="col-span-12 xl:col-span-5"
            title="Fleet status"
            subtitle={`${int(st.total)} vehicles in the fleet`}
            info={{
              definition:
                'Every vehicle is in exactly one state. Moving / idle / parked come from the latest tracker position within the freshness window; Offline = has a tracker but has been silent longer than the window; No tracker = none assigned or it never reported.',
              basis: `Freshness window: ${settings?.position_freshness_minutes ?? 15} min (company setting).`,
            }}
            loading={d.loading.status}
            error={d.error.status}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            table={{
              columns: ['State', 'Vehicles', 'Share'],
              rows: statusSlices.map(s => [
                s.label,
                s.value,
                st.total ? pct((s.value / st.total) * 100, 1) : '—',
              ]),
            }}
            skeletonHeight={220}
            centerBody
            footer={
              <div className="pt-3 border-t border-line-soft">
                <div className="flex items-baseline justify-between text-[11.5px] mb-1.5">
                  <span className="text-ink-1">Tracker coverage</span>
                  <span className="text-ink-0 font-medium tabular-nums">
                    {int((st.total ?? 0) - (st.no_tracker ?? st.unknown ?? 0))} of {int(st.total)}{' '}
                    vehicles
                    {st.total
                      ? ` (${pct((((st.total ?? 0) - (st.no_tracker ?? st.unknown ?? 0)) / st.total) * 100, 0)})`
                      : ''}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-r-[3px] transition-[width] duration-300"
                    style={{
                      width: `${st.total ? ((st.total - (st.no_tracker ?? st.unknown ?? 0)) / st.total) * 100 : 0}%`,
                      background: c.series(0),
                    }}
                  />
                </div>
                <p className="text-[11px] text-ink-2 mt-1.5">
                  Live status and tracker-based metrics only cover vehicles with a tracker.
                </p>
              </div>
            }
          >
            <StatusDonut slices={statusSlices} total={st.total ?? 0} surface={c.surface} />
          </WidgetCard>

          <div id="needs-attention" className="col-span-12 xl:col-span-7 scroll-mt-4">
            <WidgetCard
              className="h-full"
              title="Needs attention"
              subtitle="Alarms, expired paperwork, overdue service and silent trackers — most urgent first"
              loading={d.loading.attention}
              fetching={d.fetching}
              skeletonHeight={260}
              info={{
                definition:
                  'Everything that needs an operator, most urgent first: open alarms on installed trackers, expired or expiring documents and licences (30 days), overdue or due-soon maintenance, trackers silent for over 24 h, severe incidents of the last 7 days, planned trips whose vehicle or driver is unavailable, and long yard stays.',
                basis:
                  'Computed by the backend on every refresh; the list also refreshes when the fleet status changes.',
              }}
            >
              <Worklist
                items={workItems}
                total={workItems.length}
                filter={sev}
                onFilter={setSev}
                limit={7}
                serverCounts={
                  d.attentionCounts
                    ? {
                        critical: d.attentionCounts.by_severity?.critical ?? 0,
                        warning: d.attentionCounts.by_severity?.warning ?? 0,
                        info: d.attentionCounts.by_severity?.info ?? 0,
                      }
                    : undefined
                }
                totalMatching={d.attentionCounts?.total}
              />
            </WidgetCard>
          </div>
        </div>

        {/* Trips + utilisation */}
        <div className="grid grid-cols-12 gap-4">
          <WidgetCard
            className="col-span-12 xl:col-span-7"
            title="Trips"
            subtitle={`${int(tripsTotal)} trips started in the range`}
            info={{
              definition:
                'Trips per day by outcome. A trip belongs to the day it actually started (or, if it never started, the day it was planned for). "Open" = planned or in progress.',
            }}
            loading={d.loading.trends}
            error={d.error.trends}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            empty={
              tripsTotal === 0 && !d.loading.trends
                ? {
                    title: 'No trips in this range',
                    hint: 'Try a longer range, or create a trip from the Trips tab.',
                  }
                : null
            }
            table={{
              columns: ['Day', 'Completed', 'Open', 'Cancelled', 'Total'],
              rows: tr.map((x: any, i: number) => [
                tripLabels[i],
                x.completed,
                tripSeries[1].data[i],
                x.cancelled,
                x.total,
              ]),
            }}
            skeletonHeight={260}
          >
            <StackedColumns
              labels={tripLabels}
              series={tripSeries}
              height={230}
              ariaLabel="Trips per day by outcome"
            />
          </WidgetCard>

          <WidgetCard
            className="col-span-12 xl:col-span-5"
            title="Utilisation trend"
            subtitle="Share of available vehicle-hours spent driving"
            info={{
              definition:
                'Driving hours ÷ available hours for each day (trip-based until tracker rollups ship).',
              basis:
                settings?.utilisation_target_pct != null
                  ? `Target ${settings.utilisation_target_pct}% (company setting).`
                  : 'Set a target in Fleet settings to draw a target line.',
            }}
            loading={d.loading.trends}
            error={d.error.trends}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            table={{
              columns: ['Day', 'Utilisation', 'Driving hours'],
              rows: ut.map((x: any, i: number) => [
                utLabels[i],
                `${decimal(x.rate, 2)}%`,
                decimal(x.hours, 1),
              ]),
            }}
            skeletonHeight={260}
          >
            <TrendLine
              labels={utLabels}
              series={[
                {
                  key: 'util',
                  label: 'Utilisation',
                  color: c.series(0),
                  data: ut.map((x: any) => x.rate),
                  format: v => `${decimal(v, 2)}%`,
                },
              ]}
              target={
                settings?.utilisation_target_pct != null
                  ? {
                      value: settings.utilisation_target_pct,
                      label: `Target ${settings.utilisation_target_pct}%`,
                    }
                  : null
              }
              yTickFormat={v => `${v}%`}
              height={230}
              ariaLabel="Utilisation rate per day"
            />
          </WidgetCard>
        </div>

        {/* Operations row */}
        <div className="grid grid-cols-12 gap-4">
          <WidgetCard
            className="col-span-12 lg:col-span-6 xl:col-span-4"
            title="Maintenance & compliance"
            subtitle="Overdue or expired · due soon · OK"
            info={{
              definition:
                'Service schedules, vehicle and driver documents and driver licences grouped by how urgent they are. Overdue = the due date or odometer has passed; expired = past its expiry date.',
              basis: `Schedules use the company due-soon window (${settings?.maintenance_due_soon_days ?? 7} days / ${int(u.distance.from(settings?.maintenance_due_soon_km ?? 500))} ${u.distance.label}). Documents and licences: due soon = expiring within 30 days; OK = valid later, or with no expiry date.`,
            }}
            loading={d.loading.schedules || d.loading.compliance}
            fetching={d.fetching}
            skeletonHeight={200}
            table={{
              columns: ['Item', 'Overdue / expired', 'Due soon', 'OK'],
              rows: complianceRows.map(r => [r.label, r.overdue, r.soon, r.ok]),
            }}
          >
            <BucketBars
              surface={c.surface}
              legend={[
                { key: 'overdue', label: 'Overdue / expired', color: c.bucket.overdue },
                { key: 'soon', label: 'Due soon', color: c.bucket.soon },
                { key: 'ok', label: 'OK', color: c.bucket.ok },
              ]}
              rows={complianceRows.map(r => ({
                key: r.key,
                label: r.label,
                segments: [
                  {
                    key: 'overdue',
                    label: 'Overdue / expired',
                    value: r.overdue,
                    color: c.bucket.overdue,
                  },
                  { key: 'soon', label: 'Due soon', value: r.soon, color: c.bucket.soon },
                  { key: 'ok', label: 'OK', value: r.ok, color: c.bucket.ok },
                ],
              }))}
            />
          </WidgetCard>

          <WidgetCard
            className="col-span-12 lg:col-span-6 xl:col-span-4"
            title="Yard occupancy"
            subtitle={
              yardSummary && yardSummary.slots_total > 0
                ? `${int(yardSummary.occupied_now)} of ${int(yardSummary.slots_total)} slots occupied · ${int(yardSummary.yards_total)} yards`
                : 'Occupied vs free slots, busiest first'
            }
            info={{
              definition:
                'Vehicles checked in now ÷ slots, per yard, fullest first. Check-ins, check-outs and average stay count the events inside the selected range.',
              basis:
                'Occupancy is a snapshot of now (no slot history exists), so it does not follow the date range.',
            }}
            loading={d.loading.yards}
            error={d.error.yards}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            skeletonHeight={200}
            empty={
              !d.loading.yards && yardRows.length === 0
                ? {
                    title: 'No yard slots yet',
                    hint: 'Add slots to a yard in Operations → Yards to see its occupancy.',
                  }
                : null
            }
            table={{
              columns: ['Yard', 'Occupied', 'Slots', 'Full', 'Check-ins', 'Avg stay'],
              rows: yardRows.map(y => [
                y.name,
                y.occupied_now,
                y.slots_total,
                pct(y.occupancy_pct, 0),
                y.check_ins,
                minutesLabel(y.avg_dwell_minutes),
              ]),
            }}
            footer={
              yardSummary && (
                <div className="pt-3 border-t border-line-soft text-[11.5px] text-ink-2 tabular-nums">
                  {int(yardSummary.check_ins)} check-ins · {int(yardSummary.check_outs)} check-outs
                  {isNum(yardSummary.avg_dwell_minutes)
                    ? ` · avg stay ${minutesLabel(yardSummary.avg_dwell_minutes)}`
                    : ''}{' '}
                  in the range
                  {yardsWithoutSlots > 0
                    ? ` · ${yardsWithoutSlots} ${yardsWithoutSlots === 1 ? 'yard has' : 'yards have'} no slots`
                    : ''}
                </div>
              )
            }
          >
            <BucketBars
              surface={c.surface}
              legend={[
                { key: 'occ', label: 'Occupied', color: c.series(0) },
                { key: 'free', label: 'Free', color: c.neutralSoft },
              ]}
              rows={yardRows.map(y => ({
                key: String(y.yard_id),
                label: y.name,
                segments: [
                  { key: 'occ', label: 'Occupied', value: y.occupied_now, color: c.series(0) },
                  {
                    key: 'free',
                    label: 'Free',
                    value: Math.max(0, y.slots_total - y.occupied_now),
                    color: c.neutralSoft,
                  },
                ],
                note: `${pct(y.occupancy_pct, 0)} full`,
              }))}
            />
          </WidgetCard>

          <WidgetCard
            className="col-span-12 xl:col-span-4"
            title="Geofence activity"
            subtitle={`Enter and exit events per ${per}`}
            info={{
              definition:
                'Vehicles entering or leaving a geofence, counted per period. Only crossings the system recorded from received tracker positions are counted (a crossing that happens entirely between two packets is not detected).',
              basis:
                'Counts follow each geofence’s current “alert on” setting, so an enter-only geofence shows no exits.',
            }}
            loading={d.loading.geofences}
            error={d.error.geofences}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            skeletonHeight={200}
            empty={
              !d.loading.geofences && (geo?.summary?.total ?? 0) === 0
                ? {
                    title: 'No geofence events in this range',
                    hint: 'Entries and exits appear here as tracked vehicles cross a geofence.',
                  }
                : null
            }
            table={{
              columns: ['Period', 'Enter', 'Exit'],
              rows: geoSeries.map((x, i) => [geoLabels[i], x.enter, x.exit]),
            }}
            footer={
              geo?.top_geofences?.length ? (
                <div className="pt-3 border-t border-line-soft text-[11.5px] text-ink-2">
                  <span className="text-ink-1 font-medium">Busiest: </span>
                  {(geo.top_geofences as any[]).map(g => `${g.name} (${int(g.total)})`).join(' · ')}
                </div>
              ) : undefined
            }
          >
            <StackedColumns
              labels={geoLabels}
              series={[
                {
                  key: 'enter',
                  label: 'Enter',
                  color: c.series(0),
                  data: geoSeries.map(x => x.enter),
                },
                {
                  key: 'exit',
                  label: 'Exit',
                  color: c.series(1),
                  data: geoSeries.map(x => x.exit),
                },
              ]}
              height={190}
              ariaLabel={`Geofence enter and exit events per ${per}`}
            />
          </WidgetCard>
        </div>

        {/* Safety, cost, ranking */}
        <div className="grid grid-cols-12 gap-4">
          <WidgetCard
            className="col-span-12 lg:col-span-6 xl:col-span-4"
            title="Incidents"
            subtitle="Last 8 weeks, by severity"
            loading={d.loading.incidents}
            fetching={d.fetching}
            empty={
              incidentTotal === 0 && !d.loading.incidents
                ? {
                    title: 'No incidents in 8 weeks',
                    hint: 'Incidents logged against drivers and vehicles appear here.',
                  }
                : null
            }
            info={{
              definition:
                'Incidents logged against drivers and vehicles, grouped by the week of the incident date (Monday start).',
            }}
            table={{
              columns: ['Week of', 'Minor', 'Moderate', 'Severe'],
              rows: weeks.map(w => [shortDate(parseYmd(w.k)), w.minor, w.moderate, w.severe]),
            }}
            skeletonHeight={220}
          >
            <StackedColumns
              labels={weeks.map(w => shortDate(parseYmd(w.k)))}
              series={[
                {
                  key: 'minor',
                  label: 'Minor',
                  color: c.severity.minor,
                  data: weeks.map(w => w.minor),
                },
                {
                  key: 'moderate',
                  label: 'Moderate',
                  color: c.severity.moderate,
                  data: weeks.map(w => w.moderate),
                },
                {
                  key: 'severe',
                  label: 'Severe',
                  color: c.severity.severe,
                  data: weeks.map(w => w.severe),
                },
              ]}
              height={190}
              ariaLabel="Incidents per week by severity"
            />
          </WidgetCard>

          <WidgetCard
            className="col-span-12 lg:col-span-6 xl:col-span-4"
            title="Where the money goes"
            subtitle={`${code} ${compact(costTotal)} in the range`}
            loading={d.loading.overview}
            fetching={d.fetching}
            empty={
              costTotal === 0 && !d.loading.overview
                ? {
                    title: 'No costs recorded in this range',
                    hint: 'Fuel and maintenance costs from your logs show up here.',
                  }
                : null
            }
            info={{
              definition:
                'Costs in the range by category. Fuel comes from fuel-log costs, maintenance from maintenance-log costs.',
              basis: 'Driver, toll and other categories arrive with the Ledger.',
            }}
            table={{
              columns: ['Category', code, 'Share'],
              rows: costSlices.map(s => [
                s.label,
                s.value,
                pct(costTotal ? (s.value / costTotal) * 100 : 0, 0),
              ]),
            }}
            skeletonHeight={220}
          >
            <StatusDonut
              slices={costSlices}
              total={costTotal}
              centerLabel={code}
              valueFormat={n => compact(n, 1)}
              surface={c.surface}
              size={150}
              stacked
            />
          </WidgetCard>

          <WidgetCard
            className="col-span-12 xl:col-span-4"
            title="Top vehicles"
            subtitle={`By ${metricMeta[metric].label.toLowerCase()} in the range`}
            loading={d.loading.perf}
            error={d.error.perf}
            onRetry={d.refetchAll}
            fetching={d.fetching}
            right={
              <div
                role="group"
                aria-label="Rank by"
                className="inline-flex bg-surface-2 border border-line-soft rounded-md p-0.5"
              >
                {(Object.keys(metricMeta) as (keyof typeof metricMeta)[]).map(k => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={metric === k}
                    onClick={() => setMetric(k)}
                    className={`text-[11px] font-medium px-2 py-1 rounded transition-colors ${
                      metric === k
                        ? 'bg-surface-1 text-ink-0 shadow-sm'
                        : 'text-ink-1 hover:text-ink-0'
                    }`}
                  >
                    {metricMeta[k].label}
                  </button>
                ))}
              </div>
            }
            info={{
              definition:
                'Vehicles ranked by the chosen measure over the range (vehicles with none are left out).',
            }}
            table={{
              columns: ['Vehicle', metricMeta[metric].label],
              rows: rankRows.map((r: any) => [r.label, metricMeta[metric].format(r.value)]),
            }}
            skeletonHeight={220}
          >
            <RankBars
              rows={rankRows}
              color={c.series(0)}
              format={metricMeta[metric].format}
              onSelect={id => openModal(<VehicleDetailModal vehicleId={id} />)}
              emptyHint="No vehicle activity in this range."
            />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
