import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Numbered pager (replaces MUI Pagination). `onChange(event, page)` keeps the MUI call signature. */
export default function Pagination({
  count,
  page,
  onChange,
  className = '',
}: {
  count: number;
  page: number;
  onChange: (event: unknown, page: number) => void;
  className?: string;
}) {
  if (count <= 1) return null;

  const window = 1;
  const pages: (number | '…')[] = [];

  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || Math.abs(p - page) <= window) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  const base =
    'grid h-9 min-w-9 place-items-center rounded-full px-2 text-control font-medium transition-colors';

  return (
    <nav aria-label="Pagination" className={`flex items-center justify-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={e => onChange(e, page - 1)}
        className={`${base} text-ink-1 hover:bg-black/[0.06] disabled:opacity-40`}
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-ink-2">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            onClick={e => onChange(e, p)}
            className={`${base} ${p === page ? 'btn-brand' : 'text-ink-1 hover:bg-black/[0.06]'}`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= count}
        onClick={e => onChange(e, page + 1)}
        className={`${base} text-ink-1 hover:bg-black/[0.06] disabled:opacity-40`}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
