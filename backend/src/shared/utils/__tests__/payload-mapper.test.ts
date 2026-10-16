import { describe, expect, it } from 'vitest';
import { mapPayload } from '../payload-mapper.js';

describe("mapPayload (ported from Laravel's PayloadMapper)", () => {
  it('dot-flattens nested objects and arrays', () => {
    const result = mapPayload({ a: { b: { c: 1 } }, list: [10, 20] }, []);

    expect(result.flattened).toEqual({ 'a.b.c': 1, 'list.0': 10, 'list.1': 20 });
  });

  it('treats empty objects/arrays as leaves, not recursing into them', () => {
    const result = mapPayload({ empty_obj: {}, empty_arr: [] }, []);

    expect(result.flattened).toEqual({ empty_obj: {}, empty_arr: [] });
  });

  it('pre-decodes a top-level JSON-string field, one level only', () => {
    const result = mapPayload({ deviceInfo: '{"lat": 1.5, "lon": 2.5}' }, []);

    expect(result.flattened).toEqual({ 'deviceInfo.lat': 1.5, 'deviceInfo.lon': 2.5 });
  });

  it('does not decode a JSON-string nested two levels deep (documented boundary)', () => {
    const result = mapPayload({ outer: { inner: '{"x": 1}' } }, []);

    expect(result.flattened).toEqual({ 'outer.inner': '{"x": 1}' });
  });

  it('leaves a non-JSON top-level string untouched', () => {
    const result = mapPayload({ name: 'not json' }, []);

    expect(result.flattened).toEqual({ name: 'not json' });
  });

  it('leaves malformed top-level JSON-looking strings untouched (parse failure falls back to the raw string)', () => {
    const result = mapPayload({ bad: '{not valid json' }, []);

    expect(result.flattened).toEqual({ bad: '{not valid json' });
  });

  it('cleaned/matchedKeys only include flattened keys present in attributeKeys; availableKeys lists every flattened key', () => {
    const result = mapPayload({ a: { b: 1 }, c: 2, d: 3 }, ['a.b', 'd']);

    expect(result.cleaned).toEqual({ 'a.b': 1, d: 3 });
    expect(result.matchedKeys.sort()).toEqual(['a.b', 'd']);
    expect(result.availableKeys.sort()).toEqual(['a.b', 'c', 'd']);
  });

  it('rule-evaluation-relevant: flattened includes keys never configured as an attribute preference', () => {
    const result = mapPayload({ temperature: 21, humidity: 55 }, ['temperature']);

    expect(result.flattened).toHaveProperty('humidity', 55);
    expect(result.cleaned).not.toHaveProperty('humidity');
  });
});
