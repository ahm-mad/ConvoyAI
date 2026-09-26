import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import MetricInfo from './MetricInfo';
import Reveal from '@components/motion/Reveal';
import { EmptyState, ErrorState, Skeleton } from './states';

export interface TwinTable {
  columns: string[];
  rows: (string | number | null)[][];
}

/**
 * The frame every analytics widget lives in: title + subtitle, definition popover, "sample data" chip,
 * chart ⇄ table toggle (every chart has a table twin — tooltips never gate a value), and the designed
 * states — first load (skeleton), refetch (previous render held at reduced opacity, no layout jump),
 * error (retry), empty (helpful next step).
 */
export default function WidgetCard({
  title,
  subtitle,
  info,
  sample,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  table,
  right,
  footer,
  skeletonHeight = 160,
  centerBody,
  className = '',
  bodyClassName = '',
  children,
}: {
  title: string;
  subtitle?: string;
  info?: { title?: string; definition: string; basis?: string };
  /** Shown as a small chip while the widget still runs on illustrative data. */
  sample?: boolean;
  loading?: boolean;
  fetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; hint?: string; action?: ReactNode } | null;
  table?: TwinTable;
  right?: ReactNode;
  footer?: ReactNode;
  skeletonHeight?: number;
  /** Centre the content vertically when the card is stretched to a taller neighbour. */
  centerBody?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);

  return (
    <Reveal
      as="section"
      label={title}
      className={`glass spotlight flex flex-col min-w-0  ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="card-title truncate">{title}</h2>
            {info && <MetricInfo title={info.title ?? title} {...info} />}
            {sample && (
              <span
                title="This widget shows illustrative data until its backend endpoint is available"
                className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium text-ink-1 bg-surface-2 border border-line-soft rounded-full px-1.5 py-px"
              >
                <span className="w-1 h-1 rounded-full bg-ink-2" /> Sample data
              </span>
            )}
          </div>
          {subtitle && <p className="text-[12.5px] text-ink-2 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {right}
          {table && !loading && !error && !empty && (
            <button
              type="button"
              onClick={() => setAsTable(v => !v)}
              aria-pressed={asTable}
              aria-label={asTable ? 'Show chart' : 'View as table'}
              title={asTable ? 'Show chart' : 'View as table'}
              className="text-ink-2 hover:text-ink-0 hover:bg-surface-2 rounded-md p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
            >
              {asTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
            </button>
          )}
        </div>
      </header>

      <div className={`px-6 pb-5 pt-3.5 flex-1 min-h-0 flex flex-col ${bodyClassName}`}>
        {loading ? (
          <div className="space-y-2.5" style={{ minHeight: skeletonHeight }}>
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="w-full" style={{ height: Math.max(40, skeletonHeight - 32) }} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState {...empty} />
        ) : (
          <div
            className={`transition-opacity duration-200 ${fetching ? 'opacity-60' : 'opacity-100'} ${
              centerBody ? 'flex-1 flex flex-col justify-center' : ''
            }`}
            aria-busy={fetching || undefined}
          >
            {asTable && table ? <TwinTableView table={table} /> : children}
          </div>
        )}
      </div>

      {footer && <footer className="px-6 pb-5 -mt-1">{footer}</footer>}
    </Reveal>
  );
}

function TwinTableView({ table }: { table: TwinTable }) {
  return (
    <div className="overflow-x-auto max-h-[260px] overflow-y-auto rounded-lg border border-line-soft">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {table.columns.map(c => (
              <th key={c} className="px-3 py-2 font-medium text-ink-1 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-t border-line-soft">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 text-ink-0 whitespace-nowrap ${j > 0 ? 'tabular-nums' : ''}`}
                >
                  {cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
