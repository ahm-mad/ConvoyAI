import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { get } from '../utils/apiHelper';
import type { ApiResult } from '../types/api';

export const useSimpleQuery = <TData = ApiResult>(
  // Most callers pass a plain string; a few pass a composed array key.
  key: string | readonly unknown[],
  // Callers pass `null` for a conditionally-disabled query (paired with
  // `{ enabled: !!x }`), so the queryFn never runs with a null url.
  url: string | null | undefined,
  params: Record<string, unknown> = {},
  options: Partial<UseQueryOptions<TData>> = {}
) =>
  useQuery<TData>({
    queryKey: [key, params],
    queryFn: () => get(url as string, params) as Promise<TData>,
    networkMode: 'always',
    ...options,
  });
