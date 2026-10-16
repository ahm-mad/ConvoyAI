import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import { randomUUID } from 'node:crypto';

/**
 * One-shot MQTT connection test for module 6.5's `POST /mqtt-configurations/
 * {id}/test` (D-0117) — ports Laravel's `MqttConfiguration::testConnection()`
 * (`php-mqtt/client`) exactly: connect to the configured broker with a 10s
 * timeout, publish a throwaway message to `test/connection/<clientId>` on
 * success, then disconnect. A real connection attempt, not a stub — same
 * "port the real thing" precedent as D-0104's connectivity module. This is
 * a standalone, short-lived client, never the app's own persistent MQTT
 * connection (`platform/mqtt/mqtt-client.ts`).
 */
export interface MqttTestConnectionParams {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  useTls: boolean;
  clientIdPrefix: string | null;
}

export interface MqttTestConnectionResult {
  success: boolean;
  message: string;
}

const TEST_CONNECT_TIMEOUT_MS = 10_000;

/** `connectFn` is injectable for tests (default: the real `mqtt.connect`) — avoids opening a real socket in unit tests. */
export function testMqttConnection(
  params: MqttTestConnectionParams,
  connectFn: (url: string, opts: IClientOptions) => MqttClient = mqtt.connect
): Promise<MqttTestConnectionResult> {
  return new Promise(resolve => {
    const clientId = `${params.clientIdPrefix ?? 'test'}_${randomUUID()}`;
    const protocol = params.useTls ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${params.host}:${String(params.port)}`;

    const client = connectFn(url, {
      clientId,
      connectTimeout: TEST_CONNECT_TIMEOUT_MS,
      reconnectPeriod: 0,
      ...(params.username !== null ? { username: params.username } : {}),
      ...(params.password !== null ? { password: params.password } : {}),
    });

    let settled = false;
    const finish = (result: MqttTestConnectionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end(true);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ success: false, message: 'Connection timed out' });
    }, TEST_CONNECT_TIMEOUT_MS);

    client.once('connect', () => {
      const testTopic = `test/connection/${clientId}`;
      const payload = JSON.stringify({ test: true, timestamp: new Date().toISOString() });
      client.publish(testTopic, payload, { qos: 0 }, () => {
        finish({ success: true, message: 'Connection successful' });
      });
    });

    client.once('error', (err: Error) => {
      finish({ success: false, message: err.message });
    });
  });
}
