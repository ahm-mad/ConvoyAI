import type { Request, Response } from 'express';
import { streamCsv } from '../../platform/http/csv.js';
import { flagValue, mergeIdLists, resolveWindow } from '../../platform/http/list-query.js';
import { parseOrThrow } from '../../platform/http/validate.js';
import { ListMaintenanceSchedulesQuerySchema } from './fleet-maintenance-due.schemas.js';
import type { FleetMaintenanceDueService } from './fleet-maintenance-due.service.js';
import type { ScheduleListQuery } from './fleet-maintenance-due.types.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. */
export class FleetMaintenanceDueController {
  constructor(private readonly service: FleetMaintenanceDueService) {}

  private toQuery(
    query: ReturnType<typeof ListMaintenanceSchedulesQuerySchema.parse>
  ): Omit<ScheduleListQuery, 'window'> {
    const statuses = [...new Set([...(query.status ?? []), ...(query['status[]'] ?? [])])];
    return {
      statuses: statuses.length > 0 ? statuses : undefined,
      vehicleIds: mergeIdLists(query.vehicle_id, query['vehicle_id[]']),
      serviceType: query.service_type || undefined,
      vehicleCategory: query.vehicle_category || undefined,
      dueBefore: query.due_before,
      search: query.search,
      includeInactive: flagValue(query.include_inactive) === true,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListMaintenanceSchedulesQuerySchema, req.query);
    res
      .status(200)
      .json(await this.service.list({ ...this.toQuery(query), window: resolveWindow(query) }));
  };

  /** `GET /maintenance-schedules/export` (D-0184, C1): the list's own filters / sort, streamed as CSV. */
  exportSchedules = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListMaintenanceSchedulesQuerySchema, req.query);
    await streamCsv(res, await this.service.exportRows(this.toQuery(query)));
  };
}
