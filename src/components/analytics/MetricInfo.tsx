import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * "How is this calculated?" popover (glossary, FLEET_ANALYTICS_DESIGN.md §5): the definition, the data
 * basis and coverage of a metric. Keyboard operable, closes on Esc / outside click.
 */
export default function MetricInfo({
  title,
  definition,
  basis,
  className = '',
}: {
  title: string;
  definition: string;
  basis?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`How ${title} is calculated`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="text-ink-2 hover:text-ink-0 rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
      >
        <Info size={13} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${title} definition`}
          className="absolute z-30 top-full right-0 mt-1.5 w-[260px] rounded-lg border border-line bg-surface-1 shadow-xl p-3 text-left"
        >
          <div className="text-xs font-semibold text-ink-0 mb-1">{title}</div>
          <p className="text-[11.5px] leading-relaxed text-ink-1">{definition}</p>
          {basis && (
            <p className="mt-2 pt-2 border-t border-line-soft text-[11px] leading-relaxed text-ink-2">
              {basis}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
