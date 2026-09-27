'use client';

import * as Popover from '@radix-ui/react-popover';
import { BellRing, Clock, Gauge, MapPinned, X } from 'lucide-react';
import type { MapAlert } from './useMapAlerts';

const ICON = { speed: Gauge, late: Clock, geofence: MapPinned } as const;
const DOT = {
  danger: 'var(--color-danger)',
  warn: 'var(--color-gold)',
  info: 'var(--color-chart-neutral)',
} as const;

const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000);

  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;

  const h = Math.round(m / 60);

  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

/**
 * Bottom strip of the live map: what needs attention now (speeding, late trips, geofence entries / exits). The top
 * alerts are chips that fly to the vehicle; the rest sit behind "+N more". Dismissible for the session.
 */
export default function AlertStrip({
  alerts,
  speedLabel,
  onPick,
  onDismiss,
  container,
}: {
  alerts: MapAlert[];
  speedLabel: (kmh: number) => string;
  onPick: (a: MapAlert) => void;
  onDismiss: () => void;
  container: HTMLElement | null;
}) {
  if (!alerts.length) return null;

  const shown = alerts.slice(0, 3);
  const more = alerts.slice(3);
  const text = (a: MapAlert) => (a.kmh ? `${speedLabel(a.kmh)} · ${a.sub}` : a.sub);

  const Chip = ({ a }: { a: MapAlert }) => {
    const Icon = ICON[a.kind];

    return (
      <button
        type="button"
        onClick={() => onPick(a)}
        className="flex min-w-0 items-center gap-2 rounded-full border border-line-soft bg-white/70 py-1 pl-2 pr-3 text-left hover:bg-white"
      >
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full text-white"
          style={{ background: DOT[a.tone] }}
          aria-hidden
        >
          <Icon size={11} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[11.5px] font-semibold text-ink-0">{a.title}</span>
          <span className="block truncate text-[10.5px] text-ink-2">{text(a) || ago(a.at)}</span>
        </span>
      </button>
    );
  };

  return (
    <div
      role="region"
      aria-label="Fleet alerts"
      className="glass-strong absolute bottom-4 left-1/2 z-10 hidden max-w-[min(46rem,calc(100%-40rem))] -translate-x-1/2 items-center gap-2 px-2.5 py-2 shadow-card lg:flex"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 pl-1 text-[11px] font-semibold text-ink-0">
        <BellRing size={14} className="text-brand" aria-hidden />
        {alerts.length} alert{alerts.length === 1 ? '' : 's'}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {shown.map(a => (
          <Chip key={a.id} a={a} />
        ))}
      </div>
      {more.length > 0 && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink-1 hover:bg-black/[0.05]"
            >
              +{more.length} more
            </button>
          </Popover.Trigger>
          <Popover.Portal container={container ?? undefined}>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={10}
              collisionPadding={12}
              className="glass-menu z-[1100] flex w-72 flex-col gap-1.5 p-2 shadow-card"
            >
              {more.map(a => (
                <Chip key={a.id} a={a} />
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss the alerts"
        className="grid size-6 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-black/[0.05] hover:text-ink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}
