/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

export type FuelTankFilter = 'full' | 'partial' | 'check' | null;

export interface FuelReportQuery {
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
  /** Table only: `full` / `partial` = `is_full_tank`, `check` = `anomaly=1` (fills flagged for a look). */
  filter: FuelTankFilter;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
  /** Scope filters (`vehicle_category`, `vehicle_id`, `yard_id`, …) — every chart and the table follow them. */
  scope?: Record<string, unknown>;
}

/**
 * The fuel report (backend B6, flows/07 §25): one call returns the KPI summary with the previous period, the
 * per-bucket series (litres, cost, price, economy), economy by vehicle category, spend by vendor, the fills
 * flagged for a check, and the paged fills table. The table filters (`is_full_tank`, `anomaly`, `search`)
 * narrow the TABLE only — the charts keep their totals. The server caps a request at 92 buckets, so the
 * interval widens with the range. Query name starts with `fleet-dashboard-an` so fleet realtime refetches it.
 */
export function useFuelReport(q: FuelReportQuery) {
  const interval = q.interval ?? (q.days <= 92 ? 'day' : q.days <= 644 ? 'week' : 'month');
  const filters = {
    ...(q.scope ?? {}),
    ...(q.filter === 'full' ? { is_full_tank: 1 } : {}),
    ...(q.filter === 'partial' ? { is_full_tank: 0 } : {}),
    ...(q.filter === 'check' ? { anomaly: 1 } : {}),
    ...(q.search ? { search: q.search } : {}),
    sort_by: q.sort,
    sort_order: q.direction,
  };
  const query = useSimpleQuery<any>(
    'fleet-dashboard-an-fuel',
    '/api/fleet/analytics/fuel',
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
      top_vendors: 6,
      top_anomalies: 20,
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
    /** Same filters / sort as the table, for the server CSV export (paging is ignored there). */
    exportParams: { from: q.from, to: q.to, ...filters } as Record<string, unknown>,
  };
}
