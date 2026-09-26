'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MapLook } from './mapStyles';
import type { MapMode } from './ConvoyMap';

export type VehicleIconStyle = 'silhouette' | 'badge' | 'puck';

export interface MapPrefs {
  look: MapLook;
  mode: MapMode;
  iconStyle: VehicleIconStyle;
}

const KEY = 'convoyai-map-prefs';
const DEFAULTS: MapPrefs = { look: 'light', mode: '2d', iconStyle: 'silhouette' };

/** Operator's map choices (look, 2D/3D, vehicle icon style), remembered per browser and shared by every map screen. */
export function useMapPrefs(initial: Partial<MapPrefs> = {}) {
  const [prefs, setPrefs] = useState<MapPrefs>({ ...DEFAULTS, ...initial });

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');

      if (saved && typeof saved === 'object') setPrefs(p => ({ ...p, ...saved, ...initial }));
    } catch {
      /* storage unavailable or corrupt — keep defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);

  const update = useCallback((patch: Partial<MapPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };

      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }

      return next;
    });
  }, []);

  return [prefs, update] as const;
}
