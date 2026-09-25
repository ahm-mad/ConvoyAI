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
    <div className="flex items-center gap-2 flex-wrap mb-4" role="group" aria-label="Status counts">
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
            className={`flex items-center gap-2 text-[13px] font-medium rounded-full border px-4 py-2 transition-all ${
              active
                ? 'btn-brand border-transparent'
                : 'glass-strong glass-pill border-transparent text-ink-1 hover:text-ink-0'
            } ${n === 0 && !active ? 'opacity-60' : ''}`}
          >
            {o.label}
            <span
              className={`font-mono text-[11px] rounded-full px-1.5 ${active ? 'bg-white/25 text-white' : 'bg-black/[0.06] text-ink-1'}`}
            >
              {n}
            </span>
          </button>
        );
      })}
      <span className="text-[12px] text-ink-2 ml-1">
        {totalLabel} {counts.total}
      </span>
    </div>
  );
}
