'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { PanelLeftOpen } from 'lucide-react';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import GeofenceLayer from '@components/map/layers/GeofenceLayer';
import MissionRouteLayer, { type MissionRoute } from '@components/map/layers/MissionRouteLayer';
import RouteContextLayer from '@components/map/layers/RouteContextLayer';
import FleetPanel, { type StatusFilter } from '@components/map/FleetPanel';
import AlertStrip from '@components/map/AlertStrip';
import { SPEED_ALERT_KMH, type MapAlert } from '@components/map/useMapAlerts';
import TripCardExtra from '@components/map/TripCardExtra';
import { useSampleFleet } from './useSampleFleet';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/**
 * "Live map" tab of the tour: the product's own fleet list + alert strip + map on the sample fleet. Pick a row (or a
 * truck) to fly there, see its card, trip and highlighted road.
 */
export default function TourLiveMap() {
  const zoom = useRef(6.8);
  const { vehicles, sim, data } = useSampleFleet(
    z => (z < 8 ? 20 : 6),
    () => zoom.current
  );
  const [map, setMap] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [panel, setPanel] = useState(true);
  const [hideAlerts, setHideAlerts] = useState(false);

  const shown = useMemo(
    () => (filter === 'all' ? vehicles : vehicles.filter(v => v.state === filter)),
    [vehicles, filter]
  );

  // Alerts from what the fleet is doing right now (speeding) + the latest sample geofence entries.
  const alerts = useMemo<MapAlert[]>(() => {
    const out: MapAlert[] = vehicles
      .filter(v => v.state === 'moving' && v.speed > SPEED_ALERT_KMH)
      .map(v => ({
        id: `s-${v.id}`,
        kind: 'speed' as const,
        tone: 'danger' as const,
        title: v.name.split(' · ')[0],
        sub: 'over the speed limit',
        kmh: v.speed,
        vehicleId: v.id,
        at: Date.now(),
      }));

    (data?.geofenceEvents ?? []).slice(0, 3).forEach(e =>
      out.push({
        id: `g-${e.id}`,
        kind: 'geofence',
        tone: 'info',
        title: `${e.vehicle.name.split(' · ')[0]} ${e.event_type === 'exit' ? 'left' : 'entered'} ${e.geofence.name}`,
        sub: '',
        vehicleId: e.vehicle_id,
        at: Date.parse(e.occurred_at),
      })
    );

    return out;
  }, [vehicles, data]);

  const path = useMemo<[number, number][] | null>(() => {
    const r = sim && selected ? sim.missionRoute(selected) : null;

    return r ? [...[...r.behind].reverse(), ...r.ahead.slice(1)] : null;
  }, [sim, selected]);

  const pick = (v: LiveVehicle) => {
    setSelected(v.id);
    map?.flyTo({ center: [v.lon, v.lat], zoom: Math.max(zoom.current, 8.4), duration: 1500 });
  };

  const cardExtra = (v: LiveVehicle) => {
    const trip = data?.tripModels.find(t => t.vehicle_id === v.id && t.status === 'in_progress');

    if (trip || !data) return <TripCardExtra trip={trip} />;

    const n = Number(String(v.id).replace(/\D/g, '')) || 1;
    const d = data.driverModels[n % data.driverModels.length];
    const now = Date.now();

    return (
      <TripCardExtra
        trip={{
          trip_reference: `DLV-${2300 + (n % 90)}`,
          origin_address: sim?.missionRoute(v.id)?.fromName ?? data.yards[0].name,
          destination_address: 'Customer drop-offs',
          planned_start_at: new Date(now - 42 * 60_000).toISOString(),
          planned_end_at: new Date(now + 68 * 60_000).toISOString(),
          driver: { first_name: d.raw.first_name, last_name: d.raw.last_name },
        }}
      />
    );
  };

  return (
    <div className="relative h-[540px] overflow-hidden bg-surface-2">
      <ConvoyMap
        look="light"
        mode="3d"
        center={[31.9, 73.4]}
        zoom={6.8}
        scrollZoom={false}
        zoomControls
        onReady={m => {
          setMap(m);
          m.on('zoom', () => (zoom.current = m.getZoom()));
        }}
        ariaLabel="Live map tour: sample fleet"
      >
        {sim && (
          <MissionRouteLayer
            vehicleId={selected ?? hover}
            read={sim.missionRoute as (id: string) => MissionRoute | null}
            preview={!selected}
            yards={data?.yards}
          />
        )}
        {data && <RouteContextLayer path={path} yards={data.yards} geofences={data.geofences} />}
        <GeofenceLayer geofences={[]} yards={data?.yards ?? []} showGeofences={false} showYards />
        <VehicleLayer
          vehicles={shown}
          iconStyle="silhouette"
          selectedId={selected}
          onSelect={setSelected}
          onHover={setHover}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
          cardExtra={cardExtra}
          labels
          trails
        />
      </ConvoyMap>

      {panel ? (
        <FleetPanel
          vehicles={vehicles}
          filter={filter}
          onFilter={setFilter}
          selectedId={selected}
          onPick={pick}
          onHover={setHover}
          onCollapse={() => setPanel(false)}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPanel(true)}
          className="glass-strong absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-0"
        >
          <PanelLeftOpen size={14} aria-hidden /> Fleet list
        </button>
      )}

      {!hideAlerts && (
        <AlertStrip
          alerts={alerts}
          speedLabel={kmh => `${Math.round(kmh)} km/h`}
          onPick={a => {
            const v = a.vehicleId ? vehicles.find(x => x.id === a.vehicleId) : null;

            if (v) pick(v);
          }}
          onDismiss={() => setHideAlerts(true)}
          container={null}
        />
      )}
    </div>
  );
}
