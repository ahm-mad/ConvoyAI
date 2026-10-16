import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { containsInsensitive } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { LITERS_PER_US_GALLON } from '../fleet-dashboard/fleet-dashboard.mapper.js';
import type {
  ComplianceCountFilter,
  ComplianceCountRow,
  FuelLogFilter,
  FuelLogItem,
  FuelLogListQuery,
  FuelSummaryRaw,
  LogVehicleBrief,
  MaintenanceLogFilter,
  MaintenanceLogItem,
  MaintenanceLogListQuery,
  MaintenanceSummaryRaw,
} from './fleet-records.types.js';

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const equalsInsensitive = (term: string): { equals: string; mode: 'insensitive' } => ({
  equals: term,
  mode: 'insensitive',
});

function requireCompanyId(): bigint {
  const companyId = getRequestContext()?.companyId;
  if (!companyId) throw new Error('fleet-records repository called with no company in context.');
  return BigInt(companyId);
}

const VEHICLE_SELECT = {
  id: true,
  name: true,
  plate: true,
  vehicle_category: true,
  lifecycle_status: true,
} as const;

function vehicleBrief(v: {
  id: bigint;
  name: string;
  plate: string | null;
  vehicle_category: string | null;
  lifecycle_status: string;
}): LogVehicleBrief {
  return {
    id: v.id.toString(),
    name: v.name,
    plate: v.plate,
    category: v.vehicle_category,
    lifecycleStatus: v.lifecycle_status,
  };
}

/** `vehicles` relation filter shared by both log lists: the caller's company (by hand — the log tables are parent-ruled) and an optional category. */
function vehicleRelation(
  companyId: bigint,
  vehicleCategory: string | undefined
): Prisma.vehiclesWhereInput {
  return {
    company_id: companyId,
    ...(vehicleCategory ? { vehicle_category: equalsInsensitive(vehicleCategory) } : {}),
  };
}

/** Sort by a column with NULLs last in both directions; `vehicle_name` sorts through the relation. Ties by id in the same direction. */
function orderBy<T extends string>(
  sortBy: T | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  defaultColumn: string,
  columnOf: Record<T, string>,
  nullable: readonly T[]
): Record<string, unknown>[] {
  if (!sortBy) return [{ [defaultColumn]: 'desc' }, { id: 'desc' }];
  const direction = sortOrder ?? 'asc';
  if (sortBy === 'vehicle_name') return [{ vehicles: { name: direction } }, { id: direction }];
  const column = columnOf[sortBy];
  return [
    { [column]: nullable.includes(sortBy) ? { sort: direction, nulls: 'last' } : direction },
    { id: direction },
  ];
}

