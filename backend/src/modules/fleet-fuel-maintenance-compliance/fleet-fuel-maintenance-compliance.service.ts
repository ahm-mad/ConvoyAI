import { isOverdueByDate, nextServiceDate } from '../../shared/utils/maintenance-due.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { listData } from '../../platform/http/list-query.js';
import {
  auditFields,
  loadActors,
  type ActorDirectory,
  type ActorMap,
} from '../../platform/http/actors.js';
import { assertFresh, assertNotStale } from '../../platform/http/concurrency.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import type { FleetFuelMaintenanceComplianceRepository } from './fleet-fuel-maintenance-compliance.repository.js';
import type {
  ComplianceDocument,
  ComplianceDocumentableType,
  ComplianceDocumentListQuery,
  CreateComplianceDocumentInput,
  CreateFuelLogInput,
  CreateMaintenanceLogInput,
  CreateMaintenanceScheduleInput,
  FuelLog,
  FuelMaintenanceDriversLookup,
  FuelMaintenanceTripsLookup,
  FuelMaintenanceVehiclesLookup,
  MaintenanceLog,
  MaintenanceSchedule,
  UpdateComplianceDocumentInput,
  UpdateFuelLogInput,
  UpdateMaintenanceLogInput,
  UpdateMaintenanceScheduleInput,
} from './fleet-fuel-maintenance-compliance.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

/**
 * Business logic for module 4.5. `driver_incidents` CRUD is deliberately
 * absent here despite the task-18 stub/HANDOFF listing it — it is already
 * fully built and routed in module 4.1 (`POST /drivers/{driverId}/
 * incidents`, D-0077); the stub was written in Phase 0 before module 4.1
 * existed and was never refreshed (Design notes, logged in DECISIONS.md).
 */
export class FleetFuelMaintenanceComplianceService {
  constructor(
    private readonly repo: FleetFuelMaintenanceComplianceRepository,
    private readonly vehiclesLookup: FuelMaintenanceVehiclesLookup,
    private readonly driversLookup: FuelMaintenanceDriversLookup,
    private readonly tripsLookup: FuelMaintenanceTripsLookup,
    private readonly usersLookup: ActorDirectory
  ) {}

  /** D-0172 (B6): one batched lookup of the people behind a response's `created_by` / `updated_by` ids (a record's creator is `logged_by` on logs). */
  private actorsFor(...ids: Array<string | null>): Promise<ActorMap> {
    return loadActors(this.usersLookup, ids);
  }

  // ===========================================================================
  // JSON shaping
  // ===========================================================================

  private maintenanceScheduleJson(m: MaintenanceSchedule, actors: ActorMap): Json {
    return {
      id: m.id,
      vehicle_id: m.vehicleId,
      service_type: m.serviceType,
      interval_days: m.intervalDays,
      interval_km: m.intervalKm,
      last_service_date: m.lastServiceDate,
      next_service_date: nextServiceDate(m.lastServiceDate, m.intervalDays),
      is_overdue_by_date: isOverdueByDate(nextServiceDate(m.lastServiceDate, m.intervalDays)),
      odometer_baseline_km: m.odometerBaselineKm,
      odometer_baseline_date: m.odometerBaselineDate,
      last_service_odometer_km: m.lastServiceOdometerKm,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
      ...auditFields(actors, m.createdBy, m.updatedBy),
    };
  }

  private maintenanceLogJson(m: MaintenanceLog, actors: ActorMap): Json {
    return {
      id: m.id,
      vehicle_id: m.vehicleId,
      maintenance_schedule_id: m.maintenanceScheduleId,
      service_type: m.serviceType,
      service_date: m.serviceDate,
      odometer_km: m.odometerKm,
      cost: m.cost,
      vendor: m.vendor,
      notes: m.notes,
      logged_by: m.loggedBy,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
      ...auditFields(actors, m.loggedBy, m.updatedBy),
    };
  }

  private fuelLogJson(f: FuelLog, actors: ActorMap): Json {
    return {
      id: f.id,
      vehicle_id: f.vehicleId,
      fill_date: f.fillDate,
      volume: f.volume,
      unit: f.unit,
      cost: f.cost,
      odometer_km: f.odometerKm,
      is_full_tank: f.isFullTank,
      vendor: f.vendor,
      logged_by: f.loggedBy,
      station_name: f.stationName,
      unit_price: f.unitPrice,
      total_cost: f.totalCost,
      payment_method: f.paymentMethod,
      receipt_reference: f.receiptReference,
      trip_id: f.tripId,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
      ...auditFields(actors, f.loggedBy, f.updatedBy),
    };
  }

