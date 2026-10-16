import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { containsInsensitive, orderByWithTieBreak } from '../../platform/http/list-query.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toTrip, toTripPlannedYard, toTripStopEvent } from './fleet-trips.mapper.js';
import type {
  CreatePlannedYardInput,
  EditPlannedYardInput,
  DevicePositionPoint,
  FleetCustomerBrief,
  ListTripsQuery,
  RecordStopEventInput,
  Trip,
  TripPlannedYard,
  TripStopEvent,
  YardBrief,
} from './fleet-trips.types.js';

/**
 * All Prisma access for module 4.2. `trips` is `company`-ruled
 * (tenant-rules.ts) — list/find/create/update rely on the default scoping
 * extension via the ambient request context. `trip_planned_yards` is
 * `parent`-ruled (no own tenant column), reached only through an already
 * company-scoped `trip_id` this repository's own `findTripById` already
 * verified — same discipline as module 4.1's `vehicle_device_assignments`.
 * `yards`/`fleet_customers` are also `company`-ruled and registered here
 * (module 4.4/4.7 don't exist yet) purely for this module's own narrow,
 * read-only needs — a company-scoped `findFirst` returning `undefined` for
 * another company's row doubles as both the existence check (tightening
 * Laravel's bare `exists:yards,id`/`exists:fleet_customers,id`, D-0077's
 * class of finding) and the display-brief lookup, no separate methods
 * needed for each.
 */
