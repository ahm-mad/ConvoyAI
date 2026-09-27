'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import { circle, distToPath } from '../geo';

type LL = [number, number]; // [lon, lat]

/** A zone counts as "on the route" when its edge is within this distance of the road. */
const NEAR_M = 800;

const SRC = 'cv-rctx';
const LAYERS = ['cv-rctx-fill', 'cv-rctx-line'];

/**
 * What a route passes through: the yards and geofences along the road are emphasised (stronger fill, solid edge) and
 * geofences get a name tag, since the base map only labels yards. The route's own start and destination yards keep
 * their zone highlight but get no extra tag (they already carry the S / D beacons).
 */
export default function RouteContextLayer({
  path,
  yards,
  geofences,
}: {
  path: LL[] | null;
  yards: any[];
  geofences: any[];
}) {
  const { map, styleVersion } = useConvoyMap();

  const near = useMemo(() => {
    if (!path || path.length < 2) return { yards: [] as any[], fences: [] as any[] };

    const on = (lon: unknown, lat: unknown, r: unknown) =>
      Number.isFinite(Number(lon)) &&
      Number.isFinite(Number(lat)) &&
      distToPath(path, Number(lon), Number(lat)).m - Math.max(0, Number(r) || 0) <= NEAR_M;
    const ys = yards.filter(y => on(y.longitude, y.latitude, y.radius_m));
    const yardIds = new Set(ys.map(y => String(y.id)));
    // A yard's own perimeter geofence is the same circle as the yard: keep only the independent ones as tags.
    const fs = geofences.filter(
      g => on(g.center_longitude, g.center_latitude, g.radius_m) && !yardIds.has(String(g.yard_id))
    );

    return { yards: ys, fences: fs };
  }, [path, yards, geofences]);

  // Viewport lists are refetched all the time; redraw only when the set of zones on the route really changes.
  const key = `${near.yards.map(y => y.id).join(',')}|${near.fences.map(g => g.id).join(',')}`;
  const nearRef = useRef(near);

  nearRef.current = near;

  useEffect(() => {
    if (!map) return;

    const near = nearRef.current;
    let markers: Marker[] = [];
    let cancelled = false;

    const poly = (kind: string, lat: unknown, lon: unknown, r: unknown) => ({
      type: 'Feature' as const,
      properties: { kind },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [circle(Number(lat), Number(lon), Math.max(60, Number(r) || 0))],
      },
    });
    const data = {
      type: 'FeatureCollection' as const,
      features: [
        ...near.yards.map(y => poly('yard', y.latitude, y.longitude, y.radius_m)),
        ...near.fences.map(g =>
          poly('geofence', g.center_latitude, g.center_longitude, g.radius_m)
        ),
      ],
    };

    try {
      if (map.getSource(SRC)) (map.getSource(SRC) as any).setData(data);
      else {
        const colour = (yard: string, fence: string) => [
          'match',
          ['get', 'kind'],
          'yard',
          yard,
          fence,
        ];

        map.addSource(SRC, { type: 'geojson', data });
        map.addLayer({
          id: 'cv-rctx-fill',
          type: 'fill',
          source: SRC,
          paint: {
            'fill-color': colour(token('--color-brand-ink'), token('--color-gold')) as any,
            'fill-opacity': 0.24,
          },
        });
        map.addLayer({
          id: 'cv-rctx-line',
          type: 'line',
          source: SRC,
          paint: {
            'line-color': colour(token('--color-brand-ink'), token('--color-gold')) as any,
            'line-width': 2.5,
            'line-opacity': 0.95,
          },
        });
      }
    } catch {
      /* the style is being replaced; the next styleVersion redraws */
    }

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      near.fences.forEach(g => {
        const el = document.createElement('div');

        el.className = 'cv-tag is-geofence';
        el.textContent = g.name || 'Geofence';
        el.title = `Geofence · ${g.name ?? ''}`;
        markers.push(
          new GLMarker({ element: el, anchor: 'center', subpixelPositioning: true })
            .setLngLat([Number(g.center_longitude), Number(g.center_latitude)])
            .addTo(map)
        );
      });
    })();

    return () => {
      cancelled = true;
      markers.forEach(m => m.remove());
      markers = [];
      try {
        LAYERS.forEach(id => map.getLayer(id) && map.removeLayer(id));
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* map already destroyed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, key]);

  return null;
}
