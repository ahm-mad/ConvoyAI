import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Fuel,
  Map as MapIcon,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wrench,
  Check,
} from 'lucide-react';
import BrandMark from '@components/shell/BrandMark';
import HeroVisual from './HeroVisual';

const NAV = [
  ['Product', '#product'],
  ['AI', '#ai'],
  ['Analytics', '#analytics'],
  ['Security', '#security'],
];

const STATS = [
  ['26.8k', 'km tracked every day'],
  ['91%', 'trips delivered on time'],
  ['−18%', 'harsh braking events'],
  ['412k', 'PKR saved weekly by AI'],
];

const FEATURES = [
  {
    icon: MapIcon,
    title: 'Live fleet map',
    text: 'Every vehicle, yard and geofence on one real-time map with trails and trip routes.',
  },
  {
    icon: Route,
    title: 'Trips & dispatch',
    text: 'Plan multi-stop trips, track progress from sensors, and confirm delivery in seconds.',
  },
  {
    icon: Users,
    title: 'Drivers & compliance',
    text: 'Licences, documents and assignments with expiry alerts before they become fines.',
  },
  {
    icon: Fuel,
    title: 'Fuel & cost',
    text: 'Economy, spend by vendor and fill-ups worth a second look, all in your currency.',
  },
  {
    icon: Wrench,
    title: 'Maintenance',
    text: 'Schedules by date or odometer, service history and due-soon buckets.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles & permissions',
    text: 'Granular access for dispatchers, managers and auditors across companies.',
  },
];

const ROLES = [
  ['Admin', [true, true, true, true]],
  ['Manager', [true, true, true, false]],
  ['Dispatcher', [true, true, false, false]],
  ['Auditor', [true, false, false, false]],
] as const;

