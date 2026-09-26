'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import GeofenceLayer from '@components/map/layers/GeofenceLayer';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/**
 * The landing hero's map: the real map kit showing the sample fleet (no login needed) moving along real roads. The
 * simulation and its fixtures are loaded lazily so the landing page stays light until the map appears.
 */
export default function HeroMapLive() {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [yards, setYards] = useState<any[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      const [sim, kinds, data] = await Promise.all([
        import('@utils/showcase/simulation'),
        import('@components/map/vehicle/vehicleKinds'),
        import('@utils/showcase/dataset'),
      ]);

      if (cancelled) return;

      setYards(data.yards);

      const tick = () =>
        setVehicles(
          sim
            .simulatedPositions(Date.now(), 30)
            .map(kinds.vehicleFromPosition)
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

  return (
    <div className="absolute inset-0">
      <ConvoyMap
        look="light"
        mode="3d"
        center={[31.2, 73.1]}
        zoom={6.4}
        interactive={false}
        ariaLabel="Live fleet map preview"
      >
        <GeofenceLayer geofences={[]} yards={yards} showGeofences={false} showYards />
        <VehicleLayer
          vehicles={vehicles}
          iconStyle="silhouette"
          selectedId={null}
          onSelect={() => {}}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
          motionScale={30}
          trails
        />
      </ConvoyMap>
    </div>
  );
}
