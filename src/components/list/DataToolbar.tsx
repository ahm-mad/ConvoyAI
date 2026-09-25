import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface FilterDef {
  key: string;
  label: string;
  /** 'select' (default) needs `options`; 'date' renders a date input. */
  type?: 'select' | 'date';
  options?: { value: string; label: string }[];
}

export interface SortOption {
  value: string;
  label: string;
}

const CONTROL =
  'bg-surface-2 border border-line rounded-md px-2 py-1.5 text-[11px] text-ink-0 max-w-[170px]';

/**
 * Search + filters + sort + actions row shared by every enterprise list (flows/06 §2). Purely
 * presentational: the owning screen holds the state (useListState) and does the querying.
 */
export default function DataToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters = [],
  values,
  onFilter,
  onClear,
  hasActive,
  sortOptions,
  sortBy,
  sortDir,
  onSort,
  summary,
  actions,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  values: Record<string, string>;
  onFilter: (key: string, value: string) => void;
  onClear: () => void;
  hasActive: boolean;
  sortOptions?: SortOption[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (by: string, dir: 'asc' | 'desc') => void;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className="bg-surface-2 border border-line rounded-md pl-7 pr-2 py-1.5 text-[11px] text-ink-0 w-56"
          />
        </div>

        {filters.map(f =>
          f.type === 'date' ? (
            <label key={f.key} className="flex items-center gap-1 text-[10px] text-ink-2">
              {f.label}
              <input
                type="date"
                value={values[f.key] ?? ''}
                onChange={e => onFilter(f.key, e.target.value)}
                className={CONTROL}
              />
            </label>
          ) : (
            <select
              key={f.key}
              value={values[f.key] ?? ''}
              onChange={e => onFilter(f.key, e.target.value)}
              aria-label={f.label}
              className={CONTROL}
            >
              <option value="">{f.label}: all</option>
              {(f.options ?? []).map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        )}

        {sortOptions && onSort && (
          <div className="flex items-center gap-1">
            <select
              value={sortBy ?? ''}
              onChange={e => onSort(e.target.value, sortDir ?? 'desc')}
              aria-label="Sort by"
              className={CONTROL}
            >
              <option value="">Sort: default</option>
              {sortOptions.map(o => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
            {sortBy && (
              <button
                type="button"
                onClick={() => onSort(sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
                className="text-[11px] text-ink-1 border border-line rounded px-2 py-1.5 hover:bg-surface-2"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            )}
          </div>
        )}

        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-ink-2 hover:text-ink-0"
          >
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {(summary || actions) && (
        <div className="flex items-center justify-between mt-2 text-[11px] text-ink-2">
          <div>{summary}</div>
          <div className="flex items-center gap-3">{actions}</div>
        </div>
      )}
    </div>
  );
}
