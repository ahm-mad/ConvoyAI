import { isOverdueByDate, nextServiceDate } from '../../shared/utils/maintenance-due.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  AVAILABILITY_STATUSES,
  EMPLOYMENT_STATUSES,
  FUEL_TYPES,
  OWNERSHIP_TYPES,
} from './fleet-vehicles-drivers.constants.js';
import { listData, optionsResponse } from '../../platform/http/list-query.js';
import { auditFields, loadActors, type ActorMap } from '../../platform/http/actors.js';
import { assertNeverUsed } from '../../platform/http/hard-delete.js';
import { statusCounts } from '../../platform/http/counts.js';
import { assertFresh, assertNotStale } from '../../platform/http/concurrency.js';
import { BULK_LIMIT, bulkResponse, resolveBulkTargets, runBulk } from '../../platform/http/bulk.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import type { FleetChangedAction, FleetChangedEntity } from '../../platform/realtime/events.js';
import type { FleetRealtimePort } from '../../platform/realtime/fleet-realtime.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { haversineMeters } from '../../shared/utils/geo.js';
import { uploadObject, deleteObject, keyFromUrl } from '../../platform/storage/r2-storage.js';
import { imageSize } from 'image-size';
import {
  isLicenseExpired,
  isLicenseExpiringSoon,
  assignmentIsActive,
  assignmentDurationDays,
} from './fleet-vehicles-drivers.mapper.js';
import type { FleetVehiclesDriversRepository } from './fleet-vehicles-drivers.repository.js';
import type {
  IncidentBriefs,
  AssignmentHistoryFilters,
  CreateDriverInput,
  CreateIncidentInput,
  CreateVehicleInput,
  Driver,
  DriverIncident,
  DriverListQuery,
  DriverOption,
  DriverOptionsQuery,
  DriverVehicleAssignment,
  FleetDevicesLookup,
  FleetUsersLookup,
  FleetYardHistoryLookup,
  FuelLog,
  FuelLogListQuery,
  IncidentListQuery,
  MaintenanceLog,
  MaintenanceLogListQuery,
  YardHistoryEntry,
  YardHistoryListQuery,
  UpdateDriverInput,
  UpdateIncidentInput,
  UpdateVehicleInput,
  Vehicle,
  VehicleListQuery,
  VehicleOption,
  VehicleOptionsQuery,
  VehiclesTripsLookup,
} from './fleet-vehicles-drivers.types.js';

const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/** D-0168 (B11) — the vehicle CSV's documented column set (header → value). */
const VEHICLE_EXPORT_COLUMNS: CsvColumn<VehicleOption>[] = [
  { header: 'id', value: r => r.vehicle.id },
  { header: 'name', value: r => r.vehicle.name },
  { header: 'plate', value: r => r.vehicle.plate },
  { header: 'vin', value: r => r.vehicle.vin },
  { header: 'vehicle_category', value: r => r.vehicle.vehicleCategory },
  { header: 'make', value: r => r.vehicle.make },
  { header: 'model', value: r => r.vehicle.model },
  { header: 'year', value: r => r.vehicle.year },
  { header: 'fuel_type', value: r => r.vehicle.fuelType },
  { header: 'ownership_type', value: r => r.vehicle.ownershipType },
  { header: 'lifecycle_status', value: r => r.vehicle.lifecycleStatus },
  { header: 'odometer_km', value: r => r.vehicle.odometerKm },
  { header: 'tank_capacity_liters', value: r => r.vehicle.tankCapacityLiters },
  { header: 'cost_centre', value: r => r.vehicle.costCentre },
  { header: 'acquisition_date', value: r => dateOnly(r.vehicle.acquisitionDate) },
  { header: 'acquisition_cost', value: r => r.vehicle.acquisitionCost },
  { header: 'length_m', value: r => r.vehicle.lengthM },
  { header: 'width_m', value: r => r.vehicle.widthM },
  { header: 'height_m', value: r => r.vehicle.heightM },
  { header: 'gross_weight_kg', value: r => r.vehicle.grossWeightKg },
  { header: 'payload_kg', value: r => r.vehicle.payloadKg },
  { header: 'has_driver', value: r => r.hasDriver },
  { header: 'has_tracker', value: r => r.hasTracker },
  { header: 'checked_in', value: r => r.checkedIn },
  { header: 'created_at', value: r => r.vehicle.createdAt },
];

/** D-0168 (B11) — the driver CSV's documented column set. */
const DRIVER_EXPORT_COLUMNS: CsvColumn<DriverOption>[] = [
  { header: 'id', value: r => r.driver.id },
  { header: 'first_name', value: r => r.driver.firstName },
  { header: 'last_name', value: r => r.driver.lastName },
  { header: 'email', value: r => r.driver.email },
  { header: 'phone', value: r => r.driver.phone },
  { header: 'license_number', value: r => r.driver.licenseNumber },
  { header: 'license_class', value: r => r.driver.licenseClass },
  { header: 'license_expiry_date', value: r => dateOnly(r.driver.licenseExpiryDate) },
  { header: 'status', value: r => r.driver.status },
  { header: 'employment_status', value: r => r.driver.employmentStatus },
  { header: 'availability_status', value: r => r.driver.availabilityStatus },
  { header: 'payroll_reference', value: r => r.driver.payrollReference },
  { header: 'hire_date', value: r => dateOnly(r.driver.hireDate) },
  { header: 'assigned', value: r => r.assigned },
  { header: 'created_at', value: r => r.driver.createdAt },
];

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

const KM_PER_METER = 0.001;

/**
 * Business logic for module 4.1 (`VehicleController`/`DriverController`,
 * `app/Domain/Devices/Http/Controllers/`). `show()`'s `maintenance_schedules`/
 * `maintenance_logs`/`fuel_logs`/`fuel_economy` fields are real reads
 * against already-frozen tables (`vehicle_maintenance_schedules`/
 * `vehicle_maintenance_logs`/`fuel_logs`) — genuinely populated once
 * module 18 (fleet-fuel-maintenance-compliance) builds their write side,
 * empty until then; this module does not implement `storeMaintenanceSchedule`/
 * `storeMaintenanceLog`/`storeFuelLog` (task file's own "Out" scope: "Fuel/
 * maintenance/compliance -> 18"). `yard_history` stays an empty array —
 * unlike the above, it needs `yard_slots`/`yards` (module 4.4, an entirely
 * separate, not-yet-designed tenant-scoping shape), not just an empty
 * table (Design notes).
 */
export class FleetVehiclesDriversService {
  constructor(
    private readonly repo: FleetVehiclesDriversRepository,
    private readonly devicesLookup: FleetDevicesLookup,
    private readonly usersLookup: FleetUsersLookup,
    private readonly yardHistoryLookup: FleetYardHistoryLookup,
    private readonly tripsLookup: VehiclesTripsLookup,
    private readonly realtime: FleetRealtimePort
  ) {}
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
  // JSON shaping helpers
  // ===========================================================================

  private baseVehicleJson(vehicle: Vehicle, actors: ActorMap): Json {
    return {
      id: vehicle.id,
      company_id: vehicle.companyId,
      name: vehicle.name,
      vehicle_category: vehicle.vehicleCategory,
      make: vehicle.make,
      model: vehicle.model,
      plate: vehicle.plate,
      vin: vehicle.vin,
      year: vehicle.year,
      fuel_type: vehicle.fuelType,
      tank_capacity_liters: vehicle.tankCapacityLiters,
      odometer_km: vehicle.odometerKm,
      ownership_type: vehicle.ownershipType,
      cost_centre: vehicle.costCentre,
      lifecycle_status: vehicle.lifecycleStatus,
      acquisition_date: vehicle.acquisitionDate,
      acquisition_cost: vehicle.acquisitionCost,
      length_m: vehicle.lengthM,
      width_m: vehicle.widthM,
      height_m: vehicle.heightM,
      gross_weight_kg: vehicle.grossWeightKg,
      payload_kg: vehicle.payloadKg,
      image_path: vehicle.imagePath,
      image_url: vehicle.imagePath,
      created_at: vehicle.createdAt,
      updated_at: vehicle.updatedAt,
      ...auditFields(actors, vehicle.createdBy, vehicle.updatedBy),
    };
  }

