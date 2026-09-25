/**
 * A small segmented control for switching between views of one page (e.g. Schedules · Service history).
 * Same look as the Fleet section switch; a radio group for assistive tech.
 */
export default function ViewSwitch<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 bg-surface-2 border border-line-soft rounded-lg p-0.5 self-start"
    >
      {options.map(o => {
        const on = o.key === value;

        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
              on
                ? 'btn-brand border border-transparent'
                : 'text-ink-1 hover:text-ink-0 border border-transparent'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
