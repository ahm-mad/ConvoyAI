'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

/** Temporary M0 layer: plain circles for every position (replaced by the vehicle icon layer in M2). */
export default function DotsLayer({ positions }: { positions: any[] }) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const data = {
      type: 'FeatureCollection' as const,
      features: positions
        .filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
        .map(p => ({
          type: 'Feature' as const,
          properties: { fresh: !!p.fresh },
          geometry: {
            type: 'Point' as const,
            coordinates: [Number(p.longitude), Number(p.latitude)],
          },
        })),
    };
    const src = map.getSource('cv-dots') as any;

    if (src) {
      src.setData(data);

      return;
    }
    map.addSource('cv-dots', { type: 'geojson', data });
    map.addLayer({
      id: 'cv-dots',
      type: 'circle',
      source: 'cv-dots',
      paint: {
        'circle-radius': 7,
        'circle-color': [
          'case',
          ['get', 'fresh'],
          token('--color-brand'),
          token('--color-chart-neutral'),
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }, [map, styleVersion, positions]);

  return null;
}