  /** `index()`/`show()`'s eager-loaded `current_device_assignment.device`/`current_driver_assignment.driver` — `uploadImage`'s `fresh()` response does not include these (Design notes: matched by callers using `baseVehicleJson` directly instead). */
  private async vehicleJsonWithAssignments(vehicle: Vehicle, actors?: ActorMap): Promise<Json> {
    const [deviceAssignment, driverAssignment] = await Promise.all([
      this.repo.currentDeviceAssignmentForVehicle(vehicle.id),
      this.repo.currentAssignmentForVehicle(vehicle.id),
    ]);

    let currentDeviceAssignment: Json | null = null;
    if (deviceAssignment) {
      const device = await this.devicesLookup.findByIdUnscoped(deviceAssignment.deviceId);
      currentDeviceAssignment = {
        id: deviceAssignment.id,
        vehicle_id: deviceAssignment.vehicleId,
        device_id: deviceAssignment.deviceId,
        assigned_at: deviceAssignment.assignedAt,
        unassigned_at: deviceAssignment.unassignedAt,
        device: device
          ? {
              id: device.id,
              name: device.name,
              device_unique_identifier: device.deviceUniqueIdentifier,
            }
          : null,
      };
    }

    let currentDriverAssignment: Json | null = null;
    if (driverAssignment) {
      const driver = await this.repo.findDriverById(driverAssignment.driverId);
      currentDriverAssignment = {
        id: driverAssignment.id,
        driver_id: driverAssignment.driverId,
        vehicle_id: driverAssignment.vehicleId,
        assigned_at: driverAssignment.assignedAt,
        unassigned_at: driverAssignment.unassignedAt,
        driver: driver
          ? { id: driver.id, first_name: driver.firstName, last_name: driver.lastName }
          : null,
      };
    }

    return {
      ...this.baseVehicleJson(
        vehicle,
        actors ?? (await this.actorsFor(vehicle.createdBy, vehicle.updatedBy))
      ),
      current_device_assignment: currentDeviceAssignment,
      current_driver_assignment: currentDriverAssignment,
    };
  }

  private baseDriverJson(driver: Driver, now: Date, actors: ActorMap): Json {
    return {
      id: driver.id,
      company_id: driver.companyId,
      first_name: driver.firstName,
      last_name: driver.lastName,
      email: driver.email,
      phone: driver.phone,
      license_number: driver.licenseNumber,
      license_class: driver.licenseClass,
      license_expiry_date: driver.licenseExpiryDate,
      status: driver.status,
      employment_status: driver.employmentStatus,
      availability_status: driver.availabilityStatus,
      certifications: driver.certifications,
      payroll_reference: driver.payrollReference,
      hire_date: driver.hireDate,
      photo_path: driver.photoPath,
      created_at: driver.createdAt,
      updated_at: driver.updatedAt,
      ...auditFields(actors, driver.createdBy, driver.updatedBy),
      is_license_expired: isLicenseExpired(driver.licenseExpiryDate, now),
      is_license_expiring_soon: isLicenseExpiringSoon(driver.licenseExpiryDate, now),
    };
  }

