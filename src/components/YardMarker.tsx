/* eslint-disable @typescript-eslint/no-explicit-any */
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

/**
 * Same custom-icon pattern as VehicleMarker/MarkerIcon, but a square
 * depot glyph instead of the pin-drop shape — a yard is a facility, not
 * a moving point, and should read differently on the map at a glance.
 */
function yardIcon() {
  const svg = `
    <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="24" height="24" rx="4" fill="#1a1f24" stroke="#29d3ff" stroke-width="2"/>
      <path d="M7 17V11l6-4 6 4v6" stroke="#29d3ff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
      <rect x="10" y="13" width="6" height="4" fill="#29d3ff"/>
    </svg>`;

  return new L.DivIcon({
    html: svg,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

export default function YardMarker({
  yard,
  onClick,
}: {
  yard: any;
  onClick?: (yard: any) => void;
}) {
  return (
    <Marker
      position={[yard.latitude, yard.longitude] as [number, number]}
      icon={yardIcon()}
      eventHandlers={{ click: () => onClick?.(yard) }}
    >
      <Popup>
        <div style={{ fontSize: '12px' }}>
          <strong>{yard.name}</strong>
          <div style={{ color: '#666', marginTop: 3 }}>{yard.slots_count ?? 0} slot(s)</div>
          {yard.address && <div style={{ color: '#666', marginTop: 2 }}>{yard.address}</div>}
        </div>
      </Popup>
    </Marker>
  );
}
