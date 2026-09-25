/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { get } from '@utils/apiHelper';

/**
 * Dropdown data for pickers (flows/06 §12, backend B2): `GET /{kind}/options` returns a lean, UNPAGED
 * list of ACTIVE records (ordered by name, ≤ 1000) plus `meta { total, limit, truncated }`. This replaces
 * downloading the whole list just to fill a <select>. Options never carry a page envelope.
 *
 * Only active records are offered (drivers: `active` only), which is right for "assign …" pickers; a
 * filter over history (e.g. trips of a deactivated vehicle) cannot pick an inactive one — flows/06 §8.5.
 *
 * Query names start with the fleet prefixes (`vehicles-…`, `drivers-…`, `yards-…`, `geofences-…`) so
 * `useFleetRealtime` refetches them on fleet:changed / reconnect.
 */
export type OptionKind = 'vehicles' | 'drivers' | 'yards' | 'geofences';

export interface OptionsMeta {
  total: number;
  limit: number;
  truncated: boolean;
}

export function useOptions<T = any>(
  kind: OptionKind,
  params: Record<string, unknown> = {},
  opts: { enabled?: boolean; search?: string } = {}
) {
  const query = {
    ...params,
    ...(opts.search ? { search: opts.search } : {}),
  };

  const q = useQuery({
    queryKey: [`${kind}-options`, query],
    queryFn: () => get(`/api/${kind}/options`, query) as Promise<any>,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    enabled: opts.enabled ?? true,
  });

  const res: any = q.data;
  const ok = res?.success;
  const meta: OptionsMeta = ok
    ? { total: 0, limit: 0, truncated: false, ...(res.meta ?? {}) }
    : { total: 0, limit: 0, truncated: false };

  return {
    items: (ok ? (res.data ?? []) : []) as T[],
    meta,
    truncated: meta.truncated,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error:
      res && res.success === false ? String(res.message || 'Could not load the options.') : null,
    refetch: q.refetch,
  };
}
