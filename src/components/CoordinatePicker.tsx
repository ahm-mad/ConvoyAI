import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Dialog from '@components/ui/Dialog';
import dynamic from 'next/dynamic';
import { MapPin, X } from 'lucide-react';
import PinLayer from '@components/map/layers/PinLayer';
import { useMapPrefs } from '@components/map/useMapPrefs';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

// Same fallback the Fleet map uses when nothing is known yet.
const FALLBACK_CENTER: [number, number] = [31.4757729, 74.3399971];

const round = (n: number) => Math.round(n * 1e6) / 1e6;

const parseCoord = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);

  return Number.isFinite(n) ? n : null;
};

function CoordinatePickerModal({
  initialLatitude,
  initialLongitude,
  title,
  onConfirm,
  closeModal,
  radiusM,
}: {
  initialLatitude: number | null;
  initialLongitude: number | null;
  title: string;
  onConfirm: (latitude: number, longitude: number) => void;
  closeModal: () => void;
  radiusM?: number | null;
}) {
  const [prefs] = useMapPrefs();

  const [pin, setPin] = useState<[number, number] | null>(
    initialLatitude !== null && initialLongitude !== null
      ? [initialLatitude, initialLongitude]
      : null
  );

  const center: [number, number] = pin ?? FALLBACK_CENTER;

  return (
    <div className="glass-strong flex w-[min(640px,calc(100vw_-_1.5rem))] flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">{title}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Click the map to drop a pin, drag it (or use the arrow keys on the focused pin) to
            fine-tune it.
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="h-[min(380px,45vh)] w-full">
        <ConvoyMap
          look={prefs.look}
          mode="2d"
          center={center}
          zoom={pin ? 15 : 11}
          ariaLabel="Pick a location on the map"
        >
          <PinLayer
            pin={pin}
            onChange={(lat, lng) => setPin([round(lat), round(lng)])}
            radiusM={radiusM}
          />
        </ConvoyMap>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3 border-t border-line">
        <div className="text-[11px] font-mono text-ink-2">
          {pin ? `${pin[0].toFixed(6)}, ${pin[1].toFixed(6)}` : 'No location chosen yet'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={closeModal}
            className="whitespace-nowrap text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full px-3 py-1.5"
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
            className="whitespace-nowrap text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
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
  radiusM,
}: {
  latitude?: string | number | null;
  longitude?: string | number | null;
  onPick: (latitude: number, longitude: number) => void;
  title?: string;
  className?: string;
  /** Optional radius (m) drawn around the pin. */
  radiusM?: number | null;
}) {
  const [open, setOpen] = useState(false);

  // The picker is a local dialog (not the global modal slot) so that opening it from inside an edit
  // form does not unmount that form and lose what was typed. Escape closes only the picker.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };

    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn-soft inline-flex items-center justify-center gap-1.5 !px-4 !py-2 !text-brand-text ${className}`}
      >
        <MapPin size={12} /> Pick on map
      </button>
      {open &&
        createPortal(
          <Dialog open onClose={() => setOpen(false)}>
            <CoordinatePickerModal
              initialLatitude={parseCoord(latitude)}
              initialLongitude={parseCoord(longitude)}
              title={title}
              onConfirm={onPick}
              closeModal={() => setOpen(false)}
              radiusM={radiusM}
            />
          </Dialog>,
          document.body
        )}
    </>
  );
}
