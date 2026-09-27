'use client';

import Flash from '@components/ui/Flash';
import type { LiveVehicle } from './vehicle/vehicleKinds';

const CHIPS: { state: LiveVehicle['state']; label: string; dot: string }[] = [
  { state: 'moving', label: 'Moving', dot: 'var(--color-moving)' },
  { state: 'idle', label: 'Idle', dot: 'var(--color-gold)' },
  { state: 'parked', label: 'Parked', dot: 'var(--color-chart-neutral)' },
  { state: 'offline', label: 'Offline', dot: 'var(--color-ink-2)' },
];

/** Live count chips (over the vehicles currently in view) — the "control room" strip on the map. */
export default function MapHud({
  vehicles,
  className = '',
}: {
  vehicles: LiveVehicle[];
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      role="status"
      aria-label="Fleet status in view"
    >
      {CHIPS.map(c => (
        <span
          key={c.state}
          className="glass-strong inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink-0"
        >
          <span
            className="size-2 rounded-full"
            style={{
              background: c.dot,
              boxShadow: c.state === 'moving' ? `0 0 8px ${c.dot}` : undefined,
            }}
          />
          <Flash
            value={vehicles.filter(v => v.state === c.state).length}
            className="tabular-nums"
          />
          <span className="font-medium text-ink-2">{c.label}</span>
        </span>
      ))}
    </div>
  );
}
