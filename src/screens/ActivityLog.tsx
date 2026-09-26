'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { get } from '@utils/apiHelper';
import { useFleetSettings } from '@hooks/useFleetSettings';

type Kind = 'vehicle' | 'driver' | 'trip' | 'incident' | 'yard' | 'geofence';

interface Entry {
  key: string;
  kind: Kind;
  at: string;
  verb: 'created' | 'updated';
  actor: string;
  subject: string;
  href: string;
}

const META: Record<Kind, { label: string; icon: LucideIcon; href: string; url: string }> = {
  vehicle: {
    label: 'Vehicles',
    icon: Truck,
    href: '/fleet-management/operations/vehicles',
    url: '/api/vehicles',
  },
  driver: {
    label: 'Drivers',
    icon: Users,
    href: '/fleet-management/operations/drivers',
    url: '/api/drivers',
  },
  trip: {
    label: 'Trips',
    icon: RouteIcon,
    href: '/fleet-management/operations/trips',
    url: '/api/trips',
  },
  incident: {
    label: 'Incidents',
    icon: AlertTriangle,
    href: '/fleet-management/operations/incidents',
    url: '/api/incidents',
  },
  yard: {
    label: 'Yards',
    icon: Warehouse,
    href: '/fleet-management/operations/yards',
    url: '/api/yards',
  },
  geofence: {
    label: 'Geofences',
    icon: ShieldCheck,
    href: '/fleet-management/operations/geofences',
    url: '/api/geofences',
  },
};

const KINDS = Object.keys(META) as Kind[];

const person = (u: any) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'System';

const subjectOf = (kind: Kind, x: any): string => {
  if (kind === 'driver')
    return [x.first_name, x.last_name].filter(Boolean).join(' ') || `Driver #${x.id}`;
  if (kind === 'trip') return x.trip_reference || `Trip #${x.id}`;
  if (kind === 'incident') return x.incident_type || `Incident #${x.id}`;

  return x.name || `#${x.id}`;
};

async function load(kind: Kind): Promise<Entry[]> {
  const res: any = await get(META[kind].url, {
    page: 1,
    per_page: 12,
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const data = res?.data;
  const items: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);

  return items.map(x => {
    const created = x.created_at as string;
    const updated = (x.updated_at as string) || created;
    const edited = updated && created && Date.parse(updated) - Date.parse(created) > 60_000;

    return {
      key: `${kind}-${x.id}`,
      kind,
      at: edited ? updated : created,
      verb: edited ? 'updated' : 'created',
      actor: person(edited ? (x.updated_by_user ?? x.created_by_user) : x.created_by_user),
      subject: subjectOf(kind, x),
      href: META[kind].href,
    } as Entry;
  });
}

const ymd = (d: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(d);
  }
};

const dayLabel = (iso: string, tz: string) => {
  const d = new Date(iso);
  const key = ymd(d, tz);
  const now = new Date();

  if (key === ymd(now, tz)) return 'Today';
  if (key === ymd(new Date(now.getTime() - 86_400_000), tz)) return 'Yesterday';

  return d.toLocaleDateString(undefined, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** Who changed what: the latest records across the fleet, newest first (from each record's created/updated stamps). */
export default function ActivityLog() {
  const { settings } = useFleetSettings();
  const tz = settings?.timezone ?? 'UTC';
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const q = useQuery({
    queryKey: ['activity-log'],
    networkMode: 'always',
    queryFn: async () => {
      const lists = await Promise.all(KINDS.map(k => load(k).catch(() => [] as Entry[])));

      return lists.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    },
  });

  const shown = useMemo(
    () => (q.data ?? []).filter(e => filter === 'all' || e.kind === filter).slice(0, 60),
    [q.data, filter]
  );
  const groups = useMemo(() => {
    const m = new Map<string, Entry[]>();

    shown.forEach(e => {
      const k = dayLabel(e.at, tz);

      m.set(k, [...(m.get(k) ?? []), e]);
    });

    return [...m.entries()];
  }, [shown, tz]);

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Audit</div>
          <h1 className="page-title mt-1">Activity log</h1>
          <p className="page-subtitle mt-1 max-w-xl">
            Who created or changed vehicles, drivers, trips, incidents, yards and geofences — newest
            first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="btn-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
        >
          <RefreshCw size={13} className={q.isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
        {(['all', ...KINDS] as const).map(k => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`tab whitespace-nowrap ${filter === k ? 'tab-active' : ''}`}
          >
            {k === 'all' ? 'Everything' : META[k].label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="glass px-6 py-14 text-center text-sm text-ink-2">Loading activity…</div>
      ) : groups.length === 0 ? (
        <div className="glass px-6 py-14 text-center text-sm text-ink-2">
          No activity to show yet.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, entries]) => (
            <section key={day}>
              <div className="eyebrow mb-2 px-1">{day}</div>
              <ul className="glass divide-y divide-line-soft overflow-hidden">
                {entries.map(e => {
                  const Icon = META[e.kind].icon;

                  return (
                    <li key={e.key}>
                      <Link
                        href={e.href}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-black/[0.03]"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-brand-wash text-brand icon-gradient">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-ink-1">
                          <b className="font-semibold text-ink-0">{e.actor}</b> {e.verb}{' '}
                          <span className="text-ink-2">
                            {META[e.kind].label.toLowerCase().replace(/s$/, '')}
                          </span>{' '}
                          <b className="font-semibold text-ink-0">{e.subject}</b>
                        </span>
                        <time className="shrink-0 text-xs tabular-nums text-ink-2" dateTime={e.at}>
                          {new Date(e.at).toLocaleTimeString(undefined, {
                            timeZone: tz,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
