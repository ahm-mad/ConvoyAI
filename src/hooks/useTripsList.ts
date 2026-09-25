/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import type { ListState } from '@hooks/useListState';

/**
 * Data source for the Trips list — fully server-side (flows/06 §11, backend D-0164): `GET /trips`
 * takes page, per_page, search, sort_by / sort_order and the filters (status — single or multi-value —
 * vehicle_id, driver_id, date_from, date_to), so only one page is ever downloaded. The response keeps
 * the Laravel paginator envelope (`data.data`, `data.total`).
 */

export const TRIP_STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** `sort_by` values `GET /trips` accepts (anything else is a 422). */
export const TRIP_SORT_KEYS = ['planned_start_at', 'created_at', 'status', 'trip_reference'];

const FILTER_KEYS = ['status', 'vehicle_id', 'driver_id', 'date_from', 'date_to'] as const;
/** Everything except paging — shared by the page query and the CSV export. */
const listParams = (state: ListState, search: string) => ({
  ...Object.fromEntries(FILTER_KEYS.filter(k => state.filters[k]).map(k => [k, state.filters[k]])),
  ...(search ? { search } : {}),
  ...(state.sortBy && TRIP_SORT_KEYS.includes(state.sortBy)
    ? { sort_by: state.sortBy, sort_order: state.sortDir }
    : {}),
});

export function useTripsList(list: { state: ListState; debouncedSearch: string }) {
  const { state, debouncedSearch } = list;

  const server = useSimpleQuery(
    'trips-list',
    '/api/trips',
    { ...listParams(state, debouncedSearch), page: state.page, per_page: state.pageSize },
    { placeholderData: keepPreviousData }
  );

  const res: any = server.data;
  const paged: any = res?.success ? res.data : null;

  return {
    items: (paged?.data ?? []) as any[],
    total: (paged?.total ?? 0) as number,
    isLoading: server.isLoading,
    isRefreshing: server.isFetching,
    error: res && !res.success ? String(res.message || 'Could not load trips.') : null,
    refetch: server.refetch,
    /** Current search / filters / sort WITHOUT paging — for export and bulk-by-filter. */
    filterParams: listParams(state, debouncedSearch) as Record<string, unknown>,
  };
}
