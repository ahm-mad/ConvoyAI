'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BarChart3, Map as MapIcon, Route as RouteIcon, Sparkles } from 'lucide-react';
import LazyMount from './LazyMount';
import TourLiveMap from './TourLiveMap';
import TourTrips from './TourTrips';
import TourAnalytics from './TourAnalytics';
import TourCopilot from './TourCopilot';

const TABS = [
  {
    id: 'map',
    label: 'Live map',
    icon: MapIcon,
    url: 'live-map',
    blurb: 'Every vehicle, yard and geofence in real time. Click a truck or pick it from the list.',
  },
  {
    id: 'trips',
    label: 'Trips & dispatch',
    icon: RouteIcon,
    url: 'trips',
    blurb: 'Plan, track and close trips with stops, ETAs and drivers in one list.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    url: 'analytics/utilisation',
    blurb: 'Distance, fuel and punctuality by day, with targets and week-on-week change.',
  },
  {
    id: 'ai',
    label: 'Convoy Copilot',
    icon: Sparkles,
    url: 'copilot',
    blurb: 'Ask in plain language. It reads your live data and proposes the next action.',
  },
] as const;

const AUTOPLAY_MS = 9000;

/**
 * Tabbed product tour: four tabs showing the real product pieces on the sample fleet. It advances by itself while it
 * is on screen and until the visitor touches it; keyboard: arrows / Home / End move between tabs.
 */
export default function Tour() {
  const [tab, setTab] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const el = box.current;

    if (!el) return;

    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !inView || reduce.current) return;

    const t = setTimeout(() => setTab(n => (n + 1) % TABS.length), AUTOPLAY_MS);

    return () => clearTimeout(t);
  }, [auto, inView, tab]);

  const select = (i: number) => {
    setAuto(false);
    setTab(i);
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;

    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(k)) return;

    e.preventDefault();
    select(
      k === 'Home'
        ? 0
        : k === 'End'
          ? TABS.length - 1
          : (tab + (k === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    );
    requestAnimationFrame(() =>
      box.current?.querySelector<HTMLElement>('[role=tab][tabindex="0"]')?.focus()
    );
  };

  const t = TABS[tab];

  return (
    <section id="tour" className="page-container scroll-mt-24 pb-24">
      <div className="mx-auto max-w-[680px] text-center">
        <div className="eyebrow">Product tour</div>
        <h2 className="page-title mt-3">See it working on a real fleet.</h2>
        <p className="mt-4 text-body text-ink-1">
          This is the actual product on a sample fleet. Click around: nothing here is a screenshot.
        </p>
      </div>

      <div ref={box} className="mx-auto mt-10 max-w-[1120px]">
        <div
          role="tablist"
          aria-label="Product tour"
          className="mb-4 flex flex-wrap justify-center gap-2"
          onKeyDown={onKey}
        >
          {TABS.map((x, i) => {
            const Icon = x.icon;
            const on = i === tab;

            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tour-tab-${x.id}`}
                aria-selected={on}
                aria-controls="tour-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => select(i)}
                className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-line bg-white/70 px-4 py-2.5 text-control font-semibold text-ink-1 transition-colors hover:bg-white aria-selected:border-transparent aria-selected:bg-ink-0 aria-selected:text-white"
              >
                <Icon size={15} aria-hidden /> {x.label}
                {on && auto && inView && !reduce.current && (
                  <i
                    key={tab}
                    className="lp-tour-progress absolute inset-x-0 bottom-0 h-[3px] origin-left bg-brand"
                    style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="mb-5 text-center text-caption text-ink-2" aria-live="polite">
          {t.blurb}
        </p>

        <div className="glass rounded-modal overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-line-soft bg-white/60 px-5 py-3">
            <span className="size-2.5 rounded-full bg-danger/70" />
            <span className="size-2.5 rounded-full bg-gold" />
            <span className="size-2.5 rounded-full bg-success/80" />
            <span className="ml-3 rounded-full bg-black/[0.05] px-3 py-1 text-caption text-ink-2">
              app.convoyai.com / {t.url}
            </span>
          </div>
          <div
            id="tour-panel"
            role="tabpanel"
            aria-labelledby={`tour-tab-${t.id}`}
            onPointerDown={() => setAuto(false)}
          >
            <LazyMount rootMargin="400px" className="min-h-[540px]">
              {tab === 0 && <TourLiveMap />}
              {tab === 1 && <TourTrips />}
              {tab === 2 && <TourAnalytics />}
              {tab === 3 && <TourCopilot />}
            </LazyMount>
          </div>
        </div>
      </div>
    </section>
  );
}
