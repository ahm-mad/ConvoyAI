'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose, Search, X } from 'lucide-react';
import Flash from '@components/ui/Flash';
import type { LiveVehicle } from './vehicle/vehicleKinds';

export type StatusFilter = 'all' | LiveVehicle['state'];

const STATES: { key: StatusFilter; label: string; dot: string | null }[] = [
  { key: 'all', label: 'All', dot: null },
  { key: 'moving', label: 'Moving', dot: 'var(--color-brand)' },
  { key: 'idle', label: 'Idle', dot: 'var(--color-gold)' },
  { key: 'parked', label: 'Parked', dot: 'var(--color-chart-neutral)' },
  { key: 'offline', label: 'Offline', dot: 'var(--color-ink-2)' },
];
const ORDER: Record<LiveVehicle['state'], number> = { moving: 0, idle: 1, parked: 2, offline: 3 };
const STATE_LABEL: Record<LiveVehicle['state'], string> = {
  moving: 'Moving',
  idle: 'Idle',
  parked: 'Parked',
  offline: 'Offline',
};
const dotOf = (s: LiveVehicle['state']) =>
  STATES.find(x => x.key === s)?.dot ?? 'var(--color-ink-2)';

/**
 * The fleet list of the live map: every reporting vehicle (not only the ones in view) with a status filter and a search
 * box. Picking a row flies to the vehicle and selects it; hovering a row previews its road on the map. The status filter
 * also filters the vehicles drawn on the map.
 */
export default function FleetPanel({
  vehicles,
  filter,
  onFilter,
  selectedId,
  onPick,
  onHover,
  onCollapse,
  speedLabel,
  headerExtra,
}: {
  vehicles: LiveVehicle[];
  filter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  selectedId: string | null;
  onPick: (v: LiveVehicle) => void;
  onHover: (id: string | null) => void;
  onCollapse: () => void;
  speedLabel: (v: LiveVehicle) => string;
  headerExtra?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const list = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vehicles.length };

    vehicles.forEach(v => (c[v.state] = (c[v.state] ?? 0) + 1));

    return c;
  }, [vehicles]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return vehicles
      .filter(v => filter === 'all' || v.state === filter)
      .filter(
        v =>
          !needle ||
          [v.name, v.plate, v.category].some(x =>
            String(x ?? '')
              .toLowerCase()
              .includes(needle)
          )
      )
      .sort(
        (a, b) =>
          ORDER[a.state] - ORDER[b.state] ||
          a.name.localeCompare(b.name, undefined, { numeric: true })
      );
  }, [vehicles, filter, q]);

  // Keep the selected row in view when the selection comes from the map.
  useEffect(() => {
    if (!selectedId) return;

    list.current
      ?.querySelector<HTMLElement>(`[data-vid="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <section
      aria-label="Fleet list"
      className="glass-strong absolute bottom-3 left-3 top-[4.25rem] z-10 flex w-[19rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden shadow-card lg:bottom-4 lg:left-4 lg:top-4"
    >
      <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="page-title text-title-sm leading-none">Fleet</h2>
        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-1">
          <Flash value={vehicles.length} />
        </span>
        <span className="flex-1" />
        {headerExtra}
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide the fleet list"
          title="Hide the fleet list"
          className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-black/[0.05] hover:text-ink-0"
        >
          <PanelLeftClose size={16} />
        </button>
      </header>

      <div className="flex flex-wrap gap-1 px-3 pb-2" role="group" aria-label="Filter by status">
        {STATES.map(s => (
          <button
            key={s.key}
            type="button"
            aria-pressed={filter === s.key}
            onClick={() => onFilter(s.key)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-white/60 px-2 py-1 text-[11px] font-semibold text-ink-1 hover:bg-white aria-pressed:border-transparent aria-pressed:bg-ink-0 aria-pressed:text-white"
          >
            {s.dot && (
              <span className="size-1.5 rounded-full" style={{ background: s.dot }} aria-hidden />
            )}
            {s.label}
            <span className="tabular-nums opacity-70">{counts[s.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative px-3 pb-2">
        <Search
          size={14}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-[62%] text-ink-2"
          aria-hidden
        />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by name, plate or type"
          aria-label="Filter the fleet list"
          className="field w-full !py-1.5 pl-8 pr-8 text-[12px]"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear the filter"
            onClick={() => setQ('')}
            className="absolute right-5 top-1/2 -translate-y-[62%] text-ink-2 hover:text-ink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto border-t border-line-soft px-1.5 py-1.5"
        onMouseLeave={() => onHover(null)}
      >
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-2">
            No vehicles match this filter.
          </p>
        ) : (
          rows.map(v => (
            <button
              key={v.id}
              type="button"
              data-vid={v.id}
              aria-current={selectedId === v.id ? 'true' : undefined}
              onClick={() => onPick(v)}
              onMouseEnter={() => onHover(v.id)}
              onFocus={() => onHover(v.id)}
              onBlur={() => onHover(null)}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-black/[0.04] aria-[current=true]:bg-brand-wash"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  background: dotOf(v.state),
                  boxShadow: v.state === 'moving' ? `0 0 8px ${dotOf(v.state)}` : undefined,
                }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink-0">
                  {v.name}
                </span>
                <span className="block truncate text-[11px] text-ink-2">
                  {[v.category, v.plate].filter(Boolean).join(' · ') || 'Vehicle'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[12px] font-semibold tabular-nums text-ink-0">
                  {v.state === 'moving' || v.state === 'idle' ? speedLabel(v) : '—'}
                </span>
                <span className="block text-[10.5px] text-ink-2">{STATE_LABEL[v.state]}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
