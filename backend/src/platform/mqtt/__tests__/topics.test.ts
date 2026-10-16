import { describe, expect, it } from 'vitest';
import {
  buildTopic,
  decodeJsonMessage,
  extractDeviceIdFromTopic,
  resolveDeviceIdentifier,
  toSubscribeWildcard,
} from '../topics.js';

describe('MQTT topic helpers (ported from MqttTopicHelper.php)', () => {
  it('buildTopic replaces the device placeholder', () => {
    expect(buildTopic('convoyai/devices/{device_id}/commands', 'abc-123')).toBe(
      'convoyai/devices/abc-123/commands'
    );
  });

  it('toSubscribeWildcard replaces the placeholder with a single-level wildcard', () => {
    expect(toSubscribeWildcard('convoyai/devices/{device_id}/data')).toBe('convoyai/devices/+/data');
  });

  it('toSubscribeWildcard leaves a pattern with no placeholder untouched', () => {
    expect(toSubscribeWildcard('convoyai/server/status')).toBe('convoyai/server/status');
  });

  it('extractDeviceIdFromTopic matches the placeholder position', () => {
    expect(
      extractDeviceIdFromTopic('convoyai/devices/abc-123/data', 'convoyai/devices/{device_id}/data')
    ).toBe('abc-123');
  });

  it("extractDeviceIdFromTopic returns undefined when the topic doesn't match the pattern shape", () => {
    expect(
      extractDeviceIdFromTopic('something/else', 'convoyai/devices/{device_id}/data')
    ).toBeUndefined();
  });

  it('extractDeviceIdFromTopic falls back to the last segment when pattern equals topic exactly', () => {
    expect(extractDeviceIdFromTopic('a/b/c', 'a/b/c')).toBe('c');
  });

  it('resolveDeviceIdentifier prefers deviceInfo.devEui from the payload over the topic', () => {
    const id = resolveDeviceIdentifier(
      'convoyai/devices/topic-id/data',
      { deviceInfo: { devEui: 'payload-id' } },
      'convoyai/devices/{device_id}/data'
    );
    expect(id).toBe('payload-id');
  });

  it('resolveDeviceIdentifier tries devEUI, devEui, then device_unique_identifier in order', () => {
    expect(resolveDeviceIdentifier('t', { devEUI: 'a' }, 'p')).toBe('a');
    expect(resolveDeviceIdentifier('t', { devEui: 'b' }, 'p')).toBe('b');
    expect(resolveDeviceIdentifier('t', { device_unique_identifier: 'c' }, 'p')).toBe('c');
  });

  it('resolveDeviceIdentifier falls back to the topic pattern when the payload has no identifier', () => {
    const id = resolveDeviceIdentifier(
      'convoyai/devices/abc-123/data',
      {},
      'convoyai/devices/{device_id}/data'
    );
    expect(id).toBe('abc-123');
  });

  it("resolveDeviceIdentifier falls back to the topic's last segment as a last resort", () => {
    expect(resolveDeviceIdentifier('some/random/topic', undefined, 'no-match-pattern')).toBe(
      'topic'
    );
  });

  it('resolveDeviceIdentifier returns undefined for a wildcard-only topic with nothing else to go on', () => {
    expect(resolveDeviceIdentifier('convoyai/devices/+', undefined, 'no-match')).toBeUndefined();
  });

  it('decodeJsonMessage parses a JSON object', () => {
    expect(decodeJsonMessage('{"a": 1}')).toEqual({ a: 1 });
  });

  it('decodeJsonMessage rejects non-object JSON (arrays, primitives) and invalid JSON', () => {
    expect(decodeJsonMessage('[1,2,3]')).toBeUndefined();
    expect(decodeJsonMessage('42')).toBeUndefined();
    expect(decodeJsonMessage('not json')).toBeUndefined();
  });
});
