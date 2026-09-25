import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import MetricInfo from './MetricInfo';
import { Skeleton } from './states';
import { useVizColors } from './theme';
import CountUp from '@components/ui/CountUp';

/** Whether a rising value is good, bad, or neither — decides the delta's polarity colour. */
export type Polarity = 'up-good' | 'down-good' | 'neutral';

const NEUTRAL_BAND = 2; // |Δ| below this many percent reads as "no real change"

export function DeltaChip({
  pct,
  polarity,
  label,
}: {
  pct: number | null;
  polarity: Polarity;
  label?: string;
}) {
  const c = useVizColors();

  if (pct === null) {
    return <span className="text-[11px] text-ink-2">No earlier data to compare</span>;
  }

  const flat = Math.abs(pct) < NEUTRAL_BAND;
  const up = pct > 0;
  const good = polarity === 'neutral' || flat ? null : polarity === 'up-good' ? up : !up;
  const tone = flat || good === null ? c.neutral : good ? '#2e9e5b' : '#e0523f';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const sign = flat ? '' : up ? '+' : '−';

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span
        className="inline-flex items-center gap-0.5 rounded-full pl-1 pr-1.5 py-0.5 text-[11px] font-semibold text-ink-0 whitespace-nowrap"
        style={{ background: `${tone}1f` }}
        aria-label={`${sign}${Math.abs(pct).toFixed(1)} percent${label ? ` ${label}` : ''}`}
      >
        <Icon size={13} style={{ color: tone }} strokeWidth={2.5} />
        {flat ? 'No change' : `${sign}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`}
      </span>
      {label && <span className="text-[11px] text-ink-2">{label}</span>}
    </span>
  );
}

/** 12-point sparkline: the history in the de-emphasis grey, the latest point in the accent with a surface ring. */
export function Sparkline({
  values,
  width = 120,
  height = 44,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
}) {
  const c = useVizColors();
  const pts = values.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  const nums = pts.filter((v): v is number => v !== null);

  if (nums.length < 2) return <div style={{ width, height }} aria-hidden="true" />;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 5;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (pts.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const path = pts
    .map((v, i) =>
      v === null
        ? null
        : `${i === 0 || pts[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    )
    .filter(Boolean)
    .join(' ');
  const lastIdx = pts.length - 1 - [...pts].reverse().findIndex(v => v !== null);
  const last = pts[lastIdx] as number;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={path}
        pathLength={1}
        className="cv-draw"
        fill="none"
        stroke={c.neutral}
        strokeOpacity={0.55}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(lastIdx)}
        cy={y(last)}
        r={5}
        fill={c.series(0)}
        stroke={c.surface}
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * Stat tile contract (dataviz): label (sentence case) · value (proportional figures, compact) · delta vs a
 * named period (colour = direction × whether up is good) · 12-point trend. The whole tile is a button when
 * it drills into a report.
 */
export default function KpiTile({
  label,
  value,
  unit,
  hint,
  delta,
  spark,
  info,
  loading,
  sample,
  onClick,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  delta?: { pct: number | null; polarity: Polarity; label?: string };
  spark?: (number | null)[];
  info?: { definition: string; basis?: string };
  loading?: boolean;
  sample?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  const noValue = value === '—';
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-wash text-brand icon-gradient">
              {icon}
            </span>
          )}
          <span className="text-[13px] font-medium text-ink-1 truncate">{label}</span>
        </div>
        <span className="flex items-center gap-1 shrink-0">
          {sample && (
            <span className="text-[10px] font-medium text-ink-1 bg-surface-2 border border-line-soft rounded-full px-1.5 py-px">
              Sample
            </span>
          )}
          {info && (
            <MetricInfo title={label} {...info} className="pointer-events-auto relative z-10" />
          )}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="kpi-value">{value}</span>
              {unit && <span className="text-sm text-ink-2 font-medium">{unit}</span>}
            </div>
          )}
        </div>
        {!loading && spark && <Sparkline values={spark} />}
      </div>

      <div className="mt-2.5 min-h-[20px]">
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : delta && !noValue ? (
          <DeltaChip {...delta} />
        ) : hint ? (
          <span className="text-[11px] text-ink-2">{hint}</span>
        ) : null}
      </div>
      {!loading && delta && !noValue && hint && (
        <div className="mt-1 text-[11px] text-ink-2">{hint}</div>
      )}
    </>
  );

  const cls = 'glass text-left w-full  p-5 flex flex-col min-w-0 transition-all';

  // A clickable tile is a card with a button laid over it — NOT a button wrapping the "how is this calculated"
  // button (nested interactive controls are unreachable for screen readers). The card content ignores the
  // pointer so a click lands on the overlay; the info control re-enables it.
  return onClick ? (
    <div
      className={`${cls} relative cursor-pointer card-lift [&>*:not(button)]:pointer-events-none`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${noValue ? 'no value' : `${value}${unit ? ` ${unit}` : ''}`}. Open details`}
        className="absolute inset-0 rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan"
      />
      {body}
    </div>
  ) : (
    <div className={cls}>{body}</div>
  );
}
