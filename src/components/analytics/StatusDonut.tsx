import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { int, pct } from './format';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  hint?: string;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;

  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);

  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
};

/**
 * Part-to-whole of ≤ 6 exclusive states: a thin ring with the total in the centre, a 2 px surface gap
 * between arcs, and a legend that is also the drill-down (each row is a button). Hovering a slice or a
 * legend row lifts the arc and shows its count + share in the centre; every value is also in the legend.
 */
export default function StatusDonut({
  slices,
  total,
  centerLabel = 'vehicles',
  surface,
  onSelect,
  canSelect,
  valueFormat = int,
  stacked = false,
  size = 168,
}: {
  slices: DonutSlice[];
  total: number;
  centerLabel?: string;
  surface: string;
  onSelect?: (key: string) => void;
  /** Slices without a drill-down target render as plain rows (not buttons). Default: all selectable. */
  canSelect?: (key: string) => boolean;
  /** How counts are printed (money for a cost donut). */
  valueFormat?: (n: number) => string;
  /** Legend under the ring (narrow cards) instead of beside it. */
  stacked?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // Legend beside the ring only when there is room for the longest label ("No tracker"); otherwise under it.
  const rootRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const el = rootRef.current;

    if (!el) return;

    const fit = () => setNarrow(el.getBoundingClientRect().width < size + 250);

    fit();

    const ro = new ResizeObserver(fit);

    ro.observe(el);

    return () => ro.disconnect();
  }, [size]);
  const under = stacked || narrow;
  const cx = size / 2;
  const r = size / 2 - 14;
  const stroke = 18;
  const gap = 3; // degrees ≈ 2 px at this radius

  const arcs = useMemo(() => {
    const positive = slices.filter(s => s.value > 0);
    const sum = positive.reduce((a, s) => a + s.value, 0) || 1;
    let angle = 0;

    return positive.map(s => {
      const sweep = (s.value / sum) * 360;
      const from = angle + (positive.length > 1 ? gap / 2 : 0);
      const to = angle + sweep - (positive.length > 1 ? gap / 2 : 0);

      angle += sweep;

      // An SVG arc whose start and end coincide draws nothing, so a lone (100 %) slice stops just short of a
      // full turn; slivers get a minimum visible sweep.
      const end = Math.min(from + 359.99, Math.max(to, from + 0.6));

      return { s, d: arc(cx, cx, r, from, end) };
    });
  }, [slices, cx, r]);

  const active = slices.find(s => s.key === hover) ?? null;
  const summary = slices.map(s => `${s.label} ${s.value}`).join(', ');

  return (
    <div
      ref={rootRef}
      className={`flex items-center gap-5 ${under ? 'flex-col' : 'flex-row gap-6'}`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Fleet status: ${summary}. Total ${total}.`}
        >
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={surface} strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={stroke}
            className="text-ink-0"
          />
          {arcs.map(({ s, d }) => (
            <path
              key={s.key}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.key ? stroke + 4 : stroke}
              strokeLinecap="butt"
              opacity={hover && hover !== s.key ? 0.35 : 1}
              style={{
                transition: 'stroke-width 120ms, opacity 120ms',
                cursor: onSelect && (canSelect?.(s.key) ?? true) ? 'pointer' : 'default',
              }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => (canSelect?.(s.key) ?? true) && onSelect?.(s.key)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          <div className="kpi-value">{valueFormat(active ? active.value : total)}</div>
          <div className="text-[11px] text-ink-1 mt-0.5 truncate max-w-full">
            {active
              ? `${active.label} · ${pct(total ? (active.value / total) * 100 : 0, 0)}`
              : centerLabel}
          </div>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {slices.map(s => {
          const interactive = !!onSelect && (canSelect?.(s.key) ?? true);
          const Row = interactive ? 'button' : 'div';

          return (
            <li key={s.key}>
              <Row
                {...(interactive
                  ? { type: 'button' as const, onClick: () => onSelect?.(s.key) }
                  : {})}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
                className={`w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                  hover === s.key ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
              >
                {/* A class with nothing in it is de-emphasised through its swatch and text colour, never through
                  opacity on the row — dimmed text falls below WCAG AA. */}
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.value === 0 ? 'opacity-40' : ''}`}
                  style={{ background: s.color }}
                />
                <span
                  className={`text-[13px] flex-1 min-w-0 truncate ${s.value === 0 ? 'text-ink-1' : 'text-ink-0'}`}
                >
                  {s.label}
                </span>
                <span
                  className={`text-[13px] font-semibold tabular-nums ${s.value === 0 ? 'text-ink-1' : 'text-ink-0'}`}
                >
                  {valueFormat(s.value)}
                </span>
                <span className="text-[11px] text-ink-2 w-9 text-right tabular-nums">
                  {total ? pct((s.value / total) * 100, 0) : '—'}
                </span>
              </Row>
              {s.hint && hover === s.key && (
                <div className="px-2 pb-1 text-[11px] text-ink-2 leading-snug">{s.hint}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
