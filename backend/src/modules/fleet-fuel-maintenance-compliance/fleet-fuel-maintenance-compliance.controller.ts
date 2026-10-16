import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { flagValue, resolveWindow } from '../../platform/http/list-query.js';
import type { FleetFuelMaintenanceComplianceService } from './fleet-fuel-maintenance-compliance.service.js';
import type {
  CreateComplianceDocumentInput,
  CreateFuelLogInput,
  CreateMaintenanceLogInput,
  CreateMaintenanceScheduleInput,
} from './fleet-fuel-maintenance-compliance.types.js';
import {
  CreateComplianceDocumentRequestSchema,
  CreateFuelLogRequestSchema,
  CreateMaintenanceLogRequestSchema,
  CreateMaintenanceScheduleRequestSchema,
  ExpiringSoonQuerySchema,
  ListComplianceDocumentsQuerySchema,
  RecordIdParamSchema,
  UpdateComplianceDocumentRequestSchema,
  UpdateFuelLogRequestSchema,
  UpdateMaintenanceLogRequestSchema,
  UpdateMaintenanceScheduleRequestSchema,
  VehicleIdRouteParamSchema,
} from './fleet-fuel-maintenance-compliance.schemas.js';

function toCreateMaintenanceScheduleInput(
  body: ReturnType<typeof CreateMaintenanceScheduleRequestSchema.parse>
): CreateMaintenanceScheduleInput {
  return {
    serviceType: body.service_type,
    intervalDays: body.interval_days ?? null,
    intervalKm: body.interval_km ?? null,
    lastServiceDate: body.last_service_date ?? null,
    odometerBaselineKm: body.odometer_baseline_km ?? null,
    odometerBaselineDate: body.odometer_baseline_date ?? null,
    lastServiceOdometerKm: body.last_service_odometer_km ?? null,
  };
}

function toCreateMaintenanceLogInput(
  body: ReturnType<typeof CreateMaintenanceLogRequestSchema.parse>
): CreateMaintenanceLogInput {
  return {
    maintenanceScheduleId:
      body.maintenance_schedule_id !== null && body.maintenance_schedule_id !== undefined
        ? String(body.maintenance_schedule_id)
        : null,
    serviceType: body.service_type,
    serviceDate: body.service_date,
    odometerKm: body.odometer_km ?? null,
    cost: body.cost ?? null,
    vendor: body.vendor ?? null,
    notes: body.notes ?? null,
  };
}

function toCreateFuelLogInput(
  body: ReturnType<typeof CreateFuelLogRequestSchema.parse>
): CreateFuelLogInput {
  return {
    fillDate: body.fill_date,
    volume: body.volume,
    unit: body.unit,
    cost: body.cost ?? null,
    odometerKm: body.odometer_km ?? null,
    isFullTank: body.is_full_tank ?? true,
    vendor: body.vendor ?? null,
    stationName: body.station_name ?? null,
    unitPrice: body.unit_price ?? null,
    totalCost: body.total_cost ?? null,
    paymentMethod: body.payment_method ?? null,
    receiptReference: body.receipt_reference ?? null,
    tripId: body.trip_id !== null && body.trip_id !== undefined ? String(body.trip_id) : null,
  };
}

function toCreateComplianceDocumentInput(
  body: ReturnType<typeof CreateComplianceDocumentRequestSchema.parse>
): CreateComplianceDocumentInput {
  return {
    documentableType: body.documentable_type,
    documentableId: String(body.documentable_id),
    documentType: body.document_type,
    documentNumber: body.document_number ?? null,
    issueDate: body.issue_date ?? null,
    expiryDate: body.expiry_date ?? null,
    notes: body.notes ?? null,
  };
}

export class FleetFuelMaintenanceComplianceController {
  constructor(private readonly service: FleetFuelMaintenanceComplianceService) {}

  storeMaintenanceSchedule = async (req: Request, res: Response): Promise<void> => {
    const { vehicleId } = parseOrThrow(VehicleIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateMaintenanceScheduleRequestSchema, req.body);
    res
      .status(201)
      .json(
        await this.service.storeMaintenanceSchedule(
          vehicleId,
          toCreateMaintenanceScheduleInput(input)
        )
      );
  };

