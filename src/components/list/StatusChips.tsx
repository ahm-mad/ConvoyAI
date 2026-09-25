import type { StatusCounts } from '@hooks/useStatusCounts';

/**
 * Status filter chips with live counts ("Planned 4 · In progress 2 …"). A chip is a shortcut for the
 * list's Status filter: click to filter, click the active chip again to clear. The counts come from the
 * backend's `/counts` endpoints and honour the other filters + search but never the status itself.
 */
export default function StatusChips({
  counts,
  options,
  value,
  onChange,
  totalLabel = 'Total',
}: {
  counts: StatusCounts | null;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  totalLabel?: string;
}) {
  if (!counts) return null;

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap mb-3"
      role="group"
      aria-label="Status counts"
    >
      {options.map(o => {
        const active = value === o.value;
        const n = counts.by_status[o.value] ?? 0;

        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? '' : o.value)}
            aria-pressed={active}
            data-testid={`status-chip-${o.value}`}
            className={`flex items-center gap-1.5 text-[11px] rounded-full border px-2.5 py-1 transition-colors ${
              active
                ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10'
                : 'border-line text-ink-1 hover:bg-surface-2'
            } ${n === 0 && !active ? 'opacity-60' : ''}`}
          >
            {o.label}
            <span className="font-mono text-[10px] text-ink-2">{n}</span>
          </button>
        );
      })}
      <span className="text-[10px] text-ink-2 ml-1">
        {totalLabel} {counts.total}
      </span>
    </div>
  );
}
