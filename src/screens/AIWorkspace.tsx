import { useState } from 'react';
import { CalendarClock, ShieldAlert, Sparkles, TrendingDown, Wrench } from 'lucide-react';
import CopilotChat from '@components/shell/CopilotChat';
import { useCompanyMoney } from '@hooks/useCompanyMoney';

/** Illustrative data (no AI backend yet): everything on this page is clearly labelled Preview. */
const MAINTENANCE = [
  { vehicle: 'KHI-0764', days: 9, risk: 88 },
  { vehicle: 'LHE-1180', days: 12, risk: 71 },
  { vehicle: 'ISB-3302', days: 19, risk: 46 },
  { vehicle: 'KHI-2291', days: 27, risk: 30 },
];

const DRIVERS = [
  { name: 'Bilal Ahmed', score: 96 },
  { name: 'Sara Khan', score: 84 },
  { name: 'Hamza Iqbal', score: 71 },
  { name: 'Usman Tariq', score: 58 },
];

const AUTOMATIONS = [
  {
    key: 'reroute',
    title: 'Auto-reroute around closures',
    text: 'Apply AI route changes to planned trips',
    on: true,
  },
  {
    key: 'service',
    title: 'Book services automatically',
    text: 'Schedule maintenance when risk passes 80%',
    on: false,
  },
  {
    key: 'idle',
    title: 'Idle-time nudges',
    text: 'Message drivers idling over 15 minutes',
    on: true,
  },
  {
    key: 'digest',
    title: 'Weekly cost digest',
    text: 'Email savings and risks every Monday',
    on: true,
  },
];

function Ring({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const tone = value >= 85 ? 'stroke-success' : value >= 70 ? 'stroke-gold' : 'stroke-danger';

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`Score ${value}`}>
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-black/[0.07]" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 24 24)"
        className={tone}
      />
      <text x="24" y="28" textAnchor="middle" className="fill-ink-0 text-[12px] font-semibold">
        {value}
      </text>
    </svg>
  );
}

export default function AIWorkspace() {
  const money = useCompanyMoney();
  const [auto, setAuto] = useState<Record<string, boolean>>(
    Object.fromEntries(AUTOMATIONS.map(a => [a.key, a.on]))
  );

  return (
    <div className="flex flex-col gap-6 pb-12 pt-3">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Convoy AI</div>
          <h1 className="page-title mt-1">AI workspace</h1>
          <p className="page-subtitle mt-1">
            Ask questions, review predictions and switch on automations for your whole fleet.
          </p>
        </div>
        <span className="rounded-full bg-ai-wash px-3 py-1 text-caption font-semibold text-ai-ink">
          Preview data
        </span>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section
          className="glass rounded-modal relative flex h-[640px] flex-col overflow-hidden"
          style={{ background: 'var(--gradient-copilot)' }}
          aria-label="Convoy Copilot chat"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{ background: 'var(--gradient-copilot-glow)' }}
          />
          <div className="relative flex items-center gap-3 px-6 pb-3 pt-5">
            <div
              className="relative size-10 rounded-full shadow-ai motion-spin-slow"
              style={{ background: 'var(--gradient-ai-orb)' }}
            >
              <span
                className="absolute inset-1 rounded-full"
                style={{ background: 'var(--gradient-orb-core)' }}
              />
            </div>
            <div>
              <h2 className="card-title">Convoy Copilot</h2>
              <p className="card-subtitle">Reads your live fleet data</p>
            </div>
          </div>
          <CopilotChat />
        </section>

        <div className="flex flex-col gap-6">
          <section className="glass p-6">
            <div className="flex items-center gap-2 text-caption text-ink-2">
              <span className="btn-ai grid size-8 place-items-center rounded-control">
                <Sparkles size={15} fill="currentColor" />
              </span>
              AI savings found this week
            </div>
            <div className="kpi-value mt-3">{money(412_000)}</div>
            <p className="mt-2 flex items-center gap-1.5 text-caption font-semibold text-success">
              <TrendingDown size={14} /> 3 actions ready to apply
            </p>
          </section>

          <section className="glass p-6">
            <h2 className="card-title">Automations</h2>
            <p className="card-subtitle">Let Convoy act on its own</p>
            <ul className="mt-4 flex flex-col gap-3">
              {AUTOMATIONS.map(a => (
                <li key={a.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-control font-semibold text-ink-0">{a.title}</div>
                    <div className="text-caption text-ink-2">{a.text}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={auto[a.key]}
                    aria-label={a.title}
                    onClick={() => setAuto(s => ({ ...s, [a.key]: !s[a.key] }))}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${auto[a.key] ? 'btn-ai' : 'bg-black/[0.12]'}`}
                  >
                    <span
                      className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow-card transition-transform ${auto[a.key] ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="grid gap-6 motion-stagger lg:grid-cols-3">
        <section className="glass p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-gold-wash text-gold-ink icon-tile icon-tile--gold">
              <Wrench size={17} />
            </span>
            <div>
              <h2 className="card-title">Maintenance forecast</h2>
              <p className="card-subtitle">Days until likely service</p>
            </div>
          </div>
          <ul className="mt-5 flex flex-col gap-3.5">
            {MAINTENANCE.map(m => (
              <li
                key={m.vehicle}
                className="grid grid-cols-[76px_1fr_52px] items-center gap-3 text-caption"
              >
                <span className="font-medium text-ink-0">{m.vehicle}</span>
                <div className="h-2 rounded-full bg-ai-wash">
                  <i
                    className="block h-full rounded-full"
                    style={{ width: `${m.risk}%`, background: 'var(--gradient-ai)' }}
                  />
                </div>
                <b className="text-right tabular-nums text-ink-0">{m.days} d</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
              <CalendarClock size={17} />
            </span>
            <div>
              <h2 className="card-title">Fuel spend forecast</h2>
              <p className="card-subtitle">Next 7 days, all vehicles</p>
            </div>
          </div>
          <svg
            viewBox="0 0 320 150"
            className="mt-4 w-full"
            role="img"
            aria-label="Fuel spend forecast chart"
          >
            <defs>
              <linearGradient id="ai-fuel" x1="0" y1="0" x2="0" y2="1">
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
              <path d="M0 30H320M0 70H320M0 110H320" />
            </g>
            <path
              d="M0 100 C40 90 70 60 110 66 S180 40 220 50 S290 30 320 24 V130 H0Z"
              fill="url(#ai-fuel)"
            />
            <path
              d="M0 100 C40 90 70 60 110 66 S180 40 220 50 S290 30 320 24"
              fill="none"
              className="stroke-brand"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M200 52 C240 56 280 44 320 40"
              fill="none"
              className="stroke-ai"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="2 6"
            />
          </svg>
          <p className="mt-2 text-caption text-ink-2">
            Projected <b className="text-ink-0">{money(3_100_000)}</b>, 6% under plan.
          </p>
        </section>

        <section className="glass p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-danger/10 text-danger-text icon-tile icon-tile--danger">
              <ShieldAlert size={17} />
            </span>
            <div>
              <h2 className="card-title">Driver risk score</h2>
              <p className="card-subtitle">Higher is safer</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {DRIVERS.map(d => (
              <li key={d.name} className="flex items-center gap-3">
                <Ring value={d.score} />
                <span className="text-control font-medium text-ink-0">{d.name}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
