'use client';

import type { ReactNode } from 'react';
import { Box, BusFront, Circle, LocateFixed, Moon, Satellite, Sun, Truck } from 'lucide-react';
import type { MapPrefs, VehicleIconStyle } from './useMapPrefs';
import type { MapLook } from './mapStyles';

const LOOKS: { id: MapLook; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light map', icon: Sun },
  { id: 'night', label: 'Night map', icon: Moon },
  { id: 'satellite', label: 'Satellite map', icon: Satellite },
];

const ICON_STYLES: { id: VehicleIconStyle; label: string; icon: typeof Truck }[] = [
  { id: 'silhouette', label: 'Vehicle silhouettes', icon: Truck },
  { id: 'badge', label: 'Glossy badges', icon: BusFront },
  { id: 'puck', label: 'Brand pucks', icon: Circle },
];

const seg =
  'grid size-8 place-items-center rounded-full text-ink-1 transition-colors hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand aria-pressed:bg-brand aria-pressed:text-white aria-pressed:shadow-glow';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 p-0.5"
    >
      {children}
    </div>
  );
}

/**
 * Glass control strip shared by every big map: basemap look, 2D/3D, vehicle icon style, fit-to-fleet. Extra tools
 * (follow, tour, fullscreen…) are passed as children so each screen decides what it offers.
 */
export default function MapToolbar({
  prefs,
  onChange,
  onFit,
  children,
  className = '',
  showIconStyle = true,
}: {
  prefs: MapPrefs;
  onChange: (patch: Partial<MapPrefs>) => void;
  onFit?: () => void;
  children?: ReactNode;
  className?: string;
  /** Hide the vehicle icon-style group on maps that show no vehicles. */
  showIconStyle?: boolean;
}) {
  return (
    <div
      className={`glass-strong flex items-center gap-1.5 overflow-x-auto p-1.5 lg:flex-wrap lg:overflow-visible ${className}`}
      role="toolbar"
      aria-label="Map controls"
    >
      <Group label="Map look">
        {LOOKS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={seg}
            aria-pressed={prefs.look === id}
            aria-label={label}
            title={label}
            onClick={() => onChange({ look: id })}
          >
            <Icon size={15} />
          </button>
        ))}
      </Group>
      <Group label="Camera">
        <button
          type="button"
          className={`${seg} w-auto px-3 text-[11px] font-semibold`}
          aria-pressed={prefs.mode === '3d'}
          aria-label="3D view"
          title="Tilted 3D view"
          onClick={() => onChange({ mode: prefs.mode === '3d' ? '2d' : '3d' })}
        >
          <span className="flex items-center gap-1.5">
            <Box size={14} /> 3D
          </span>
        </button>
        {onFit && (
          <button
            type="button"
            className={seg}
            aria-label="Fit the whole fleet"
            title="Fit the whole fleet"
            onClick={onFit}
          >
            <LocateFixed size={15} />
          </button>
        )}
      </Group>
      {showIconStyle && (
        <Group label="Vehicle icon style">
          {ICON_STYLES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={seg}
              aria-pressed={prefs.iconStyle === id}
              aria-label={label}
              title={label}
              onClick={() => onChange({ iconStyle: id })}
            >
              <Icon size={15} />
            </button>
          ))}
        </Group>
      )}
      {children}
    </div>
  );
}
