import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, X } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useTheme } from '@contexts/ThemeContext';
import { token } from '@lib/design/tokens';

// Same fallback the Fleet map uses when nothing is known yet.
const FALLBACK_CENTER: [number, number] = [31.4757729, 74.3399971];

const round = (n: number) => Math.round(n * 1e6) / 1e6;

const parseCoord = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);

  return Number.isFinite(n) ? n : null;
};

function pinIcon() {
  const svg = `
    <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.4 1 1 6.3 1 12.8 1 21.6 13 33 13 33s12-11.4 12-20.2C25 6.3 19.6 1 13 1z"
        fill="${token('--color-surface-3')}" stroke="${token('--color-brand')}" stroke-width="2"/>
      <circle cx="13" cy="12.5" r="4.5" fill="${token('--color-brand')}"/>
    </svg>`;

  return new L.DivIcon({
    html: svg,
    className: '',
    iconSize: [26, 34],
    iconAnchor: [13, 33],
  });
}

/** The modal opens with an entry animation, so Leaflet must re-measure its container once it settles. */
function InvalidateOnMount() {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);

    return () => clearTimeout(t);
  }, [map]);

  return null;
}

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: e => onPlace(e.latlng.lat, e.latlng.lng),
  });

  return null;
}

function CoordinatePickerModal({
  initialLatitude,
  initialLongitude,
  title,
  onConfirm,
}: {
  initialLatitude: number | null;
  initialLongitude: number | null;
  title: string;
  onConfirm: (latitude: number, longitude: number) => void;
}) {
  const { closeModal } = useModal();
  const { isLight } = useTheme();
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = `https://api.maptiler.com/maps/dataviz-${isLight ? 'light' : 'dark'}/{z}/{x}/{y}.png?key=${mapTilerKey}`;

  const [pin, setPin] = useState<[number, number] | null>(
    initialLatitude !== null && initialLongitude !== null
      ? [initialLatitude, initialLongitude]
      : null
  );

  const center: [number, number] = pin ?? FALLBACK_CENTER;

  return (
    <div className="glass-strong  w-[640px] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">{title}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Click the map to drop a pin, drag the pin to fine-tune it.
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="h-[min(380px,45vh)] w-full">
        <MapContainer
          center={center}
          zoom={pin ? 15 : 11}
          style={{ height: '100%', width: '100%' }}
        >
          <InvalidateOnMount />
          <TileLayer
            url={tileUrl}
            tileSize={512}
            zoomOffset={-1}
            attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; OSM'
          />
          <ClickToPlace onPlace={(lat, lng) => setPin([round(lat), round(lng)])} />
          {pin && (
            <Marker
              position={pin}
              icon={pinIcon()}
              draggable
              eventHandlers={{
                dragend: e => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  setPin([round(lat), round(lng)]);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line">
        <div className="text-[11px] font-mono text-ink-2">
          {pin ? `${pin[0].toFixed(6)}, ${pin[1].toFixed(6)}` : 'No location chosen yet'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={closeModal}
            className="text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!pin) return;
              onConfirm(pin[0], pin[1]);
              closeModal();
            }}
            disabled={!pin}
            className="text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Pick on map" button that sits next to a latitude/longitude pair. Opens a map, the operator
 * drops/drags a pin, and the chosen coordinates are handed back through `onPick`. Typing the
 * numbers by hand still works; if they already hold valid numbers the map opens on them.
 */
export default function PickOnMapButton({
  latitude,
  longitude,
  onPick,
  title = 'Pick a location',
  className = '',
}: {
  latitude?: string | number | null;
  longitude?: string | number | null;
  onPick: (latitude: number, longitude: number) => void;
  title?: string;
  className?: string;
}) {
  const { openModal } = useModal();

  return (
    <button
      type="button"
      onClick={() =>
        openModal(
          <CoordinatePickerModal
            initialLatitude={parseCoord(latitude)}
            initialLongitude={parseCoord(longitude)}
            title={title}
            onConfirm={onPick}
          />
        )
      }
      className={`flex items-center justify-center gap-1.5 text-xs text-accent-cyan border border-line rounded-md px-2.5 py-1.5 hover:bg-surface-2 ${className}`}
    >
      <MapPin size={12} /> Pick on map
    </button>
  );
}