  storeMaintenanceLog = async (req: Request, res: Response): Promise<void> => {
    const { vehicleId } = parseOrThrow(VehicleIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateMaintenanceLogRequestSchema, req.body);
    res
      .status(201)
      .json(await this.service.storeMaintenanceLog(vehicleId, toCreateMaintenanceLogInput(input)));
  };

  storeFuelLog = async (req: Request, res: Response): Promise<void> => {
    const { vehicleId } = parseOrThrow(VehicleIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateFuelLogRequestSchema, req.body);
    res.status(201).json(await this.service.storeFuelLog(vehicleId, toCreateFuelLogInput(input)));
  };

  // -- D-0169 (B3): edit / delete --

  updateMaintenanceSchedule = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    const body = parseOrThrow(UpdateMaintenanceScheduleRequestSchema, req.body);
    res.status(200).json(
      await this.service.updateMaintenanceSchedule(
        id,
        {
          serviceType: body.service_type,
          intervalDays: body.interval_days,
          intervalKm: body.interval_km,
          lastServiceDate: body.last_service_date,
          odometerBaselineKm: body.odometer_baseline_km,
          odometerBaselineDate: body.odometer_baseline_date,
          lastServiceOdometerKm: body.last_service_odometer_km,
        },
        body.expected_updated_at
      )
    );
  };

  deleteMaintenanceSchedule = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteMaintenanceSchedule(id));
  };

  updateMaintenanceLog = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    const body = parseOrThrow(UpdateMaintenanceLogRequestSchema, req.body);
    res.status(200).json(
      await this.service.updateMaintenanceLog(
        id,
        {
          maintenanceScheduleId:
            body.maintenance_schedule_id === undefined
              ? undefined
              : body.maintenance_schedule_id === null
                ? null
                : String(body.maintenance_schedule_id),
          serviceType: body.service_type,
          serviceDate: body.service_date,
          odometerKm: body.odometer_km,
          cost: body.cost,
          vendor: body.vendor,
          notes: body.notes,
        },
        body.expected_updated_at
      )
    );
  };

  deleteMaintenanceLog = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteMaintenanceLog(id));
  };

  updateFuelLog = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    const body = parseOrThrow(UpdateFuelLogRequestSchema, req.body);
    res.status(200).json(
      await this.service.updateFuelLog(
        id,
        {
          fillDate: body.fill_date,
          volume: body.volume,
          unit: body.unit,
          cost: body.cost,
          odometerKm: body.odometer_km,
          isFullTank: body.is_full_tank,
          vendor: body.vendor,
          stationName: body.station_name,
          unitPrice: body.unit_price,
          totalCost: body.total_cost,
          paymentMethod: body.payment_method,
          receiptReference: body.receipt_reference,
          tripId:
            body.trip_id === undefined
              ? undefined
              : body.trip_id === null
                ? null
                : String(body.trip_id),
        },
        body.expected_updated_at
      )
    );
  };

  deleteFuelLog = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteFuelLog(id));
  };

  updateComplianceDocument = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    const body = parseOrThrow(UpdateComplianceDocumentRequestSchema, req.body);
    res.status(200).json(
      await this.service.updateComplianceDocument(
        id,
        {
          documentType: body.document_type,
          documentNumber: body.document_number,
          issueDate: body.issue_date,
          expiryDate: body.expiry_date,
          notes: body.notes,
        },
        body.expected_updated_at
      )
    );
  };

  deleteComplianceDocument = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RecordIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteComplianceDocument(id));
  };

  listComplianceDocuments = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListComplianceDocumentsQuerySchema, req.query);
    res.status(200).json(
      await this.service.listComplianceDocuments(query.documentable_type, query.documentable_id, {
        search: query.search,
        documentType: query.document_type,
        expiringWithinDays: query.expiring_within_days,
        expired: flagValue(query.expired),
        sortBy: query.sort_by,
        sortOrder: query.sort_order,
        window: resolveWindow(query),
      })
    );
  };

  storeComplianceDocument = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateComplianceDocumentRequestSchema, req.body);
    res
      .status(201)
      .json(await this.service.storeComplianceDocument(toCreateComplianceDocumentInput(input)));
  };

  expiringSoonComplianceDocuments = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ExpiringSoonQuerySchema, req.query);
    res.status(200).json(await this.service.listExpiringSoonComplianceDocuments(query.within_days));
  };
}
