import type { ReactNode } from 'react';
import { Route as RouteIcon, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import BrandMark from '@components/shell/BrandMark';

const POINTS = [
  { icon: Truck, text: 'Live fleet map, trips and dispatch in one place' },
  { icon: Sparkles, text: 'AI copilot that spots cost, risk and maintenance early' },
  { icon: ShieldCheck, text: 'Enterprise roles and permissions built in' },
];

/**
 * Split-screen frame shared by sign in / register / password screens: brand + product preview on the
 * left (desktop only), the form on the right. Colours, radii and type come from the design tokens.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--gradient-page-glow)' }}
          aria-hidden
        />
        <BrandMark size="lg" className="relative" />

        <div className="relative max-w-[520px]">
          <div className="eyebrow">Automated fleet management</div>
          <h2 className="page-display mt-3">
            Run your fleet with an <i className="text-brand">AI co-pilot.</i>
          </h2>
          <ul className="mt-8 flex flex-col gap-3">
            {POINTS.map(p => {
              const Icon = p.icon;

              return (
                <li key={p.text} className="flex items-center gap-3 text-body text-ink-1">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
                    <Icon size={17} />
                  </span>
                  {p.text}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative flex items-end gap-4">
          <div className="glass motion-float w-56 p-5">
            <div className="flex items-center gap-2 text-caption text-ink-2">
              <span className="grid size-7 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
                <RouteIcon size={14} />
              </span>
              Fleet utilisation
            </div>
            <div className="kpi-value mt-3">
              87.4<span className="text-body text-ink-2">%</span>
            </div>
            <div className="mt-2 text-caption font-semibold text-success">▲ 4.2% vs last week</div>
          </div>
          <div
            className="glass-strong motion-float w-64 p-4"
            style={{ ['--delay' as string]: '1.2s' }}
          >
            <div className="flex items-center gap-2 text-caption font-semibold text-ai-ink">
              <span className="btn-ai grid size-7 place-items-center rounded-control">
                <Sparkles size={13} fill="currentColor" />
              </span>
              AI insight
            </div>
            <p className="mt-2 text-control text-ink-1">
              Reroute 14 trips via M-9 and save <b className="text-ink-0">46 min</b> each.
            </p>
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
