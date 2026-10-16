import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import type { FleetDashboardService } from './fleet-dashboard.service.js';
import type { AlarmSeverity, VehicleScope } from './fleet-dashboard.types.js';
import { mergeIdLists, resolveWindow } from '../../platform/http/list-query.js';
import { streamCsv } from '../../platform/http/csv.js';
import {
  AlertsQuerySchema,
  DateRangeQuerySchema,
  OverviewQuerySchema,
  StatusSummaryQuerySchema,
  TrendsQuerySchema,
  VehiclePerformanceQuerySchema,
} from './fleet-dashboard.schemas.js';

type ScopeQuery = {
  vehicle_category?: string | undefined;
  cost_centre?: string | undefined;
  vehicle_id?: string[] | undefined;
  'vehicle_id[]'?: string[] | undefined;
  driver_id?: string[] | undefined;
  'driver_id[]'?: string[] | undefined;
  yard_id?: number | undefined;
};

function scopeOf(query: ScopeQuery): VehicleScope {
  return {
    vehicleCategory: query.vehicle_category || undefined,
    costCentre: query.cost_centre || undefined,
    vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
    driverIds: mergeIdLists(query.driver_id, query['driver_id[]']),
    yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
  };
}

const VALID_SEVERITIES: AlarmSeverity[] = ['critical', 'warning', 'info'];

export class FleetDashboardController {
  constructor(private readonly service: FleetDashboardService) {}

  overview = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(OverviewQuerySchema, req.query);
    res
      .status(200)
      .json(
        await this.service.overview(query, query.fleet_only === '1' || query.fleet_only === 'true')
      );
  };

  trends = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(TrendsQuerySchema, req.query);
    const interval = query.interval ?? 'day';
    res.status(200).json(await this.service.trends(query, interval));
  };

  vehiclePerformance = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(VehiclePerformanceQuerySchema, req.query);
    const sortBy = query.sort_by ?? query.sort ?? 'utilisation_rate';
    const sortDir = query.sort_order ?? query.direction ?? 'desc';
    const options = { scope: scopeOf(query), search: query.search };
    const window = resolveWindow(query);
    res.status(200).json(
      window
        ? await this.service.vehiclePerformancePaged(query, sortBy, sortDir, {
            ...options,
            window,
          })
        : await this.service.vehiclePerformance(query, sortBy, sortDir, options)
    );
  };

  /** `GET /fleet/dashboard/vehicle-performance/export` (D-0184, A8): the table's own filters / sort, streamed as CSV. */
  exportVehiclePerformance = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(VehiclePerformanceQuerySchema, req.query);
    const sortBy = query.sort_by ?? query.sort ?? 'utilisation_rate';
    const sortDir = query.sort_order ?? query.direction ?? 'desc';
    await streamCsv(
      res,
      await this.service.exportVehiclePerformance(query, sortBy, sortDir, {
        scope: scopeOf(query),
        search: query.search,
      })
    );
  };

  /** `GET /fleet/status-summary` (D-0184, flow 07 B3). */
  statusSummary = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(StatusSummaryQuerySchema, req.query);
    res.status(200).json(await this.service.statusSummary(scopeOf(query)));
  };

  alerts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(AlertsQuerySchema, req.query);
    const severities = query.severity
      ? query.severity
          .split(',')
          .map(s => s.trim())
          .filter((s): s is AlarmSeverity => (VALID_SEVERITIES as string[]).includes(s))
      : [];
    const fleetOnly = query.fleet_only === '1' || query.fleet_only === 'true';
    res.status(200).json(await this.service.activeAlerts(severities, fleetOnly));
  };

  financial = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(DateRangeQuerySchema, req.query);
    res.status(200).json(await this.service.financial(query));
  };
}
