import type { ConnectorHealth } from './connectivity.types.js';

/**
 * Domain DTO -> the real Laravel `ConnectorHealth::toArray()`/
 * `AdapterCapabilities::toArray()` shape, field for field (D-0104).
 * `reported_at` is computed here, at serialization time — matching
 * Laravel's own `toArray()`, which calls `now()` inline rather than
 * carrying a value computed earlier in the request.
 */
export function toConnectorHealthResponse(health: ConnectorHealth) {
  return {
    connector_id: health.connectorId,
    runtime_id: health.runtimeId,
    state: health.state,
    connected: health.connected,
    last_message_at: health.lastMessageAt ? health.lastMessageAt.toISOString() : null,
    messages_received_total: health.messagesReceivedTotal,
    messages_sent_total: health.messagesSentTotal,
    errors_total: health.errorsTotal,
    reconnects_total: health.reconnectsTotal,
    queue_depth: health.queueDepth,
    reported_at: new Date().toISOString(),
    capabilities: {
      supports_discovery: health.capabilities.supportsDiscovery,
      supports_read: health.capabilities.supportsRead,
      supports_write: health.capabilities.supportsWrite,
      is_push_based: health.capabilities.isPushBased,
    },
  };
}
