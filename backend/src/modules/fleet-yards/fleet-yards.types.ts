import type { Bbox } from '../../platform/http/bbox.js';

/**
 * Module 4.4 (`yards`/`yard_layouts`/`yard_slots`/`yard_slot_events`,
 * `YardController.php`). `yards` is already `company`-ruled in
 * `tenant-rules.ts` (registered by module 4.2 for its own narrow
 * read-only needs) — this module owns the first real CRUD on it.
 * `yard_layouts`/`yard_slots` are `parent:yards`; `yard_slot_events` is
 * `parent:yard_slots` (two levels deep — reached only through an
 * already company-scoped `yard_slot_id` this module's own
 * `findSlotById` already verified via a join through `yard_slots.yards
 * .company_id`, same discipline as module 3.1's `asset_components`).
 *
 * ADR-001 ("Stops, Yards & Vehicle Presence Are Three Distinct
 * Concepts", `ARCHITECTURE_DECISIONS.md`): a Yard is a predefined,
 * named operational location; `yard_slot_events` is "Yard History" —
 * the record of a vehicle physically present at a known Yard,
 * auto-detected via geofence entry/exit OR manual check-in per the
 * ADR's own diagram. **Confirmed directly against `YardController.php`
 * that only the manual half is real**: every `YardSlotEvent` the
 * controller creates is hardcoded `source: 'manual'`. The schema's
 * `yard_slot_events_source` enum also has a `gps_proximity` value, but
 * a full-codebase grep for that string found zero matches anywhere in
 * `app/` — it is a dead enum value, not a feature to build; this
 * module does not add a geofence-triggered auto-checkin path (there is
 * no Laravel behavior to port, and no product ask for one here — a
 * geofence CAN be created *from* a yard's coordinates, the reverse
 * direction, per module 4.3's own `geofence-detection.md` §4, but
 * nothing calls back into yard check-in from geofence detection).
 */
/** D-0164 (B1) — the yard list's filters; `window` undefined = the flat, unpaged list. */
export interface YardListQuery {
  includeInactive: boolean;
  search?: string | undefined;
  hasCoordinates?: boolean | undefined;
  hasLayout?: boolean | undefined;
  /** D-0167 (R3): explicit active/inactive filter — wins over `includeInactive`. */
  isActive?: boolean | undefined;
  hasSlots?: boolean | undefined;
  minSlots?: number | undefined;
  /** D-0180 (B8): keep only yards whose circle overlaps this map box. */
  bbox?: Bbox | undefined;
  sortBy?: 'name' | 'created_at' | 'slots_count' | 'radius_m' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** D-0165 (B2) — the yard picker's filters. */
export interface YardOptionsQuery {
  /** D-0171 */
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  hasCoordinates?: boolean | undefined;
  limit: number;
}

export interface Yard {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** D-0162: `false` = deactivated (leaves assign/dropdown lists; history keeps referencing it). */
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateYardInput {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** D-0162: the linked geofence's radius; `null` = the default (100 m). Ignored when the yard has no coordinates. */
  radiusM: number | null;
}

/** D-0162 (`PUT /yards/{id}`): only the fields that were sent (`undefined` = leave alone). Latitude and longitude always come together. */
export interface UpdateYardInput {
  name?: string | undefined;
  address?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  radiusM?: number | undefined;
}

/** D-0162 (`PUT /yard-slots/{slotId}`). */
export interface UpdateYardSlotInput {
  slotNumber?: string | undefined;
  positionX?: number | null | undefined;
  positionY?: number | null | undefined;
  maxLengthM?: number | null | undefined;
}

/** `file_path` stores the real R2 public URL directly (D-0044's established pattern, same as module 3.1's floor plans) — not a local relative path needing a separate computed `url` accessor the way Laravel's `$appends` does it. */
export interface YardLayout {
  id: string;
  yardId: string;
  filePath: string;
  widthPx: number;
  heightPx: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface YardSlot {
  id: string;
  yardId: string;
  slotNumber: string;
  positionX: number | null;
  positionY: number | null;
  maxLengthM: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateYardSlotInput {
  slotNumber: string;
  positionX: number | null;
  positionY: number | null;
  maxLengthM: number | null;
}

/** `source` is always `'manual'` here — see this file's own doc comment above. */
export interface YardSlotEvent {
  id: string;
  yardSlotId: string;
  vehicleId: string;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  source: 'manual' | 'gps_proximity';
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `fleetVehiclesDriversRepository` doubles as this module's vehicle lookup — `checkIn`'s `max_length_m` validation and `show()`'s `slots.currentEvent.vehicle` brief (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same cross-module pattern as every other fleet module. */
export interface YardsVehiclesLookup {
  findVehicleById(id: string): Promise<
    | {
        id: string;
        name: string;
        vehicleCategory: string | null;
        make: string | null;
        model: string | null;
        lengthM: number | null;
      }
    | undefined
  >;
}