/** All Prisma access for module 4.11. */
export class FleetRecordsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Maintenance logs (C2)
  // ===========================================================================

  private maintenanceWhere(
    filter: MaintenanceLogFilter
  ): Prisma.vehicle_maintenance_logsWhereInput {
    const and: Prisma.vehicle_maintenance_logsWhereInput[] = [
      { vehicles: vehicleRelation(requireCompanyId(), filter.vehicleCategory) },
    ];
    if (filter.vehicleIds)
      and.push({ vehicle_id: { in: filter.vehicleIds.map(id => BigInt(id)) } });
    if (filter.from || filter.to)
      and.push({
        service_date: {
          ...(filter.from ? { gte: filter.from } : {}),
          ...(filter.to ? { lte: filter.to } : {}),
        },
      });
    if (filter.serviceType) and.push({ service_type: equalsInsensitive(filter.serviceType) });
    if (filter.vendor) and.push({ vendor: equalsInsensitive(filter.vendor) });
    if (filter.minCost !== undefined || filter.maxCost !== undefined) {
      and.push({
        cost: {
          ...(filter.minCost !== undefined ? { gte: filter.minCost } : {}),
          ...(filter.maxCost !== undefined ? { lte: filter.maxCost } : {}),
        },
      });
    }
    if (filter.search) {
      const term = containsInsensitive(filter.search);
      and.push({
        OR: [
          { service_type: term },
          { vendor: term },
          { notes: term },
          { vehicles: { name: term } },
          { vehicles: { plate: term } },
        ],
      });
    }
    return { AND: and };
  }

  async listMaintenanceLogs(
    query: MaintenanceLogListQuery,
    skip: number,
    take: number
  ): Promise<{ items: MaintenanceLogItem[]; total: number }> {
    const where = this.maintenanceWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.vehicle_maintenance_logs.findMany({
        where,
        orderBy: orderBy(
          query.sortBy,
          query.sortOrder,
          'service_date',
          {
            service_date: 'service_date',
            cost: 'cost',
            service_type: 'service_type',
            vendor: 'vendor',
            odometer_km: 'odometer_km',
            vehicle_name: 'vehicle_name',
            created_at: 'created_at',
          },
          ['cost', 'vendor', 'odometer_km', 'created_at']
        ) as Prisma.vehicle_maintenance_logsOrderByWithRelationInput[],
        skip,
        take,
        include: { vehicles: { select: VEHICLE_SELECT } },
      }),
      this.prisma.vehicle_maintenance_logs.count({ where }),
    ]);
    return {
      total,
      items: rows.map(row => ({
        id: row.id.toString(),
        vehicleId: row.vehicle_id.toString(),
        maintenanceScheduleId: row.maintenance_schedule_id?.toString() ?? null,
        serviceType: row.service_type,
        serviceDate: row.service_date,
        odometerKm: num(row.odometer_km),
        cost: num(row.cost),
        vendor: row.vendor,
        notes: row.notes,
        loggedBy: row.logged_by?.toString() ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by?.toString() ?? null,
        vehicle: vehicleBrief(row.vehicles),
      })),
    };
  }

  /** Aggregates over the WHOLE filtered set (not the page). */
  async maintenanceSummary(filter: MaintenanceLogFilter): Promise<MaintenanceSummaryRaw> {
    const where = this.maintenanceWhere(filter);
    const [all, priced] = await Promise.all([
      this.prisma.vehicle_maintenance_logs.count({ where }),
      this.prisma.vehicle_maintenance_logs.aggregate({
        where: { AND: [where, { cost: { not: null } }] },
        _sum: { cost: true },
        _count: { _all: true },
      }),
    ]);
    return { count: all, totalCost: num(priced._sum.cost) ?? 0, withCost: priced._count._all };
  }

  // ===========================================================================
  // Fuel logs (C3)
  // ===========================================================================

  private fuelWhere(filter: FuelLogFilter): Prisma.fuel_logsWhereInput {
    const and: Prisma.fuel_logsWhereInput[] = [
      { vehicles: vehicleRelation(requireCompanyId(), filter.vehicleCategory) },
    ];
    if (filter.vehicleIds)
      and.push({ vehicle_id: { in: filter.vehicleIds.map(id => BigInt(id)) } });
    if (filter.from || filter.to)
      and.push({
        fill_date: {
          ...(filter.from ? { gte: filter.from } : {}),
          ...(filter.to ? { lte: filter.to } : {}),
        },
      });
    if (filter.vendor) and.push({ vendor: equalsInsensitive(filter.vendor) });
    if (filter.paymentMethod) and.push({ payment_method: equalsInsensitive(filter.paymentMethod) });
    if (filter.tripId) and.push({ trip_id: BigInt(filter.tripId) });
    if (filter.isFullTank !== undefined) and.push({ is_full_tank: filter.isFullTank });
    if (filter.search) {
      const term = containsInsensitive(filter.search);
      and.push({
        OR: [
          { vendor: term },
          { station_name: term },
          { receipt_reference: term },
          { payment_method: term },
          { vehicles: { name: term } },
          { vehicles: { plate: term } },
        ],
      });
    }
    return { AND: and };
  }

  async listFuelLogs(
    query: FuelLogListQuery,
    skip: number,
    take: number
  ): Promise<{ items: FuelLogItem[]; total: number }> {
    const where = this.fuelWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.fuel_logs.findMany({
        where,
        orderBy: orderBy(
          query.sortBy,
          query.sortOrder,
          'fill_date',
          {
            fill_date: 'fill_date',
            volume: 'volume',
            total_cost: 'total_cost',
            unit_price: 'unit_price',
            vendor: 'vendor',
            odometer_km: 'odometer_km',
            vehicle_name: 'vehicle_name',
            created_at: 'created_at',
          },
          ['total_cost', 'unit_price', 'vendor', 'odometer_km', 'created_at']
        ) as Prisma.fuel_logsOrderByWithRelationInput[],
        skip,
        take,
        include: { vehicles: { select: VEHICLE_SELECT } },
      }),
      this.prisma.fuel_logs.count({ where }),
    ]);
    return {
      total,
      items: rows.map(row => ({
        id: row.id.toString(),
        vehicleId: row.vehicle_id.toString(),
        fillDate: row.fill_date,
        volume: Number(row.volume),
        unit: row.unit,
        cost: num(row.cost),
        odometerKm: num(row.odometer_km),
        isFullTank: row.is_full_tank,
        vendor: row.vendor,
        loggedBy: row.logged_by?.toString() ?? null,
        stationName: row.station_name,
        unitPrice: num(row.unit_price),
        totalCost: num(row.total_cost),
        paymentMethod: row.payment_method,
        receiptReference: row.receipt_reference,
        tripId: row.trip_id?.toString() ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by?.toString() ?? null,
        vehicle: vehicleBrief(row.vehicles),
      })),
    };
  }

  /**
   * Aggregates over the WHOLE filtered set, done by the database (a company can have hundreds of thousands of fills). The cost follows the dashboard's
   * convention — `total_cost`, else `cost` — and the price per litre is judged over exactly the logs that carry a cost (the D-0186 lesson: one set).
   */
  async fuelSummary(filter: FuelLogFilter): Promise<FuelSummaryRaw> {
    const where = this.fuelWhere(filter);
    const totalPositive: Prisma.fuel_logsWhereInput = { total_cost: { gt: 0 } };
    const totalMissing: Prisma.fuel_logsWhereInput = {
      OR: [{ total_cost: null }, { total_cost: { lte: 0 } }],
    };
    const hasCost: Prisma.fuel_logsWhereInput = {
      OR: [{ total_cost: { gt: 0 } }, { cost: { gt: 0 } }],
    };
    const [byUnit, fromTotal, fromCost, pricedByUnit] = await Promise.all([
      this.prisma.fuel_logs.groupBy({
        by: ['unit'],
        where,
        _count: { _all: true },
        _sum: { volume: true },
      }),
      this.prisma.fuel_logs.aggregate({
        where: { AND: [where, totalPositive] },
        _sum: { total_cost: true },
        _count: { _all: true },
      }),
      this.prisma.fuel_logs.aggregate({
        where: { AND: [where, totalMissing, { cost: { gt: 0 } }] },
        _sum: { cost: true },
        _count: { _all: true },
      }),
      this.prisma.fuel_logs.groupBy({
        by: ['unit'],
        where: { AND: [where, hasCost] },
        _sum: { volume: true },
      }),
    ]);
    const liters = (rows: { unit: string; _sum: { volume: unknown } }[]): number =>
      rows.reduce(
        (n, r) => n + (num(r._sum.volume) ?? 0) * (r.unit === 'gallons' ? LITERS_PER_US_GALLON : 1),
        0
      );
    return {
      count: byUnit.reduce((n, r) => n + r._count._all, 0),
      liters: liters(byUnit),
      totalCost: (num(fromTotal._sum.total_cost) ?? 0) + (num(fromCost._sum.cost) ?? 0),
      pricedLiters: liters(pricedByUnit),
      withCost: fromTotal._count._all + fromCost._count._all,
    };
  }

  // ===========================================================================
  // Compliance counts (C4)
  // ===========================================================================

  /** Every compliance document of the company (small table); `compliance_documents` is `company`-ruled, so the tenant extension scopes it. */
  async complianceRowsForCounts(filter: ComplianceCountFilter): Promise<ComplianceCountRow[]> {
    const rows = await this.prisma.compliance_documents.findMany({
      where: {
        ...(filter.documentableType ? { documentable_type: filter.documentableType } : {}),
        ...(filter.documentType ? { document_type: equalsInsensitive(filter.documentType) } : {}),
      },
      select: { documentable_type: true, document_type: true, expiry_date: true },
    });
    return rows.map(row => ({
      documentableType: row.documentable_type,
      documentType: row.document_type,
      expiryDate: row.expiry_date,
    }));
  }
}
