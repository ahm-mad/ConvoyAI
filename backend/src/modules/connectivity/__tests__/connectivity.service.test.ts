import { describe, expect, it } from 'vitest';
import { ConnectivityService } from '../connectivity.service.js';
import {
  fakeMqttStateLookup,
  fakePacketsLookup,
  fakeProtocolsLookup,
  fakeQueueLookup,
} from './fakes.js';

describe('ConnectivityService (D-0104)', () => {
  it('webhook health: always connected/running, real packet totals from raw_packet_values filtered by HTTPS', async () => {
    const lastMessageAt = new Date('2026-01-01T00:00:00.000Z');
    const service = new ConnectivityService(
      fakeProtocolsLookup({ HTTPS: '1' }),
      fakePacketsLookup({ '1': { total: 42, lastMessageAt } }),
      fakeQueueLookup(3),
      fakeMqttStateLookup()
    );

    const health = await service.getConnectorHealth('webhook');

    expect(health).toMatchObject({
      connectorId: 'webhook-central',
      runtimeId: 'central',
      state: 'running',
      connected: true,
      lastMessageAt,
      messagesReceivedTotal: 42,
      messagesSentTotal: 0,
      errorsTotal: 0,
      reconnectsTotal: 0,
      queueDepth: 3,
      capabilities: {
        supportsDiscovery: false,
        supportsRead: true,
        supportsWrite: false,
        isPushBased: true,
      },
    });
  });

  it("webhook health: no HTTPS protocol row seeded degrades to zeros, not a 500 (matches Laravel's own per-adapter-failure posture)", async () => {
    const service = new ConnectivityService(
      fakeProtocolsLookup({}),
      fakePacketsLookup({}),
      fakeQueueLookup(0),
      fakeMqttStateLookup()
    );

    const health = await service.getConnectorHealth('webhook');

    expect(health.messagesReceivedTotal).toBe(0);
    expect(health.lastMessageAt).toBeNull();
  });

  it("mqtt health: connected + real reconnects/errors from the live client's published state", async () => {
    const lastMessageAt = new Date('2026-01-01T00:00:00.000Z');
    const service = new ConnectivityService(
      fakeProtocolsLookup({ MQTT: '2' }),
      fakePacketsLookup({ '2': { total: 7, lastMessageAt } }),
      fakeQueueLookup(1),
      fakeMqttStateLookup({ connected: true, reconnectsTotal: 2, errorsTotal: 1 })
    );

    const health = await service.getConnectorHealth('mqtt');

    expect(health).toMatchObject({
      connectorId: 'mqtt-central',
      runtimeId: 'central',
      state: 'running',
      connected: true,
      lastMessageAt,
      messagesReceivedTotal: 7,
      errorsTotal: 1,
      reconnectsTotal: 2,
      queueDepth: 1,
      capabilities: {
        supportsDiscovery: false,
        supportsRead: true,
        supportsWrite: true,
        isPushBased: true,
      },
    });
  });

  it("mqtt health: no published state (never started, or heartbeat TTL lapsed) reports stopped/disconnected, never a guessed 'connected'", async () => {
    const service = new ConnectivityService(
      fakeProtocolsLookup({ MQTT: '2' }),
      fakePacketsLookup({}),
      fakeQueueLookup(0),
      fakeMqttStateLookup(undefined)
    );

    const health = await service.getConnectorHealth('mqtt');

    expect(health.state).toBe('stopped');
    expect(health.connected).toBe(false);
    expect(health.errorsTotal).toBe(0);
    expect(health.reconnectsTotal).toBe(0);
  });

  it('getAllConnectorsHealth returns both mqtt and webhook', async () => {
    const service = new ConnectivityService(
      fakeProtocolsLookup({}),
      fakePacketsLookup({}),
      fakeQueueLookup(0),
      fakeMqttStateLookup()
    );

    const health = await service.getAllConnectorsHealth();

    expect(health.mqtt.connectorId).toBe('mqtt-central');
    expect(health.webhook.connectorId).toBe('webhook-central');
  });

  it('getConnectorHealth rejects an unknown connector name with the exact Laravel message (404)', async () => {
    const service = new ConnectivityService(
      fakeProtocolsLookup({}),
      fakePacketsLookup({}),
      fakeQueueLookup(0),
      fakeMqttStateLookup()
    );

    await expect(service.getConnectorHealth('bacnet')).rejects.toMatchObject({
      httpStatus: 404,
      message: "Unknown connector 'bacnet'.",
    });
  });
});