  /** `index()`'s eager-loaded `current_assignment.vehicle:id,name,vehicle_category,lifecycle_status`; `show()` (`withTracker`) additionally eager-loads `currentAssignment.vehicle.currentDeviceAssignment.device:id,name` (KNOWN_ISSUES 11.80 — Node never ported that load). */
  private async driverJsonWithCurrentAssignment(
    driver: Driver,
    now: Date,
    withTracker = false,
    actors?: ActorMap
  ): Promise<Json> {
    const assignment = await this.repo.currentAssignmentForDriver(driver.id);
    let currentAssignment: Json | null = null;
    if (assignment) {
      const vehicle = await this.repo.findVehicleById(assignment.vehicleId);
      let currentDeviceAssignment: Json | null = null;
      if (withTracker && vehicle) {
        const deviceAssignment = await this.repo.currentDeviceAssignmentForVehicle(vehicle.id);
        if (deviceAssignment) {
          const device = await this.devicesLookup.findByIdUnscoped(deviceAssignment.deviceId);
          currentDeviceAssignment = {
            id: deviceAssignment.id,
            vehicle_id: deviceAssignment.vehicleId,
            device_id: deviceAssignment.deviceId,
            assigned_at: deviceAssignment.assignedAt,
            unassigned_at: deviceAssignment.unassignedAt,
            device: device ? { id: device.id, name: device.name } : null,
          };
        }
      }
      currentAssignment = {
        id: assignment.id,
        driver_id: assignment.driverId,
        vehicle_id: assignment.vehicleId,
        assigned_at: assignment.assignedAt,
        unassigned_at: assignment.unassignedAt,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              name: vehicle.name,
              vehicle_category: vehicle.vehicleCategory,
              lifecycle_status: vehicle.lifecycleStatus,
              ...(withTracker ? { current_device_assignment: currentDeviceAssignment } : {}),
            }
          : null,
      };
    }
    return {
      ...this.baseDriverJson(
        driver,
        now,
        actors ?? (await this.actorsFor(driver.createdBy, driver.updatedBy))
      ),
      current_assignment: currentAssignment,
    };
  }

  private assignmentJson(assignment: DriverVehicleAssignment, extras: Json = {}): Json {
    return {
      id: assignment.id,
      driver_id: assignment.driverId,
      vehicle_id: assignment.vehicleId,
      assigned_at: assignment.assignedAt,
      unassigned_at: assignment.unassignedAt,
      assigned_by: assignment.assignedBy,
      unassigned_by: assignment.unassignedBy,
      notes: assignment.notes,
      trip_count: assignment.tripCount,
      distance_km: assignment.distanceKm,
      created_at: assignment.createdAt,
      updated_at: assignment.updatedAt,
      is_active: assignmentIsActive(assignment),
      duration_days: assignmentDurationDays(assignment),
      ...extras,
    };
  }

  /** D-0172 (B6): one batched lookup of the people behind a response's `created_by` / `updated_by` ids (a record's creator is `logged_by` on logs and incidents). */
  private actorsFor(...ids: Array<string | null>): Promise<ActorMap> {
    return loadActors(this.usersLookup, ids);
  }

  /** D-0174: the driver and vehicle names behind a page of incidents — one query each, never one per row. */
  private async incidentBriefs(
    incidents: ReadonlyArray<{ driverId: string; vehicleId: string | null }>
  ): Promise<IncidentBriefs> {
    const driverIds = [...new Set(incidents.map(i => i.driverId))];
    const vehicleIds = [...new Set(incidents.flatMap(i => (i.vehicleId ? [i.vehicleId] : [])))];
    const [drivers, vehicles] = await Promise.all([
      this.repo.driverBriefsByIds(driverIds),
      this.repo.vehicleBriefsByIds(vehicleIds),
    ]);
    return { drivers, vehicles };
  }

  private incidentBriefFields(
    incident: { driverId: string; vehicleId: string | null },
    briefs: IncidentBriefs
  ) {
    const driver = briefs.drivers.get(incident.driverId);
    const vehicle = incident.vehicleId ? briefs.vehicles.get(incident.vehicleId) : undefined;
    return {
      driver: driver
        ? { id: driver.id, first_name: driver.firstName, last_name: driver.lastName }
        : null,
      vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, plate: vehicle.plate } : null,
    };
  }

  private async userBrief(userId: string | null): Promise<Json | null> {
    if (!userId) return null;
    const user = await this.usersLookup.findContactById(userId);
    return user ? { id: user.id, first_name: user.firstName, last_name: user.lastName } : null;
  }

  // ===========================================================================
  // Vehicles
  // ===========================================================================

  /** D-0164 (B1): opt-in paging — `query.window` set ⇒ `data: { items, pagination }`, else the flat array as before. */
  async listVehicles(query: VehicleListQuery) {
    const { items, total } = await this.repo.listVehicles(query);
    const actors = await this.actorsFor(
      ...items.flatMap(vehicle => [vehicle.createdBy, vehicle.updatedBy])
    );
    const rows: Json[] = [];
    for (const vehicle of items) rows.push(await this.vehicleJsonWithAssignments(vehicle, actors));
    return {
      success: true,
      message: 'Vehicles retrieved successfully.',
      data: listData(rows, total, query.window),
    };
  }

  /** `GET /vehicles/counts` (D-0179, B7) — vehicles per lifecycle status under the list's filters and search; `status` / `include_inactive` are ignored so every chip has its true count. */
  async vehicleCounts(query: Omit<VehicleListQuery, 'window'>) {
    const rows = await this.repo.vehicleStatusCounts(query);
    return {
      success: true,
      message: 'Vehicle counts retrieved successfully.',
      data: statusCounts(['active', 'in_maintenance', 'retired', 'sold'], rows),
    };
  }

  /** `GET /drivers/counts` (D-0179, B7) — the same for drivers (`active` / `inactive` / `suspended`). */
  async driverCounts(query: Omit<DriverListQuery, 'window'>) {
    const rows = await this.repo.driverStatusCounts(query);
    return {
      success: true,
      message: 'Driver counts retrieved successfully.',
      data: statusCounts(['active', 'inactive', 'suspended'], rows),
    };
  }

  /** `GET /incidents` (D-0179, B7) — every incident of the caller's company (scoped through the driver), same filters / sorts / shape as the per-driver and per-vehicle lists; always paged. */
  async listIncidents(query: IncidentListQuery) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const { items, total } = await this.repo.listIncidents({ companyId: context.companyId }, query);
    const actors = await this.actorsFor(...items.flatMap(i => [i.loggedBy, i.updatedBy]));
    const briefs = await this.incidentBriefs(items);
    return {
      success: true,
      message: 'Incidents retrieved successfully.',
      data: listData(
        items.map(i => this.incidentJson(i, actors, briefs)),
        total,
        query.window
      ),
    };
  }

  /** `POST /vehicles/bulk-deactivate|bulk-reactivate` (D-0166, B10) — each record goes through the single-record action, so every guard and message is the same. */
  async bulkVehicles(
    action: 'deactivate' | 'reactivate' | 'delete',
    target: { ids?: string[] | undefined; filter?: Omit<VehicleListQuery, 'window'> | undefined }
  ) {
    const targets = await resolveBulkTargets({ ids: target.ids }, async () => {
      const { items, total } = await this.repo.listVehicles({
        ...(target.filter ?? { includeInactive: action !== 'deactivate' }),
        window: { page: 1, perPage: BULK_LIMIT },
      });
      return { ids: items.map(vehicle => vehicle.id), total };
    });
    const results = await runBulk(
      targets.ids,
      async id => {
        if (action === 'delete') return { message: (await this.deleteVehicle(id)).message }; // D-0178 (C14): each record goes through the single-record guarded delete
        // D-0171: a vehicle already in the target state is left alone (no write, no realtime event) and reported as `changed: false`
        const vehicle = await this.repo.findVehicleById(id);
        if (vehicle) {
          const inactive =
            vehicle.lifecycleStatus === 'retired' || vehicle.lifecycleStatus === 'sold';
          if (action === 'deactivate' && inactive)
            return { changed: false, message: 'Vehicle is already deactivated.' };
          if (action === 'reactivate' && vehicle.lifecycleStatus === 'active')
            return { changed: false, message: 'Vehicle is already active.' };
        }
        const result =
          action === 'deactivate'
            ? await this.deactivateVehicle(id)
            : await this.reactivateVehicle(id);
        return { message: result.message };
      },
      action === 'deactivate'
        ? 'Vehicle deactivated successfully.'
        : action === 'reactivate'
          ? 'Vehicle reactivated successfully.'
          : 'Vehicle deleted successfully.',
      async id => (await this.repo.findVehicleById(id))?.name
    );
    return bulkResponse(targets, results);
  }

  /** `POST /drivers/bulk-deactivate|bulk-reactivate` (D-0166, B10). */
  async bulkDrivers(
    action: 'deactivate' | 'reactivate' | 'delete',
    target: { ids?: string[] | undefined; filter?: Omit<DriverListQuery, 'window'> | undefined }
  ) {
    const targets = await resolveBulkTargets({ ids: target.ids }, async () => {
      const { items, total } = await this.repo.listDrivers({
        ...(target.filter ?? { includeInactive: action !== 'deactivate' }),
        window: { page: 1, perPage: BULK_LIMIT },
      });
      return { ids: items.map(driver => driver.id), total };
    });
    const results = await runBulk(
      targets.ids,
      async id => {
        if (action === 'delete') return { message: (await this.deleteDriver(id)).message }; // D-0178 (C14)
        const driver = await this.repo.findDriverById(id);
        if (driver) {
          if (action === 'deactivate' && driver.status === 'inactive')
            return { changed: false, message: 'Driver is already deactivated.' };
          if (action === 'reactivate' && driver.status === 'active')
            return { changed: false, message: 'Driver is already active.' };
        }
        const result =
          action === 'deactivate'
            ? await this.deactivateDriver(id)
            : await this.reactivateDriver(id);
        return { message: result.message };
      },
      action === 'deactivate'
        ? 'Driver deactivated successfully.'
        : 'Driver reactivated successfully.',
      async id => {
        const driver = await this.repo.findDriverById(id);
        return driver ? `${driver.firstName} ${driver.lastName}`.trim() : undefined;
      }
    );
    return bulkResponse(targets, results);
  }

  /** `GET /fleet/options` (D-0157; D-0167 R2 adds `vehicle_categories` — the distinct categories in use, case-insensitively collapsed). */
  async fleetOptions() {
    return {
      success: true,
      message: 'Fleet options retrieved successfully.',
      data: {
        fuel_types: FUEL_TYPES,
        ownership_types: OWNERSHIP_TYPES,
        employment_statuses: EMPLOYMENT_STATUSES,
        availability_statuses: AVAILABILITY_STATUSES,
        vehicle_categories: await this.repo.distinctVehicleCategories(),
      },
    };
  }

  /** `GET /vehicles/export` (D-0168, B11) — the vehicle list's own filters/sort, every matching row as CSV (≤ 50 000; refused with a 422 above). */
  exportVehicles(query: Omit<VehicleListQuery, 'window'>) {
    return planExport('vehicles', VEHICLE_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listVehicles({
        ...query,
        window: { page, perPage },
      });
      return { items: await this.repo.vehicleFlags(items), total };
    });
  }

  /** `GET /drivers/export` (D-0168, B11). */
  exportDrivers(query: Omit<DriverListQuery, 'window'>) {
    return planExport('drivers', DRIVER_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listDrivers({ ...query, window: { page, perPage } });
      return { items: await this.repo.driverFlags(items), total };
    });
  }

  /** `GET /vehicles/options` (D-0165, B2) — lean, unpaginated (capped) list for pickers. */
  async vehicleOptions(query: VehicleOptionsQuery) {
    const { items, total } = await this.repo.vehicleOptions(query);
    const rows: Json[] = items.map(({ vehicle, hasDriver, hasTracker, checkedIn }) => ({
      id: vehicle.id,
      name: vehicle.name,
      plate: vehicle.plate,
      vehicle_category: vehicle.vehicleCategory,
      make: vehicle.make,
      model: vehicle.model,
      lifecycle_status: vehicle.lifecycleStatus,
      length_m: vehicle.lengthM,
      has_driver: hasDriver,
      has_tracker: hasTracker,
      checked_in: checkedIn,
    }));
    return optionsResponse('Vehicle options retrieved successfully.', rows, total, query.limit);
  }

  async createVehicle(input: CreateVehicleInput) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const vehicle = await this.repo.createVehicle(input);
    await this.announce('vehicle', vehicle.id, 'created');
    return {
      success: true,
      message: 'Vehicle created successfully.',
      data: this.baseVehicleJson(
        vehicle,
        await this.actorsFor(vehicle.createdBy, vehicle.updatedBy)
      ),
    };
  }

  /** `PUT /vehicles/{id}` (D-0162) — any field `POST /vehicles` accepts (same value lists, D-0157); send only what changed. `lifecycle_status` is not editable here. */
  async updateVehicle(id: string, input: UpdateVehicleInput, expectedUpdatedAt?: Date | null) {
    await assertFresh(
      expectedUpdatedAt,
      () => this.repo.findVehicleById(id),
      'Vehicle not found.',
      this.usersLookup
    ); // D-0176 (B13)
    const updated = await this.repo.updateVehicle(id, input);
    if (!updated) throw new NotFoundError('Vehicle not found.');
    await this.announce('vehicle', updated.id, 'updated');
    return {
      success: true,
      message: 'Vehicle updated successfully.',
      data: this.baseVehicleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  /**
   * `DELETE /vehicles/{id}` (D-0178, C14) — a real delete, ONLY for a vehicle that was never used: no trips, assignments, logs, schedules,
   * incidents, geofence events, yard check-ins or compliance documents (else 422 naming what is in the way — deactivate it instead). Active or
   * deactivated alike; the stored photo goes with it.
   */
  async deleteVehicle(id: string) {
    const vehicle = await this.repo.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');
    assertNeverUsed('vehicle', await this.repo.vehicleUsage(id));
    if (!(await this.repo.deleteVehicle(id))) throw new NotFoundError('Vehicle not found.');
    if (vehicle.imagePath) {
      const key = keyFromUrl(vehicle.imagePath);
      if (key) await deleteObject(key).catch(() => undefined);
    }
    await this.announce('vehicle', id, 'deleted');
    return { success: true, message: 'Vehicle deleted successfully.' };
  }

  /**
   * D-0162 (owner D7): deactivate = `lifecycle_status: retired` (not delete — history references vehicles). Refused while a trip is in progress and while
   * a driver or tracker is still assigned (the operator unassigns them first, so nothing is silently orphaned). Reactivate → `active`.
   */
  async deactivateVehicle(id: string) {
    const vehicle = await this.repo.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');
    if (await this.tripsLookup.vehicleHasActiveTrip(id, undefined)) {
      throw new ValidationError(
        'This vehicle has a trip in progress. Complete or cancel it first.'
      );
    }
    const [driver, tracker] = await Promise.all([
      this.repo.currentAssignmentForVehicle(id),
      this.repo.currentDeviceAssignmentForVehicle(id),
    ]);
    if (driver || tracker) {
      throw new ValidationError(
        "Unassign this vehicle's driver and tracker before deactivating it."
      );
    }
    // D-0182 (L4, owner "do it": refuse both) — a vehicle still checked in at a yard, or with planned trips, is not out of service yet
    if (await this.yardHistoryLookup.vehicleHasOpenStay(id)) {
      throw new ValidationError('Check this vehicle out of its yard before deactivating it.');
    }
    if (await this.tripsLookup.vehicleHasPlannedTrip(id)) {
      throw new ValidationError(
        'This vehicle has planned trips. Cancel or delete them before deactivating it.'
      );
    }
    const updated = await this.repo.setVehicleLifecycleStatus(id, 'retired');
    if (!updated) throw new NotFoundError('Vehicle not found.');
    await this.announce('vehicle', updated.id, 'deactivated');
    return {
      success: true,
      message: 'Vehicle deactivated successfully.',
      data: this.baseVehicleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async reactivateVehicle(id: string) {
    const updated = await this.repo.setVehicleLifecycleStatus(id, 'active');
    if (!updated) throw new NotFoundError('Vehicle not found.');
    await this.announce('vehicle', updated.id, 'reactivated');
    return {
      success: true,
      message: 'Vehicle reactivated successfully.',
      data: this.baseVehicleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  // (return types are inferred on purpose — the contract generator reads them, an explicit `Json` would erase the typed schema)
  private maintenanceLogJson(m: MaintenanceLog, actors: ActorMap) {
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

  private fuelLogJson(f: FuelLog, actors: ActorMap) {
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

  private yardEventJson({ event, slot }: YardHistoryEntry) {
    return {
      id: event.id,
      yard_slot_id: event.yardSlotId,
      vehicle_id: event.vehicleId,
      checked_in_at: event.checkedInAt,
      checked_out_at: event.checkedOutAt,
      source: event.source,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
      slot: slot
        ? {
            id: slot.id,
            yard_id: slot.yardId,
            slot_number: slot.slotNumber,
            yard: slot.yard ? { id: slot.yard.id, name: slot.yard.name } : null,
          }
        : null,
    };
  }

  private async vehicleOr404(id: string): Promise<void> {
    if (!(await this.repo.findVehicleById(id))) throw new NotFoundError('Vehicle not found.');
  }

  // -- D-0170 (B9): paged detail sub-lists (always `data: { items, pagination }`) --

  async listVehicleMaintenanceLogs(id: string, query: MaintenanceLogListQuery) {
    await this.vehicleOr404(id);
    const { items, total } = await this.repo.listMaintenanceLogsForVehicle(id, query);
    const actors = await this.actorsFor(...items.flatMap(m => [m.loggedBy, m.updatedBy]));
    return {
      success: true,
      message: 'Maintenance logs retrieved successfully.',
      data: listData(
        items.map(m => this.maintenanceLogJson(m, actors)),
        total,
        query.window
      ),
    };
  }

  async listVehicleFuelLogs(id: string, query: FuelLogListQuery) {
    await this.vehicleOr404(id);
    const { items, total } = await this.repo.listFuelLogsForVehicle(id, query);
    const actors = await this.actorsFor(...items.flatMap(f => [f.loggedBy, f.updatedBy]));
    return {
      success: true,
      message: 'Fuel logs retrieved successfully.',
      data: listData(
        items.map(f => this.fuelLogJson(f, actors)),
        total,
        query.window
      ),
    };
  }

  async listVehicleYardHistory(id: string, query: YardHistoryListQuery) {
    await this.vehicleOr404(id);
    const { items, total } = await this.yardHistoryLookup.pagedEventsForVehicle(id, query);
    return {
      success: true,
      message: 'Yard history retrieved successfully.',
      data: listData(
        items.map(entry => this.yardEventJson(entry)),
        total,
        query.window
      ),
    };
  }

  async listVehicleIncidents(id: string, query: IncidentListQuery) {
    await this.vehicleOr404(id);
    const { items, total } = await this.repo.listIncidents({ vehicleId: id }, query);
    const actors = await this.actorsFor(...items.flatMap(i => [i.loggedBy, i.updatedBy]));
    const briefs = await this.incidentBriefs(items);
    return {
      success: true,
      message: 'Incidents retrieved successfully.',
      data: listData(
        items.map(i => this.incidentJson(i, actors, briefs)),
        total,
        query.window
      ),
    };
  }

  async listDriverIncidents(id: string, query: IncidentListQuery) {
    if (!(await this.repo.findDriverById(id))) throw new NotFoundError('Driver not found.');
    const { items, total } = await this.repo.listIncidents({ driverId: id }, query);
    const actors = await this.actorsFor(...items.flatMap(i => [i.loggedBy, i.updatedBy]));
    const briefs = await this.incidentBriefs(items);
    return {
      success: true,
      message: 'Incidents retrieved successfully.',
      data: listData(
        items.map(i => this.incidentJson(i, actors, briefs)),
        total,
        query.window
      ),
    };
  }

  async getVehicle(id: string) {
    const vehicle = await this.repo.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    const deviceAssignment = await this.repo.currentDeviceAssignmentForVehicle(id);
    const currentDeviceId = deviceAssignment?.deviceId;
    const now = new Date();

    let currentPosition: Json | null = null;
    let stats: Json = {
      distance_km_7d: null,
      distance_km_30d: null,
      avg_speed_kmh_7d: null,
      max_speed_kmh_7d: null,
    };

    if (currentDeviceId) {
      const position = await this.repo.latestPosition(currentDeviceId);
      currentPosition = position
        ? {
            id: position.id,
            device_id: position.deviceId,
            latitude: position.latitude,
            longitude: position.longitude,
            speed: position.speed,
            heading: position.heading,
            recorded_at: position.recordedAt,
          }
        : null;

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [distance7d, distance30d, speedStats7d] = await Promise.all([
        this.totalDistanceKm(currentDeviceId, sevenDaysAgo),
        this.totalDistanceKm(currentDeviceId, thirtyDaysAgo),
        this.speedStats(currentDeviceId, sevenDaysAgo),
      ]);
      stats = {
        distance_km_7d: distance7d,
        distance_km_30d: distance30d,
        avg_speed_kmh_7d: speedStats7d.avg,
        max_speed_kmh_7d: speedStats7d.max,
      };
    }

    const fuelEconomy = await this.fuelEconomyForVehicle(id);

    const [maintenanceSchedules, maintenanceLogs, fuelLogs, assignmentHistory, yardEvents] =
      await Promise.all([
        this.repo.maintenanceSchedulesForVehicle(id),
        this.repo.maintenanceLogsForVehicle(id, 20),
        this.repo.fuelLogsForVehicle(id, 20),
        this.repo.driverAssignmentHistoryForVehicle(id, 20), // D-0182 (L6): newest 20, like the other embedded lists
        this.yardHistoryLookup.recentEventsForVehicle(id, 20),
      ]);

    const actors = await this.actorsFor(
      vehicle.createdBy,
      vehicle.updatedBy,
      ...maintenanceSchedules.flatMap(m => [m.createdBy, m.updatedBy]),
      ...maintenanceLogs.flatMap(m => [m.loggedBy, m.updatedBy]),
      ...fuelLogs.flatMap(f => [f.loggedBy, f.updatedBy])
    );

    const driverAssignmentHistory: Json[] = [];
    for (const assignment of assignmentHistory) {
      const [driver, assignedBy, unassignedBy] = await Promise.all([
        this.repo.findDriverById(assignment.driverId),
        this.userBrief(assignment.assignedBy),
        this.userBrief(assignment.unassignedBy),
      ]);
      driverAssignmentHistory.push(
        this.assignmentJson(assignment, {
          driver: driver
            ? {
                id: driver.id,
                first_name: driver.firstName,
                last_name: driver.lastName,
                license_number: driver.licenseNumber,
                license_class: driver.licenseClass,
                license_expiry_date: driver.licenseExpiryDate,
              }
            : null,
          assigned_by: assignedBy,
          unassigned_by: unassignedBy,
        })
      );
    }

    return {
      success: true,
      message: 'Vehicle retrieved successfully.',
      data: {
        vehicle: await this.vehicleJsonWithAssignments(vehicle, actors),
        current_position: currentPosition,
        stats,
        maintenance_schedules: maintenanceSchedules.map(m => ({
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
        })),
        maintenance_logs: maintenanceLogs.map(m => this.maintenanceLogJson(m, actors)),
        fuel_logs: fuelLogs.map(f => this.fuelLogJson(f, actors)),
        fuel_economy: fuelEconomy,
        yard_history: yardEvents.map(entry => this.yardEventJson(entry)),
        driver_assignment_history: driverAssignmentHistory,
      },
    };
  }

  /** `VehicleAnalyticsService::totalDistanceKm` — haversine between every consecutive recorded position pair, summed. */
  private async totalDistanceKm(deviceId: string, since: Date): Promise<number> {
    const positions = await this.repo.positionsInWindow(deviceId, since);
    if (positions.length < 2) return 0;
    let totalMeters = 0;
    for (let i = 1; i < positions.length; i += 1) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (!prev || !curr) continue;
      totalMeters += haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return Math.round(totalMeters * KM_PER_METER * 100) / 100;
  }

  /** `VehicleAnalyticsService::averageSpeedKmh`/`maxSpeedKmh` — null (not 0) when nothing in the window ever reported a speed. */
  private async speedStats(
    deviceId: string,
    since: Date
  ): Promise<{ avg: number | null; max: number | null }> {
    const positions = await this.repo.positionsInWindow(deviceId, since);
    const speeds = positions.map(p => p.speed).filter((s): s is number => s !== null);
    if (speeds.length === 0) return { avg: null, max: null };
    const avg = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
    return { avg: Math.round(avg * 10) / 10, max: Math.max(...speeds) };
  }

  /** `FuelAnalyticsService::averageEconomyForVehicle` — only consecutive same-unit full-tank fills with a real, forward-moving odometer reading count. */
  private async fuelEconomyForVehicle(
    vehicleId: string
  ): Promise<{ economy: number | null; unit: string | null; pairs_used: number }> {
    const fills = await this.repo.fullTankFuelLogsForVehicle(vehicleId);
    if (fills.length < 2) return { economy: null, unit: null, pairs_used: 0 };

    let totalDistance = 0;
    let totalVolume = 0;
    let pairsUsed = 0;
    let unit: string | null = null;

    for (let i = 1; i < fills.length; i += 1) {
      const prev = fills[i - 1];
      const curr = fills[i];
      if (!prev || !curr || curr.unit !== prev.unit) continue;
      const prevOdometer = prev.odometerKm;
      const currOdometer = curr.odometerKm;
      if (prevOdometer === null || currOdometer === null) continue;
      const distance = currOdometer - prevOdometer;
      if (distance <= 0) continue;
      totalDistance += distance;
      totalVolume += curr.volume;
      pairsUsed += 1;
      unit = curr.unit;
    }

    if (pairsUsed === 0 || totalVolume <= 0) return { economy: null, unit: null, pairs_used: 0 };
    return {
      economy: Math.round((totalDistance / totalVolume) * 100) / 100,
      unit: unit === 'liters' ? 'km/L' : 'km/gal',
      pairs_used: pairsUsed,
    };
  }

  async uploadVehicleImage(
    id: string,
    image: { buffer: Buffer; contentType: string; extension: string }
  ) {
    const vehicle = await this.repo.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    // `required|image|...` (Laravel) validates the real file content, not
    // just the client-suppliable MIME type header (D-0076's established
    // fix — `imageSize` throws on unparseable bytes).
    try {
      const dimensions = imageSize(image.buffer);
      if (!dimensions.width || !dimensions.height) throw new Error('unreadable');
    } catch {
      throw new ValidationError('The image must be a valid image file.', {
        image: ['The image must be a valid image file.'],
      });
    }

    if (vehicle.imagePath) {
      const oldKey = keyFromUrl(vehicle.imagePath);
      if (oldKey) await deleteObject(oldKey).catch(() => undefined);
    }
    const uploaded = await uploadObject({ prefix: 'vehicles', ...image });
    const updated = await this.repo.updateVehicleImagePath(id, uploaded.url);
    if (!updated) throw new NotFoundError('Vehicle not found.');

    return {
      success: true,
      message: 'Vehicle image updated successfully.',
      data: this.baseVehicleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  /** `assignDevice` — refuses if the vehicle already has an active tracker, or the device is currently installed in a different vehicle. Tightens Laravel's bare `exists:devices,id` (no ownership check at all — the same bug class as 11.37/11.48, newly found while building this module) to the real `authorizedDeviceQuery()` OR-boundary (Design notes; not itself in KNOWN_ISSUES — a new, narrower finding). */
  async assignDevice(vehicleId: string, deviceId: string) {
    const context = requireContext();
    const vehicle = await this.repo.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    // KNOWN_ISSUES 11.78: Laravel validates `integer` (422); without this a DevEUI string reached `BigInt()` and became a 500.
    if (!/^\d+$/.test(deviceId)) {
      throw new ValidationError('The device id must be an integer.', {
        device_id: ['The device id must be an integer.'],
      });
    }

    if (
      !(await this.devicesLookup.findAuthorized(deviceId, context.userId, context.companyId ?? ''))
    ) {
      throw new ValidationError('The selected device id is invalid.', {
        device_id: ['The selected device id is invalid.'],
      });
    }
    if (await this.repo.vehicleHasActiveDeviceAssignment(vehicleId)) {
      throw new ValidationError('This vehicle already has an active tracker installed.');
    }
    if (await this.repo.deviceHasActiveAssignment(deviceId)) {
      throw new ValidationError('This tracker is already installed in another vehicle.');
    }

    const assignment = await this.repo.createDeviceAssignment(vehicleId, deviceId);
    await this.announce('vehicle', vehicleId, 'updated'); // D-0163: a tracker (dis)assignment changes the vehicle's row
    return {
      success: true,
      message: 'Tracker assigned successfully.',
      data: this.assignmentJsonForDevice(assignment),
    };
  }

  /** `GET /vehicles/assignable-trackers` — the frontend's tracker dropdown (D9): devices not installed in any vehicle; send `id` as `device_id` to `assign-device`. */
  async listAssignableTrackers(search: string | undefined, onlyWithPosition: boolean) {
    const context = requireContext();
    const trackers = await this.devicesLookup.listAssignableTrackers(
      context.userId,
      context.companyId ?? '',
      {
        search,
        onlyWithPosition,
      }
    );
    return {
      success: true,
      message: 'Assignable trackers retrieved successfully.',
      data: trackers.map(t => ({
        id: Number(t.id),
        name: t.name,
        device_unique_identifier: t.deviceUniqueIdentifier,
        status: t.status,
        has_position: t.hasPosition,
        product: { id: Number(t.product.id), name: t.product.name },
      })),
    };
  }

  async unassignDevice(vehicleId: string) {
    const vehicle = await this.repo.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    const closed = await this.repo.closeActiveDeviceAssignment(vehicleId);
    if (!closed) throw new ValidationError('This vehicle has no active tracker to unassign.');
    await this.announce('vehicle', vehicleId, 'updated');

    return {
      success: true,
      message: 'Tracker unassigned successfully.',
      data: this.assignmentJsonForDevice(closed),
    };
  }

  private assignmentJsonForDevice(assignment: {
    id: string;
    vehicleId: string;
    deviceId: string;
    assignedAt: Date;
    unassignedAt: Date | null;
  }): Json {
    return {
      id: assignment.id,
      vehicle_id: assignment.vehicleId,
      device_id: assignment.deviceId,
      assigned_at: assignment.assignedAt,
      unassigned_at: assignment.unassignedAt,
    };
  }

  // ===========================================================================
  // Drivers
  // ===========================================================================

  /** D-0164 (B1): opt-in paging — see `listVehicles`. */
  async listDrivers(query: DriverListQuery) {
    const { items, total } = await this.repo.listDrivers(query);
    const now = new Date();
    const actors = await this.actorsFor(
      ...items.flatMap(driver => [driver.createdBy, driver.updatedBy])
    );
    const rows: Json[] = [];
    for (const driver of items)
      rows.push(await this.driverJsonWithCurrentAssignment(driver, now, false, actors));
    return {
      success: true,
      message: 'Drivers retrieved successfully.',
      data: listData(rows, total, query.window),
    };
  }

  /** `GET /drivers/options` (D-0165, B2) — lean, unpaginated (capped) list for pickers. */
  async driverOptions(query: DriverOptionsQuery) {
    const { items, total } = await this.repo.driverOptions(query);
    const rows: Json[] = items.map(({ driver, assigned }) => ({
      id: driver.id,
      name: `${driver.firstName} ${driver.lastName}`.trim(),
      first_name: driver.firstName,
      last_name: driver.lastName,
      license_number: driver.licenseNumber,
      license_expiry_date: driver.licenseExpiryDate,
      status: driver.status,
      availability_status: driver.availabilityStatus,
      assigned,
    }));
    return optionsResponse('Driver options retrieved successfully.', rows, total, query.limit);
  }

  async createDriver(input: CreateDriverInput) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const driver = await this.repo.createDriver(input);
    await this.announce('driver', driver.id, 'created');
    return {
      success: true,
      message: 'Driver created successfully.',
      data: this.baseDriverJson(
        driver,
        new Date(),
        await this.actorsFor(driver.createdBy, driver.updatedBy)
      ),
    };
  }

  /** `PUT /drivers/{id}` (D-0162) — any field `POST /drivers` accepts (same value lists and certification shape, D-0157); send only what changed. `status` is not editable here. */
  async updateDriver(id: string, input: UpdateDriverInput, expectedUpdatedAt?: Date | null) {
    await assertFresh(
      expectedUpdatedAt,
      () => this.repo.findDriverById(id),
      'Driver not found.',
      this.usersLookup
    ); // D-0176 (B13)
    const updated = await this.repo.updateDriver(id, input);
    if (!updated) throw new NotFoundError('Driver not found.');
    await this.announce('driver', updated.id, 'updated');
    return {
      success: true,
      message: 'Driver updated successfully.',
      data: this.baseDriverJson(
        updated,
        new Date(),
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  /** `DELETE /drivers/{id}` (D-0178, C14) — only a driver that was never used: no trips, vehicle assignments, incidents or compliance documents (else 422 — deactivate instead). */
  async deleteDriver(id: string) {
    if (!(await this.repo.findDriverById(id))) throw new NotFoundError('Driver not found.');
    assertNeverUsed('driver', await this.repo.driverUsage(id));
    if (!(await this.repo.deleteDriver(id))) throw new NotFoundError('Driver not found.');
    await this.announce('driver', id, 'deleted');
    return { success: true, message: 'Driver deleted successfully.' };
  }

  /** D-0162: deactivate = `status: inactive`; refused while the driver is still on a vehicle. Reactivate → `active`. */
  async deactivateDriver(id: string) {
    const driver = await this.repo.findDriverById(id);
    if (!driver) throw new NotFoundError('Driver not found.');
    if (await this.repo.currentAssignmentForDriver(id)) {
      throw new ValidationError(
        'Unassign this driver from their vehicle before deactivating them.'
      );
    }
    const updated = await this.repo.setDriverStatus(id, 'inactive');
    if (!updated) throw new NotFoundError('Driver not found.');
    await this.announce('driver', updated.id, 'deactivated');
    return {
      success: true,
      message: 'Driver deactivated successfully.',
      data: this.baseDriverJson(
        updated,
        new Date(),
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async reactivateDriver(id: string) {
    const updated = await this.repo.setDriverStatus(id, 'active');
    if (!updated) throw new NotFoundError('Driver not found.');
    await this.announce('driver', updated.id, 'reactivated');
    return {
      success: true,
      message: 'Driver reactivated successfully.',
      data: this.baseDriverJson(
        updated,
        new Date(),
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async getDriver(id: string) {
    const driver = await this.repo.findDriverById(id);
    if (!driver) throw new NotFoundError('Driver not found.');
    const now = new Date();

    const [current, incidents, recent] = await Promise.all([
      this.driverJsonWithCurrentAssignment(driver, now, true),
      this.repo.recentIncidentsForDriver(id, 20),
      this.repo.recentAssignmentsForDriver(id, 10),
    ]);

    const actors = await this.actorsFor(...incidents.flatMap(i => [i.loggedBy, i.updatedBy]));
    const incidentBriefs = await this.incidentBriefs(incidents);

    const recentAssignments: Json[] = [];
    for (const assignment of recent) {
      const [vehicle, assignedBy, unassignedBy] = await Promise.all([
        this.repo.findVehicleById(assignment.vehicleId),
        this.userBrief(assignment.assignedBy),
        this.userBrief(assignment.unassignedBy),
      ]);
      recentAssignments.push(
        this.assignmentJson(assignment, {
          vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.name,
                vehicle_category: vehicle.vehicleCategory,
                plate: vehicle.plate,
              }
            : null,
          assigned_by: assignedBy,
          unassigned_by: unassignedBy,
        })
      );
    }

    return {
      success: true,
      message: 'Driver retrieved successfully.',
      data: {
        ...current,
        incidents: incidents.map(i => ({
          id: i.id,
          driver_id: i.driverId,
          vehicle_id: i.vehicleId,
          incident_type: i.incidentType,
          severity: i.severity,
          incident_date: i.incidentDate,
          description: i.description,
          logged_by: i.loggedBy,
          created_at: i.createdAt,
          updated_at: i.updatedAt,
          ...auditFields(actors, i.loggedBy, i.updatedBy),
          ...this.incidentBriefFields(i, incidentBriefs),
        })),
        recent_assignments: recentAssignments,
      },
    };
  }

  /** `assignVehicle` — tightens Laravel's bare `exists:vehicles,id` (no company check, same new-finding class as `assignDevice` above) to the caller's own already company-scoped `findVehicleById`. */
  async assignVehicleToDriver(driverId: string, vehicleId: string, notes: string | null) {
    const context = requireContext();
    const driver = await this.repo.findDriverById(driverId);
    if (!driver) throw new NotFoundError('Driver not found.');

    const vehicle = await this.repo.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new ValidationError('The selected vehicle id is invalid.', {
        vehicle_id: ['The selected vehicle id is invalid.'],
      });
    }
    if (await this.repo.driverHasActiveAssignment(driverId)) {
      throw new ValidationError('This driver is already assigned to a vehicle.');
    }
    // D-0151 (owner, 2026-09-24): one active driver per vehicle — a deliberate deviation from Laravel, which only checked the driver's side.
    if (await this.repo.currentAssignmentForVehicle(vehicleId)) {
      throw new ValidationError('This vehicle already has an active driver. Unassign them first.');
    }

    const assignment = await this.repo.createDriverVehicleAssignment(
      driverId,
      vehicleId,
      context.userId,
      notes
    );
    const assignedBy = await this.userBrief(assignment.assignedBy);
    await this.announce('driver', driverId, 'updated'); // D-0163: a driver <-> vehicle (un)assignment changes both rows
    await this.announce('vehicle', vehicleId, 'updated');
    return {
      success: true,
      message: 'Vehicle assigned to driver successfully.',
      data: this.assignmentJson(assignment, {
        vehicle: { id: vehicle.id, name: vehicle.name },
        assigned_by: assignedBy,
      }),
    };
  }

  async unassignVehicleFromDriver(driverId: string, notes: string | null) {
    const context = requireContext();
    const driver = await this.repo.findDriverById(driverId);
    if (!driver) throw new NotFoundError('Driver not found.');

    const closed = await this.repo.closeActiveAssignmentForDriver(driverId, context.userId, notes);
    if (!closed)
      throw new ValidationError('This driver has no active vehicle assignment to unassign.');
    await this.announce('driver', driverId, 'updated');
    await this.announce('vehicle', closed.vehicleId, 'updated');

    return {
      success: true,
      message: 'Vehicle unassigned from driver successfully.',
      data: this.assignmentJson(closed),
    };
  }

  /** `vehicle_id` tightened to the caller's own already company-scoped `findVehicleById` — Laravel's `'vehicle_id' => 'nullable|exists:vehicles,id'` has no company check at all (same finding class as `assignDevice`/`assignVehicle` above, missed when those were fixed). */
  private incidentJson(incident: DriverIncident, actors: ActorMap, briefs: IncidentBriefs) {
    return {
      id: incident.id,
      driver_id: incident.driverId,
      vehicle_id: incident.vehicleId,
      incident_type: incident.incidentType,
      severity: incident.severity,
      incident_date: incident.incidentDate,
      description: incident.description,
      logged_by: incident.loggedBy,
      created_at: incident.createdAt,
      updated_at: incident.updatedAt,
      ...auditFields(actors, incident.loggedBy, incident.updatedBy),
      ...this.incidentBriefFields(incident, briefs),
    };
  }

  /** `driver_incidents` has no tenant column — resolve the incident, then its driver against the caller's company (another company's incident is a plain 404). */
  private async incidentForCaller(id: string): Promise<DriverIncident> {
    const incident = await this.repo.findIncidentById(id);
    if (!incident || !(await this.repo.findDriverById(incident.driverId)))
      throw new NotFoundError('Incident not found.');
    return incident;
  }

  /** `PUT /incidents/{id}` (D-0169, B3). */
  async updateIncident(id: string, input: UpdateIncidentInput, expectedUpdatedAt?: Date | null) {
    const current = await this.incidentForCaller(id);
    await assertNotStale(expectedUpdatedAt, current, this.usersLookup); // D-0176 (B13)
    if (input.vehicleId) {
      if (!(await this.repo.findVehicleById(input.vehicleId))) {
        throw new ValidationError('The selected vehicle id is invalid.', {
          vehicle_id: ['The selected vehicle id is invalid.'],
        });
      }
    }
    const updated = await this.repo.updateIncident(id, input);
    if (!updated) throw new NotFoundError('Incident not found.');
    return {
      success: true,
      message: 'Incident updated successfully.',
      data: this.incidentJson(
        updated,
        await this.actorsFor(updated.loggedBy, updated.updatedBy),
        await this.incidentBriefs([updated])
      ),
    };
  }

  /** `DELETE /incidents/{id}` (D-0169, B3). */
  async deleteIncident(id: string) {
    await this.incidentForCaller(id);
    if (!(await this.repo.deleteIncident(id))) throw new NotFoundError('Incident not found.');
    return { success: true, message: 'Incident deleted successfully.' };
  }

  /** `DELETE /vehicles/{id}/image` (D-0169, B4) — removes the stored file and clears `image_path`; idempotent (a vehicle without an image is a 200 too). */
  async deleteVehicleImage(id: string) {
    const vehicle = await this.repo.findVehicleById(id);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');
    if (vehicle.imagePath) {
      const key = keyFromUrl(vehicle.imagePath);
      if (key) await deleteObject(key).catch(() => undefined);
    }
    const updated = await this.repo.updateVehicleImagePath(id, null);
    if (!updated) throw new NotFoundError('Vehicle not found.');
    await this.announce('vehicle', updated.id, 'updated');
    return {
      success: true,
      message: 'Vehicle image removed successfully.',
      data: this.baseVehicleJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async storeIncident(driverId: string, input: CreateIncidentInput) {
    const context = requireContext();
    const driver = await this.repo.findDriverById(driverId);
    if (!driver) throw new NotFoundError('Driver not found.');

    if (input.vehicleId !== null) {
      const vehicle = await this.repo.findVehicleById(input.vehicleId);
      if (!vehicle) {
        throw new ValidationError('The selected vehicle id is invalid.', {
          vehicle_id: ['The selected vehicle id is invalid.'],
        });
      }
    }

    const incident = await this.repo.createIncident(driverId, context.userId, input);
    return {
      success: true,
      message: 'Incident logged successfully.',
      data: {
        id: incident.id,
        driver_id: incident.driverId,
        vehicle_id: incident.vehicleId,
        incident_type: incident.incidentType,
        severity: incident.severity,
        incident_date: incident.incidentDate,
        description: incident.description,
        logged_by: incident.loggedBy,
        created_at: incident.createdAt,
        updated_at: incident.updatedAt,
        ...auditFields(
          await this.actorsFor(incident.loggedBy, incident.updatedBy),
          incident.loggedBy,
          incident.updatedBy
        ),
        ...this.incidentBriefFields(incident, await this.incidentBriefs([incident])),
      },
    };
  }

  // ===========================================================================
  // Assignment history
  // ===========================================================================

  private buildSummary(
    rows: { assignedAt: Date; unassignedAt: Date | null; tripCount: number; distanceKm: number }[]
  ): {
    totalAssignments: number;
    activeNow: boolean;
    totalDays: number;
    totalTrips: number;
    totalDistanceKm: number;
  } {
    const totalTrips = rows.reduce((sum, r) => sum + r.tripCount, 0);
    const totalDistanceKm = Math.round(rows.reduce((sum, r) => sum + r.distanceKm, 0) * 100) / 100;
    const activeNow = rows.some(r => r.unassignedAt === null);
    const totalDays = rows
      .filter(r => r.unassignedAt !== null)
      .reduce(
        (sum, r) =>
          sum +
          Math.floor(((r.unassignedAt as Date).getTime() - r.assignedAt.getTime()) / 86_400_000),
        0
      );
    return { totalAssignments: rows.length, activeNow, totalDays, totalTrips, totalDistanceKm };
  }

  async driverAssignmentHistory(
    driverId: string,
    filters: AssignmentHistoryFilters,
    page: number,
    perPage: number
  ) {
    const driver = await this.repo.findDriverById(driverId);
    if (!driver) throw new NotFoundError('Driver not found.');

    const [{ items, total }, summaryRows, uniqueVehicles] = await Promise.all([
      this.repo.listDriverAssignmentHistory(driverId, filters, page, perPage),
      this.repo.driverAssignmentSummaryRows(driverId, filters),
      this.repo.uniqueVehiclesForDriver(driverId),
    ]);
    const summary = this.buildSummary(summaryRows);

    const history: Json[] = [];
    for (const assignment of items) {
      const [vehicle, assignedBy, unassignedBy] = await Promise.all([
        this.repo.findVehicleById(assignment.vehicleId),
        this.userBrief(assignment.assignedBy),
        this.userBrief(assignment.unassignedBy),
      ]);
      history.push(
        this.assignmentJson(assignment, {
          vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.name,
                vehicle_category: vehicle.vehicleCategory,
                plate: vehicle.plate,
                make: vehicle.make,
                model: vehicle.model,
              }
            : null,
          assigned_by: assignedBy,
          unassigned_by: unassignedBy,
        })
      );
    }

    return {
      success: true,
      message: 'Assignment history retrieved successfully.',
      driver: { id: driver.id, name: `${driver.firstName} ${driver.lastName}`.trim() },
      summary: {
        total_assignments: summary.totalAssignments,
        active_assignment: summary.activeNow,
        total_days_assigned: summary.totalDays,
        unique_vehicles_driven: uniqueVehicles,
        total_trips: summary.totalTrips,
        total_distance_km: summary.totalDistanceKm,
      },
      historyItems: history,
      total,
    };
  }

  async vehicleAssignmentHistory(
    vehicleId: string,
    filters: AssignmentHistoryFilters,
    page: number,
    perPage: number
  ) {
    const vehicle = await this.repo.findVehicleById(vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    const [{ items, total }, summaryRows, uniqueDrivers] = await Promise.all([
      this.repo.listVehicleAssignmentHistory(vehicleId, filters, page, perPage),
      this.repo.vehicleAssignmentSummaryRows(vehicleId, filters),
      this.repo.uniqueDriversForVehicle(vehicleId),
    ]);
    const summary = this.buildSummary(summaryRows);

    const history: Json[] = [];
    for (const assignment of items) {
      const [driver, assignedBy, unassignedBy] = await Promise.all([
        this.repo.findDriverById(assignment.driverId),
        this.userBrief(assignment.assignedBy),
        this.userBrief(assignment.unassignedBy),
      ]);
      history.push(
        this.assignmentJson(assignment, {
          driver: driver
            ? {
                id: driver.id,
                first_name: driver.firstName,
                last_name: driver.lastName,
                license_number: driver.licenseNumber,
                license_class: driver.licenseClass,
              }
            : null,
          assigned_by: assignedBy,
          unassigned_by: unassignedBy,
        })
      );
    }

    return {
      success: true,
      message: 'Assignment history retrieved successfully.',
      vehicle: { id: vehicle.id, name: vehicle.name, plate: vehicle.plate },
      summary: {
        total_assignments: summary.totalAssignments,
        active_assignment: summary.activeNow,
        total_days_in_service: summary.totalDays,
        unique_drivers: uniqueDrivers,
        total_trips: summary.totalTrips,
        total_distance_km: summary.totalDistanceKm,
      },
      historyItems: history,
      total,
    };
  }

  async companyAssignmentHistory(
    filters: AssignmentHistoryFilters & {
      driverId: string | undefined;
      vehicleId: string | undefined;
    },
    page: number,
    perPage: number
  ) {
    const context = requireContext();
    const { items, total } = await this.repo.listCompanyAssignmentHistory(
      context.companyId ?? '',
      filters,
      page,
      perPage
    );

    const history: Json[] = [];
    for (const assignment of items) {
      const [driver, vehicle, assignedBy, unassignedBy] = await Promise.all([
        this.repo.findDriverById(assignment.driverId),
        this.repo.findVehicleById(assignment.vehicleId),
        this.userBrief(assignment.assignedBy),
        this.userBrief(assignment.unassignedBy),
      ]);
      history.push(
        this.assignmentJson(assignment, {
          driver: driver
            ? {
                id: driver.id,
                first_name: driver.firstName,
                last_name: driver.lastName,
                license_number: driver.licenseNumber,
              }
            : null,
          vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.name,
                vehicle_category: vehicle.vehicleCategory,
                plate: vehicle.plate,
              }
            : null,
          assigned_by: assignedBy,
          unassigned_by: unassignedBy,
        })
      );
    }

    return {
      success: true,
      message: 'Assignment history retrieved successfully.',
      historyItems: history,
      total,
    };
  }
}
