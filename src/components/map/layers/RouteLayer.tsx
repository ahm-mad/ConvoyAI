'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import { routePoints } from '../geo';
import { useFleetSettings } from '@hooks/useFleetSettings';
import { useUnits } from '@hooks/useUnits';
import { formatQty } from '@utils/units';

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
  const { settings } = useFleetSettings();
  const u = useUnits();

  // ETA chip on the destination: planned arrival (company timezone) and the distance still to drive.
  const eta = useMemo(() => {
    const t = route?.trip;

    if (!t) return null;

    const clock = (iso?: string | null) => {
      if (!iso) return '';

      const d = new Date(iso);
      const tz = settings?.timezone;
      const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
      const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

      try {
        const time = d.toLocaleTimeString([], tz ? { ...opts, timeZone: tz } : opts);

        return sameDay(d, new Date())
          ? time
          : `${d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(tz ? { timeZone: tz } : {}) })} ${time}`;
      } catch {
        return d.toLocaleTimeString([], opts);
      }
    };

    if (t.status === 'completed' && t.actual_end_at)
      return { head: `Arrived ${clock(t.actual_end_at)}`, sub: '', late: false };
    if (!t.planned_end_at || t.status === 'cancelled') return null;

    const driven = Number(route.trail?.computed_distance_km ?? 0);
    const planned = Number(t.planned_distance_km ?? 0);
    const left = t.status === 'in_progress' && planned > 0 ? Math.max(0, planned - driven) : null;

    return {
      head: `${t.status === 'in_progress' ? 'ETA' : 'Planned'} ${clock(t.planned_end_at)}`,
      sub: left !== null ? `${formatQty(u.distance, left, 0)} left` : '',
      late: t.status === 'in_progress' && Date.now() > Date.parse(t.planned_end_at),
    };
  }, [route, settings?.timezone, u.distance]);

  // The chip is created with the destination beacon but its text is updated in place, so a changing "km left" never
  // rebuilds (and re-pings) the beacons.
  const etaRef = useRef(eta);
  const chipEl = useRef<HTMLSpanElement | null>(null);

  etaRef.current = eta;

  useEffect(() => {
    const c = chipEl.current;

    if (!c || !eta) return;

    c.classList.toggle('is-late', eta.late);
    c.replaceChildren();

    const b = document.createElement('b');

    b.textContent = eta.head;
    c.appendChild(b);
    if (eta.sub) {
      const i = document.createElement('i');

      i.textContent = eta.sub;
      c.appendChild(i);
    }
  }, [eta]);

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
          'line-color': token('--color-ink-1'),
          'line-width': 3,
          'line-opacity': 0.62,
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

      const beacon = (
        at: LL | null,
        label: string,
        cls: string,
        title: string,
        chip?: { head: string; sub: string; late: boolean } | null
      ) => {
        if (!at) return;

        const el = document.createElement('div');

        el.className = `cv-beacon ${cls}`;
        el.title = title;
        el.innerHTML = `<span class="cv-beacon__ring"></span><span class="cv-beacon__dot">${label}</span>`;
        if (chip) {
          const c = document.createElement('span');

          c.className = `cv-eta${chip.late ? ' is-late' : ''}`;

          const b = document.createElement('b');

          b.textContent = chip.head;
          c.appendChild(b);
          if (chip.sub) {
            const i = document.createElement('i');

            i.textContent = chip.sub;
            c.appendChild(i);
          }
          el.appendChild(c);
          chipEl.current = c;
        }
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
        'Destination',
        etaRef.current
      );
    })();

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
  }, [map, styleVersion, route?.trip?.id, route?.trail?.total_points, route?.path?.length, !!eta]);

  // Flow: the planned (remaining) road's dashes march from origin toward destination. MapLibre cannot animate a dash
  // offset, so the dash pattern is re-issued with a growing leading gap ("shifted" patterns), ~20 times a second.
  useEffect(() => {
    if (!map || !route) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const DASH = 1.2;
    const GAP = 2;
    const PERIOD = DASH + GAP;
    const STEPS = 24;
    const seq: number[][] = Array.from({ length: STEPS }, (_, i) => {
      const sh = (i / STEPS) * PERIOD;

      return sh <= GAP ? [0, sh, DASH, GAP - sh] : [sh - GAP, GAP, DASH - (sh - GAP), 0];
    });
    let raf = 0;
    let last = 0;
    let n = -1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 48) return;

      last = now;
      if (!map.getLayer('cv-route-planned')) return;

      n = (n + 1) % STEPS;
      map.setPaintProperty('cv-route-planned', 'line-dasharray', seq[n]);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [map, styleVersion, route?.trip?.id]);

  // Frame the whole trip once per trip (not on every live refresh).
  useEffect(() => {
    if (!map || !route || !fit) return;

    const planned =
      Array.isArray(route.path) && route.path.length > 1
        ? route.path.map((p: any) => [Number(p.longitude), Number(p.latitude)] as LL)
        : ([
            coord(route.origin?.latitude, route.origin?.longitude),
            coord(route.destination?.latitude, route.destination?.longitude),
          ].filter(Boolean) as LL[]);

    // Frame everything the trip draws: the road path plus stops, origin, destination, trail and vehicle.
    const all: LL[] = [...planned, ...routePoints(route).map(([la, lo]) => [lo, la] as LL)];

    if (!all.length) return;

    const xs = all.map(p => p[0]);
    const ys = all.map(p => p[1]);

    map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 60, maxZoom: 13, duration: 1000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, route?.trip?.id, fit]);

  return null;
}
