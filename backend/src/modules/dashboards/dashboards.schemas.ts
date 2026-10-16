import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 2.7 (dashboards/widgets/widget_settings). Request
 * shapes match `DashboardController`/`WidgetController`/
 * `WidgetSettingController`/`HomeController`'s validation exactly
 * (`reference/api-catalog.md`'s "Dashboard / Widgets / Home" section,
 * `11-dashboards.md`'s Design notes).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('DashboardsErrorResponse');

const SuccessDataSchema = z.record(z.string(), z.unknown());

// -- GET /dashboards, GET /admin/dashboard -----------------------------------

export const ListDashboardsRequestSchema = z.object({
  search: z.string().max(255).optional(),
  // 11.9 fix: an explicit allow-list of `dashboards`' own real columns —
  // not `Schema::hasColumn('protocols', ...)` runtime introspection.
  sort_by: z.enum(['id', 'name', 'created_at', 'updated_at']).default('id'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

for (const [path, summary] of [
  ['/dashboards', "Own dashboards only (D-0068's tenant-scoping extension)"],
  ['/admin/dashboard', 'role:admin — the one deliberate cross-tenant view this module owns'],
] as const) {
  openApiRegistry.registerPath({
    method: 'get',
    path,
    tags: ['dashboards'],
    summary,
    request: { query: ListDashboardsRequestSchema },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    },
  });
}

// -- POST /dashboards, GET/PUT/DELETE /dashboards/{id} -----------------------

export const CreateDashboardRequestSchema = z
  .object({ name: z.string().min(1).max(255) })
  .openapi('CreateDashboardRequest');

export const UpdateDashboardRequestSchema = z
  .object({ name: z.string().max(255).nullable().optional() })
  .openapi('UpdateDashboardRequest');

export const DashboardIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'post',
  path: '/dashboards',
  tags: ['dashboards'],
  request: { body: { content: { 'application/json': { schema: CreateDashboardRequestSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: SuccessDataSchema } } },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/dashboards/{id}',
  tags: ['dashboards'],
  summary:
    'Bare model (no envelope). Each widget carries a computed values[] via the canonical evaluator.',
  request: { params: DashboardIdParamSchema },
  responses: {
    200: {
      description: 'Bare dashboard model, enriched',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    404: {
      description:
        "Not found (frozen contract's own {error,status,code} shape, not the standard envelope)",
      content: {
        'application/json': {
          schema: z.object({ error: z.string(), status: z.string(), code: z.number() }),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/dashboards/{id}',
  tags: ['dashboards'],
  summary: '{name?} only — $request->all() not ported (mass-assignment fix)',
  request: {
    params: DashboardIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateDashboardRequestSchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: SuccessDataSchema } } },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/dashboards/{id}',
  tags: ['dashboards'],
  request: { params: DashboardIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /user/{userId}/dashboards --------------------------------------------

export const UserIdParamSchema = z.object({ userId: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/user/{userId}/dashboards',
  tags: ['dashboards'],
  summary: "{userId} must equal the caller's own id (D-0062 pattern), 403 otherwise",
  request: { params: UserIdParamSchema },
  responses: {
    200: {
      description: 'id+name only',
      content: { 'application/json': { schema: SuccessDataSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /admin/manage-users, /stats/count-all, /users/all, /users/monthly-registrations --

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/manage-users',
  tags: ['dashboards'],
  summary:
    "role:admin + permission 'manage users' (the literal space, matching Laravel's odd naming exactly)",
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': { schema: z.object({ message: z.string(), status: z.string() }) },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/stats/count-all',
  tags: ['dashboards'],
  summary: 'Global counts, NOT company-scoped (matches Laravel exactly, not a bug)',
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/users/all',
  tags: ['dashboards'],
  summary: 'All users, NOT company-scoped',
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

export const MonthlyRegistrationsRequestSchema = z.object({
  range: z.enum(['1w', '1m', '3m', '6m', '1y']).optional(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/users/monthly-registrations',
  tags: ['dashboards'],
  request: { query: MonthlyRegistrationsRequestSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

// -- GET /dashboard/analytics --------------------------------------------------

export const AnalyticsRequestSchema = z.object({
  user_id: z.coerce.number().int().positive().optional(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/dashboard/analytics',
  tags: ['dashboards'],
  summary: "Offline threshold unified at 30min (D-0068's sibling decision)",
  request: { query: AnalyticsRequestSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /dashboard/packet-history --------------------------------------------

export const PacketHistoryRequestSchema = z.object({
  product_id: z.coerce.number().int().positive().optional(),
  protocol_id: z.coerce.number().int().positive().optional(),
  device_id: z.string().max(255).optional(),
  status: z.enum(['alert', 'normal']).optional(),
  search: z.string().max(255).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(15),
  page: z.coerce.number().int().min(1).default(1),
  sort_by: z
    .enum(['created_at', 'id', 'product_id', 'protocol_id', 'received_at'])
    .default('created_at'),
  // Laravel accepts both `sort_dir` and `sort_order` for compatibility, `sort_dir` wins.
  sort_dir: z.enum(['asc', 'desc']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/dashboard/packet-history',
  tags: ['dashboards'],
  summary:
    "Uses the canonical evaluator (D-0059's per-condition product scoping), not the old 4th duplicate evaluator",
  request: { query: PacketHistoryRequestSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

// -- Widgets --------------------------------------------------------------------

export const WidgetIdParamSchema = z.object({ widget: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/widgets',
  tags: ['dashboards'],
  summary:
    "Scoped to the caller's own widgets (Design notes: closes WidgetController::index()'s unscoped-listing bug)",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

export const CreateWidgetRequestSchema = z
  .object({
    dashboard_id: z.coerce.number().int().positive(),
    x: z.coerce.number().int(),
    y: z.coerce.number().int(),
    w: z.coerce.number().int(),
    h: z.coerce.number().int(),
    type: z.string().min(1).max(255),
  })
  .openapi('CreateWidgetRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/widgets',
  tags: ['dashboards'],
  request: { body: { content: { 'application/json': { schema: CreateWidgetRequestSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: SuccessDataSchema } } },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const UpdateWidgetRequestSchema = z
  .object({
    x: z.coerce.number().int(),
    y: z.coerce.number().int(),
    w: z.coerce.number().int(),
    h: z.coerce.number().int(),
  })
  .openapi('UpdateWidgetRequest');

openApiRegistry.registerPath({
  method: 'get',
  path: '/widgets/{widget}',
  tags: ['dashboards'],
  summary:
    "Spreads the FIRST widget-setting's fields at top level, then nests all settings under widget_settings",
  request: { params: WidgetIdParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Widget or no settings yet',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/widgets/{widget}',
  tags: ['dashboards'],
  request: {
    params: WidgetIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateWidgetRequestSchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/widgets/{widget}',
  tags: ['dashboards'],
  request: { params: WidgetIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- Widget settings --------------------------------------------------------------

const WidgetSettingConditionSchema = z.object({
  selectedProduct: z.string().nullable().optional(),
  selectedAttribute: z.string().nullable().optional(),
  selectedCondition: z.string().nullable().optional(),
  conditionValue: z.string().nullable().optional(),
  logicalOperator: z.string().nullable().optional(),
});

const WidgetSettingEntrySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  settings: z.unknown().optional(),
  attributes: z.string().max(255).optional(),
  y_axis_label: z.string().max(255).optional(),
  device: z.string().max(255).optional(),
  data: z.string().max(255).optional(),
  unit: z.string().max(255).optional(),
  icon: z.string().max(255).optional(),
  decimal: z.string().max(255).optional(),
  show_timestamp: z.boolean().optional(),
  product: z.string().max(255).optional(),
  label: z.string().max(255).optional(),
  background_color: z.string().max(255).optional(),
  value_color: z.string().max(255).optional(),
  text_color: z.string().max(255).optional(),
  max_value: z.string().max(255).optional(),
  tank_type: z.string().max(255).optional(),
  graph_type: z.string().max(255).optional(),
  enabled: z
    .union([z.boolean(), z.literal(1), z.literal(0), z.literal('1'), z.literal('0')])
    .optional(),
  conditions: z.array(WidgetSettingConditionSchema).min(1).optional(),
});

export const StoreWidgetSettingsRequestSchema = z
  .object({
    widget_name: z.string().max(255).nullable().optional(),
    graph_interval: z.string().max(255).nullable().optional(),
    widget_settings: z.array(WidgetSettingEntrySchema).min(1),
  })
  .openapi('StoreWidgetSettingsRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/widgets/{widget}/settings',
  tags: ['dashboards'],
  summary:
    'Creates one Rule per widget_settings entry, not one per widget. Closes the previously-zero ownership check on {widget}.',
  request: {
    params: WidgetIdParamSchema,
    body: { content: { 'application/json': { schema: StoreWidgetSettingsRequestSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/widget-settings',
  tags: ['dashboards'],
  summary:
    "Scoped to the caller's own widget settings (Design notes: closes WidgetSettingController::index()'s unscoped-listing bug)",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
  },
});

export const WidgetSettingIdParamSchema = z.object({
  widgetSetting: z.coerce.number().int().positive(),
});

/** `POST /widget-settings` — the apiResource-registered route has no `{widget}` segment to route-model-bind, so Laravel's own `store(Request $request, Widget $widget)` can never actually be satisfied here (`api-catalog.md` flags this as needing verification). Accepting `widget_id` in the body instead makes this route genuinely usable rather than always-broken (a safer deviation, logged in DECISIONS.md, README prime directive #4). */
export const StoreWidgetSettingsResourceRequestSchema = StoreWidgetSettingsRequestSchema.extend({
  widget_id: z.coerce.number().int().positive(),
}).openapi('StoreWidgetSettingsResourceRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/widget-settings',
  tags: ['dashboards'],
  summary:
    "apiResource-registered; no {widget} route param exists to satisfy Laravel's own controller signature — this app accepts widget_id in the body instead (deviation logged, D-0070)",
  request: {
    body: { content: { 'application/json': { schema: StoreWidgetSettingsResourceRequestSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/widget-settings/{widgetSetting}',
  tags: ['dashboards'],
  summary: 'Bare model',
  request: { params: WidgetSettingIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const WidgetSettingUpdateEntrySchema = WidgetSettingEntrySchema;

export const UpdateWidgetSettingsRequestSchema = z
  .object({
    widget_id: z.coerce.number().int().positive().optional(),
    widget_name: z.string().max(255).nullable().optional(),
    graph_interval: z.string().max(255).nullable().optional(),
    widget_settings: z.array(WidgetSettingUpdateEntrySchema).min(1),
  })
  .openapi('UpdateWidgetSettingsRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/widget-settings/{widgetSetting}',
  tags: ['dashboards'],
  summary:
    "The URL's {widgetSetting} is genuinely unused by Laravel (no such controller param) — each entry's own id drives create-vs-update (Design notes, ported as-is)",
  request: {
    params: WidgetSettingIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateWidgetSettingsRequestSchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: SuccessDataSchema } } },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/widget-settings/{widgetSetting}',
  tags: ['dashboards'],
  request: { params: WidgetSettingIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) },
      },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- Unauthenticated: POST /widgets/graph-data (HomeController::getAssetDeviceDataByWidget) --

export const GraphDataRequestSchema = z
  .object({
    graph_widget: z.record(z.string(), z.enum(['hourly', 'daily', 'weekly', 'monthly'])),
  })
  .openapi('GraphDataRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/widgets/graph-data',
  tags: ['dashboards'],
  security: [],
  summary:
    'UNAUTHENTICATED (matches Laravel/openapi.yaml exactly, a resolved judgment call — see 11-dashboards.md Scope)',
  request: { body: { content: { 'application/json': { schema: GraphDataRequestSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
    400: {
      description: 'graph_widget missing/empty',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'No matching widgets',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
