/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { MapContainer, TileLayer, Polyline, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@contexts/ThemeContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { get } from '@utils/apiHelper';
import { useModal } from '@contexts/ModalContext';
import VehicleMarker from '@components/VehicleMarker';
import YardMarker from '@components/YardMarker';
import YardLayoutEditor from '@components/YardLayoutEditor';
import VehicleDetailModal from '@components/VehicleDetailModal';
import TripRouteLayers, { FitRoute } from '@components/TripRouteLayers';
import MapViewportWatcher from '@components/MapViewportWatcher';
import { useViewportList } from '@hooks/useViewportList';
import { bboxToParam, type Bbox } from '@utils/mapViewport';
import { token } from '@lib/design/tokens';
import dynamic from 'next/dynamic';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import { vehicleFromPosition, type LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import { formatQty } from '@utils/units';
import { isShowcase } from '@utils/showcase';
import { getDemoSpeed, setDemoSpeed } from '@utils/showcase/simulation';
import { Gauge } from 'lucide-react';
import Scenery3D from '@components/map/layers/Scenery3D';
import RouteLayer from '@components/map/layers/RouteLayer';
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
  const { isLight } = useTheme();
  const { openModal } = useModal();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | number | null>(null);
  const [layers, setLayers] = useState({ vehicles: true, yards: true, geofences: true });
  // Phase 2 (T-006) MapLibre map, opt-in with ?gl=1 until every milestone is in.
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
      { padding: 90, maxZoom: 12, duration: 1400 }
    );
  };

  // Open on the whole fleet the first time the GL map is ready.
  useEffect(() => {
    if (glMap) fitFleet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per map instance
  }, [glMap]);

  useEffect(() => setGl(new URLSearchParams(window.location.search).get('gl') === '1'), []);

  // The visible box; set by MapViewportWatcher once the map exists and after every pan / zoom.
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
    { bbox: bboxParam, limit: POSITION_LIMIT },
    // Slow safety poll only: fleet:position moves markers live, reconnect/focus refetch cover gaps.
    {
      refetchInterval: isShowcase() ? 2000 : 120000,
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

  // Switched from CartoDB — same correction as Map.jsx, same reasoning.
  // const mapTilerKey = '<OLD_MAPTILER_KEY_REDACTED>';
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = `https://api.maptiler.com/maps/dataviz-${isLight ? 'light' : 'dark'}/{z}/{x}/{y}.png?key=${mapTilerKey}`;

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

      <div className="flex-1 relative">
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
              <VehicleLayer
                vehicles={glVehicles}
                iconStyle={mapPrefs.iconStyle}
                selectedId={glSelected}
                onSelect={id => {
                  setGlSelected(id);
                  const v = glVehicles.find(x => x.id === id);

                  setSelectedDeviceId(v ? (v.raw?.device_id ?? null) : null);
                }}
                speedLabel={v => formatQty(u.speed, v.speed, 0)}
                motionScale={isShowcase() ? demoSpeed : 1}
                onOpen={v => openModal(<VehicleDetailModal vehicleId={v.id} />)}
              />
            </ConvoyMap>
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
            </MapToolbar>
          </>
        ) : (
          <MapContainer center={defaultCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
            <MapViewportWatcher onChange={setBbox} />
            <TileLayer
              url={tileUrl}
              tileSize={512}
              zoomOffset={-1}
              attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {layers.vehicles &&
              positions.map((p: any) => (
                <VehicleMarker
                  units={u}
                  key={p.device_id}
                  position={p}
                  onClick={(pos: any) => setSelectedDeviceId(pos.device_id)}
                  onViewDetails={(id: any) => openModal(<VehicleDetailModal vehicleId={id} />)}
                />
              ))}
            {layers.yards &&
              yards.map((y: any) => (
                <YardMarker key={`yard-${y.id}`} yard={y} onClick={handleYardClick} />
              ))}
            {layers.geofences &&
              geofences.map((g: any) => (
                <Circle
                  key={`geofence-${g.id}`}
                  center={[g.center_latitude, g.center_longitude] as [number, number]}
                  radius={g.radius_m}
                  pathOptions={{
                    color: token('--color-gold'),
                    fillColor: token('--color-gold'),
                    fillOpacity: 0.08,
                    weight: 1.5,
                    dashArray: '4 3',
                  }}
                />
              ))}
            {tripRoute && (
              <>
                <FitRoute route={tripRoute} />
                <TripRouteLayers route={tripRoute} />
              </>
            )}
            {trail.length > 1 && (
              <Polyline
                positions={trail}
                pathOptions={{ color: token('--color-brand'), weight: 3, opacity: 0.75 }}
              />
            )}
          </MapContainer>
        )}

        {!overviewLoading && (
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
