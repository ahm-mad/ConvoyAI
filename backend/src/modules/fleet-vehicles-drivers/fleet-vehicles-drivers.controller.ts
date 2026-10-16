import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import {
  DEFAULT_PER_PAGE,
  OPTIONS_LIMIT,
  flagValue,
  resolveWindow,
} from '../../platform/http/list-query.js';
import { bodyFlag } from '../../platform/http/bulk.js';
import { streamCsv } from '../../platform/http/csv.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { FleetVehiclesDriversService } from './fleet-vehicles-drivers.service.js';
import type {
  AssignmentHistoryFilters,
  CreateDriverInput,
  CreateVehicleInput,
  DriverListQuery,
  IncidentListQuery,
  VehicleListQuery,
  UpdateDriverInput,
  UpdateVehicleInput,
} from './fleet-vehicles-drivers.types.js';
import {
  AssignDeviceRequestSchema,
  AssignVehicleRequestSchema,
  AssignableTrackersQuerySchema,
  AssignmentHistoryQuerySchema,
  CompanyAssignmentHistoryQuerySchema,
  CreateDriverRequestSchema,
  CreateVehicleRequestSchema,
  DriverIdParamSchema,
  DriverIdPathParamSchema,
  ListDriversQuerySchema,
  ListVehiclesQuerySchema,
  VehicleOptionsQuerySchema,
  BulkVehiclesBodySchema,
  IncidentIdParamSchema,
  IncidentsQuerySchema,
  VehicleFuelLogsQuerySchema,
  VehicleMaintenanceLogsQuerySchema,
  VehicleYardHistoryQuerySchema,
  UpdateIncidentRequestSchema,
  BulkDriversBodySchema,
  DriverOptionsQuerySchema,
  UpdateDriverRequestSchema,
  UpdateVehicleRequestSchema,
  StoreIncidentRequestSchema,
  UnassignVehicleRequestSchema,
  VehicleIdParamSchema,
  VehicleIdPathParamSchema,
  VehicleImageParamSchema,
  VehicleCountsQuerySchema,
  DriverCountsQuerySchema,
} from './fleet-vehicles-drivers.schemas.js';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function toCreateVehicleInput(
  body: ReturnType<typeof CreateVehicleRequestSchema.parse>
): CreateVehicleInput {
  return {
    name: body.name,
    vehicleCategory: body.vehicle_category ?? null,
    make: body.make ?? null,
    model: body.model ?? null,
    lengthM: body.length_m ?? null,
    widthM: body.width_m ?? null,
    heightM: body.height_m ?? null,
    acquisitionDate: body.acquisition_date ?? null,
    acquisitionCost: body.acquisition_cost ?? null,
    plate: body.plate ?? null,
    vin: body.vin ?? null,
    year: body.year ?? null,
    fuelType: body.fuel_type ?? null,
    tankCapacityLiters: body.tank_capacity_liters ?? null,
    odometerKm: body.odometer_km ?? null,
    ownershipType: body.ownership_type ?? null,
    costCentre: body.cost_centre ?? null,
    grossWeightKg: body.gross_weight_kg ?? null,
    payloadKg: body.payload_kg ?? null,
  };
}

function toCreateDriverInput(
  body: ReturnType<typeof CreateDriverRequestSchema.parse>
): CreateDriverInput {
  return {
    firstName: body.first_name,
    lastName: body.last_name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    licenseNumber: body.license_number ?? null,
    licenseClass: body.license_class ?? null,
    licenseExpiryDate: body.license_expiry_date ?? null,
    hireDate: body.hire_date ?? null,
    employmentStatus: body.employment_status ?? null,
    availabilityStatus: body.availability_status ?? null,
    certifications: body.certifications ?? null,
    payrollReference: body.payroll_reference ?? null,
  };
}

/** D-0162: the fields that were sent (`undefined` = leave alone; the create schema's nullable fields keep `null` = clear). */
function toUpdateVehicleInput(
  body: ReturnType<typeof UpdateVehicleRequestSchema.parse>
): UpdateVehicleInput {
  return {
    name: body.name,
    vehicleCategory: body.vehicle_category,
    make: body.make,
    model: body.model,
    lengthM: body.length_m,
    widthM: body.width_m,
    heightM: body.height_m,
    acquisitionDate: body.acquisition_date,
    acquisitionCost: body.acquisition_cost,
    plate: body.plate,
    vin: body.vin,
    year: body.year,
    fuelType: body.fuel_type,
    tankCapacityLiters: body.tank_capacity_liters,
    odometerKm: body.odometer_km,
    ownershipType: body.ownership_type,
    costCentre: body.cost_centre,
    grossWeightKg: body.gross_weight_kg,
    payloadKg: body.payload_kg,
  };
}

