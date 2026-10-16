import { NotFoundError } from '../../platform/errors/app-error.js';
import type { ConnectorHealth, ConnectorName } from './connectivity.types.js';

/** Module 2.2's `ProtocolsRepository` doubles as this (interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules"). */
export interface ConnectivityProtocolsLookup {
  findByName(name: string): Promise<{ id: string } | undefined>;
}

/** Module 2.4's `IngestionRepository` doubles as this. */
export interface ConnectivityPacketsLookup {
  countAndLatestByProtocolId(
    protocolId: string
  ): Promise<{ total: number; lastMessageAt: Date | null }>;
}

/** The shared `"ingestion"` BullMQ queue's real waiting-job count — both MQTT and webhook packets funnel into it (`ingestion.service.ts`'s `ingestResolvedPacket`), so one real number legitimately applies to both adapters. Laravel hardcodes `queue_depth: 0` for both (its ingestion is synchronous) — this app's is genuinely async, so a real count is more honest than matching Laravel's stub. */
export interface ConnectivityQueueLookup {
  waitingCount(): Promise<number>;
}

/** D-0104: `main.mqtt.ts`'s live connection state, read via Redis (`platform/mqtt/connection-state.ts`) since it runs in a separate process. `undefined` (never published, or the heartbeat TTL lapsed) is treated as "not connected," never as "unknown but assume healthy." */
export interface ConnectivityMqttStateLookup {
  read(): Promise<{ connected: boolean; reconnectsTotal: number; errorsTotal: number } | undefined>;
}

const MQTT_CAPABILITIES = {
  supportsDiscovery: false,
  supportsRead: true,
  supportsWrite: true,
  isPushBased: true,
};
const WEBHOOK_CAPABILITIES = {
  supportsDiscovery: false,
  supportsRead: true,
  supportsWrite: false,
  isPushBased: true,
};

/**
 * Business logic for the connectivity module (ARCHITECTURE.md §2 —
 * services never touch Prisma directly). Ported from
 * `ConnectorHealthController`/`MqttProtocolAdapter`/`WebhookProtocolAdapter`
 * (D-0104): the webhook half matches Laravel's own DB-driven query
 * exactly (`RawPacketValue::where('protocol_id', ...)`); the MQTT half
 * adapts it — Laravel's `mqtt_configs`/`device_packets`/
 * `failed_mqtt_messages` are legacy tables never ported (KNOWN_ISSUES
 * 11.11), so message counts come from the same `raw_packet_values` table
 * the webhook half uses (this app's unified ingestion pipeline writes
 * MQTT packets there too, protocol_id resolved to `MQTT`, D-0054), and
 * connection state comes from the real live MQTT.js client via Redis,
 * not a per-user config row.
 */
export class ConnectivityService {
  constructor(
    private readonly protocolsLookup: ConnectivityProtocolsLookup,
    private readonly packetsLookup: ConnectivityPacketsLookup,
    private readonly queueLookup: ConnectivityQueueLookup,
    private readonly mqttStateLookup: ConnectivityMqttStateLookup
  ) {}

  async getAllConnectorsHealth(): Promise<Record<ConnectorName, ConnectorHealth>> {
    const [mqtt, webhook] = await Promise.all([this.mqttHealth(), this.webhookHealth()]);
    return { mqtt, webhook };
  }

  async getConnectorHealth(name: string): Promise<ConnectorHealth> {
    if (name === 'mqtt') return this.mqttHealth();
    if (name === 'webhook') return this.webhookHealth();
    throw new NotFoundError(`Unknown connector '${name}'.`);
  }

  private async mqttHealth(): Promise<ConnectorHealth> {
    const [packets, queueDepth, state] = await Promise.all([
      this.packetsForProtocol('MQTT'),
      this.queueLookup.waitingCount(),
      this.mqttStateLookup.read(),
    ]);
    const connected = state?.connected ?? false;

    return {
      connectorId: 'mqtt-central',
      runtimeId: 'central',
      state: connected ? 'running' : 'stopped',
      connected,
      lastMessageAt: packets.lastMessageAt,
      messagesReceivedTotal: packets.total,
      messagesSentTotal: 0,
      errorsTotal: state?.errorsTotal ?? 0,
      reconnectsTotal: state?.reconnectsTotal ?? 0,
      queueDepth,
      capabilities: MQTT_CAPABILITIES,
    };
  }

  private async webhookHealth(): Promise<ConnectorHealth> {
    const [packets, queueDepth] = await Promise.all([
      this.packetsForProtocol('HTTPS'),
      this.queueLookup.waitingCount(),
    ]);

    return {
      connectorId: 'webhook-central',
      runtimeId: 'central',
      state: 'running',
      connected: true,
      lastMessageAt: packets.lastMessageAt,
      messagesReceivedTotal: packets.total,
      messagesSentTotal: 0,
      errorsTotal: 0,
      reconnectsTotal: 0,
      queueDepth,
      capabilities: WEBHOOK_CAPABILITIES,
    };
  }

  /** No seeded protocol row (a genuinely empty catalog) degrades to zeros, matching `ConnectorHealthController::resolveHealth`'s own per-adapter-failure posture — never a 500 for the whole call. */
  private async packetsForProtocol(
    name: string
  ): Promise<{ total: number; lastMessageAt: Date | null }> {
    const protocol = await this.protocolsLookup.findByName(name);
    if (!protocol) return { total: 0, lastMessageAt: null };
    return this.packetsLookup.countAndLatestByProtocolId(protocol.id);
  }
}
