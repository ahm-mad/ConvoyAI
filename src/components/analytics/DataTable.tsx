import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
} from 'lucide-react';
import { EmptyState, Skeleton } from './states';

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numbers so digits line up. */
  align?: 'left' | 'right';
  /** Makes the column sortable; return a number / string (null sorts last). */
  sort?: (row: T) => number | string | null | undefined;
  /** Server mode: the API's sort key — the column is sortable only when this is set. */
  serverSort?: string;
  render: (row: T) => ReactNode;
  /** Plain value written to the CSV export (defaults to the sort value). */
  csv?: (row: T) => string | number | null | undefined;
  className?: string;
}

/** Server-driven mode: the parent owns the page, the sort and the search and gets ONE page of rows. */
export interface ServerControls {
  total: number;
  page: number;
  onPage: (page: number) => void;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  onSort: (sort: { key: string; dir: 'asc' | 'desc' } | null) => void;
  onQuery: (query: string) => void;
  /** A refetch is running: the previous rows stay, dimmed. */
  fetching?: boolean;
  onExport?: () => void;
  exporting?: boolean;
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);

  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Analytics table (FLEET_ANALYTICS_DESIGN.md D-6): searchable, sortable, paged, exportable, with the
 * loading / empty states designed. This version pages and sorts the rows it is GIVEN — used where the
 * endpoint returns the whole set; a server-paged variant replaces it when the backend report exists.
 */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = 'Search',
  initialSort,
  pageSize = 15,
  loading,
  empty,
  exportName,
  onRowClick,
  caption,
  server,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** What the search box matches against; omit to hide the box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  loading?: boolean;
  empty?: { title: string; hint?: string };
  /** CSV file name (without extension); omit to hide the export button. */
  exportName?: string;
  onRowClick?: (row: T) => void;
  caption: string;
  /** Server mode — `rows` is the current page only; see ServerControls. */
  server?: ServerControls;
}) {
  const [query, setQuery] = useState('');
  const [localSort, setSort] = useState(initialSort ?? null);
  const [localPage, setPage] = useState(1);
  const sort = server ? server.sort : localSort;
  const page = server ? server.page : localPage;

  // Server mode: the search is debounced so typing does not fire a request per key.
  useEffect(() => {
    if (!server) return;

    const t = setTimeout(() => server.onQuery(query.trim()), 300);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return !server && q && searchText
      ? rows.filter(r => searchText(r).toLowerCase().includes(q))
      : rows;
  }, [rows, query, searchText, server]);

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort?.key);

    if (server || !col?.sort || !sort) return filtered;

    const dir = sort.dir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const x = col.sort!(a);
      const y = col.sort!(b);

      // Empty values always last, whichever way we sort.
      if (x == null && y == null) return 0;

      if (x == null) return 1;

      if (y == null) return -1;

      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y))) * dir
      );
    });
  }, [filtered, columns, sort, server]);

  const total = server ? server.total : sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const visible = server ? sorted : sorted.slice((current - 1) * pageSize, current * pageSize);
  const goTo = (p: number) => (server ? server.onPage(p) : setPage(p));

  const toggleSort = (key: string) => {
    const next: { key: string; dir: 'asc' | 'desc' } | null =
      sort?.key === key ? (sort.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' };

    if (server) {
      server.onSort(next);
      server.onPage(1);
    } else {
      setPage(1);
      setSort(next);
    }
  };

  const exportCsv = () => {
    if (server?.onExport) return server.onExport();

    const head = columns.map(c => csvCell(c.header)).join(',');
    const body = sorted
      .map(r => columns.map(c => csvCell((c.csv ?? c.sort)?.(r))).join(','))
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([`﻿${head}\n${body}`], { type: 'text/csv;charset=utf-8' })
    );
    const a = document.createElement('a');

    a.href = url;
    a.download = `${exportName ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3">
        {searchText && (
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
            />
            <input
              type="search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (!server) setPage(1);
              }}
              className="h-8 w-[240px] bg-white border border-line rounded-xl pl-8 pr-2.5 text-xs text-ink-0 placeholder:text-ink-2 hover:border-ink-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
            />
          </div>
        )}
        <span className="text-[11.5px] text-ink-2 tabular-nums" aria-live="polite">
          {loading
            ? 'Loading…'
            : `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'}${
                query ? ` matching “${query}”` : ''
              }`}
        </span>
        {(exportName || server?.onExport) && (
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || total === 0 || server?.exporting}
            className="ml-auto inline-flex items-center gap-1.5 h-8 text-xs font-medium text-ink-1 hover:text-ink-0 border border-line rounded-md px-2.5 hover:bg-surface-2 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
          >
            <Download size={12} /> {server?.exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto border-t border-line-soft">
        <table className="w-full text-[13px] border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-2">
              {columns.map(c => {
                const active = sort?.key === c.key;

                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={`font-medium px-5 py-2.5 bg-surface-1 whitespace-nowrap ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {(server ? c.serverSort : c.sort) ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded ${
                          active ? 'text-ink-0' : ''
                        } ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {c.header}
                        <span className="w-3 inline-flex">
                          {active &&
                            (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody
            className={server?.fetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          >
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-line-soft">
                  {columns.map(c => (
                    <td key={c.key} className="px-5 py-3">
                      <Skeleton className="h-3.5 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              visible.map(r => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`border-t border-line-soft transition-colors hover:bg-surface-2/60 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map(c => (
                    <td
                      key={c.key}
                      className={`px-5 py-2.5 tabular-nums ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${c.className ?? ''}`}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && total === 0 && (
          <EmptyState
            title={empty?.title ?? 'Nothing to show'}
            hint={query ? 'No row matches your search.' : empty?.hint}
            className="py-10"
          />
        )}
      </div>

      {pages > 1 && !loading && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line-soft text-xs text-ink-1">
          <span className="tabular-nums">
            {((current - 1) * pageSize + 1).toLocaleString()}–
            {Math.min(current * pageSize, total).toLocaleString()} of {total.toLocaleString()}
          </span>
          <PageJump current={current} pages={pages} onGo={goTo} />
        </div>
      )}
    </div>
  );
}

const pagerBtn =
  'p-1.5 rounded-md border border-line hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan';

/** « ‹ Page [n] of N › » — first / previous / jump-to-page / next / last (a fleet can have hundreds of pages). */
function PageJump({
  current,
  pages,
  onGo,
}: {
  current: number;
  pages: number;
  onGo: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(current));

  useEffect(() => setDraft(String(current)), [current]);

  const commit = () => {
    const n = Math.round(Number(draft));

    if (Number.isFinite(n) && n >= 1) {
      const target = Math.min(pages, n);

      setDraft(String(target));
      onGo(target);
    } else setDraft(String(current));
  };

  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
      <button
        type="button"
        aria-label="First page"
        disabled={current <= 1}
        onClick={() => onGo(1)}
        className={pagerBtn}
      >
        <ChevronsLeft size={13} />
      </button>
      <button
        type="button"
        aria-label="Previous page"
        disabled={current <= 1}
        onClick={() => onGo(current - 1)}
        className={pagerBtn}
      >
        <ChevronLeft size={13} />
      </button>
      <span className="px-2 tabular-nums inline-flex items-center gap-1.5">
        Page
        <input
          aria-label="Page number"
          inputMode="numeric"
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && (e.currentTarget.blur(), commit())}
          style={{ width: `${Math.max(2, String(pages).length) + 1.5}ch` }}
          className="h-7 text-center bg-white border border-line rounded-xl text-xs text-ink-0 tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        />
        of {pages.toLocaleString()}
      </span>
      <button
        type="button"
        aria-label="Next page"
        disabled={current >= pages}
        onClick={() => onGo(current + 1)}
        className={pagerBtn}
      >
        <ChevronRight size={13} />
      </button>
      <button
        type="button"
        aria-label="Last page"
        disabled={current >= pages}
        onClick={() => onGo(pages)}
        className={pagerBtn}
      >
        <ChevronsRight size={13} />
      </button>
    </div>
  );
}
