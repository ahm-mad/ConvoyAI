// src/hooks/usePaginatedQuery.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { get } from '../utils/apiHelper';
import type { ApiResult } from '../types/api';

interface UsePaginatedQueryArgs<TData> {
  key: string;
  url: string;
  currentPage: number;
  limit: number;
  search?: string;
  enabled?: boolean;
  otherParams?: Record<string, unknown>;
  options?: Partial<UseQueryOptions<TData>>;
}

export const usePaginatedQuery = <TData = ApiResult>({
  key,
  url,
  currentPage,
  limit,
  search = '',
  enabled = true,
  otherParams = {},
  options = {},
}: UsePaginatedQueryArgs<TData>) => {
  const offset = (currentPage - 1) * limit;
  const params = {
    limit,
    offset,
    search,
    ...otherParams,
  };

  return useQuery<TData>({
    queryKey: [key, currentPage, limit, search, otherParams],
    queryFn: () => get(url, params) as Promise<TData>,
    enabled,
    networkMode: 'always',
    // keepPreviousData was removed in react-query v5 (placeholderData: keepPreviousData);
    // left here as a harmless no-op to preserve the original call surface.
    keepPreviousData: true,
    ...options,
  } as UseQueryOptions<TData>);
};
