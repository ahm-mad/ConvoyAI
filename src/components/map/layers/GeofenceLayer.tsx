'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

/** Circle polygon (metres) around a point — 72 segments is smooth at every zoom the map allows. */
const circle = (lat: number, lon: number, radiusM: number, n = 72): [number, number][] => {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;

    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
};

/** Geofences (gold, dashed edge) and yard detection radii (brand-ink, thin) as soft translucent zones. */
export default function GeofenceLayer({
  geofences,
  yards,
  showGeofences,
  showYards,
}: {
  geofences: any[];
  yards: any[];
  showGeofences: boolean;
  showYards: boolean;
}) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const poly = (kind: string, lat: unknown, lon: unknown, r: unknown) =>
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Number(r) > 0
        ? [
            {
              type: 'Feature' as const,
              properties: { kind },
              geometry: {
                type: 'Polygon' as const,
                coordinates: [circle(Number(lat), Number(lon), Number(r))],
              },
            },
          ]
        : [];

    const data = {
      type: 'FeatureCollection' as const,
      features: [
        ...(showGeofences
          ? geofences.flatMap(g =>
              poly('geofence', g.center_latitude, g.center_longitude, g.radius_m)
            )
          : []),
        ...(showYards ? yards.flatMap(y => poly('yard', y.latitude, y.longitude, y.radius_m)) : []),
      ],
    };
    const src = map.getSource('cv-zones') as any;

    if (src) {
      src.setData(data);

      return;
    }
    map.addSource('cv-zones', { type: 'geojson', data });
    map.addLayer({
      id: 'cv-zones-fill',
      type: 'fill',
      source: 'cv-zones',
      paint: {
        'fill-color': [
          'match',
          ['get', 'kind'],
          'yard',
          token('--color-brand-ink'),
          token('--color-gold'),
        ],
        'fill-opacity': ['match', ['get', 'kind'], 'yard', 0.1, 0.13],
      },
    });
    map.addLayer({
      id: 'cv-zones-line',
      type: 'line',
      source: 'cv-zones',
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'yard',
          token('--color-brand-ink'),
          token('--color-gold'),
        ],
        'line-width': ['match', ['get', 'kind'], 'yard', 1.2, 2],
        'line-opacity': 0.8,
        'line-dasharray': [2, 1.6],
      },
    });
  }, [map, styleVersion, geofences, yards, showGeofences, showYards]);

  return null;
}
