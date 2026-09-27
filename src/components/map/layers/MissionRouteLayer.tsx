'use client';

import { useEffect, useRef } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

type LL = [number, number]; // [lon, lat]

export interface MissionRoute {
  /** Still to drive, in driving order, starting at the vehicle. */
  ahead: LL[];
  /** Already driven, starting at the vehicle and going back. */
  behind: LL[];
}

const SRC = 'cv-mroute';
const LAYERS = ['cv-mroute-behind', 'cv-mroute-casing', 'cv-mroute-glow', 'cv-mroute-ahead'];

/**
 * The road a vehicle is driving, the way ride-hailing apps draw it: the part still ahead is a bold brand line with a
 * white casing and a soft glow, the part already driven is dimmed. `preview` (hover) draws it lighter than a selection.
 * The geometry comes from `read(vehicleId)` and is refreshed a few times a second so it stays split at the vehicle.
 */
export default function MissionRouteLayer({
  vehicleId,
  read,
  preview = false,
}: {
  vehicleId: string | null;
  read: (vehicleId: string) => MissionRoute | null;
  preview?: boolean;
}) {
  const { map, styleVersion } = useConvoyMap();
  const idRef = useRef(vehicleId);
  const readRef = useRef(read);

  idRef.current = vehicleId;
  readRef.current = read;

  useEffect(() => {
    if (!map) return;

    const empty = { type: 'FeatureCollection' as const, features: [] as any[] };

    const push = () => {
      if (!map.isStyleLoaded() && !map.getSource(SRC)) return;

      const r = idRef.current ? readRef.current(idRef.current) : null;
      const features = r
        ? [
            {
              type: 'Feature',
              properties: { kind: 'behind' },
              geometry: { type: 'LineString', coordinates: r.behind },
            },
            {
              type: 'Feature',
              properties: { kind: 'ahead' },
              geometry: { type: 'LineString', coordinates: r.ahead },
            },
          ].filter(f => f.geometry.coordinates.length > 1)
        : [];
      const data = features.length ? { type: 'FeatureCollection' as const, features } : empty;

      (map.getSource(SRC) as any)?.setData(data);
    };

    const ensure = () => {
      if (map.getSource(SRC)) return;

      map.addSource(SRC, { type: 'geojson', data: empty });

      const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
      const ahead = ['==', ['get', 'kind'], 'ahead'];

      map.addLayer({
        id: 'cv-mroute-behind',
        type: 'line',
        source: SRC,
        filter: ['==', ['get', 'kind'], 'behind'],
        layout: line,
        paint: { 'line-color': token('--color-ink-2'), 'line-width': 4, 'line-opacity': 0.38 },
      });
      map.addLayer({
        id: 'cv-mroute-casing',
        type: 'line',
        source: SRC,
        filter: ahead as any,
        layout: line,
        paint: { 'line-color': token('--color-surface-1'), 'line-width': 10, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'cv-mroute-glow',
        type: 'line',
        source: SRC,
        filter: ahead as any,
        layout: line,
        paint: {
          'line-color': token('--color-brand-bright'),
          'line-width': 18,
          'line-blur': 10,
          'line-opacity': 0.4,
        },
      });
      map.addLayer({
        id: 'cv-mroute-ahead',
        type: 'line',
        source: SRC,
        filter: ahead as any,
        layout: line,
        paint: { 'line-color': token('--color-brand'), 'line-width': 6 },
      });
    };

    const start = () => {
      try {
        ensure();
        push();
      } catch {
        /* the style is being replaced; the next styleVersion re-adds the layer */
      }
    };

    start();

    const timer = setInterval(start, 250);

    return () => {
      clearInterval(timer);
      try {
        LAYERS.forEach(id => map.getLayer(id) && map.removeLayer(id));
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* map already destroyed */
      }
    };
  }, [map, styleVersion]);

  // A hover preview is lighter than a selection.
  useEffect(() => {
    if (!map) return;

    const set = () => {
      if (!map.getLayer('cv-mroute-ahead')) return;

      map.setPaintProperty('cv-mroute-ahead', 'line-opacity', preview ? 0.6 : 1);
      map.setPaintProperty('cv-mroute-casing', 'line-opacity', preview ? 0.5 : 0.95);
      map.setPaintProperty('cv-mroute-glow', 'line-opacity', preview ? 0.18 : 0.4);
      map.setPaintProperty('cv-mroute-behind', 'line-opacity', preview ? 0.2 : 0.38);
    };

    set();

    const t = setTimeout(set, 300);

    return () => clearTimeout(t);
  }, [map, preview, vehicleId, styleVersion]);

  return null;
}
