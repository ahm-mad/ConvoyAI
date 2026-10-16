import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { ScheduleWithVehicle } from './fleet-maintenance-due.types.js';

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** All Prisma access for module 4.10. `vehicle_maintenance_schedules` is `parent:vehicles` — company-scoped here through `vehicles.company_id`, explicitly. */
export class FleetMaintenanceDueRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  /** Every schedule of the caller's company with its vehicle (retired / sold vehicles only when `includeInactive`); the due state is computed by the service. */
  async listSchedulesForCompany(includeInactive: boolean): Promise<ScheduleWithVehicle[]> {
    const companyId = getRequestContext()?.companyId;
    if (!companyId)
      throw new Error('fleet-maintenance-due repository called with no company in context.');
    const rows = await this.prisma.vehicle_maintenance_schedules.findMany({
      where: {
        vehicles: {
          company_id: BigInt(companyId),
          ...(includeInactive ? {} : { lifecycle_status: { notIn: ['retired', 'sold'] } }),
        },
      },
      include: {
        vehicles: {
          select: { id: true, name: true, plate: true, vehicle_category: true, odometer_km: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(row => ({
      id: row.id.toString(),
      vehicleId: row.vehicle_id.toString(),
      serviceType: row.service_type,
      intervalDays: row.interval_days,
      intervalKm: row.interval_km,
      lastServiceDate: row.last_service_date,
      odometerBaselineKm: num(row.odometer_baseline_km),
      odometerBaselineDate: row.odometer_baseline_date,
      lastServiceOdometerKm: num(row.last_service_odometer_km),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by?.toString() ?? null,
      updatedBy: row.updated_by?.toString() ?? null,
      vehicle: {
        id: row.vehicles.id.toString(),
        name: row.vehicles.name,
        plate: row.vehicles.plate,
        category: row.vehicles.vehicle_category,
        odometerKm: num(row.vehicles.odometer_km),
      },
    }));
  }
}
