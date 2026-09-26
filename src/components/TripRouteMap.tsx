/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { isShowcase } from '@utils/showcase';
import { getDemoSpeed } from '@utils/showcase/simulation';
import RouteLayer from '@components/map/layers/RouteLayer';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import Scenery3D from '@components/map/layers/Scenery3D';
import { useMapPrefs } from '@components/map/useMapPrefs';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { routePoints } from '@components/map/geo';
import { token } from '@lib/design/tokens';

const FALLBACK_CENTER: [number, number] = [31.4757729, 74.3399971];

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1">
    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

/**
 * The trip detail "Map" tab: GET /trips/{id}/route drawn on a map — planned stops with their live
 * status, the driven trail and the vehicle's current position. In-progress trips refresh on a slow
 * timer until the realtime `trip:update` / `fleet:position` events (flows/05 step 6) replace it.
 */
export default function TripRouteMap({
  tripId,
  tripStatus,
  height = 340,
}: {
  tripId: string | number;
  tripStatus?: string;
  height?: number;
}) {
  const u = useUnits();
  const [prefs] = useMapPrefs();

  const { data, isLoading } = useSimpleQuery(
    `trip-route-${tripId}`,
    `/api/trips/${tripId}/route`,
    {},
    {
      refetchInterval: tripStatus === 'in_progress' ? (isShowcase() ? 700 : 120000) : false,
      refetchOnMount: 'always',
    }
  );
  const route: any = data?.success ? data.data : null;
  const hasPoints = routePoints(route).length > 0;
  const vehicle: LiveVehicle | null = useMemo(() => {
    const cp = route?.current_position;

    if (!cp || !Number.isFinite(Number(cp.latitude))) return null;

    const pts = route?.trail?.positions ?? [];
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const heading =
      a && b
        ? ((Math.atan2(
            Math.sin(((b.longitude - a.longitude) * Math.PI) / 180),
            Math.cos((a.latitude * Math.PI) / 180) * Math.tan((b.latitude * Math.PI) / 180) -
              Math.sin((a.latitude * Math.PI) / 180) *
                Math.cos(((b.longitude - a.longitude) * Math.PI) / 180)
          ) *
            180) /
            Math.PI +
            360) %
          360
        : 0;

    return {
      id: String(route.vehicle?.id ?? 'v'),
      name: route.vehicle?.name ?? 'Vehicle',
      plate: route.vehicle?.plate,
      category: route.vehicle?.vehicle_category,
      lat: Number(cp.latitude),
      lon: Number(cp.longitude),
      heading,
      speed: Number(cp.speed ?? 0),
      state: Number(cp.speed ?? 0) > 5 ? 'moving' : 'parked',
    };
  }, [route]);

  if (isLoading) return <div className="text-xs text-ink-2 text-center py-8">Loading map…</div>;

  if (!route)
    return (
      <div className="text-xs text-ink-2 text-center py-8">
        {(data as any)?.message || 'Could not load the trip route.'}
      </div>
    );

  return (
    <div>
      {!hasPoints && (
        <div className="text-[11px] text-ink-2 italic mb-2">
          This trip has no coordinates yet — add origin/destination coordinates, or yards with a
          location, to see it on the map.
        </div>
      )}

      <div className="rounded-md overflow-hidden border border-line-soft" style={{ height }}>
        <ConvoyMap
          look={prefs.look}
          mode="2d"
          center={[30.5, 72.5]}
          zoom={6}
          scrollZoom={false}
          ariaLabel="Trip route map"
        >
          <Scenery3D />
          <RouteLayer route={route} />
          {vehicle && (
            <VehicleLayer
              vehicles={[vehicle]}
              iconStyle={prefs.iconStyle}
              selectedId={null}
              onSelect={() => {}}
              speedLabel={v => formatQty(u.speed, v.speed, 0)}
              motionScale={isShowcase() ? getDemoSpeed() : 1}
              trails={false}
            />
          )}
        </ConvoyMap>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-ink-2">
        <Legend color={token('--color-chart-neutral')} label="Planned" />
        <Legend color={token('--color-brand')} label="Arrived" />
        <Legend color={token('--color-success')} label="Departed" />
        <Legend color={token('--color-gold')} label="Missed / destination" />
        {route.trail?.total_points != null && (
          <span>
            Trail: {route.trail.total_points} points
            {route.trail.computed_distance_km != null &&
              ` · ${formatQty(u.distance, route.trail.computed_distance_km)} driven`}
          </span>
        )}
      </div>
    </div>
  );
}
