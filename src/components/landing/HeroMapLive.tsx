'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MousePointerClick } from 'lucide-react';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import GeofenceLayer from '@components/map/layers/GeofenceLayer';
import MissionRouteLayer, { type MissionRoute } from '@components/map/layers/MissionRouteLayer';
import RouteContextLayer from '@components/map/layers/RouteContextLayer';
import MapToolbar from '@components/map/MapToolbar';
import MapHud from '@components/map/MapHud';
import TripCardExtra from '@components/map/TripCardExtra';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

type Sim = typeof import('@utils/showcase/simulation');
type Data = typeof import('@utils/showcase/dataset');

const START = { center: [31.2, 73.1] as [number, number], zoom: 6.4 };

/** Sample-fleet time-lapse by zoom: fast at country level (vehicles must visibly move), realistic once zoomed in. */
const speedFor = (zoom: number) => (zoom < 8 ? 30 : zoom < 10.5 ? 10 : 3);

/**
 * The landing hero's map: the real map kit on the sample fleet (no login, no API). Visitors can pan, zoom, switch the
 * look / 3D and click a truck to get its card, trip and highlighted road (named ends, geofences on the way). Wheel zoom
 * is off so the page never gets trapped; a hint invites the first click, and the first seconds preview a road by
 * themselves so it is obvious what clicking does.
 */
export default function HeroMapLive() {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [sim, setSim] = useState<Sim | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [map, setMap] = useState<any>(null);
  const [prefs, setPrefs] = useState<{ look: 'light' | 'night' | 'satellite'; mode: '2d' | '3d' }>({
    look: 'light',
    mode: '3d',
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [interactive, setInteractive] = useState(true);
  const zoom = useRef(START.zoom);
  const kinds = useRef<typeof import('@components/map/vehicle/vehicleKinds') | null>(null);

  // Phones: the map would trap vertical page scroll, so it stays a picture there (still live).
  useEffect(() => setInteractive(window.matchMedia('(min-width: 768px)').matches), []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      const [s, k, d] = await Promise.all([
        import('@utils/showcase/simulation'),
        import('@components/map/vehicle/vehicleKinds'),
        import('@utils/showcase/dataset'),
      ]);

      if (cancelled) return;

      kinds.current = k;
      setSim(s);
      setData(d);

      const tick = () =>
        setVehicles(
          s
            .simulatedPositions(Date.now(), speedFor(zoom.current))
            .map(k.vehicleFromPosition)
            .filter(Boolean) as LiveVehicle[]
        );

      tick();
      timer = setInterval(tick, 700);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const on = () => (zoom.current = map.getZoom());

    map.on('zoom', on);

    return () => map.off('zoom', on);
  }, [map]);

  // Until the visitor touches the map, show the road of one moving trip vehicle so the idea is obvious.
  useEffect(() => {
    if (touched || preview || !sim) return;

    const v = vehicles.find(x => {
      if (x.state !== 'moving') return false;

      const r = sim.missionRoute(x.id);

      return !!r?.fromName && r.fromName !== r.toName;
    });

    if (v) setPreview(v.id);
  }, [vehicles, sim, touched, preview]);

  const path = useMemo<[number, number][] | null>(() => {
    const r = sim && selected ? sim.missionRoute(selected) : null;

    return r ? [...[...r.behind].reverse(), ...r.ahead.slice(1)] : null;
  }, [sim, selected]);

  // A vehicle on a trip shows that trip; one on a local round shows a believable delivery round (never "no trip").
  const cardExtra = (v: LiveVehicle) => {
    const trip = data?.tripModels.find(t => t.vehicle_id === v.id && t.status === 'in_progress');

    if (trip || !data) return <TripCardExtra trip={trip} />;

    const n = Number(String(v.id).replace(/\D/g, '')) || 1;
    const drivers = data.driverModels;
    const d = drivers[n % drivers.length];
    const yard = data.yards[(n * 3) % data.yards.length];
    const now = Date.now();

    return (
      <TripCardExtra
        trip={{
          trip_reference: `DLV-${String(2300 + (n % 90))}`,
          origin_address: sim?.missionRoute(v.id)?.fromName ?? yard.name,
          destination_address: 'Customer drop-offs',
          planned_start_at: new Date(now - 42 * 60_000).toISOString(),
          planned_end_at: new Date(now + 68 * 60_000).toISOString(),
          driver: { first_name: d.raw.first_name, last_name: d.raw.last_name },
        }}
      />
    );
  };

  return (
    <div className="absolute inset-0">
      <ConvoyMap
        look={prefs.look}
        mode={prefs.mode}
        center={START.center}
        zoom={START.zoom}
        interactive={interactive}
        scrollZoom={false}
        zoomControls={interactive}
        onReady={setMap}
        ariaLabel="Live fleet map: sample fleet"
      >
        {sim && (
          <MissionRouteLayer
            vehicleId={selected ?? hover ?? preview}
            read={sim.missionRoute as (id: string) => MissionRoute | null}
            preview={!selected}
            yards={data?.yards}
          />
        )}
        {data && <RouteContextLayer path={path} yards={data.yards} geofences={data.geofences} />}
        <GeofenceLayer geofences={[]} yards={data?.yards ?? []} showGeofences={false} showYards />
        <VehicleLayer
          vehicles={vehicles}
          iconStyle="silhouette"
          selectedId={selected}
          onSelect={id => {
            setSelected(id);
            if (id) setTouched(true);
          }}
          onHover={id => {
            setHover(id);
            if (id) setTouched(true);
          }}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
          cardExtra={cardExtra}
          labels
          trails
        />
      </ConvoyMap>

      <div className="pointer-events-none absolute left-4 top-4 z-10 hidden sm:block">
        <MapHud vehicles={vehicles} />
      </div>

      {interactive && (
        <MapToolbar
          prefs={{ ...prefs, iconStyle: 'silhouette' } as any}
          onChange={p => setPrefs(cur => ({ ...cur, ...p }) as typeof cur)}
          onFit={() =>
            map?.flyTo({
              center: [START.center[1], START.center[0]],
              zoom: START.zoom,
              duration: 1400,
            })
          }
          showIconStyle={false}
          className="absolute right-4 top-4 z-10"
        />
      )}

      {interactive && !touched && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <span className="glass-strong motion-float glass-pill inline-flex items-center gap-2 px-4 py-2 text-caption font-semibold text-ink-0">
            <MousePointerClick size={14} className="text-brand" aria-hidden />
            Click a truck to follow its route
          </span>
        </div>
      )}
    </div>
  );
}
