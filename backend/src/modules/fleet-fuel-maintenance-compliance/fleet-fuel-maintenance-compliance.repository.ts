import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import {
  containsInsensitive,
  dateWithinDays,
  orderByWithTieBreak,
} from '../../platform/http/list-query.js';
import {
  toMaintenanceSchedule,
  toMaintenanceLog,
  toFuelLog,
  toComplianceDocument,
} from './fleet-fuel-maintenance-compliance.mapper.js';
import type {
  ComplianceDocument,
  ComplianceDocumentableType,
  ComplianceDocumentListQuery,
  CreateComplianceDocumentInput,
  CreateFuelLogInput,
  CreateMaintenanceLogInput,
  CreateMaintenanceScheduleInput,
  FuelLog,
  MaintenanceLog,
  MaintenanceSchedule,
  UpdateComplianceDocumentInput,
  UpdateFuelLogInput,
  UpdateMaintenanceLogInput,
  UpdateMaintenanceScheduleInput,
} from './fleet-fuel-maintenance-compliance.types.js';

/**
 * All Prisma access for module 4.5. `vehicle_maintenance_schedules`/
 * `vehicle_maintenance_logs`/`fuel_logs` are `parent:vehicles` (no own
 * tenant column, tenant-rules.ts) — reached only through an already
 * company-scoped `vehicle_id` the service layer verifies via
 * `FuelMaintenanceVehiclesLookup` first, same discipline module 4.1
 * established for `driver_incidents`. `compliance_documents` is
 * `company`-ruled — creates use the placeholder `company_id` (always
 * overwritten by the tenant-scoping extension, D-0077 precedent); reads
 * rely on the extension's ambient scoping via the request context.
 */
export class FleetFuelMaintenanceComplianceRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Maintenance schedules
  // ===========================================================================

  async createMaintenanceSchedule(
    vehicleId: string,
    input: CreateMaintenanceScheduleInput
  ): Promise<MaintenanceSchedule> {
    const row = await this.prisma.vehicle_maintenance_schedules.create({
      data: {
        vehicle_id: BigInt(vehicleId),
        service_type: input.serviceType,
        interval_days: input.intervalDays,
        interval_km: input.intervalKm,
        last_service_date: input.lastServiceDate,
        odometer_baseline_km: input.odometerBaselineKm,
        odometer_baseline_date: input.odometerBaselineDate,
        last_service_odometer_km: input.lastServiceOdometerKm,
      },
    });
    return toMaintenanceSchedule(row);
  }

  /** No own tenant column — the caller (`storeMaintenanceLog`) has already scoped `vehicleId` via `FuelMaintenanceVehiclesLookup`, and this method itself checks the schedule belongs to that same vehicle (Design notes: tighter than Laravel's bare `exists:vehicle_maintenance_schedules,id`, which has no scoping at all). */
  async findMaintenanceScheduleById(id: string): Promise<MaintenanceSchedule | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.vehicle_maintenance_schedules.findFirst({
      where: { id: BigInt(id) },
    });
    return row ? toMaintenanceSchedule(row) : undefined;
  }

  /** `VehicleController::storeMaintenanceLog`'s own linked-schedule update: `last_service_date` always set to the new log's date; `last_service_odometer_km` set from the log's odometer reading, falling back to the schedule's existing value when the log didn't record one. */
  async updateMaintenanceScheduleLastService(
    id: string,
    serviceDate: Date,
    odometerKm: number | null
  ): Promise<void> {
    const existing = await this.prisma.vehicle_maintenance_schedules.findFirst({
      where: { id: BigInt(id) },
    });
    if (!existing) return;
    await this.prisma.vehicle_maintenance_schedules.update({
      where: { id: BigInt(id) },
      data: {
        last_service_date: serviceDate,
        last_service_odometer_km: odometerKm ?? existing.last_service_odometer_km,
      },
    });
  }

  /** D-0169 (B3) — only the fields that were sent; the caller verified the schedule's vehicle belongs to the company. */
  async updateMaintenanceSchedule(
    id: string,
    input: UpdateMaintenanceScheduleInput
  ): Promise<MaintenanceSchedule | undefined> {
    if (!(await this.findMaintenanceScheduleById(id))) return undefined;
    const data: Prisma.vehicle_maintenance_schedulesUpdateInput = {};
    if (input.serviceType !== undefined) data.service_type = input.serviceType;
    if (input.intervalDays !== undefined) data.interval_days = input.intervalDays;
    if (input.intervalKm !== undefined) data.interval_km = input.intervalKm;
    if (input.lastServiceDate !== undefined) data.last_service_date = input.lastServiceDate;
    if (input.odometerBaselineKm !== undefined)
      data.odometer_baseline_km = input.odometerBaselineKm;
    if (input.odometerBaselineDate !== undefined)
      data.odometer_baseline_date = input.odometerBaselineDate;
    if (input.lastServiceOdometerKm !== undefined)
      data.last_service_odometer_km = input.lastServiceOdometerKm;
    const row = await this.prisma.vehicle_maintenance_schedules.update({
      where: { id: BigInt(id) },
      data,
    });
    return toMaintenanceSchedule(row);
  }

  /** D-0169 (B3): the schedule's logs are kept as history — they are unlinked first (the FK would otherwise refuse the delete), then the schedule is deleted. */
  async deleteMaintenanceScheduleKeepingLogs(id: string): Promise<boolean> {
    if (!(await this.findMaintenanceScheduleById(id))) return false;
    await this.prisma.vehicle_maintenance_logs.updateMany({
      where: { maintenance_schedule_id: BigInt(id) },
      data: { maintenance_schedule_id: null },
    });
    await this.prisma.vehicle_maintenance_schedules.delete({ where: { id: BigInt(id) } });
    return true;
  }

  /**
   * D-0169 (B3, owner Q8 "(a)"): the newest remaining log linked to a schedule (by `service_date`, then id) and the newest one that recorded an
   * odometer reading — what the schedule's `last_service_*` fields are recomputed from after a log is edited or deleted.
   */
  async newestLogsForSchedule(
    scheduleId: string
  ): Promise<{ latest?: MaintenanceLog; latestWithOdometer?: MaintenanceLog }> {
    const orderBy = [{ service_date: 'desc' as const }, { id: 'desc' as const }];
    const [latest, withOdometer] = await Promise.all([
      this.prisma.vehicle_maintenance_logs.findFirst({
        where: { maintenance_schedule_id: BigInt(scheduleId) },
        orderBy,
      }),
      this.prisma.vehicle_maintenance_logs.findFirst({
        where: { maintenance_schedule_id: BigInt(scheduleId), odometer_km: { not: null } },
        orderBy,
      }),
    ]);
    return {
      ...(latest ? { latest: toMaintenanceLog(latest) } : {}),
      ...(withOdometer ? { latestWithOdometer: toMaintenanceLog(withOdometer) } : {}),
    };
  }

  // ===========================================================================
  // Maintenance logs
  // ===========================================================================

  async createMaintenanceLog(
    vehicleId: string,
    loggedBy: string,
    input: CreateMaintenanceLogInput
  ): Promise<MaintenanceLog> {
    const row = await this.prisma.vehicle_maintenance_logs.create({
      data: {
        vehicle_id: BigInt(vehicleId),
        maintenance_schedule_id: input.maintenanceScheduleId
          ? BigInt(input.maintenanceScheduleId)
          : null,
        service_type: input.serviceType,
        service_date: input.serviceDate,
        odometer_km: input.odometerKm,
        cost: input.cost,
        vendor: input.vendor,
        notes: input.notes,
        logged_by: BigInt(loggedBy),
      },
    });
    return toMaintenanceLog(row);
  }

  async findMaintenanceLogById(id: string): Promise<MaintenanceLog | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.vehicle_maintenance_logs.findFirst({ where: { id: BigInt(id) } });
    return row ? toMaintenanceLog(row) : undefined;
  }

  /** D-0169 (B3) — only the fields that were sent (`maintenanceScheduleId: null` unlinks the log). */
  async updateMaintenanceLog(
    id: string,
    input: UpdateMaintenanceLogInput
  ): Promise<MaintenanceLog | undefined> {
    if (!(await this.findMaintenanceLogById(id))) return undefined;
    const data: Prisma.vehicle_maintenance_logsUncheckedUpdateInput = {};
    if (input.maintenanceScheduleId !== undefined)
      data.maintenance_schedule_id = input.maintenanceScheduleId
        ? BigInt(input.maintenanceScheduleId)
        : null;
    if (input.serviceType !== undefined) data.service_type = input.serviceType;
    if (input.serviceDate !== undefined) data.service_date = input.serviceDate;
    if (input.odometerKm !== undefined) data.odometer_km = input.odometerKm;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.vendor !== undefined) data.vendor = input.vendor;
    if (input.notes !== undefined) data.notes = input.notes;
    const row = await this.prisma.vehicle_maintenance_logs.update({
      where: { id: BigInt(id) },
      data,
    });
    return toMaintenanceLog(row);
  }

  async deleteMaintenanceLog(id: string): Promise<boolean> {
    if (!(await this.findMaintenanceLogById(id))) return false;
    await this.prisma.vehicle_maintenance_logs.delete({ where: { id: BigInt(id) } });
    return true;
  }

  // ===========================================================================
  // Fuel logs
  // ===========================================================================

  async createFuelLog(
    vehicleId: string,
    loggedBy: string,
    input: CreateFuelLogInput
  ): Promise<FuelLog> {
    const row = await this.prisma.fuel_logs.create({
      data: {
        vehicle_id: BigInt(vehicleId),
        fill_date: input.fillDate,
        volume: input.volume,
        unit: input.unit,
        cost: input.cost,
        odometer_km: input.odometerKm,
        is_full_tank: input.isFullTank,
        vendor: input.vendor,
        station_name: input.stationName,
        unit_price: input.unitPrice,
        total_cost: input.totalCost,
        payment_method: input.paymentMethod,
        receipt_reference: input.receiptReference,
        trip_id: input.tripId ? BigInt(input.tripId) : null,
        logged_by: BigInt(loggedBy),
      },
    });
    return toFuelLog(row);
  }

  // ===========================================================================
  // Compliance documents
  // ===========================================================================

  async findFuelLogById(id: string): Promise<FuelLog | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.fuel_logs.findFirst({ where: { id: BigInt(id) } });
    return row ? toFuelLog(row) : undefined;
  }

  /** D-0169 (B3) — only the fields that were sent. */
  async updateFuelLog(id: string, input: UpdateFuelLogInput): Promise<FuelLog | undefined> {
    if (!(await this.findFuelLogById(id))) return undefined;
    const data: Prisma.fuel_logsUncheckedUpdateInput = {};
    if (input.fillDate !== undefined) data.fill_date = input.fillDate;
    if (input.volume !== undefined) data.volume = input.volume;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.odometerKm !== undefined) data.odometer_km = input.odometerKm;
    if (input.isFullTank !== undefined) data.is_full_tank = input.isFullTank;
    if (input.vendor !== undefined) data.vendor = input.vendor;
    if (input.stationName !== undefined) data.station_name = input.stationName;
    if (input.unitPrice !== undefined) data.unit_price = input.unitPrice;
    if (input.totalCost !== undefined) data.total_cost = input.totalCost;
    if (input.paymentMethod !== undefined) data.payment_method = input.paymentMethod;
    if (input.receiptReference !== undefined) data.receipt_reference = input.receiptReference;
    if (input.tripId !== undefined) data.trip_id = input.tripId ? BigInt(input.tripId) : null;
    const row = await this.prisma.fuel_logs.update({ where: { id: BigInt(id) }, data });
    return toFuelLog(row);
  }

  async deleteFuelLog(id: string): Promise<boolean> {
    if (!(await this.findFuelLogById(id))) return false;
    await this.prisma.fuel_logs.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async findComplianceDocumentById(id: string): Promise<ComplianceDocument | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.compliance_documents.findFirst({ where: { id: BigInt(id) } });
    return row ? toComplianceDocument(row) : undefined;
  }

  /** D-0169 (B3) — `compliance_documents` is company-ruled, so the lookup above is already tenant-scoped. */
  async updateComplianceDocument(
    id: string,
    input: UpdateComplianceDocumentInput
  ): Promise<ComplianceDocument | undefined> {
    if (!(await this.findComplianceDocumentById(id))) return undefined;
    const data: Prisma.compliance_documentsUpdateInput = {};
    if (input.documentType !== undefined) data.document_type = input.documentType;
    if (input.documentNumber !== undefined) data.document_number = input.documentNumber;
    if (input.issueDate !== undefined) data.issue_date = input.issueDate;
    if (input.expiryDate !== undefined) data.expiry_date = input.expiryDate;
    if (input.notes !== undefined) data.notes = input.notes;
    const row = await this.prisma.compliance_documents.update({ where: { id: BigInt(id) }, data });
    return toComplianceDocument(row);
  }

  async deleteComplianceDocument(id: string): Promise<boolean> {
    if (!(await this.findComplianceDocumentById(id))) return false;
    await this.prisma.compliance_documents.delete({ where: { id: BigInt(id) } });
    return true;
  }

  async createComplianceDocument(
    documentableType: ComplianceDocumentableType,
    documentableId: string,
    input: CreateComplianceDocumentInput
  ): Promise<ComplianceDocument> {
    const row = await this.prisma.compliance_documents.create({
      data: {
        company_id: 0n, // placeholder — always overwritten by the tenant-scoping extension (D-0077 precedent)
        documentable_type: documentableType,
        documentable_id: BigInt(documentableId),
        document_type: input.documentType,
        document_number: input.documentNumber,
        issue_date: input.issueDate,
        expiry_date: input.expiryDate,
        notes: input.notes,
      },
    });
    return toComplianceDocument(row);
  }

  /** D-0164 (B1): search / filters / sort / optional paging (default order stays expiry date, latest first). */
  async listComplianceDocuments(
    documentableType: ComplianceDocumentableType,
    documentableId: string,
    query: ComplianceDocumentListQuery = {}
  ): Promise<{ items: ComplianceDocument[]; total: number }> {
    const and: Prisma.compliance_documentsWhereInput[] = [
      { documentable_type: documentableType, documentable_id: BigInt(documentableId) },
    ];
    if (query.documentType) and.push({ document_type: query.documentType });
    if (query.expiringWithinDays !== undefined) {
      const { from, to } = dateWithinDays(query.expiringWithinDays);
      and.push({ expiry_date: { gte: from, lte: to } });
    }
    if (query.expired !== undefined) {
      const { from: today } = dateWithinDays(0);
      and.push(
        query.expired
          ? { expiry_date: { lt: today } }
          : { OR: [{ expiry_date: null }, { expiry_date: { gte: today } }] }
      );
    }
    if (query.search) {
      const term = containsInsensitive(query.search);
      and.push({ OR: [{ document_number: term }, { document_type: term }, { notes: term }] });
    }
    const where: Prisma.compliance_documentsWhereInput = { AND: and };
    const orderBy = orderByWithTieBreak(
      query.sortBy,
      query.sortOrder,
      [{ expiry_date: 'desc' }],
      ['expiry_date', 'created_at']
    ) as Prisma.compliance_documentsOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.compliance_documents.findMany({
        where,
        orderBy,
        ...(query.window
          ? { skip: (query.window.page - 1) * query.window.perPage, take: query.window.perPage }
          : {}),
      }),
      query.window ? this.prisma.compliance_documents.count({ where }) : Promise.resolve(0),
    ]);
    return { items: rows.map(toComplianceDocument), total: query.window ? total : rows.length };
  }

  /** `ComplianceDocumentController::expiringSoon` — expiring within `withinDays` OR already expired (no lower bound), company-wide across both documentable types. Relies on the tenant-scoping extension's ambient `company_id` filter (`compliance_documents` is `company`-ruled). */
  async listExpiringSoonComplianceDocuments(withinDays: number): Promise<ComplianceDocument[]> {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.compliance_documents.findMany({
      where: { expiry_date: { not: null, lte: cutoff } },
      orderBy: { expiry_date: 'asc' },
    });
    return rows.map(toComplianceDocument);
  }
}
