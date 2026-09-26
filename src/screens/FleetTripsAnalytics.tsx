/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Hourglass,
  Route,
  Timer,
  Truck,
  XCircle,
} from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import TripDetailModal from '@components/TripDetailModal';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useServerExport } from '@hooks/useServerExport';
import { useTripsReport, type TripStatusFilter } from '@hooks/useTripsReport';
import { useUnits } from '@hooks/useUnits';
import { formatQty } from '@utils/units';
import AnalyticsShell from '@components/analytics/AnalyticsShell';
import { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import { useKpiColumns } from '@components/analytics/useKpiColumns';
import { useAnalyticsScope, type ScopeField } from '@components/analytics/useAnalyticsScope';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile, { type Polarity } from '@components/analytics/KpiTile';
import StatusDonut from '@components/analytics/StatusDonut';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { RankBars } from '@components/analytics/bars';
import { StackedColumns, TrendLine } from '@components/analytics/charts';
import { STATUS, useVizColors } from '@components/analytics/theme';
import { decimal, int, isNum, pct } from '@components/analytics/format';

/** Minutes → "2 h 05 min" / "18 min" / "45 s". */
const duration = (min: number | null | undefined) => {
  if (!isNum(min)) return '—';

  // A trip that started and ended in the same second can store a tiny negative duration: show 0 s.
  if (min < 1) return `${Math.max(0, Math.round(min * 60))} s`;

  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);

  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};

/** Signed delay: 12 → "12 min late", −3 → "3 min early", 0 → "on time". */
const delayLabel = (min: number | null | undefined) => {
  if (!isNum(min)) return '—';

  if (Math.abs(min) < 0.5) return 'on the minute';

  return `${duration(Math.abs(min))} ${min > 0 ? 'late' : 'early'}`;
};

/** Scope fields the whole page honours (backend B5: category, vehicle, yard, the trip's own driver, cost centre). */
const SCOPE_FIELDS: ScopeField[] = ['category', 'vehicle', 'yard', 'driver', 'costCentre'];
const SCOPE_HINTS = {
  yard: 'Trips of vehicles currently checked in at this yard',
  driver: 'Trips this driver drove (the trip’s own driver)',
};

/** Column → the API's `sort_by` key (backend B5). */
const SORT_KEYS: Record<string, string> = {
  trip: 'period_start',
  status: 'status',
  vehicle: 'vehicle_name',
  driver: 'driver_name',
  delay: 'delay_minutes',
  duration: 'duration_minutes',
  distance: 'actual_distance_km',
};

/** A delay class → its colour: early / on the minute are good, then escalating severity. */
const DELAY_COLOR: Record<string, string> = {
  early_30_plus: STATUS.good,
  early_0_30: STATUS.good,
  late_0_15: STATUS.warning,
  late_15_60: STATUS.serious,
  late_60_240: STATUS.critical,
  late_240_plus: STATUS.critical,
};

const STATUS_LABEL: Record<TripStatusFilter, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const dayTime = (iso: string | null | undefined, timeZone: string) => {
  if (!iso) return '—';

  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
};

/**
 * Analytics → Trips & delivery (FLEET_ANALYTICS_DESIGN.md §4): are we on time, and why not?
 * Everything comes from ONE call to the trips report (backend B5): KPI summary with the previous period
 * and target, trips by outcome, on-time trend, delay and duration distributions, cancellation reasons and
 * a server-paged trip table with the delay of every trip. A trip is counted once, on the day it actually
 * started (else the day it was planned).
 */
