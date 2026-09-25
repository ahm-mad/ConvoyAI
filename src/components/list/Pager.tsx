/** Pager for any list: "21–40 of 137", previous/next, page numbers with ellipsis, page-size choice. */
export default function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes = [20, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: number[];
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // 1 … 4 5 [6] 7 8 … 20
  const pages: (number | '…')[] = [];

  for (let p = 1; p <= lastPage; p++) {
    if (p === 1 || p === lastPage || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  const btn =
    'min-w-[26px] h-[26px] px-1.5 text-[11px] rounded border border-line text-ink-1 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-4 text-[11px] text-ink-2">
      <span>{total === 0 ? 'No results' : `${from}–${to} of ${total}`}</span>

      <div className="flex items-center gap-1">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`${btn} ${p === page ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/40' : ''}`}
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}
        <button className={btn} disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          Next ›
        </button>
      </div>

      {onPageSize && (
        <label className="flex items-center gap-1.5">
          Per page
          <select
            value={pageSize}
            onChange={e => onPageSize(Number(e.target.value))}
            className="bg-surface-2 border border-line rounded px-1.5 py-1 text-[11px] text-ink-0"
          >
            {pageSizes.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
