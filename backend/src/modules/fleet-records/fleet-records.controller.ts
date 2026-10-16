import type { Request, Response } from 'express';
import { streamCsv } from '../../platform/http/csv.js';
import { flagValue, mergeIdLists, resolveWindow } from '../../platform/http/list-query.js';
import { parseOrThrow } from '../../platform/http/validate.js';
import {
  ComplianceCountsQuerySchema,
  ListFuelLogsQuerySchema,
  ListMaintenanceLogsQuerySchema,
} from './fleet-records.schemas.js';
import type { FleetRecordsService } from './fleet-records.service.js';
import type { FuelLogListQuery, MaintenanceLogListQuery } from './fleet-records.types.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. */
export class FleetRecordsController {
  constructor(private readonly service: FleetRecordsService) {}

  private maintenanceQuery(
    query: ReturnType<typeof ListMaintenanceLogsQuerySchema.parse>
  ): Omit<MaintenanceLogListQuery, 'window'> {
    return {
      from: query.from,
      to: query.to,
      vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
      vehicleCategory: query.vehicle_category || undefined,
      serviceType: query.service_type || undefined,
      vendor: query.vendor || undefined,
      minCost: query.min_cost,
      maxCost: query.max_cost,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  private fuelQuery(
    query: ReturnType<typeof ListFuelLogsQuerySchema.parse>
  ): Omit<FuelLogListQuery, 'window'> {
    return {
      from: query.from,
      to: query.to,
      vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
      vehicleCategory: query.vehicle_category || undefined,
      vendor: query.vendor || undefined,
      paymentMethod: query.payment_method || undefined,
      tripId: query.trip_id === undefined ? undefined : String(query.trip_id),
      isFullTank: flagValue(query.is_full_tank),
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  listMaintenanceLogs = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListMaintenanceLogsQuerySchema, req.query);
    res.status(200).json(
      await this.service.listMaintenanceLogs({
        ...this.maintenanceQuery(query),
        window: resolveWindow(query),
      })
    );
  };

  exportMaintenanceLogs = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListMaintenanceLogsQuerySchema, req.query);
    await streamCsv(res, await this.service.exportMaintenanceLogs(this.maintenanceQuery(query)));
  };

  listFuelLogs = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListFuelLogsQuerySchema, req.query);
    res
      .status(200)
      .json(
        await this.service.listFuelLogs({ ...this.fuelQuery(query), window: resolveWindow(query) })
      );
  };

  exportFuelLogs = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListFuelLogsQuerySchema, req.query);
    await streamCsv(res, await this.service.exportFuelLogs(this.fuelQuery(query)));
  };

  complianceCounts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ComplianceCountsQuerySchema, req.query);
    res.status(200).json(
      await this.service.complianceCounts({
        documentableType: query.documentable_type,
        documentType: query.document_type || undefined,
      })
    );
  };
}
