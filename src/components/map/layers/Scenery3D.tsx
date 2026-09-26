'use client';

import { useEffect } from 'react';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';

/**
 * 3D scenery: MapTiler terrain (DEM) + soft hillshade + a sky/fog gradient horizon. Active only in 3D mode on the
 * light/night looks (satellite has its own relief); flat mode removes everything again.
 */
export default function Scenery3D() {
  const { map, mode, look, styleVersion } = useConvoyMap();

  useEffect(() => {
    if (!map) return;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
    const on = mode === '3d';
    const t = (n: string) => token(`--map-${look === 'night' ? 'night' : 'light'}-${n}`);

    try {
      if (on) {
        if (!map.getSource('cv-dem')) {
          map.addSource('cv-dem', {
            type: 'raster-dem',
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
            tileSize: 256,
          });
        }
        if (look !== 'satellite' && !map.getLayer('cv-hillshade')) {
          map.addLayer(
            {
              id: 'cv-hillshade',
              type: 'hillshade',
              source: 'cv-dem',
              paint: {
                'hillshade-shadow-color': t('hillshade'),
                'hillshade-highlight-color': t('hillshade-highlight'),
                'hillshade-accent-color': t('hillshade'),
                'hillshade-exaggeration': look === 'night' ? 0.35 : 0.28,
              },
            },
            map.getLayer('Water') ? 'Water' : undefined
          );
        }
        map.setTerrain({ source: 'cv-dem', exaggeration: 1.25 });
        map.setSky({
          'sky-color': t('sky'),
          'horizon-color': t('horizon'),
          'fog-color': t('fog'),
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.5,
          'fog-ground-blend': 0.06,
        });
      } else {
        map.setTerrain(null);
        map.setSky({ 'sky-color': t('fog'), 'horizon-color': t('fog'), 'fog-color': t('fog') });
        if (map.getLayer('cv-hillshade')) map.removeLayer('cv-hillshade');
      }
    } catch {
      /* style still swapping — the next styleVersion re-runs this */
    }
  }, [map, mode, look, styleVersion]);

  return null;
}
