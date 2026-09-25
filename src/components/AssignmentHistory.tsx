/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useOptions } from '@hooks/useOptions';
import { useListState } from '@hooks/useListState';
import Pager from '@components/list/Pager';

/**
 * Who drove which vehicle, and when — one component for the three backend endpoints:
 *   vehicle → GET /vehicles/{id}/assignment-history   (summary + paged rows)
 *   driver  → GET /drivers/{id}/assignment-history    (summary + paged rows)
 *   company → GET /assignment-history                  (paged rows; driver / vehicle / status filters)
 * The backend pages (Laravel paginator) and filters, so nothing is loaded whole.
 *
 * Query keys start with `vehicle-assignments` on purpose: realtime `fleet:changed` (vehicle or driver)
 * and `invalidateFleetQueries` match on that prefix, so the history refetches when an assignment changes.
 */
export type AssignmentScope = 'vehicle' | 'driver' | 'company';

const CONTROL = 'control max-w-[190px]';

// The year is omitted for the current year (recent history reads shorter and fits narrow tables).
const fmt = (iso?: string | null) => {
  if (!iso) return '—';

  const d = new Date(iso);

  return d.toLocaleString(undefined, {
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const personName = (p?: { first_name?: string; last_name?: string } | null) =>
  p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '—';

/** Backend gives whole days (0 for same-day); show hours/minutes when it is shorter than a day. */
const duration = (row: any) => {
  if (!row.assigned_at) return '—';

  const end = row.unassigned_at ? new Date(row.unassigned_at) : new Date();
  const mins = Math.max(
    0,
    Math.round((end.getTime() - new Date(row.assigned_at).getTime()) / 60000)
  );
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;

  return `${mins}m`;
};

export default function AssignmentHistory({
  scope,
  id,
}: {
  scope: AssignmentScope;
  /** vehicle / driver id — required unless scope is `company`. */
  id?: string | number;
}) {
  const list = useListState(`assignments-${scope}-${id ?? 'all'}`, { pageSize: 20 });
  const { state } = list;
  const f = state.filters;

  // Filter dropdowns from the options endpoints (active records, ≤ 1000).
  // include_inactive: a history filter must still find a deactivated vehicle / driver (backend D-0171).
  const { items: vehicles } = useOptions(
    'vehicles',
    { include_inactive: 1 },
    { enabled: scope === 'company' }
  );
  const { items: drivers } = useOptions(
    'drivers',
    { include_inactive: 1 },
    { enabled: scope === 'company' }
  );

  const url =
    scope === 'vehicle'
      ? `/api/vehicles/${id}/assignment-history`
      : scope === 'driver'
        ? `/api/drivers/${id}/assignment-history`
        : '/api/assignment-history';

  const params: Record<string, unknown> = {
    page: state.page,
    per_page: state.pageSize,
    ...(f.date_from ? { date_from: f.date_from } : {}),
    ...(f.date_to ? { date_to: f.date_to } : {}),
    ...(scope === 'company' && f.status ? { status: f.status } : {}),
    ...(scope === 'company' && f.driver_id ? { driver_id: Number(f.driver_id) } : {}),
    ...(scope === 'company' && f.vehicle_id ? { vehicle_id: Number(f.vehicle_id) } : {}),
  };

  const { data, isLoading, isFetching, refetch } = useSimpleQuery(
    `vehicle-assignments-${scope}`,
    url,
    { ...params, id },
    { placeholderData: keepPreviousData, enabled: scope === 'company' || id != null }
  );

  const res: any = data;
  const failed = res && res.success === false;
  // company: data is the paginator; vehicle / driver: data = { summary, history: paginator }
  const paginator = scope === 'company' ? res?.data : res?.data?.history;
  const rows: any[] = paginator?.data ?? [];
  const total: number = paginator?.total ?? 0;
  const summary = scope === 'company' ? null : res?.data?.summary;
  const hasFilters = Object.keys(f).length > 0;

  const tiles =
    summary &&
    (scope === 'vehicle'
      ? [
          ['Assignments', summary.total_assignments],
          ['Unique drivers', summary.unique_drivers],
          ['Trips', summary.total_trips],
          ['Distance', `${summary.total_distance_km} km`],
        ]
      : [
          ['Assignments', summary.total_assignments],
          ['Vehicles driven', summary.unique_vehicles_driven],
          ['Trips', summary.total_trips],
          ['Distance', `${summary.total_distance_km} km`],
        ]);

  return (
    <div>
      {tiles && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {tiles.map(([label, value]) => (
            <div key={String(label)} className="glass-strong px-4 py-3">
              <div className="eyebrow">{label}</div>
              <div className="text-sm text-ink-0 mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {scope === 'company' && (
          <>
            <select
              aria-label="Status"
              value={f.status ?? ''}
              onChange={e => list.setFilter('status', e.target.value)}
              className={CONTROL}
            >
              <option value="">Status: all</option>
              <option value="active">Active</option>
              <option value="historical">Historical</option>
            </select>
            <select
              aria-label="Vehicle"
              value={f.vehicle_id ?? ''}
              onChange={e => list.setFilter('vehicle_id', e.target.value)}
              className={`${CONTROL} max-w-[170px]`}
            >
              <option value="">Vehicle: all</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name || `Vehicle #${v.id}`} (#{v.id})
                  {v.lifecycle_status === 'retired' || v.lifecycle_status === 'sold'
                    ? ' — inactive'
                    : ''}
                </option>
              ))}
            </select>
            <select
              aria-label="Driver"
              value={f.driver_id ?? ''}
              onChange={e => list.setFilter('driver_id', e.target.value)}
              className={`${CONTROL} max-w-[170px]`}
            >
              <option value="">Driver: all</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.status && d.status !== 'active' ? ` — ${d.status}` : ''}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="flex items-center gap-1 text-[10px] text-ink-2">
          From
          <input
            type="date"
            value={f.date_from ?? ''}
            onChange={e => list.setFilter('date_from', e.target.value)}
            className={CONTROL}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-ink-2">
          To
          <input
            type="date"
            value={f.date_to ?? ''}
            onChange={e => list.setFilter('date_to', e.target.value)}
            className={CONTROL}
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={list.clearFilters}
            className="flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-0"
          >
            <X size={11} /> Clear
          </button>
        )}
        {isFetching && !isLoading && <span className="text-[10px] text-ink-2">Updating…</span>}
      </div>

      {isLoading && <div className="text-xs text-ink-2 text-center py-8">Loading…</div>}

      {failed && (
        <div className="text-xs text-danger bg-danger/10 rounded-md px-3 py-2 flex items-center justify-between">
          <span>{res.message || 'Could not load the assignment history.'}</span>
          <button type="button" onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !failed && rows.length === 0 && (
        <div className="text-[11px] text-ink-2 italic bg-surface-2 rounded-md px-3 py-4 text-center">
          {hasFilters
            ? 'No assignments match these filters.'
            : scope === 'vehicle'
              ? 'No driver has been assigned to this vehicle yet.'
              : scope === 'driver'
                ? 'This driver has not been assigned to a vehicle yet.'
                : 'No driver–vehicle assignments recorded yet.'}
        </div>
      )}

      {rows.length > 0 && (
        <div className="glass overflow-x-auto">
          <table className="w-full text-caption">
            <thead className="bg-white/50 text-ink-2 text-left uppercase tracking-[0.08em]">
              <tr>
                {scope !== 'driver' && <th className="px-4 py-3 font-medium">Driver</th>}
                {scope !== 'vehicle' && <th className="px-4 py-3 font-medium">Vehicle</th>}
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3 font-medium">Unassigned</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium text-right">Trips</th>
                <th className="px-4 py-3 font-medium text-right">Distance</th>
                {scope === 'company' && <th className="px-4 py-3 font-medium">By</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="border-t border-line-soft text-ink-1 align-top transition-colors hover:bg-brand-wash/40"
                >
                  {scope !== 'driver' && (
                    <td className="px-4 py-3 min-w-[120px]">
                      <div className="text-ink-0">{personName(row.driver)}</div>
                      {row.driver?.license_number && (
                        <div className="text-[10px] text-ink-2">{row.driver.license_number}</div>
                      )}
                    </td>
                  )}
                  {scope !== 'vehicle' && (
                    <td className="px-4 py-3 min-w-[120px]">
                      <div className="text-ink-0">{row.vehicle?.name || `#${row.vehicle_id}`}</div>
                      {row.vehicle?.plate && (
                        <div className="text-[10px] text-ink-2">{row.vehicle.plate}</div>
                      )}
                    </td>
                  )}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    title={
                      row.assigned_by ? `Assigned by ${personName(row.assigned_by)}` : undefined
                    }
                  >
                    {fmt(row.assigned_at)}
                    {scope !== 'company' && row.notes ? (
                      <div className="text-[10px] italic text-ink-2">{row.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.is_active ? (
                      <span className="text-accent-cyan">Active</span>
                    ) : (
                      fmt(row.unassigned_at)
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{duration(row)}</td>
                  <td className="px-4 py-3 text-right">{row.trip_count ?? 0}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.distance_km ?? 0} km
                  </td>
                  {scope === 'company' && (
                    <td className="px-4 py-3 text-ink-2">
                      {personName(row.assigned_by)}
                      {row.notes ? <div className="text-[10px] italic">{row.notes}</div> : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <Pager
          page={state.page}
          pageSize={state.pageSize}
          total={total}
          onPage={list.setPage}
          onPageSize={list.setPageSize}
          pageSizes={[10, 20, 50, 100]}
        />
      )}
    </div>
  );
}
