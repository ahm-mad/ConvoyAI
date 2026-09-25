/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

export type TripStatusFilter = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface TripsReportQuery {
  from: string;
  to: string;
  days: number;
  compare: boolean;
  /** "year" compares with the same dates one year earlier (default: the window just before). */
  compareMode?: 'period' | 'year';
  /** Group-by interval; omitted = automatic (day ≤ 92 days, then week, then month). */
  interval?: 'day' | 'week' | 'month';
  page: number;
  perPage: number;
  status: TripStatusFilter | null;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
  /** Scope filters (`vehicle_category`, `vehicle_id`, `yard_id`, …) — every chart and the table follow them. */
  scope?: Record<string, unknown>;
}

/**
 * The trips report (backend B5, flows/07 §24): one call returns the KPI summary with the previous period,
 * the per-bucket series, the duration / delay histograms, the cancellation reasons and the paged trip
 * table. `status` narrows the TABLE only (charts stay put). Buckets are capped at 92 by the server, so the
 * interval widens with the range. Query name starts with `fleet-dashboard-an` so fleet realtime refetches it.
 */
export function useTripsReport(q: TripsReportQuery) {
  const interval = q.interval ?? (q.days <= 92 ? 'day' : q.days <= 644 ? 'week' : 'month');
  const filters = {
    ...(q.scope ?? {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { search: q.search } : {}),
    sort_by: q.sort,
    sort_order: q.direction,
  };
  const query = useSimpleQuery<any>(
    'fleet-dashboard-an-trips',
    '/api/fleet/analytics/trips',
    {
      from: q.from,
      to: q.to,
      interval,
      compare: q.compare
        ? q.compareMode === 'year'
          ? 'previous_year'
          : 'previous_period'
        : 'none',
      page: q.page,
      per_page: q.perPage,
      top_reasons: 6,
      ...filters,
    },
    { placeholderData: keepPreviousData, refetchInterval: 300000 }
  );
  const ok = query.data?.success ? query.data : null;

  return {
    data: (ok?.data ?? null) as any,
    meta: (ok?.meta ?? null) as any,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error:
      query.data && !query.data.success ? String(query.data.message || 'Could not load') : null,
    refetch: query.refetch,
    interval,
    /** Same scope / filters / sort as the table, for the server CSV export (paging is ignored there). */
    exportParams: { from: q.from, to: q.to, ...filters } as Record<string, unknown>,
  };
}
