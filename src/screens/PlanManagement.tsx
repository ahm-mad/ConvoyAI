'use client';

import toast from 'react-hot-toast';
import { Check, Sparkles } from 'lucide-react';
import { useFleetCurrency } from '@utils/fleetCurrency';

interface Plan {
  key: string;
  name: string;
  price: string;
  /** Show the company currency code before the amount. */
  money?: boolean;
  per: string;
  blurb: string;
  features: string[];
  current?: boolean;
}

const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 'Free',
    per: 'for small fleets',
    blurb: 'Everything to run up to 25 vehicles.',
    features: ['25 vehicles', 'Live map & trips', 'Basic analytics', 'Community support'],
  },
  {
    key: 'growth',
    name: 'Growth',
    price: '1,200',
    money: true,
    per: 'per vehicle / month',
    blurb: 'Full fleet operations with the AI copilot.',
    features: [
      'Up to 250 vehicles',
      'AI copilot & insights',
      'Fleet analytics suite',
      'Roles & permissions',
      'Priority email support',
    ],
    current: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    per: 'annual contract',
    blurb: 'Scale, compliance and integrations for large operators.',
    features: [
      'Unlimited vehicles',
      'SSO & audit log',
      'Dedicated integrations',
      'Custom data retention',
      '24/7 support & SLA',
    ],
  },
];

const USAGE = [
  { label: 'Vehicles', used: 69, cap: 250 },
  { label: 'Drivers', used: 47, cap: 250 },
  { label: 'Connected devices', used: 4, cap: 500 },
  { label: 'Members', used: 1, cap: 25 },
];

export default function PlanManagement() {
  const currency = useFleetCurrency();

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Billing</div>
          <h1 className="page-title mt-1">Plan &amp; usage</h1>
          <p className="page-subtitle mt-1 max-w-xl">
            Your subscription, what it includes and how much of it you are using. Billing is a
            preview here — plans are not charged.
          </p>
        </div>
        <span className="rounded-full bg-ai-wash px-3 py-1 text-[11px] font-medium text-ai">
          Preview
        </span>
      </div>

      <div className="glass mb-6 grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {USAGE.map(u => {
          const pct = Math.min(100, Math.round((u.used / u.cap) * 100));

          return (
            <div key={u.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-1">{u.label}</span>
                <span className="text-xs text-ink-2 tabular-nums">
                  {u.used} / {u.cap}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: 'var(--gradient-brand)' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map(p => (
          <div
            key={p.key}
            className={`glass card-lift flex flex-col gap-4 p-6 ${p.current ? 'ring-2 ring-brand' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="card-title">{p.name}</div>
              {p.current && (
                <span className="btn-brand rounded-full px-2.5 py-1 text-[11px] font-medium">
                  Current plan
                </span>
              )}
            </div>
            <div>
              <div className="kpi-value">{p.money ? `${currency} ${p.price}` : p.price}</div>
              <div className="text-xs text-ink-2">{p.per}</div>
            </div>
            <p className="text-sm text-ink-1">{p.blurb}</p>
            <ul className="flex-1 space-y-2">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-ink-0">
                  <Check size={15} className="text-success" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={p.current}
              onClick={() => toast.success(`Thanks — our team will reach out about ${p.name}.`)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium disabled:opacity-60 ${p.current ? 'btn-soft' : 'btn-ai'}`}
            >
              {p.current ? (
                'Your plan'
              ) : (
                <>
                  <Sparkles size={13} /> Talk to sales
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