export default function FleetTripsAnalytics() {
  const { openModal } = useModal();
  const c = useVizColors();
  const u = useUnits();
  const { settings } = useFleetSettings();
  const f = useAnalyticsFilters();
  const scope = useAnalyticsScope(SCOPE_FIELDS);
  const kpiGrid = useKpiColumns();
  const tz = settings?.timezone ?? 'UTC';
  const [table, setTable] = useState<{
    page: number;
    search: string;
    status: TripStatusFilter | null;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', status: null, sort: { key: 'trip', dir: 'desc' } });
  // A new scope is a new result set: back to the first page.
  useEffect(() => setTable(s => (s.page === 1 ? s : { ...s, page: 1 })), [scope.key]);
  const sortApi = SORT_KEYS[table.sort?.key ?? 'trip'] ?? 'period_start';
  const direction = table.sort?.dir ?? 'desc';
  const r = useTripsReport({
    from: f.from,
    to: f.to,
    days: f.days,
    compare: f.compare,
    compareMode: f.compareMode,
    interval: f.interval,
    page: table.page,
    perPage: 15,
    status: table.status,
    search: table.search,
    sort: sortApi,
    direction,
    scope: scope.api,
  });
  const exporter = useServerExport('/api/fleet/analytics/trips/export', 'trips');
  const prevLabel = f.compare ? f.prevLabel : undefined;

  const d = r.data;
  const S = d?.summary;
  const counts = S?.counts;
  const samples = S?.samples;
  const series = (d?.series ?? []) as any[];
  const labels = series.map(x => f.axisLabel(x.bucket));
  const per = r.interval;
  const open = (x: any) => (x?.planned ?? 0) + (x?.in_progress ?? 0);
  const total = counts?.total ?? 0;
  const delay = (d?.delay_histogram ?? []) as any[];
  const durationBins = (d?.duration_histogram ?? []) as any[];
  const reasons = d?.cancellation_reasons;
  const loading = r.isLoading;
  const target = S?.on_time_pct?.target;

  const tile = (key: string, polarity: Polarity) =>
    f.compare ? { pct: S?.[key]?.delta_pct ?? null, polarity, label: prevLabel } : undefined;
  const val = (key: string) => (isNum(S?.[key]?.value) ? S[key].value : null);

  const outcome = [
    {
      key: 'completed',
      label: 'Completed',
      value: counts?.completed ?? 0,
      color: c.tripStatus.completed,
    },
    {
      key: 'open',
      label: 'Open',
      value: (counts?.planned ?? 0) + (counts?.in_progress ?? 0),
      color: c.tripStatus.in_progress,
      hint: 'Planned or in progress',
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      value: counts?.cancelled ?? 0,
      color: c.tripStatus.cancelled,
    },
  ];

  const columns: Column<any>[] = [
    {
      key: 'trip',
      header: 'Trip',
      serverSort: SORT_KEYS.trip,
      render: t => (
        <div className="min-w-[200px] max-w-[320px]">
          <div className="font-medium text-ink-0 truncate">
            {t.trip_reference || `Trip ${t.trip_id}`}
          </div>
          <div className="text-[11.5px] text-ink-2 truncate">
            {t.origin_address || '—'} → {t.destination_address || '—'}
          </div>
          <div className="text-[11.5px] text-ink-2">{dayTime(t.period_start, tz)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      serverSort: SORT_KEYS.status,
      render: t => {
        const st = t.status as TripStatusFilter;
        const color =
          st === 'completed'
            ? c.tripStatus.completed
            : st === 'cancelled'
              ? c.tripStatus.cancelled
              : c.tripStatus.in_progress;
        const Icon = st === 'completed' ? CheckCircle2 : st === 'cancelled' ? XCircle : Hourglass;

        return (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-0">
            <Icon size={13} style={{ color }} aria-hidden="true" /> {STATUS_LABEL[st] ?? st}
          </span>
        );
      },
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      serverSort: SORT_KEYS.vehicle,
      render: t => (
        <div className="min-w-[120px]">
          <div className="text-ink-0 truncate">{t.vehicle?.name ?? '—'}</div>
          <div className="text-[11.5px] text-ink-2 truncate">{t.vehicle?.plate ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      serverSort: SORT_KEYS.driver,
      render: t => (
        <div className="min-w-[120px]">
          <div className="text-ink-0 truncate">{t.driver?.name ?? '—'}</div>
          {t.customer?.name && (
            <div className="text-[11.5px] text-ink-2 truncate">for {t.customer.name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'delay',
      header: 'Delay',
      align: 'right',
      serverSort: SORT_KEYS.delay,
      render: t =>
        t.on_time === null || t.on_time === undefined ? (
          <span className="text-ink-2" title="Needs a completed trip with a planned end">
            —
          </span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1.5 text-[12.5px] text-ink-0">
            {t.on_time ? (
              <CheckCircle2 size={13} style={{ color: STATUS.good }} aria-hidden="true" />
            ) : (
              <CircleAlert size={13} style={{ color: STATUS.serious }} aria-hidden="true" />
            )}
            {delayLabel(t.delay_minutes)}
          </span>
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      serverSort: SORT_KEYS.duration,
      render: t => duration(t.duration_minutes),
    },
    {
      key: 'distance',
      header: 'Distance',
      align: 'right',
      serverSort: SORT_KEYS.distance,
      render: t => (
        <div>
          <div className="text-ink-0">{formatQty(u.distance, t.actual_distance_km, 1)}</div>
          {isNum(t.distance_variance_km) && (
            <div className="text-[11.5px] text-ink-2">
              {t.distance_variance_km > 0 ? '+' : ''}
              {decimal(u.distance.from(t.distance_variance_km), 1)} vs plan
            </div>
          )}
        </div>
      ),
    },
  ];

  const chips: { key: TripStatusFilter | null; label: string; n: number | undefined }[] = [
    { key: null, label: 'All', n: total },
    { key: 'completed', label: 'Completed', n: r.meta?.table_counts?.completed },
    { key: 'cancelled', label: 'Cancelled', n: r.meta?.table_counts?.cancelled },
    { key: 'in_progress', label: 'In progress', n: r.meta?.table_counts?.in_progress },
    { key: 'planned', label: 'Planned', n: r.meta?.table_counts?.planned },
  ];

  return (
    <AnalyticsShell
      title="Trips & delivery"
      subtitle="Are we on time, and why not?"
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
          label="Trips"
          icon={<Truck size={14} />}
          value={int(S?.trips_total?.value)}
          spark={series.map(x => x.total)}
          delta={tile('trips_total', 'neutral')}
          hint={f.compare ? undefined : `${int(counts?.completed)} completed`}
          loading={loading}
          info={{
            definition:
              'Trips that started in the range — or, if they never started, were planned for it. Each trip is counted once.',
          }}
        />
        <KpiTile
          label="Cancellation rate"
          icon={<XCircle size={14} />}
          value={
            val('cancellation_rate_pct') === null ? '—' : decimal(val('cancellation_rate_pct'), 1)
          }
          unit={val('cancellation_rate_pct') === null ? undefined : '%'}
          delta={tile('cancellation_rate_pct', 'down-good')}
          hint={f.compare ? undefined : `${int(counts?.cancelled)} of ${int(total)} trips`}
          loading={loading}
          info={{
            definition: 'Cancelled trips ÷ all trips of the period.',
            basis:
              'A cancelled trip sits in the period it was planned for (no cancellation time is stored).',
          }}
        />
        <KpiTile
          label="On-time delivery"
          icon={<Clock size={14} />}
          value={val('on_time_pct') === null ? '—' : decimal(val('on_time_pct'), 1)}
          unit={val('on_time_pct') === null ? undefined : '%'}
          spark={series.map(x => x.on_time_pct)}
          delta={tile('on_time_pct', 'up-good')}
          hint={
            val('on_time_pct') === null
              ? 'Needs completed trips with a planned end'
              : isNum(target)
                ? `Target ${decimal(target, 1)}%`
                : `based on ${int(samples?.on_time)} ${samples?.on_time === 1 ? 'trip' : 'trips'}`
          }
          loading={loading}
          info={{
            definition:
              'Completed trips that ended within the grace of their planned end ÷ completed trips that had a planned and an actual end.',
            basis: `Grace: ${r.meta?.on_time_grace_minutes ?? settings?.on_time_grace_minutes ?? 0} min (Fleet settings). Based on ${int(samples?.on_time)} trips.`,
          }}
        />
        <KpiTile
          label="Average delay"
          icon={<Timer size={14} />}
          value={val('avg_delay_minutes') === null ? '—' : delayLabel(val('avg_delay_minutes'))}
          delta={tile('avg_delay_minutes', 'down-good')}
          hint={
            f.compare
              ? undefined
              : `${int(S?.late_trips)} late ${S?.late_trips === 1 ? 'trip' : 'trips'}`
          }
          loading={loading}
          info={{
            definition:
              'Mean of (actual end − planned end) over the judged trips: positive = late, negative = early.',
          }}
        />
        <KpiTile
          label="Average duration"
          icon={<Hourglass size={14} />}
          value={duration(val('avg_duration_minutes'))}
          delta={tile('avg_duration_minutes', 'neutral')}
          hint={f.compare ? undefined : `${int(samples?.duration)} completed trips`}
          loading={loading}
          info={{ definition: 'Mean time from actual start to actual end of completed trips.' }}
        />
        <KpiTile
          label="Distance vs plan"
          icon={<Route size={14} />}
          value={
            val('distance_variance_km') === null
              ? '—'
              : `${val('distance_variance_km') > 0 ? '+' : ''}${decimal(u.distance.from(val('distance_variance_km')), 1)}`
          }
          unit={val('distance_variance_km') === null ? undefined : u.distance.label}
          delta={tile('distance_variance_km', 'neutral')}
          hint={
            val('distance_variance_km') === null
              ? 'Needs trips with a planned and an actual distance'
              : f.compare
                ? undefined
                : `${formatQty(u.distance, S?.actual_distance_km?.value, 0)} driven in total`
          }
          loading={loading}
          info={{
            definition: 'Actual − planned distance over the trips that have BOTH.',
            basis: `Based on ${int(samples?.distance_variance)} trips. Trips without a plan still count in the distance driven.`,
          }}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-8"
          title="Trips by outcome"
          subtitle={`${int(total)} trips, per ${per}`}
          info={{
            definition:
              'Trips per period by outcome. A trip belongs to the period it actually started in (or, if it never started, the one it was planned for). “Open” = planned or in progress.',
          }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          empty={
            total === 0 && !loading
              ? {
                  title: 'No trips in this range',
                  hint: 'Try a longer range, or create a trip from Operations → Trips.',
                }
              : null
          }
          table={{
            columns: ['Period', 'Completed', 'Open', 'Cancelled', 'Total'],
            rows: series.map((x, i) => [labels[i], x.completed, open(x), x.cancelled, x.total]),
          }}
          skeletonHeight={260}
        >
          <StackedColumns
            labels={labels}
            series={[
              {
                key: 'completed',
                label: 'Completed',
                color: c.tripStatus.completed,
                data: series.map(x => x.completed),
              },
              {
                key: 'open',
                label: 'Open',
                color: c.tripStatus.in_progress,
                data: series.map(open),
              },
              {
                key: 'cancelled',
                label: 'Cancelled',
                color: c.tripStatus.cancelled,
                data: series.map(x => x.cancelled),
              },
            ]}
            height={240}
            ariaLabel={`Trips per ${per} by outcome`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-4"
          title="Outcome mix"
          subtitle="Share of trips by result"
          info={{ definition: 'Every trip in the range is in exactly one outcome.' }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          table={{
            columns: ['Outcome', 'Trips', 'Share'],
            rows: outcome.map(s => [
              s.label,
              s.value,
              total ? pct((s.value / total) * 100, 1) : '—',
            ]),
          }}
          skeletonHeight={220}
          centerBody
        >
          <StatusDonut
            slices={outcome}
            total={total}
            centerLabel="trips"
            surface={c.surface}
            onSelect={key => {
              // "Open" is planned + in progress (no single filter): show whichever is larger.
              const status: TripStatusFilter =
                key === 'open'
                  ? (counts?.planned ?? 0) > (counts?.in_progress ?? 0)
                    ? 'planned'
                    : 'in_progress'
                  : (key as TripStatusFilter);

              setTable(s => ({ ...s, page: 1, status: s.status === status ? null : status }));
              document
                .getElementById('trips-table')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="On-time trend"
          subtitle={`Share of judged trips on time, per ${per}`}
          info={{
            definition:
              'For each period: completed trips that ended within the grace of their planned end ÷ completed trips with a planned end.',
            basis: isNum(target)
              ? `Target ${decimal(target, 1)}% (Fleet settings).`
              : 'Set a target in Fleet settings to draw a target line. A period with nothing to judge is left blank.',
          }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          empty={
            !loading && series.every(x => x.on_time_pct === null)
              ? {
                  title: 'No trips with a planned end',
                  hint: 'On-time delivery needs completed trips that had a planned end time.',
                }
              : null
          }
          table={{
            columns: ['Period', 'On time', 'Trips judged'],
            rows: series.map((x, i) => [
              labels[i],
              isNum(x.on_time_pct) ? `${decimal(x.on_time_pct, 1)}%` : '—',
              x.on_time_sample,
            ]),
          }}
          skeletonHeight={240}
        >
          <TrendLine
            labels={labels}
            series={[
              {
                key: 'ontime',
                label: 'On time',
                color: c.series(0),
                data: series.map(x => (isNum(x.on_time_pct) ? x.on_time_pct : null)),
                format: v => `${decimal(v, 1)}%`,
              },
            ]}
            target={
              isNum(target) ? { value: target, label: `Target ${decimal(target, 1)}%` } : null
            }
            yTickFormat={v => `${v}%`}
            height={220}
            ariaLabel={`On-time share per ${per}`}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Delay distribution"
          subtitle={
            (samples?.on_time ?? 0) > 0
              ? `How early or late ${int(samples?.on_time)} judged trips finished`
              : 'How early or late trips finish'
          }
          info={{
            definition: 'Completed trips grouped by their signed delay (actual end − planned end).',
            basis:
              'Only trips with a planned and an actual end are judged. The class edges are fixed.',
          }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          empty={
            !loading && (samples?.on_time ?? 0) === 0
              ? {
                  title: 'No trips with a planned end',
                  hint: 'Give trips a planned end time to see how punctual they are.',
                }
              : null
          }
          table={{
            columns: ['Delay', 'Trips', 'Share'],
            rows: delay.map(b => [
              b.label,
              b.count,
              (samples?.on_time ?? 0) ? pct((b.count / samples.on_time) * 100, 1) : '—',
            ]),
          }}
          skeletonHeight={240}
        >
          <RankBars
            numbered={false}
            color={c.series(0)}
            max={Math.max(1, ...delay.map(b => b.count))}
            format={v => `${int(v)}`}
            rows={delay.map(b => ({
              key: b.key,
              label: b.label,
              value: b.count,
              color: DELAY_COLOR[b.key],
            }))}
          />
        </WidgetCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Trip duration"
          subtitle={`How long ${int(samples?.duration)} completed trips took`}
          info={{
            definition: 'Completed trips grouped by their actual duration (start to end).',
            basis:
              'The class edges are fixed. A duration below zero (start and end in the same second) counts as under 30 min.',
          }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          empty={
            !loading && (samples?.duration ?? 0) === 0
              ? { title: 'No completed trips', hint: 'Durations appear once trips are completed.' }
              : null
          }
          table={{
            columns: ['Duration', 'Trips', 'Share'],
            rows: durationBins.map(b => [
              b.label,
              b.count,
              (samples?.duration ?? 0) ? pct((b.count / samples.duration) * 100, 1) : '—',
            ]),
          }}
          skeletonHeight={220}
        >
          <RankBars
            numbered={false}
            color={c.series(0)}
            max={Math.max(1, ...durationBins.map(b => b.count))}
            format={v => `${int(v)}`}
            rows={durationBins.map(b => ({ key: b.key, label: b.label, value: b.count }))}
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-6"
          title="Why trips are cancelled"
          subtitle={`${int(reasons?.total)} cancelled ${reasons?.total === 1 ? 'trip' : 'trips'}`}
          info={{
            definition:
              'Cancelled trips grouped by their recorded reason (case and surrounding spaces ignored), most frequent first.',
            basis: 'A trip cancelled without a reason is listed as “No reason given”.',
          }}
          loading={loading}
          error={r.error}
          onRetry={() => r.refetch()}
          fetching={r.isFetching}
          empty={
            !loading && (reasons?.total ?? 0) === 0
              ? { title: 'No cancellations', hint: 'Nothing was cancelled in this range.' }
              : null
          }
          table={{
            columns: ['Reason', 'Trips', 'Share'],
            rows: [
              ...((reasons?.items ?? []) as any[]).map(x => [
                x.reason ?? 'No reason given',
                x.count,
                pct(x.pct, 1),
              ]),
              ...(reasons?.other_count ? [['Other reasons', reasons.other_count, '—']] : []),
            ],
          }}
          skeletonHeight={220}
        >
          <RankBars
            color={c.tripStatus.cancelled}
            format={v => `${int(v)}`}
            rows={[
              ...((reasons?.items ?? []) as any[]).map((x, i) => ({
                key: `r${i}`,
                label: x.reason ?? 'No reason given',
                sublabel: pct(x.pct, 0),
                value: x.count,
              })),
              ...(reasons?.other_count
                ? [
                    {
                      key: 'other',
                      label: 'Other reasons',
                      value: reasons.other_count,
                      color: c.neutral,
                    },
                  ]
                : []),
            ]}
          />
        </WidgetCard>
      </div>

      <div id="trips-table" className="scroll-mt-4">
        <WidgetCard
          title="Trips"
          subtitle="Every trip in the range with its delay — click a row to open it"
          info={{
            definition:
              'One row per trip of the period. Delay = actual end − planned end for completed trips that had a planned end; other trips show “—”.',
            basis:
              'Filtering by status narrows this table only — the charts above keep their totals.',
          }}
          error={r.error}
          onRetry={() => r.refetch()}
          bodyClassName="px-0!"
          skeletonHeight={120}
        >
          <div
            role="group"
            aria-label="Filter trips by status"
            className="flex flex-wrap gap-1.5 px-5 pb-3"
          >
            {chips.map(ch => {
              const on = table.status === ch.key;

              return (
                <button
                  key={String(ch.key)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTable(s => ({ ...s, page: 1, status: ch.key }))}
                  className={`inline-flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                    on
                      ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
                      : 'border-line-soft text-ink-1 hover:bg-surface-2'
                  }`}
                >
                  {ch.label}{' '}
                  <b className="tabular-nums">{isNum(ch.n) ? ch.n.toLocaleString() : '—'}</b>
                </button>
              );
            })}
          </div>
          <DataTable
            caption="Trips in the range with delay, duration and distance"
            rows={(d?.table?.items ?? []) as any[]}
            loading={loading}
            rowKey={t => String(t.trip_id)}
            columns={columns}
            searchText={t => `${t.trip_reference} ${t.vehicle?.name ?? ''} ${t.driver?.name ?? ''}`}
            searchPlaceholder="Search reference, place, vehicle, driver"
            pageSize={15}
            server={{
              total: d?.table?.pagination?.total ?? 0,
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
            onRowClick={t =>
              openModal(<TripDetailModal tripId={t.trip_id} onListChanged={undefined} />)
            }
            empty={{
              title: 'No trips match',
              hint: table.status
                ? 'Choose “All” to see every trip in the range.'
                : 'Try a longer range.',
            }}
          />
        </WidgetCard>
      </div>
    </AnalyticsShell>
  );
}
