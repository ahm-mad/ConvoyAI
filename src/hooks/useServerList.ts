/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@utils/apiHelper';
import type { ListState } from '@hooks/useListState';

/**
 * Server-side data source for a fleet list (flows/06 §11, backend D-0164): the operator's `ListState`
 * (page, page size, search, filters, sort) is sent as request parameters and only ONE page is ever
 * downloaded. Opt-in paging: sending `page` / `per_page` makes `data` = `{ items, pagination }`.
 *
 * Realtime: the query name must start with a prefix `useFleetRealtime` invalidates (`vehicle`,
 * `driver`, `yard`, `geofence`, …) — the refetch keeps the current page and filters.
 */
export interface ServerListConfig {
  /** react-query key name (first element) — keep the fleet prefix so realtime invalidation matches. */
  queryName: string;
  url: string;
  /** `sort_by` values the endpoint accepts. A stored/unknown sort key is ignored (backend would 422). */
  sortKeys: string[];
  /** Toolbar filter values → request parameters (only the keys the endpoint knows). */
  filterParams?: (filters: Record<string, string>) => Record<string, unknown>;
  /** Always-sent parameters (e.g. `include_inactive`). */
  extra?: Record<string, unknown>;
  refetchInterval?: number;
  enabled?: boolean;
}

/** Everything except page / per_page — shared by the page query, "select all N" and CSV export. */
export const buildFilterParams = (
  state: ListState,
  search: string,
  cfg: Pick<ServerListConfig, 'sortKeys' | 'filterParams' | 'extra'>
): Record<string, unknown> => {
  const params: Record<string, unknown> = {
    ...(cfg.extra ?? {}),
    ...(cfg.filterParams ? cfg.filterParams(state.filters) : {}),
    ...(search ? { search } : {}),
    ...(state.sortBy && cfg.sortKeys.includes(state.sortBy)
      ? { sort_by: state.sortBy, sort_order: state.sortDir }
      : {}),
  };

  // Drop unset values so they never reach the URL (or the react-query key).
  Object.keys(params).forEach(k => {
    if (params[k] === undefined || params[k] === '') delete params[k];
  });

  return params;
};

const readPage = (res: any) => {
  const data = res?.data;

  // Paged envelope (opt-in paging). A flat array would mean paging was ignored — treat it as one page.
  if (Array.isArray(data)) return { items: data, total: data.length };

  return { items: (data?.items ?? []) as any[], total: (data?.pagination?.total ?? 0) as number };
};

export function useServerList<T = any>(
  list: { state: ListState; debouncedSearch: string },
  cfg: ServerListConfig
) {
  const { state, debouncedSearch } = list;
  const filterParams = buildFilterParams(state, debouncedSearch, cfg);
  const params = { ...filterParams, page: state.page, per_page: state.pageSize };

  const query = useQuery({
    queryKey: [cfg.queryName, params],
    queryFn: () => get(cfg.url, params) as Promise<any>,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    enabled: cfg.enabled ?? true,
    refetchInterval: cfg.refetchInterval,
  });

  const res: any = query.data;
  const { items, total } = res?.success ? readPage(res) : { items: [], total: 0 };

  return {
    items: items as T[],
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: res && res.success === false ? String(res.message || 'Could not load the list.') : null,
    refetch: query.refetch,
    /** The current filters/search/sort WITHOUT paging — for export and "select all matching". */
    filterParams,
  };
}
