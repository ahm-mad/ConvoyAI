'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDot, MapPin, Truck } from 'lucide-react';

type Data = typeof import('@utils/showcase/dataset');

const place = (a?: string) => (a ? a.split(',').slice(-1)[0].trim() : '—');
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * "Trips & dispatch" tab: the in-progress and next planned trips from the sample data; pick one to see its stops
 * (origin, yards on the way, destination) with times and progress.
 */
export default function TourTrips() {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let live = true;

    import('@utils/showcase/dataset').then(d => live && setData(d));

    return () => {
      live = false;
    };
  }, []);

  const trips = useMemo(
    () =>
      (data?.tripModels ?? [])
        .filter(t => t.status === 'in_progress' || t.status === 'planned')
        .slice(0, 8),
    [data]
  );
  const t = trips[sel];

  if (!data) return <div className="h-[540px]" />;

  const start = t ? Date.parse(t.actual_start_at || t.planned_start_at) : 0;
  const end = t ? Date.parse(t.planned_end_at) : 0;
  const pct =
    t?.status === 'in_progress'
      ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
      : 0;
  const stops = t
    ? [
        {
          name: place(t.origin_address),
          sub: t.origin_address,
          at: t.planned_start_at,
          done: true,
        },
        {
          name: 'Checkpoint',
          sub: 'Weigh station · geofence',
          at: new Date(start + (end - start) * 0.5).toISOString(),
          done: pct > 0.5,
        },
        {
          name: place(t.destination_address),
          sub: t.destination_address,
          at: t.planned_end_at,
          done: false,
        },
      ]
    : [];

  return (
    <div className="grid h-[540px] overflow-hidden bg-surface-1 md:grid-cols-[1.1fr_1fr]">
      <div
        className="overflow-y-auto border-line-soft p-3 md:border-r"
        role="listbox"
        aria-label="Trips"
      >
        {trips.map((x, i) => {
          const s = Date.parse(x.actual_start_at || x.planned_start_at);
          const e = Date.parse(x.planned_end_at);
          const p =
            x.status === 'in_progress' ? Math.min(1, Math.max(0, (Date.now() - s) / (e - s))) : 0;

          return (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              onClick={() => setSel(i)}
              className="mb-2 block w-full rounded-2xl border border-line-soft bg-white/70 p-3.5 text-left transition-colors hover:bg-white aria-selected:border-brand aria-selected:bg-brand-wash/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-control font-semibold text-ink-0">{x.trip_reference}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-micro font-semibold ${
                    x.status === 'in_progress'
                      ? 'bg-moving-wash text-moving-text'
                      : 'bg-surface-3 text-ink-1'
                  }`}
                >
                  {x.status === 'in_progress' ? 'In progress' : 'Planned'}
                </span>
              </div>
              <div className="mt-1 text-caption text-ink-1">
                {place(x.origin_address)} → {place(x.destination_address)}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-2">
                <Truck size={12} aria-hidden /> {x.vehicle?.name?.split(' · ')[0]}
                <span aria-hidden>·</span>
                {x.driver?.first_name} {x.driver?.last_name}
              </div>
              <div
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]"
                aria-hidden
              >
                <i
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.round(p * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {t && (
        <div className="hidden overflow-y-auto p-6 md:block">
          <div className="eyebrow">{t.trip_reference}</div>
          <h3 className="page-title mt-2 !text-[1.6rem]">
            {place(t.origin_address)} <span className="text-brand">→</span>{' '}
            {place(t.destination_address)}
          </h3>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              [`${Math.round(t.planned_distance_km)} km`, 'Planned'],
              [clock(t.planned_end_at), 'ETA'],
              [t.purpose, 'Purpose'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-black/[0.04] px-2 py-3">
                <div className="truncate text-control font-semibold tabular-nums text-ink-0">
                  {v}
                </div>
                <div className="text-micro text-ink-2">{l}</div>
              </div>
            ))}
          </div>
          <ol className="relative mt-6 flex flex-col gap-5 pl-7">
            <span className="absolute bottom-2 left-[9px] top-2 w-px bg-line" aria-hidden />
            {stops.map(s => (
              <li key={s.name + s.at} className="relative">
                <span className="absolute -left-7 top-0.5 text-brand" aria-hidden>
                  {s.done ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <CircleDot size={19} className="text-ink-2" />
                  )}
                </span>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-control font-semibold text-ink-0">{s.name}</span>
                  <span className="text-caption tabular-nums text-ink-2">{clock(s.at)}</span>
                </div>
                <div className="flex items-center gap-1 text-caption text-ink-2">
                  <MapPin size={11} aria-hidden /> {s.sub}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
