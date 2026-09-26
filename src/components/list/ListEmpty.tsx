import type { LucideIcon } from 'lucide-react';
import { Plus, SearchX } from 'lucide-react';

/** Empty state for a fleet list: filtered-out vs genuinely empty, with the next step one click away. */
export default function ListEmpty({
  noun,
  icon: Icon,
  filtered,
  onClear,
  hint,
  addLabel,
  onAdd,
}: {
  /** Plural noun, e.g. "vehicles". */
  noun: string;
  icon: LucideIcon;
  filtered: boolean;
  onClear: () => void;
  /** What to do next when the list is genuinely empty. */
  hint: string;
  addLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="glass flex flex-col items-center px-6 py-14 text-center">
      <div className="empty-orb mb-3">{filtered ? <SearchX size={20} /> : <Icon size={20} />}</div>
      <div className="card-title">{filtered ? `No ${noun} match` : `No ${noun} yet`}</div>
      <p className="mt-1 max-w-md text-sm text-ink-2">
        {filtered ? 'Nothing fits your search or filters. Try loosening them.' : hint}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {filtered ? (
          <button
            type="button"
            onClick={onClear}
            className="btn-soft rounded-full px-4 py-2 text-xs font-medium"
          >
            Clear search and filters
          </button>
        ) : (
          onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="btn-brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
            >
              <Plus size={13} /> {addLabel ?? 'Add'}
            </button>
          )
        )}
      </div>
    </div>
  );
}
