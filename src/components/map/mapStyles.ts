/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StyleSpecification } from 'maplibre-gl';
import { token } from '@lib/design/tokens';

/**
 * Map looks. One MapTiler vector style (streets-v2) is fetched and RE-PAINTED at load from the `--map-*` design
 * tokens (tokens.css), so the basemap always matches the theme. `satellite` uses MapTiler's hybrid style untouched.
 */
export type MapLook = 'light' | 'night' | 'satellite';

const STYLE_ID: Record<MapLook, string> = {
  light: 'streets-v2',
  night: 'streets-v2',
  satellite: 'hybrid',
};

const cache = new Map<string, any>();

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function fetchBase(id: string, key: string): Promise<any> {
  if (!cache.has(id)) {
    const res = await fetch(`https://api.maptiler.com/maps/${id}/style.json?key=${key}`);

    if (!res.ok) throw new Error(`Map style ${id} failed (${res.status})`);
    cache.set(id, await res.json());
  }

  return clone(cache.get(id));
}

const NAMES = [
  'land',
  'land-alt',
  'green',
  'park',
  'sand',
  'industrial',
  'water',
  'road-minor',
  'road-minor-casing',
  'road-major',
  'road-major-casing',
  'highway',
  'highway-casing',
  'path',
  'rail',
  'building',
  'building-edge',
  'building-3d',
  'boundary',
  'label',
  'label-major',
  'label-water',
  'halo',
  'sky',
  'horizon',
  'fog',
  'hillshade',
] as const;

type Palette = Record<(typeof NAMES)[number], string>;

export const readPalette = (look: 'light' | 'night'): Palette =>
  Object.fromEntries(NAMES.map(n => [n, token(`--map-${look}-${n}`, '#888888')])) as Palette;

const HIDE = new Set([
  'Housenumber',
  'Gondola',
  'Ferry',
  'Oneway',
  'Highway junction',
  'Highway shield',
  'Highway shield (US)',
  'Highway shield interstate top (US)',
  'Highway shield interstate (US)',
  'Public',
  'Sport',
  'Education',
  'Tourism',
  'Culture',
  'Shopping',
  'Food',
  'Transport',
  'Park',
  'Healthcare',
  'Station',
  'Airport gate',
  'Major rail hatching',
  'Minor rail hatching',
  'Railway tunnel hatching',
  'Cablecar',
  'Cablecar dash',
]);

const FILL: Record<string, keyof Palette> = {
  Meadow: 'green',
  Scrub: 'green',
  Crop: 'green',
  Grass: 'green',
  Forest: 'park',
  Wood: 'park',
  Sand: 'sand',
  Residential: 'land-alt',
  Industrial: 'industrial',
  'Airport zone': 'land-alt',
  Pedestrian: 'land-alt',
  Cemetery: 'green',
  Hospital: 'land-alt',
  Stadium: 'land-alt',
  School: 'land-alt',
  Heliport: 'land-alt',
  'Water intermittent': 'water',
  Water: 'water',
  Pier: 'road-minor',
  Bridge: 'road-major',
};

const LINE: Record<string, keyof Palette> = {
  River: 'water',
  'River tunnel': 'water',
  Aqueduct: 'water',
  'Aqueduct outline': 'water',
  Aeroway: 'road-major',
  'Minor road': 'road-minor',
  'Major road': 'road-major',
  Highway: 'highway',
  'Minor road outline': 'road-minor-casing',
  'Major road outline': 'road-major-casing',
  'Highway outline': 'highway-casing',
  'Bridge outline': 'road-major-casing',
  Tunnel: 'road-minor',
  'Tunnel outline': 'road-minor-casing',
  'Road under construction': 'path',
  'Pier road': 'road-minor',
  Path: 'path',
  'Path minor': 'path',
  'Path outline': 'road-minor-casing',
  'Footway tunnel': 'path',
  'Footway tunnel outline': 'road-minor-casing',
  'Major rail': 'rail',
  'Minor rail': 'rail',
  'Railway tunnel': 'rail',
  'Country border': 'boundary',
  'Other border': 'boundary',
  'Disputed border': 'boundary',
  'Ferry line': 'water',
};

const MAJOR_LABELS = new Set([
  'City labels',
  'Capital city labels',
  'Country labels',
  'State labels',
  'Continent labels',
]);

function paint(style: any, look: 'light' | 'night'): any {
  const p = readPalette(look);

  style.layers.forEach((l: any) => {
    l.paint = l.paint ?? {};
    l.layout = l.layout ?? {};

    if (HIDE.has(l.id)) {
      l.layout.visibility = 'none';

      return;
    }
    if (l.type === 'background') l.paint['background-color'] = p.land;
    else if (l.type === 'fill' && FILL[l.id]) {
      l.paint['fill-color'] = p[FILL[l.id]];
      l.paint['fill-opacity'] = 1;
    } else if (l.id === 'Glacier') l.paint['fill-color'] = p['land-alt'];
    else if (l.id === 'Building') {
      l.paint['fill-color'] = p.building;
      l.paint['fill-outline-color'] = p['building-edge'];
      l.paint['fill-opacity'] = 1;
    } else if (l.type === 'fill-extrusion') {
      l.paint['fill-extrusion-color'] = p['building-3d'];
      l.paint['fill-extrusion-opacity'] = look === 'night' ? 0.92 : 0.9;
      l.paint['fill-extrusion-vertical-gradient'] = true;
    } else if (l.type === 'line' && LINE[l.id]) {
      l.paint['line-color'] = p[LINE[l.id]];
      delete l.paint['line-dasharray'];
      if (l.id === 'Country border' || l.id === 'Other border') l.paint['line-dasharray'] = [2, 2];
    } else if (l.type === 'symbol') {
      const major = MAJOR_LABELS.has(l.id);
      const water = /water|ocean|lake|river/i.test(l.id);

      l.paint['text-color'] = water ? p['label-water'] : major ? p['label-major'] : p.label;
      l.paint['text-halo-color'] = p.halo;
      l.paint['text-halo-width'] = major ? 1.6 : 1.2;
      l.paint['text-halo-blur'] = 0.4;
      // Latin names first (the default field shows local Urdu script, which clutters showcase shots).
      if (l.layout['text-field'] !== undefined && !/Housenumber|shield/i.test(l.id)) {
        l.layout['text-field'] = [
          'coalesce',
          ['get', 'name:latin'],
          ['get', 'name:en'],
          ['get', 'name'],
        ];
      }
    }
  });

  return style;
}

/** Style JSON for a look, recoloured from the design tokens. Throws if the style cannot be loaded. */
export async function buildStyle(look: MapLook, key: string): Promise<StyleSpecification> {
  const base = await fetchBase(STYLE_ID[look], key);

  if (look === 'satellite') return base;

  return paint(base, look) as StyleSpecification;
}
