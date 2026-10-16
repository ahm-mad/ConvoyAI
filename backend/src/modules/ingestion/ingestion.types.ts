/**
 * Domain types for module 2.4 (ingestion). See `tasks/08-ingestion.md` for
 * the unified-entrypoint design (11.31's dedup algorithm) and the
 * hot-path/async-worker split (ARCHITECTURE.md §8: entrypoint does auth +
 * dedup + persist raw, then enqueues — no synchronous fan-out).
 */
export interface RawPacket {
  id: string;
  productId: string;
  protocolId: string;
  deviceProtocolId: string | null;
  userId: string;
  jsonBody: unknown;
  deviceIds: string[];
  token: string | null;
  packetHash: string | null;
}

export interface CreateRawPacketInput {
  productId: string;
  protocolId: string;
  deviceProtocolId: string | null;
  userId: string;
  jsonBody: Record<string, unknown>;
  deviceIds: string[];
  token: string | undefined;
  packetHash: string;
}

/**
 * Every outcome `WebhookController::storePacketData` can reach, ported as a
 * discriminated union rather than each branch reaching for its own
 * ad hoc response — the controller maps each `kind` to the exact frozen
 * status/body pair once, in one place.
 */
export type IngestResult =
  | { kind: 'unauthenticated' }
  | { kind: 'invalid_token' }
  | { kind: 'duplicate'; existingId: string }
  | { kind: 'initial_packet'; productId: string; userId: string }
  | { kind: 'no_preferences' }
  | { kind: 'no_unique_identifier' }
  | { kind: 'device_not_found' }
  | { kind: 'accepted'; rawPacketId: string };

export interface AttributePreference {
  attributeKey: string | null;
  label: string | null;
  unit: string | null;
  isSelected: boolean;
  isUniqueIdentifier: boolean;
  /** D-0154: the GPS role ("Mark as location") — the only thing position detection reads (the old label matching is gone). */
  attributeRole: 'latitude' | 'longitude' | 'speed' | 'heading' | null;
}
