/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { get } from '@utils/apiHelper';
import { useModal } from '@contexts/ModalContext';
import YardLayoutEditor from '@components/YardLayoutEditor';
import VehicleDetailModal from '@components/VehicleDetailModal';
import { useViewportList } from '@hooks/useViewportList';
import { bboxToParam, type Bbox } from '@utils/mapViewport';
import dynamic from 'next/dynamic';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import { vehicleFromPosition, type LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import { formatQty } from '@utils/units';
import { isShowcase } from '@utils/showcase';
import { getDemoSpeed, setDemoSpeed } from '@utils/showcase/simulation';
import { Eye, EyeOff, Gauge, Maximize2, Play, Pause, Crosshair } from 'lucide-react';
import MapHud from '@components/map/MapHud';
import Scenery3D from '@components/map/layers/Scenery3D';
import RouteLayer from '@components/map/layers/RouteLayer';
import HistoryLayer from '@components/map/layers/HistoryLayer';
import GeofenceLayer from '@components/map/layers/GeofenceLayer';
import YardLayer from '@components/map/layers/YardLayer';
import MapToolbar from '@components/map/MapToolbar';
import { useMapPrefs } from '@components/map/useMapPrefs';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/**
 * Fleet Management — real map, real data. Consumes
 * GET /api/fleet/positions and GET /api/fleet/devices/{id}/history exactly
 * as built in the backend phase — no translation layer. Yards are shown
 * as a second, visually distinct marker type — the "coarse location" half
 * of the yard-management split; clicking one opens the precise slot-level
 * YardLayoutEditor.
 *
 * Viewport-driven (backend B8, flows/06 §29): positions, yards and geofences are requested for the
 * visible box only (`bbox`, positions also `limit`ed to the newest 2,000) whenever the operator stops
 * moving / zooming the map, so the map stays light however large the fleet is. A first, cheap request
 * (`limit=1`, no box) centres the map on the most recently reporting vehicle and gives the total number
 * of reporting vehicles.
 */
const POSITION_LIMIT = 2000;

export default function FleetMap() {
  const u = useUnits();
  const { openModal } = useModal();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | number | null>(null);
  const [layers, setLayers] = useState({ vehicles: true, yards: true, geofences: true });
  // MapLibre GL map (needs WebGL; see the fallback message in the render).
  const [gl, setGl] = useState(false);
  const [mapPrefs, setMapPrefs] = useMapPrefs();
  const [glMap, setGlMap] = useState<any>(null);
  const [glSelected, setGlSelected] = useState<string | null>(null);
  const [demoSpeed, setDemoSpeedState] = useState(20);

  useEffect(() => setDemoSpeedState(getDemoSpeed()), []);

  // Fit to every reporting vehicle (not only the ones in the current view).
  const fitFleet = async () => {
    if (!glMap) return;

    const res: any = await get('/api/fleet/positions', { limit: 500 });
    const pts = (res?.success ? res.data : [])
      .map((p: any) => [Number(p.longitude), Number(p.latitude)])
      .filter(([x, y]: number[]) => Number.isFinite(x) && Number.isFinite(y));

    if (!pts.length) return;

    const xs = pts.map(([x]: number[]) => x);
    const ys = pts.map(([, y]: number[]) => y);

    glMap.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 55, maxZoom: 12, duration: 1400 }
    );
  };

  // Open on the whole fleet the first time the GL map is ready.
  useEffect(() => {
    if (glMap) fitFleet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per map instance
  }, [glMap]);

  const [follow, setFollow] = useState(false);
  const [tour, setTour] = useState(false);
  const [clean, setClean] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  // `?gl=0` forces the no-WebGL message (for testing the fallback).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('gl');
    let ok = false;

    try {
      ok = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      ok = false;
    }
    setGl(q !== '0' && ok);
  }, []);

  // The visible box; reported by the map after every pan / zoom.
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const bboxParam = bbox ? bboxToParam(bbox) : undefined;

  // Overview: newest reporting vehicle (where to centre the map) + total reporting vehicles (meta.total).
  const { data: overviewData, isLoading: overviewLoading } = useSimpleQuery<any>(
    'fleet-positions-overview',
    '/api/fleet/positions',
    { limit: 1 }
  );
  const totalReporting: number = overviewData?.success
    ? (overviewData.meta?.total ?? overviewData.data?.length ?? 0)
    : 0;
  const newest: any = overviewData?.success ? overviewData.data?.[0] : null;

  const { data: positionsData, isLoading: positionsLoading } = useSimpleQuery<any>(
    'fleet-positions',
    '/api/fleet/positions',
    // While following a vehicle / touring, ask for the whole fleet so the followed vehicle never leaves the list.
    { bbox: follow || tour ? undefined : bboxParam, limit: POSITION_LIMIT },
    // Slow safety poll only: fleet:position moves markers live, reconnect/focus refetch cover gaps.
    {
      refetchInterval: isShowcase() ? 700 : 120000,
      enabled: !!bboxParam,
      placeholderData: keepPreviousData,
    }
  );
  const isLoading = overviewLoading || (!!bboxParam && positionsLoading) || !bboxParam;

  const { data: historyData } = useSimpleQuery(
    `fleet-history-${selectedDeviceId}`,
    selectedDeviceId ? `/api/fleet/devices/${selectedDeviceId}/history` : null,
    {},
    { enabled: !!selectedDeviceId }
  );

  // Optional trip overlay: planned stops + status, driven trail, current position (GET /trips/{id}/route).
  const [selectedTripId, setSelectedTripId] = useState('');

  const { data: tripsData } = useSimpleQuery(
    'fleet-map-trips',
    '/api/trips',
    {},
    {
      refetchOnMount: 'always',
    }
  );
  const activeTrips: any[] = (tripsData?.success ? (tripsData.data as any)?.data || [] : []).filter(
    (t: any) => t.status === 'in_progress' || t.status === 'planned'
  );

  const { data: routeData } = useSimpleQuery(
    `trip-route-${selectedTripId}`,
    selectedTripId ? `/api/trips/${selectedTripId}/route` : null,
    {},
    {
      enabled: !!selectedTripId,
      refetchInterval: selectedTripId ? (isShowcase() ? 2500 : 120000) : false,
    }
  );
  const tripRoute: any = selectedTripId && routeData?.success ? routeData.data : null;

  // Yards / geofences whose circle overlaps the view (up to 500 records each, five pages of 100).
  const yardsView = useViewportList('fleet-yards', '/api/yards', { bbox: bboxParam }, !!bboxParam);
  const yards: any[] = yardsView.items.filter((y: any) => y.latitude && y.longitude);
  const yardsTotal = yardsView.total;

  const geofencesView = useViewportList(
    'fleet-geofences',
    '/api/geofences',
    { bbox: bboxParam, is_active: 1 },
    !!bboxParam
  );
  const geofences: any[] = geofencesView.items;
  const geofencesTotal = geofencesView.total;

  const handleYardClick = (yard: any) => {
    openModal(<YardLayoutEditor yardId={yard.id} yardName={yard.name} />);
  };

  const positions: any[] = positionsData?.success ? positionsData.data : [];
  const glVehicles: LiveVehicle[] = useMemo(
    () => positions.map(vehicleFromPosition).filter(Boolean) as LiveVehicle[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positions identity follows the query data
    [positionsData]
  );
  const glVehiclesRef = useRef(glVehicles);

  if (process.env.NODE_ENV !== 'production') (window as any).__cvGlVehicles = glVehicles;

  glVehiclesRef.current = glVehicles;

  // Fleet tour: every few seconds select the next moving vehicle, follow it and fly in.
  useEffect(() => {
    if (!tour || !glMap) return;

    let i = 0;
    const step = () => {
      const moving = glVehiclesRef.current.filter(v => v.state === 'moving');

      if (!moving.length) return;

      const v = moving[i++ % moving.length];

      setGlSelected(v.id);
      setSelectedDeviceId(v.raw?.device_id ?? null);
      setFollow(true);
      glMap.easeTo({
        center: [v.lon, v.lat],
        zoom: 12.6,
        pitch: mapPrefs.mode === '3d' ? 58 : 0,
        duration: 2600,
      });
    };

    step();

    const t = setInterval(step, 9000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vehicles are read through a ref
  }, [tour, glMap]);

  // `meta` exists because we send bbox + limit: total = trackers in view before the cap.
  const inView: number = positionsData?.success
    ? (positionsData.meta?.total ?? positions.length)
    : 0;
  const truncated: string[] = [
    positionsData?.meta?.truncated ? `${positions.length} of ${inView} vehicles` : '',
    yardsTotal > yards.length ? `${yards.length} of ${yardsTotal} yards` : '',
    geofencesTotal > geofences.length ? `${geofences.length} of ${geofencesTotal} geofences` : '',
  ].filter(Boolean);
  const trail: [number, number][] = historyData?.success
    ? historyData.data.map((p: any) => [p.latitude, p.longitude])
    : [];

  // Default center: the most recently reporting vehicle, else a reasonable fallback matching the
  // existing Map.jsx's default location. (Read once, when the map mounts.)
  const defaultCenter: [number, number] = newest
    ? [Number(newest.latitude), Number(newest.longitude)]
    : [31.4757729, 74.3399971];

  return (
    <div className="glass flex flex-col h-[calc(100vh-300px)] min-h-[560px] overflow-hidden rounded-modal mt-4 mb-8">
      <div className="px-6 py-4 border-b border-line-soft bg-white/60 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="page-title text-title-sm">Live map</h1>
          <p className="text-[12.5px] text-ink-2">
            {isLoading
              ? 'Loading…'
              : totalReporting > positions.length
                ? `${positions.length} vehicle${positions.length === 1 ? '' : 's'} in view · ${totalReporting} reporting in total`
                : `${positions.length} vehicle${positions.length === 1 ? '' : 's'} reporting a position`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedTripId}
            onChange={e => setSelectedTripId(e.target.value)}
            className="bg-white border border-line rounded-xl px-2 py-1 text-[11px] text-ink-0 max-w-[240px]"
            aria-label="Show trip route"
          >
            <option value="">Show trip route…</option>
            {activeTrips.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.trip_reference || `Trip #${t.id}`} · {t.vehicle?.name || 'vehicle'} ·{' '}
                {String(t.status).replace('_', ' ')}
              </option>
            ))}
          </select>
          {selectedDeviceId && (
            <button
              onClick={() => setSelectedDeviceId(null)}
              className="text-caption font-medium text-ink-2 hover:text-ink-0 border border-line bg-white rounded-full px-2.5 py-1"
            >
              Clear trail
            </button>
          )}
        </div>
      </div>

      <div ref={stage} className="flex-1 relative bg-surface-0">
        {overviewLoading ? (
          <div className="h-full flex items-center justify-center text-xs text-ink-2">
            Loading map…
          </div>
        ) : gl ? (
          <>
            <ConvoyMap
              look={mapPrefs.look}
              mode={mapPrefs.mode}
              center={defaultCenter}
              zoom={11}
              onBoundsChange={setBbox}
              onReady={setGlMap}
              ariaLabel="Live fleet map"
            >
              <Scenery3D />
              {tripRoute && <RouteLayer route={tripRoute} />}
              <HistoryLayer trail={trail} />
              <GeofenceLayer
                geofences={geofences}
                yards={yards}
                showGeofences={layers.geofences}
                showYards={layers.yards}
              />
              {layers.yards && <YardLayer yards={yards} onSelect={handleYardClick} />}
              <VehicleLayer
                vehicles={layers.vehicles ? glVehicles : []}
                iconStyle={mapPrefs.iconStyle}
                selectedId={glSelected}
                onSelect={id => {
                  setGlSelected(id);
                  const v = glVehicles.find(x => x.id === id);

                  setSelectedDeviceId(v ? (v.raw?.device_id ?? null) : null);
                }}
                speedLabel={v => formatQty(u.speed, v.speed, 0)}
                motionScale={isShowcase() ? demoSpeed : 1}
                followId={follow ? glSelected : null}
                onFollowLost={() => {
                  setFollow(false);
                  setTour(false);
                }}
                onOpen={v => openModal(<VehicleDetailModal vehicleId={v.id} />)}
              />
            </ConvoyMap>
            {!clean && <MapHud vehicles={glVehicles} className="absolute left-4 top-4 z-10" />}
            {clean && (
              <button
                type="button"
                onClick={() => setClean(false)}
                className="glass-strong absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-1 opacity-60 hover:opacity-100"
              >
                <Eye size={13} /> Show controls
              </button>
            )}
            {!clean && (
              <MapToolbar
                prefs={mapPrefs}
                onChange={setMapPrefs}
                onFit={fitFleet}
                className="absolute right-4 top-4 z-10"
              >
                {isShowcase() && (
                  <div
                    role="group"
                    aria-label="Demo speed"
                    className="flex items-center gap-0.5 rounded-full bg-white/70 p-0.5"
                  >
                    <Gauge size={14} className="ml-2 text-ink-2" aria-hidden />
                    {[1, 10, 20, 60].map(x => (
                      <button
                        key={x}
                        type="button"
                        aria-pressed={demoSpeed === x}
                        onClick={() => {
                          setDemoSpeed(x);
                          setDemoSpeedState(x);
                        }}
                        className="grid h-8 min-w-8 place-items-center rounded-full px-2 text-[11px] font-semibold text-ink-1 hover:bg-black/[0.05] aria-pressed:bg-brand aria-pressed:text-white"
                      >
                        {x}×
                      </button>
                    ))}
                  </div>
                )}
                <div
                  role="group"
                  aria-label="Cinematic tools"
                  className="flex items-center gap-0.5 rounded-full bg-white/70 p-0.5"
                >
                  <button
                    type="button"
                    disabled={!glSelected}
                    aria-pressed={follow}
                    aria-label="Follow the selected vehicle"
                    title={
                      glSelected ? 'Follow the selected vehicle' : 'Select a vehicle to follow it'
                    }
                    onClick={() => setFollow(f => !f)}
                    className="grid size-8 place-items-center rounded-full text-ink-1 hover:bg-black/[0.05] disabled:opacity-40 aria-pressed:bg-brand aria-pressed:text-white"
                  >
                    <Crosshair size={15} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={tour}
                    aria-label={tour ? 'Stop the fleet tour' : 'Start the fleet tour'}
                    title="Fleet tour — the camera visits moving vehicles"
                    onClick={() => setTour(t => !t)}
                    className="grid size-8 place-items-center rounded-full text-ink-1 hover:bg-black/[0.05] aria-pressed:bg-brand aria-pressed:text-white"
                  >
                    {tour ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    type="button"
                    aria-label="Hide the controls (clean view for recording)"
                    title="Clean view"
                    onClick={() => setClean(true)}
                    className="grid size-8 place-items-center rounded-full text-ink-1 hover:bg-black/[0.05]"
                  >
                    <EyeOff size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Full screen"
                    title="Full screen"
                    onClick={() =>
                      document.fullscreenElement
                        ? document.exitFullscreen()
                        : stage.current?.requestFullscreen?.()
                    }
                    className="grid size-8 place-items-center rounded-full text-ink-1 hover:bg-black/[0.05]"
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
              </MapToolbar>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-1">
            The live map needs WebGL, which this browser or device does not provide. The lists and
            reports still work.
          </div>
        )}

        {!overviewLoading && !(gl && clean) && (
          <div
            className="absolute bottom-4 left-4 z-[1000] w-56 glass-strong p-3 shadow"
            role="group"
            aria-label="Map layers"
          >
            <div className="eyebrow mb-2">Layers</div>
            {(
              [
                ['vehicles', 'Vehicles', positions.length, 'var(--color-brand)'],
                ['yards', 'Yards', yardsTotal, 'var(--color-brand-ink)'],
                ['geofences', 'Geofences', geofencesTotal, 'var(--color-gold)'],
              ] as const
            ).map(([key, label, n, color]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] text-ink-0 hover:bg-black/[0.04]"
              >
                <input
                  type="checkbox"
                  className="check"
                  checked={layers[key]}
                  onChange={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                />
                <span className="size-2.5 rounded-full" style={{ background: color }} />
                <span className="flex-1">{label}</span>
                <span className="tabular-nums text-ink-2">{n}</span>
              </label>
            ))}
          </div>
        )}

        {truncated.length > 0 && (
          <div
            role="status"
            data-testid="map-truncated"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] glass-strong  px-3 py-1.5 text-[11px] text-ink-1 shadow"
          >
            Showing {truncated.join(', ')} in view — zoom in to see the rest.
          </div>
        )}

        {!isLoading && !overviewLoading && positions.length === 0 && totalReporting === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="glass-strong  px-4 py-3 text-xs text-ink-2 text-center">
              No vehicles have reported a GPS position yet.
              <br />
              Assign a GPS tracker to a vehicle and send it a position to see it here.
            </div>
          </div>
        )}

        {!isLoading && positions.length === 0 && totalReporting > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="glass-strong  px-4 py-2 text-xs text-ink-1 text-center shadow">
              No vehicles in this area — {totalReporting} reporting elsewhere. Zoom out or pan the
              map.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
