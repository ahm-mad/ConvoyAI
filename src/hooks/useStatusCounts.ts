/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@utils/apiHelper';

/**
 * Status counts for the filter chips (backend B7, flows/06 §26): `GET /{trips|vehicles|drivers}/counts`
 * answers `{ total, by_status }` for the list's own filters + search, but NEVER for `status`,
 * `include_inactive`, paging or sort — so picking one chip does not zero the others. Those keys are
 * stripped here as well, which keeps the query key stable when a chip is clicked (no refetch flash).
 * The query name keeps the fleet prefix (`trips-counts`, `vehicles-counts`, `drivers-counts`) so the
 * same realtime invalidations that refetch the list refetch the counts.
 */
const IGNORED = ['status', 'include_inactive', 'sort_by', 'sort_order', 'page', 'per_page'];

export type StatusCounts = { total: number; by_status: Record<string, number> };

export function useStatusCounts(kind: 'trips' | 'vehicles' | 'drivers', filterParams: object) {
  const params = Object.fromEntries(
    Object.entries(filterParams).filter(([k]) => !IGNORED.includes(k))
  );

  const query = useQuery({
    queryKey: [`${kind}-counts`, params],
    queryFn: () => get(`/api/${kind}/counts`, params) as Promise<any>,
    placeholderData: keepPreviousData,
    networkMode: 'always',
  });
  const res: any = query.data;

  return {
    counts: (res?.success ? res.data : null) as StatusCounts | null,
    isLoading: query.isLoading,
  };
}
