'use client';

import { useEffect } from 'react';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

type LL = [number, number]; // [lon, lat] for MapLibre

const coord = (lat: unknown, lon: unknown): LL | null =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && lat !== null && lon !== null
    ? [Number(lon), Number(lat)]
    : null;

const STOP_STATE: Record<string, string> = {
  arrived: 'is-arrived',
  departed: 'is-departed',
  missed: 'is-missed',
};

/**
 * One trip on the map from GET /trips/{id}/route: the planned road (dashed), the driven part (solid orange with a soft
 * glow), numbered stop beacons and a destination beacon with a ripple. The showcase API also sends `route.path` (the
 * real road polyline); without it the planned line runs straight through origin → stops → destination.
 */
export default function RouteLayer({ route, fit = true }: { route: any; fit?: boolean }) {
  const { map, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map || !route) return;

    let markers: Marker[] = [];
    let cancelled = false;

    const origin = coord(route.origin?.latitude, route.origin?.longitude);
    const dest = coord(route.destination?.latitude, route.destination?.longitude);
    const stops = [...(route.stops ?? [])].sort(
      (a: any, b: any) => (a.sequence || 0) - (b.sequence || 0)
    );
    const planned: LL[] =
      Array.isArray(route.path) && route.path.length > 1
        ? route.path.map((p: any) => [Number(p.longitude), Number(p.latitude)] as LL)
        : ([
            origin,
            ...stops.map((s: any) => coord(s.yard?.latitude, s.yard?.longitude)),
            dest,
          ].filter(Boolean) as LL[]);
    const done: LL[] = (route.trail?.positions ?? [])
      .map((p: any) => coord(p.latitude, p.longitude))
      .filter(Boolean) as LL[];

    const data = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { kind: 'planned' },
          geometry: { type: 'LineString' as const, coordinates: planned },
        },
        ...(done.length > 1
          ? [
              {
                type: 'Feature' as const,
                properties: { kind: 'done' },
                geometry: { type: 'LineString' as const, coordinates: done },
              },
            ]
          : []),
      ],
    };

    if (map.getSource('cv-route')) (map.getSource('cv-route') as any).setData(data);
    else {
      map.addSource('cv-route', { type: 'geojson', data });
      map.addLayer({
        id: 'cv-route-planned',
        type: 'line',
        source: 'cv-route',
        filter: ['==', ['get', 'kind'], 'planned'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': token('--color-ink-2'),
          'line-width': 3,
          'line-opacity': 0.6,
          'line-dasharray': [1.2, 2],
        },
      });
      map.addLayer({
        id: 'cv-route-glow',
        type: 'line',
        source: 'cv-route',
        filter: ['==', ['get', 'kind'], 'done'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': token('--color-brand-bright'),
          'line-width': 12,
          'line-blur': 8,
          'line-opacity': 0.4,
        },
      });
      map.addLayer({
        id: 'cv-route-done',
        type: 'line',
        source: 'cv-route',
        filter: ['==', ['get', 'kind'], 'done'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': token('--color-brand'), 'line-width': 4.5 },
      });
    }

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const beacon = (at: LL | null, label: string, cls: string, title: string) => {
        if (!at) return;

        const el = document.createElement('div');

        el.className = `cv-beacon ${cls}`;
        el.title = title;
        el.innerHTML = `<span class="cv-beacon__ring"></span><span class="cv-beacon__dot">${label}</span>`;
        markers.push(new GLMarker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map));
      };

      beacon(origin, 'S', 'is-start', 'Origin');
      stops.forEach((s: any) =>
        beacon(
          coord(s.yard?.latitude, s.yard?.longitude),
          String(s.sequence ?? ''),
          STOP_STATE[s.status] ?? '',
          `Stop ${s.sequence}: ${s.yard?.name ?? ''}`
        )
      );
      beacon(
        dest,
        'D',
        route.trip?.destination_reached_at ? 'is-departed is-dest' : 'is-dest',
        'Destination'
      );
    })();

    if (fit) {
      const all = [...planned, ...done];

      if (all.length) {
        const xs = all.map(p => p[0]);
        const ys = all.map(p => p[1]);

        map.fitBounds(
          [
            [Math.min(...xs), Math.min(...ys)],
            [Math.max(...xs), Math.max(...ys)],
          ],
          { padding: 90, maxZoom: 13, duration: 1200 }
        );
      }
    }

    return () => {
      cancelled = true;
      markers.forEach(m => m.remove());
      markers = [];
      ['cv-route-done', 'cv-route-glow', 'cv-route-planned'].forEach(
        id => map.getLayer(id) && map.removeLayer(id)
      );
      if (map.getSource('cv-route')) map.removeSource('cv-route');
    };
    // The route object identity changes on every refetch; its id + point counts are what matter for redraws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, route?.trip?.id, route?.trail?.total_points, route?.path?.length, fit]);

  return null;
}
