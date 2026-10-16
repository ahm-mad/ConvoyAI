import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { getRequestContext, runAsSystemAsync } from '../../platform/http/request-context.js';
import { localDateOf, type LocalDate } from '../../platform/time/zoned.js';
import { LITERS_PER_US_GALLON, type FuelFillRow } from './fleet-dashboard.mapper.js';
import type {
  AlarmSeverity,
  AlarmState,
  ComplianceRecordRow,
  DriverLicenceRow,
  DriverReportRow,
  FuelReportRow,
  IncidentReportFilter,
  IncidentReportRow,
  MaintenanceReportRow,
  TripReportFilter,
  TripReportRow,
  VehicleScope,
} from './fleet-dashboard.types.js';

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** A trip belongs to the period of its `actual_start_at`, else its `planned_start_at` (D-0183, ask A1 — the rule `GET /trips` already uses for `date_from` / `date_to`). */
function tripPeriod(from: Date, to: Date) {
  return {
    OR: [
      { actual_start_at: { gte: from, lte: to } },
      { actual_start_at: null, planned_start_at: { gte: from, lte: to } },
    ],
  };
}

/** `fuel_logs.fill_date` and `vehicle_maintenance_logs.service_date` are plain DATE columns: filter them by the *local* calendar dates of the range (D-0183, ask A5), written as UTC-midnight dates. */
function localDateRange(from: Date, to: Date, timeZone: string): { gte: Date; lte: Date } {
  const asDate = (d: LocalDate) => new Date(Date.UTC(d.y, d.m - 1, d.d));
  return { gte: asDate(localDateOf(from, timeZone)), lte: asDate(localDateOf(to, timeZone)) };
}

/** D-0185 (B1): optional restriction to a vehicle scope — `undefined` = the whole company (the earlier behaviour of every aggregate below). */
const inVehicles = (vehicleIds: string[] | undefined) =>
  vehicleIds ? { vehicle_id: { in: vehicleIds.map(id => BigInt(id)) } } : {};

const litersOf = (volume: unknown, unit: string): number =>
  toNumber(volume) * (unit === 'gallons' ? LITERS_PER_US_GALLON : 1);

/** `fuel_logs` is `parent:vehicles` (no own tenant column) — every read here joins through `vehicles.company_id` explicitly, matching Laravel's own `FuelLog::whereHas('vehicle', fn ($q) => $q->where('company_id', $companyId))` exactly. Needs the caller's own `companyId` directly since the tenant-scoping extension does nothing for `parent`-ruled models. */
function requireCompanyId(): string {
  const context = getRequestContext();
  if (!context?.companyId) {
    throw new Error('fleet-dashboard repository called with no company in context.');
  }
  return context.companyId;
}

/**
 * All Prisma access for module 4.6. `vehicles`/`trips`/`alarms`/
 * `compliance_documents`/`drivers` are all `company`-ruled — every query
 * against them is auto-scoped by the tenant-scoping extension (including
 * `groupBy`/`aggregate`, confirmed against `tenant-scoping.ts`'s own
 * `WHERE_FILTER_OPS`). `fuel_logs`/`device_positions`/
 * `vehicle_device_assignments` are `parent`-ruled (no own tenant column) —
 * `fuel_logs` reads join through `vehicles.company_id` by hand;
 * `device_positions`/`vehicle_device_assignments` reads are scoped by
 * passing only vehicle/device ids already obtained from an auto-scoped
 * `vehicles` query, same discipline every other fleet module established.
 */
