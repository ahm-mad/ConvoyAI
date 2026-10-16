import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { containsInsensitive, orderByWithTieBreak } from '../../platform/http/list-query.js';
import { circleOverlapsBbox, expandBbox, type Bbox } from '../../platform/http/bbox.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toGeofence, toGeofenceEvent } from './fleet-geofences.mapper.js';
import type {
  CreateGeofenceInput,
  Geofence,
  GeofenceEvent,
  GeofenceEventListQuery,
  GeofenceEventWithAlertOn,
  GeofenceListQuery,
  UpdateGeofenceInput,
  YardBrief,
} from './fleet-geofences.types.js';

/**
 * All Prisma access for module 4.3. `geofences` is `company`-ruled
 * (tenant-rules.ts) — list/find/create/update rely on the default scoping
 * extension via the ambient request context, same discipline as module
 * 4.2's `trips`. `geofence_events` is `parent`-ruled (no own tenant
 * column) — reached only through an already company-scoped `geofence_id`
 * (`findGeofenceById`) for the CRUD/events-read side, same discipline as
 * `trip_planned_yards`; the detection side (`checkPosition`, called from
 * ingestion's no-request-context worker path) reads/writes it directly by
 * id, matching `vehicle_device_assignments`'s own unscoped-by-design
 * discipline there. `yards` is already `company`-ruled and registered by
 * module 4.2 — reused here read-only for `store()`'s "create from an
 * existing yard" convenience, same pattern as that module's own
 * `findYardBrief`.
 */
