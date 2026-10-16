import { describe, expect, it } from 'vitest';
import {
  BBOX_ERROR,
  BboxSchema,
  circleOverlapsBbox,
  expandBbox,
  parseBbox,
  pointInBbox,
} from '../bbox.js';

const LAHORE = { minLng: 74.2, minLat: 31.4, maxLng: 74.5, maxLat: 31.6 };

describe('parseBbox', () => {
  it('reads minLng,minLat,maxLng,maxLat', () => {
    expect(parseBbox('74.2,31.4,74.5,31.6')).toEqual(LAHORE);
    expect(parseBbox(' -10 , -5 ,10, 5 ')).toEqual({
      minLng: -10,
      minLat: -5,
      maxLng: 10,
      maxLat: 5,
    });
  });

  it.each([
    ['wrong count', '1,2,3'],
    ['five values', '1,2,3,4,5'],
    ['empty part', '1,2,,4'],
    ['not a number', 'a,2,3,4'],
    ['longitude out of range', '-181,0,10,10'],
    ['latitude out of range', '0,-91,10,10'],
    ['min above max (also an antimeridian-crossing box)', '170,0,-170,10'],
    ['min latitude above max', '0,10,10,0'],
    ['infinity', '0,0,Infinity,10'],
  ])('rejects %s', (_label, value) => {
    expect(parseBbox(value)).toBeUndefined();
  });
});

describe('BboxSchema', () => {
  it('passes absent / blank through as undefined and parses a valid box', () => {
    expect(BboxSchema.parse(undefined)).toBeUndefined();
    expect(BboxSchema.parse('  ')).toBeUndefined();
    expect(BboxSchema.parse('74.2,31.4,74.5,31.6')).toEqual(LAHORE);
  });

  it('fails a malformed box with the fixed message', () => {
    const result = BboxSchema.safeParse('nope');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(BBOX_ERROR);
  });
});

describe('pointInBbox', () => {
  it('is inclusive on the edges', () => {
    expect(pointInBbox(31.5, 74.3, LAHORE)).toBe(true);
    expect(pointInBbox(31.4, 74.2, LAHORE)).toBe(true);
    expect(pointInBbox(31.6, 74.5, LAHORE)).toBe(true);
    expect(pointInBbox(31.7, 74.3, LAHORE)).toBe(false);
    expect(pointInBbox(31.5, 74.6, LAHORE)).toBe(false);
  });
});

describe('circleOverlapsBbox', () => {
  it('a centre inside always overlaps, even with radius 0', () => {
    expect(circleOverlapsBbox(31.5, 74.3, 0, LAHORE)).toBe(true);
  });

  it('a big circle whose centre is outside overlaps when it reaches the box', () => {
    // ~2.2 km north of the top edge (31.6 → 31.62)
    expect(circleOverlapsBbox(31.62, 74.3, 3000, LAHORE)).toBe(true);
    expect(circleOverlapsBbox(31.62, 74.3, 1000, LAHORE)).toBe(false);
  });

  it('measures the corner distance, not just each axis', () => {
    // ~1.5 km east and ~1.5 km north of the top-right corner → ~2.1 km away
    const lat = 31.6 + 1500 / 111_320;
    const lng = 74.5 + 1500 / (111_320 * Math.cos((lat * Math.PI) / 180));
    expect(circleOverlapsBbox(lat, lng, 2000, LAHORE)).toBe(false);
    expect(circleOverlapsBbox(lat, lng, 2300, LAHORE)).toBe(true);
  });
});

describe('expandBbox', () => {
  it('grows on every side, stays within the world, and covers every circle circleOverlapsBbox accepts', () => {
    const grown = expandBbox(LAHORE, 5000);
    expect(grown.minLat).toBeLessThan(LAHORE.minLat);
    expect(grown.maxLng).toBeGreaterThan(LAHORE.maxLng);
    expect(expandBbox({ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 }, 100_000)).toEqual({
      minLng: -180,
      minLat: -90,
      maxLng: 180,
      maxLat: 90,
    });
    // a centre that just overlaps must be inside the grown box
    const lat = 31.6 + 4900 / 111_320;
    expect(circleOverlapsBbox(lat, 74.3, 5000, LAHORE)).toBe(true);
    expect(pointInBbox(lat, 74.3, grown)).toBe(true);
  });

  it('does not blow up near the poles', () => {
    const grown = expandBbox({ minLng: 0, minLat: 89, maxLng: 10, maxLat: 90 }, 50_000);
    expect(Number.isFinite(grown.minLng)).toBe(true);
    expect(grown.maxLng).toBeLessThanOrEqual(180);
  });
});
