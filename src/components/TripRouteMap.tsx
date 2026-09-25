/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@contexts/ThemeContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import TripRouteLayers, { AutoResize, FitRoute, routePoints } from '@components/TripRouteLayers';
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
  const { isLight } = useTheme();
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = `https://api.maptiler.com/maps/dataviz-${isLight ? 'light' : 'dark'}/{z}/{x}/{y}.png?key=${mapTilerKey}`;

  const { data, isLoading } = useSimpleQuery(
    `trip-route-${tripId}`,
    `/api/trips/${tripId}/route`,
    {},
    { refetchInterval: tripStatus === 'in_progress' ? 120000 : false, refetchOnMount: 'always' }
  );
  const route: any = data?.success ? data.data : null;
  const hasPoints = routePoints(route).length > 0;

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
        <MapContainer center={FALLBACK_CENTER} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url={tileUrl}
            tileSize={512}
            zoomOffset={-1}
            attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; OSM'
          />
          <AutoResize />
          <FitRoute route={route} />
          <TripRouteLayers route={route} />
        </MapContainer>
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
