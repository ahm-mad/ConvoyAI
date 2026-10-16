import { z } from 'zod';

/**
 * Map-viewport filtering (D-0180, B8 of `flows/06-fleet-enterprise-readiness.md`).
 * `bbox=minLng,minLat,maxLng,maxLat` (WGS84 degrees, the order GeoJSON / Leaflet / Mapbox use).
 * A box that crosses the antimeridian (`minLng > maxLng`) is not supported — 422 like any other malformed box.
 * Points (tracker positions) are "in view" when inside the box; circles (yards, geofences) when they overlap it (owner Q2 "(a)").
 */

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export const BBOX_ERROR =
  'The bbox must be four numbers: minLng,minLat,maxLng,maxLat (longitude -180..180, latitude -90..90, min not above max).';

const METERS_PER_DEGREE = 111_320;

export function parseBbox(value: string): Bbox | undefined {
  const parts = value.split(',').map(part => part.trim());
  if (parts.length !== 4 || parts.some(part => part === '')) return undefined;
  const numbers = parts.map(Number);
  if (numbers.some(n => !Number.isFinite(n))) return undefined;
  const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return undefined;
  if (minLng > maxLng || minLat > maxLat) return undefined;
  return { minLng, minLat, maxLng, maxLat };
}

/** Query-string schema for `bbox`: absent/blank → `undefined`; malformed → the fixed 422 message. */
export const BboxSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === '') return undefined;
    const box = parseBbox(value);
    if (!box) {
      ctx.addIssue({ code: 'custom', message: BBOX_ERROR });
      return z.NEVER;
    }
    return box;
  });

export function pointInBbox(latitude: number, longitude: number, box: Bbox): boolean {
  return (
    latitude >= box.minLat &&
    latitude <= box.maxLat &&
    longitude >= box.minLng &&
    longitude <= box.maxLng
  );
}

/** Does the circle (centre + radius in metres) touch the box? Flat-earth approximation — plenty for a map viewport. */
export function circleOverlapsBbox(
  latitude: number,
  longitude: number,
  radiusM: number,
  box: Bbox
): boolean {
  const nearestLat = Math.min(Math.max(latitude, box.minLat), box.maxLat);
  const nearestLng = Math.min(Math.max(longitude, box.minLng), box.maxLng);
  const dy = (latitude - nearestLat) * METERS_PER_DEGREE;
  const dx = (longitude - nearestLng) * METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  return dx * dx + dy * dy <= radiusM * radiusM;
}

/**
 * The box grown by `meters` on every side — a conservative database pre-filter for centres whose circle *might* overlap
 * `box` (`circleOverlapsBbox` then decides exactly). Longitude is widened by the worst-case latitude, and stays inside ±180.
 */
export function expandBbox(box: Bbox, meters: number): Bbox {
  const dLat = meters / METERS_PER_DEGREE;
  const worstLat = Math.min(89.9, Math.max(Math.abs(box.minLat), Math.abs(box.maxLat)) + dLat);
  const dLng = meters / (METERS_PER_DEGREE * Math.cos((worstLat * Math.PI) / 180));
  return {
    minLat: Math.max(-90, box.minLat - dLat),
    maxLat: Math.min(90, box.maxLat + dLat),
    minLng: Math.max(-180, box.minLng - dLng),
    maxLng: Math.min(180, box.maxLng + dLng),
  };
}

/** Optional cap on how many positions the map asks for (owner Q1 "(a)"). */
export const MAP_LIMIT_MAX = 5000;
