'use client';

import { useEffect } from 'react';
import type { Marker } from 'maplibre-gl';
import { useConvoyMap } from '../ConvoyMap';
import { useFleetSettings } from '@hooks/useFleetSettings';

export interface ReplayPoint {
  lat: number;
  lon: number;
  /** recorded_at (ISO) */
  at?: string | null;
  kmh?: number;
}

/** Replay length: long enough to follow, short enough to stay a gesture. */
const REPLAY_MS = 9000;

/**
 * "Replay the trail": a glowing marker drives the vehicle's recorded trail from its oldest to its newest point, with a
 * chip showing the recorded time and speed. Starts whenever `run` changes (0 = never); the camera first frames the trail.
 */
export default function ReplayLayer({
  points,
  run,
  speedLabel,
}: {
  points: ReplayPoint[];
  run: number;
  speedLabel: (kmh: number) => string;
}) {
  const { map } = useConvoyMap();
  const { settings } = useFleetSettings();

  useEffect(() => {
    if (!map || !run || points.length < 2) return;

    let raf = 0;
    let marker: Marker | null = null;
    let cancelled = false;
    let start = 0;
    const tz = settings?.timezone;
    const clock = (iso?: string | null) => {
      if (!iso) return '';

      try {
        return new Date(iso).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          ...(tz ? { timeZone: tz } : {}),
        });
      } catch {
        return '';
      }
    };

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const xs = points.map(p => p.lon);
      const ys = points.map(p => p.lat);
      const cam = map.cameraForBounds(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        { padding: { top: 150, bottom: 90, left: 340, right: 90 }, maxZoom: 14 }
      );

      if (cam) map.easeTo({ center: cam.center, zoom: cam.zoom, duration: 900 });

      const el = document.createElement('div');

      el.className = 'cv-replay';
      el.innerHTML =
        '<span class="cv-replay__ring"></span><span class="cv-replay__dot"></span><span class="cv-tag cv-tag--under cv-replay__tag"></span>';

      const tag = el.querySelector<HTMLElement>('.cv-replay__tag')!;

      marker = new GLMarker({ element: el, anchor: 'center', subpixelPositioning: true })
        .setLngLat([points[0].lon, points[0].lat])
        .addTo(map);

      const tick = (now: number) => {
        if (cancelled) return;
        if (!start) start = now + 900; // wait for the camera

        const f = Math.min(1, Math.max(0, (now - start) / REPLAY_MS));
        const x = f * (points.length - 1);
        const i = Math.min(points.length - 2, Math.floor(x));
        const a = points[i];
        const b = points[i + 1];
        const w = x - i;

        marker!.setLngLat([a.lon + (b.lon - a.lon) * w, a.lat + (b.lat - a.lat) * w]);

        const cur = w < 0.5 ? a : b;

        tag.textContent = [clock(cur.at), cur.kmh !== undefined ? speedLabel(cur.kmh) : '']
          .filter(Boolean)
          .join(' · ');
        if (f < 1) raf = requestAnimationFrame(tick);
        else setTimeout(() => marker?.remove(), 1200);
      };

      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      marker?.remove();
    };
    // Only a new run restarts the replay; the trail keeps refreshing underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, run]);

  return null;
}
