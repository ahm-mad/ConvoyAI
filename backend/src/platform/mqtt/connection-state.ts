import type { Redis } from 'ioredis';

/**
 * D-0104: `GET /connectors/health`'s MQTT adapter needs the broker
 * connection's live state, but `main.mqtt.ts` (where the MQTT.js client
 * actually lives) and `main.http.ts` (where the health endpoint is
 * served) are separate processes — the same cross-process constraint
 * D-0067 solved for realtime events, via Redis rather than in-memory
 * state. `main.mqtt.ts` publishes on every `connect`/`reconnect`/`close`/
 * `error` event plus a periodic heartbeat (so a quiet-but-healthy
 * connection's TTL doesn't lapse); `main.http.ts` reads it on request.
 *
 * A short TTL is deliberate: if the MQTT process crashes outright (no
 * `close` event fires), the last-written state expires rather than
 * reporting a stale "connected" forever — the same graceful-degradation
 * posture as every other optional integration in this app (R2, Groq,
 * Twilio, mail).
 */
const KEY = 'mqtt:connection-state';
const TTL_SECONDS = 120;

export interface MqttConnectionState {
  connected: boolean;
  reconnectsTotal: number;
  errorsTotal: number;
}

export async function publishMqttConnectionState(
  redis: Redis,
  state: MqttConnectionState
): Promise<void> {
  await redis.set(KEY, JSON.stringify(state), 'EX', TTL_SECONDS);
}

/** `undefined` when the MQTT process has never published (not configured, never started) or its last heartbeat is stale — both cases the caller should treat as "unknown/stopped", not "connected". */
export async function readMqttConnectionState(
  redis: Redis
): Promise<MqttConnectionState | undefined> {
  const raw = await redis.get(KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as MqttConnectionState;
  } catch {
    return undefined;
  }
}