  private complianceDocumentJson(d: ComplianceDocument, actors: ActorMap): Json {
    return {
      id: d.id,
      company_id: d.companyId,
      documentable_type: d.documentableType,
      documentable_id: d.documentableId,
      document_type: d.documentType,
      document_number: d.documentNumber,
      issue_date: d.issueDate,
      expiry_date: d.expiryDate,
      file_path: d.filePath,
      notes: d.notes,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      ...auditFields(actors, d.createdBy, d.updatedBy),
    };
  }

  /** `ComplianceDocumentController::expiringSoon`'s eager-loaded `documentable` — a lean brief per type (Design notes: not a full raw-column dump, same "lean response" precedent as D-0045), `null` if the target driver/vehicle no longer exists (compliance_documents has no FK to either side, so this can genuinely happen on a hard delete elsewhere). */
  private async documentableBrief(document: ComplianceDocument): Promise<Json | null> {
    if (document.documentableType === 'driver') {
      const driver = await this.driversLookup.findDriverById(document.documentableId);
      return driver
        ? { id: driver.id, first_name: driver.firstName, last_name: driver.lastName }
        : null;
    }
    const vehicle = await this.vehiclesLookup.findVehicleById(document.documentableId);
    return vehicle ? { id: vehicle.id, name: vehicle.name } : null;
  }

  // ===========================================================================
  // Maintenance schedules
  // ===========================================================================

  async storeMaintenanceSchedule(vehicleId: string, input: CreateMaintenanceScheduleInput) {
    const vehicle = await this.vehiclesLookup.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    const schedule = await this.repo.createMaintenanceSchedule(vehicleId, input);
    return {
      success: true,
      message: 'Maintenance schedule created.',
      data: this.maintenanceScheduleJson(
        schedule,
        await this.actorsFor(schedule.createdBy, schedule.updatedBy)
      ),
    };
  }

  // ===========================================================================
  // Maintenance logs
  // ===========================================================================

  /** `VehicleController::storeMaintenanceLog` — `maintenance_schedule_id` tightened past Laravel's bare `exists:vehicle_maintenance_schedules,id` (no scoping at all) to require the schedule belong to this same vehicle. */
  async storeMaintenanceLog(vehicleId: string, input: CreateMaintenanceLogInput) {
    const vehicle = await this.vehiclesLookup.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    if (input.maintenanceScheduleId !== null) {
      const schedule = await this.repo.findMaintenanceScheduleById(input.maintenanceScheduleId);
      if (!schedule || schedule.vehicleId !== vehicleId) {
        throw new ValidationError('The selected maintenance schedule id is invalid.', {
          maintenance_schedule_id: ['The selected maintenance schedule id is invalid.'],
        });
      }
    }

    const context = requireContext();
    const log = await this.repo.createMaintenanceLog(vehicleId, context.userId, input);

    if (input.maintenanceScheduleId !== null) {
      await this.repo.updateMaintenanceScheduleLastService(
        input.maintenanceScheduleId,
        input.serviceDate,
        input.odometerKm
      );
    }

    return {
      success: true,
      message: 'Maintenance logged.',
      data: this.maintenanceLogJson(log, await this.actorsFor(log.loggedBy, log.updatedBy)),
    };
  }

  // ===========================================================================
  // Fuel logs
  // ===========================================================================

  /** `VehicleController::storeFuelLog` — `trip_id` (11.3, extend_fuel_logs) is a brand-new field Laravel never accepted at all, so there is no existing bug shape to match; tightened from day one to require the trip belong to this same vehicle. */
  // ===========================================================================
  // D-0169 (B3): edit / delete for the log-type records. The tables carry no tenant column of their own, so every id is first resolved to
  // its vehicle and that vehicle checked against the caller's company (a record of another company is a plain 404, like a missing one).
  // ===========================================================================

  private async scheduleForCaller(id: string): Promise<MaintenanceSchedule> {
    const schedule = await this.repo.findMaintenanceScheduleById(id);
    if (!schedule || !(await this.vehiclesLookup.findVehicleById(schedule.vehicleId)))
      throw new NotFoundError('Maintenance schedule not found.');
    return schedule;
  }

