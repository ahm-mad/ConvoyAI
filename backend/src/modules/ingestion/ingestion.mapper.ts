import type { raw_packet_values as RawPacketRow } from '@prisma/client';
import type { RawPacket } from './ingestion.types.js';

function toDeviceIdsArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function toRawPacket(row: RawPacketRow): RawPacket {
  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    protocolId: row.protocol_id.toString(),
    deviceProtocolId: row.device_protocol_id === null ? null : row.device_protocol_id.toString(),
    userId: row.user_id.toString(),
    jsonBody: row.json_body,
    deviceIds: toDeviceIdsArray(row.device_ids),
    token: row.token,
    packetHash: row.packet_hash,
  };
}