function toUpdateDriverInput(
  body: ReturnType<typeof UpdateDriverRequestSchema.parse>
): UpdateDriverInput {
  return {
    firstName: body.first_name,
    lastName: body.last_name,
    email: body.email,
    phone: body.phone,
    licenseNumber: body.license_number,
    licenseClass: body.license_class,
    licenseExpiryDate: body.license_expiry_date,
    hireDate: body.hire_date,
    employmentStatus: body.employment_status,
    availabilityStatus: body.availability_status,
    certifications: body.certifications,
    payrollReference: body.payroll_reference,
  };
}

function toFilters(query: {
  date_from?: string | undefined;
  date_to?: string | undefined;
  include_active?: string | undefined;
}): AssignmentHistoryFilters {
  return {
    dateFrom: query.date_from,
    dateTo: query.date_to,
    includeActive: query.include_active !== '0',
    status: undefined,
  };
}

function requestPath(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`;
}

export class FleetVehiclesDriversController {
  constructor(private readonly service: FleetVehiclesDriversService) {}

  /** `GET /fleet/options` (D-0157) — the enforced value lists, straight from the constants the request schemas validate against. */
  fleetOptions = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.fleetOptions());
  };

  // -- Vehicles --

  private vehicleListQuery(
    query: ReturnType<typeof ListVehiclesQuerySchema.parse>
  ): Omit<VehicleListQuery, 'window'> {
    return {
      includeInactive: flagValue(query.include_inactive) === true,
      status: query.status,
      search: query.search,
      vehicleCategory: query.vehicle_category,
      fuelType: query.fuel_type,
      ownershipType: query.ownership_type,
      hasTracker: flagValue(query.has_tracker),
      hasDriver: flagValue(query.has_driver),
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  listVehicles = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListVehiclesQuerySchema, req.query);
    res.status(200).json(
      await this.service.listVehicles({
        ...this.vehicleListQuery(query),
        window: resolveWindow(query),
      })
    );
  };

  /** `GET /vehicles/export` (D-0168, B11): the list's own filters/sort, streamed as CSV. */
  exportVehicles = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListVehiclesQuerySchema, req.query);
    await streamCsv(res, await this.service.exportVehicles(this.vehicleListQuery(query)));
  };

  vehicleOptions = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(VehicleOptionsQuerySchema, req.query);
    res.status(200).json(
      await this.service.vehicleOptions({
        includeInactive: flagValue(query.include_inactive) === true,
        search: query.search,
        hasDriver: flagValue(query.has_driver),
        hasTracker: flagValue(query.has_tracker),
        limit: query.limit ?? OPTIONS_LIMIT,
      })
    );
  };

  driverOptions = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(DriverOptionsQuerySchema, req.query);
    res.status(200).json(
      await this.service.driverOptions({
        includeInactive: flagValue(query.include_inactive) === true,
        search: query.search,
        assigned: flagValue(query.assigned),
        availabilityStatus: query.availability_status,
        limit: query.limit ?? OPTIONS_LIMIT,
      })
    );
  };

  bulkDeactivateVehicles = (req: Request, res: Response): Promise<void> =>
    this.bulkVehicles('deactivate', req, res);

  bulkReactivateVehicles = (req: Request, res: Response): Promise<void> =>
    this.bulkVehicles('reactivate', req, res);

  bulkDeleteVehicles = (req: Request, res: Response): Promise<void> =>
    this.bulkVehicles('delete', req, res);

  private bulkVehicles = async (
    action: 'deactivate' | 'reactivate' | 'delete',
    req: Request,
    res: Response
  ): Promise<void> => {
    const body = parseOrThrow(BulkVehiclesBodySchema, req.body);
    const filter = body.filter;
    res.status(200).json(
      await this.service.bulkVehicles(action, {
        ids: body.ids?.map(String),
        filter: filter && {
          includeInactive: bodyFlag(filter.include_inactive) ?? action !== 'deactivate',
          status: filter.status,
          search: filter.search?.trim() || undefined,
          vehicleCategory: filter.vehicle_category,
          fuelType: filter.fuel_type,
          ownershipType: filter.ownership_type,
          hasTracker: bodyFlag(filter.has_tracker),
          hasDriver: bodyFlag(filter.has_driver),
        },
      })
    );
  };

  bulkDeactivateDrivers = (req: Request, res: Response): Promise<void> =>
    this.bulkDrivers('deactivate', req, res);

  bulkReactivateDrivers = (req: Request, res: Response): Promise<void> =>
    this.bulkDrivers('reactivate', req, res);

  bulkDeleteDrivers = (req: Request, res: Response): Promise<void> =>
    this.bulkDrivers('delete', req, res);

  private bulkDrivers = async (
    action: 'deactivate' | 'reactivate' | 'delete',
    req: Request,
    res: Response
  ): Promise<void> => {
    const body = parseOrThrow(BulkDriversBodySchema, req.body);
    const filter = body.filter;
    res.status(200).json(
      await this.service.bulkDrivers(action, {
        ids: body.ids?.map(String),
        filter: filter && {
          includeInactive: bodyFlag(filter.include_inactive) ?? action !== 'deactivate',
          status: filter.status,
          search: filter.search?.trim() || undefined,
          availabilityStatus: filter.availability_status,
          employmentStatus: filter.employment_status,
          assigned: bodyFlag(filter.assigned),
          licenseExpiringWithinDays: filter.license_expiring_within_days,
          licenseState: filter.license_state,
        },
      })
    );
  };

  updateVehicle = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const input = parseOrThrow(UpdateVehicleRequestSchema, req.body);
    res
      .status(200)
      .json(
        await this.service.updateVehicle(id, toUpdateVehicleInput(input), input.expected_updated_at)
      );
  };

  deleteVehicle = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteVehicle(id));
  };

  deactivateVehicle = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    res.status(200).json(await this.service.deactivateVehicle(id));
  };

  reactivateVehicle = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    res.status(200).json(await this.service.reactivateVehicle(id));
  };

  listAssignableTrackers = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(AssignableTrackersQuerySchema, req.query);
    res
      .status(200)
      .json(await this.service.listAssignableTrackers(query.search, query.only_with_position));
  };

  createVehicle = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateVehicleRequestSchema, req.body);
    res.status(201).json(await this.service.createVehicle(toCreateVehicleInput(input)));
  };

  getVehicle = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    res.status(200).json(await this.service.getVehicle(id));
  };

  uploadVehicleImage = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleImageParamSchema, req.params);
    const file = req.file;
    if (!file) {
      throw new ValidationError('Validation failed', { image: ['The image field is required.'] });
    }
    const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];
    if (!extension) {
      throw new ValidationError('Validation failed', {
        image: ['The image must be a file of type: jpeg, png, jpg, webp, gif.'],
      });
    }
    const result = await this.service.uploadVehicleImage(id, {
      buffer: file.buffer,
      contentType: file.mimetype,
      extension,
    });
    res.status(200).json(result);
  };

  assignDevice = async (req: Request, res: Response): Promise<void> => {
    const { vehicleId } = parseOrThrow(VehicleIdPathParamSchema, req.params);
    const input = parseOrThrow(AssignDeviceRequestSchema, req.body);
    res.status(201).json(await this.service.assignDevice(vehicleId, String(input.device_id)));
  };

  unassignDevice = async (req: Request, res: Response): Promise<void> => {
    const { vehicleId } = parseOrThrow(VehicleIdPathParamSchema, req.params);
    res.status(200).json(await this.service.unassignDevice(vehicleId));
  };

  vehicleAssignmentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const query = parseOrThrow(AssignmentHistoryQuerySchema, req.query);
    const result = await this.service.vehicleAssignmentHistory(
      id,
      toFilters(query),
      query.page,
      query.per_page
    );
    const history = buildLaravelPaginator({
      items: result.historyItems,
      page: query.page,
      perPage: query.per_page,
      total: result.total,
      path: requestPath(req),
      query: { date_from: query.date_from, date_to: query.date_to },
    });
    res.status(200).json({
      success: result.success,
      message: result.message,
      data: { vehicle: result.vehicle, summary: result.summary, history },
    });
  };

  // -- Drivers --

  private driverListQuery(
    query: ReturnType<typeof ListDriversQuerySchema.parse>
  ): Omit<DriverListQuery, 'window'> {
    return {
      includeInactive: flagValue(query.include_inactive) === true,
      status: query.status,
      search: query.search,
      availabilityStatus: query.availability_status,
      employmentStatus: query.employment_status,
      assigned: flagValue(query.assigned),
      licenseExpiringWithinDays: query.license_expiring_within_days,
      licenseState: query.license_state,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  listDrivers = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListDriversQuerySchema, req.query);
    res.status(200).json(
      await this.service.listDrivers({
        ...this.driverListQuery(query),
        window: resolveWindow(query),
      })
    );
  };

  /** `GET /drivers/export` (D-0168, B11). */
  exportDrivers = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListDriversQuerySchema, req.query);
    await streamCsv(res, await this.service.exportDrivers(this.driverListQuery(query)));
  };

  updateDriver = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    const input = parseOrThrow(UpdateDriverRequestSchema, req.body);
    res
      .status(200)
      .json(
        await this.service.updateDriver(id, toUpdateDriverInput(input), input.expected_updated_at)
      );
  };

  deleteDriver = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteDriver(id));
  };

  deactivateDriver = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    res.status(200).json(await this.service.deactivateDriver(id));
  };

  reactivateDriver = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    res.status(200).json(await this.service.reactivateDriver(id));
  };

  createDriver = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateDriverRequestSchema, req.body);
    res.status(201).json(await this.service.createDriver(toCreateDriverInput(input)));
  };

  getDriver = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    res.status(200).json(await this.service.getDriver(id));
  };

  assignVehicle = async (req: Request, res: Response): Promise<void> => {
    const { driverId } = parseOrThrow(DriverIdPathParamSchema, req.params);
    const input = parseOrThrow(AssignVehicleRequestSchema, req.body);
    res
      .status(201)
      .json(
        await this.service.assignVehicleToDriver(
          driverId,
          String(input.vehicle_id),
          input.notes ?? null
        )
      );
  };

  unassignVehicle = async (req: Request, res: Response): Promise<void> => {
    const { driverId } = parseOrThrow(DriverIdPathParamSchema, req.params);
    const input = parseOrThrow(UnassignVehicleRequestSchema, req.body);
    res
      .status(200)
      .json(await this.service.unassignVehicleFromDriver(driverId, input.notes ?? null));
  };

  // -- D-0170 (B9): paged detail sub-lists — always paged (page 1, 20 per page unless asked otherwise) --

  private subListWindow(query: { page?: number | undefined; per_page?: number | undefined }) {
    return resolveWindow(query) ?? { page: 1, perPage: DEFAULT_PER_PAGE };
  }

  vehicleMaintenanceLogs = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const query = parseOrThrow(VehicleMaintenanceLogsQuerySchema, req.query);
    res.status(200).json(
      await this.service.listVehicleMaintenanceLogs(id, {
        dateFrom: query.date_from,
        dateTo: query.date_to,
        maintenanceScheduleId:
          query.maintenance_schedule_id === undefined
            ? undefined
            : String(query.maintenance_schedule_id),
        search: query.search,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        window: this.subListWindow(query),
      })
    );
  };

  vehicleFuelLogs = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const query = parseOrThrow(VehicleFuelLogsQuerySchema, req.query);
    res.status(200).json(
      await this.service.listVehicleFuelLogs(id, {
        dateFrom: query.date_from,
        dateTo: query.date_to,
        tripId: query.trip_id === undefined ? undefined : String(query.trip_id),
        search: query.search,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        window: this.subListWindow(query),
      })
    );
  };

  vehicleYardHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const query = parseOrThrow(VehicleYardHistoryQuerySchema, req.query);
    res.status(200).json(
      await this.service.listVehicleYardHistory(id, {
        dateFrom: query.date_from,
        dateTo: query.date_to,
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        open: flagValue(query.open),
        search: query.search,
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        window: this.subListWindow(query),
      })
    );
  };

  private incidentListQuery(
    query: ReturnType<typeof IncidentsQuerySchema.parse>
  ): IncidentListQuery {
    return {
      dateFrom: query.date_from,
      dateTo: query.date_to,
      severity: query.severity,
      vehicleId: query.vehicle_id === undefined ? undefined : String(query.vehicle_id),
      driverId: query.driver_id === undefined ? undefined : String(query.driver_id),
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      window: this.subListWindow(query),
    };
  }

  /** `GET /vehicles/counts` (D-0179, B7). */
  vehicleCounts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(VehicleCountsQuerySchema, req.query);
    res.status(200).json(
      await this.service.vehicleCounts({
        includeInactive: true, // ignored by the counts (every status is always counted)
        search: query.search,
        vehicleCategory: query.vehicle_category,
        fuelType: query.fuel_type,
        ownershipType: query.ownership_type,
        hasTracker: flagValue(query.has_tracker),
        hasDriver: flagValue(query.has_driver),
      })
    );
  };

  /** `GET /drivers/counts` (D-0179, B7). */
  driverCounts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(DriverCountsQuerySchema, req.query);
    res.status(200).json(
      await this.service.driverCounts({
        includeInactive: true, // ignored by the counts (every status is always counted)
        search: query.search,
        availabilityStatus: query.availability_status,
        employmentStatus: query.employment_status,
        assigned: flagValue(query.assigned),
        licenseExpiringWithinDays: query.license_expiring_within_days,
        licenseState: query.license_state,
      })
    );
  };

  /** `GET /incidents` (D-0179, B7): the company-wide incident list. */
  companyIncidents = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(IncidentsQuerySchema, req.query);
    res.status(200).json(await this.service.listIncidents(this.incidentListQuery(query)));
  };

  vehicleIncidents = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleIdParamSchema, req.params);
    const query = parseOrThrow(IncidentsQuerySchema, req.query);
    res
      .status(200)
      .json(await this.service.listVehicleIncidents(id, this.incidentListQuery(query)));
  };

  driverIncidents = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    const query = parseOrThrow(IncidentsQuerySchema, req.query);
    res.status(200).json(await this.service.listDriverIncidents(id, this.incidentListQuery(query)));
  };

  updateIncident = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(IncidentIdParamSchema, req.params);
    const body = parseOrThrow(UpdateIncidentRequestSchema, req.body);
    res.status(200).json(
      await this.service.updateIncident(
        id,
        {
          vehicleId:
            body.vehicle_id === undefined
              ? undefined
              : body.vehicle_id === null
                ? null
                : String(body.vehicle_id),
          incidentType: body.incident_type,
          severity: body.severity,
          incidentDate: body.incident_date,
          description: body.description,
        },
        body.expected_updated_at
      )
    );
  };

  deleteIncident = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(IncidentIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteIncident(id));
  };

  deleteVehicleImage = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(VehicleImageParamSchema, req.params);
    res.status(200).json(await this.service.deleteVehicleImage(id));
  };

  storeIncident = async (req: Request, res: Response): Promise<void> => {
    const { driverId } = parseOrThrow(DriverIdPathParamSchema, req.params);
    const input = parseOrThrow(StoreIncidentRequestSchema, req.body);
    res.status(201).json(
      await this.service.storeIncident(driverId, {
        vehicleId:
          input.vehicle_id !== undefined && input.vehicle_id !== null
            ? String(input.vehicle_id)
            : null,
        incidentType: input.incident_type,
        severity: input.severity,
        incidentDate: input.incident_date,
        description: input.description ?? null,
      })
    );
  };

  driverAssignmentHistory = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(DriverIdParamSchema, req.params);
    const query = parseOrThrow(AssignmentHistoryQuerySchema, req.query);
    const result = await this.service.driverAssignmentHistory(
      id,
      toFilters(query),
      query.page,
      query.per_page
    );
    const history = buildLaravelPaginator({
      items: result.historyItems,
      page: query.page,
      perPage: query.per_page,
      total: result.total,
      path: requestPath(req),
      query: { date_from: query.date_from, date_to: query.date_to },
    });
    res.status(200).json({
      success: result.success,
      message: result.message,
      data: { driver: result.driver, summary: result.summary, history },
    });
  };

  companyAssignmentHistory = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(CompanyAssignmentHistoryQuerySchema, req.query);
    const result = await this.service.companyAssignmentHistory(
      {
        ...toFilters(query),
        status: query.status,
        driverId: query.driver_id !== undefined ? String(query.driver_id) : undefined,
        vehicleId: query.vehicle_id !== undefined ? String(query.vehicle_id) : undefined,
      },
      query.page,
      query.per_page
    );
    const history = buildLaravelPaginator({
      items: result.historyItems,
      page: query.page,
      perPage: query.per_page,
      total: result.total,
      path: requestPath(req),
      query: {
        date_from: query.date_from,
        date_to: query.date_to,
        driver_id: query.driver_id,
        vehicle_id: query.vehicle_id,
        status: query.status,
      },
    });
    res.status(200).json({ success: result.success, message: result.message, data: history });
  };
}
