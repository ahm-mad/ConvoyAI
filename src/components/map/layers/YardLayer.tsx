'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Warehouse } from 'lucide-react';
import type { Marker } from 'maplibre-gl';
import { useConvoyMap } from '../ConvoyMap';

/** Yards as glowing pads with a name chip. Click opens the slot-level yard editor (owned by the screen). */
export default function YardLayer({
  yards,
  onSelect,
}: {
  yards: any[];
  onSelect: (yard: any) => void;
}) {
  const { map } = useConvoyMap();
  const store = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>());
  const [items, setItems] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const select = useRef(onSelect);

  select.current = onSelect;

  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const seen = new Set<string>();

      yards
        .filter(y => Number.isFinite(Number(y.latitude)) && Number.isFinite(Number(y.longitude)))
        .forEach(y => {
          const id = String(y.id);

          seen.add(id);
          if (store.current.has(id)) return;

          const el = document.createElement('div');

          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `Yard ${y.name}`);
          el.addEventListener('click', ev => {
            ev.stopPropagation();
            select.current(y);
          });
          el.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              select.current(y);
            }
          });
          store.current.set(id, {
            el,
            marker: new GLMarker({ element: el, anchor: 'center' })
              .setLngLat([Number(y.longitude), Number(y.latitude)])
              .addTo(map),
          });
        });
      store.current.forEach((e, id) => {
        if (!seen.has(id)) {
          e.marker.remove();
          store.current.delete(id);
        }
      });
      setItems([...store.current.entries()].map(([id, e]) => ({ id, el: e.el })));
    })();

    return () => {
      cancelled = true;
    };
  }, [map, yards]);

  useEffect(
    () => () => {
      store.current.forEach(e => e.marker.remove());
      store.current.clear();
    },
    []
  );

  const byId = new Map(yards.map(y => [String(y.id), y]));

  return (
    <>
      {items.map(({ id, el }) => {
        const y = byId.get(id);

        return y
          ? createPortal(
              <div className="cv-yard">
                <span className="cv-yard__pad" aria-hidden>
                  <Warehouse size={17} strokeWidth={2.2} />
                </span>
                <span className="cv-yard__chip">
                  <b>{y.name}</b>
                  <i>{y.slots_count ?? 0} slots</i>
                </span>
              </div>,
              el,
              id
            )
          : null;
      })}
    </>
  );
}
