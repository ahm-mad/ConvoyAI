import { z } from 'zod';
import {
  FlagSchema,
  idListParam,
  listQueryShape,
  sortByEnum,
} from '../../platform/http/list-query.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { SCHEDULE_SORT_FIELDS } from './fleet-maintenance-due.types.js';

const STATUS_MESSAGE = 'The selected status is invalid.';
const statusParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const parts = (Array.isArray(value) ? value : [value])
      .flatMap(entry => entry.split(','))
      .map(entry => entry.trim())
      .filter(entry => entry !== '');
    if (parts.some(part => !['overdue', 'due_soon', 'ok', 'unknown'].includes(part))) {
      ctx.addIssue({ code: 'custom', message: STATUS_MESSAGE });
      return z.NEVER;
    }
    return parts.length > 0
      ? ([...new Set(parts)] as ('overdue' | 'due_soon' | 'ok' | 'unknown')[])
      : undefined;
  });

/** `GET /maintenance-schedules` — always paged (`page` default 1, `per_page` default 20, max 100). */
export const ListMaintenanceSchedulesQuerySchema = z.object({
  status: statusParam,
  /** Express 5's simple query parser hands `status[]=a&status[]=b` over as a key literally named `status[]`. */
  'status[]': statusParam,
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  service_type: z.string().trim().max(255).optional(),
  vehicle_category: z.string().trim().max(255).optional(),
  /** Only schedules whose next due date is on or before this date. */
  due_before: z.coerce.date().optional(),
  /** Also list the schedules of retired / sold vehicles (left out by default). */
  include_inactive: FlagSchema,
  sort_by: sortByEnum(SCHEDULE_SORT_FIELDS),
  ...listQueryShape,
});

const SuccessDataSchema = z.record(z.string(), z.unknown());

openApiRegistry.registerPath({
  method: 'get',
  path: '/maintenance-schedules',
  tags: ['fleet-maintenance-due'],
  summary:
    'D-0184 (flow 07 C1): every maintenance schedule of the company with its vehicle and the COMPUTED due state (next due date / odometer, days / km until due, status overdue | due_soon | ok | unknown); always paged; filters status, vehicle_id, service_type, vehicle_category, due_before, search; `meta.counts` per status for filter chips',
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});
registerCsvExportPath(
  '/maintenance-schedules/export',
  'fleet-maintenance-due',
  "D-0184 (flow 07 C1): the list's own filters / sort, every matching schedule as CSV (streamed)"
);
