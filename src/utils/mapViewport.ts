/**
 * Map viewport helpers for backend B8 (flows/06 §29): `bbox=minLng,minLat,maxLng,maxLat` — degrees,
 * GeoJSON / Leaflet order (west, south, east, north). The backend answers 422 for a malformed, out-of-range
 * or reversed box and does not support one that crosses the antimeridian, so a Leaflet view (which can
 * show wrapped copies of the world) is clamped to -180..180 / -90..90 before it is sent.
 */
export type Bbox = [number, number, number, number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10000) / 10000; // ~11 m: stable query keys while panning slightly

export const boundsToBbox = (b: {
  getWest: () => number;
  getSouth: () => number;
  getEast: () => number;
  getNorth: () => number;
}): Bbox => [
  round(clamp(b.getWest(), -180, 180)),
  round(clamp(b.getSouth(), -90, 90)),
  round(clamp(b.getEast(), -180, 180)),
  round(clamp(b.getNorth(), -90, 90)),
];

export const bboxToParam = (b: Bbox) => b.join(',');

/** Parse a `bbox` request parameter back into numbers (`null` for anything that is not four numbers). */
export const parseBbox = (value: unknown): Bbox | null => {
  if (typeof value !== 'string') return null;

  const parts = value.split(',').map(Number);

  return parts.length === 4 && parts.every(Number.isFinite) ? (parts as Bbox) : null;
};

export const pointInBbox = (lat: number, lng: number, b: Bbox) =>
  lng >= b[0] && lat >= b[1] && lng <= b[2] && lat <= b[3];