  private async maintenanceLogForCaller(id: string): Promise<MaintenanceLog> {
    const log = await this.repo.findMaintenanceLogById(id);
    if (!log || !(await this.vehiclesLookup.findVehicleById(log.vehicleId)))
      throw new NotFoundError('Maintenance log not found.');
    return log;
  }

  private async fuelLogForCaller(id: string): Promise<FuelLog> {
    const log = await this.repo.findFuelLogById(id);
    if (!log || !(await this.vehiclesLookup.findVehicleById(log.vehicleId)))
      throw new NotFoundError('Fuel log not found.');
    return log;
  }

  /**
   * Owner Q8 "(a)": after a maintenance log is edited, re-linked or deleted, each schedule it touched takes its `last_service_date` from its
   * newest remaining linked log (by service date, then id) and its `last_service_odometer_km` from the newest one that recorded an odometer
   * reading; when no log remains the schedule keeps its current values (the original baseline cannot be recovered once overwritten).
   */
  private async resyncSchedule(scheduleId: string | null): Promise<void> {
    if (!scheduleId) return;
    const { latest, latestWithOdometer } = await this.repo.newestLogsForSchedule(scheduleId);
    if (!latest) return;
    await this.repo.updateMaintenanceScheduleLastService(
      scheduleId,
      latest.serviceDate,
      latestWithOdometer?.odometerKm ?? null
    );
  }

