/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatQty, unitsFor, type Units } from '@utils/units';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { token } from '@lib/design/tokens';

/**
 * Same customIcon pattern as the existing MarkerIcon.jsx, but a colored
 * SVG pin instead of the default Leaflet marker image — color reflects
 * real position freshness (recorded_at recency), not a generic pin for
 * every vehicle regardless of state.
 */
function vehicleIcon(color: string, live = false) {
  const ring = live
    ? `<span class="cv-ping" style="position:absolute;left:1px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:${color};opacity:.35;pointer-events:none"></span>`
    : '';
  const svg = `
    ${ring}<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 21 13 21s13-11.5 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="${token('--color-surface-1')}" stroke-width="1"/>
      <circle cx="13" cy="13" r="5.5" fill="${token('--color-surface-1')}"/>
      <path d="M9.5 13.5l2.2 2.2 4.3-4.7" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  return new L.DivIcon({
    html: svg,
    className: '',
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
  });
}

/**
 * "Fresh" (reporting recently) vs "stale" — based on the real
 * recorded_at timestamp on this specific position, not Device.last_updated
 * (a GPS tracker's position freshness is the more relevant signal for a
 * fleet map than its general last-activity timestamp).
 */
function isFresh(recordedAt: string | null | undefined) {
  if (!recordedAt) return false;
  const ageMinutes = (Date.now() - new Date(recordedAt).getTime()) / 60000;

  return ageMinutes < 15;
}

export default function VehicleMarker({
  position,
  onClick,
  onViewDetails,
  units: u = unitsFor('metric'),
}: {
  position: any;
  onClick?: (position: any) => void;
  onViewDetails?: (id: any) => void;
  /** The company's units, passed by the caller once (a map can hold thousands of markers). */
  units?: Units;
}) {
  const fresh = isFresh(position.recorded_at);
  const color = fresh ? token('--color-success') : token('--color-chart-neutral');

  // Prefer the assigned VEHICLE's name — that's what a fleet manager
  // actually thinks of this as ("Truck 5"), not the raw tracker identity.
  // Falls back to the tracker's own name only if no vehicle is currently
  // assigned to it.
  const assignedVehicle = position.device?.current_vehicle_assignment?.vehicle;
  const name =
    assignedVehicle?.name ||
    position.device?.name ||
    position.device?.device_unique_identifier ||
    'Unassigned tracker';

  return (
    <Marker
      position={[position.latitude, position.longitude] as [number, number]}
      icon={vehicleIcon(color, fresh)}
      title={name}
      eventHandlers={{ click: () => onClick?.(position) }}
    >
      <Popup>
        <div style={{ fontSize: '12px' }}>
          <strong>{name}</strong>
          <div style={{ color: '#666', marginTop: 3 }}>
            {fresh ? 'Reporting' : 'Stale'} · {new Date(position.recorded_at).toLocaleString()}
          </div>
          {position.speed !== null && position.speed !== undefined && (
            <div style={{ marginTop: 2 }}>Speed: {formatQty(u.speed, position.speed, 0)}</div>
          )}
          {onViewDetails && assignedVehicle && (
            <button
              onClick={() => onViewDetails(assignedVehicle.id)}
              style={{
                marginTop: 6,
                fontSize: '11px',
                color: token('--color-brand'),
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              View full details
            </button>
          )}
          {onViewDetails && !assignedVehicle && (
            <div style={{ marginTop: 6, fontSize: '10.5px', color: '#999', fontStyle: 'italic' }}>
              This tracker isn't assigned to a vehicle yet.
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
