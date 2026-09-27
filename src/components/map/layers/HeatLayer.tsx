'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

/** "#rrggbb" → "rgba(r,g,b,a)" (heatmap colour ramps need explicit alpha; tokens are opaque hex). */
const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '').trim();
  const f =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h;
  const n = parseInt(f.slice(0, 6), 16);

  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Where vehicles have been: a soft density heat over the map (gold → orange → red). Points are [lon, lat]. The layer
 * sits under the zones and the HTML vehicle markers, so it colours the roads without hiding anything.
 */
export default function HeatLayer({
  points,
  visible,
}: {
  points: [number, number][];
  visible: boolean;
}) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const data = {
      type: 'FeatureCollection' as const,
      features: points.map(p => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: p },
      })),
    };
    const src = map.getSource('cv-heat') as any;

    if (src) src.setData(data);
    else map.addSource('cv-heat', { type: 'geojson', data });

    if (!map.getLayer('cv-heat')) {
      const gold = token('--color-gold');
      const brand = token('--color-brand');
      const danger = token('--color-danger');

      map.addLayer(
        {
          id: 'cv-heat',
          type: 'heatmap',
          source: 'cv-heat',
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 9, 0.6, 14, 1.3],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 18, 12, 34, 15, 56],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 15, 0.6],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              rgba(gold, 0),
              0.15,
              rgba(gold, 0.3),
              0.4,
              rgba(brand, 0.5),
              0.7,
              rgba(brand, 0.7),
              1,
              rgba(danger, 0.85),
            ],
          },
        },
        map.getLayer('cv-zones-fill') ? 'cv-zones-fill' : undefined
      );
    }
  }, [map, styleVersion, points, visible]);

  useEffect(() => {
    if (map?.getLayer('cv-heat'))
      map.setLayoutProperty('cv-heat', 'visibility', visible ? 'visible' : 'none');
  }, [map, visible, styleVersion]);

  return null;
}
