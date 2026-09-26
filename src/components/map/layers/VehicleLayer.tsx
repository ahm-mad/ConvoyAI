'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Marker } from 'maplibre-gl';
import { useConvoyMap } from '../ConvoyMap';
import VehicleIcon from '../vehicle/VehicleIcon';
import VehicleCard from '../VehicleCard';
import { kindOf, type LiveVehicle } from '../vehicle/vehicleKinds';
import type { VehicleIconStyle } from '../useMapPrefs';

interface Entry {
  marker: Marker;
  el: HTMLDivElement;
  cur: { lat: number; lon: number; h: number };
  tgt: { lat: number; lon: number; h: number };
}

/** Shortest signed angle from a to b, degrees. */
const dAngle = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Draws the fleet as real vehicle icons (silhouette / badge / puck). New positions are not jumped to: every marker eases
 * toward its latest fix each frame (position and heading), so vehicles glide. The selected vehicle gets a glass card
 * that follows it. Markers are HTML elements owned by MapLibre; their content is React, mounted through portals.
 */
export default function VehicleLayer({
  vehicles,
  iconStyle,
  selectedId,
  onSelect,
  speedLabel,
  onOpen,
}: {
  vehicles: LiveVehicle[];
  iconStyle: VehicleIconStyle;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  speedLabel: (v: LiveVehicle) => string;
  onOpen?: (v: LiveVehicle) => void;
}) {
  const { map } = useConvoyMap();
  const store = useRef(new Map<string, Entry>());
  const card = useRef<{ marker: Marker; el: HTMLDivElement } | null>(null);
  const [ids, setIds] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const latest = useRef({ selectedId, onSelect });

  latest.current = { selectedId, onSelect };

  // Create / update / remove markers to match `vehicles`.
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const seen = new Set<string>();

      vehicles.forEach(v => {
        seen.add(v.id);

        let e = store.current.get(v.id);

        if (!e) {
          const el = document.createElement('div');

          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `${v.name}, ${v.state}`);
          el.addEventListener('click', ev => {
            ev.stopPropagation();
            latest.current.onSelect(v.id);
          });
          el.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              latest.current.onSelect(v.id);
            }
          });

          const marker = new GLMarker({
            element: el,
            anchor: 'center',
            pitchAlignment: 'map',
            rotationAlignment: 'map',
          })
            .setLngLat([v.lon, v.lat])
            .addTo(map);

          e = {
            marker,
            el,
            cur: { lat: v.lat, lon: v.lon, h: v.heading },
            tgt: { lat: v.lat, lon: v.lon, h: v.heading },
          };
          store.current.set(v.id, e);
        }
        e.tgt = { lat: v.lat, lon: v.lon, h: v.heading };
        // A far jump (new session, filter change) snaps instead of gliding across the country.
        if (Math.abs(e.cur.lat - v.lat) + Math.abs(e.cur.lon - v.lon) > 0.6) e.cur = { ...e.tgt };
        e.el.setAttribute('aria-label', `${v.name}, ${v.state}`);
      });

      store.current.forEach((e, id) => {
        if (!seen.has(id)) {
          e.marker.remove();
          store.current.delete(id);
        }
      });
      setIds([...store.current.entries()].map(([id, e]) => ({ id, el: e.el })));
    })();

    return () => {
      cancelled = true;
    };
  }, [map, vehicles]);

  // Animation loop: ease toward targets, keep icon heading right for the current map bearing.
  useEffect(() => {
    if (!map) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      const k = 1 - Math.exp(-dt / 0.45);
      const bearing = map.getBearing();
      // Icons grow with zoom so the fleet reads at country level and stays crisp when zoomed in.
      const vs = Math.min(1.4, Math.max(0.55, 0.5 + (map.getZoom() - 9) * 0.16));

      last = now;
      store.current.forEach((e, id) => {
        e.cur.lat += (e.tgt.lat - e.cur.lat) * k;
        e.cur.lon += (e.tgt.lon - e.cur.lon) * k;
        e.cur.h += dAngle(e.cur.h, e.tgt.h) * k;
        e.marker.setLngLat([e.cur.lon, e.cur.lat]);
        e.el.style.setProperty('--h', `${(e.cur.h - bearing).toFixed(1)}deg`);
        e.el.style.setProperty('--vs', vs.toFixed(3));
        e.el.style.zIndex = id === latest.current.selectedId ? '5' : '1';
      });

      const sel = latest.current.selectedId ? store.current.get(latest.current.selectedId) : null;

      if (sel && card.current) card.current.marker.setLngLat([sel.cur.lon, sel.cur.lat]);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [map]);

  // The selected vehicle's card marker.
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    if (!selectedId) {
      card.current?.marker.remove();
      card.current = null;
      setCardEl(null);

      return;
    }

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const sel = store.current.get(selectedId);
      const el = document.createElement('div');

      card.current?.marker.remove();

      const marker = new GLMarker({ element: el, anchor: 'bottom', offset: [0, -34] })
        .setLngLat(sel ? [sel.cur.lon, sel.cur.lat] : map.getCenter())
        .addTo(map);

      el.style.zIndex = '10';
      card.current = { marker, el };
      setCardEl(el);
    })();

    return () => {
      cancelled = true;
    };
  }, [map, selectedId]);

  // Deselect on empty-map click.
  useEffect(() => {
    if (!map) return;

    const off = () => latest.current.onSelect(null);

    map.on('click', off);

    return () => {
      map.off('click', off);
    };
  }, [map]);

  // Remove everything on unmount.
  useEffect(
    () => () => {
      store.current.forEach(e => e.marker.remove());
      store.current.clear();
      card.current?.marker.remove();
    },
    []
  );

  const byId = new Map(vehicles.map(v => [v.id, v]));
  const selected = selectedId ? byId.get(selectedId) : null;

  return (
    <>
      {ids.map(({ id, el }) => {
        const v = byId.get(id);

        return v
          ? createPortal(
              <VehicleIcon
                kind={kindOf(v.category)}
                state={v.state}
                iconStyle={iconStyle}
                selected={id === selectedId}
                label={`${v.name}, ${v.state}`}
              />,
              el,
              id
            )
          : null;
      })}
      {cardEl && selected
        ? createPortal(
            <VehicleCard
              v={selected}
              speedLabel={speedLabel(selected)}
              onClose={() => onSelect(null)}
              onOpen={onOpen ? () => onOpen(selected) : undefined}
            />,
            cardEl,
            'card'
          )
        : null}
    </>
  );
}
