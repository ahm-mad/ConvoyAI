/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@utils/apiHelper';

/**
 * A map layer's records for the current viewport (yards / geofences with `bbox`, flows/06 §29). The lists
 * are always served in pages of at most 100, so this reads page 1, then the remaining pages in parallel up
 * to `maxPages` (default 5 → 500 records) — enough for any sane view; `total` is the backend's real count
 * so the map can say "showing 500 of 1,204 — zoom in". Query name keeps its fleet prefix (`fleet-yards`,
 * `fleet-geofences`) so the usual realtime invalidations refetch it.
 */
const PER_PAGE = 100;

export function useViewportList(
  name: string,
  url: string,
  params: Record<string, unknown>,
  enabled: boolean,
  maxPages = 5
) {
  const query = useQuery({
    queryKey: [name, params],
    enabled,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    queryFn: async () => {
      const first: any = await get(url, { ...params, page: 1, per_page: PER_PAGE });

      if (!first?.success) return first;

      const totalPages = Math.min(maxPages, first.data?.pagination?.total_pages ?? 1);
      const rest: any[] = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
          get(url, { ...params, page: i + 2, per_page: PER_PAGE })
        )
      );
      const items = [first, ...rest].flatMap(r => (r?.success ? (r.data?.items ?? []) : []));

      return { success: true, items, total: first.data?.pagination?.total ?? items.length };
    },
  });
  const res: any = query.data;

  return {
    items: (res?.success ? res.items : []) as any[],
    total: (res?.success ? res.total : 0) as number,
    isLoading: query.isLoading,
  };
}
