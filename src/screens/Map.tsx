import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import PinLayer from '@components/map/layers/PinLayer';
import Scenery3D from '@components/map/layers/Scenery3D';
import MapToolbar from '@components/map/MapToolbar';
import { useMapPrefs } from '@components/map/useMapPrefs';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/** Company location map (single pinned point). */
const Map = () => {
  const [prefs, setPrefs] = useMapPrefs();
  const position: [number, number] = [31.4757729, 74.3399971];

  return (
    <div className="p-1 sm:p-4">
      <div className="map-stage relative">
        <ConvoyMap
          look={prefs.look}
          mode={prefs.mode}
          center={position}
          zoom={15}
          ariaLabel="Company location: Arfa Tower, Lahore"
        >
          <Scenery3D />
          <PinLayer pin={position} onChange={() => {}} readOnly />
        </ConvoyMap>
        <MapToolbar
          prefs={prefs}
          onChange={setPrefs}
          showIconStyle={false}
          className="absolute right-4 top-4 z-10"
        />
        <div className="glass-strong absolute bottom-4 left-4 z-10 flex items-center gap-2.5 px-4 py-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-brand-wash text-brand-text">
            <MapPin size={16} aria-hidden />
          </span>
          <div>
            <div className="eyebrow">Company location</div>
            <div className="text-sm font-semibold text-ink-0">Arfa Tower, Lahore</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Map;