export class FleetGeofencesRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Geofences (company-scoped CRUD)
  // ===========================================================================

  /** D-0164 (B1): search / filters / sort / optional paging (default order stays newest first). */
  async listGeofencesForCompany(
    query: GeofenceListQuery
  ): Promise<{ items: Geofence[]; total: number }> {
    const and: Prisma.geofencesWhereInput[] = [];
    if (query.isActive !== undefined) and.push({ is_active: query.isActive });
    if (query.yardId !== undefined) and.push({ yard_id: BigInt(query.yardId) });
    if (query.linked !== undefined) and.push({ yard_id: query.linked ? { not: null } : null });
    if (query.alertOn) and.push({ alert_on: query.alertOn });
    if (query.search) and.push({ name: containsInsensitive(query.search) });
    if (query.bbox) and.push({ id: { in: await this.geofenceIdsOverlapping(query.bbox) } });
    const where: Prisma.geofencesWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ created_at: 'desc' }],
      ['created_at']
    ) as Prisma.geofencesOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.geofences.findMany({
        where,
        orderBy,
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : {}),
      }),
      query.window ? this.prisma.geofences.count({ where }) : Promise.resolve(0),
    ]);
    return { items: rows.map(toGeofence), total: query.window ? total : rows.length };
  }

  /**
   * D-0180 (B8): ids of the company's geofences whose circle overlaps `box`. The database narrows the centres to the box grown by
   * the company's largest radius (one aggregate), then `circleOverlapsBbox` decides exactly — same id-list pattern as `min_slots`.
   */
  private async geofenceIdsOverlapping(box: Bbox): Promise<bigint[]> {
    const widest = await this.prisma.geofences.aggregate({ _max: { radius_m: true } });
    const grown = expandBbox(box, widest._max.radius_m ?? 0);
    const rows = await this.prisma.geofences.findMany({
      where: {
        center_latitude: { gte: grown.minLat, lte: grown.maxLat },
        center_longitude: { gte: grown.minLng, lte: grown.maxLng },
      },
      select: { id: true, center_latitude: true, center_longitude: true, radius_m: true },
    });
    return rows
      .filter(row =>
        circleOverlapsBbox(
          Number(row.center_latitude),
          Number(row.center_longitude),
          row.radius_m,
          box
        )
      )
      .map(row => row.id);
  }

  async createGeofence(input: CreateGeofenceInput): Promise<Geofence> {
    const row = await this.prisma.geofences.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension (D-0077/D-0078 precedent)
        yard_id: input.yardId ? BigInt(input.yardId) : null,
        name: input.name,
        // required NOT NULL columns — always non-null here, the service
        // already 422s before calling this when neither is resolvable.
        center_latitude: input.centerLatitude as number,
        center_longitude: input.centerLongitude as number,
        radius_m: input.radiusM,
        alert_on: input.alertOn,
        is_active: true,
      },
    });
    return toGeofence(row);
  }

  async findGeofenceById(id: string): Promise<Geofence | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.geofences.findFirst({ where: { id: BigInt(id) } });
    return row ? toGeofence(row) : undefined;
  }

  async updateGeofence(id: string, data: UpdateGeofenceInput): Promise<Geofence | undefined> {
    if (!(await this.findGeofenceById(id))) return undefined;
    const row = await this.prisma.geofences.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.radiusM !== undefined ? { radius_m: data.radiusM } : {}),
        ...(data.alertOn !== undefined ? { alert_on: data.alertOn } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
        ...(data.centerLatitude !== undefined && data.centerLongitude !== undefined
          ? { center_latitude: data.centerLatitude, center_longitude: data.centerLongitude }
          : {}),
      },
    });
    return toGeofence(row);
  }

  // ===========================================================================
  // Yard-linked geofences (D-0162 — `YardsGeofencesLookup`, used by module 4.4)
  // ===========================================================================

  async linkedGeofencesForYards(
    yardIds: string[]
  ): Promise<Map<string, { id: string; radiusM: number }>> {
    const ids = yardIds.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    const result = new Map<string, { id: string; radiusM: number }>();
    if (ids.length === 0) return result;
    const rows = await this.prisma.geofences.findMany({
      where: { yard_id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    for (const row of rows) {
      const yardId = row.yard_id?.toString();
      if (yardId && !result.has(yardId))
        result.set(yardId, { id: row.id.toString(), radiusM: row.radius_m });
    }
    return result;
  }

  async createYardGeofence(input: {
    yardId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusM: number;
  }): Promise<{ id: string; radiusM: number }> {
    const created = await this.createGeofence({
      name: input.name,
      yardId: input.yardId,
      centerLatitude: input.latitude,
      centerLongitude: input.longitude,
      radiusM: input.radiusM,
      alertOn: 'both',
    });
    return { id: created.id, radiusM: created.radiusM };
  }

  async setYardGeofencesActive(yardId: string, isActive: boolean): Promise<string[]> {
    if (!/^\d+$/.test(yardId)) return [];
    const rows = await this.prisma.geofences.findMany({
      where: { yard_id: BigInt(yardId), is_active: !isActive },
      select: { id: true },
    });
    for (const row of rows)
      await this.updateGeofence(row.id.toString(), {
        name: undefined,
        radiusM: undefined,
        alertOn: undefined,
        isActive,
      });
    return rows.map(row => row.id.toString());
  }

  async updateYardGeofence(
    id: string,
    input: { latitude?: number; longitude?: number; radiusM?: number }
  ): Promise<void> {
    await this.updateGeofence(id, {
      name: undefined,
      radiusM: input.radiusM,
      alertOn: undefined,
      isActive: undefined,
      centerLatitude: input.latitude,
      centerLongitude: input.longitude,
    });
  }

  /** Real FK `ON DELETE CASCADE` (`geofence_events.geofence_id -> geofences.id`, `prisma/schema.prisma`) removes this geofence's events automatically — no manual cascade code, same discipline as module 3.1's D-0076 verification. */
  async deleteGeofence(id: string): Promise<boolean> {
    if (!(await this.findGeofenceById(id))) return false;
    await this.prisma.geofences.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async findYardBrief(id: string): Promise<YardBrief | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.yards.findFirst({ where: { id: BigInt(id) } });
    if (!row) return undefined;
    return {
      id: row.id.toString(),
      name: row.name,
      address: row.address,
      latitude: row.latitude !== null ? Number(row.latitude) : null,
      longitude: row.longitude !== null ? Number(row.longitude) : null,
    };
  }

  // ===========================================================================
  // Events (company-scoped read, `alert_on`-filtered at read time — D-0079)
  // ===========================================================================

  /**
   * `GeofenceController::events()` equivalent. Scoped by joining through
   * `geofence_events.geofences.company_id` (Laravel's own
   * `whereHas('geofence', fn($q) => $q->where('company_id', ...))`
   * exactly), since `geofence_events` itself has no tenant column.
   *
   * D-0164 (B1): the geofence's *current* `alert_on` filter (an event is shown when `alert_on` is `both` or equals its `event_type`) is now
   * part of the SQL `where` — as three explicit branches, since Prisma cannot compare two columns — so `limit`/paging apply to the
   * already-filtered rows (before, the filter ran in memory after `take: limit`, so `limit=20` returned fewer than 20 and paging was impossible).
   * `occurred_at` alone isn't a deterministic sort key — the column is `TIMESTAMP(0)` (whole-second precision, `schema.sql`), so two real
   * transitions within the same second sort arbitrarily on that column alone; `id` (insertion order) breaks the tie, same fix module 2.3
   * applied to `device_values`'s analogous "latest" ordering.
   */
  async listRecentEventsForCompany(
    companyId: string,
    query: GeofenceEventListQuery
  ): Promise<{ items: GeofenceEventWithAlertOn[]; total: number }> {
    const and: Prisma.geofence_eventsWhereInput[] = [
      { geofences: { company_id: BigInt(companyId) } },
      {
        OR: [
          { geofences: { alert_on: 'both' } },
          { event_type: 'enter', geofences: { alert_on: 'enter' } },
          { event_type: 'exit', geofences: { alert_on: 'exit' } },
        ],
      },
    ];
    if (query.geofenceId !== undefined) and.push({ geofence_id: BigInt(query.geofenceId) });
    if (query.vehicleId !== undefined) and.push({ vehicle_id: BigInt(query.vehicleId) });
    if (query.tripId !== undefined) and.push({ trip_id: BigInt(query.tripId) });
    if (query.eventType) and.push({ event_type: query.eventType });
    if (query.from) and.push({ occurred_at: { gte: query.from } });
    if (query.to) and.push({ occurred_at: { lte: query.to } });
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ geofences: { name: term } }, { vehicles: { name: term } }] });
    }
    const where: Prisma.geofence_eventsWhereInput = { AND: and };
    const direction = query.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.geofence_events.findMany({
        where,
        include: { geofences: { select: { alert_on: true, name: true, yard_id: true } } },
        orderBy: [{ occurred_at: direction }, { id: direction }],
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : { take: query.limit }),
      }),
      query.window ? this.prisma.geofence_events.count({ where }) : Promise.resolve(0),
    ]);
    return {
      items: rows.map(row => ({
        ...toGeofenceEvent(row),
        geofenceAlertOn: row.geofences.alert_on,
        geofenceName: row.geofences.name,
        geofenceYardId: row.geofences.yard_id?.toString() ?? null,
      })),
      total: query.window ? total : rows.length,
    };
  }

  // ===========================================================================
  // Detection (called from ingestion's no-request-context worker path)
  // ===========================================================================

  /** `Geofence::where('company_id', ...)->where('is_active', true)->get()` — `runAsSystemAsync` since ingestion has no request context to scope by (same escape hatch as `ProductsRepository.findByIdUnscoped`, D-0053's precedent); `companyId` is applied by hand instead. */
  async listActiveGeofencesForCompanyUnscoped(companyId: string): Promise<Geofence[]> {
    return runAsSystemAsync(async () => {
      const rows = await this.prisma.geofences.findMany({
        where: { company_id: BigInt(companyId), is_active: true },
      });
      return rows.map(toGeofence);
    });
  }

  /**
   * `GeofenceEvent::where('geofence_id', ...)->where('vehicle_id', ...)->orderByDesc('occurred_at')->first()`
   * — unscoped, `geofence_events` is `parent`-ruled. `id` breaks ties on
   * `occurred_at`'s whole-second precision — this is the exact query
   * 11.35's state derivation depends on being correct, so an
   * indeterminate tie here would silently reintroduce a state-derivation
   * bug of its own (found live against real Postgres while testing this
   * module: two transitions within the same second sorted unpredictably
   * without the `id` tiebreaker).
   */
  async findLastEventForPair(
    geofenceId: string,
    vehicleId: string
  ): Promise<GeofenceEvent | undefined> {
    const row = await this.prisma.geofence_events.findFirst({
      where: { geofence_id: BigInt(geofenceId), vehicle_id: BigInt(vehicleId) },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
    });
    return row ? toGeofenceEvent(row) : undefined;
  }

  /**
   * Always writes the real transition regardless of `alert_on` (D-0079 —
   * fixing 11.35 within the frozen schema's constraints: there is no
   * separate last-known-state column, so state derivation's source of
   * truth — this table — must hold the *complete* unfiltered history, per
   * `geofence-detection.md` §2.3's own second prescribed fix option).
   * `alert_on` filtering moves to `listRecentEventsForCompany`'s read side
   * instead of gating this write, which is what actually broke the state
   * machine in Laravel.
   *
   * D-0156 (fleet step 5): the ingestion worker runs with concurrency 6, so two packets of one device can both read
   * "no prior event" and both write `enter` — which the trip bridge would turn into two stops arrived. The write is
   * therefore serialised per (geofence, vehicle) with a transaction-scoped advisory lock and **re-checks the state
   * machine under the lock**: `enter` is only written when the last event isn't already `enter`, `exit` only when it
   * is. Returns `undefined` when a concurrent packet already made that transition (the caller then skips the bridge).
   */
  async createGeofenceEvent(
    geofenceId: string,
    vehicleId: string,
    eventType: 'enter' | 'exit',
    tripId: string | null = null
  ): Promise<GeofenceEvent | undefined> {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`geofence-event:${geofenceId}:${vehicleId}`}, 0))`;
      const last = await tx.geofence_events.findFirst({
        where: { geofence_id: BigInt(geofenceId), vehicle_id: BigInt(vehicleId) },
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      });
      const wasInside = last?.event_type === 'enter';
      if ((eventType === 'enter') === wasInside) return undefined;

      const row = await tx.geofence_events.create({
        data: {
          geofence_id: BigInt(geofenceId),
          vehicle_id: BigInt(vehicleId),
          event_type: eventType,
          occurred_at: new Date(),
          trip_id: tripId ? BigInt(tripId) : null,
        },
      });
      return toGeofenceEvent(row);
    });
  }

  /**
   * D-0156 (`TripsGeofencesLookup`, used by `startTrip`'s seed): of `yardIds`, the yards whose active geofence currently
   * contains the vehicle — i.e. the last event for (geofence, vehicle) is an `enter`. Company-scoped by the ambient
   * request context (trip start is a request).
   */
  async yardIdsVehicleIsInside(vehicleId: string, yardIds: string[]): Promise<string[]> {
    const ids = yardIds.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    if (ids.length === 0) return [];
    const geofences = await this.prisma.geofences.findMany({
      where: { yard_id: { in: ids }, is_active: true },
    });
    const inside = new Set<string>();
    for (const geofence of geofences) {
      const last = await this.findLastEventForPair(geofence.id.toString(), vehicleId);
      if (last?.eventType === 'enter' && geofence.yard_id !== null)
        inside.add(geofence.yard_id.toString());
    }
    return [...inside];
  }
}
