/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { token } from '@lib/design/tokens';

/**
 * Draws one trip on a Leaflet map from GET /trips/{id}/route (flows/05 §5): the planned path through
 * origin → stops (numbered, coloured by status) → destination, the driven GPS trail, and the
 * vehicle's current position. Rendered as children of a MapContainer so both the trip detail "Map"
 * tab and the Fleet Map tab's "show trip" selector share it.
 */

const STATUS_COLOR: Record<string, string> = {
  planned: token('--color-chart-neutral'),
  arrived: token('--color-brand'),
  departed: token('--color-success'),
  missed: token('--color-gold'),
};

const numberIcon = (label: string, color: string, size = 26) =>
  new L.DivIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${token('--color-ink-0')};border:2px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font:600 11px/1 ui-monospace,monospace">${label}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

const vehicleIcon = () =>
  new L.DivIcon({
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 21 13 21s13-11.5 13-21C26 5.8 20.2 0 13 0z" fill="${token('--color-success')}" stroke="${token('--color-ink-0')}" stroke-width="1"/>
      <circle cx="13" cy="13" r="5.5" fill="${token('--color-ink-0')}"/>
    </svg>`,
    className: '',
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
  });

const isCoord = (lat: unknown, lng: unknown) =>
  lat !== null &&
  lat !== undefined &&
  lng !== null &&
  lng !== undefined &&
  !Number.isNaN(Number(lat)) &&
  !Number.isNaN(Number(lng));

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : 'not recorded');

/** Every coordinate the route draws, in the order it is drawn. */
export function routePoints(route: any): [number, number][] {
  if (!route) return [];

  const pts: [number, number][] = [];
  const add = (lat: unknown, lng: unknown) => {
    if (isCoord(lat, lng)) pts.push([Number(lat), Number(lng)]);
  };

  add(route.origin?.latitude, route.origin?.longitude);
  (route.stops || []).forEach((s: any) => add(s.yard?.latitude, s.yard?.longitude));
  add(route.destination?.latitude, route.destination?.longitude);
  (route.trail?.positions || []).forEach((p: any) => add(p.latitude, p.longitude));
  add(route.current_position?.latitude, route.current_position?.longitude);

  return pts;
}

/** Re-measures the map whenever its container changes size (modal animation, scrollbar, window resize). */
export function AutoResize() {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());

    observer.observe(el);

    return () => observer.disconnect();
  }, [map]);

  return null;
}

/** Fits the map to the route whenever a different trip (or fresh route data) arrives. */
export function FitRoute({ route }: { route: any }) {
  const map = useMap();
  const key = route ? `${route.trip?.id}-${routePoints(route).length}` : '';

  useEffect(() => {
    const pts = routePoints(route);

    if (pts.length === 0) return;

    // A modal/tab that was just opened is still settling: measure and fit twice (early + after the
    // layout has finished) so the first fit doesn't run against a stale container size.
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15, animate: false });
    };
    const timers = [setTimeout(fit, 250), setTimeout(fit, 1000)];

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

export default function TripRouteLayers({ route }: { route: any }) {
  if (!route) return null;

  const stops: any[] = [...(route.stops || [])].sort(
    (a, b) => (a.sequence || 0) - (b.sequence || 0)
  );
  const trail: [number, number][] = (route.trail?.positions || []).map(
    (p: any) => [Number(p.latitude), Number(p.longitude)] as [number, number]
  );

  // The intended path, in stop order — straight lines, not road routing.
  const planned: [number, number][] = [];
  if (isCoord(route.origin?.latitude, route.origin?.longitude))
    planned.push([Number(route.origin.latitude), Number(route.origin.longitude)]);
  stops.forEach(s => {
    if (isCoord(s.yard?.latitude, s.yard?.longitude))
      planned.push([Number(s.yard.latitude), Number(s.yard.longitude)]);
  });
  if (isCoord(route.destination?.latitude, route.destination?.longitude))
    planned.push([Number(route.destination.latitude), Number(route.destination.longitude)]);

  return (
    <>
      {planned.length > 1 && (
        <Polyline
          positions={planned}
          pathOptions={{
            color: token('--color-chart-neutral'),
            weight: 2,
            opacity: 0.7,
            dashArray: '6 6',
            className: 'cv-route-flow',
          }}
        />
      )}

      {trail.length > 1 && (
        <Polyline
          positions={trail}
          pathOptions={{ color: token('--color-brand'), weight: 3, opacity: 0.85 }}
        />
      )}

      {isCoord(route.origin?.latitude, route.origin?.longitude) && (
        <Marker
          position={[Number(route.origin.latitude), Number(route.origin.longitude)]}
          icon={numberIcon('S', token('--color-success'))}
          title="Origin"
        >
          <Popup>
            <strong>Origin</strong>
            <div>{route.origin.address}</div>
          </Popup>
        </Marker>
      )}

      {stops.map(s =>
        isCoord(s.yard?.latitude, s.yard?.longitude) ? (
          <Marker
            key={s.id}
            position={[Number(s.yard.latitude), Number(s.yard.longitude)]}
            icon={numberIcon(
              String(s.sequence ?? ''),
              STATUS_COLOR[s.status] || STATUS_COLOR.planned
            )}
            title={`Stop ${s.sequence}: ${s.yard?.name ?? ''}`}
          >
            <Popup>
              <strong>
                Stop {s.sequence}: {s.yard?.name}
              </strong>
              <div style={{ textTransform: 'capitalize' }}>{s.status}</div>
              <div>Arrived: {fmt(s.actual_arrival_at)}</div>
              <div>Departed: {fmt(s.actual_departure_at)}</div>
              {s.actual_source && <div>Source: {String(s.actual_source).replace('_', ' ')}</div>}
            </Popup>
          </Marker>
        ) : null
      )}

      {isCoord(route.destination?.latitude, route.destination?.longitude) && (
        <Marker
          position={[Number(route.destination.latitude), Number(route.destination.longitude)]}
          icon={numberIcon(
            'D',
            route.trip?.destination_reached_at ? token('--color-success') : token('--color-gold')
          )}
          title="Destination"
        >
          <Popup>
            <strong>Destination</strong>
            <div>{route.destination.address}</div>
            {route.trip?.destination_reached_at && (
              <div>Reached: {fmt(route.trip.destination_reached_at)}</div>
            )}
          </Popup>
        </Marker>
      )}

      {isCoord(route.current_position?.latitude, route.current_position?.longitude) && (
        <Marker
          position={[
            Number(route.current_position.latitude),
            Number(route.current_position.longitude),
          ]}
          icon={vehicleIcon()}
          title={route.vehicle?.name || 'Vehicle'}
          zIndexOffset={1000}
        >
          <Popup>
            <strong>{route.vehicle?.name || 'Vehicle'}</strong>
            <div>As of {fmt(route.current_position.recorded_at)}</div>
            {route.current_position.speed != null && (
              <div>Speed: {route.current_position.speed} km/h</div>
            )}
          </Popup>
        </Marker>
      )}
    </>
  );
}
