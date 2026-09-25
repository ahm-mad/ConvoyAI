import type { ReactNode } from 'react';

export interface BucketSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal stacked bar per row (maintenance / compliance buckets): thin 10 px bars, a 2 px surface gap
 * between segments, segment counts as text beside the bar (never squeezed inside), and a legend row above.
 * Each row is a button when it drills into a list.
 */
export function BucketBars({
  rows,
  legend,
  surface,
}: {
  rows: {
    key: string;
    label: string;
    segments: BucketSegment[];
    onClick?: () => void;
    note?: ReactNode;
  }[];
  legend: { key: string; label: string; color: string }[];
  surface: string;
}) {
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3" aria-label="Legend">
        {legend.map(l => (
          <li key={l.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-1">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: l.color }} />
            {l.label}
          </li>
        ))}
      </ul>
      <ul className="space-y-1">
        {rows.map(r => {
          const total = r.segments.reduce((a, s) => a + s.value, 0);
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-[13px] text-ink-0 font-medium truncate">{r.label}</span>
                <span className="text-[11.5px] text-ink-2 tabular-nums shrink-0">
                  {total.toLocaleString()} total
                </span>
              </div>
              <div
                className="flex h-2.5 rounded-full overflow-hidden bg-surface-2"
                role="img"
                aria-label={`${r.label}: ${r.segments.map(s => `${s.value} ${s.label}`).join(', ')}`}
              >
                {total > 0 &&
                  r.segments
                    .filter(s => s.value > 0)
                    .map((s, i, arr) => (
                      <span
                        key={s.key}
                        title={`${s.label}: ${s.value}`}
                        style={{
                          width: `${(s.value / total) * 100}%`,
                          background: s.color,
                          marginRight: i < arr.length - 1 ? 2 : 0,
                          boxShadow: `0 0 0 0 ${surface}`,
                        }}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                      />
                    ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-2 tabular-nums">
                {r.segments
                  .filter(seg => seg.value > 0)
                  .map(seg => (
                    <span key={seg.key} className="inline-flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: seg.color }}
                      />
                      {seg.value.toLocaleString()} {seg.label.toLowerCase()}
                    </span>
                  ))}
                {total === 0 && <span>Nothing scheduled</span>}
                {r.note && <span className="ml-auto">{r.note}</span>}
              </div>
            </>
          );

          return (
            <li key={r.key}>
              {r.onClick ? (
                <button
                  type="button"
                  onClick={r.onClick}
                  className="w-full text-left rounded-lg px-2 py-2 -mx-2 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
                >
                  {inner}
                </button>
              ) : (
                <div className="px-0 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Ranked horizontal bars: one colour for one nominal series (never a value ramp), the value at the bar's tip,
 * the name in text ink, thin 8 px bars with a 4 px rounded end.
 */
export function RankBars({
  rows,
  color,
  format,
  max,
  onSelect,
  emptyHint,
  numbered = true,
}: {
  rows: {
    key: string;
    label: string;
    sublabel?: string;
    value: number | null;
    /** Overrides `color` for this row (colour follows the entity, e.g. a delay class). */
    color?: string;
  }[];
  color: string;
  format: (v: number) => string;
  max?: number;
  onSelect?: (key: string) => void;
  emptyHint?: string;
  /** Rank numbers before the labels (off for ordered classes such as histograms). */
  numbered?: boolean;
}) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value ?? 0));

  if (rows.length === 0) {
    return (
      <div className="text-xs text-ink-2 py-6 text-center">
        {emptyHint ?? 'Nothing to rank yet.'}
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const w = !r.value ? 0 : Math.max(1.5, (r.value / top) * 100); // zero / empty = no bar
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[13px] text-ink-0 truncate">
                {numbered && (
                  <span className="text-ink-2 tabular-nums w-4 inline-block">{i + 1}</span>
                )}
                {r.label}
                {r.sublabel && (
                  <span className="text-ink-2 ml-1.5 text-[11.5px]">{r.sublabel}</span>
                )}
              </span>
              <span className="text-[13px] font-semibold text-ink-0 tabular-nums shrink-0">
                {r.value == null ? '—' : format(r.value)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-r-[4px] rounded-l-none transition-[width] duration-300"
                style={{ width: `${w}%`, background: r.color ?? color }}
              />
            </div>
          </>
        );

        return (
          <li key={r.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.key)}
                className="w-full text-left rounded-md hover:bg-surface-2 -mx-2 px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
