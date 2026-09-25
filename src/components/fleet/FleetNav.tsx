import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Fuel,
  Gauge,
  History,
  LayoutDashboard,
  Map as MapIcon,
  Radar,
  Route,
  Settings2,
  ShieldAlert,
  Truck,
  TriangleAlert,
  Users,
  Warehouse,
  Wrench,
} from 'lucide-react';

interface Item {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

const OPS = '/fleet-management/operations';
const AN = '/fleet-management/analytics';

/** Live, transactional screens (the former nine tabs, now one URL each). */
const OPERATIONS: Item[] = [
  { href: `${OPS}/overview`, label: 'Overview', icon: LayoutDashboard },
  { href: `${OPS}/map`, label: 'Map', icon: MapIcon },
  { href: `${OPS}/vehicles`, label: 'Vehicles', icon: Truck },
  { href: `${OPS}/drivers`, label: 'Drivers', icon: Users },
  { href: `${OPS}/geofences`, label: 'Geofences', icon: ShieldAlert },
  { href: `${OPS}/yards`, label: 'Yards', icon: Warehouse },
  { href: `${OPS}/trips`, label: 'Trips', icon: Route },
  { href: `${OPS}/assignments`, label: 'Assignments', icon: History },
  { href: `${OPS}/incidents`, label: 'Incidents', icon: TriangleAlert },
];

/** Historical, filterable reports. */
const ANALYTICS: Item[] = [
  { href: `${AN}/utilisation`, label: 'Utilisation', icon: Gauge },
  { href: `${AN}/trips`, label: 'Trips & delivery', icon: Route },
  { href: `${AN}/fuel`, label: 'Fuel & efficiency', icon: Fuel },
  { href: `${AN}/maintenance`, label: 'Maintenance', icon: Wrench },
];

const SETTINGS = '/fleet-management/settings';

/** The date-range / compare filters follow the operator between the Overview and the reports. */
const CARRY = ['range', 'from', 'to', 'compare', 'cmp'];

/** Scope + group-by query keys each report honours (see `useAnalyticsScope`); Overview and Utilisation take none. */
const SCOPE_CARRY: Record<string, string[]> = {
  [`${AN}/trips`]: ['category', 'vehicle', 'yard', 'costcentre', 'interval'],
  [`${AN}/fuel`]: ['category', 'vehicle', 'yard', 'costcentre', 'interval'],
  [`${AN}/maintenance`]: ['category', 'vehicle', 'interval'],
};

/**
 * Two-level navigation of the whole Fleet Management area (FLEET_ANALYTICS_DESIGN.md §2): a segment
 * switch — Operations (live) · Analytics (reports) — with the active segment's pages as tabs below, plus
 * a Settings entry. Every page is a real URL (deep links, back / forward). One sidebar entry stays.
 */
export default function FleetNav() {
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const inSettings = pathname.startsWith(SETTINGS);
  const segment: 'operations' | 'analytics' = pathname.startsWith(AN) ? 'analytics' : 'operations';
  const items = segment === 'analytics' ? ANALYTICS : OPERATIONS;

  // Carry the range filters only between the pages that use them (Overview + reports).
  const carried = new URLSearchParams();

  CARRY.forEach(k => {
    const v = params?.get(k);

    if (v) carried.set(k, v);
  });

  // The scope (vehicle category / vehicles / yard / cost centre) follows the operator between the reports that
  // can honour it — never into a page that would ignore it silently.
  const withFilters = (href: string) => {
    const q = new URLSearchParams(carried);

    (SCOPE_CARRY[href] ?? []).forEach(k => {
      const v = params?.get(k);

      if (v) q.set(k, v);
    });

    return (href === `${OPS}/overview` || href.startsWith(AN)) && q.size
      ? `${href}?${q.toString()}`
      : href;
  };

  const segments: {
    key: 'operations' | 'analytics';
    label: string;
    href: string;
    icon: Item['icon'];
  }[] = [
    { key: 'operations', label: 'Operations', href: OPERATIONS[0].href, icon: Radar },
    { key: 'analytics', label: 'Analytics', href: ANALYTICS[0].href, icon: BarChart3 },
  ];

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between gap-3 pt-1">
        <nav aria-label="Fleet sections">
          <div className="glass-strong inline-flex items-center gap-0.5 rounded-full p-1">
            {segments.map(s => {
              const on = !inSettings && segment === s.key;
              const Icon = s.icon;

              return (
                <Link
                  key={s.key}
                  href={withFilters(s.href)}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                    on
                      ? 'btn-brand border border-transparent'
                      : 'text-ink-1 hover:text-ink-0 border border-transparent'
                  }`}
                >
                  <Icon size={13} /> {s.label}
                </Link>
              );
            })}
          </div>
        </nav>
        <Link
          href={SETTINGS}
          aria-current={inSettings ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
            inSettings
              ? 'text-ink-0 bg-surface-2 border-line'
              : 'text-ink-1 hover:text-ink-0 border-transparent hover:bg-surface-2'
          }`}
        >
          <Settings2 size={13} />{' '}
          <span className="hidden whitespace-nowrap sm:inline">Fleet settings</span>
        </Link>
      </div>

      {inSettings ? (
        <div className="h-1" />
      ) : (
        <nav
          aria-label={segment === 'analytics' ? 'Analytics pages' : 'Operations pages'}
          className="flex gap-1.5 pt-3 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map(t => {
            const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
            const Icon = t.icon;

            return (
              <Link
                key={t.href}
                href={withFilters(t.href)}
                aria-current={on ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cyan ${
                  on ? 'bg-ink-0 text-white' : 'text-ink-1 hover:bg-black/[0.06]'
                }`}
              >
                <Icon size={13} /> {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
