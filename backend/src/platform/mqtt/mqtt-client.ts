import mqtt, { type MqttClient } from 'mqtt';
import type { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';
import { publishMqttConnectionState } from './connection-state.js';

/**
 * MQTT.js client factory (ARCHITECTURE.md §2 platform/mqtt). Topic
 * subscription/registry is module 2.4's concern (ingestion) — this is
 * connection bootstrap only, consumed by main.mqtt.ts.
 *
 * MQTT_URL is optional in dev (not every walking-skeleton run needs a
 * live broker); returns null rather than throwing so main.mqtt.ts can
 * log and continue without one.
 */
export function createMqttClient(): MqttClient | null {
  if (!config.MQTT_URL) {
    logger.warn('MQTT_URL not configured — MQTT client not started');
    return null;
  }

  const client = mqtt.connect(config.MQTT_URL, {
    ...(config.MQTT_USERNAME !== undefined ? { username: config.MQTT_USERNAME } : {}),
    ...(config.MQTT_PASSWORD !== undefined ? { password: config.MQTT_PASSWORD } : {}),
  });

  client.on('connect', () => {
    logger.info('MQTT connected');
  });
  client.on('error', err => {
    logger.error({ err }, 'MQTT client error');
  });
  client.on('close', () => {
    logger.debug('MQTT connection closed');
  });

  return client;
}

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * D-0104: publishes the client's live connection state to Redis so
 * `/connectors/health` (served by the separate `main.http.ts` process)
 * can report it — see `connection-state.ts`'s doc comment for why this
 * exists. Call once, right after `createMqttClient()` returns a non-null
 * client.
 */
export function trackMqttConnectionState(client: MqttClient, redis: Redis): void {
  let reconnectsTotal = 0;
  let errorsTotal = 0;

  const publish = (connected: boolean): void => {
    publishMqttConnectionState(redis, { connected, reconnectsTotal, errorsTotal }).catch(
      (err: unknown) => {
        logger.error({ err }, 'Failed to publish MQTT connection state');
      }
    );
  };

  client.on('connect', () => {
    publish(true);
  });
  client.on('reconnect', () => {
    reconnectsTotal += 1;
    publish(false);
  });
  client.on('close', () => {
    publish(false);
  });
  client.on('error', () => {
    errorsTotal += 1;
    publish(false);
  });

  // Heartbeat: a quiet-but-connected client fires none of the events
  // above, so its Redis TTL would otherwise lapse and misreport as down.
  setInterval(() => {
    publish(client.connected);
  }, HEARTBEAT_INTERVAL_MS).unref();
}
