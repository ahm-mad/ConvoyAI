import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { boundsToBbox, type Bbox } from '@utils/mapViewport';

/**
 * Reports the map's visible box (padded by 10% so a small pan does not refetch) once on mount and
 * again, debounced, when the operator finishes moving or zooming. Renders nothing.
 */
export default function MapViewportWatcher({
  onChange,
  debounceMs = 350,
}: {
  onChange: (bbox: Bbox) => void;
  debounceMs?: number;
}) {
  const map = useMap();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);

  latest.current = onChange;

  const report = () => latest.current(boundsToBbox(map.getBounds().pad(0.1)));

  useEffect(() => {
    report();

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only reads refs and the map
  }, []);

  useMapEvents({
    moveend: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(report, debounceMs);
    },
  });

  return null;
}
