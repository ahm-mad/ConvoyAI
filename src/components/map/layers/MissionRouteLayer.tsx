'use client';

import { useEffect, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import { flatM } from '../geo';

type LL = [number, number]; // [lon, lat]

export interface MissionRoute {
  /** Still to drive, in driving order, starting at the vehicle. */
  ahead: LL[];
  /** Already driven, starting at the vehicle and going back. */
  behind: LL[];
  /** Place names at the start and the end of the road, when known. */
  fromName?: string;
  toName?: string;
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
  yards = [],
}: {
  vehicleId: string | null;
  read: (vehicleId: string) => MissionRoute | null;
  preview?: boolean;
  /** Used to name the start / destination after the yard they are at. */
  yards?: any[];
}) {
  const { map, styleVersion } = useConvoyMap();
  const idRef = useRef(vehicleId);
  const readRef = useRef(read);
  const yardsRef = useRef(yards);
  const previewRef = useRef(preview);

  idRef.current = vehicleId;
  readRef.current = read;
  yardsRef.current = yards;
  previewRef.current = preview;

  useEffect(() => {
    if (!map) return;

    const empty = { type: 'FeatureCollection' as const, features: [] as any[] };
    let ends: Marker[] = [];
    let endsKey = '';
    let ctor: typeof Marker | null = null;

    void import('maplibre-gl').then(m => (ctor = m.Marker as unknown as typeof Marker));

    const yardName = (p: [number, number]) => {
      let best: { n: string; d: number } | null = null;

      yardsRef.current.forEach(y => {
        const d = flatM(p, [Number(y.longitude), Number(y.latitude)]);

        if (d < 1500 && (!best || d < best.d)) best = { n: String(y.name), d };
      });

      return (best as { n: string } | null)?.n ?? null;
    };

    // Start and destination of the road being driven: a labelled beacon at each end (one, when it is a round trip).
    const drawEnds = (r: MissionRoute | null) => {
      const from = r?.behind[r.behind.length - 1];
      const to = r?.ahead[r.ahead.length - 1];
      const key =
        r && from && to
          ? `${idRef.current}|${from.map(n => n.toFixed(4))}|${to.map(n => n.toFixed(4))}|${previewRef.current}`
          : '';

      if (key === endsKey || !ctor) return;

      endsKey = key;
      ends.forEach(m => m.remove());
      ends = [];
      if (!key || !from || !to) return;

      const Ctor = ctor;
      const round = flatM(from, to) < 300;
      const add = (at: [number, number], letter: string, cls: string, label: string) => {
        const el = document.createElement('div');

        el.className = `cv-beacon ${cls}${previewRef.current ? ' is-preview' : ''}`;
        el.innerHTML = `<span class="cv-beacon__ring"></span><span class="cv-beacon__dot">${letter}</span>`;

        const tag = document.createElement('span');

        tag.className = `cv-tag cv-tag--under ${cls === 'is-start' ? 'is-start' : 'is-dest'}`;
        tag.textContent = label;
        el.appendChild(tag);
        ends.push(
          new Ctor({ element: el, anchor: 'center', subpixelPositioning: true })
            .setLngLat(at)
            .addTo(map)
        );
      };

      if (round) add(from, 'S', 'is-start', r?.fromName ?? yardName(from) ?? 'Start · round trip');
      else {
        add(from, 'S', 'is-start', r?.fromName ?? yardName(from) ?? 'Start');
        add(to, 'D', 'is-dest', r?.toName ?? yardName(to) ?? 'Destination');
      }
    };

    const push = () => {
      if (!map.isStyleLoaded() && !map.getSource(SRC)) return;

      const r = idRef.current ? readRef.current(idRef.current) : null;

      drawEnds(r);
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
      ends.forEach(m => m.remove());
      ends = [];
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
