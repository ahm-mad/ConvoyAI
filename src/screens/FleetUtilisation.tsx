/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { CalendarClock, Gauge, Route, Truck } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useUnits } from '@hooks/useUnits';
import { useAnalyticsData } from '@hooks/useAnalyticsData';
import { useServerExport } from '@hooks/useServerExport';
import AnalyticsShell from '@components/analytics/AnalyticsShell';
import { useAnalyticsFilters } from '@components/analytics/useAnalyticsFilters';
import WidgetCard from '@components/analytics/WidgetCard';
import KpiTile from '@components/analytics/KpiTile';
import DataTable, { type Column } from '@components/analytics/DataTable';
import { StackedColumns, TrendLine } from '@components/analytics/charts';
import { useVizColors } from '@components/analytics/theme';
import {
  compact,
  decimal,
  deltaPct,
  hours,
  int,
  isNum,
  parseYmd,
  shortDate,
} from '@components/analytics/format';

/** Column → the API's `sort` key (backend A8: every column except the tracker flag). */
const SORT_KEYS: Record<string, string> = {
  vehicle: 'vehicle_name',
  util: 'utilisation_rate',
  distance: 'distance_km',
  driving: 'driving_hours',
  trips: 'trip_count',
  fuel: 'fuel_used_liters',
  costkm: 'cost_per_km',
};

const SOURCE: Record<string, string> = {
  odometer: 'Odometer',
  telemetry: 'GPS',
  trip: 'Trip record',
};

/**
 * Analytics → Utilisation (FLEET_ANALYTICS_DESIGN.md §4): are vehicles earning their keep?
 * Real numbers from the definition-fixed dashboard endpoints (trip-based until tracker rollups ship);
 * the day × hour heatmap and moving / idle / parked hours wait for the telemetry rollups (backend D1).
 */
