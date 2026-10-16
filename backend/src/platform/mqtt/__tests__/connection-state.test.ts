import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { publishMqttConnectionState, readMqttConnectionState } from '../connection-state.js';

function fakeRedis() {
  const store = new Map<string, string>();
  const set = vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  const get = vi.fn((key: string) => Promise.resolve(store.get(key) ?? null));
  return { redis: { set, get } as unknown as Redis, set, get, store };
}

describe('mqtt connection-state (D-0104)', () => {
  it('round-trips a published state', async () => {
    const { redis } = fakeRedis();

    await publishMqttConnectionState(redis, {
      connected: true,
      reconnectsTotal: 2,
      errorsTotal: 1,
    });
    const state = await readMqttConnectionState(redis);

    expect(state).toEqual({ connected: true, reconnectsTotal: 2, errorsTotal: 1 });
  });

  it("publishes with a TTL, not a permanent key (a crashed mqtt process's last state must expire)", async () => {
    const { redis, set } = fakeRedis();

    await publishMqttConnectionState(redis, {
      connected: true,
      reconnectsTotal: 0,
      errorsTotal: 0,
    });

    expect(set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 120);
  });

  it('never published: returns undefined, not a guessed default', async () => {
    const { redis } = fakeRedis();

    const state = await readMqttConnectionState(redis);

    expect(state).toBeUndefined();
  });

  it('corrupt value in Redis: returns undefined rather than throwing', async () => {
    const { redis, store } = fakeRedis();
    store.set('mqtt:connection-state', 'not json');

    const state = await readMqttConnectionState(redis);

    expect(state).toBeUndefined();
  });
});
