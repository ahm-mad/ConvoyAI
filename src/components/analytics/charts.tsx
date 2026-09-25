/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { useVizColors, type VizColors } from './theme';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

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

/** Shared chart chrome from the design tokens: hairline dashed grid, muted axis text, glass tooltip. */
const baseApex = (
  c: VizColors,
  o: {
    height: number;
    type: 'bar' | 'area' | 'line';
    stacked?: boolean;
    yTickFormat?: (v: number) => string;
    integer?: boolean;
  }
): ApexOptions => ({
  chart: {
    type: o.type,
    height: o.height,
    stacked: o.stacked,
    toolbar: { show: false },
    zoom: { enabled: false },
    fontFamily: 'var(--font-sans)',
    foreColor: c.axis,
    background: 'transparent',
    animations: {
      enabled: true,
      speed: 500,
      animateGradually: { enabled: true, delay: 60 },
      dynamicAnimation: { speed: 350 },
    },
  },
  dataLabels: { enabled: false },
  legend: { show: false },
  grid: {
    borderColor: c.grid,
    strokeDashArray: 4,
    padding: { left: 4, right: 8, top: 0, bottom: 0 },
  },
  xaxis: {
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: c.axis, fontSize: '11px' }, rotate: 0, hideOverlappingLabels: true },
    crosshairs: { show: o.type !== 'bar', stroke: { color: c.axis, width: 1, dashArray: 0 } },
    tooltip: { enabled: false },
  },
  yaxis: {
    min: 0,
    forceNiceScale: true,
    tickAmount: 4,
    labels: {
      style: { colors: c.axis, fontSize: '11px' },
      formatter: (v: number) =>
        o.yTickFormat ? o.yTickFormat(v) : o.integer ? String(Math.round(v)) : String(v),
    },
  },
  tooltip: { shared: true, intersect: false, theme: 'light', style: { fontSize: '12px' } },
});

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

  const options = useMemo<ApexOptions>(() => {
    const o = baseApex(c, { height, type: 'bar', stacked: true, yTickFormat, integer });

    return {
      ...o,
      colors: visible.map(s => s.color),
      plotOptions: {
        bar: {
          columnWidth: '55%',
          borderRadius: 6,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
        },
      },
      stroke: { show: true, width: 2, colors: [c.surface] },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'light',
          type: 'vertical',
          opacityFrom: 1,
          opacityTo: 0.92,
          stops: [0, 100],
        },
      },
      xaxis: { ...o.xaxis, categories: labels },
      yaxis: { ...(o.yaxis as object), max: integer ? undefined : undefined },
      tooltip: {
        ...o.tooltip,
        y: {
          formatter: (v: number, opts: any) =>
            v == null
              ? '—'
              : visible[opts.seriesIndex]?.format
                ? visible[opts.seriesIndex].format!(v)
                : v.toLocaleString(),
        },
      },
    };
  }, [c, visible, labels, height, yTickFormat, integer]);

  const apexSeries = useMemo(
    () => visible.map(s => ({ name: s.label, data: s.data.map(v => (v == null ? 0 : v)) })),
    [visible]
  );

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3">
          <ChartLegend series={series} hidden={hidden} onToggle={toggle} />
        </div>
      )}
      <div style={{ minHeight: height }} role="img" aria-label={ariaLabel}>
        <ReactApexChart type="bar" height={height} options={options} series={apexSeries} />
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

  const single = area && series.length === 1;
  const options = useMemo<ApexOptions>(() => {
    const o = baseApex(c, { height, type: single ? 'area' : 'line', yTickFormat });
    const lastIdx = (s: ChartSeries) =>
      s.data.reduce<number>((idx, v, i) => (v !== null ? i : idx), -1);

    return {
      ...o,
      colors: visible.map(s => s.color),
      stroke: { curve: 'smooth', width: 3, lineCap: 'round' },
      fill: single
        ? {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 95, 100] },
          }
        : { type: 'solid', opacity: 1 },
      markers: {
        size: 0,
        hover: { size: 5 },
        discrete: visible
          .map((s, i) => ({
            seriesIndex: i,
            dataPointIndex: lastIdx(s),
            size: 5,
            fillColor: s.color,
            strokeColor: c.surface,
          }))
          .filter(m => m.dataPointIndex >= 0),
      },
      xaxis: { ...o.xaxis, categories: labels },
      annotations: target
        ? {
            yaxis: [
              {
                y: target.value,
                borderColor: c.neutral,
                strokeDashArray: 0,
                label: {
                  text: target.label,
                  position: 'left',
                  textAnchor: 'start',
                  style: { color: c.axis, background: 'transparent', fontSize: '11px' },
                },
              },
            ],
          }
        : {},
      tooltip: {
        ...o.tooltip,
        y: {
          formatter: (v: number, opts: any) =>
            v == null
              ? '—'
              : visible[opts.seriesIndex]?.format
                ? visible[opts.seriesIndex].format!(v)
                : v.toLocaleString(),
        },
      },
    };
  }, [c, visible, labels, height, yTickFormat, target, single]);

  const apexSeries = useMemo(() => visible.map(s => ({ name: s.label, data: s.data })), [visible]);

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
      <div style={{ minHeight: height }} role="img" aria-label={ariaLabel}>
        <ReactApexChart
          type={single ? 'area' : 'line'}
          height={height}
          options={options}
          series={apexSeries}
        />
      </div>
    </div>
  );
}
