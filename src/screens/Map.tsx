import dynamic from 'next/dynamic';
import PinLayer from '@components/map/layers/PinLayer';
import Scenery3D from '@components/map/layers/Scenery3D';
import { useMapPrefs } from '@components/map/useMapPrefs';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

/** Company location map (single pinned point). */
const Map = () => {
  const [prefs] = useMapPrefs();
  const position: [number, number] = [31.4757729, 74.3399971];

  return (
    <div className="p-1 sm:p-4">
      <div className="map-stage">
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
      </div>
    </div>
  );
};

export default Map;
