import { useEffect, useRef, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import ViewSwitch from './ViewSwitch';
import type { CompareMode, Interval, RangePreset } from './useAnalyticsFilters';
import { ago } from './format';

const OPTIONS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'mtd', label: 'Month to date' },
  { key: 'custom', label: 'Custom' },
];

/**
 * One row above everything it scopes: date-range presets (segmented control), a custom range behind a popover,
 * the compare toggle, and the refresh control with an "updated … ago" stamp. Never per-chart, never inside a card.
 */
export default function FilterBar({
  preset,
  from,
  to,
  today,
  compare,
  prevLabel,
  timezone,
  onPreset,
  onCustom,
  onCompare,
  compareMode,
  onCompareMode,
  interval,
  hideCompare = false,
  onRefresh,
  fetching,
  updatedAt,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  today: string;
  compare: boolean;
  prevLabel: string;
  timezone: string;
  onPreset: (p: RangePreset) => void;
  onCustom: (from: string, to: string) => void;
  onCompare: (on: boolean) => void;
  /** With a mode handler the compare switch offers "previous period" or "same dates last year". */
  compareMode?: CompareMode;
  onCompareMode?: (m: CompareMode) => void;
  /** The "group by" control of pages with a time series: `value` null = automatic. */
  interval?: {
    value: Interval | null;
    options: Interval[];
    onChange: (i: Interval | null) => void;
  };
  /** For lists that cannot compare periods (service / fuel logs): the switch is not shown. */
  hideCompare?: boolean;
  onRefresh: () => void;
  fetching: boolean;
  updatedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const ref = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    setF(from);
    setT(to);
  }, [from, to]);

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;

    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);

    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const input =
    'bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="relative">
        <div
          role="group"
          aria-label="Date range"
          className="glass-strong inline-flex items-center gap-0.5 glass-pill p-1"
        >
          {OPTIONS.map(o => (
            <button
              key={o.key}
              type="button"
              aria-pressed={preset === o.key}
              onClick={() => {
                if (o.key === 'custom') setOpen(v => !v);
                else onPreset(o.key);
              }}
              className={`text-[13px] font-medium px-4 py-2 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                preset === o.key
                  ? 'btn-brand border border-transparent'
                  : 'text-ink-1 hover:text-ink-0 border border-transparent'
              }`}
            >
              {o.key === 'custom' && <CalendarDays size={12} className="inline -mt-0.5 mr-1.5" />}
              {o.label}
            </button>
          ))}
        </div>

        {open && (
          <div ref={ref}>
            <div className="absolute z-30 top-full left-0 mt-2 w-[300px] rounded-xl border border-line bg-surface-1 shadow-xl p-4">
              <div className="text-xs font-semibold text-ink-0 mb-3">Custom range</div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-[11px] text-ink-1">
                  From
                  <input
                    type="date"
                    className={input}
                    value={f}
                    max={t}
                    onChange={e => setF(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-ink-1">
                  To
                  <input
                    type="date"
                    className={input}
                    value={t}
                    min={f}
                    max={today}
                    onChange={e => setT(e.target.value)}
                  />
                </label>
              </div>
              <div className="text-[11px] text-ink-2 mt-2.5">
                Dates are in the company timezone ({timezone}).
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-ink-1 px-3 py-1.5 rounded-md hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!f || !t || f > t}
                  onClick={() => {
                    onCustom(f, t);
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-white bg-accent-cyan rounded-md px-3 py-1.5 disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!hideCompare && (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-ink-1">
          <button
            type="button"
            role="switch"
            aria-checked={compare}
            onClick={() => onCompare(!compare)}
            className={`relative w-8 h-[18px] rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
              compare ? 'bg-accent-cyan' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
                compare ? 'translate-x-[14px]' : ''
              }`}
            />
          </button>
          Compare {!onCompareMode && <span className="text-ink-2">{compare ? prevLabel : ''}</span>}
        </label>
      )}
      {!hideCompare && compare && onCompareMode && compareMode && (
        <span title={prevLabel}>
          <ViewSwitch
            label="Compare against"
            value={compareMode}
            onChange={onCompareMode}
            options={[
              { key: 'period', label: 'Prior period' },
              { key: 'year', label: 'Last year' },
            ]}
          />
        </span>
      )}

      {interval && interval.options.length > 1 && (
        <div className="inline-flex items-center gap-2 text-xs text-ink-1">
          Group by
          <ViewSwitch
            label="Group by"
            value={interval.value ?? 'auto'}
            onChange={v => interval.onChange(v === 'auto' ? null : (v as Interval))}
            options={[
              { key: 'auto', label: 'Auto' },
              ...interval.options.map(i => ({
                key: i,
                label: i === 'day' ? 'Day' : i === 'week' ? 'Week' : 'Month',
              })),
            ]}
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-3 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-[#0ca30c] opacity-60 animate-ping" />
            <span className="relative w-2 h-2 rounded-full bg-[#0ca30c]" />
          </span>
          {updatedAt ? `Updated ${ago(updatedAt)}` : 'Live'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-1 hover:text-ink-0 border border-line rounded-md px-2.5 py-1.5 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
    </div>
  );
}
