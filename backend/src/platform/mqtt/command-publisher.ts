import { createMqttClient } from './mqtt-client.js';
import { buildTopic } from './topics.js';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Publishes a device command over MQTT (D-0052 → D-0056: real
 * implementation now that module 2.4 has defined the topic registry —
 * `platform/mqtt/topics.ts`/`MQTT_TOPIC_DEVICE_COMMANDS`). Matches
 * Laravel's platform fallback (`MqttService::publishCommand()`) — a single
 * shared broker connection, `source: "platform"` always. Laravel's
 * per-company persistent-connection path (`MqttConnectionManager`,
 * `MqttConfiguration`) is not ported — that depends on per-company MQTT
 * broker configuration, which is 08-ingestion's `MqttConfigurationController`
 * equivalent (out of this module's scope per `tasks/07-devices.md`'s own
 * scope split); every command published by the new app today is
 * `source: "platform"`, never `"customer"`.
 */
export interface CommandPublishResult {
  success: boolean;
  source: 'platform' | 'customer';
}

let sharedClient: ReturnType<typeof createMqttClient> | undefined;

function getClient(): ReturnType<typeof createMqttClient> {
  sharedClient ??= createMqttClient();
  return sharedClient;
}

export async function publishDeviceCommand(
  deviceUniqueIdentifier: string,
  command: { command: string; parameters: Record<string, unknown> }
): Promise<CommandPublishResult> {
  const client = getClient();
  if (!client) {
    logger.warn({ deviceUniqueIdentifier }, 'Command publish failed — MQTT_URL not configured');
    return { success: false, source: 'platform' };
  }

  const topic = buildTopic(config.MQTT_TOPIC_DEVICE_COMMANDS, deviceUniqueIdentifier);
  const message = JSON.stringify(command);

  return new Promise(resolve => {
    client.publish(topic, message, { qos: config.MQTT_QOS as 0 | 1 | 2 }, err => {
      if (err) {
        logger.error({ err, deviceUniqueIdentifier, topic }, 'Failed to publish device command');
        resolve({ success: false, source: 'platform' });
        return;
      }
      logger.info({ deviceUniqueIdentifier, topic, command }, 'Command published to device');
      resolve({ success: true, source: 'platform' });
    });
  });
}
