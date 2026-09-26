'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

/** The recorded GPS trail of the selected vehicle ([lat, lon] points): a soft glow under a solid brand line. */
export default function HistoryLayer({ trail }: { trail: [number, number][] }) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const data = {
      type: 'FeatureCollection' as const,
      features:
        trail.length > 1
          ? [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                  type: 'LineString' as const,
                  coordinates: trail.map(([la, lo]) => [lo, la]),
                },
              },
            ]
          : [],
    };
    const src = map.getSource('cv-history') as any;

    if (src) {
      src.setData(data);

      return;
    }
    map.addSource('cv-history', { type: 'geojson', data });
    map.addLayer({
      id: 'cv-history-glow',
      type: 'line',
      source: 'cv-history',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': token('--color-brand-bright'),
        'line-width': 10,
        'line-blur': 7,
        'line-opacity': 0.35,
      },
    });
    map.addLayer({
      id: 'cv-history-line',
      type: 'line',
      source: 'cv-history',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': token('--color-brand'), 'line-width': 3.5 },
    });
  }, [map, styleVersion, trail]);

  return null;
}
