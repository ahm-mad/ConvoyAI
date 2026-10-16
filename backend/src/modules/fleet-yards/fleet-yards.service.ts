import { imageSize } from 'image-size';
import { getRequestContext } from '../../platform/http/request-context.js';
import { listData, optionsResponse } from '../../platform/http/list-query.js';
import {
  auditFields,
  loadActors,
  type ActorDirectory,
  type ActorMap,
} from '../../platform/http/actors.js';
import { assertNeverUsed } from '../../platform/http/hard-delete.js';
import { assertNotStale } from '../../platform/http/concurrency.js';
import { BULK_LIMIT, bulkResponse, resolveBulkTargets, runBulk } from '../../platform/http/bulk.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import type { FleetChangedAction, FleetChangedEntity } from '../../platform/realtime/events.js';
import type { FleetRealtimePort } from '../../platform/realtime/fleet-realtime.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { deleteObject, keyFromUrl, uploadObject } from '../../platform/storage/r2-storage.js';
import type { FleetYardsRepository } from './fleet-yards.repository.js';
import type { YardsGeofencesLookup } from '../fleet-geofences/fleet-geofences.types.js';
import type {
  CreateYardInput,
  CreateYardSlotInput,
  UpdateYardInput,
  UpdateYardSlotInput,
  Yard,
  YardListQuery,
  YardOptionsQuery,
  YardSlot,
  YardsVehiclesLookup,
} from './fleet-yards.types.js';

/** D-0151/D-0162 (owner): the default radius of a yard's linked geofence when none is given. */
const DEFAULT_YARD_RADIUS_M = 100;

interface YardExportRow {
  yard: Yard;
  slotsCount: number;
  radiusM: number | null;
}

/** D-0168 (B11) — the yard CSV's documented column set. */
const YARD_EXPORT_COLUMNS: CsvColumn<YardExportRow>[] = [
  { header: 'id', value: r => r.yard.id },
  { header: 'name', value: r => r.yard.name },
  { header: 'address', value: r => r.yard.address },
  { header: 'latitude', value: r => r.yard.latitude },
  { header: 'longitude', value: r => r.yard.longitude },
  { header: 'radius_m', value: r => r.radiusM },
  { header: 'slots_count', value: r => r.slotsCount },
  { header: 'is_active', value: r => r.yard.isActive },
  { header: 'created_at', value: r => r.yard.createdAt },
];

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

/**
 * Business logic for module 4.4 (`YardController.php`). Circular geometry
 * isn't relevant here (that's 4.3's own domain) — a yard is a plain
 * named point + optional layout image + numbered slots. See
 * `fleet-yards.types.ts`'s own doc comment for the ADR-001 / manual-only
 * `source` confirmation.
 */
export class FleetYardsService {
  constructor(
    private readonly repo: FleetYardsRepository,
    private readonly vehiclesLookup: YardsVehiclesLookup,
    private readonly geofencesLookup: YardsGeofencesLookup,
    private readonly realtime: FleetRealtimePort,
    private readonly usersLookup: ActorDirectory
  ) {}

  /** D-0172 (B6): one batched lookup of the people behind a response's `created_by` / `updated_by` ids. */
  private actorsFor(...ids: Array<string | null>): Promise<ActorMap> {
    return loadActors(this.usersLookup, ids);
  }

