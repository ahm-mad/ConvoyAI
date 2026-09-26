import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State of a list screen (page, page size, search, filters, sort) — the part every enterprise list
 * shares (flows/06 §2). It is persisted per `storageKey` in sessionStorage so leaving a tab or reloading
 * the page keeps the operator's place, and it always returns to page 1 when anything that changes the
 * result set (search, filter, sort, page size) changes.
 *
 * `debouncedSearch` is what queries should use, so typing doesn't fire a request per keystroke.
 */
export interface ListState {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, string>;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

const DEFAULTS: ListState = {
  page: 1,
  pageSize: 20,
  search: '',
  filters: {},
  sortBy: '',
  sortDir: 'desc',
};

const read = (key: string): Partial<ListState> => {
  try {
    const raw = sessionStorage.getItem(`list:${key}`);

    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export function useListState(storageKey: string, defaults: Partial<ListState> = {}) {
  const [state, setState] = useState<ListState>(() => ({
    ...DEFAULTS,
    ...defaults,
    ...read(storageKey),
  }));
  const [debouncedSearch, setDebouncedSearch] = useState(state.search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(`list:${storageKey}`, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode) — state simply isn't persisted */
    }
  }, [state, storageKey]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedSearch(state.search.trim()), 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.search]);

  const patch = useCallback(
    (next: Partial<ListState>, resetPage = true) =>
      setState(prev => ({ ...prev, ...next, ...(resetPage ? { page: 1 } : {}) })),
    []
  );

  return {
    state,
    storageKey,
    debouncedSearch,
    /** Replace search / filters / sort in one go (a saved view). */
    applyView: (v: Pick<ListState, 'search' | 'filters' | 'sortBy' | 'sortDir'>) => patch(v),
    setPage: (page: number) => patch({ page }, false),
    setPageSize: (pageSize: number) => patch({ pageSize }),
    setSearch: (search: string) => patch({ search }),
    setFilter: (key: string, value: string) =>
      setState(prev => ({
        ...prev,
        page: 1,
        filters: value ? { ...prev.filters, [key]: value } : omit(prev.filters, key),
      })),
    clearFilters: () => patch({ filters: {}, search: '' }),
    setSort: (sortBy: string, sortDir: 'asc' | 'desc') => patch({ sortBy, sortDir }),
    hasActiveFilters: Object.keys(state.filters).length > 0 || state.search.trim() !== '',
  };
}

const omit = (obj: Record<string, string>, key: string) => {
  const { [key]: _removed, ...rest } = obj;

  return rest;
};
