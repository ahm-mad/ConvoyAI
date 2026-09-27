'use client';

import type { ReactNode } from 'react';
import { Gauge, History, MapPin, Navigation2, User, X } from 'lucide-react';
import { useFleetSettings } from '@hooks/useFleetSettings';
import type { LiveVehicle } from './vehicle/vehicleKinds';

const STATE_LABEL: Record<LiveVehicle['state'], string> = {
  moving: 'Moving',
  idle: 'Idle',
  parked: 'Parked',
  offline: 'Offline',
};

const PILL: Record<LiveVehicle['state'], string> = {
  moving: 'bg-brand-wash text-brand-text',
  idle: 'bg-gold-wash text-brand-ink',
  parked: 'bg-surface-3 text-ink-1',
  offline: 'bg-surface-3 text-ink-1',
};

/** Time of day in the company timezone (falls back to the browser's when settings are not loaded). */
const clockTime = (iso: string, timeZone?: string) => {
  try {
    return new Date(iso).toLocaleTimeString(undefined, timeZone ? { timeZone } : undefined);
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
};

/** Glass card shown above the selected vehicle (replaces the old Leaflet popup). */
export default function VehicleCard({
  v,
  speedLabel,
  onClose,
  onOpen,
  onReplay,
  extra,
}: {
  v: LiveVehicle;
  speedLabel: string;
  onClose: () => void;
  onOpen?: () => void;
  /** Replays the vehicle's recorded trail on the map. */
  onReplay?: () => void;
  /** Screen-specific block under the status line (driver, current trip…). */
  extra?: ReactNode;
}) {
  const { settings } = useFleetSettings();

  return (
    <div
      className="glass-strong cv-map-card shadow-card"
      role="dialog"
      aria-label={`${v.name} details`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink-0">{v.name}</div>
          <div className="truncate text-xs text-ink-2">
            {[v.category, v.plate].filter(Boolean).join(' · ') || 'Vehicle'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close vehicle card"
          className="grid size-6 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-black/[0.05] hover:text-ink-0"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${PILL[v.state]}`}>
          {STATE_LABEL[v.state]}
        </span>
        {v.state !== 'offline' && (
          <span className="inline-flex items-center gap-1 text-ink-1">
            <Gauge size={12} /> {speedLabel}
          </span>
        )}
        {v.state !== 'offline' && v.hasHeading !== false && (
          <span className="inline-flex items-center gap-1 text-ink-1">
            <Navigation2 size={12} style={{ transform: `rotate(${Math.round(v.heading)}deg)` }} />{' '}
            {Math.round(v.heading)}°
          </span>
        )}
      </div>
      {v.driver && (
        <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-1">
          <User size={12} /> {v.driver}
        </div>
      )}
      {v.recordedAt && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-2">
          <MapPin size={11} /> {v.state === 'offline' ? 'Last seen' : 'Updated'}{' '}
          {clockTime(v.recordedAt, settings?.timezone)}
        </div>
      )}
      {extra}
      {onOpen && (
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:brightness-105"
          >
            Open vehicle
          </button>
          {onReplay && (
            <button
              type="button"
              onClick={onReplay}
              title="Replay the recorded trail on the map"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink-0 hover:bg-white"
            >
              <History size={13} aria-hidden /> Replay
            </button>
          )}
        </div>
      )}
    </div>
  );
}
