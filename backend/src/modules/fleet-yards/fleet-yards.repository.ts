import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { circleOverlapsBbox, expandBbox, type Bbox } from '../../platform/http/bbox.js';
import { containsInsensitive, orderByWithTieBreak } from '../../platform/http/list-query.js';
import { toYard, toYardLayout, toYardSlot, toYardSlotEvent } from './fleet-yards.mapper.js';
import type {
  CreateYardInput,
  CreateYardSlotInput,
  UpdateYardInput,
  UpdateYardSlotInput,
  Yard,
  YardLayout,
  YardListQuery,
  YardSlot,
  YardSlotEvent,
} from './fleet-yards.types.js';

/**
 * All Prisma access for module 4.4. `yards` is `company`-ruled
 * (tenant-rules.ts) — list/find/create rely on the default scoping
 * extension via the ambient request context. `yard_layouts`/`yard_slots`
 * are `parent:yards` (no own tenant column), reached only through an
 * already company-scoped `yard_id` this repository's own `findYardById`
 * already verified. `yard_slot_events` is `parent:yard_slots` — two
 * levels deep — `findSlotById` joins through `yard_slots.yards.company_id`
 * directly (Laravel's own `YardSlot::whereHas('yard', fn($q) =>
 * $q->where('company_id', ...))` exactly), since there is no single
 * already-verified parent row one level up the way other modules have.
 */
type YardRowWithCount = Prisma.yardsGetPayload<{
  include: { _count: { select: { yard_slots: true } } };
}>;

