import Link from 'next/link';
import {
  Anchor,
  ArrowRight,
  Fuel,
  Milk,
  Mountain,
  Package,
  PlugZap,
  Route,
  Snowflake,
  Sparkles,
  Truck,
  Radar,
  Quote,
} from 'lucide-react';
import BrandMark from '@components/shell/BrandMark';

const LOGOS = [
  { name: 'Indus Freight Co.', icon: Truck },
  { name: 'Karakoram Logistics', icon: Mountain },
  { name: 'Sohail Petroleum', icon: Fuel },
  { name: 'Punjab Roadways', icon: Route },
  { name: 'Crescent Cold Chain', icon: Snowflake },
  { name: 'Gwadar Marine Transport', icon: Anchor },
  { name: 'Al-Noor Distribution', icon: Package },
  { name: 'Lahore Dairy Collective', icon: Milk },
];

/** Customer strip under the hero: "trusted by" with wordmark-style names. */
export function LogoStrip() {
  return (
    <section className="page-container pb-16" aria-labelledby="trusted-by">
      <p id="trusted-by" className="text-center text-caption font-medium text-ink-2">
        Trusted by 380 fleets across Pakistan and the Gulf
      </p>
      <ul className="mt-6 grid grid-cols-2 items-center gap-x-6 gap-y-5 sm:grid-cols-4">
        {LOGOS.map(({ name, icon: Icon }) => (
          <li
            key={name}
            className="flex items-center justify-center gap-2 text-ink-2 transition-colors hover:text-ink-0"
          >
            <Icon size={20} strokeWidth={1.9} aria-hidden />
            <span className="font-serif text-[1.05rem] tracking-tight">{name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  {
    icon: PlugZap,
    title: 'Connect your fleet',
    text: 'Add vehicles and trackers in minutes: GPS devices, OBD dongles or your existing telematics API. No hardware lock-in.',
  },
  {
    icon: Radar,
    title: 'See everything live',
    text: 'Map, trips, drivers, fuel and maintenance in one workspace, with alerts for speeding, late trips and geofences.',
  },
  {
    icon: Sparkles,
    title: 'Let the copilot work',
    text: 'Every morning it ranks what to fix by money saved: reroutes, service dates, drivers near their hours limit.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="page-container scroll-mt-24 pb-24">
      <div className="mx-auto max-w-[640px] text-center">
        <div className="eyebrow">How it works</div>
        <h2 className="page-title mt-3">Live in an afternoon, saving by Friday.</h2>
      </div>
      <ol className="motion-stagger relative mt-12 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;

          return (
            <li key={s.title} className="glass card-lift relative p-7">
              <div className="flex items-center justify-between">
                <span className="brand-gradient-bg grid size-11 place-items-center rounded-card shadow-glow">
                  <Icon size={20} className="text-white" aria-hidden />
                </span>
                <span className="font-serif text-[2.5rem] leading-none text-ink-2/40" aria-hidden>
                  0{i + 1}
                </span>
              </div>
              <h3 className="card-title mt-5">{s.title}</h3>
              <p className="mt-2 text-body text-ink-1">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const QUOTES = [
  {
    quote:
      'We cut idle time by a third in the first quarter. Dispatch finally sees where every truck actually is, not where the driver says it is.',
    name: 'Hamza Tariq',
    role: 'Head of Operations',
    company: 'Indus Freight Co.',
    metric: '−31% idle time',
    tone: 'bg-brand-wash text-brand-ink',
  },
  {
    quote:
      'The copilot flagged brake wear on three trailers before an inspection did. That single alert paid for the whole year.',
    name: 'Sana Malik',
    role: 'Fleet Maintenance Lead',
    company: 'Karakoram Logistics',
    metric: '3 breakdowns avoided',
    tone: 'bg-ai-wash text-ai-ink',
  },
  {
    quote:
      'Roles and permissions decided it for us. Auditors are read-only, dispatchers get the map, and nobody sees more than they need.',
    name: 'Adeel Rauf',
    role: 'IT Director',
    company: 'Sohail Petroleum',
    metric: '12 depots, 4 roles',
    tone: 'bg-moving-wash text-moving-text',
  },
];

const initials = (n: string) =>
  n
    .split(' ')
    .map(p => p[0])
    .join('');

export function Testimonials() {
  return (
    <section id="customers" className="page-container scroll-mt-24 pb-24">
      <div className="mx-auto max-w-[640px] text-center">
        <div className="eyebrow">Customers</div>
        <h2 className="page-title mt-3">Fleets that stopped guessing.</h2>
      </div>
      <div className="motion-stagger mt-12 grid gap-5 lg:grid-cols-3">
        {QUOTES.map(q => (
          <figure key={q.name} className="glass card-lift flex flex-col p-7">
            <Quote size={22} className="text-brand" aria-hidden />
            <blockquote className="mt-4 flex-1 text-body leading-7 text-ink-0">
              {q.quote}
            </blockquote>
            <span className="mt-5 inline-flex w-fit rounded-full bg-black/[0.05] px-3 py-1 text-caption font-semibold text-ink-0">
              {q.metric}
            </span>
            <figcaption className="mt-5 flex items-center gap-3 border-t border-line-soft pt-5">
              <span
                className={`grid size-11 place-items-center rounded-full text-control font-semibold ${q.tone}`}
                aria-hidden
              >
                {initials(q.name)}
              </span>
              <span>
                <span className="block text-control font-semibold text-ink-0">{q.name}</span>
                <span className="block text-caption text-ink-2">
                  {q.role}, {q.company}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Glowing routes and stops behind the closing call to action (pure SVG: no second WebGL map on the page). */
function RouteField() {
  const routes = [
    'M-20 210 C140 150 220 250 380 190 S600 90 780 150 S960 230 1040 120',
    'M-20 90 C120 130 260 40 420 80 S640 200 820 110 S980 40 1040 70',
    'M120 300 C220 240 320 260 430 200 S650 210 760 260',
  ];
  const stops: [number, number][] = [
    [380, 190],
    [780, 150],
    [420, 80],
    [820, 110],
    [430, 200],
  ];

  return (
    <svg
      viewBox="0 0 1000 300"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full opacity-70"
      // The routes fade out behind the text so the copy stays crisp.
      style={{
        maskImage: 'radial-gradient(ellipse 42% 60% at 50% 50%, transparent 30%, black 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 42% 60% at 50% 50%, transparent 30%, black 100%)',
      }}
      aria-hidden
    >
      {routes.map(d => (
        <g key={d} fill="none" strokeLinecap="round">
          <path d={d} stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
          <path d={d} stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" className="lp-route-flow" />
        </g>
      ))}
      {stops.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="14" fill="rgba(255,255,255,0.2)" className="lp-stop-ping" />
          <circle cx={x} cy={y} r="5" fill="white" />
        </g>
      ))}
    </svg>
  );
}

export function FinalCta() {
  return (
    <section className="page-container pb-24">
      <div className="brand-gradient-bg rounded-modal relative overflow-hidden p-10 text-center text-white shadow-glow md:p-20">
        <RouteField />
        <div className="relative">
          <h2 className="page-title !text-white">Put your fleet on autopilot.</h2>
          <p className="mx-auto mt-4 max-w-[540px] text-body text-white/90">
            Create your workspace in minutes. Import vehicles from a spreadsheet, connect trackers
            and let ConvoyAI start finding savings on day one.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-body font-semibold text-brand-ink shadow-card transition-transform hover:-translate-y-0.5"
            >
              Get started free <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-white/50 px-7 py-3.5 text-body font-semibold text-white hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-5 text-caption text-white/80">
            No credit card · Free 30-day trial · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}

const COLUMNS: [string, [string, string][]][] = [
  [
    'Product',
    [
      ['Live fleet map', '#product'],
      ['Trips & dispatch', '#product'],
      ['Analytics', '#analytics'],
      ['Convoy Copilot', '#ai'],
    ],
  ],
  [
    'Company',
    [
      ['Customers', '#customers'],
      ['How it works', '#how'],
      ['Security', '#security'],
      ['Contact sales', '/register'],
    ],
  ],
  [
    'Resources',
    [
      ['Documentation', '/login'],
      ['API reference', '/login'],
      ['Integrations', '/login'],
      ['System status', '#'],
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="page-container pb-10">
      <div className="border-t border-line pt-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <BrandMark />
            <p className="mt-4 max-w-[300px] text-caption leading-6 text-ink-2">
              Automated fleet management with an AI co-pilot, built for fleets that never stop.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1.5 text-caption font-medium text-ink-1">
              <i className="size-2 rounded-full bg-moving" /> All systems operational
            </span>
          </div>
          {COLUMNS.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <div className="eyebrow">{title}</div>
              <ul className="mt-4 flex flex-col gap-2.5">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-control text-ink-1 hover:text-ink-0">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-6 text-caption text-ink-2">
          <span>© {new Date().getFullYear()} ConvoyAI. All rights reserved.</span>
          <span className="flex gap-5">
            <a href="#" className="hover:text-ink-0">
              Privacy
            </a>
            <a href="#" className="hover:text-ink-0">
              Terms
            </a>
            <a href="#" className="hover:text-ink-0">
              Security
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
