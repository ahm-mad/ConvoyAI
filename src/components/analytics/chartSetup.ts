import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
  type Plugin,
  type ChartOptions,
} from 'chart.js';
import type { VizColors } from './theme';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler
);

/** Vertical hairline that snaps to the hovered X (time series): "the crosshair finds the X". */
export const crosshairPlugin = (color: string): Plugin => ({
  id: 'vizCrosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.();

    if (!active || active.length === 0) return;

    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  },
});

/** Shared, recessive chart chrome: solid hairline grid, muted axis text, one styled tooltip for every series at the X. */
export const baseOptions = (
  c: VizColors,
  o: {
    yTickFormat?: (v: number) => string;
    yMax?: number;
    stacked?: boolean;
    suggestedMax?: number;
    /** Counts: whole-number ticks only. */
    integer?: boolean;
  } = {}
): ChartOptions<any> => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 280 },
  interaction: { mode: 'index', intersect: false },
  layout: { padding: { top: 6, right: 6 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: c.mode === 'light' ? '#12151a' : '#1f252b',
      titleColor: c.mode === 'light' ? '#c3c9cf' : '#9aa4af',
      bodyColor: '#ffffff',
      borderColor: c.mode === 'light' ? '#12151a' : '#2c343c',
      borderWidth: 1,
      padding: { top: 8, bottom: 8, left: 10, right: 10 },
      cornerRadius: 8,
      caretSize: 0,
      displayColors: true,
      usePointStyle: false,
      boxWidth: 10,
      boxHeight: 3,
      boxPadding: 6,
      titleFont: { size: 11, weight: 'normal' },
      bodyFont: { size: 12, weight: 'normal' },
    },
  },
  scales: {
    x: {
      stacked: o.stacked,
      grid: { display: false },
      border: { display: false },
      ticks: { color: c.axis, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
    },
    y: {
      stacked: o.stacked,
      beginAtZero: true,
      suggestedMax: o.suggestedMax,
      max: o.yMax,
      grid: { color: c.grid, lineWidth: 1 },
      border: { display: false },
      ticks: {
        color: c.axis,
        font: { size: 11 },
        maxTicksLimit: 5,
        padding: 8,
        precision: o.integer ? 0 : undefined,
        callback: (v: string | number) => (o.yTickFormat ? o.yTickFormat(Number(v)) : String(v)),
      },
    },
  },
});
