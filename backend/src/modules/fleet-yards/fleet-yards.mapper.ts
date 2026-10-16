import type {
  yards as YardRow,
  yard_layouts as YardLayoutRow,
  yard_slots as YardSlotRow,
  yard_slot_events as YardSlotEventRow,
} from '@prisma/client';
import type { Yard, YardLayout, YardSlot, YardSlotEvent } from './fleet-yards.types.js';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toYard(row: YardRow): Yard {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    name: row.name,
    address: row.address,
    latitude: toNumberOrNull(row.latitude),
    longitude: toNumberOrNull(row.longitude),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toYardLayout(row: YardLayoutRow): YardLayout {
  return {
    id: row.id.toString(),
    yardId: row.yard_id.toString(),
    filePath: row.file_path,
    widthPx: row.width_px,
    heightPx: row.height_px,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYardSlot(row: YardSlotRow): YardSlot {
  return {
    id: row.id.toString(),
    yardId: row.yard_id.toString(),
    slotNumber: row.slot_number,
    positionX: toNumberOrNull(row.position_x),
    positionY: toNumberOrNull(row.position_y),
    maxLengthM: toNumberOrNull(row.max_length_m),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toYardSlotEvent(row: YardSlotEventRow): YardSlotEvent {
  return {
    id: row.id.toString(),
    yardSlotId: row.yard_slot_id.toString(),
    vehicleId: row.vehicle_id.toString(),
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
