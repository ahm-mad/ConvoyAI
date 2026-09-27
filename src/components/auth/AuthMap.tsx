'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import MapHud from '@components/map/MapHud';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/** Slow camera tour along the sample fleet's corridors: [lat, lon] centre, zoom, bearing, pitch. */
const TOUR: { c: [number, number]; z: number; b: number; p: number }[] = [
  { c: [31.2, 73.4], z: 6.8, b: -10, p: 52 },
  { c: [29.4, 71.2], z: 7, b: 12, p: 56 },
  { c: [27.2, 68.9], z: 7.1, b: -6, p: 50 },
  { c: [32.6, 72.6], z: 7, b: 8, p: 54 },
];

/**
 * The night-map backdrop of the sign-in / register screens: the sample fleet (no API) driving while the camera drifts
 * along the corridors. Not interactive; the drift stops for visitors who prefer reduced motion.
 */
export default function AuthMap() {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [map, setMap] = useState<any>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      const [sim, kinds] = await Promise.all([
        import('@utils/showcase/simulation'),
        import('@components/map/vehicle/vehicleKinds'),
      ]);

      if (cancelled) return;

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

  useEffect(() => {
    if (!map || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let i = 0;
    const leg = () => {
      const t = TOUR[i++ % TOUR.length];

      map.easeTo({
        center: [t.c[1], t.c[0]],
        zoom: t.z,
        bearing: t.b,
        pitch: t.p,
        duration: 16000,
        easing: (x: number) => x, // constant speed: a drift, not a series of moves
      });
    };

    leg();

    const id = setInterval(leg, 16000);

    return () => {
      clearInterval(id);
      map.stop();
    };
  }, [map]);

  return (
    <div className="absolute inset-0 isolate" aria-hidden>
      <ConvoyMap
        look="night"
        mode="3d"
        center={TOUR[0].c}
        zoom={TOUR[0].z}
        interactive={false}
        onReady={setMap}
        ariaLabel="Live sample fleet"
      >
        <VehicleLayer
          vehicles={vehicles}
          iconStyle="silhouette"
          selectedId={null}
          onSelect={() => {}}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
          trails
        />
      </ConvoyMap>
      <div className="pointer-events-none absolute right-6 top-6">
        <MapHud vehicles={vehicles} />
      </div>
    </div>
  );
}
