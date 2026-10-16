/**
 * Domain types for the connectivity module (`GET /connectors/health`,
 * `GET /connectors/{connector}/health`, D-0104) — ported from
 * `ConnectorHealthController`/`ProtocolAdapter` (blueprint §7.2), a
 * frozen-contract endpoint (`reference/api-catalog.md`, `openapi.yaml`)
 * never assigned to a module and never built. Field names mirror
 * Laravel's `ConnectorHealth`/`AdapterCapabilities` DTOs exactly.
 */
export type ConnectorName = 'mqtt' | 'webhook';

export interface AdapterCapabilities {
  supportsDiscovery: boolean;
  supportsRead: boolean;
  supportsWrite: boolean;
  isPushBased: boolean;
}

export interface ConnectorHealth {
  connectorId: string;
  runtimeId: string;
  state: 'running' | 'stopped' | 'error';
  connected: boolean;
  lastMessageAt: Date | null;
  messagesReceivedTotal: number;
  messagesSentTotal: number;
  errorsTotal: number;
  reconnectsTotal: number;
  queueDepth: number;
  capabilities: AdapterCapabilities;
}
