'use client';

import * as Popover from '@radix-ui/react-popover';
import { EyeOff, Gauge, Pause, Play, Presentation } from 'lucide-react';

const SPEEDS = [1, 3, 10, 20, 60];

/**
 * The presentation tools of the live map in one place: time-lapse speed (sample data only), the fleet tour and the
 * clean view for recording. Kept out of the everyday toolbar so operators see only operating controls.
 */
export default function DemoMenu({
  container,
  showSpeed,
  speed,
  onSpeed,
  tour,
  onTour,
  onClean,
}: {
  /** Render inside this element (the fullscreen stage), otherwise a fullscreen map would hide the menu. */
  container: HTMLElement | null;
  showSpeed: boolean;
  speed: number;
  onSpeed: (x: number) => void;
  tour: boolean;
  onTour: () => void;
  onClean: () => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Demo tools"
          aria-pressed={tour}
          title="Demo tools: speed, fleet tour, clean view"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-3 text-[11px] font-semibold text-ink-1 hover:bg-white aria-pressed:bg-brand aria-pressed:text-white"
        >
          <Presentation size={14} aria-hidden /> Demo
        </button>
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="glass-menu z-[1100] w-64 p-3 shadow-card"
        >
          {showSpeed && (
            <div className="mb-3">
              <div className="eyebrow mb-1.5 flex items-center gap-1.5">
                <Gauge size={12} aria-hidden /> Time-lapse speed
              </div>
              <div role="group" aria-label="Demo speed" className="flex gap-1">
                {SPEEDS.map(x => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={speed === x}
                    onClick={() => onSpeed(x)}
                    className="grid h-8 flex-1 place-items-center rounded-full border border-line-soft bg-white/60 text-[11px] font-semibold text-ink-1 hover:bg-white aria-pressed:border-transparent aria-pressed:bg-brand aria-pressed:text-white"
                  >
                    {x}×
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-2">
                Sample fleet: ×1 is real time, higher speeds fast-forward the vehicles.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onTour}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-ink-0 hover:bg-black/[0.05]"
            >
              {tour ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              <span className="flex-1">
                {tour ? 'Stop the fleet tour' : 'Start the fleet tour'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClean}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-ink-0 hover:bg-black/[0.05]"
            >
              <EyeOff size={15} aria-hidden />
              <span className="flex-1">Clean view for recording</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
