'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Map as GLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { boundsToBbox, type Bbox } from '@utils/mapViewport';
import { buildStyle, type MapLook } from './mapStyles';
import { installRafShimIfRequested } from './qaRaf';

export type { MapLook };

export type MapMode = '2d' | '3d';

interface MapContextValue {
  map: GLMap | null;
  /** Increments every time a style finished loading — layers re-add their sources on change. */
  styleVersion: number;
  look: MapLook;
  mode: MapMode;
}

const MapContext = createContext<MapContextValue>({
  map: null,
  styleVersion: 0,
  look: 'light',
  mode: '2d',
});

export const useConvoyMap = () => useContext(MapContext);

/** Camera used by the 3D mode (tilted, slightly rotated) — the 2D mode is flat and north-up. */
export const CAMERA_3D = { pitch: 58, bearing: -17 } as const;

export interface ConvoyMapProps {
  look?: MapLook;
  mode?: MapMode;
  /** Initial centre as [lat, lon] (same order the rest of the app uses). */
  center: [number, number];
  zoom?: number;
  /** Called (debounced) with the visible box padded by 10 %, as `[west, south, east, north]`. */
  onBoundsChange?: (bbox: Bbox) => void;
  ariaLabel?: string;
  className?: string;
  interactive?: boolean;
  /** Wheel zoom (turn off on maps embedded in a scrolling page so they never trap the scroll). */
  scrollZoom?: boolean;
  /** Called once with the live map instance (for camera helpers such as fit-to-fleet). */
  onReady?: (map: GLMap) => void;
  /** Small +/− buttons (for embedded maps where the wheel is off so the page can scroll). */
  zoomControls?: boolean;
  children?: ReactNode;
}

/**
 * The one map component of the product (MapLibre GL). Owns the WebGL map, the recoloured basemap (light / night /
 * satellite), the 2D/3D camera and the viewport callback; everything drawn on top comes in as children that read the
 * map from `useConvoyMap()`. Client-only: maplibre is imported lazily so pages without a map do not pay for it.
 */
export default function ConvoyMap({
  look = 'light',
  mode = '2d',
  center,
  zoom = 6,
  onBoundsChange,
  ariaLabel = 'Map',
  className = '',
  interactive = true,
  scrollZoom = true,
  onReady,
  zoomControls = false,
  children,
}: ConvoyMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<GLMap | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const first = useRef({ look, mode, center, zoom, interactive, scrollZoom });
  const boundsCb = useRef(onBoundsChange);

  boundsCb.current = onBoundsChange;
  const readyCb = useRef(onReady);

  readyCb.current = onReady;

  // MapLibre cancels in-flight tile requests when the style or viewport changes; the aborted fetches surface as
  // unhandled AbortError rejections. They are expected, so they must not pollute the console.
  useEffect(() => {
    const quiet = (ev: PromiseRejectionEvent) => {
      if (ev.reason?.name === 'AbortError') ev.preventDefault();
    };

    window.addEventListener('unhandledrejection', quiet);

    return () => window.removeEventListener('unhandledrejection', quiet);
  }, []);

  // Create the map once.
  useEffect(() => {
    let disposed = false;
    let instance: GLMap | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        installRafShimIfRequested();

        const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
        const [maplibregl, style] = await Promise.all([
          import('maplibre-gl'),
          buildStyle(first.current.look, key),
        ]);

        if (disposed || !host.current) return;

        maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

        const init = first.current;

        instance = new maplibregl.Map({
          container: host.current,
          style,
          center: [init.center[1], init.center[0]],
          zoom: init.zoom,
          pitch: init.mode === '3d' ? CAMERA_3D.pitch : 0,
          bearing: init.mode === '3d' ? CAMERA_3D.bearing : 0,
          maxPitch: 75,
          attributionControl: false,
          interactive: init.interactive,
          canvasContextAttributes: { antialias: true },
        });
        if (process.env.NODE_ENV !== 'production') (window as any).__cvMap = instance;
        if (!init.scrollZoom) instance.scrollZoom.disable();
        instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

        const report = () => {
          if (!instance) return;

          const b = instance.getBounds();
          const dx = (b.getEast() - b.getWest()) * 0.1;
          const dy = (b.getNorth() - b.getSouth()) * 0.1;

          boundsCb.current?.(
            boundsToBbox({
              getWest: () => b.getWest() - dx,
              getSouth: () => b.getSouth() - dy,
              getEast: () => b.getEast() + dx,
              getNorth: () => b.getNorth() + dy,
            })
          );
        };

        instance.on('style.load', () => setStyleVersion(v => v + 1));
        instance.on('moveend', () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(report, 350);
        });
        instance.once('load', () => {
          if (disposed) return;
          setMap(instance);
          readyCb.current?.(instance!);
          report();
        });
        instance.on('error', e => {
          // Tile hiccups are normal; only a dead style is fatal (handled by the promise above).
          if (process.env.NODE_ENV !== 'production') console.warn('[ConvoyMap]', e?.error?.message);
        });
      } catch (e) {
        if (!disposed) setFailed(e instanceof Error ? e.message : 'The map could not start.');
      }
    })();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      instance?.remove();
      setMap(null);
    };
  }, []);

  // Look change → new recoloured style.
  const appliedLook = useRef(look);

  useEffect(() => {
    if (!map || appliedLook.current === look) return;

    appliedLook.current = look;
    buildStyle(look, process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '')
      .then(style => map.setStyle(style, { diff: false }))
      .catch(e => setFailed(e instanceof Error ? e.message : 'Map style failed.'));
  }, [look, map]);

  // Keep the map's internal transform in step with its container. Needed whenever the container's size can change
  // after the map is created: a panel opening/closing beside it, a `sticky` element settling into its final box, or a
  // map that mounts lazily (`LazyMount`) while its ancestor is still being laid out. Without this the canvas still
  // paints at the right CSS size, but marker projections and the visible tiles drift to where an earlier, wrong size
  // put them.
  useEffect(() => {
    if (!map || !host.current || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => map.resize());

    ro.observe(host.current);

    return () => ro.disconnect();
  }, [map]);

  // 2D ↔ 3D: animate the camera.
  useEffect(() => {
    if (!map) return;

    map.easeTo({
      pitch: mode === '3d' ? CAMERA_3D.pitch : 0,
      bearing: mode === '3d' ? CAMERA_3D.bearing : 0,
      duration: 1100,
    });
  }, [mode, map]);

  const value = useMemo(() => ({ map, styleVersion, look, mode }), [map, styleVersion, look, mode]);

  return (
    <MapContext.Provider value={value}>
      <div className={`relative size-full overflow-hidden ${className}`}>
        <div
          ref={host}
          className="absolute inset-0"
          style={{ position: 'absolute', inset: 0 }}
          role="region"
          aria-label={ariaLabel}
        />
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-surface-2 p-6 text-center text-sm text-ink-1">
            The map could not be drawn on this device ({failed}). The rest of the page still works.
          </div>
        )}
        {map && zoomControls && (
          <div
            role="group"
            aria-label="Zoom"
            className="glass-strong absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-control"
          >
            {(
              [
                ['Zoom in', '+', () => map.zoomIn()],
                ['Zoom out', '−', () => map.zoomOut()],
              ] as const
            ).map(([label, glyph, act]) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                onClick={act}
                className="grid size-8 place-items-center text-base font-semibold text-ink-1 hover:bg-black/[0.05]"
              >
                {glyph}
              </button>
            ))}
          </div>
        )}
        {map && children}
      </div>
    </MapContext.Provider>
  );
}