  /** D-0163: tell the company room "this record changed — refetch it" (best-effort; the port never throws). */
  private async announce(
    entity: FleetChangedEntity,
    id: string,
    action: FleetChangedAction
  ): Promise<void> {
    const companyId = getRequestContext()?.companyId;
    if (!companyId) return;
    await this.realtime.publishFleetChanged(companyId, {
      entity,
      id,
      action,
      occurredAt: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // JSON shaping
  // ===========================================================================

  /** `radius_m` (D-0162) = the radius of the yard's linked geofence (its earliest one), `null` when the yard has none (no coordinates). */
  private baseYardJson(yard: Yard, radiusM: number | null, actors: ActorMap): Json {
    return {
      id: yard.id,
      company_id: yard.companyId,
      name: yard.name,
      address: yard.address,
      latitude: yard.latitude,
      longitude: yard.longitude,
      radius_m: radiusM,
      is_active: yard.isActive,
      created_at: yard.createdAt,
      updated_at: yard.updatedAt,
      ...auditFields(actors, yard.createdBy, yard.updatedBy),
    };
  }

  private slotJson(slot: YardSlot, actors: ActorMap): Json {
    return {
      id: slot.id,
      yard_id: slot.yardId,
      slot_number: slot.slotNumber,
      position_x: slot.positionX,
      position_y: slot.positionY,
      max_length_m: slot.maxLengthM,
      created_at: slot.createdAt,
      updated_at: slot.updatedAt,
      ...auditFields(actors, slot.createdBy, slot.updatedBy),
    };
  }

  // ===========================================================================
  // Yards
  // ===========================================================================

  /** `YardController::index` — `Yard::where('company_id', ...)->withCount('slots')->get()`. D-0164 (B1): search/filters/sort + opt-in paging. */
  async listYards(query: YardListQuery) {
    const { items, total } = await this.repo.listYardsForCompany(query);
    const geofences = await this.geofencesLookup.linkedGeofencesForYards(
      items.map(({ yard }) => yard.id)
    );
    const actors = await this.actorsFor(
      ...items.flatMap(({ yard }) => [yard.createdBy, yard.updatedBy])
    );
    const rows = items.map(({ yard, slotsCount }) => ({
      ...this.baseYardJson(yard, geofences.get(yard.id)?.radiusM ?? null, actors),
      slots_count: slotsCount,
    }));
    return {
      success: true,
      message: 'Yards retrieved.',
      data: listData(rows, total, query.window),
    };
  }

  /** `POST /yards/bulk-deactivate|bulk-reactivate` (D-0166, B10) — each yard goes through the single-yard action (same guards and messages). */
  async bulkYards(
    action: 'deactivate' | 'reactivate' | 'delete',
    target: { ids?: string[] | undefined; filter?: Omit<YardListQuery, 'window'> | undefined }
  ) {
    const targets = await resolveBulkTargets({ ids: target.ids }, async () => {
      const { items, total } = await this.repo.listYardsForCompany({
        ...(target.filter ?? { includeInactive: action !== 'deactivate' }),
        window: { page: 1, perPage: BULK_LIMIT },
      });
      return { ids: items.map(({ yard }) => yard.id), total };
    });
    const results = await runBulk(
      targets.ids,
      async id => {
        if (action === 'delete') return { message: (await this.deleteYard(id)).message }; // D-0178 (C14)
        // D-0171: a yard already in the target state is left alone (no write, no realtime event) and reported as `changed: false`
        const yard = await this.repo.findYardById(id);
        if (yard) {
          if (action === 'deactivate' && !yard.isActive)
            return { changed: false, message: 'Yard is already deactivated.' };
          if (action === 'reactivate' && yard.isActive)
            return { changed: false, message: 'Yard is already active.' };
        }
        const result =
          action === 'deactivate' ? await this.deactivateYard(id) : await this.reactivateYard(id);
        return { message: result.message };
      },
      action === 'deactivate'
        ? 'Yard deactivated.'
        : action === 'reactivate'
          ? 'Yard reactivated.'
          : 'Yard deleted.',
      async id => (await this.repo.findYardById(id))?.name
    );
    return bulkResponse(targets, results);
  }

  /** `GET /yards/export` (D-0168, B11) — the yard list's own filters/sort, every matching row as CSV (≤ 50 000; 422 above). */
  exportYards(query: Omit<YardListQuery, 'window'>) {
    return planExport('yards', YARD_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listYardsForCompany({
        ...query,
        window: { page, perPage },
      });
      const geofences = await this.geofencesLookup.linkedGeofencesForYards(
        items.map(({ yard }) => yard.id)
      );
      return {
        items: items.map(({ yard, slotsCount }) => ({
          yard,
          slotsCount,
          radiusM: geofences.get(yard.id)?.radiusM ?? null,
        })),
        total,
      };
    });
  }

  /** `GET /yards/options` (D-0165, B2) — lean, unpaginated (capped) list of active yards for pickers. */
  async yardOptions(query: YardOptionsQuery) {
    const { items, total } = await this.repo.listYardsForCompany({
      includeInactive: query.includeInactive === true,
      search: query.search,
      hasCoordinates: query.hasCoordinates,
      sortBy: 'name',
      sortOrder: 'asc',
      window: { page: 1, perPage: query.limit },
    });
    const rows = items.map(({ yard, slotsCount }) => ({
      id: yard.id,
      name: yard.name,
      address: yard.address,
      latitude: yard.latitude,
      longitude: yard.longitude,
      slots_count: slotsCount,
      is_active: yard.isActive,
    }));
    return optionsResponse('Yard options retrieved successfully.', rows, total, query.limit);
  }

  async createYard(input: CreateYardInput) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    const yard = await this.repo.createYard(input);

    // D-0162 (owner D3): a yard with coordinates gets its LINKED geofence right away (default 100 m, or `radius_m`), so it can drive trip stops
    // (sensor -> trip bridge) without an operator creating a geofence by hand. No coordinates -> no geofence yet (added by `PUT /yards/{id}`).
    let geofence: { id: string; radiusM: number } | null = null;
    if (yard.latitude !== null && yard.longitude !== null) {
      geofence = await this.geofencesLookup.createYardGeofence({
        yardId: yard.id,
        name: yard.name,
        latitude: yard.latitude,
        longitude: yard.longitude,
        radiusM: input.radiusM ?? DEFAULT_YARD_RADIUS_M,
      });
    }
    await this.announce('yard', yard.id, 'created');
    if (geofence) await this.announce('geofence', geofence.id, 'created'); // the auto-created linked geofence shows up in the Geofences tab too
    return {
      success: true,
      message: 'Yard created.',
      data: {
        ...this.baseYardJson(
          yard,
          geofence?.radiusM ?? null,
          await this.actorsFor(yard.createdBy, yard.updatedBy)
        ),
        geofence: geofence ? { id: geofence.id, radius_m: geofence.radiusM } : null,
      },
    };
  }

  /**
   * `PUT /yards/{id}` (D-0162) — name / address / coordinates / radius. Moving or resizing the yard moves/resizes its linked geofence in the same call;
   * a yard that gains coordinates (and has no geofence yet) gets one. The linked geofence's centre is edited ONLY through the yard (a direct centre edit
   * on it is a 422 — owner decision).
   */
  async updateYard(id: string, input: UpdateYardInput, expectedUpdatedAt?: Date | null) {
    const existing = await this.repo.findYardById(id);
    if (!existing) throw new NotFoundError('Yard not found.');
    await assertNotStale(expectedUpdatedAt, existing, this.usersLookup); // D-0176 (B13)

    const yard = await this.repo.updateYard(id, input);
    if (!yard) throw new NotFoundError('Yard not found.');

    const linked = (await this.geofencesLookup.linkedGeofencesForYards([id])).get(id);
    let radiusM = linked?.radiusM ?? null;
    if (yard.latitude !== null && yard.longitude !== null) {
      if (linked) {
        const moved = input.latitude !== undefined && input.longitude !== undefined;
        if (moved || input.radiusM !== undefined) {
          await this.geofencesLookup.updateYardGeofence(linked.id, {
            ...(moved ? { latitude: yard.latitude, longitude: yard.longitude } : {}),
            ...(input.radiusM !== undefined ? { radiusM: input.radiusM } : {}),
          });
          if (input.radiusM !== undefined) radiusM = input.radiusM;
        }
      } else {
        const created = await this.geofencesLookup.createYardGeofence({
          yardId: id,
          name: yard.name,
          latitude: yard.latitude,
          longitude: yard.longitude,
          radiusM: input.radiusM ?? DEFAULT_YARD_RADIUS_M,
        });
        radiusM = created.radiusM;
      }
    }
    await this.announce('yard', yard.id, 'updated');
    if (linked) await this.announce('geofence', linked.id, 'updated');
    return {
      success: true,
      message: 'Yard updated.',
      data: this.baseYardJson(yard, radiusM, await this.actorsFor(yard.createdBy, yard.updatedBy)),
    };
  }

  /** D-0162: deactivate (not delete — history references yards). Refused while vehicles are checked in. */
  async deactivateYard(id: string) {
    const yard = await this.repo.findYardById(id);
    if (!yard) throw new NotFoundError('Yard not found.');
    if ((await this.repo.countOpenStaysInYard(id)) > 0) {
      throw new ValidationError('Check out all vehicles from this yard before deactivating it.');
    }
    return this.setActive(id, false, 'Yard deactivated.');
  }

  async reactivateYard(id: string) {
    const yard = await this.repo.findYardById(id);
    if (!yard) throw new NotFoundError('Yard not found.');
    return this.setActive(id, true, 'Yard reactivated.');
  }

  /**
   * `DELETE /yards/{id}` (D-0178, C14) — only a yard that was never used: no trip stops, no slot with any check-in / out history (so no vehicle in it),
   * no geofence events on its linked geofence (else 422 — deactivate instead). Its empty slots, layout image and linked geofence go with it.
   */
  async deleteYard(id: string) {
    const yard = await this.repo.findYardById(id);
    if (!yard) throw new NotFoundError('Yard not found.');
    assertNeverUsed('yard', await this.repo.yardUsage(id));
    const layout = await this.repo.findLayoutByYardId(id);
    const slots = await this.repo.listSlotsForYard(id);
    const linked = (await this.geofencesLookup.linkedGeofencesForYards([id])).get(id);
    if (!(await this.repo.deleteYard(id))) throw new NotFoundError('Yard not found.');
    if (layout)
      await deleteObject(keyFromUrl(layout.filePath) ?? layout.filePath).catch(() => undefined);
    await this.announce('yard', id, 'deleted');
    for (const slot of slots) await this.announce('yard_slot', slot.id, 'deleted');
    if (linked) await this.announce('geofence', linked.id, 'deleted');
    return { success: true, message: 'Yard deleted.' };
  }

  private async setActive(id: string, isActive: boolean, message: string) {
    const updated = await this.repo.setYardActive(id, isActive);
    if (!updated) throw new NotFoundError('Yard not found.');
    // D-0182 (L5): the yard's linked geofence(s) follow the yard — an out-of-service yard must not keep firing enter / exit events
    const flipped = await this.geofencesLookup.setYardGeofencesActive(id, isActive);
    const linked = (await this.geofencesLookup.linkedGeofencesForYards([id])).get(id);
    await this.announce('yard', id, isActive ? 'reactivated' : 'deactivated');
    for (const geofenceId of flipped) await this.announce('geofence', geofenceId, 'updated');
    return {
      success: true,
      message,
      data: this.baseYardJson(
        updated,
        linked?.radiusM ?? null,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  /** `YardController::show` — the yard, its layout (if uploaded), and every slot with its current occupancy, in one call. */
  async getYard(id: string) {
    const yard = await this.repo.findYardById(id);
    if (!yard) throw new NotFoundError('Yard not found.');

    const linkedGeofence = (await this.geofencesLookup.linkedGeofencesForYards([id])).get(id);
    const layout = await this.repo.findLayoutByYardId(id);
    const slots = await this.repo.listSlotsForYard(id);
    const currentEvents = await this.repo.currentEventsForSlots(slots.map(s => s.id));

    const actors = await this.actorsFor(
      yard.createdBy,
      yard.updatedBy,
      ...slots.flatMap(slot => [slot.createdBy, slot.updatedBy])
    );
    const slotsJson: Json[] = [];
    for (const slot of slots) {
      const event = currentEvents.get(slot.id);
      const vehicle = event
        ? await this.vehiclesLookup.findVehicleById(event.vehicleId)
        : undefined;
      slotsJson.push({
        id: slot.id,
        yard_id: slot.yardId,
        slot_number: slot.slotNumber,
        position_x: slot.positionX,
        position_y: slot.positionY,
        max_length_m: slot.maxLengthM,
        created_at: slot.createdAt,
        updated_at: slot.updatedAt,
        ...auditFields(actors, slot.createdBy, slot.updatedBy),
        current_event: event
          ? {
              id: event.id,
              yard_slot_id: event.yardSlotId,
              vehicle_id: event.vehicleId,
              checked_in_at: event.checkedInAt,
              checked_out_at: event.checkedOutAt,
              source: event.source,
              vehicle: vehicle
                ? {
                    id: vehicle.id,
                    name: vehicle.name,
                    vehicle_category: vehicle.vehicleCategory,
                    make: vehicle.make,
                    model: vehicle.model,
                  }
                : null,
            }
          : null,
      });
    }

    return {
      success: true,
      message: 'Yard retrieved.',
      data: {
        ...this.baseYardJson(yard, linkedGeofence?.radiusM ?? null, actors),
        layout: layout
          ? {
              id: layout.id,
              yard_id: layout.yardId,
              url: layout.filePath,
              width_px: layout.widthPx,
              height_px: layout.heightPx,
            }
          : null,
        slots: slotsJson,
      },
    };
  }

  // ===========================================================================
  // Layout upload (replace-on-reupload, same R2 pattern as module 3.1's floor plans, D-0044)
  // ===========================================================================

  async uploadLayout(
    yardId: string,
    image: { buffer: Buffer; contentType: string; extension: string }
  ): Promise<{ status: 200 | 201; body: Json }> {
    const yard = await this.repo.findYardById(yardId);
    if (!yard) throw new NotFoundError('Yard not found.');

    let dimensions: { width?: number; height?: number };
    try {
      dimensions = imageSize(image.buffer);
    } catch {
      throw new ValidationError('The image must be a valid image file.', {
        image: ['The image must be a valid image file.'],
      });
    }
    if (!dimensions.width || !dimensions.height) {
      throw new ValidationError('The image could not be read.', {
        image: ['The image could not be read.'],
      });
    }

    const existing = await this.repo.findLayoutByYardId(yardId);
    if (existing) {
      const key = keyFromUrl(existing.filePath) ?? existing.filePath;
      await deleteObject(key).catch(() => undefined);
    }

    const uploaded = await uploadObject({ prefix: 'yard-layouts', ...image });
    const layout = await this.repo.upsertLayout(yardId, {
      filePath: uploaded.url,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
    });

    return {
      status: existing ? 200 : 201,
      body: {
        success: true,
        message: existing ? 'Layout replaced.' : 'Layout uploaded.',
        data: {
          id: layout.id,
          url: layout.filePath,
          width_px: layout.widthPx,
          height_px: layout.heightPx,
        },
      },
    };
  }

  // ===========================================================================
  // Slots
  // ===========================================================================

  async createSlot(yardId: string, input: CreateYardSlotInput) {
    const yard = await this.repo.findYardById(yardId);
    if (!yard) throw new NotFoundError('Yard not found.');

    const slot = await this.repo.createSlot(yardId, input);
    await this.announce('yard_slot', slot.id, 'created');
    return {
      success: true,
      message: 'Slot created.',
      data: {
        id: slot.id,
        yard_id: slot.yardId,
        slot_number: slot.slotNumber,
        position_x: slot.positionX,
        position_y: slot.positionY,
        max_length_m: slot.maxLengthM,
        created_at: slot.createdAt,
        updated_at: slot.updatedAt,
        ...auditFields(
          await this.actorsFor(slot.createdBy, slot.updatedBy),
          slot.createdBy,
          slot.updatedBy
        ),
      },
    };
  }

  /** `PUT /yard-slots/{slotId}` (D-0162) — slot number / position / max length; the slot must belong to one of the caller's yards. */
  /**
   * `DELETE /yard-slots/{slotId}` (D-0169, B4). Refused while a vehicle is checked in, and — a deliberately conservative default, because
   * deleting a slot would also erase its check-in/out history (`yard_slot_events` cascade) — while the slot has any history at all.
   */
  async deleteSlot(slotId: string) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const slot = await this.repo.findSlotById(slotId, context.companyId);
    if (!slot) throw new NotFoundError('Slot not found.');
    if (await this.repo.findOpenEventForSlot(slotId)) {
      throw new ValidationError('This slot has a vehicle checked in. Check it out first.');
    }
    if (await this.repo.slotHasHistory(slotId)) {
      throw new ValidationError("This slot has check-in history and can't be deleted.");
    }
    await this.repo.deleteSlot(slotId);
    await this.announce('yard_slot', slot.id, 'deleted');
    return { success: true, message: 'Slot deleted.' };
  }

  /** `DELETE /yards/{yardId}/layout` (D-0169, B4) — removes the layout image (stored file + row); the slots stay with their relative positions. Idempotent (a yard without a layout is a 200 too). */
  async deleteLayout(yardId: string) {
    const yard = await this.repo.findYardById(yardId);
    if (!yard) throw new NotFoundError('Yard not found.');
    const existing = await this.repo.findLayoutByYardId(yardId);
    if (existing) {
      const key = keyFromUrl(existing.filePath) ?? existing.filePath;
      await deleteObject(key).catch(() => undefined);
      await this.repo.deleteLayoutByYardId(yardId);
      await this.announce('yard', yard.id, 'updated');
    }
    return { success: true, message: 'Layout removed.' };
  }

  async updateSlot(slotId: string, input: UpdateYardSlotInput, expectedUpdatedAt?: Date | null) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const slot = await this.repo.findSlotById(slotId, context.companyId);
    if (!slot) throw new NotFoundError('Slot not found.');
    await assertNotStale(expectedUpdatedAt, slot, this.usersLookup); // D-0176 (B13)
    const updated = await this.repo.updateSlot(slotId, input);
    await this.announce('yard_slot', updated.id, 'updated');
    return {
      success: true,
      message: 'Slot updated.',
      data: this.slotJson(updated, await this.actorsFor(updated.createdBy, updated.updatedBy)),
    };
  }

  // ===========================================================================
  // Check-in / check-out ("the slip concept")
  // ===========================================================================

  /** `YardController::checkIn` — refuses if the slot already has an open stay, or if the vehicle's real `length_m` exceeds the slot's `max_length_m`. */
  async checkIn(slotId: string, vehicleId: string) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    const slot = await this.repo.findSlotById(slotId, context.companyId);
    if (!slot) throw new NotFoundError('Slot not found.');

    const alreadyOccupied = await this.repo.findOpenEventForSlot(slotId);
    if (alreadyOccupied) throw new ValidationError('This slot already has a vehicle checked in.');

    // D-0151 (owner, 2026-09-24): one open yard slot per vehicle — a deliberate deviation from Laravel, which only checked the slot's side.
    const openForVehicle = await this.repo.findOpenEventForVehicle(vehicleId);
    if (openForVehicle) {
      throw new ValidationError(
        `This vehicle is already checked in at slot ${openForVehicle.slotNumber} of ${openForVehicle.yardName}. Check it out first.`
      );
    }

    const vehicle = await this.vehiclesLookup.findVehicleById(vehicleId);
    if (slot.maxLengthM && vehicle?.lengthM && vehicle.lengthM > slot.maxLengthM) {
      throw new ValidationError(
        `This vehicle (${String(vehicle.lengthM)}m) exceeds the slot's maximum length (${String(slot.maxLengthM)}m).`
      );
    }

    const event = await this.repo.createCheckInEvent(slotId, vehicleId);
    await this.announce('yard_slot', slotId, 'checked_in'); // D-0182 (L3)
    return {
      success: true,
      message: 'Checked in.',
      data: {
        id: event.id,
        yard_slot_id: event.yardSlotId,
        vehicle_id: event.vehicleId,
        checked_in_at: event.checkedInAt,
        checked_out_at: event.checkedOutAt,
        source: event.source,
      },
    };
  }

  /** `YardController::checkOut` — closes the open stay. Dwell time is simply `checked_out_at - checked_in_at` once this is set. */
  async checkOut(slotId: string) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    const slot = await this.repo.findSlotById(slotId, context.companyId);
    if (!slot) throw new NotFoundError('Slot not found.');

    const open = await this.repo.findOpenEventForSlot(slotId);
    if (!open) throw new ValidationError('No vehicle is currently checked into this slot.');

    const event = await this.repo.closeEvent(open.id);
    await this.announce('yard_slot', slotId, 'checked_out'); // D-0182 (L3)
    return {
      success: true,
      message: 'Checked out.',
      data: {
        id: event.id,
        yard_slot_id: event.yardSlotId,
        vehicle_id: event.vehicleId,
        checked_in_at: event.checkedInAt,
        checked_out_at: event.checkedOutAt,
        source: event.source,
      },
    };
  }
}
