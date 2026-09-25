import { ArrowUpRight, Sparkles } from 'lucide-react';

/** Illustrated product preview for the landing hero: stylised live map, KPI card, AI bubble. Token-driven. */
export default function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[1120px]">
      <div className="glass rounded-modal relative overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-line-soft bg-white/60 px-5 py-3">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-gold" />
          <span className="size-2.5 rounded-full bg-success/80" />
          <span className="ml-3 rounded-full bg-black/[0.05] px-3 py-1 text-caption text-ink-2">
            app.convoyai.com / overview
          </span>
        </div>
        <div className="relative h-[430px] overflow-hidden bg-surface-2">
          <svg
            viewBox="0 0 1000 430"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 size-full"
            aria-label="Live fleet map illustration"
          >
            <defs>
              <linearGradient id="lp-route" x1="0" x2="1">
                <stop offset="0" style={{ stopColor: 'var(--color-brand-bright)' }} />
                <stop offset="1" style={{ stopColor: 'var(--color-ai)' }} />
              </linearGradient>
              <radialGradient id="lp-heat">
                <stop offset="0" style={{ stopColor: 'var(--color-gold)', stopOpacity: 0.5 }} />
                <stop offset="1" style={{ stopColor: 'var(--color-gold)', stopOpacity: 0 }} />
              </radialGradient>
            </defs>
            <rect width="1000" height="430" className="fill-surface-2" />
            <path
              d="M0 330 C160 300 260 380 420 360 S680 290 820 330 S940 370 1000 350 V430 H0Z"
              className="fill-ai-wash"
            />
            <ellipse cx="170" cy="110" rx="100" ry="46" className="fill-brand-wash" opacity="0.7" />
            <ellipse cx="820" cy="90" rx="110" ry="50" className="fill-gold-wash" opacity="0.8" />
            <g className="stroke-white" strokeWidth="11" fill="none" strokeLinecap="round">
              <path d="M-10 210 C150 180 260 250 420 215 S700 130 1010 180" />
              <path d="M130 -10 C170 90 250 140 300 230 S330 380 380 440" />
              <path d="M620 -10 C600 90 660 160 620 240 S700 350 760 440" />
              <path d="M-10 80 C200 100 380 30 560 70 S860 120 1010 60" />
              <path d="M-10 300 C180 280 340 330 520 295 S820 250 1010 290" />
            </g>
            <circle cx="430" cy="215" r="130" fill="url(#lp-heat)" />
            <path
              d="M150 215 C230 200 300 240 420 215 S620 150 860 175"
              stroke="url(#lp-route)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M150 215 C230 200 300 240 420 215"
              stroke="white"
              strokeWidth="2"
              fill="none"
              strokeDasharray="2 9"
              strokeLinecap="round"
            />
            {[
              [150, 215, 'fill-ink-0'],
              [860, 175, 'fill-brand'],
            ].map(([x, y, c]) => (
              <rect
                key={String(x)}
                x={Number(x) - 18}
                y={Number(y) - 18}
                width="36"
                height="36"
                rx="12"
                className={String(c)}
              />
            ))}
            {[
              [420, 215, 'fill-brand'],
              [560, 80, 'fill-success'],
              [790, 100, 'fill-success'],
              [300, 235, 'fill-gold'],
              [690, 160, 'fill-success'],
              [220, 320, 'fill-ai'],
              [372, 400, 'fill-danger'],
            ].map(([x, y, c]) => (
              <g key={`${x}-${y}`}>
                <circle cx={Number(x)} cy={Number(y)} r="13" fill="white" />
                <circle cx={Number(x)} cy={Number(y)} r="8" className={String(c)} />
              </g>
            ))}
          </svg>

          <div className="absolute left-5 top-5 flex flex-wrap gap-2">
            {[
              ['bg-success', '132 Moving'],
              ['bg-gold', '31 Idle'],
              ['bg-danger', '7 Alerts'],
            ].map(([c, t]) => (
              <span
                key={t}
                className="glass-strong glass-pill flex items-center gap-2 px-3.5 py-2 text-caption font-medium"
              >
                <i className={`size-2 rounded-full ${c}`} />
                {t}
              </span>
            ))}
          </div>

          <div
            className="glass motion-float absolute bottom-5 left-5 hidden w-[300px] p-4 sm:block"
            style={{ ['--delay' as string]: '0.7s' }}
          >
            <div className="flex items-center justify-between">
              <b className="text-control text-ink-0">KHI-2291 · Hino 500</b>
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-micro font-semibold text-online-text">
                On route
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['62', 'km/h'],
                ['16:42', 'ETA'],
                ['−4.1°', 'Cargo'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-control bg-white/70 py-2">
                  <div className="text-control font-semibold tabular-nums text-ink-0">{v}</div>
                  <div className="text-micro text-ink-2">{l}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-black/[0.06]">
              <i className="brand-gradient-bg block h-full w-[68%] rounded-full" />
            </div>
          </div>

          <div className="glass motion-float absolute right-5 top-5 hidden w-[230px] p-5 md:block">
            <div className="text-caption text-ink-2">Fleet utilisation</div>
            <div className="kpi-value mt-2">
              87.4<span className="text-body text-ink-2">%</span>
            </div>
            <div className="mt-1 text-caption font-semibold text-success">▲ 4.2% vs last week</div>
          </div>

          <div
            className="glass-strong motion-float absolute bottom-5 right-5 hidden w-[300px] p-4 md:block"
            style={{ ['--delay' as string]: '1.4s' }}
          >
            <div className="flex items-center gap-2 text-caption font-semibold text-ai-ink">
              <span className="btn-ai grid size-7 place-items-center rounded-control">
                <Sparkles size={13} fill="currentColor" />
              </span>
              Convoy Copilot
            </div>
            <p className="mt-2 text-control text-ink-1">
              Reroute 14 trips via M-9 and save <b className="text-ink-0">46 min</b> each. Estimated{' '}
              <b className="text-ink-0">PKR 412k</b> saved this week.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-caption font-semibold text-brand">
              Apply to all trips <ArrowUpRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
