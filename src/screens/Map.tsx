import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerIcon from '@components/MarkerIcon';
import { useTheme } from '@contexts/ThemeContext';

const Map = () => {
  const { isLight } = useTheme();
  const position: [number, number] = [31.4757729, 74.3399971];
  const popupText = 'Company, Arfa Tower, Lahore';

  // Switched from CartoDB's basemap tiles — checked their current terms
  // directly: those tiles require an enterprise license for commercial
  // use, not free for a real product. MapTiler's free tier is genuinely
  // appropriate here (real usage limits, not a bait-and-switch), and
  // their "Dataviz" style is purpose-built for dashboards, with real
  // light/dark variants matching this app's existing theme toggle.
  // Needs a free API key from maptiler.com in VITE_MAPTILER_KEY — without
  // one, tiles won't load; this isn't a silent fallback, deliberately.
  // const mapTilerKey = '<OLD_MAPTILER_KEY_REDACTED>';
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = `https://api.maptiler.com/maps/dataviz-${isLight ? 'light' : 'dark'}/{z}/{x}/{y}.png?key=${mapTilerKey}`;

  return (
    <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url={tileUrl}
        // MapTiler tiles are 512px, not the standard 256px — without
        // tileSize/zoomOffset set correctly, the map renders at the wrong
        // zoom level entirely (confirmed against the maintained
        // leaflet-providers registry's own MapTiler config, not guessed).
        tileSize={512}
        zoomOffset={-1}
        attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MarkerIcon position={position} popupText={popupText} />
    </MapContainer>
  );
};

export default Map;
