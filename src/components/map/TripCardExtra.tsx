'use client';

/**
 * The "current trip" block of a vehicle card: reference, on-schedule / late, "Faisalabad → Multan", progress of the
 * planned time and the driver. Shared by the live map and the landing hero map. `trip` = a trips-list row.
 */
export default function TripCardExtra({ trip }: { trip: any | null | undefined }) {
  if (!trip)
    return (
      <div className="mt-2 rounded-xl bg-black/[0.04] px-2.5 py-1.5 text-[11px] text-ink-2">
        No trip in progress
      </div>
    );

  const place = (a?: string) => (a ? a.split(',').slice(-1)[0].trim() || a : '—');
  const start = Date.parse(trip.actual_start_at || trip.planned_start_at);
  const end = Date.parse(trip.planned_end_at);
  const pct =
    Number.isFinite(start) && end > start
      ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
      : 0;
  const late = Number.isFinite(end) && Date.now() > end;
  const driver = trip.driver
    ? [trip.driver.first_name, trip.driver.last_name].filter(Boolean).join(' ')
    : '';

  return (
    <div className="mt-2 rounded-xl bg-black/[0.04] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-ink-0">
          {trip.trip_reference || `Trip #${trip.id}`}
        </span>
        <span className={late ? 'font-semibold text-danger-text' : 'text-ink-2'}>
          {late ? 'Running late' : 'On schedule'}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-ink-1">
        {place(trip.origin_address)} → {place(trip.destination_address)}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden>
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-2">
        <span>{Math.round(pct * 100)}% of planned time</span>
        {driver && <span className="truncate pl-2">{driver}</span>}
      </div>
    </div>
  );
}
