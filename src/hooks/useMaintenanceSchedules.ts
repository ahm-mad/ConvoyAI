/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

export type ScheduleStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export interface ScheduleQuery {
  page: number;
  perPage: number;
  status: ScheduleStatus | null;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
  /** Scope filters the list understands (`vehicle_category`, `vehicle_id`). */
  scope?: Record<string, unknown>;
}

/**
 * Company-wide maintenance schedules with their COMPUTED due state (backend C1, flows/07 §12.3):
 * always paged, filterable by status / service type / category, sortable; `meta.counts` holds the
 * total / overdue / due_soon / ok / unknown counts of the filtered set WITHOUT the status filter
 * (so a status chip never zeroes the others). Query name starts with `fleet-dashboard-an` so fleet
 * realtime invalidations refetch it.
 */
export function useMaintenanceSchedules(q: ScheduleQuery) {
  const params = {
    ...(q.scope ?? {}),
    page: q.page,
    per_page: q.perPage,
    sort_by: q.sort,
    sort_order: q.direction,
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { search: q.search } : {}),
  };
  const query = useSimpleQuery<any>(
    'fleet-dashboard-an-maintenance',
    '/api/maintenance-schedules',
    params,
    { placeholderData: keepPreviousData, refetchInterval: 300000 }
  );
  const res = query.data?.success ? query.data : null;

  return {
    items: (res?.data?.items ?? []) as any[],
    total: (res?.data?.pagination?.total ?? 0) as number,
    counts: (res?.meta?.counts ?? null) as {
      total: number;
      overdue: number;
      due_soon: number;
      ok: number;
      unknown: number;
      due_soon_days?: number;
      due_soon_km?: number;
    } | null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error:
      query.data && !query.data.success ? String(query.data.message || 'Could not load') : null,
    refetch: query.refetch,
    /** Same filters / sort as the table, for the server CSV export (paging is ignored there). */
    exportParams: {
      ...(q.scope ?? {}),
      sort_by: q.sort,
      sort_order: q.direction,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { search: q.search } : {}),
    } as Record<string, unknown>,
  };
}