export class FleetDashboardRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Vehicles
  // ===========================================================================

  /**
   * D-0182 (owner "do it" on L1, flow 06 §30): the vehicles that are part of the fleet — everything except `retired` and `sold`
   * (the same rule as `vehicleCount`, D-0159 / D-0160) — so `fleet_status` and the vehicle-performance ranking no longer count them.
   * D-0184 (B3 / A8): optional scope filters (category, cost centre, vehicle / driver / yard); no scope = exactly the earlier result (+ `category`).
   */
  /** The scope filters as `vehicles` conditions (no lifecycle rule) — shared by every scope-aware read. */
  private async scopeConditions(scope: VehicleScope): Promise<Prisma.vehiclesWhereInput[]> {
    const and: Prisma.vehiclesWhereInput[] = [];
    if (scope.vehicleCategory)
      and.push({ vehicle_category: { equals: scope.vehicleCategory, mode: 'insensitive' } });
    if (scope.costCentre) and.push({ cost_centre: scope.costCentre });
    if (scope.vehicleIds) and.push({ id: { in: scope.vehicleIds.map(id => BigInt(id)) } });
    // D-0184: driver / yard scope resolve to vehicle ids first (parent-ruled tables); the company-scoped `vehicles` query still decides what is visible
    if (scope.driverIds) {
      const rows = await this.prisma.driver_vehicle_assignments.findMany({
        where: { driver_id: { in: scope.driverIds.map(id => BigInt(id)) }, unassigned_at: null },
        select: { vehicle_id: true },
      });
      and.push({ id: { in: rows.map(row => row.vehicle_id) } });
    }
    if (scope.yardId) {
      const rows = await this.prisma.yard_slot_events.findMany({
        where: { checked_out_at: null, yard_slots: { yard_id: BigInt(scope.yardId) } },
        select: { vehicle_id: true },
      });
      and.push({ id: { in: rows.map(row => row.vehicle_id) } });
    }
    return and;
  }

  async vehiclesForCompany(
    scope: VehicleScope = {}
  ): Promise<{ id: string; name: string; plate: string | null; category?: string | null }[]> {
    const and: Prisma.vehiclesWhereInput[] = [
      { lifecycle_status: { notIn: ['retired', 'sold'] } },
      ...(await this.scopeConditions(scope)),
    ];
    const rows = await this.prisma.vehicles.findMany({
      where: { AND: and },
      select: { id: true, name: true, plate: true, vehicle_category: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      name: r.name,
      plate: r.plate,
      category: r.vehicle_category,
    }));
  }

  /**
   * D-0159 (owner decision on frontend F10): the vehicles that are part of the fleet for utilisation — everything except
   * `retired` and `sold` (Laravel counted ALL vehicles, so a retired truck kept inflating `available_hours` / `parked_hours`).
   * `in_maintenance` still counts (it is in the fleet, just parked).
   */
  async vehicleCount(): Promise<number> {
    return this.prisma.vehicles.count({
      where: { lifecycle_status: { notIn: ['retired', 'sold'] } },
    });
  }

  /** D-0183 (A7): vehicles that are scheduled to be available — `active` only (`in_maintenance`, `retired` and `sold` are out of service). Uses the current status; there is no status history. */
  async inServiceVehicleCount(vehicleIds?: string[]): Promise<number> {
    return this.prisma.vehicles.count({
      where: {
        lifecycle_status: 'active',
        ...(vehicleIds ? { id: { in: vehicleIds.map(id => BigInt(id)) } } : {}),
      },
    });
  }

  /** D-0185 (B1): `active` / `in_maintenance` counts of the vehicles in scope (retired / sold are not in the fleet) — the point-in-time fleet availability; there is no status history. */
  async availabilityCounts(
    scope: VehicleScope = {}
  ): Promise<{ active: number; inMaintenance: number }> {
    const and = await this.scopeConditions(scope);
    const rows = await this.prisma.vehicles.groupBy({
      by: ['lifecycle_status'],
      where: { AND: [{ lifecycle_status: { in: ['active', 'in_maintenance'] } }, ...and] },
      _count: { _all: true },
    });
    const count = (status: string) =>
      rows.find(row => row.lifecycle_status === status)?._count._all ?? 0;
    return { active: count('active'), inMaintenance: count('in_maintenance') };
  }

  // ===========================================================================
  // Device assignments / positions (bulk — fleetStatus needs every vehicle's
  // current device + that device's latest position in as few queries as
  // possible, not one round-trip per vehicle)
  // ===========================================================================

  /** `vehicle_id` -> currently-assigned `device_id` (`unassigned_at IS NULL`). */
  async activeDeviceAssignmentsForVehicles(vehicleIds: string[]): Promise<Map<string, string>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.prisma.vehicle_device_assignments.findMany({
      where: { vehicle_id: { in: vehicleIds.map(id => BigInt(id)) }, unassigned_at: null },
      select: { vehicle_id: true, device_id: true },
    });
    return new Map(rows.map(r => [r.vehicle_id.toString(), r.device_id.toString()]));
  }

  /**
   * `device_id` -> latest position (`recorded_at`/`speed`). D-0196: one LATERAL index probe per device (the newest `recorded_at`, ties by the highest
   * `id`) instead of loading EVERY position of these devices and keeping the first of each — the same result, without reading the whole history (a year of
   * hourly packets of 300 devices = 2.6 million rows per dashboard call) and without decompressing the compressed chunks of the `device_positions` hypertable.
   * The device ids are company-scoped by the caller.
   */
  async latestPositionsForDevices(
    deviceIds: string[]
  ): Promise<Map<string, { recordedAt: Date; speed: number | null }>> {
    if (deviceIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { device_id: bigint; recorded_at: Date; speed: unknown }[]
    >(Prisma.sql`
      SELECT p.device_id, p.recorded_at, p.speed
      FROM unnest(ARRAY[${Prisma.join(deviceIds.map(id => BigInt(id)))}]::bigint[]) AS d(device_id)
      CROSS JOIN LATERAL (
        SELECT device_id, recorded_at, speed FROM device_positions WHERE device_id = d.device_id ORDER BY recorded_at DESC, id DESC LIMIT 1
      ) p`);
    return new Map(
      rows.map(row => [
        row.device_id.toString(),
        { recordedAt: row.recorded_at, speed: row.speed !== null ? Number(row.speed) : null },
      ])
    );
  }

  // ===========================================================================
  // Trips
  // ===========================================================================

  async activeTripVehicleIds(): Promise<Set<string>> {
    const rows = await this.prisma.trips.findMany({
      where: { status: 'in_progress' },
      select: { vehicle_id: true },
    });
    return new Set(rows.map(r => r.vehicle_id.toString()));
  }

  async activeTripsCount(): Promise<number> {
    return this.prisma.trips.count({ where: { status: 'in_progress' } });
  }

  /** `tripSummary()`'s status breakdown — trips of the period (`actual_start_at`, else `planned_start_at`; D-0183 A1 — Laravel used `planned_start_at` only). */
  async tripStatusCountsInRange(
    from: Date,
    to: Date,
    vehicleIds?: string[]
  ): Promise<{ total: number; completed: number; cancelled: number; planned: number }> {
    const where = { AND: [tripPeriod(from, to), inVehicles(vehicleIds)] };
    const [total, completed, cancelled, planned] = await Promise.all([
      this.prisma.trips.count({ where }),
      this.prisma.trips.count({ where: { ...where, status: 'completed' } }),
      this.prisma.trips.count({ where: { ...where, status: 'cancelled' } }),
      this.prisma.trips.count({ where: { ...where, status: 'planned' } }),
    ]);
    return { total, completed, cancelled, planned };
  }

  /** Planned vs actual distance — trips of the period with an `actual_distance_km` (D-0183 A1). */
  async tripDistanceAggInRange(
    from: Date,
    to: Date
  ): Promise<{ plannedKm: number; actualKm: number }> {
    const agg = await this.prisma.trips.aggregate({
      where: { AND: [tripPeriod(from, to), { actual_distance_km: { not: null } }] },
      _sum: { planned_distance_km: true, actual_distance_km: true },
    });
    return {
      plannedKm: toNumber(agg._sum.planned_distance_km),
      actualKm: toNumber(agg._sum.actual_distance_km),
    };
  }

  /**
   * On-time statistics of the period (D-0186, owner "(a)" on the frontend's finding, flow 07 §17.2): `sample` = the completed trips that HAVE a planned
   * and an actual end — the only trips on-time can be judged for — and `onTime` = those that ended within `graceMinutes` of their planned end
   * (D-0183 A1 / F1; grace 0 = `actual_end_at <= planned_end_at`, Laravel's rule). A trip without a plan is neither on time nor late.
   */
  async onTimeStatsInRange(
    from: Date,
    to: Date,
    graceMinutes = 0,
    vehicleIds?: string[]
  ): Promise<{ onTime: number; sample: number }> {
    // Prisma has no whereColumn('a', '<=', 'b') comparison — fetch the
    // (bounded, already-filtered) candidate rows and compare in app code,
    // same "small bounded dataset, compare in JS" discipline the old app's
    // own vehiclePerformance sort already established elsewhere.
    const rows = await this.prisma.trips.findMany({
      where: {
        AND: [
          tripPeriod(from, to),
          inVehicles(vehicleIds),
          { status: 'completed', planned_end_at: { not: null }, actual_end_at: { not: null } },
        ],
      },
      select: { planned_end_at: true, actual_end_at: true },
    });
    const graceMs = graceMinutes * 60_000;
    const onTime = rows.filter(
      r =>
        r.actual_end_at !== null &&
        r.planned_end_at !== null &&
        r.actual_end_at.getTime() <= r.planned_end_at.getTime() + graceMs
    ).length;
    return { onTime, sample: rows.length };
  }

  /** The count alone (kept for callers that do not need the sample). */
  async onTimeCompletedCountInRange(
    from: Date,
    to: Date,
    graceMinutes = 0,
    vehicleIds?: string[]
  ): Promise<number> {
    return (await this.onTimeStatsInRange(from, to, graceMinutes, vehicleIds)).onTime;
  }

  /**
   * Planned vs actual distance over the trips of the period that have BOTH (D-0186): summing the planned distance of some trips against the actual
   * distance of others made the variance meaningless. `sample` = how many trips have both.
   */
  async tripDistanceVarianceInRange(
    from: Date,
    to: Date
  ): Promise<{ plannedKm: number; actualKm: number; sample: number }> {
    const where = {
      AND: [
        tripPeriod(from, to),
        { actual_distance_km: { not: null } },
        { planned_distance_km: { not: null } },
      ],
    };
    const agg = await this.prisma.trips.aggregate({
      where,
      _sum: { planned_distance_km: true, actual_distance_km: true },
      _count: { _all: true },
    });
    return {
      plannedKm: toNumber(agg._sum.planned_distance_km),
      actualKm: toNumber(agg._sum.actual_distance_km),
      sample: agg._count._all,
    };
  }

  /** Average `actual_duration_minutes` over completed trips of the period (D-0183 A1). `null` if none (not divide-by-zero `0`). */
  async avgCompletedDurationMinutesInRange(from: Date, to: Date): Promise<number | null> {
    const agg = await this.prisma.trips.aggregate({
      where: { AND: [tripPeriod(from, to), { status: 'completed' }] },
      _avg: { actual_duration_minutes: true },
    });
    return agg._avg.actual_duration_minutes === null
      ? null
      : Number(agg._avg.actual_duration_minutes);
  }

  /** `utilisationSummary()`'s driving-hours/distance source — completed trips, `actual_start_at` in range (a DIFFERENT date field than the status-breakdown queries above, matching Laravel's own `utilisationSummary()`/`fuelSummary()` exactly). */
  async completedTripsAggInRange(
    from: Date,
    to: Date,
    vehicleIds?: string[]
  ): Promise<{ totalMinutes: number; totalKm: number }> {
    const agg = await this.prisma.trips.aggregate({
      where: {
        status: 'completed',
        actual_start_at: { gte: from, lte: to },
        ...inVehicles(vehicleIds),
      },
      _sum: { actual_duration_minutes: true, actual_distance_km: true },
    });
    return {
      totalMinutes: toNumber(agg._sum.actual_duration_minutes),
      totalKm: toNumber(agg._sum.actual_distance_km),
    };
  }

  /** `vehiclePerformance()`'s per-vehicle source, bulk via `groupBy` rather than one query per vehicle (Laravel loops per-vehicle; this is an efficiency improvement, not a behavior change — same completed/`actual_start_at`-in-range filter). */
  async completedTripsAggByVehicleInRange(
    from: Date,
    to: Date
  ): Promise<Map<string, { minutes: number; km: number; fuelLiters: number; count: number }>> {
    const rows = await this.prisma.trips.groupBy({
      by: ['vehicle_id'],
      where: { status: 'completed', actual_start_at: { gte: from, lte: to } },
      _sum: { actual_duration_minutes: true, actual_distance_km: true, fuel_used_liters: true },
      _count: { _all: true },
    });
    const result = new Map<
      string,
      { minutes: number; km: number; fuelLiters: number; count: number }
    >();
    for (const row of rows) {
      result.set(row.vehicle_id.toString(), {
        minutes: toNumber(row._sum.actual_duration_minutes),
        km: toNumber(row._sum.actual_distance_km),
        fuelLiters: toNumber(row._sum.fuel_used_liters),
        count: row._count._all,
      });
    }
    return result;
  }

  /** Trend buckets — trips of the bucket's period (`actual_start_at`, else `planned_start_at`; D-0183 A1). */
  async tripStatusCountsInWindow(
    bucketFrom: Date,
    bucketTo: Date
  ): Promise<{ total: number; completed: number; cancelled: number }> {
    const where = tripPeriod(bucketFrom, bucketTo);
    const [total, completed, cancelled] = await Promise.all([
      this.prisma.trips.count({ where }),
      this.prisma.trips.count({ where: { ...where, status: 'completed' } }),
      this.prisma.trips.count({ where: { ...where, status: 'cancelled' } }),
    ]);
    return { total, completed, cancelled };
  }

  /** D-0183 (A2): every completed trip of the period with a distance, for the per-vehicle "where did the km come from" classification. */
  async completedTripDistancesInRange(
    from: Date,
    to: Date
  ): Promise<
    {
      vehicleId: string;
      km: number;
      odometerStartKm: number | null;
      odometerEndKm: number | null;
      deviceId: string | null;
    }[]
  > {
    const rows = await this.prisma.trips.findMany({
      where: {
        status: 'completed',
        actual_start_at: { gte: from, lte: to },
        actual_distance_km: { not: null },
      },
      select: {
        vehicle_id: true,
        actual_distance_km: true,
        odometer_start_km: true,
        odometer_end_km: true,
        device_id: true,
      },
    });
    return rows.map(r => ({
      vehicleId: r.vehicle_id.toString(),
      km: toNumber(r.actual_distance_km),
      odometerStartKm: r.odometer_start_km === null ? null : Number(r.odometer_start_km),
      odometerEndKm: r.odometer_end_km === null ? null : Number(r.odometer_end_km),
      deviceId: r.device_id === null ? null : r.device_id.toString(),
    }));
  }

  // ===========================================================================
  // Fuel logs (parent:vehicles — company join by hand)
  // ===========================================================================

  /** Fuel-log litres (a `gallons` log converted) and cost in the range, `fill_date` read as the local calendar dates of the range (D-0183 A3 / A5). */
  async fuelAggInRange(
    from: Date,
    to: Date,
    timeZone = 'UTC',
    vehicleIds?: string[]
  ): Promise<{ liters: number; cost: number }> {
    const companyId = requireCompanyId();
    const rows = await this.prisma.fuel_logs.findMany({
      where: {
        vehicles: { company_id: BigInt(companyId) },
        fill_date: localDateRange(from, to, timeZone),
        ...inVehicles(vehicleIds),
      },
      select: { volume: true, unit: true, cost: true, total_cost: true },
    });
    let liters = 0;
    let cost = 0;
    for (const row of rows) {
      liters += litersOf(row.volume, row.unit);
      cost += toNumber(row.total_cost) || toNumber(row.cost);
    }
    return { liters, cost };
  }

  /** Bulk per-vehicle fuel-log litres and cost, `fill_date` in range — same `COALESCE(total_cost, cost, 0)` convention as every other fuel-cost read in this service. */
  async fuelByVehicleInRange(
    from: Date,
    to: Date,
    timeZone = 'UTC'
  ): Promise<Map<string, { liters: number; cost: number }>> {
    const companyId = requireCompanyId();
    const rows = await this.prisma.fuel_logs.findMany({
      where: {
        vehicles: { company_id: BigInt(companyId) },
        fill_date: localDateRange(from, to, timeZone),
      },
      select: { vehicle_id: true, volume: true, unit: true, cost: true, total_cost: true },
    });
    const result = new Map<string, { liters: number; cost: number }>();
    for (const row of rows) {
      const key = row.vehicle_id.toString();
      const entry = result.get(key) ?? { liters: 0, cost: 0 };
      entry.liters += litersOf(row.volume, row.unit);
      entry.cost += toNumber(row.total_cost) || toNumber(row.cost);
      result.set(key, entry);
    }
    return result;
  }

  /** D-0183 (A3): the range's fills that carry an odometer reading, for the full-tank economy method. */
  async fuelFillsInRange(
    from: Date,
    to: Date,
    timeZone = 'UTC',
    vehicleIds?: string[]
  ): Promise<FuelFillRow[]> {
    const companyId = requireCompanyId();
    const rows = await this.prisma.fuel_logs.findMany({
      where: {
        vehicles: { company_id: BigInt(companyId) },
        fill_date: localDateRange(from, to, timeZone),
        odometer_km: { not: null },
        ...inVehicles(vehicleIds),
      },
      select: {
        vehicle_id: true,
        fill_date: true,
        volume: true,
        unit: true,
        odometer_km: true,
        is_full_tank: true,
      },
    });
    return rows.map(r => ({
      vehicleId: r.vehicle_id.toString(),
      fillDate: r.fill_date,
      liters: litersOf(r.volume, r.unit),
      odometerKm: r.odometer_km === null ? null : Number(r.odometer_km),
      isFullTank: r.is_full_tank,
    }));
  }

  // ===========================================================================
  // Maintenance logs (parent:vehicles — company join by hand)
  // ===========================================================================

  /** D-0184 (A8): the range's maintenance-log costs per vehicle. */
  async maintenanceCostByVehicleInRange(
    from: Date,
    to: Date,
    timeZone = 'UTC'
  ): Promise<Map<string, number>> {
    const companyId = requireCompanyId();
    const rows = await this.prisma.vehicle_maintenance_logs.groupBy({
      by: ['vehicle_id'],
      where: {
        vehicles: { company_id: BigInt(companyId) },
        service_date: localDateRange(from, to, timeZone),
      },
      _sum: { cost: true },
    });
    return new Map(rows.map(row => [row.vehicle_id.toString(), toNumber(row._sum.cost)]));
  }

  /** D-0184 (A8): incidents of the range per vehicle (`driver_incidents.vehicle_id`, `incident_date` read as local dates); the company comes from the vehicles the caller asks about. */
  async incidentCountByVehicleInRange(
    vehicleIds: string[],
    from: Date,
    to: Date,
    timeZone = 'UTC'
  ): Promise<Map<string, number>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.prisma.driver_incidents.groupBy({
      by: ['vehicle_id'],
      where: {
        vehicle_id: { in: vehicleIds.map(id => BigInt(id)) },
        incident_date: localDateRange(from, to, timeZone),
      },
      _count: { _all: true },
    });
    const result = new Map<string, number>();
    for (const row of rows)
      if (row.vehicle_id !== null) result.set(row.vehicle_id.toString(), row._count._all);
    return result;
  }

  /** D-0183 (A6): the sum of the range's maintenance-log costs (`service_date` read as local calendar dates). */
  async maintenanceCostInRange(
    from: Date,
    to: Date,
    timeZone = 'UTC',
    vehicleIds?: string[]
  ): Promise<number> {
    const companyId = requireCompanyId();
    const agg = await this.prisma.vehicle_maintenance_logs.aggregate({
      where: {
        vehicles: { company_id: BigInt(companyId) },
        service_date: localDateRange(from, to, timeZone),
        ...inVehicles(vehicleIds),
      },
      _sum: { cost: true },
    });
    return toNumber(agg._sum.cost);
  }

  /** D-0185 (A9): the ids of the companies that have vehicles — read WITHOUT a company scope (the scheduled status job runs for all of them). */
  async companyIdsWithVehicles(): Promise<string[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.vehicles.findMany({ distinct: ['company_id'], select: { company_id: true } })
    );
    return rows.map(row => row.company_id.toString());
  }

  // ===========================================================================
  // Attention feed (D-0185, flow 07 B2) — small read-only queries, each already company-scoped
  // ===========================================================================

  /** Compliance documents expired or expiring within `withinDays` (both documentable types). */
  async complianceExpiring(
    withinDays: number,
    now: Date
  ): Promise<
    {
      id: string;
      documentableType: string;
      documentableId: string;
      documentType: string;
      expiryDate: Date;
    }[]
  > {
    const cutoff = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + withinDays * 86_400_000
    );
    const rows = await this.prisma.compliance_documents.findMany({
      where: { expiry_date: { not: null, lte: cutoff } },
      select: {
        id: true,
        documentable_type: true,
        documentable_id: true,
        document_type: true,
        expiry_date: true,
      },
      orderBy: { expiry_date: 'asc' },
    });
    return rows.flatMap(r =>
      r.expiry_date
        ? [
            {
              id: r.id.toString(),
              documentableType: r.documentable_type,
              documentableId: r.documentable_id.toString(),
              documentType: r.document_type,
              expiryDate: r.expiry_date,
            },
          ]
        : []
    );
  }

  /** Drivers (not deactivated) whose licence expired or expires within `withinDays`. */
  async driverLicencesExpiring(
    withinDays: number,
    now: Date
  ): Promise<{ id: string; name: string; expiryDate: Date }[]> {
    const cutoff = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + withinDays * 86_400_000
    );
    const rows = await this.prisma.drivers.findMany({
      where: { status: { not: 'inactive' }, license_expiry_date: { not: null, lte: cutoff } },
      select: { id: true, first_name: true, last_name: true, license_expiry_date: true },
      orderBy: { license_expiry_date: 'asc' },
    });
    return rows.flatMap(r =>
      r.license_expiry_date
        ? [
            {
              id: r.id.toString(),
              name: `${r.first_name} ${r.last_name}`.trim(),
              expiryDate: r.license_expiry_date,
            },
          ]
        : []
    );
  }

  /** Severe incidents on or after `sinceDate` (a local calendar date written as a UTC-midnight date). */
  async severeIncidentsSince(sinceDate: Date): Promise<
    {
      id: string;
      driverId: string;
      driverName: string;
      vehicleId: string | null;
      incidentType: string;
      incidentDate: Date;
    }[]
  > {
    const companyId = requireCompanyId();
    const rows = await this.prisma.driver_incidents.findMany({
      where: {
        severity: 'severe',
        incident_date: { gte: sinceDate },
        drivers: { company_id: BigInt(companyId) },
      },
      select: {
        id: true,
        driver_id: true,
        vehicle_id: true,
        incident_type: true,
        incident_date: true,
        drivers: { select: { first_name: true, last_name: true } },
      },
      orderBy: { incident_date: 'desc' },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      driverId: r.driver_id.toString(),
      driverName: `${r.drivers.first_name} ${r.drivers.last_name}`.trim(),
      vehicleId: r.vehicle_id === null ? null : r.vehicle_id.toString(),
      incidentType: r.incident_type,
      incidentDate: r.incident_date,
    }));
  }

  /** Planned trips that start before `until`, with their vehicle's / driver's current availability. */
  async plannedTripsStartingBefore(until: Date): Promise<
    {
      id: string;
      reference: string | null;
      vehicleId: string;
      vehicleName: string;
      vehicleStatus: string;
      driverName: string;
      driverStatus: string;
      plannedStartAt: Date;
    }[]
  > {
    const rows = await this.prisma.trips.findMany({
      where: { status: 'planned', planned_start_at: { not: null, lte: until } },
      select: {
        id: true,
        trip_reference: true,
        vehicle_id: true,
        planned_start_at: true,
        vehicles: { select: { name: true, lifecycle_status: true } },
        drivers: { select: { first_name: true, last_name: true, status: true } },
      },
      orderBy: { planned_start_at: 'asc' },
    });
    return rows.flatMap(r =>
      r.planned_start_at
        ? [
            {
              id: r.id.toString(),
              reference: r.trip_reference,
              vehicleId: r.vehicle_id.toString(),
              vehicleName: r.vehicles.name,
              vehicleStatus: r.vehicles.lifecycle_status,
              driverName: `${r.drivers.first_name} ${r.drivers.last_name}`.trim(),
              driverStatus: r.drivers.status,
              plannedStartAt: r.planned_start_at,
            },
          ]
        : []
    );
  }

  /** Vehicles checked in at a yard slot since before `before` (open stays). */
  async openYardStaysBefore(before: Date): Promise<
    {
      vehicleId: string;
      vehicleName: string;
      yardName: string;
      slotNumber: string;
      checkedInAt: Date;
    }[]
  > {
    const rows = await this.prisma.yard_slot_events.findMany({
      where: {
        checked_out_at: null,
        checked_in_at: { lt: before },
        vehicles: { lifecycle_status: { notIn: ['retired', 'sold'] } },
      },
      select: {
        vehicle_id: true,
        checked_in_at: true,
        vehicles: { select: { name: true } },
        yard_slots: { select: { slot_number: true, yards: { select: { name: true } } } },
      },
      orderBy: { checked_in_at: 'asc' },
    });
    return rows.map(r => ({
      vehicleId: r.vehicle_id.toString(),
      vehicleName: r.vehicles.name,
      yardName: r.yard_slots.yards.name,
      slotNumber: r.yard_slots.slot_number,
      checkedInAt: r.checked_in_at,
    }));
  }

  /** Names of the vehicles / drivers a document or alarm refers to (company-scoped: an id of another company simply has no name). */
  async vehicleNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.vehicles.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, name: true },
    });
    return new Map(rows.map(r => [r.id.toString(), r.name]));
  }

  // ===========================================================================
  // Trips report (D-0189, flow 07 B5)
  // ===========================================================================

  /**
   * The vehicles a scope selects, INCLUDING retired / sold ones (their trips are history the report still covers) — `undefined` when the scope restricts
   * nothing (so the caller adds no vehicle condition at all). The `vehicles` query itself is company-scoped by the tenant extension.
   */
  async vehicleIdsForScope(scope: VehicleScope): Promise<string[] | undefined> {
    const and = await this.scopeConditions(scope);
    if (and.length === 0) return undefined;
    const rows = await this.prisma.vehicles.findMany({ where: { AND: and }, select: { id: true } });
    return rows.map(row => row.id.toString());
  }

  async vehicleBriefs(ids: string[]): Promise<Map<string, { name: string; plate: string | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.vehicles.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, name: true, plate: true },
    });
    return new Map(rows.map(r => [r.id.toString(), { name: r.name, plate: r.plate }]));
  }

  async customerNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.fleet_customers.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, name: true },
    });
    return new Map(rows.map(r => [r.id.toString(), r.name]));
  }

  private reportTripsWhere(from: Date, to: Date, filter: TripReportFilter): Prisma.tripsWhereInput {
    return {
      AND: [
        tripPeriod(from, to),
        inVehicles(filter.vehicleIds),
        ...(filter.driverIds
          ? [{ driver_id: { in: filter.driverIds.map(id => BigInt(id)) } }]
          : []),
        ...(filter.customerIds
          ? [{ fleet_customer_id: { in: filter.customerIds.map(id => BigInt(id)) } }]
          : []),
      ],
    };
  }

  /** How many trips the report would read (guards the in-memory pass). */
  async countTripsForReport(from: Date, to: Date, filter: TripReportFilter): Promise<number> {
    return this.prisma.trips.count({ where: this.reportTripsWhere(from, to, filter) });
  }

  /** The trips of the period (`actual_start_at`, else `planned_start_at` — D-0183 A1) under the filter, oldest period start first. */
  async tripsForReport(from: Date, to: Date, filter: TripReportFilter): Promise<TripReportRow[]> {
    const rows = await this.prisma.trips.findMany({
      where: this.reportTripsWhere(from, to, filter),
      select: {
        id: true,
        trip_reference: true,
        status: true,
        vehicle_id: true,
        driver_id: true,
        fleet_customer_id: true,
        origin_address: true,
        destination_address: true,
        planned_start_at: true,
        actual_start_at: true,
        planned_end_at: true,
        actual_end_at: true,
        planned_distance_km: true,
        actual_distance_km: true,
        actual_duration_minutes: true,
        cancellation_reason: true,
      },
      orderBy: { id: 'asc' },
    });
    const num = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value);
    return rows.map(r => ({
      id: r.id.toString(),
      reference: r.trip_reference,
      status: r.status,
      vehicleId: r.vehicle_id.toString(),
      driverId: r.driver_id.toString(),
      customerId: r.fleet_customer_id?.toString() ?? null,
      originAddress: r.origin_address,
      destinationAddress: r.destination_address,
      plannedStartAt: r.planned_start_at,
      actualStartAt: r.actual_start_at,
      plannedEndAt: r.planned_end_at,
      actualEndAt: r.actual_end_at,
      plannedDistanceKm: num(r.planned_distance_km),
      actualDistanceKm: num(r.actual_distance_km),
      durationMinutes: num(r.actual_duration_minutes),
      cancellationReason: r.cancellation_reason,
    }));
  }

  // ===========================================================================
  // Maintenance + compliance reports (D-0191, flow 07 B7)
  // ===========================================================================

  /** The maintenance logs of the period (LOCAL calendar dates of the range — `service_date` is a DATE, D-0183 A5) with their vehicle, oldest first; `vehicle_maintenance_logs` is parent-ruled — company through `vehicles.company_id` by hand. */
  async maintenanceLogsForReport(
    from: Date,
    to: Date,
    timeZone: string,
    vehicleIds?: string[]
  ): Promise<MaintenanceReportRow[]> {
    const rows = await this.prisma.vehicle_maintenance_logs.findMany({
      where: {
        vehicles: { company_id: BigInt(requireCompanyId()) },
        service_date: localDateRange(from, to, timeZone),
        ...inVehicles(vehicleIds),
      },
      select: {
        id: true,
        vehicle_id: true,
        service_type: true,
        service_date: true,
        cost: true,
        vehicles: { select: { name: true, plate: true, vehicle_category: true } },
      },
      orderBy: [{ service_date: 'asc' }, { id: 'asc' }],
    });
    return rows.map(r => ({
      id: r.id.toString(),
      vehicleId: r.vehicle_id.toString(),
      serviceType: r.service_type,
      serviceDate: r.service_date,
      cost: r.cost === null ? null : Number(r.cost),
      vehicle: {
        name: r.vehicles.name,
        plate: r.vehicles.plate,
        category: r.vehicles.vehicle_category,
      },
    }));
  }

  /** Every compliance document of the company (`compliance_documents` is `company`-ruled — scoped by the tenant extension). */
  async complianceRecordsForReport(): Promise<ComplianceRecordRow[]> {
    const rows = await this.prisma.compliance_documents.findMany({
      select: {
        id: true,
        documentable_type: true,
        documentable_id: true,
        document_type: true,
        document_number: true,
        expiry_date: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      documentableType: r.documentable_type,
      documentableId: r.documentable_id.toString(),
      documentType: r.document_type,
      documentNumber: r.document_number,
      expiryDate: r.expiry_date,
    }));
  }

  /** The licences of the drivers that are not deactivated (the attention feed's rule) — a driver without an expiry date is listed with `expiryDate: null`. */
  async driverLicencesForReport(): Promise<DriverLicenceRow[]> {
    const rows = await this.prisma.drivers.findMany({
      where: { status: { not: 'inactive' } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        license_number: true,
        license_expiry_date: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      driverId: r.id.toString(),
      name: `${r.first_name} ${r.last_name}`.trim(),
      licenseNumber: r.license_number,
      expiryDate: r.license_expiry_date,
    }));
  }

  // ===========================================================================
  // Fuel report (D-0190, flow 07 B6)
  // ===========================================================================

  private fuelReportWhere(
    from: Date,
    to: Date,
    timeZone: string,
    vehicleIds: string[] | undefined
  ): Prisma.fuel_logsWhereInput {
    return {
      vehicles: { company_id: BigInt(requireCompanyId()) },
      fill_date: localDateRange(from, to, timeZone),
      ...inVehicles(vehicleIds),
    };
  }

  /** How many fills the fuel report would read (guards the in-memory pass). `fuel_logs` is parent-ruled — company through `vehicles.company_id` by hand. */
  async countFuelFillsForReport(
    from: Date,
    to: Date,
    timeZone: string,
    vehicleIds?: string[]
  ): Promise<number> {
    return this.prisma.fuel_logs.count({
      where: this.fuelReportWhere(from, to, timeZone, vehicleIds),
    });
  }

  /** Every fill of the period (the LOCAL calendar dates of the range, `fill_date` being a DATE — D-0183 A5) with its vehicle's brief and tank capacity, oldest first. */
  async fuelFillsForReport(
    from: Date,
    to: Date,
    timeZone: string,
    vehicleIds?: string[]
  ): Promise<FuelReportRow[]> {
    const rows = await this.prisma.fuel_logs.findMany({
      where: this.fuelReportWhere(from, to, timeZone, vehicleIds),
      include: {
        vehicles: {
          select: { name: true, plate: true, vehicle_category: true, tank_capacity_liters: true },
        },
      },
      orderBy: [{ fill_date: 'asc' }, { id: 'asc' }],
    });
    const num = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value);
    return rows.map(r => ({
      id: r.id.toString(),
      vehicleId: r.vehicle_id.toString(),
      fillDate: r.fill_date,
      volume: Number(r.volume),
      unit: r.unit,
      liters: litersOf(r.volume, r.unit),
      cost: num(r.cost),
      totalCost: num(r.total_cost),
      unitPrice: num(r.unit_price),
      paymentMethod: r.payment_method,
      vendor: r.vendor,
      stationName: r.station_name,
      receiptReference: r.receipt_reference,
      tripId: r.trip_id?.toString() ?? null,
      odometerKm: num(r.odometer_km),
      isFullTank: r.is_full_tank,
      createdAt: r.created_at,
      vehicle: {
        name: r.vehicles.name,
        plate: r.vehicles.plate,
        category: r.vehicles.vehicle_category,
        tankCapacityLiters: num(r.vehicles.tank_capacity_liters),
      },
    }));
  }

  // ===========================================================================
  // Drivers scorecard + incidents summary (D-0193, flow 07 B8)
  // ===========================================================================

  private incidentsReportWhere(
    from: Date,
    to: Date,
    timeZone: string,
    filter: IncidentReportFilter
  ): Prisma.driver_incidentsWhereInput {
    return {
      drivers: { company_id: BigInt(requireCompanyId()) },
      incident_date: localDateRange(from, to, timeZone),
      ...(filter.driverIds ? { driver_id: { in: filter.driverIds.map(id => BigInt(id)) } } : {}),
      ...inVehicles(filter.vehicleIds),
    };
  }

  /** How many incidents the report would read (guards the in-memory pass). `driver_incidents` is parent-ruled — company through `drivers.company_id` by hand. */
  async countIncidentsForReport(
    from: Date,
    to: Date,
    timeZone: string,
    filter: IncidentReportFilter
  ): Promise<number> {
    return this.prisma.driver_incidents.count({
      where: this.incidentsReportWhere(from, to, timeZone, filter),
    });
  }

  /** The incidents of the period (LOCAL calendar dates of the range — `incident_date` is a DATE, D-0183 A5), oldest first. */
  async incidentsForReport(
    from: Date,
    to: Date,
    timeZone: string,
    filter: IncidentReportFilter
  ): Promise<IncidentReportRow[]> {
    const rows = await this.prisma.driver_incidents.findMany({
      where: this.incidentsReportWhere(from, to, timeZone, filter),
      select: {
        id: true,
        driver_id: true,
        vehicle_id: true,
        incident_type: true,
        severity: true,
        incident_date: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      driverId: r.driver_id.toString(),
      vehicleId: r.vehicle_id === null ? null : r.vehicle_id.toString(),
      incidentType: r.incident_type,
      severity: r.severity,
      incidentDate: r.incident_date,
    }));
  }

  /** The drivers of the company (`drivers` is company-scoped by the tenant extension), optionally only these ids — every status. */
  async driversForReport(ids?: string[]): Promise<DriverReportRow[]> {
    const rows = await this.prisma.drivers.findMany({
      where: ids ? { id: { in: ids.map(id => BigInt(id)) } } : {},
      select: {
        id: true,
        first_name: true,
        last_name: true,
        status: true,
        license_number: true,
        license_expiry_date: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      name: `${r.first_name} ${r.last_name}`.trim(),
      status: r.status,
      licenseNumber: r.license_number,
      licenseExpiryDate: r.license_expiry_date,
    }));
  }

  async driverNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.drivers.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true, first_name: true, last_name: true },
    });
    return new Map(rows.map(r => [r.id.toString(), `${r.first_name} ${r.last_name}`.trim()]));
  }

  /** Latest position time of each device (for "offline for more than …"). */
  async lastPositionTimes(deviceIds: string[]): Promise<Map<string, Date>> {
    const positions = await this.latestPositionsForDevices(deviceIds);
    return new Map([...positions].map(([id, p]) => [id, p.recordedAt]));
  }

  // ===========================================================================
  // Yard occupancy and geofence activity summaries (D-0187, flow 07 B9)
  // ===========================================================================

  /** The company's yards with their slot counts (deactivated yards only when `includeInactive`); `yardId` narrows to one. */
  async yardsWithSlotCounts(
    includeInactive: boolean,
    yardId?: string
  ): Promise<{ id: string; name: string; isActive: boolean; slotsTotal: number }[]> {
    const rows = await this.prisma.yards.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: true }),
        ...(yardId ? { id: BigInt(yardId) } : {}),
      },
      select: { id: true, name: true, is_active: true, _count: { select: { yard_slots: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      isActive: row.is_active,
      slotsTotal: row._count.yard_slots,
    }));
  }

  /**
   * Yard stays that touch the period: checked in inside it, or checked out inside it, or still open (`checkedOutAt` null). Company-scoped through the
   * slot's yard (`yard_slot_events` is parent-ruled two levels deep).
   */
  async yardStaysTouching(
    from: Date,
    to: Date,
    yardIds: string[]
  ): Promise<
    {
      yardId: string;
      slotId: string;
      vehicleId: string;
      checkedInAt: Date;
      checkedOutAt: Date | null;
    }[]
  > {
    if (yardIds.length === 0) return [];
    const rows = await this.prisma.yard_slot_events.findMany({
      where: {
        yard_slots: {
          yard_id: { in: yardIds.map(id => BigInt(id)) },
          yards: { company_id: BigInt(requireCompanyId()) },
        },
        OR: [
          { checked_in_at: { gte: from, lte: to } },
          { checked_out_at: { gte: from, lte: to } },
          { checked_out_at: null },
        ],
      },
      select: {
        yard_slot_id: true,
        vehicle_id: true,
        checked_in_at: true,
        checked_out_at: true,
        yard_slots: { select: { yard_id: true } },
      },
      orderBy: { checked_in_at: 'asc' },
    });
    return rows.map(r => ({
      yardId: r.yard_slots.yard_id.toString(),
      slotId: r.yard_slot_id.toString(),
      vehicleId: r.vehicle_id.toString(),
      checkedInAt: r.checked_in_at,
      checkedOutAt: r.checked_out_at,
    }));
  }

  /** How many real geofence transitions of the company fall in the period under the events list's own `alert_on` visibility rule (guards the summary's in-memory pass). */
  async countVisibleGeofenceEvents(
    from: Date,
    to: Date,
    filter: {
      geofenceId?: string | undefined;
      vehicleId?: string | undefined;
      yardId?: string | undefined;
    }
  ): Promise<number> {
    return this.prisma.geofence_events.count({ where: this.visibleEventsWhere(from, to, filter) });
  }

  /** The period's geofence transitions, oldest first, under the same visibility rule as `GET /geofences/events` (an event shows when the geofence's CURRENT `alert_on` is `both` or equals its type). */
  async visibleGeofenceEvents(
    from: Date,
    to: Date,
    filter: {
      geofenceId?: string | undefined;
      vehicleId?: string | undefined;
      yardId?: string | undefined;
    }
  ): Promise<
    {
      geofenceId: string;
      geofenceName: string;
      yardId: string | null;
      vehicleId: string;
      eventType: 'enter' | 'exit';
      occurredAt: Date;
    }[]
  > {
    const rows = await this.prisma.geofence_events.findMany({
      where: this.visibleEventsWhere(from, to, filter),
      select: {
        geofence_id: true,
        vehicle_id: true,
        event_type: true,
        occurred_at: true,
        geofences: { select: { name: true, yard_id: true } },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    });
    return rows.map(r => ({
      geofenceId: r.geofence_id.toString(),
      geofenceName: r.geofences.name,
      yardId: r.geofences.yard_id?.toString() ?? null,
      vehicleId: r.vehicle_id.toString(),
      eventType: r.event_type,
      occurredAt: r.occurred_at,
    }));
  }

  private visibleEventsWhere(
    from: Date,
    to: Date,
    filter: {
      geofenceId?: string | undefined;
      vehicleId?: string | undefined;
      yardId?: string | undefined;
    }
  ): Prisma.geofence_eventsWhereInput {
    const companyId = requireCompanyId();
    return {
      AND: [
        { geofences: { company_id: BigInt(companyId) } },
        {
          OR: [
            { geofences: { alert_on: 'both' } },
            { event_type: 'enter', geofences: { alert_on: 'enter' } },
            { event_type: 'exit', geofences: { alert_on: 'exit' } },
          ],
        },
        { occurred_at: { gte: from, lte: to } },
        ...(filter.geofenceId ? [{ geofence_id: BigInt(filter.geofenceId) }] : []),
        ...(filter.vehicleId ? [{ vehicle_id: BigInt(filter.vehicleId) }] : []),
        ...(filter.yardId ? [{ geofences: { yard_id: BigInt(filter.yardId) } }] : []),
      ],
    };
  }

  // ===========================================================================
  // Alarms
  // ===========================================================================

  /** `activeAlerts()` — `state IN ('active','acknowledged')` (11.1 Bug A fixed), `severity` read directly off `alarms` (11.1 Bug B fixed — no more eager-loading a nonexistent `rule.severity`). */
  async activeAlarmsWithRuleName(severities: AlarmSeverity[]): Promise<
    {
      id: string;
      ruleName: string | null;
      severity: AlarmSeverity;
      state: AlarmState;
      deviceId: string;
      triggeredAt: Date;
      createdAt: Date | null;
    }[]
  > {
    const rows = await this.prisma.alarms.findMany({
      where: {
        state: { in: ['active', 'acknowledged'] },
        ...(severities.length > 0 ? { severity: { in: severities } } : {}),
      },
      include: { rules: { select: { name: true } } },
      orderBy: { triggered_at: 'desc' },
    });
    return rows.map(row => ({
      id: row.id.toString(),
      ruleName: row.rules.name,
      severity: row.severity,
      state: row.state,
      deviceId: row.device_id.toString(),
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    }));
  }

  /** `alertSummary()`'s severity breakdown — same `state IN ('active','acknowledged')` fix, real `severity` column groupBy instead of a PHP-side filter over an eager-loaded (and broken) relation. */
  /** D-0182 (L2): every open (active / acknowledged) alarm's severity + device, for the `fleet_only` overview counts. */
  async openAlarmDevices(): Promise<{ severity: AlarmSeverity; deviceId: string }[]> {
    const rows = await this.prisma.alarms.findMany({
      where: { state: { in: ['active', 'acknowledged'] } },
      select: { severity: true, device_id: true },
    });
    return rows.map(row => ({ severity: row.severity, deviceId: row.device_id.toString() }));
  }

  async alarmSeverityCounts(): Promise<{
    critical: number;
    warning: number;
    info: number;
    total: number;
  }> {
    const rows = await this.prisma.alarms.groupBy({
      by: ['severity'],
      where: { state: { in: ['active', 'acknowledged'] } },
      _count: { _all: true },
    });
    const counts = { critical: 0, warning: 0, info: 0 };
    let total = 0;
    for (const row of rows) {
      counts[row.severity] = row._count._all;
      total += row._count._all;
    }
    return { ...counts, total };
  }

  // ===========================================================================
  // Compliance documents / driver licences (30-day expiring exceptions)
  // ===========================================================================

  async countExpiringCompliance(withinDays: number): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.compliance_documents.count({
      where: { expiry_date: { gte: today, lte: cutoff } },
    });
  }

  async countExpiringDriverLicences(withinDays: number): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.drivers.count({
      where: { license_expiry_date: { gte: today, lte: cutoff } },
    });
  }
}
