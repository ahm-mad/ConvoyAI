'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import HeroMapLive from './HeroMapLive';

/** What the copilot "notices" in the hero, in rotation. Plain, specific and believable. */
const INSIGHTS = [
  {
    text: (
      <>
        Reroute 14 trips via M-9 and save <b className="text-ink-0">46 min</b> each. Estimated{' '}
        <b className="text-ink-0">PKR 412k</b> saved this week.
      </>
    ),
    cta: 'Apply to all trips',
  },
  {
    text: (
      <>
        Three trucks show a <b className="text-ink-0">31% rise</b> in hard braking. Brake wear
        likely within <b className="text-ink-0">9 days</b>.
      </>
    ),
    cta: 'Schedule service',
  },
  {
    text: (
      <>
        <b className="text-ink-0">Bilal Sheikh</b> reaches the hours limit in 40 minutes. Swap the
        Multan leg to keep the delivery on time.
      </>
    ),
    cta: 'See swap options',
  },
];

/** Product preview for the landing hero: a live, clickable fleet map with a KPI card and the rotating copilot. */
export default function HeroVisual() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const t = setInterval(() => setI(n => (n + 1) % INSIGHTS.length), 7000);

    return () => clearInterval(t);
  }, []);

  const insight = INSIGHTS[i];

  return (
    <div className="relative mx-auto w-full max-w-[1120px]">
      <div className="glass rounded-modal relative overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-line-soft bg-white/60 px-5 py-3">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-gold" />
          <span className="size-2.5 rounded-full bg-success/80" />
          <span className="ml-3 rounded-full bg-black/[0.05] px-3 py-1 text-caption text-ink-2">
            app.convoyai.com / live-map
          </span>
        </div>
        <div className="relative h-[520px] overflow-hidden bg-surface-2 md:h-[580px]">
          <HeroMapLive />

          <div className="glass motion-float pointer-events-none absolute bottom-5 left-16 hidden w-[220px] p-5 lg:block">
            <div className="text-caption text-ink-2">Fleet utilisation</div>
            <div className="kpi-value mt-2">
              87.4<span className="text-body text-ink-2">%</span>
            </div>
            <div className="mt-1 text-caption font-semibold text-success">▲ 4.2% vs last week</div>
          </div>

          <div
            className="glass-strong absolute bottom-5 right-5 hidden w-[310px] p-4 md:block"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-caption font-semibold text-ai-ink">
              <span className="btn-ai grid size-7 place-items-center rounded-control">
                <Sparkles size={13} fill="currentColor" />
              </span>
              Convoy Copilot
              <span className="ml-auto flex gap-1" aria-hidden>
                {INSIGHTS.map((_, n) => (
                  <i
                    key={n}
                    className={`h-1 rounded-full transition-all ${n === i ? 'w-4 bg-ai' : 'w-1.5 bg-black/15'}`}
                  />
                ))}
              </span>
            </div>
            <p key={i} className="motion-rise mt-2 min-h-[64px] text-control text-ink-1">
              {insight.text}
            </p>
            <span className="mt-1 inline-flex items-center gap-1 text-caption font-semibold text-brand">
              {insight.cta} <ArrowUpRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
