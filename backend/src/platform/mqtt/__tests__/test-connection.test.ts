import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { MqttClient } from 'mqtt';
import { testMqttConnection } from '../test-connection.js';

const BASE_PARAMS = {
  host: 'broker.example.com',
  port: 8883,
  username: null,
  password: null,
  useTls: true,
  clientIdPrefix: null,
};

function fakeClient(): {
  emitter: EventEmitter;
  client: MqttClient;
  publish: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const emitter = new EventEmitter();
  const publish = vi.fn((_topic: string, _payload: string, _opts: unknown, cb: () => void) => {
    cb();
  });
  const end = vi.fn();
  const client = Object.assign(emitter, { publish, end }) as unknown as MqttClient;
  return { emitter, client, publish, end };
}

describe('testMqttConnection (D-0117)', () => {
  it('resolves success and publishes a test message once connected', async () => {
    const { emitter, client, publish, end } = fakeClient();
    const connectFn = vi.fn(() => {
      queueMicrotask(() => emitter.emit('connect'));
      return client;
    });

    const result = await testMqttConnection(BASE_PARAMS, connectFn);

    expect(result).toEqual({ success: true, message: 'Connection successful' });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(true);
  });

  it('resolves failure with the error message on a connection error', async () => {
    const { emitter, client } = fakeClient();
    const connectFn = vi.fn(() => {
      queueMicrotask(() => emitter.emit('error', new Error('ECONNREFUSED')));
      return client;
    });

    const result = await testMqttConnection(BASE_PARAMS, connectFn);

    expect(result).toEqual({ success: false, message: 'ECONNREFUSED' });
  });

  it('connects with mqtts:// when useTls is true and mqtt:// otherwise', async () => {
    const { emitter, client } = fakeClient();
    const connectFn = vi.fn((_url: string, _opts: unknown) => {
      queueMicrotask(() => emitter.emit('connect'));
      return client;
    });

    await testMqttConnection({ ...BASE_PARAMS, useTls: false, port: 1883 }, connectFn);

    expect(connectFn).toHaveBeenCalledWith('mqtt://broker.example.com:1883', expect.any(Object));
  });
});