export class FleetTripsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Trips
  // ===========================================================================

  /** The trip list's `where`. `forCounts` (D-0179, B7) ignores `status` so every status chip has its true count. */
  private tripWhere(
    query: Omit<ListTripsQuery, 'page' | 'perPage'>,
    forCounts = false
  ): Prisma.tripsWhereInput {
    const where: Prisma.tripsWhereInput = {
      ...(query.status && !forCounts ? { status: { in: query.status } } : {}),
      ...(query.vehicleId ? { vehicle_id: BigInt(query.vehicleId) } : {}),
      ...(query.driverId ? { driver_id: BigInt(query.driverId) } : {}),
      ...(query.customerId ? { fleet_customer_id: BigInt(query.customerId) } : {}),
    };
    if (query.dateFrom) {
      where.OR = [
        { actual_start_at: { gte: new Date(query.dateFrom) } },
        { planned_start_at: { gte: new Date(query.dateFrom) } },
      ];
    }
    if (query.dateTo) {
      const dateTo: Prisma.tripsWhereInput = {
        OR: [
          { actual_start_at: { lte: new Date(query.dateTo) } },
          { planned_start_at: { lte: new Date(query.dateTo) } },
        ],
      };
      where.AND = where.AND
        ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), dateTo]
        : [dateTo];
    }

    if (query.search) {
      const term = containsInsensitive(query.search);
      const search: Prisma.tripsWhereInput = {
        OR: [
          { trip_reference: term },
          { origin_address: term },
          { destination_address: term },
          { purpose: term },
          { vehicles: { OR: [{ name: term }, { plate: term }] } },
          { drivers: { OR: [{ first_name: term }, { last_name: term }] } },
        ],
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        search,
      ];
    }
    return where;
  }

  async listTrips(query: ListTripsQuery): Promise<{ items: Trip[]; total: number }> {
    const where = this.tripWhere(query);
    // D-0164: `sort_by` (default stays newest-created first); `id` breaks ties so paging never duplicates/drops rows (D-0147).
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ created_at: 'desc' }],
      ['planned_start_at', 'created_at', 'trip_reference']
    ) as Prisma.tripsOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.trips.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.trips.count({ where }),
    ]);
    return { items: rows.map(toTrip), total };
  }

  /** D-0179 (B7): trips per `status` under the list's filters and search (`status` ignored). */
  async tripStatusCounts(
    query: Omit<ListTripsQuery, 'page' | 'perPage'>
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.trips.groupBy({
      by: ['status'],
      where: this.tripWhere(query, true),
      _count: { _all: true },
    });
    return rows.map(row => ({ status: row.status, count: row._count._all }));
  }

  async createTrip(input: {
    vehicleId: string;
    driverId: string;
    deviceId: string | null;
    fleetCustomerId: string | null;
    tripReference: string;
    purpose: string | null;
    originAddress: string | null;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationAddress: string | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    plannedDistanceKm: number | null;
    odometerStartKm: number | null;
    notes: string | null;
    createdBy: string;
  }): Promise<Trip> {
    const row = await this.prisma.trips.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension (D-0077 precedent)
        vehicle_id: BigInt(input.vehicleId),
        driver_id: BigInt(input.driverId),
        device_id: input.deviceId ? BigInt(input.deviceId) : null,
        fleet_customer_id: input.fleetCustomerId ? BigInt(input.fleetCustomerId) : null,
        trip_reference: input.tripReference,
        purpose: input.purpose,
        status: 'planned',
        origin_address: input.originAddress,
        origin_latitude: input.originLatitude,
        origin_longitude: input.originLongitude,
        destination_address: input.destinationAddress,
        destination_latitude: input.destinationLatitude,
        destination_longitude: input.destinationLongitude,
        planned_start_at: input.plannedStartAt,
        planned_end_at: input.plannedEndAt,
        planned_distance_km: input.plannedDistanceKm,
        odometer_start_km: input.odometerStartKm,
        notes: input.notes,
        created_by: BigInt(input.createdBy),
      },
    });
    return toTrip(row);
  }

  async findTripById(id: string): Promise<Trip | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.trips.findFirst({ where: { id: BigInt(id) } });
    return row ? toTrip(row) : undefined;
  }

  async updateTrip(
    id: string,
    data: {
      fleetCustomerId?: string | null | undefined;
      tripReference?: string | null | undefined;
      purpose?: string | null | undefined;
      originAddress?: string | null | undefined;
      originLatitude?: number | null | undefined;
      originLongitude?: number | null | undefined;
      destinationAddress?: string | null | undefined;
      destinationLatitude?: number | null | undefined;
      destinationLongitude?: number | null | undefined;
      plannedStartAt?: Date | null | undefined;
      plannedEndAt?: Date | null | undefined;
      plannedDistanceKm?: number | null | undefined;
      odometerStartKm?: number | null | undefined;
      fuelUsedLiters?: number | null | undefined;
      notes?: string | null | undefined;
      status?: 'planned' | 'in_progress' | 'completed' | 'cancelled' | undefined;
      actualStartAt?: Date | undefined;
      actualEndAt?: Date | undefined;
      actualDistanceKm?: number | null | undefined;
      actualDurationMinutes?: number | null | undefined;
      odometerEndKm?: number | null | undefined;
      cancellationReason?: string | null | undefined;
      deviceId?: string | null | undefined;
    }
  ): Promise<Trip | undefined> {
    if (!(await this.findTripById(id))) return undefined;
    const row = await this.prisma.trips.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.fleetCustomerId !== undefined
          ? { fleet_customer_id: data.fleetCustomerId ? BigInt(data.fleetCustomerId) : null }
          : {}),
        ...(data.tripReference !== undefined ? { trip_reference: data.tripReference } : {}),
        ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
        ...(data.originAddress !== undefined ? { origin_address: data.originAddress } : {}),
        ...(data.originLatitude !== undefined ? { origin_latitude: data.originLatitude } : {}),
        ...(data.originLongitude !== undefined ? { origin_longitude: data.originLongitude } : {}),
        ...(data.destinationAddress !== undefined
          ? { destination_address: data.destinationAddress }
          : {}),
        ...(data.destinationLatitude !== undefined
          ? { destination_latitude: data.destinationLatitude }
          : {}),
        ...(data.destinationLongitude !== undefined
          ? { destination_longitude: data.destinationLongitude }
          : {}),
        ...(data.plannedStartAt !== undefined ? { planned_start_at: data.plannedStartAt } : {}),
        ...(data.plannedEndAt !== undefined ? { planned_end_at: data.plannedEndAt } : {}),
        ...(data.plannedDistanceKm !== undefined
          ? { planned_distance_km: data.plannedDistanceKm }
          : {}),
        ...(data.odometerStartKm !== undefined ? { odometer_start_km: data.odometerStartKm } : {}),
        ...(data.fuelUsedLiters !== undefined ? { fuel_used_liters: data.fuelUsedLiters } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.actualStartAt !== undefined ? { actual_start_at: data.actualStartAt } : {}),
        ...(data.actualEndAt !== undefined ? { actual_end_at: data.actualEndAt } : {}),
        ...(data.actualDistanceKm !== undefined
          ? { actual_distance_km: data.actualDistanceKm }
          : {}),
        ...(data.actualDurationMinutes !== undefined
          ? { actual_duration_minutes: data.actualDurationMinutes }
          : {}),
        ...(data.odometerEndKm !== undefined ? { odometer_end_km: data.odometerEndKm } : {}),
        ...(data.cancellationReason !== undefined
          ? { cancellation_reason: data.cancellationReason }
          : {}),
        ...(data.deviceId !== undefined
          ? { device_id: data.deviceId ? BigInt(data.deviceId) : null }
          : {}),
      },
    });
    return toTrip(row);
  }

  /** D-0156 (sensor bridge, ingestion worker — no request context, hence `runAsSystemAsync` + the explicit company filter): the vehicle's `in_progress` trip. */
  async findInProgressTripForVehicleUnscoped(
    companyId: string,
    vehicleId: string
  ): Promise<Trip | undefined> {
    return runAsSystemAsync(async () => {
      const row = await this.prisma.trips.findFirst({
        where: {
          company_id: BigInt(companyId),
          vehicle_id: BigInt(vehicleId),
          status: 'in_progress',
        },
        orderBy: { id: 'desc' },
      });
      return row ? toTrip(row) : undefined;
    });
  }

  /** D-0156: sets `destination_reached_at` only if it is still empty (never cleared, never moved) — safe under concurrent packets. Returns whether this call set it. */
  async setDestinationReachedIfUnset(tripId: string, at: Date): Promise<boolean> {
    return runAsSystemAsync(async () => {
      const result = await this.prisma.trips.updateMany({
        where: { id: BigInt(tripId), destination_reached_at: null },
        data: { destination_reached_at: at },
      });
      return result.count > 0;
    });
  }

  /** D-0162: `DELETE /trips/{id}` — the planned stops go with it (FK `ON DELETE CASCADE`), geofence events keep their rows with `trip_id` NULL (FK `SET NULL`). */
  async deleteTrip(id: string): Promise<boolean> {
    if (!(await this.findTripById(id))) return false;
    await this.prisma.trips.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async vehicleHasActiveTrip(
    vehicleId: string,
    excludeTripId: string | undefined
  ): Promise<boolean> {
    const count = await this.prisma.trips.count({
      where: {
        vehicle_id: BigInt(vehicleId),
        status: 'in_progress',
        ...(excludeTripId ? { id: { not: BigInt(excludeTripId) } } : {}),
      },
    });
    return count > 0;
  }

  /** D-0182 (L4): true while the vehicle has any `planned` trip. */
  async vehicleHasPlannedTrip(vehicleId: string): Promise<boolean> {
    const count = await this.prisma.trips.count({
      where: { vehicle_id: BigInt(vehicleId), status: 'planned' },
    });
    return count > 0;
  }

  /** `TripService::generateReference` — company-scoped sequential count, same ambient-context reliance as the rest of this repository. */
  async countTripsForCompany(): Promise<number> {
    return this.prisma.trips.count({});
  }

  // ===========================================================================
  // Planned yards
  // ===========================================================================

  async createPlannedYards(
    tripId: string,
    yards: CreatePlannedYardInput[]
  ): Promise<TripPlannedYard[]> {
    const created: TripPlannedYard[] = [];
    for (const [index, yard] of yards.entries()) {
      const row = await this.prisma.trip_planned_yards.create({
        data: {
          trip_id: BigInt(tripId),
          yard_id: BigInt(yard.yardId),
          sequence: index + 1,
          stop_purpose: yard.stopPurpose,
          planned_arrival_at: yard.plannedArrivalAt,
          planned_departure_at: yard.plannedDepartureAt,
          notes: yard.notes,
        },
      });
      created.push(toTripPlannedYard(row));
    }
    return created;
  }

  /**
   * D-0175 (B5): replace a PLANNED trip's stop list in one transaction — stops not listed are deleted, listed stops with an `id` are updated in place
   * (a field the caller left out keeps its value), the rest are created; every stop gets `sequence` = its position (1..n). Returns `undefined` when the
   * trip is no longer `planned` (it may have been started since the caller looked) — nothing is written then.
   */
  async replacePlannedYards(
    tripId: string,
    stops: ReadonlyArray<EditPlannedYardInput>
  ): Promise<TripPlannedYard[] | undefined> {
    return this.prisma.$transaction(async tx => {
      const trip = await tx.trips.findFirst({
        where: { id: BigInt(tripId), status: 'planned' },
        select: { id: true },
      });
      if (!trip) return undefined;
      const keepIds = stops.flatMap(stop => (stop.id !== undefined ? [BigInt(stop.id)] : []));
      await tx.trip_planned_yards.deleteMany({
        where: { trip_id: BigInt(tripId), id: { notIn: keepIds } },
      });
      const result: TripPlannedYard[] = [];
      for (const [index, stop] of stops.entries()) {
        const fields = {
          yard_id: BigInt(stop.yardId),
          sequence: index + 1,
          ...(stop.stopPurpose !== undefined ? { stop_purpose: stop.stopPurpose } : {}),
          ...(stop.plannedArrivalAt !== undefined
            ? { planned_arrival_at: stop.plannedArrivalAt }
            : {}),
          ...(stop.plannedDepartureAt !== undefined
            ? { planned_departure_at: stop.plannedDepartureAt }
            : {}),
          ...(stop.notes !== undefined ? { notes: stop.notes } : {}),
        };
        const row =
          stop.id !== undefined
            ? await tx.trip_planned_yards.update({ where: { id: BigInt(stop.id) }, data: fields })
            : await tx.trip_planned_yards.create({ data: { trip_id: BigInt(tripId), ...fields } });
        result.push(toTripPlannedYard(row));
      }
      return result;
    });
  }

  async listPlannedYardsForTrip(tripId: string): Promise<TripPlannedYard[]> {
    const rows = await this.prisma.trip_planned_yards.findMany({
      where: { trip_id: BigInt(tripId) },
      orderBy: { sequence: 'asc' },
    });
    return rows.map(toTripPlannedYard);
  }

  /** A stop of `tripId` — the trip must already have been company-verified by the caller (`findTripById`); a stop id from another trip returns `undefined`. */
  async findPlannedYard(tripId: string, stopId: string): Promise<TripPlannedYard | undefined> {
    if (!/^\d+$/.test(stopId)) return undefined;
    const row = await this.prisma.trip_planned_yards.findFirst({
      where: { id: BigInt(stopId), trip_id: BigInt(tripId) },
    });
    return row ? toTripPlannedYard(row) : undefined;
  }

  /**
   * D-0155/D-0156: an arrive/depart from any source — updates the stop row (the EFFECTIVE value) and appends the audit
   * event in ONE transaction, so the log can never disagree with the stop it describes. With `requireStatus` (sensor
   * writes) the stop is only touched while it still has that status; `undefined` = nothing was written.
   */
  async recordStopEvent(
    tripId: string,
    stopId: string,
    input: RecordStopEventInput
  ): Promise<{ stop: TripPlannedYard; event: TripStopEvent } | undefined> {
    return this.prisma.$transaction(async tx => {
      const updated = await tx.trip_planned_yards.updateMany({
        where: {
          id: BigInt(stopId),
          trip_id: BigInt(tripId),
          ...(input.requireStatus ? { status: input.requireStatus } : {}),
        },
        data: {
          status: input.stopUpdate.status,
          actual_source: input.source,
          dwell_time_minutes: input.stopUpdate.dwellTimeMinutes,
          ...(input.stopUpdate.actualArrivalAt
            ? { actual_arrival_at: input.stopUpdate.actualArrivalAt }
            : {}),
          ...(input.stopUpdate.actualDepartureAt
            ? { actual_departure_at: input.stopUpdate.actualDepartureAt }
            : {}),
        },
      });
      if (updated.count === 0) return undefined;
      const stopRow = await tx.trip_planned_yards.findUniqueOrThrow({
        where: { id: BigInt(stopId) },
      });
      const eventRow = await tx.trip_stop_events.create({
        data: {
          trip_planned_yard_id: BigInt(stopId),
          trip_id: BigInt(tripId),
          event_type: input.eventType,
          occurred_at: input.occurredAt,
          source: input.source,
          reason: input.reason,
          recorded_by: input.recordedBy ? BigInt(input.recordedBy) : null,
        },
      });
      return { stop: toTripPlannedYard(stopRow), event: toTripStopEvent(eventRow) };
    });
  }

  /** D-0156: completing a trip marks every stop that never got an arrival as `missed` (cancelling leaves them `planned`). */
  async markPlannedStopsMissed(tripId: string): Promise<void> {
    await this.prisma.trip_planned_yards.updateMany({
      where: { trip_id: BigInt(tripId), status: 'planned' },
      data: { status: 'missed' },
    });
  }

  /** All audit events of a trip's stops, oldest first (`id` breaks same-second ties). Parent-ruled: `tripId` is already company-verified by the caller. */
  async listStopEventsForTrip(tripId: string): Promise<TripStopEvent[]> {
    const rows = await this.prisma.trip_stop_events.findMany({
      where: { trip_id: BigInt(tripId) },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toTripStopEvent);
  }

  // ===========================================================================
  // Yards / fleet customers — company-scoped reads only (Design notes above)
  // ===========================================================================

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

  async findFleetCustomerBrief(id: string): Promise<FleetCustomerBrief | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.fleet_customers.findFirst({ where: { id: BigInt(id) } });
    if (!row) return undefined;
    return {
      id: row.id.toString(),
      name: row.name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
    };
  }

  // ===========================================================================
  // GPS trail (device_positions — parent:devices, already registered by 2.3)
  // ===========================================================================

  async positionsInWindow(deviceId: string, from: Date, to: Date): Promise<DevicePositionPoint[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId), recorded_at: { gte: from, lte: to } },
      orderBy: { recorded_at: 'asc' },
    });
    return rows.map(toPositionPoint);
  }

  /** D-0155 (`GET /trips/{id}/route`): the newest position of the device at or before `upTo` — the trip's "current position" (for a finished trip, where it ended). */
  async latestPosition(deviceId: string, upTo: Date): Promise<DevicePositionPoint | undefined> {
    const row = await this.prisma.device_positions.findFirst({
      where: { device_id: BigInt(deviceId), recorded_at: { lte: upTo } },
      orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
    });
    return row ? toPositionPoint(row) : undefined;
  }
}

function toPositionPoint(r: {
  latitude: unknown;
  longitude: unknown;
  speed: unknown;
  heading: unknown;
  recorded_at: Date;
}): DevicePositionPoint {
  return {
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    speed: r.speed !== null ? Number(r.speed) : null,
    heading: r.heading !== null ? Number(r.heading) : null,
    recordedAt: r.recorded_at,
  };
}
