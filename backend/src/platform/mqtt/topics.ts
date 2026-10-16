/**
 * Ported from `MqttTopicHelper.php` (module 2.4, `ingestion.md` §3.1) —
 * pure topic-pattern logic, no MQTT.js/broker dependency, so both
 * `main.mqtt.ts` (subscribe) and `command-publisher.ts` (publish) share
 * one implementation. Byte-for-byte behavior match, including the
 * payload-first / topic-fallback / last-segment resolution order.
 */
export const DEVICE_PLACEHOLDER = '{device_id}';

export function buildTopic(pattern: string, deviceId: string): string {
  return pattern.split(DEVICE_PLACEHOLDER).join(deviceId);
}

/** e.g. `convoyai/devices/{device_id}/data` -> `convoyai/devices/+/data`, for MQTT subscribe wildcards. */
export function toSubscribeWildcard(pattern: string): string {
  if (!pattern.includes(DEVICE_PLACEHOLDER)) return pattern;
  return pattern.split(DEVICE_PLACEHOLDER).join('+');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractDeviceIdFromTopic(topic: string, pattern: string): string | undefined {
  const trimmedPattern = pattern.trim();
  const trimmedTopic = topic.trim();
  if (trimmedPattern === '' || trimmedTopic === '') return undefined;

  if (trimmedPattern.includes(DEVICE_PLACEHOLDER)) {
    const [before, after = ''] = trimmedPattern.split(DEVICE_PLACEHOLDER);
    const regex = new RegExp(
      `^${escapeRegExp(before ?? '')}(?<deviceId>[^/]+)${escapeRegExp(after)}$`
    );
    const match = regex.exec(trimmedTopic);
    if (match?.groups?.['deviceId']) return match.groups['deviceId'];
  }

  if (trimmedPattern === trimmedTopic) {
    const segments = trimmedTopic.split('/');
    return segments.at(-1) || undefined;
  }

  return undefined;
}

function dotGet(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value !== null && typeof value === 'object' && key in (value as Record<string, unknown>)) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

/** Payload-first (deviceInfo.devEui/devEUI, devEUI, devEui, device_unique_identifier), then topic pattern, then the topic's last non-wildcard segment. */
export function resolveDeviceIdentifier(
  topic: string,
  payload: Record<string, unknown> | undefined,
  pattern: string
): string | undefined {
  if (payload !== undefined) {
    const fromPayload =
      dotGet(payload, 'deviceInfo.devEui') ??
      dotGet(payload, 'deviceInfo.devEUI') ??
      dotGet(payload, 'devEUI') ??
      dotGet(payload, 'devEui') ??
      dotGet(payload, 'device_unique_identifier');

    if (typeof fromPayload === 'string' && fromPayload !== '') return fromPayload;
    if (typeof fromPayload === 'number') return String(fromPayload);
  }

  const fromTopic = extractDeviceIdFromTopic(topic, pattern);
  if (fromTopic) return fromTopic;

  const segments = topic.split('/').filter(part => part !== '');
  if (segments.length === 0) return undefined;

  const lastSegment = segments[segments.length - 1];
  if (lastSegment !== undefined && lastSegment !== '+' && lastSegment !== '#') return lastSegment;

  return undefined;
}

export function decodeJsonMessage(message: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
