'use client';

import { useState } from 'react';

const SERIES = {
  distance: {
    label: 'Distance',
    unit: 'km',
    total: '26,840',
    delta: '▲ 6.1% vs last week',
    good: true,
    vals: [3120, 3480, 3320, 3890, 4210, 4050, 4770],
  },
  fuel: {
    label: 'Fuel used',
    unit: 'L',
    total: '8,214',
    delta: '▼ 4.8% vs last week',
    good: true,
    vals: [1210, 1180, 1120, 1240, 1190, 1130, 1144],
  },
  ontime: {
    label: 'On-time trips',
    unit: '%',
    total: '91.3%',
    delta: '▲ 2.4 pts vs last week',
    good: true,
    vals: [86, 88, 87, 90, 92, 91, 94],
  },
} as const;
type Key = keyof typeof SERIES;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Analytics" tab: switch the metric, hover a day for its value. Plain SVG, tokens only. */
export default function TourAnalytics() {
  const [k, setK] = useState<Key>('distance');
  const [hover, setHover] = useState<number | null>(6);
  const s = SERIES[k];
  const max = Math.max(...s.vals);
  const min = Math.min(...s.vals) * 0.85;
  const W = 640;
  const H = 260;
  const x = (i: number) => 30 + (i * (W - 60)) / (s.vals.length - 1);
  const y = (v: number) => H - 30 - ((v - min) / (max - min)) * (H - 70);
  const line = s.vals
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="h-[540px] overflow-y-auto bg-surface-1 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Fleet analytics · last 7 days</div>
          <div className="mt-2 flex items-end gap-3">
            <span className="kpi-value">{s.total}</span>
            <span className="pb-1 text-caption font-semibold text-success">{s.delta}</span>
          </div>
        </div>
        <div
          role="group"
          aria-label="Metric"
          className="flex gap-1 rounded-full bg-black/[0.05] p-1"
        >
          {(Object.keys(SERIES) as Key[]).map(key => (
            <button
              key={key}
              type="button"
              aria-pressed={k === key}
              onClick={() => setK(key)}
              className="rounded-full px-3.5 py-1.5 text-caption font-semibold text-ink-1 aria-pressed:bg-brand aria-pressed:text-white"
            >
              {SERIES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass mt-5 p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${s.label} by day`}
          onMouseLeave={() => setHover(6)}
        >
          <defs>
            <linearGradient id="tour-area" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                style={{ stopColor: 'var(--color-brand-bright)', stopOpacity: 0.38 }}
              />
              <stop offset="1" style={{ stopColor: 'var(--color-brand-bright)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <g className="stroke-line" strokeDasharray="3 5">
            {[0, 1, 2, 3].map(n => (
              <path key={n} d={`M0 ${40 + n * 60}H${W}`} />
            ))}
          </g>
          <path d={`${line} V${H - 30} H30 Z`} fill="url(#tour-area)" />
          <path
            d={line}
            fill="none"
            className="stroke-brand"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {s.vals.map((v, i) => (
            <g key={DAYS[i]} onMouseEnter={() => setHover(i)}>
              <rect x={x(i) - 30} y="0" width="60" height={H} fill="transparent" />
              <circle
                cx={x(i)}
                cy={y(v)}
                r={hover === i ? 7 : 4.5}
                className="fill-surface-1 stroke-brand"
                strokeWidth="3"
              />
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-2" fontSize="12">
                {DAYS[i]}
              </text>
            </g>
          ))}
          {hover !== null && (
            <g
              transform={`translate(${Math.min(Math.max(x(hover), 56), W - 56)} ${y(s.vals[hover]) - 44})`}
            >
              <rect x="-50" y="-18" width="100" height="34" rx="10" className="fill-ink-0" />
              <text textAnchor="middle" y="4" className="fill-white" fontSize="13" fontWeight="600">
                {s.vals[hover].toLocaleString()} {s.unit}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ['Utilisation', '87.4%', 'Target 85%'],
          ['Cost per km', 'PKR 41.2', '▼ 3.1% vs last week'],
          ['Harsh braking', '−18%', 'After driver coaching'],
        ].map(([l, v, sub]) => (
          <div key={l} className="glass p-4">
            <div className="text-caption text-ink-2">{l}</div>
            <div className="kpi-value mt-1 !text-[1.9rem]">{v}</div>
            <div className="mt-1 text-caption text-ink-1">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
