'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import { speedColorExpr } from '../speedColors';

/**
 * The recorded GPS trail of the selected vehicle ([lat, lon] points): a soft glow under a solid line. With `speeds`
 * (km/h per point) and `bySpeed` the line is coloured slow → fast along its length (green · gold · orange · red).
 */
export default function HistoryLayer({
  trail,
  speeds,
  bySpeed = true,
}: {
  trail: [number, number][];
  speeds?: number[];
  bySpeed?: boolean;
}) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const coords = trail.map(([la, lo]) => [lo, la]);
    const whole = {
      type: 'FeatureCollection' as const,
      features:
        trail.length > 1
          ? [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'LineString' as const, coordinates: coords },
              },
            ]
          : [],
    };
    // One short feature per hop, carrying the average speed of its two ends.
    const segments = {
      type: 'FeatureCollection' as const,
      features: coords.slice(1).map((c, i) => ({
        type: 'Feature' as const,
        properties: { speed: ((Number(speeds?.[i]) || 0) + (Number(speeds?.[i + 1]) || 0)) / 2 },
        geometry: { type: 'LineString' as const, coordinates: [coords[i], c] },
      })),
    };
    const line = () =>
      bySpeed && speeds?.length ? speedColorExpr('speed') : token('--color-brand');

    const src = map.getSource('cv-history') as any;
    const seg = map.getSource('cv-history-seg') as any;

    if (src && seg) {
      src.setData(whole);
      seg.setData(segments);
      map.setPaintProperty('cv-history-line', 'line-color', line());

      return;
    }
    if (!src) map.addSource('cv-history', { type: 'geojson', data: whole });
    if (!seg) map.addSource('cv-history-seg', { type: 'geojson', data: segments });
    if (!map.getLayer('cv-history-glow'))
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
    if (!map.getLayer('cv-history-line'))
      map.addLayer({
        id: 'cv-history-line',
        type: 'line',
        source: 'cv-history-seg',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': line(), 'line-width': 4 },
      });
  }, [map, styleVersion, trail, speeds, bySpeed]);

  return null;
}
