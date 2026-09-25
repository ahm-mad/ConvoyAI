/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { baseOptions, crosshairPlugin } from './chartSetup';
import { useVizColors } from './theme';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  data: (number | null)[];
  /** Format for the tooltip value of this series (defaults to a plain locale number). */
  format?: (v: number) => string;
}

/** Legend that is also a filter: click a key to hide / show that series. Always present for ≥ 2 series. */
export function ChartLegend({
  series,
  hidden,
  onToggle,
  variant = 'swatch',
}: {
  series: { key: string; label: string; color: string }[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  variant?: 'swatch' | 'line';
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Chart legend">
      {series.map(s => {
        const off = hidden.has(s.key);

        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onToggle(s.key)}
              aria-pressed={!off}
              className={`inline-flex items-center gap-1.5 text-[11.5px] rounded px-1 py-0.5 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                off ? 'opacity-45' : 'opacity-100'
              } text-ink-1 hover:text-ink-0`}
            >
              {variant === 'line' ? (
                <span className="w-3 h-[2px] rounded" style={{ background: s.color }} />
              ) : (
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
              )}
              <span className={off ? 'line-through' : ''}>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const useHidden = () => {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setHidden(prev => {
      const n = new Set(prev);

      if (n.has(k)) n.delete(k);
      else n.add(k);

      return n;
    });

  return { hidden, toggle };
};

const tooltipLabel = (series: ChartSeries[]) => (ctx: any) => {
  const s = series[ctx.datasetIndex];
  const v = ctx.parsed.y;

  return `${v == null ? '—' : s.format ? s.format(v) : v.toLocaleString()}   ${s.label}`;
};

/**
 * Counts per period, stacked. ≤ 24 px columns, 4 px rounded, a 2 px surface gap between segments (the gap —
 * not an outline — separates them), recessive hairline grid, one tooltip listing every series at the X.
 */
export function StackedColumns({
  labels,
  series,
  height = 220,
  yTickFormat,
  integer = true,
  ariaLabel,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  yTickFormat?: (v: number) => string;
  /** Whole-number ticks (counts). Set false for quantities such as litres or money. */
  integer?: boolean;
  ariaLabel: string;
}) {
  const c = useVizColors();
  const { hidden, toggle } = useHidden();
  const visible = series.filter(s => !hidden.has(s.key));

  const data = useMemo(
    () => ({
      labels,
      datasets: visible.map(s => ({
        label: s.label,
        data: s.data,
        backgroundColor: s.color,
        borderColor: c.surface,
        borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      })),
    }),
    [labels, visible, c.surface]
  );

  const options = useMemo(() => {
    const o: any = baseOptions(c, {
      stacked: true,
      yTickFormat,
      integer,
      suggestedMax: integer ? 3 : undefined,
    });

    o.plugins.tooltip.callbacks = {
      label: tooltipLabel(visible),
      labelColor: (ctx: any) => ({
        borderColor: visible[ctx.datasetIndex].color,
        backgroundColor: visible[ctx.datasetIndex].color,
        borderWidth: 0,
        borderRadius: 1,
      }),
      footer: (items: any[]) => {
        const sum = items.reduce((a, i) => a + (i.parsed.y || 0), 0);

        return items.length > 1 ? `${sum.toLocaleString()}   Total` : '';
      },
    };
    o.plugins.tooltip.footerFont = { size: 11, weight: 'normal' };
    o.plugins.tooltip.footerColor = '#9aa4af';

    return o;
  }, [c, visible, yTickFormat, integer]);

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3">
          <ChartLegend series={series} hidden={hidden} onToggle={toggle} />
        </div>
      )}
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <Bar data={data as any} options={options} role="presentation" />
      </div>
    </div>
  );
}

/**
 * A trend over time: 2 px line, ~10 % area wash for a single series, a ≥ 8 px end-dot with a surface ring, a
 * crosshair that snaps to the hovered X, and an optional target line (solid hairline with its label).
 */
export function TrendLine({
  labels,
  series,
  height = 200,
  yTickFormat,
  target,
  area = true,
  ariaLabel,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  yTickFormat?: (v: number) => string;
  target?: { value: number; label: string } | null;
  area?: boolean;
  ariaLabel: string;
}) {
  const c = useVizColors();
  const { hidden, toggle } = useHidden();
  const visible = series.filter(s => !hidden.has(s.key));

  const data = useMemo(() => {
    const ds: any[] = visible.map(s => {
      const last = s.data.reduce<number>((idx, v, i) => (v !== null ? i : idx), -1);

      return {
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: area && series.length === 1 ? `${s.color}1a` : 'transparent',
        fill: area && series.length === 1,
        tension: 0,
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointRadius: s.data.map((_, i) => (i === last ? 4.5 : 0)),
        pointHoverRadius: 5,
        pointBackgroundColor: s.color,
        pointBorderColor: c.surface,
        pointBorderWidth: 2,
        pointHitRadius: 24,
        spanGaps: true,
      };
    });

    if (target) {
      ds.push({
        label: target.label,
        data: labels.map(() => target.value),
        borderColor: c.neutral,
        borderWidth: 1,
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
      });
    }

    return { labels, datasets: ds };
  }, [labels, visible, series.length, area, target, c]);

  const options = useMemo(() => {
    const o: any = baseOptions(c, { yTickFormat });

    o.plugins.tooltip.callbacks = {
      label: (ctx: any) => {
        if (ctx.datasetIndex >= visible.length) return `${ctx.parsed.y}   ${target?.label}`;

        return tooltipLabel(visible)(ctx);
      },
      labelColor: (ctx: any) => {
        const col =
          ctx.datasetIndex >= visible.length ? c.neutral : visible[ctx.datasetIndex].color;

        return { borderColor: col, backgroundColor: col, borderWidth: 0, borderRadius: 1 };
      },
    };
    o.plugins.tooltip.filter = (item: any) => item.datasetIndex < visible.length;

    return o;
  }, [c, visible, yTickFormat, target]);

  return (
    <div>
      {(series.length > 1 || target) && (
        <div className="mb-3 flex items-center gap-4 flex-wrap">
          {series.length > 1 && (
            <ChartLegend series={series} hidden={hidden} onToggle={toggle} variant="line" />
          )}
          {target && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-1">
              <span className="w-3 h-px" style={{ background: c.neutral }} /> {target.label}
            </span>
          )}
        </div>
      )}
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <Line
          data={data as any}
          options={options}
          plugins={[crosshairPlugin(c.axis)]}
          role="presentation"
        />
      </div>
    </div>
  );
}