export default function Landing() {
  return (
    <div className="min-h-screen scroll-smooth">
      <header className="page-container sticky top-0 z-40 pt-3.5">
        <nav
          className="glass glass-pill mx-auto flex max-w-nav items-center gap-3 py-2.5 pl-5 pr-2.5"
          aria-label="Main"
        >
          <BrandMark />
          <ul className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <a
                  href={href}
                  className="rounded-full px-4 py-2 text-control font-medium text-ink-1 hover:bg-black/[0.06]"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <span className="flex-1" />
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-control font-semibold text-ink-0 hover:bg-black/[0.06]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="btn-brand rounded-full px-5 py-2.5 text-control font-semibold"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="page-container pb-16 pt-16 text-center md:pt-24">
          <div className="glass-strong glass-pill mx-auto inline-flex items-center gap-2 px-4 py-2 text-caption font-medium text-ink-1">
            <span className="btn-ai grid size-5 place-items-center rounded-full">
              <Sparkles size={11} fill="currentColor" />
            </span>
            Automated fleet management with an AI co-pilot
          </div>
          <h1 className="page-display mx-auto mt-6 max-w-[900px]">
            Fleet management that <i className="text-brand">thinks ahead.</i>
          </h1>
          <p className="mx-auto mt-6 max-w-[620px] text-[1.0625rem] leading-7 text-ink-1">
            Track vehicles, dispatch trips and control costs in one beautiful workspace, while
            ConvoyAI spots risk, waste and maintenance before they cost you.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="btn-brand inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-body font-semibold transition-transform hover:-translate-y-0.5"
            >
              Start free <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="control inline-flex items-center gap-2 !px-7 !py-3.5 font-semibold"
            >
              Sign in
            </Link>
          </div>
          <div className="mt-16">
            <HeroVisual />
          </div>
        </section>

        <section className="page-container pb-20">
          <div className="glass grid grid-cols-2 gap-y-8 p-8 md:grid-cols-4">
            {STATS.map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="kpi-value">{v}</div>
                <div className="mt-2 text-caption text-ink-2">{l}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="product" className="page-container scroll-mt-24 pb-24">
          <div className="mx-auto max-w-[640px] text-center">
            <div className="eyebrow">Everything in one place</div>
            <h2 className="page-title mt-3">One workspace for your whole fleet</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => {
              const Icon = f.icon;
              return (
                <article key={f.title} className="glass card-lift p-7">
                  <span className="brand-gradient-bg grid size-12 place-items-center rounded-card shadow-glow">
                    <Icon size={22} className="text-white" />
                  </span>
                  <h3 className="card-title mt-5">{f.title}</h3>
                  <p className="mt-2 text-body text-ink-1">{f.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="ai" className="page-container scroll-mt-24 pb-24">
          <div
            className="glass rounded-modal grid items-center gap-10 p-8 md:p-14 lg:grid-cols-2"
            style={{ background: 'var(--gradient-copilot)' }}
          >
            <div>
              <div className="eyebrow">Convoy Copilot</div>
              <h2 className="page-title mt-3">Ask your fleet anything.</h2>
              <p className="mt-4 text-body text-ink-1">
                Costs, risk, maintenance, routes. The copilot reads your live data, explains what it
                sees and proposes the next action.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  'Predicts brake wear and service dates',
                  'Flags drivers close to hours limits',
                  'Finds fuel waste and reroutes trips',
                ].map(t => (
                  <li key={t} className="flex items-center gap-3 text-body text-ink-0">
                    <span className="btn-ai grid size-6 place-items-center rounded-full">
                      <Check size={13} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <div className="max-w-[80%] self-end rounded-[18px_18px_4px_18px] bg-ink-0 px-4 py-3 text-control text-white">
                Which vehicles will cost the most in fuel this week?
              </div>
              <div className="glass-strong p-5 text-control text-ink-1">
                Five vehicles account for <b className="text-ink-0">38%</b> of projected fuel spend.
                <div className="mt-4 flex flex-col gap-2.5">
                  {[
                    ['KHI-2291', 92, 'PKR 84k'],
                    ['LHE-1180', 78, 'PKR 71k'],
                    ['KHI-0764', 66, 'PKR 60k'],
                  ].map(([n, w, v]) => (
                    <div
                      key={String(n)}
                      className="grid grid-cols-[76px_1fr_64px] items-center gap-3 text-caption"
                    >
                      <span>{n}</span>
                      <div className="h-2 rounded-full bg-ai-wash">
                        <i
                          className="block h-full rounded-full"
                          style={{ width: `${w}%`, background: 'var(--gradient-ai)' }}
                        />
                      </div>
                      <b className="text-right tabular-nums text-ink-0">{v}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="analytics" className="page-container scroll-mt-24 pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <div className="eyebrow">Analytics</div>
              <h2 className="page-title mt-3">Numbers you can act on.</h2>
              <p className="mt-4 text-body text-ink-1">
                Utilisation, on-time delivery, cost per km and fuel economy with period comparison,
                targets and one-click CSV export.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-control font-semibold text-brand">
                <BarChart3 size={16} /> Built-in reports for every department
              </span>
            </div>
            <div className="glass p-6">
              <div className="card-title">Distance & fuel efficiency</div>
              <div className="card-subtitle">Last 7 days</div>
              <svg
                viewBox="0 0 560 220"
                className="mt-4 w-full"
                role="img"
                aria-label="Sample area chart"
              >
                <defs>
                  <linearGradient id="lp-area" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0"
                      style={{ stopColor: 'var(--color-brand-bright)', stopOpacity: 0.4 }}
                    />
                    <stop
                      offset="1"
                      style={{ stopColor: 'var(--color-brand-bright)', stopOpacity: 0 }}
                    />
                  </linearGradient>
                </defs>
                <g className="stroke-line" strokeDasharray="3 5">
                  <path d="M0 40H560M0 90H560M0 140H560M0 190H560" />
                </g>
                <path
                  d="M0 150 C60 130 90 80 150 92 S230 50 280 66 S360 34 410 52 S500 90 560 40 V190 H0Z"
                  fill="url(#lp-area)"
                />
                <path
                  d="M0 150 C60 130 90 80 150 92 S230 50 280 66 S360 34 410 52 S500 90 560 40"
                  fill="none"
                  className="stroke-brand"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M0 110 C60 118 100 130 150 120 S230 128 280 116 S360 126 410 110 S500 104 560 100"
                  fill="none"
                  className="stroke-gold"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </section>

        <section id="security" className="page-container scroll-mt-24 pb-24">
          <div className="mx-auto max-w-[640px] text-center">
            <div className="eyebrow">Security</div>
            <h2 className="page-title mt-3">The right access for every role.</h2>
          </div>
          <div className="glass mx-auto mt-10 max-w-[760px] overflow-x-auto p-2">
            <table className="w-full text-left text-control">
              <thead>
                <tr className="text-micro uppercase tracking-[0.1em] text-ink-2">
                  <th className="px-5 py-3 font-medium">Role</th>
                  {['View', 'Dispatch', 'Edit', 'Admin'].map(h => (
                    <th key={h} className="px-5 py-3 text-center font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map(([role, perms]) => (
                  <tr key={role} className="border-t border-line-soft">
                    <td className="px-5 py-3.5 font-semibold text-ink-0">{role}</td>
                    {perms.map((on, i) => (
                      <td key={i} className="px-5 py-3.5 text-center">
                        {on ? (
                          <span className="mx-auto grid size-6 place-items-center rounded-full bg-success/15 text-success">
                            <Check size={13} />
                          </span>
                        ) : (
                          <span className="text-ink-2">–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="page-container pb-24">
          <div className="brand-gradient-bg rounded-modal relative overflow-hidden p-10 text-center text-white shadow-glow md:p-16">
            <h2 className="page-title !text-white">Put your fleet on autopilot.</h2>
            <p className="mx-auto mt-4 max-w-[520px] text-body text-white/85">
              Create your workspace in minutes and let ConvoyAI start finding savings on day one.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-body font-semibold text-brand-ink shadow-card"
              >
                Get started <ArrowRight size={16} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-full border border-white/50 px-7 py-3.5 text-body font-semibold text-white"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="page-container pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-caption text-ink-2">
          <BrandMark />
          <span>© {new Date().getFullYear()} ConvoyAI. Automated fleet management.</span>
          <span className="flex items-center gap-2">
            <Truck size={14} /> Built for fleets that never stop.
          </span>
        </div>
      </footer>
    </div>
  );
}
