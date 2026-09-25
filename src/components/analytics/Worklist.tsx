import { useState, type ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, ChevronRight, CheckCircle2, Info } from 'lucide-react';
import { STATUS } from './theme';
import { ago, isNum } from './format';
import { token } from '@lib/design/tokens';

export type Severity = 'critical' | 'warning' | 'info';

export interface WorkItem {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  entity?: string;
  since?: string | null;
  onClick?: () => void;
}

const META: Record<Severity, { label: string; color: string; Icon: typeof Info }> = {
  critical: { label: 'Critical', color: STATUS.critical, Icon: AlertOctagon },
  warning: { label: 'Warning', color: STATUS.warning, Icon: AlertTriangle },
  info: { label: 'Info', color: token('--color-brand'), Icon: Info },
};

/**
 * The prioritised "what needs me now" list (not a chart): severity icon + label (never colour alone), what
 * and which entity, how long, one click to the record. Sorted critical → warning → info, then age.
 */
export default function Worklist({
  items,
  total,
  filter,
  onFilter,
  onViewAll,
  emptyTitle = 'Nothing needs attention',
  emptyHint = 'No open alarms, expiring paperwork or overdue work right now.',
  limit = 8,
  serverCounts,
  totalMatching,
}: {
  items: WorkItem[];
  total: number;
  filter: Severity | 'all';
  onFilter: (s: Severity | 'all') => void;
  onViewAll?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  limit?: number;
  /** Real totals when `items` is only the first page of a server feed (chips must not count the page). */
  serverCounts?: { critical: number; warning: number; info: number };
  /** Server total of the current filter; when larger than `items`, a "most urgent N of M" note is shown. */
  totalMatching?: number;
}) {
  const counts = (['critical', 'warning', 'info'] as Severity[]).map(s => ({
    s,
    n: serverCounts ? serverCounts[s] : items.filter(i => i.severity === s).length,
  }));
  const allCount = serverCounts
    ? serverCounts.critical + serverCounts.warning + serverCounts.info
    : items.length;
  const [expanded, setExpanded] = useState(false);
  const matching = items.filter(i => filter === 'all' || i.severity === filter);
  const shown = expanded ? matching : matching.slice(0, limit);

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 mb-3"
        role="group"
        aria-label="Filter by severity"
      >
        <Chip active={filter === 'all'} onClick={() => onFilter('all')}>
          All <b className="tabular-nums">{allCount.toLocaleString()}</b>
        </Chip>
        {counts.map(({ s, n }) => {
          const m = META[s];

          return (
            <Chip key={s} active={filter === s} onClick={() => onFilter(s)}>
              <m.Icon size={12} style={{ color: m.color }} /> {m.label}{' '}
              <b className="tabular-nums">{n.toLocaleString()}</b>
            </Chip>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 gap-1.5">
          <CheckCircle2 size={22} style={{ color: STATUS.good }} />
          <div className="text-[13px] font-medium text-ink-0">{emptyTitle}</div>
          <div className="text-xs text-ink-1 max-w-[260px]">{emptyHint}</div>
        </div>
      ) : (
        <ul className="-mx-2">
          {shown.map(i => {
            const m = META[i.severity];
            const row = (
              <>
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${m.color}1f` }}
                >
                  <m.Icon size={15} style={{ color: m.color }} aria-label={m.label} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink-0 truncate">{i.title}</span>
                  <span className="block text-[11.5px] text-ink-2 truncate">
                    {i.kind}
                    {i.entity ? ` · ${i.entity}` : ''}
                  </span>
                </span>
                {i.since && <span className="text-[11px] text-ink-2 shrink-0">{ago(i.since)}</span>}
                <ChevronRight size={14} className="text-ink-2 shrink-0" />
              </>
            );

            return (
              <li key={i.id}>
                {i.onClick ? (
                  <button
                    type="button"
                    onClick={i.onClick}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {matching.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs font-medium text-accent-cyan hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan rounded"
        >
          {expanded ? 'Show fewer' : `Show all ${matching.length}`}
        </button>
      )}
      {isNum(totalMatching) && totalMatching > matching.length && (
        <p className="mt-2 text-[11.5px] text-ink-2">
          Showing the {matching.length.toLocaleString()} most urgent of{' '}
          {totalMatching.toLocaleString()}. Narrow it with the filters above.
        </p>
      )}
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 ml-4 text-xs font-medium text-ink-1 hover:text-ink-0"
        >
          Open alarms
        </button>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[11.5px] rounded-full border px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
        active
          ? 'border-accent-cyan text-ink-0 bg-accent-cyan/10'
          : 'border-line-soft text-ink-1 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
