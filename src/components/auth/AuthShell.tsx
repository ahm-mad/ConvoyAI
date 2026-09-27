'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  BellRing,
  Boxes,
  Gauge,
  MapPinned,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  FileSpreadsheet,
} from 'lucide-react';
import BrandMark from '@components/shell/BrandMark';

const AuthMap = dynamic(() => import('./AuthMap'), { ssr: false });

type Variant = 'login' | 'register';

const POINTS: Record<Variant, { icon: typeof Truck; text: string }[]> = {
  login: [
    { icon: Truck, text: 'Live fleet map, trips and dispatch in one place' },
    { icon: Sparkles, text: 'AI copilot that spots cost, risk and maintenance early' },
    { icon: ShieldCheck, text: 'Enterprise roles and permissions built in' },
  ],
  register: [
    { icon: Boxes, text: 'Free 30-day trial, no credit card' },
    { icon: FileSpreadsheet, text: 'Import your vehicles from a spreadsheet' },
    { icon: Users, text: 'Invite your team and set roles in minutes' },
  ],
};

/** Believable events for the rotating toast on the map panel. */
const ALERTS = [
  {
    icon: Gauge,
    tone: 'bg-danger',
    title: 'Truck 09 · 86 km/h',
    sub: 'Over the speed limit near Sahiwal',
  },
  {
    icon: MapPinned,
    tone: 'bg-ink-2',
    title: 'Van 27 entered Islamabad Hub',
    sub: 'Arrived 6 min ahead of plan',
  },
  {
    icon: BellRing,
    tone: 'bg-gold',
    title: 'TRP-2406 running 12 min late',
    sub: 'Congestion on the M-2 near Kallar Kahar',
  },
  {
    icon: Sparkles,
    tone: 'bg-ai',
    title: 'Copilot: reroute 14 trips via M-9',
    sub: 'Saves 46 min each, PKR 412k this week',
  },
];

/**
 * Split-screen frame shared by sign in / register / password screens: on desktop the left side is a live night map of
 * the sample fleet with glass widgets and a customer quote, the form sits on the right. Colours, radii and type come
 * from the design tokens; the map is lazy-loaded and skipped on small screens.
 */
export default function AuthShell({
  children,
  variant = 'login',
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const [i, setI] = useState(0);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);

    on();
    mq.addEventListener('change', on);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return () => mq.removeEventListener('change', on);

    const t = setInterval(() => setI(n => (n + 1) % ALERTS.length), 5200);

    return () => {
      clearInterval(t);
      mq.removeEventListener('change', on);
    };
  }, []);

  const a = ALERTS[i];
  const Icon = a.icon;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-ink-0 lg:flex lg:flex-col lg:justify-between lg:p-14">
        {wide && <AuthMap />}
        {/* Scrim: keeps the copy readable over the map. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(100deg, color-mix(in srgb, var(--color-ink-0) 90%, transparent) 0%, color-mix(in srgb, var(--color-ink-0) 60%, transparent) 42%, color-mix(in srgb, var(--color-ink-0) 6%, transparent) 100%)',
          }}
          aria-hidden
        />
        <BrandMark size="lg" tone="light" className="relative" />

        <div className="relative max-w-[520px]">
          <div className="eyebrow !text-white/70">Automated fleet management</div>
          <h2 className="page-display mt-3 !text-white">
            {variant === 'register' ? (
              <>
                Start running your fleet with an <i className="text-brand-soft">AI co-pilot.</i>
              </>
            ) : (
              <>
                Run your fleet with an <i className="text-brand-soft">AI co-pilot.</i>
              </>
            )}
          </h2>
          <ul className="mt-8 flex flex-col gap-3">
            {POINTS[variant].map(p => {
              const PointIcon = p.icon;

              return (
                <li key={p.text} className="flex items-center gap-3 text-body text-white/85">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-white/10 text-brand-soft ring-1 ring-white/15">
                    <PointIcon size={17} />
                  </span>
                  {p.text}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative flex items-end justify-between gap-6">
          <figure className="max-w-[340px]">
            <blockquote className="text-control leading-6 text-white/85">
              “Dispatch finally sees where every truck actually is, not where the driver says it
              is.”
            </blockquote>
            <figcaption className="mt-2 text-caption text-white/60">
              Hamza Tariq, Head of Operations · Indus Freight Co.
            </figcaption>
          </figure>
          <div className="glass-strong w-[300px] shrink-0 p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.1em] text-ink-2">
              <RouteIcon size={12} aria-hidden /> Live from the fleet
            </div>
            <div key={i} className="motion-rise mt-3 flex items-start gap-3">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-white ${a.tone}`}
                aria-hidden
              >
                <Icon size={15} />
              </span>
              <span>
                <span className="block text-control font-semibold text-ink-0">{a.title}</span>
                <span className="block text-caption text-ink-2">{a.sub}</span>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <BrandMark className="mb-8 lg:hidden" />
        {children}
      </main>
    </div>
  );
}
