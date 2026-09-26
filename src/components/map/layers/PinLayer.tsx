'use client';

import { useEffect, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import { circle } from '../geo';

/**
 * A glowing, draggable location pin (click the map to drop it) with an optional radius preview — used by the
 * coordinate picker of the yard / geofence / trip forms.
 */
export default function PinLayer({
  pin,
  onChange,
  radiusM,
  readOnly = false,
}: {
  pin: [number, number] | null;
  onChange: (lat: number, lon: number) => void;
  radiusM?: number | null;
  /** Display-only pin: not draggable, and clicking the map does not move it. */
  readOnly?: boolean;
}) {
  const { map, styleVersion } = useConvoyMap();
  const marker = useRef<Marker | null>(null);
  const cb = useRef(onChange);

  cb.current = onChange;

  // Click to drop / move the pin.
  useEffect(() => {
    if (!map || readOnly) return;

    const click = (e: any) => cb.current(e.lngLat.lat, e.lngLat.lng);

    map.on('click', click);
    map.getCanvas().style.cursor = 'crosshair';

    return () => {
      map.off('click', click);
      map.getCanvas().style.cursor = '';
    };
  }, [map, readOnly]);

  // The pin marker.
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      if (!pin) {
        marker.current?.remove();
        marker.current = null;

        return;
      }
      if (marker.current) {
        marker.current.setLngLat([pin[1], pin[0]]);

        return;
      }

      const el = document.createElement('div');

      el.className = 'cv-pin';
      el.innerHTML = '<span class="cv-pin__ring"></span><span class="cv-pin__drop"></span>';
      if (!readOnly) {
        // Keyboard: arrow keys nudge the pin by 12 px on screen (Shift = 60 px).
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Location pin. Use the arrow keys to move it.');
        el.addEventListener('keydown', ev => {
          const step = ev.shiftKey ? 60 : 12;
          const d: Record<string, [number, number]> = {
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
          };

          if (!d[ev.key] || !marker.current) return;

          ev.preventDefault();
          ev.stopPropagation();

          const p = map.project(marker.current.getLngLat());
          const ll = map.unproject([p.x + d[ev.key][0], p.y + d[ev.key][1]]);

          cb.current(ll.lat, ll.lng);
        });
      }

      const m = new GLMarker({ element: el, anchor: 'bottom', draggable: !readOnly })
        .setLngLat([pin[1], pin[0]])
        .addTo(map);

      m.on('dragend', () => {
        const ll = m.getLngLat();

        cb.current(ll.lat, ll.lng);
      });
      marker.current = m;
    })();

    return () => {
      cancelled = true;
    };
  }, [map, pin]);

  useEffect(
    () => () => {
      marker.current?.remove();
      marker.current = null;
    },
    []
  );

  // Radius preview.
  useEffect(() => {
    if (!map) return;

    const data = {
      type: 'FeatureCollection' as const,
      features:
        pin && radiusM && radiusM > 0
          ? [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                  type: 'Polygon' as const,
                  coordinates: [circle(pin[0], pin[1], radiusM)],
                },
              },
            ]
          : [],
    };
    const src = map.getSource('cv-pin-radius') as any;

    if (src) {
      src.setData(data);

      return;
    }
    map.addSource('cv-pin-radius', { type: 'geojson', data });
    map.addLayer({
      id: 'cv-pin-radius-fill',
      type: 'fill',
      source: 'cv-pin-radius',
      paint: { 'fill-color': token('--color-brand'), 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: 'cv-pin-radius-line',
      type: 'line',
      source: 'cv-pin-radius',
      paint: { 'line-color': token('--color-brand'), 'line-width': 2, 'line-dasharray': [2, 1.5] },
    });
  }, [map, styleVersion, pin, radiusM]);

  return null;
}