  async updateMaintenanceSchedule(
    id: string,
    input: UpdateMaintenanceScheduleInput,
    expectedUpdatedAt?: Date | null
  ) {
    const current = await this.scheduleForCaller(id);
    await assertNotStale(expectedUpdatedAt, current, this.usersLookup); // D-0176 (B13)
    const updated = await this.repo.updateMaintenanceSchedule(id, input);
    if (!updated) throw new NotFoundError('Maintenance schedule not found.');
    return {
      success: true,
      message: 'Maintenance schedule updated.',
      data: this.maintenanceScheduleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  /** The schedule's logs are kept as history and unlinked. */
  async deleteMaintenanceSchedule(id: string) {
    await this.scheduleForCaller(id);
    if (!(await this.repo.deleteMaintenanceScheduleKeepingLogs(id)))
      throw new NotFoundError('Maintenance schedule not found.');
    return {
      success: true,
      message: 'Maintenance schedule deleted. Its maintenance logs were kept.',
    };
  }

  async updateMaintenanceLog(
    id: string,
    input: UpdateMaintenanceLogInput,
    expectedUpdatedAt?: Date | null
  ) {
    const log = await this.maintenanceLogForCaller(id);
    await assertNotStale(expectedUpdatedAt, log, this.usersLookup); // D-0176 (B13)
    if (input.maintenanceScheduleId) {
      const schedule = await this.repo.findMaintenanceScheduleById(input.maintenanceScheduleId);
      if (!schedule || schedule.vehicleId !== log.vehicleId) {
        throw new ValidationError('The selected maintenance schedule id is invalid.', {
          maintenance_schedule_id: ['The selected maintenance schedule id is invalid.'],
        });
      }
    }
    const updated = await this.repo.updateMaintenanceLog(id, input);
    if (!updated) throw new NotFoundError('Maintenance log not found.');
    for (const scheduleId of new Set([log.maintenanceScheduleId, updated.maintenanceScheduleId]))
      await this.resyncSchedule(scheduleId);
    return {
      success: true,
      message: 'Maintenance log updated.',
      data: this.maintenanceLogJson(
        updated,
        await this.actorsFor(updated.loggedBy, updated.updatedBy)
      ),
    };
  }

  async deleteMaintenanceLog(id: string) {
    const log = await this.maintenanceLogForCaller(id);
    if (!(await this.repo.deleteMaintenanceLog(id)))
      throw new NotFoundError('Maintenance log not found.');
    await this.resyncSchedule(log.maintenanceScheduleId);
    return { success: true, message: 'Maintenance log deleted.' };
  }

  async updateFuelLog(id: string, input: UpdateFuelLogInput, expectedUpdatedAt?: Date | null) {
    const log = await this.fuelLogForCaller(id);
    await assertNotStale(expectedUpdatedAt, log, this.usersLookup); // D-0176 (B13)
    if (input.tripId) {
      const trip = await this.tripsLookup.findTripById(input.tripId);
      if (!trip || trip.vehicleId !== log.vehicleId) {
        throw new ValidationError('The selected trip id is invalid.', {
          trip_id: ['The selected trip id is invalid.'],
        });
      }
    }
    const updated = await this.repo.updateFuelLog(id, input);
    if (!updated) throw new NotFoundError('Fuel log not found.');
    return {
      success: true,
      message: 'Fuel log updated.',
      data: this.fuelLogJson(updated, await this.actorsFor(updated.loggedBy, updated.updatedBy)),
    };
  }

  async deleteFuelLog(id: string) {
    await this.fuelLogForCaller(id);
    if (!(await this.repo.deleteFuelLog(id))) throw new NotFoundError('Fuel log not found.');
    return { success: true, message: 'Fuel log deleted.' };
  }

  async updateComplianceDocument(
    id: string,
    input: UpdateComplianceDocumentInput,
    expectedUpdatedAt?: Date | null
  ) {
    await assertFresh(
      expectedUpdatedAt,
      () => this.repo.findComplianceDocumentById(id),
      'Document not found.',
      this.usersLookup
    ); // D-0176 (B13)
    const updated = await this.repo.updateComplianceDocument(id, input);
    if (!updated) throw new NotFoundError('Document not found.');
    return {
      success: true,
      message: 'Document updated.',
      data: this.complianceDocumentJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async deleteComplianceDocument(id: string) {
    if (!(await this.repo.deleteComplianceDocument(id)))
      throw new NotFoundError('Document not found.');
    return { success: true, message: 'Document deleted.' };
  }

  async storeFuelLog(vehicleId: string, input: CreateFuelLogInput) {
    const vehicle = await this.vehiclesLookup.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    if (input.tripId !== null) {
      const trip = await this.tripsLookup.findTripById(input.tripId);
      if (!trip || trip.vehicleId !== vehicleId) {
        throw new ValidationError('The selected trip id is invalid.', {
          trip_id: ['The selected trip id is invalid.'],
        });
      }
    }

    const context = requireContext();
    const log = await this.repo.createFuelLog(vehicleId, context.userId, input);
    return {
      success: true,
      message: 'Fuel logged.',
      data: this.fuelLogJson(log, await this.actorsFor(log.loggedBy, log.updatedBy)),
    };
  }

  // ===========================================================================
  // Compliance documents
  // ===========================================================================

  private async resolveOwner(
    documentableType: ComplianceDocumentableType,
    documentableId: string
  ): Promise<{ id: string } | undefined> {
    return documentableType === 'driver'
      ? this.driversLookup.findDriverById(documentableId)
      : this.vehiclesLookup.findVehicleById(documentableId);
  }

  async storeComplianceDocument(input: CreateComplianceDocumentInput) {
    const owner = await this.resolveOwner(input.documentableType, input.documentableId);
    if (!owner) throw new NotFoundError('Not found or not accessible.');

    const document = await this.repo.createComplianceDocument(
      input.documentableType,
      owner.id,
      input
    );
    return {
      success: true,
      message: 'Document added.',
      data: this.complianceDocumentJson(
        document,
        await this.actorsFor(document.createdBy, document.updatedBy)
      ),
    };
  }

  /** D-0164 (B1): filters/search/sort + opt-in paging (still scoped to one driver/vehicle, as before). */
  async listComplianceDocuments(
    documentableType: ComplianceDocumentableType,
    documentableId: string,
    query: ComplianceDocumentListQuery = {}
  ) {
    const owner = await this.resolveOwner(documentableType, documentableId);
    if (!owner) throw new NotFoundError('Not found or not accessible.');

    const { items, total } = await this.repo.listComplianceDocuments(
      documentableType,
      owner.id,
      query
    );
    const actors = await this.actorsFor(...items.flatMap(d => [d.createdBy, d.updatedBy]));
    return {
      success: true,
      message: 'Documents retrieved.',
      data: listData(
        items.map(d => this.complianceDocumentJson(d, actors)),
        total,
        query.window
      ),
    };
  }

  /** `ComplianceDocumentController::expiringSoon` — company-wide, both types, `withinDays` (default 30 = the original behaviour; D-0188 made it a query parameter) OR already expired. */
  async listExpiringSoonComplianceDocuments(withinDays = 30) {
    const documents = await this.repo.listExpiringSoonComplianceDocuments(withinDays);
    const actors = await this.actorsFor(...documents.flatMap(d => [d.createdBy, d.updatedBy]));
    const data: Json[] = [];
    for (const document of documents) {
      data.push({
        ...this.complianceDocumentJson(document, actors),
        documentable: await this.documentableBrief(document),
      });
    }
    return { success: true, message: 'Expiring documents retrieved.', data };
  }
}
