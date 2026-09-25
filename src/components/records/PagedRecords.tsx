/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useListState } from '@hooks/useListState';
import Pager from '@components/list/Pager';
import { X } from 'lucide-react';

/**
 * A paged, filterable list of a record type inside a detail modal (backend B9, flows/06 §15.6): always
 * `{ items, pagination }`, 10 per page here, date range (`date_from` / `date_to`), optional search and
 * extra select filters, and the same filters/page kept while you edit rows. The query name MUST start
 * with a fleet prefix (`vehicle…`, `driver…`) so realtime / `invalidateFleetQueries` refresh it.
 */
export interface ExtraFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

const CONTROL = 'control max-w-[190px]';

export default function PagedRecords({
  queryName,
  url,
  storageKey,
  render,
  emptyText,
  searchPlaceholder,
  extraFilters = [],
  fixedParams = {},
}: {
  queryName: string;
  url: string;
  storageKey: string;
  render: (item: any, refetch: () => void) => ReactNode;
  emptyText: string;
  /** Show a search box (server-side `search`). */
  searchPlaceholder?: string;
  extraFilters?: ExtraFilter[];
  fixedParams?: Record<string, unknown>;
}) {
  const list = useListState(storageKey, { pageSize: 10 });
  const { state } = list;
  const f = state.filters;

  const params: Record<string, unknown> = {
    ...fixedParams,
    page: state.page,
    per_page: state.pageSize,
    ...(list.debouncedSearch ? { search: list.debouncedSearch } : {}),
    ...(f.date_from ? { date_from: f.date_from } : {}),
    ...(f.date_to ? { date_to: f.date_to } : {}),
    ...Object.fromEntries(extraFilters.filter(x => f[x.key]).map(x => [x.key, f[x.key]])),
  };

  const { data, isLoading, isFetching, refetch } = useSimpleQuery(queryName, url, params, {
    placeholderData: keepPreviousData,
  });

  const res: any = data;
  const failed = res && res.success === false;
  const items: any[] = res?.success ? (res.data?.items ?? []) : [];
  const total: number = res?.success ? (res.data?.pagination?.total ?? 0) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {searchPlaceholder && (
          <input
            value={state.search}
            onChange={e => list.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className={`${CONTROL} w-40`}
          />
        )}
        {extraFilters.map(x => (
          <select
            key={x.key}
            value={f[x.key] ?? ''}
            onChange={e => list.setFilter(x.key, e.target.value)}
            aria-label={x.label}
            className={CONTROL}
          >
            <option value="">{x.label}: all</option>
            {x.options.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <label className="flex items-center gap-1 text-[10px] text-ink-2">
          From
          <input
            type="date"
            value={f.date_from ?? ''}
            onChange={e => list.setFilter('date_from', e.target.value)}
            className={CONTROL}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-ink-2">
          To
          <input
            type="date"
            value={f.date_to ?? ''}
            onChange={e => list.setFilter('date_to', e.target.value)}
            className={CONTROL}
          />
        </label>
        {list.hasActiveFilters && (
          <button
            type="button"
            onClick={list.clearFilters}
            className="flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-0"
          >
            <X size={11} /> Clear
          </button>
        )}
        {isFetching && !isLoading && <span className="text-[10px] text-ink-2">Updating…</span>}
      </div>

      {isLoading && <div className="text-xs text-ink-2 text-center py-6">Loading…</div>}

      {failed && (
        <div className="text-xs text-danger bg-danger/10 rounded-md px-3 py-2 flex items-center justify-between mb-2">
          <span>{res.message || 'Could not load the list.'}</span>
          <button type="button" onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !failed && items.length === 0 && (
        <div className="text-[11px] text-ink-2 italic mb-3">
          {list.hasActiveFilters ? 'Nothing matches these filters.' : emptyText}
        </div>
      )}

      {items.map(item => render(item, refetch))}

      {total > 0 && (
        <Pager
          page={state.page}
          pageSize={state.pageSize}
          total={total}
          onPage={list.setPage}
          onPageSize={list.setPageSize}
          pageSizes={[10, 20, 50]}
        />
      )}
    </div>
  );
}