export class FleetYardsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Yards
  // ===========================================================================

  /**
   * D-0180 (B8): ids of the company's yards (with coordinates) whose circle overlaps `box`. A yard's radius lives on its earliest
   * linked geofence; a yard with none is a point. The database narrows the centres to the box grown by the widest linked radius,
   * then `circleOverlapsBbox` decides exactly.
   */
  private async yardIdsOverlapping(box: Bbox): Promise<bigint[]> {
    const widest = await this.prisma.geofences.aggregate({
      _max: { radius_m: true },
      where: { yard_id: { not: null } },
    });
    const grown = expandBbox(box, widest._max.radius_m ?? 0);
    const yards = await this.prisma.yards.findMany({
      where: {
        latitude: { gte: grown.minLat, lte: grown.maxLat },
        longitude: { gte: grown.minLng, lte: grown.maxLng },
      },
      select: { id: true, latitude: true, longitude: true },
    });
    if (yards.length === 0) return [];
    const geofences = await this.prisma.geofences.findMany({
      where: { yard_id: { in: yards.map(row => row.id) } },
      select: { yard_id: true, radius_m: true },
      orderBy: { id: 'asc' },
    });
    const radiusOf = new Map<string, number>();
    for (const geofence of geofences) {
      const yardId = geofence.yard_id?.toString();
      if (yardId && !radiusOf.has(yardId)) radiusOf.set(yardId, geofence.radius_m);
    }
    return yards
      .filter(row =>
        circleOverlapsBbox(
          Number(row.latitude),
          Number(row.longitude),
          radiusOf.get(row.id.toString()) ?? 0,
          box
        )
      )
      .map(row => row.id);
  }

  /** D-0162: deactivated yards are left out unless `includeInactive` (assign/dropdown lists). D-0164 (B1): search / filters / sort / optional paging. */
  async listYardsForCompany(
    query: YardListQuery
  ): Promise<{ items: { yard: Yard; slotsCount: number }[]; total: number }> {
    const and: Prisma.yardsWhereInput[] = [];
    // D-0167 (R3): an explicit `is_active` wins over `include_inactive` (`0` = the deactivated yards only)
    if (query.isActive !== undefined) and.push({ is_active: query.isActive });
    else if (!query.includeInactive) and.push({ is_active: true });
    if (query.hasCoordinates !== undefined) {
      and.push(
        query.hasCoordinates
          ? { latitude: { not: null }, longitude: { not: null } }
          : { OR: [{ latitude: null }, { longitude: null }] }
      );
    }
    if (query.hasLayout !== undefined)
      and.push(
        query.hasLayout ? { yard_layouts: { isNot: null } } : { yard_layouts: { is: null } }
      );
    if (query.hasSlots !== undefined)
      and.push(query.hasSlots ? { yard_slots: { some: {} } } : { yard_slots: { none: {} } });
    if (query.minSlots !== undefined && query.minSlots > 0) {
      if (query.minSlots === 1) {
        and.push({ yard_slots: { some: {} } });
      } else {
        // at least N slots: group the slots by yard (a `parent`-ruled table, so unscoped — the company scoping comes from the outer `where`)
        const grouped = await this.prisma.yard_slots.groupBy({
          by: ['yard_id'],
          _count: { _all: true },
          having: { yard_id: { _count: { gte: query.minSlots } } },
        });
        and.push({ id: { in: grouped.map(row => row.yard_id) } });
      }
    }
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ name: term }, { address: term }] });
    }
    if (query.bbox) and.push({ id: { in: await this.yardIdsOverlapping(query.bbox) } });
    const where: Prisma.yardsWhereInput = { AND: and };
    const direction = query.sortOrder ?? 'asc';
    const include = { _count: { select: { yard_slots: true } } } as const;
    const toItems = (rows: YardRowWithCount[]) =>
      rows.map(row => ({ yard: toYard(row), slotsCount: row._count.yard_slots }));

    // D-0167 (R3): `sort_by=radius_m` — the radius lives on the yard's earliest linked geofence (no radius = no linked geofence = last, both directions)
    if (query.sortBy === 'radius_m') {
      const matching = await this.prisma.yards.findMany({ where, select: { id: true } });
      const geofences = await this.prisma.geofences.findMany({
        where: { yard_id: { in: matching.map(row => row.id) } },
        select: { id: true, yard_id: true, radius_m: true },
        orderBy: { id: 'asc' },
      });
      const radiusOf = new Map<string, number>();
      for (const geofence of geofences) {
        const yardId = geofence.yard_id?.toString();
        if (yardId && !radiusOf.has(yardId)) radiusOf.set(yardId, geofence.radius_m);
      }
      const sign = direction === 'asc' ? 1 : -1;
      const ordered = matching
        .map(row => row.id)
        .sort((a, b) => {
          const ra = radiusOf.get(a.toString());
          const rb = radiusOf.get(b.toString());
          if (ra === undefined && rb === undefined) return a < b ? -sign : a > b ? sign : 0;
          if (ra === undefined) return 1;
          if (rb === undefined) return -1;
          return ra !== rb ? (ra - rb) * sign : a < b ? -sign : a > b ? sign : 0;
        });
      const pageIds = query.window
        ? ordered.slice(
            (query.window.page - 1) * query.window.perPage,
            query.window.page * query.window.perPage
          )
        : ordered;
      const rows = await this.prisma.yards.findMany({ where: { id: { in: pageIds } }, include });
      const byId = new Map(rows.map(row => [row.id.toString(), row]));
      const inOrder = pageIds
        .map(id => byId.get(id.toString()))
        .filter((row): row is YardRowWithCount => row !== undefined);
      return { items: toItems(inOrder), total: ordered.length };
    }

    const orderBy: Prisma.yardsOrderByWithRelationInput[] =
      query.sortBy === 'slots_count'
        ? [{ yard_slots: { _count: direction } }, { id: direction }]
        : orderByWithTieBreak(
            query.sortBy,
            query.sortOrder,
            [{ created_at: 'desc' }],
            ['created_at']
          );
    const [rows, total] = await Promise.all([
      this.prisma.yards.findMany({
        where,
        include,
        orderBy,
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : {}),
      }),
      query.window ? this.prisma.yards.count({ where }) : Promise.resolve(0),
    ]);
    return { items: toItems(rows), total: query.window ? total : rows.length };
  }

  async createYard(input: CreateYardInput): Promise<Yard> {
    const row = await this.prisma.yards.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension (D-0077 precedent)
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
    return toYard(row);
  }

  /** D-0162 (`PUT /yards/{id}`) — only the fields that were sent. */
  async updateYard(id: string, input: UpdateYardInput): Promise<Yard | undefined> {
    if (!(await this.findYardById(id))) return undefined;
    const row = await this.prisma.yards.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      },
    });
    return toYard(row);
  }

  async setYardActive(id: string, isActive: boolean): Promise<Yard | undefined> {
    if (!(await this.findYardById(id))) return undefined;
    const row = await this.prisma.yards.update({
      where: { id: BigInt(id) },
      data: { is_active: isActive },
    });
    return toYard(row);
  }

  /** D-0162 deactivate guard: vehicles currently checked in to any slot of this yard (`yard_slot_events` is `parent`-ruled; the yard was already company-verified by the caller). */
  async countOpenStaysInYard(yardId: string): Promise<number> {
    return this.prisma.yard_slot_events.count({
      where: { checked_out_at: null, yard_slots: { yard_id: BigInt(yardId) } },
    });
  }

  /**
   * D-0178 (C14): what still references this yard, as human labels — an EMPTY list means it was never used and may be hard-deleted. Empty slots do
   * not count (they go with the yard); a slot with any check-in / out history does, and so does any trip stop or geofence event.
   */
  async yardUsage(id: string): Promise<string[]> {
    if (!/^\d+$/.test(id)) return [];
    const yardId = BigInt(id);
    const [tripStops, slotHistory, geofenceEvents] = await Promise.all([
      this.prisma.trip_planned_yards.count({ where: { yard_id: yardId } }),
      this.prisma.yard_slot_events.count({ where: { yard_slots: { yard_id: yardId } } }),
      this.prisma.geofence_events.count({ where: { geofences: { yard_id: yardId } } }),
    ]);
    return [
      tripStops > 0 ? 'trip stops' : null,
      slotHistory > 0 ? 'check-in history' : null,
      geofenceEvents > 0 ? 'geofence events' : null,
    ].filter((label): label is string => label !== null);
  }

  /** D-0178 (C14): hard delete — cascades the yard's (empty) slots, layout row and linked geofences at the database level. The caller has verified ownership and that the yard was never used. */
  async deleteYard(id: string): Promise<boolean> {
    if (!(await this.findYardById(id))) return false;
    await this.prisma.yards.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async findYardById(id: string): Promise<Yard | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.yards.findFirst({ where: { id: BigInt(id) } });
    return row ? toYard(row) : undefined;
  }

  // ===========================================================================
  // Layout (replace-on-reupload, same R2 pattern as module 3.1's floor plans)
  // ===========================================================================

  async findLayoutByYardId(yardId: string): Promise<YardLayout | undefined> {
    const row = await this.prisma.yard_layouts.findUnique({ where: { yard_id: BigInt(yardId) } });
    return row ? toYardLayout(row) : undefined;
  }

  async upsertLayout(
    yardId: string,
    data: { filePath: string; widthPx: number; heightPx: number }
  ): Promise<YardLayout> {
    const row = await this.prisma.yard_layouts.upsert({
      where: { yard_id: BigInt(yardId) },
      create: {
        yard_id: BigInt(yardId),
        file_path: data.filePath,
        width_px: data.widthPx,
        height_px: data.heightPx,
      },
      update: { file_path: data.filePath, width_px: data.widthPx, height_px: data.heightPx },
    });
    return toYardLayout(row);
  }

  // ===========================================================================
  // Slots
  // ===========================================================================

  async createSlot(yardId: string, input: CreateYardSlotInput): Promise<YardSlot> {
    const row = await this.prisma.yard_slots.create({
      data: {
        yard_id: BigInt(yardId),
        slot_number: input.slotNumber,
        position_x: input.positionX,
        position_y: input.positionY,
        max_length_m: input.maxLengthM,
      },
    });
    return toYardSlot(row);
  }

  /** D-0162 (`PUT /yard-slots/{slotId}`) — only the fields that were sent; the caller verified the slot's company via `findSlotById`. */
  async updateSlot(slotId: string, input: UpdateYardSlotInput): Promise<YardSlot> {
    const row = await this.prisma.yard_slots.update({
      where: { id: BigInt(slotId) },
      data: {
        ...(input.slotNumber !== undefined ? { slot_number: input.slotNumber } : {}),
        ...(input.positionX !== undefined ? { position_x: input.positionX } : {}),
        ...(input.positionY !== undefined ? { position_y: input.positionY } : {}),
        ...(input.maxLengthM !== undefined ? { max_length_m: input.maxLengthM } : {}),
      },
    });
    return toYardSlot(row);
  }

  /** D-0169 (B4): does the slot have any check-in/out history? (Deleting a slot cascades its `yard_slot_events`, so a slot with history is refused.) */
  async slotHasHistory(slotId: string): Promise<boolean> {
    return (
      (await this.prisma.yard_slot_events.count({ where: { yard_slot_id: BigInt(slotId) } })) > 0
    );
  }

  async deleteSlot(slotId: string): Promise<void> {
    await this.prisma.yard_slots.delete({ where: { id: BigInt(slotId) } });
  }

  /** D-0169 (B4): removes the yard's layout row (the slots keep their relative positions). */
  async deleteLayoutByYardId(yardId: string): Promise<void> {
    await this.prisma.yard_layouts.deleteMany({ where: { yard_id: BigInt(yardId) } });
  }

  async listSlotsForYard(yardId: string): Promise<YardSlot[]> {
    const rows = await this.prisma.yard_slots.findMany({ where: { yard_id: BigInt(yardId) } });
    return rows.map(toYardSlot);
  }

  /** `YardSlot::whereHas('yard', fn($q) => $q->where('company_id', ...))->find($slotId)` — the two-level join this table needs since it has no own tenant column and no single already-verified parent row (`checkIn`/`checkOut` are reached directly by slot id, not through a yard route param). */
  async findSlotById(slotId: string, companyId: string): Promise<YardSlot | undefined> {
    if (!/^\d+$/.test(slotId)) return undefined;
    const row = await this.prisma.yard_slots.findFirst({
      where: { id: BigInt(slotId), yards: { company_id: BigInt(companyId) } },
    });
    return row ? toYardSlot(row) : undefined;
  }

  // ===========================================================================
  // Slot events ("the slip concept" — check-in/check-out)
  // ===========================================================================

  async findOpenEventForSlot(slotId: string): Promise<YardSlotEvent | undefined> {
    const row = await this.prisma.yard_slot_events.findFirst({
      where: { yard_slot_id: BigInt(slotId), checked_out_at: null },
    });
    return row ? toYardSlotEvent(row) : undefined;
  }

  /** `currentEvent` — `YardSlot::hasOne(YardSlotEvent)->whereNull('checked_out_at')->latestOfMany('checked_in_at')`. There is only ever one open event per slot in practice (enforced at check-in time by `findOpenEventForSlot`'s own guard), so this is the same query as `findOpenEventForSlot`, ordered defensively. */
  async currentEventsForSlots(slotIds: string[]): Promise<Map<string, YardSlotEvent>> {
    if (slotIds.length === 0) return new Map();
    const rows = await this.prisma.yard_slot_events.findMany({
      where: { yard_slot_id: { in: slotIds.map(id => BigInt(id)) }, checked_out_at: null },
      orderBy: { checked_in_at: 'desc' },
    });
    const result = new Map<string, YardSlotEvent>();
    for (const row of rows) {
      const event = toYardSlotEvent(row);
      if (!result.has(event.yardSlotId)) result.set(event.yardSlotId, event);
    }
    return result;
  }

  /** `VehicleController::show`'s `yard_history` — `YardSlotEvent::where('vehicle_id')->with('slot:id,yard_id,slot_number','slot.yard:id,name')->orderByDesc('checked_in_at')->limit(20)`. The caller has already verified the vehicle belongs to the caller's company (this table is `parent`-ruled, no tenant column of its own). */
  async recentEventsForVehicle(
    vehicleId: string,
    limit: number
  ): Promise<
    {
      event: YardSlotEvent;
      slot: {
        id: string;
        yardId: string;
        slotNumber: string;
        yard: { id: string; name: string } | null;
      } | null;
    }[]
  > {
    const rows = await this.prisma.yard_slot_events.findMany({
      where: { vehicle_id: BigInt(vehicleId) },
      include: { yard_slots: { include: { yards: { select: { id: true, name: true } } } } },
      orderBy: { checked_in_at: 'desc' },
      take: limit,
    });
    return rows.map(row => ({
      event: toYardSlotEvent(row),
      slot: {
        id: row.yard_slots.id.toString(),
        yardId: row.yard_slots.yard_id.toString(),
        slotNumber: row.yard_slots.slot_number,
        yard: { id: row.yard_slots.yards.id.toString(), name: row.yard_slots.yards.name },
      },
    }));
  }

  /** D-0170 (B9): the vehicle's yard events, filtered / sorted / paged — same rows and shape as `recentEventsForVehicle`, with `total` before paging. The caller verified the vehicle. */
  async pagedEventsForVehicle(
    vehicleId: string,
    query: {
      dateFrom?: Date | undefined;
      dateTo?: Date | undefined;
      yardId?: string | undefined;
      open?: boolean | undefined;
      search?: string | undefined;
      sortBy?: 'checked_in_at' | 'checked_out_at' | undefined;
      sortOrder?: 'asc' | 'desc' | undefined;
      window: { page: number; perPage: number };
    }
  ): Promise<{
    items: {
      event: YardSlotEvent;
      slot: {
        id: string;
        yardId: string;
        slotNumber: string;
        yard: { id: string; name: string } | null;
      } | null;
    }[];
    total: number;
  }> {
    const and: Prisma.yard_slot_eventsWhereInput[] = [{ vehicle_id: BigInt(vehicleId) }];
    if (query.dateFrom) and.push({ checked_in_at: { gte: query.dateFrom } });
    if (query.dateTo) and.push({ checked_in_at: { lte: query.dateTo } });
    if (query.yardId !== undefined) and.push({ yard_slots: { yard_id: BigInt(query.yardId) } });
    if (query.open !== undefined) and.push({ checked_out_at: query.open ? null : { not: null } });
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({
        OR: [{ yard_slots: { slot_number: term } }, { yard_slots: { yards: { name: term } } }],
      });
    }
    const where: Prisma.yard_slot_eventsWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ checked_in_at: 'desc' }],
      ['checked_out_at']
    );
    const [rows, total] = await Promise.all([
      this.prisma.yard_slot_events.findMany({
        where,
        include: { yard_slots: { include: { yards: { select: { id: true, name: true } } } } },
        orderBy,
        skip: (query.window.page - 1) * query.window.perPage,
        take: query.window.perPage,
      }),
      this.prisma.yard_slot_events.count({ where }),
    ]);
    return {
      items: rows.map(row => ({
        event: toYardSlotEvent(row),
        slot: {
          id: row.yard_slots.id.toString(),
          yardId: row.yard_slots.yard_id.toString(),
          slotNumber: row.yard_slots.slot_number,
          yard: { id: row.yard_slots.yards.id.toString(), name: row.yard_slots.yards.name },
        },
      })),
      total,
    };
  }

  /** The vehicle's open stay anywhere (D-0151: one open yard slot per vehicle), with the slot number and yard name for the 422 message. `yard_slot_events` is `parent`-ruled; `vehicle_id` alone is safe here because the caller has already verified the slot (and its company) being checked into. */
  /** D-0182 (L4): is the vehicle checked in at a slot right now? */
  async vehicleHasOpenStay(vehicleId: string): Promise<boolean> {
    return (await this.findOpenEventForVehicle(vehicleId)) !== undefined;
  }

  async findOpenEventForVehicle(
    vehicleId: string
  ): Promise<{ event: YardSlotEvent; slotNumber: string; yardName: string } | undefined> {
    if (!/^\d+$/.test(vehicleId)) return undefined;
    const row = await this.prisma.yard_slot_events.findFirst({
      where: { vehicle_id: BigInt(vehicleId), checked_out_at: null },
      include: { yard_slots: { include: { yards: { select: { name: true } } } } },
      orderBy: { checked_in_at: 'desc' },
    });
    return row
      ? {
          event: toYardSlotEvent(row),
          slotNumber: row.yard_slots.slot_number,
          yardName: row.yard_slots.yards.name,
        }
      : undefined;
  }

  async createCheckInEvent(slotId: string, vehicleId: string): Promise<YardSlotEvent> {
    const row = await this.prisma.yard_slot_events.create({
      data: {
        yard_slot_id: BigInt(slotId),
        vehicle_id: BigInt(vehicleId),
        checked_in_at: new Date(),
        source: 'manual',
      },
    });
    return toYardSlotEvent(row);
  }

  async closeEvent(eventId: string): Promise<YardSlotEvent> {
    const row = await this.prisma.yard_slot_events.update({
      where: { id: BigInt(eventId) },
      data: { checked_out_at: new Date() },
    });
    return toYardSlotEvent(row);
  }
}
