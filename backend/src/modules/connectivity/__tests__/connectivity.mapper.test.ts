import { describe, expect, it } from 'vitest';
import { toConnectorHealthResponse } from '../connectivity.mapper.js';
import type { ConnectorHealth } from '../connectivity.types.js';

describe('toConnectorHealthResponse (D-0104)', () => {
  it("maps every field to Laravel's exact snake_case ConnectorHealth::toArray() shape", () => {
    const health: ConnectorHealth = {
      connectorId: 'webhook-central',
      runtimeId: 'central',
      state: 'running',
      connected: true,
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
      messagesReceivedTotal: 5,
      messagesSentTotal: 0,
      errorsTotal: 0,
      reconnectsTotal: 0,
      queueDepth: 2,
      capabilities: {
        supportsDiscovery: false,
        supportsRead: true,
        supportsWrite: false,
        isPushBased: true,
      },
    };

    const response = toConnectorHealthResponse(health);

    expect(response).toMatchObject({
      connector_id: 'webhook-central',
      runtime_id: 'central',
      state: 'running',
      connected: true,
      last_message_at: '2026-01-01T00:00:00.000Z',
      messages_received_total: 5,
      messages_sent_total: 0,
      errors_total: 0,
      reconnects_total: 0,
      queue_depth: 2,
      capabilities: {
        supports_discovery: false,
        supports_read: true,
        supports_write: false,
        is_push_based: true,
      },
    });
    expect(typeof response.reported_at).toBe('string');
  });

  it('null lastMessageAt maps to null, not a crash', () => {
    const health: ConnectorHealth = {
      connectorId: 'mqtt-central',
      runtimeId: 'central',
      state: 'stopped',
      connected: false,
      lastMessageAt: null,
      messagesReceivedTotal: 0,
      messagesSentTotal: 0,
      errorsTotal: 0,
      reconnectsTotal: 0,
      queueDepth: 0,
      capabilities: {
        supportsDiscovery: false,
        supportsRead: true,
        supportsWrite: true,
        isPushBased: true,
      },
    };

    expect(toConnectorHealthResponse(health).last_message_at).toBeNull();
  });
});
