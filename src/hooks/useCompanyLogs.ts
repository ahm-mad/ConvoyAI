/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

export interface LogQuery {
  from: string;
  to: string;
  page: number;
  perPage: number;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
  /** Fuel only: `1` = full-tank fills, `0` = partial ones, `null` = both. */
  fullTank?: boolean | null;
  /** Scope filters the log endpoints understand (`vehicle_category`, `vehicle_id`). */
  scope?: Record<string, unknown>;
}

/**
 * Company-wide service and fuel LOGS (backend C2 / C3, flows/07 §20): always paged, date range on
 * `service_date` / `fill_date`, search, sort, and `meta.summary` for the WHOLE filtered set (not the page).
 * Every item carries `vehicle { id, name, plate, vehicle_category, lifecycle_status }`. Query names start
 * with `fleet-dashboard-an` so fleet realtime invalidations refetch them.
 */
export function useCompanyLogs(kind: 'maintenance' | 'fuel', q: LogQuery) {
  const filters = {
    ...(q.scope ?? {}),
    from: q.from,
    to: q.to,
    sort_by: q.sort,
    sort_order: q.direction,
    ...(q.search ? { search: q.search } : {}),
    ...(kind === 'fuel' && q.fullTank !== null && q.fullTank !== undefined
      ? { is_full_tank: q.fullTank ? 1 : 0 }
      : {}),
  };
  const query = useSimpleQuery<any>(
    kind === 'maintenance' ? 'fleet-dashboard-an-maintenance-logs' : 'fleet-dashboard-an-fuel-logs',
    kind === 'maintenance' ? '/api/maintenance-logs' : '/api/fuel-logs',
    { ...filters, page: q.page, per_page: q.perPage },
    { placeholderData: keepPreviousData, refetchInterval: 300000 }
  );
  const ok = query.data?.success ? query.data : null;

  return {
    items: (ok?.data?.items ?? []) as any[],
    total: (ok?.data?.pagination?.total ?? 0) as number,
    summary: (ok?.meta?.summary ?? null) as any,
    generatedAt: undefined as string | undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error:
      query.data && !query.data.success ? String(query.data.message || 'Could not load') : null,
    refetch: query.refetch,
    /** Same filters / sort, for the server CSV export (paging is ignored there). */
    exportParams: filters as Record<string, unknown>,
  };
}