export default function FleetUtilisation() {
  const { openModal } = useModal();
  const c = useVizColors();
  const { settings } = useFleetSettings();
  const u = useUnits();
  const f = useAnalyticsFilters();
  // The vehicle table is server-driven (backend A8): page, sort and search go to the API.
  const [table, setTable] = useState<{
    page: number;
    search: string;
    sort: { key: string; dir: 'asc' | 'desc' } | null;
  }>({ page: 1, search: '', sort: { key: 'distance', dir: 'desc' } });
  const sortApi = SORT_KEYS[table.sort?.key ?? 'distance'] ?? 'distance_km';
  const direction = table.sort?.dir ?? 'desc';
  const d = useAnalyticsData(f, {
    vehicles: { page: table.page, perPage: 15, search: table.search, sort: sortApi, direction },
  });
  const exporter = useServerExport('/api/fleet/dashboard/vehicle-performance/export', 'vehicles');
  const prevLabel = f.compare ? f.prevLabel : undefined;

  const o = d.overview;
  const p = d.previousOverview;
  const ut = d.trends?.utilisation ?? [];
  const dist = d.trends?.distance ?? [];
  const labels = ut.map((x: any) => f.axisLabel(x.date));
  const distLabels = dist.map((x: any) => f.axisLabel(x.date));
  const target = settings?.utilisation_target_pct;
  const weekly = f.days > 92;

  const vehicleRows = d.vehicles;
  const columns = useMemo<Column<any>[]>(
    () => [
      {
        key: 'vehicle',
        serverSort: SORT_KEYS.vehicle,
        header: 'Vehicle',
        sort: r => String(r.vehicle_name ?? '').toLowerCase(),
        csv: r => r.vehicle_name,
        render: r => (
          <div className="min-w-[160px]">
            <div className="font-medium text-ink-0 truncate">{r.vehicle_name}</div>
            <div className="text-[11.5px] text-ink-2 truncate">
              {[r.plate, r.vehicle_category].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        ),
      },
      {
        key: 'util',
        serverSort: SORT_KEYS.util,
        header: 'Utilisation',
        align: 'right',
        sort: r => r.utilisation_rate,
        csv: r => r.utilisation_rate,
        render: r => <span className="text-ink-0">{decimal(r.utilisation_rate, 2)}%</span>,
      },
      {
        key: 'distance',
        serverSort: SORT_KEYS.distance,
        header: 'Distance',
        align: 'right',
        sort: r => r.distance_km,
        csv: r => r.distance_km,
        render: r => (
          <span>
            <span className="text-ink-0">
              {decimal(u.distance.from(r.distance_km), 1)} {u.distance.label}
            </span>
            {r.distance_source && (
              <span className="ml-1.5 text-[10.5px] text-ink-2">{SOURCE[r.distance_source]}</span>
            )}
          </span>
        ),
      },
      {
        key: 'driving',
        serverSort: SORT_KEYS.driving,
        header: 'Driving',
        align: 'right',
        sort: r => r.driving_hours,
        csv: r => r.driving_hours,
        render: r => hours(r.driving_hours),
      },
      {
        key: 'trips',
        serverSort: SORT_KEYS.trips,
        header: 'Trips',
        align: 'right',
        sort: r => r.trip_count,
        csv: r => r.trip_count,
        render: r => int(r.trip_count),
      },
      {
        key: 'fuel',
        serverSort: SORT_KEYS.fuel,
        header: 'Fuel',
        align: 'right',
        sort: r => r.fuel_used_liters,
        csv: r => r.fuel_used_liters,
        render: r =>
          isNum(r.fuel_used_liters)
            ? `${decimal(u.volume.from(r.fuel_used_liters), 1)} ${u.volume.label}`
            : '—',
      },
      {
        key: 'costkm',
        serverSort: SORT_KEYS.costkm,
        header: `Cost / ${u.perDistance.label}`,
        align: 'right',
        sort: r => r.cost_per_km,
        csv: r => r.cost_per_km,
        render: r => (isNum(r.cost_per_km) ? decimal(u.perDistance.from(r.cost_per_km), 2) : '—'),
      },
      {
        key: 'tracker',
        header: 'Tracker',
        sort: r => (r.has_tracker ? 1 : 0),
        csv: r => (r.has_tracker ? 'Yes' : 'No'),
        render: r =>
          r.has_tracker ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.series(0) }} />{' '}
              Installed
            </span>
          ) : (
            <span className="text-[12px] text-ink-2">None</span>
          ),
      },
    ],
    [c, u]
  );

  const util = o?.utilisation;

  return (
    <AnalyticsShell
      title="Utilisation"
      subtitle="Are vehicles earning their keep?"
      filters={f}
      onRefresh={d.refetchAll}
      fetching={d.fetching}
      updatedAt={d.overviewMeta?.generated_at}
    >
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        <KpiTile
          label="Utilisation"
          icon={<Gauge size={14} />}
          value={decimal(util?.rate, 2)}
          unit="%"
          spark={ut.map((x: any) => x.rate)}
          delta={
            f.compare
              ? {
                  pct: deltaPct(util?.rate, p?.utilisation?.rate),
                  polarity: 'up-good',
                  label: prevLabel,
                }
              : undefined
          }
          hint={f.compare ? undefined : `of ${compact(util?.available_hours, 0)} available hours`}
          loading={d.loading.overview}
          info={{
            definition:
              'Driving hours divided by available hours. Available hours = in-service vehicles × scheduled hours per day × days in the range.',
            basis: `Trip-based today. Scheduled hours: ${settings?.scheduled_hours_per_vehicle_per_day ?? 24} h per vehicle per day (Fleet settings).`,
          }}
        />
        <KpiTile
          label="Distance driven"
          icon={<Route size={14} />}
          value={compact(isNum(util?.distance_km) ? u.distance.from(util.distance_km) : null, 1)}
          unit={u.distance.label}
          spark={dist.map((x: any) => x.km)}
          delta={
            f.compare
              ? {
                  pct: deltaPct(util?.distance_km, p?.utilisation?.distance_km),
                  polarity: 'neutral',
                  label: prevLabel,
                }
              : undefined
          }
          hint={f.compare ? undefined : 'completed trips'}
          loading={d.loading.overview}
          info={{
            definition: `${u.distance.label === 'mi' ? 'Miles' : 'Kilometres'} driven on completed trips: the operator’s end − start odometer when given, otherwise the distance the trip’s tracker recorded.`,
            basis:
              'One distance everywhere in Fleet. Tracker-only distance replaces it when telemetry rollups ship.',
          }}
        />
        <KpiTile
          label="Driving hours"
          icon={<CalendarClock size={14} />}
          value={decimal(util?.driving_hours, 1)}
          unit="h"
          delta={
            f.compare
              ? {
                  pct: deltaPct(util?.driving_hours, p?.utilisation?.driving_hours),
                  polarity: 'up-good',
                  label: prevLabel,
                }
              : undefined
          }
          hint={f.compare ? undefined : 'across all vehicles'}
          loading={d.loading.overview}
          info={{
            definition: 'Total duration of completed trips in the range.',
            basis: 'Trip-based until telemetry rollups ship.',
          }}
        />
        <KpiTile
          label="Vehicles in scope"
          icon={<Truck size={14} />}
          value={int(util?.vehicles_in_scope)}
          hint={`${settings?.scheduled_hours_per_vehicle_per_day ?? 24} scheduled h / day each`}
          loading={d.loading.overview}
          info={{
            definition:
              'In-service (active) vehicles counted in available hours. Vehicles in maintenance, retired or sold are left out.',
          }}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <WidgetCard
          className="col-span-12 xl:col-span-7"
          title="Utilisation trend"
          subtitle={`Share of available vehicle-hours spent driving, per ${weekly ? 'week' : 'day'}`}
          info={{
            definition:
              'Driving hours ÷ available hours for each day (trip-based until tracker rollups ship).',
            basis: isNum(target)
              ? `Target ${target}% (company setting).`
              : 'Set a target in Fleet settings to draw a target line.',
          }}
          loading={d.loading.trends}
          error={d.error.trends}
          onRetry={d.refetchAll}
          fetching={d.fetching}
          table={{
            columns: ['Day', 'Utilisation', 'Driving hours'],
            rows: ut.map((x: any, i: number) => [
              labels[i],
              `${decimal(x.rate, 2)}%`,
              decimal(x.hours, 1),
            ]),
          }}
          skeletonHeight={280}
        >
          <TrendLine
            labels={labels}
            series={[
              {
                key: 'util',
                label: 'Utilisation',
                color: c.series(0),
                data: ut.map((x: any) => x.rate),
                format: v => `${decimal(v, 2)}%`,
              },
            ]}
            target={isNum(target) ? { value: target, label: `Target ${target}%` } : null}
            yTickFormat={v => `${v}%`}
            height={260}
            ariaLabel="Utilisation rate over the range"
          />
        </WidgetCard>

        <WidgetCard
          className="col-span-12 xl:col-span-5"
          title={`Distance per ${weekly ? 'week' : 'day'}`}
          subtitle={`${u.distance.label === 'mi' ? 'Miles' : 'Kilometres'} on completed trips`}
          info={{ definition: 'Completed trips’ distance, on the day each trip started.' }}
          loading={d.loading.trends}
          error={d.error.trends}
          onRetry={d.refetchAll}
          fetching={d.fetching}
          table={{
            columns: ['Day', `Distance (${u.distance.label})`],
            rows: dist.map((x: any, i: number) => [
              distLabels[i],
              decimal(u.distance.from(x.km), 1),
            ]),
          }}
          skeletonHeight={280}
        >
          <StackedColumns
            labels={distLabels}
            series={[
              {
                key: 'km',
                label: 'Distance',
                color: c.series(0),
                data: dist.map((x: any) => u.distance.from(x.km)),
                format: v => `${decimal(v, 1)} ${u.distance.label}`,
              },
            ]}
            height={260}
            yTickFormat={v => compact(v, 0)}
            ariaLabel="Distance driven per day"
          />
        </WidgetCard>
      </div>

      <WidgetCard
        title="Vehicles"
        subtitle="Every in-service vehicle's numbers for the range — click a row to open the vehicle"
        info={{
          definition:
            'One row per active or in-maintenance vehicle. Distance is labelled with its source; utilisation is trip-based.',
          basis:
            'Loaded in one piece today; server paging arrives with the backend vehicle-performance paging (A8).',
        }}
        loading={false}
        error={d.error.vehicles}
        onRetry={d.refetchAll}
        bodyClassName="px-0!"
        skeletonHeight={120}
      >
        <DataTable
          caption="Per-vehicle utilisation, distance, driving hours, trips, fuel and cost"
          rows={vehicleRows}
          loading={d.loading.vehicles}
          pageSize={15}
          server={{
            total: d.vehiclesTotal,
            page: table.page,
            onPage: page => setTable(t => ({ ...t, page })),
            sort: table.sort,
            onSort: sort => setTable(t => ({ ...t, sort })),
            onQuery: search => setTable(t => (t.search === search ? t : { ...t, search, page: 1 })),
            fetching: d.vehiclesFetching,
            exporting: exporter.busy,
            onExport: () =>
              exporter.run({
                from: f.from,
                to: f.to,
                sort: sortApi,
                direction,
                ...(table.search ? { search: table.search } : {}),
              }),
          }}
          rowKey={r => String(r.vehicle_id)}
          columns={columns}
          searchText={r => `${r.vehicle_name} ${r.plate ?? ''} ${r.vehicle_category ?? ''}`}
          searchPlaceholder="Search vehicles"
          onRowClick={r => openModal(<VehicleDetailModal vehicleId={r.vehicle_id} />)}
          empty={{
            title: 'No vehicles in service',
            hint: 'Add vehicles in Fleet Management → Vehicles.',
          }}
        />
      </WidgetCard>
    </AnalyticsShell>
  );
}
