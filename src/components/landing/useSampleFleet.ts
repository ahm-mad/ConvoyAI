'use client';

import { useEffect, useState } from 'react';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';

type Sim = typeof import('@utils/showcase/simulation');
type Data = typeof import('@utils/showcase/dataset');

/** The sample fleet for logged-out pages: simulation + fixtures loaded lazily, vehicles refreshed every 700 ms. */
export function useSampleFleet(speed: number | ((zoom: number) => number) = 10, zoom = () => 6.5) {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [sim, setSim] = useState<Sim | null>(null);
  const [data, setData] = useState<Data | null>(null);

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

      setSim(s);
      setData(d);

      const tick = () =>
        setVehicles(
          s
            .simulatedPositions(Date.now(), typeof speed === 'function' ? speed(zoom()) : speed)
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
    // The speed / zoom readers are stable enough for a tick timer; restarting it on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { vehicles, sim, data };
}
