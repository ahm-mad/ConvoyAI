import type { protocols as ProtocolRow } from '@prisma/client';
import type { Protocol } from './protocols.types.js';

export function toProtocol(row: ProtocolRow): Protocol {
  return {
    id: row.id.toString(),
    name: row.name,
    category: row.category,
    image: row.image,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Bare-model response (no envelope) — matches Laravel's `response()->json($protocol)` exactly, including raw timestamps. */
export function toProtocolResponse(protocol: Protocol) {
  return {
    id: Number(protocol.id),
    name: protocol.name,
    category: protocol.category,
    image: protocol.image,
    created_at: protocol.createdAt,
    updated_at: protocol.updatedAt,
  };
}
