// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useMemo } from 'react';
import {
  LayoutGrid,
  Activity,
  Zap,
  Bell,
  Sparkles,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const stats = [
  {
    icon: Activity,
    iconAccent: 'text-accent-cyan',
    label: 'Active Telemetry Streams',
    value: '492,019',
    delta: '+4.2% from last hour',
    deltaAccent: 'text-accent-green',
  },
  {
    icon: Zap,
    iconAccent: 'text-amber-400',
    label: 'Energy Saved (Today)',
    value: '14,290 kWh',
    delta: '-12.4% CO2 Reduction',
    deltaAccent: 'text-accent-green',
  },
  {
    icon: Bell,
    iconAccent: 'text-red-400',
    label: 'Active Alerts',
    value: '0',
    delta: 'No critical alerts detected.',
    deltaAccent: 'text-ink-2',
  },
];

const chartPoints = [1180, 1080, 1320, 1720, 2080, 1900, 1520, 1150, 980];
const chartLabels = ['00:00', '', '04:00', '', '08:00', '', '12:00', '', '16:00'];

const insights = [
  {
    icon: AlertTriangle,
    tag: 'PREDICTIVE ANOMALY',
    tagAccent: 'text-purple-300',
    border: 'border-l-purple-400',
    text: 'Vibration signatures on Water Pump #3 indicate bearing wear.',
    meta: 'Service window closes in 14 days',
    cta: 'Create Work Order →',
  },
  {
    icon: TrendingDown,
    tag: 'RECOMMENDATION',
    tagAccent: 'text-accent-blue',
    border: 'border-l-accent-blue/60',
    text: 'Schedule HVAC setbacks on Floor 2. Occupancy predicts a 90% drop this weekend.',
    meta: 'Estimated savings: 6.1 kWh/day',
    cta: 'Apply Optimization →',
  },
];

export function CommandCenter() {
  const chartData = useMemo(
    () => ({
      labels: chartLabels,
      datasets: [
        {
          label: 'Energy Load',
          data: chartPoints,
          borderColor: '#22d3ee',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#030712',
          pointBorderColor: '#22d3ee',
          pointBorderWidth: 1.5,
          tension: 0.45,
          cubicInterpolationMode: 'monotone',
          fill: true,
          backgroundColor: ctx => {
            const { chart } = ctx;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) return 'rgba(34,211,238,0.28)';
            const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(34,211,238,0.28)');
            gradient.addColorStop(1, 'rgba(34,211,238,0)');
            return gradient;
          },
        },
      ],
    }),
    []
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1120',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          padding: 8,
          displayColors: false,
          callbacks: {
            label: item => `${item.formattedValue} kWh`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawOnChartArea: false },
          border: { display: false },
          ticks: { color: '#64748b', font: { size: 10, family: 'monospace' } },
        },
        y: {
          min: 800,
          max: 2200,
          ticks: {
            stepSize: 200,
            color: '#64748b',
            font: { size: 10, family: 'monospace' },
            callback: val => val.toLocaleString(),
          },
          grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false, drawOnChartArea: true },
          border: { display: false },
        },
      },
    }),
    []
  );

  return (
    <section
      id="showcase-console"
      className="border-line-soft bg-[#030712] py-12 sm:py-16 md:py-24"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="green">Live Platform Preview</Eyebrow>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-0 sm:text-3xl md:text-4xl">
            The ConvoyAI Unified Command Center
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            Take control of your infrastructure with our enterprise-grade web and desktop console.
          </p>
        </div>

        <div className="mt-16 rounded-2xl border border-line bg-surface-2 p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-line-soft pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-3">
                <LayoutGrid className="size-4 text-accent-cyan" strokeWidth={1.75} />
              </span>
              <p className="text-xs sm:text-sm font-semibold text-ink-0">
                ConvoyAI Enterprise Console
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-5 w-full sm:w-auto">
              <span className="flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/10 px-2.5 py-1 font-mono text-[10px] font-medium text-accent-green">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-green" />
                All Systems Normal
              </span>
              <span className="text-xs font-medium text-ink-0">Map View</span>
              <span className="text-xs text-ink-2 transition-colors hover:text-ink-0 cursor-pointer">
                3D View
              </span>
              <span className="text-xs text-ink-2 transition-colors hover:text-ink-0 cursor-pointer">
                Analytics
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-[220px_1fr_260px]">
            {/* Stats */}
            <div className="flex flex-col gap-6">
              {stats.map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs text-ink-2">{stat.label}</p>
                      <Icon className={`size-3.5 shrink-0 ${stat.iconAccent}`} strokeWidth={1.75} />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-ink-0 tabular-nums">{stat.value}</p>
                    <p className={`mt-0.5 text-xs ${stat.deltaAccent}`}>{stat.delta}</p>
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-1">
                  Consolidated Energy Consumption (24h)
                </p>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-2">
                  <span className="size-1.5 rounded-full bg-accent-cyan" />
                  Simulated Load
                </span>
              </div>
              <div className="mt-2 -ml-2" style={{ height: 260 }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* AI insights */}
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-1">
                <Sparkles className="size-3.5 text-accent-cyan" strokeWidth={1.75} />
                AI Co-Pilot Insights
              </p>

              <div className="mt-3 space-y-3">
                {insights.map(insight => {
                  const Icon = insight.icon;
                  return (
                    <div
                      key={insight.tag}
                      className={`rounded-lg border border-line-soft border-l-2 ${insight.border} bg-surface-3 p-3 transition-shadow duration-300 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]`}
                    >
                      <p
                        className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider ${insight.tagAccent}`}
                      >
                        <Icon className="size-3" strokeWidth={2} />
                        {insight.tag}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-1">{insight.text}</p>
                      <p className="mt-1.5 text-[10px] font-mono text-ink-2">{insight.meta}</p>
                      <p className="mt-2 text-xs font-medium text-accent-cyan">{insight.cta}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
