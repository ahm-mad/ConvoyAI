import { z } from 'zod';
import {
  FlagSchema,
  idListParam,
  listQueryShape,
  sortByEnum,
} from '../../platform/http/list-query.js';
import { registerCsvExportPath } from '../../platform/openapi/csv-export-path.js';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { FUEL_LOG_SORT_FIELDS, MAINTENANCE_LOG_SORT_FIELDS } from './fleet-records.types.js';

const text = z.string().trim().max(255).optional();
const cost = z.coerce.number().min(0).optional();

/** `GET /maintenance-logs` — always paged (`page` default 1, `per_page` default 20, max 100). */
export const ListMaintenanceLogsQuerySchema = z.object({
  /** Inclusive calendar dates on `service_date`; a reversed range is swapped. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  vehicle_id: idListParam('vehicle id'),
  /** Express 5's simple query parser hands `vehicle_id[]=1&vehicle_id[]=2` over as a key literally named `vehicle_id[]`. */
  'vehicle_id[]': idListParam('vehicle id'),
  vehicle_category: text,
  service_type: text,
  vendor: text,
  min_cost: cost,
  max_cost: cost,
  sort_by: sortByEnum(MAINTENANCE_LOG_SORT_FIELDS),
  ...listQueryShape,
});

/** `GET /fuel-logs` — always paged (`page` default 1, `per_page` default 20, max 100). */
export const ListFuelLogsQuerySchema = z.object({
  /** Inclusive calendar dates on `fill_date`; a reversed range is swapped. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  vehicle_id: idListParam('vehicle id'),
  'vehicle_id[]': idListParam('vehicle id'),
  vehicle_category: text,
  vendor: text,
  payment_method: text,
  trip_id: z.coerce.number().int().min(1).optional(),
  is_full_tank: FlagSchema,
  sort_by: sortByEnum(FUEL_LOG_SORT_FIELDS),
  ...listQueryShape,
});

/** `GET /compliance-documents/counts`. */
export const ComplianceCountsQuerySchema = z.object({
  documentable_type: z
    .enum(['vehicle', 'driver'], { error: 'The selected documentable type is invalid.' })
    .optional(),
  document_type: text,
});

const SuccessDataSchema = z.record(z.string(), z.unknown());
const ok = {
  200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
};

openApiRegistry.registerPath({
  method: 'get',
  path: '/maintenance-logs',
  tags: ['fleet-records'],
  summary:
    'D-0188 (flow 07 C2): every maintenance log of the company with its vehicle; always paged; filters from / to (service_date), vehicle_id[], vehicle_category, service_type, vendor, min_cost, max_cost, search; sort_by + sort_order; meta.summary = count / total cost / average cost of the whole filtered set',
  responses: ok,
});
registerCsvExportPath(
  '/maintenance-logs/export',
  'fleet-records',
  "D-0188 (flow 07 C2): the list's own filters / sort, every matching maintenance log as CSV (streamed)"
);

openApiRegistry.registerPath({
  method: 'get',
  path: '/fuel-logs',
  tags: ['fleet-records'],
  summary:
    'D-0188 (flow 07 C3): every fuel log of the company with its vehicle; always paged; filters from / to (fill_date), vehicle_id[], vehicle_category, vendor, payment_method, trip_id, is_full_tank, search; sort_by + sort_order; meta.summary = count / litres (gallons converted) / total cost / average price per litre of the whole filtered set',
  responses: ok,
});
registerCsvExportPath(
  '/fuel-logs/export',
  'fleet-records',
  "D-0188 (flow 07 C3): the list's own filters / sort, every matching fuel log as CSV (streamed)"
);

openApiRegistry.registerPath({
  method: 'get',
  path: '/compliance-documents/counts',
  tags: ['fleet-records'],
  summary:
    "D-0188 (flow 07 C4): counts of the company's compliance documents in six exclusive expiry buckets (expired, 0-7 days, 8-30, 31-60, more than 60, no expiry) overall, by owner type (vehicle / driver) and by document type, judged against today in the company timezone; optional documentable_type and document_type filters",
  responses: ok,
});
