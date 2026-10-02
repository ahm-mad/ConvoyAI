import type { StatusCounts } from '@hooks/useStatusCounts';

/**
 * Status filter chips with live counts ("Planned 4 · In progress 2 …"). A chip is a shortcut for the
 * list's Status filter: click to filter, click the active chip again to clear. The counts come from the
 * backend's `/counts` endpoints and honour the other filters + search but never the status itself.
 *
 * `multiple` (opt-in, default off so every other screen's single-select behaviour is unchanged): the
 * filter value becomes a comma-separated set (matching the backend's own `status=a,b` multi-value
 * contract) and each chip toggles independently in/out of it, instead of replacing the whole value.
 */
export default function StatusChips({
  counts,
  options,
  value,
  onChange,
  totalLabel = 'Total',
  multiple = false,
}: {
  counts: StatusCounts | null;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  totalLabel?: string;
  multiple?: boolean;
}) {
  if (!counts) return null;

  const selected = multiple ? (value ? value.split(',') : []) : [];

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4" role="group" aria-label="Status counts">
      {options.map(o => {
        const active = multiple ? selected.includes(o.value) : value === o.value;
        const n = counts.by_status[o.value] ?? 0;

        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              if (!multiple) {
                onChange(active ? '' : o.value);

                return;
              }

              const next = active ? selected.filter(s => s !== o.value) : [...selected, o.value];

              onChange(next.join(','));
            }}
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
      {multiple && selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[12px] text-ink-2 hover:text-ink-0 underline"
        >
          Clear
        </button>
      )}
      <span className="text-[12px] text-ink-2 ml-1">
        {totalLabel} {counts.total}
      </span>
    </div>
  );
}
