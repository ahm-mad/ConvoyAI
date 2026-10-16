import './platform/network/tuning.js';
import { buildContainer } from './container.js';
import { createMqttClient, trackMqttConnectionState } from './platform/mqtt/mqtt-client.js';
import { config } from './platform/config/index.js';
import {
  decodeJsonMessage,
  resolveDeviceIdentifier,
  toSubscribeWildcard,
} from './platform/mqtt/topics.js';
import { disconnectPrisma } from './platform/db/prisma.js';
import { registerShutdown } from './platform/lifecycle/shutdown.js';
import { logger } from './platform/logging/logger.js';

/**
 * MQTT.js consumer process (ARCHITECTURE.md §1, module 2.4). D-0050: no
 * per-message authentication, matching Laravel exactly (`ingestion.md`
 * §3.1) — the broker connection itself (username/password/TLS via
 * `MQTT_URL`) is the trust boundary. Two subscriptions, mirroring
 * `MqttService::subscribeToDeviceData()`/`subscribeToDeviceStatus()`.
 */
const container = buildContainer();
const { redis, ingestionService } = container.cradle;

const client = createMqttClient();

if (client) {
  trackMqttConnectionState(client, redis);

  const dataTopic = toSubscribeWildcard(config.MQTT_TOPIC_DEVICE_DATA);
  const statusTopic = toSubscribeWildcard(config.MQTT_TOPIC_DEVICE_STATUS);

  client.on('connect', () => {
    client.subscribe([dataTopic, statusTopic], { qos: config.MQTT_QOS as 0 | 1 | 2 }, err => {
      if (err) logger.error({ err }, 'MQTT subscribe failed');
      else logger.info({ dataTopic, statusTopic }, 'MQTT subscriptions active');
    });
  });

  client.on('message', (topic, messageBuffer) => {
    const payload = decodeJsonMessage(messageBuffer.toString('utf8'));
    if (!payload) {
      logger.warn({ topic }, 'MQTT message: invalid JSON, dropped');
      return;
    }

    const isStatusTopic = matchesWildcard(topic, statusTopic);
    const pattern = isStatusTopic ? config.MQTT_TOPIC_DEVICE_STATUS : config.MQTT_TOPIC_DEVICE_DATA;
    const deviceUniqueIdentifier = resolveDeviceIdentifier(topic, payload, pattern);

    if (!deviceUniqueIdentifier) {
      logger.warn({ topic }, 'MQTT message: could not resolve a device identifier, dropped');
      return;
    }

    const handled = isStatusTopic
      ? handleStatusMessage(deviceUniqueIdentifier, payload)
      : handleDataMessage(deviceUniqueIdentifier, payload);

    handled.catch((err: unknown) => {
      logger.error({ err, topic, deviceUniqueIdentifier }, 'Error processing MQTT message');
    });
  });
} else {
  logger.warn('MQTT process started with no broker connection (MQTT_URL not configured)');
}

function matchesWildcard(topic: string, wildcardPattern: string): boolean {
  const regex = new RegExp(`^${wildcardPattern.split('+').map(escapeRegExp).join('[^/]+')}$`);
  return regex.test(topic);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function handleDataMessage(
  deviceUniqueIdentifier: string,
  payload: Record<string, unknown>
): Promise<void> {
  await ingestionService.ingestMqttPacket(deviceUniqueIdentifier, payload);
}

async function handleStatusMessage(
  deviceUniqueIdentifier: string,
  payload: Record<string, unknown>
): Promise<void> {
  const status = payload['status'];
  if (typeof status !== 'string') return;
  await ingestionService.updateDeviceStatusFromMqtt(deviceUniqueIdentifier, status);
}

registerShutdown('mqtt', async () => {
  client?.end();
  await disconnectPrisma();
  redis.disconnect();
});
