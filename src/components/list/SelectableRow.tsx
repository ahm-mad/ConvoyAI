import type { ReactNode } from 'react';

/** Puts a selection checkbox beside a list row without nesting inputs inside the row's button. */
export default function SelectableRow({
  selected,
  onToggle,
  label,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${label}`}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
