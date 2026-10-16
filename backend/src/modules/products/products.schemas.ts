import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 2.1 (products). Paths/payloads/response field
 * names match the frozen contract exactly (`reference/openapi.yaml`'s
 * `/products*`, `/get-encrypt-token`, `/product-settings/*`, `/store-*`,
 * `/attribute/preference/*`, `/preconfigure-templates*` paths) — same
 * "match real behavior" instruction as D-0042/D-0045. Lean nested shapes
 * (D-0030/D-0041/D-0042/D-0045 precedent).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('ProductsErrorResponse');

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('ProductsSuccessMessage');

const ProductResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    status: z.string(),
    company_id: z.number().int(),
    created_by: z.number().int(),
    device_protocol_id: z.number().int().nullable(),
    preconfigure_template_id: z.number().int().nullable(),
    devices_count: z.number().int(),
    attribute_preferences_count: z.number().int(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Product');

const DeviceResponseSchema = z
  .object({
    id: z.number().int(),
    device_unique_identifier: z.string(),
    name: z.string(),
    status: z.string(),
    location: z.string(),
    tags: z.string(),
    product_id: z.number().int(),
    user_id: z.number().int(),
  })
  .openapi('ProductsDevice');

/**
 * D-0144: `tags` dropped from `POST /products`'s device request+response only, at the owner's
 * explicit request (relayed via the sync bridge) — nothing displays it and the frontend removed
 * the input. Deliberately a separate schema from `DeviceResponseSchema` above, not a shared-schema
 * edit: `GET /products/{product}` (`ProductShowResponseSchema`, `toProductDeviceDetailResponse`)
 * still returns `tags` — out of scope for this ask, untouched. The `devices.tags` DB column itself
 * is untouched too (still `NOT NULL`, `createDevices` writes `""`) — a reversible, schema-only
 * removal, not a destructive migration.
 */
const CreateDeviceResponseSchema = z
  .object({
    id: z.number().int(),
    device_unique_identifier: z.string(),
    name: z.string(),
    status: z.string(),
    location: z.string(),
    product_id: z.number().int(),
    user_id: z.number().int(),
  })
  .openapi('CreatedProductDevice');

const LaravelPaginatorLinkSchema = z.object({
  url: z.string().nullable(),
  label: z.string(),
  active: z.boolean(),
});

const ProductsPaginatorResponseSchema = z
  .object({
    current_page: z.number().int(),
    data: z.array(ProductResponseSchema),
    first_page_url: z.string(),
    from: z.number().int().nullable(),
    last_page: z.number().int(),
    last_page_url: z.string(),
    links: z.array(LaravelPaginatorLinkSchema),
    next_page_url: z.string().nullable(),
    path: z.string(),
    per_page: z.number().int(),
    prev_page_url: z.string().nullable(),
    to: z.number().int().nullable(),
    total: z.number().int(),
  })
  .openapi('ProductsPaginator');

const ListProductsFiltersSchema = z.object({
  user_id: z.number().int().nullable(),
  search: z.string().nullable(),
  sort_by: z.string(),
  sort_order: z.string(),
});

// -- GET /products, POST /products --------------------------------------

export const ListProductsRequestSchema = z.object({
  search: z.string().optional(),
  sort_by: z.string().default('id'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(0).default(0),
  user_id: z.coerce.number().int().optional(),
});

export const ListProductsResponseSchema = z
  .union([
    z
      .object({
        success: z.literal(true),
        message: z.string(),
        data: ProductsPaginatorResponseSchema,
        filters: ListProductsFiltersSchema,
      })
      .openapi('ListProductsResponse'),
    // ProductController.php:85-96 — `user_id` filter applied, zero matches: no `data` key at all.
    z
      .object({
        success: z.literal(false),
        message: z.string(),
        filters: ListProductsFiltersSchema,
      })
      .openapi('ListProductsEmptyForUserResponse'),
  ])
  .openapi('ListProductsResponseUnion');

openApiRegistry.registerPath({
  method: 'get',
  path: '/products',
  tags: ['products'],
  summary: "List products in the caller's own company",
  request: { query: ListProductsRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ListProductsResponseSchema } },
    },
  },
});

export const CreateDeviceRequestSchema = z.object({
  device_unique_identifier: z.string(),
  name: z.string().max(255),
  location: z.string().max(255),
});

/**
 * D-0148: a manual device row may now be missing a field — real per-row validation moved to
 * `ProductsService.resolveDeviceImport` so a bad manual row reports in `import_summary.errors[]`
 * instead of rejecting the whole request (matching how a bad CSV row is handled; the two paths
 * share one validation pass, see the service). `CreateDeviceRequestSchema` above (all fields
 * required) is kept as-is for `PUT`/other endpoints that still need a strict single-device shape.
 */
const DeviceImportRowRequestSchema = z.object({
  device_unique_identifier: z.string().optional(),
  name: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
});

/**
 * D-0148: `POST /products` accepts `multipart/form-data` now (to carry an optional CSV file
 * alongside everything else, `communication/flows/03-device-bulk-csv-import.md`) as well as the
 * original `application/json` — multipart form fields are always strings, so `devices` may arrive
 * as a JSON-encoded string instead of an already-parsed array; this `z.preprocess` normalizes
 * both. A string that isn't valid JSON is passed through unchanged so the array schema below
 * fails it with a clear message rather than this preprocessing step swallowing the error.
 */
const DevicesFieldSchema = z.preprocess((value): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, z.array(DeviceImportRowRequestSchema).default([]));

export const CreateProductRequestSchema = z
  .object({
    // D-0106: all three are `sometimes|nullable|exists:...` in Laravel — `.nullable()` matters
    // here, not cosmetic: without it, `z.coerce.number()` turns a legitimate `null` (client
    // choosing not to set one of these) into `0` via `Number(null) === 0`, which then looks like a
    // real (bad) id to everything downstream instead of "not provided".
    existing_product_id: z.coerce.number().int().nullable().optional(),
    preconfigure_template_id: z.coerce.number().int().nullable().optional(),
    product_name: z.string().max(255).optional(),
    device_protocol_id: z.coerce.number().int().nullable().optional(),
    // D-0148: `.min(1)` dropped — a CSV-only submission can legitimately send an empty array.
    // `resolveDeviceImport` rejects the request if BOTH `devices` and the CSV file are empty.
    devices: DevicesFieldSchema,
  })
  .openapi('CreateProductRequest');

/** D-0148: additive — every field here is new, nothing existing removed/renamed (matches the sync-bridge ask's own proposed shape). */
const DeviceImportErrorSchema = z.object({
  source: z.enum(['manual', 'csv']),
  index: z.number().int().optional(),
  row: z.number().int().optional(),
  device_unique_identifier: z.string().nullable(),
  errors: z.array(z.string()),
});

const DeviceImportSummarySchema = z.object({
  manual_count: z.number().int(),
  csv_count: z.number().int(),
  created_count: z.number().int(),
  failed_count: z.number().int(),
  errors: z.array(DeviceImportErrorSchema),
});

export const CreateProductResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    product: ProductResponseSchema,
    devices: z.array(CreateDeviceResponseSchema),
    import_summary: DeviceImportSummarySchema,
  })
  .openapi('CreateProductResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/products',
  tags: ['products'],
  summary:
    '3 modes: reuse existing_product_id, from preconfigure_template_id, or brand new by product_name. Also creates the required Device(s) (D-0046). D-0148: also accepts multipart/form-data with an optional CSV `file` for bulk device import — manual + CSV rows are merged, validated, and created together; per-row failures are reported in `import_summary`, not rejected as a whole request.',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateProductRequestSchema },
        'multipart/form-data': { schema: CreateProductRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: CreateProductResponseSchema } },
    },
    401: {
      description: 'Unauthenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET/PUT/DELETE /products/{product} ------------------------------------

export const ProductIdParamSchema = z.object({ product: z.coerce.number().int().positive() });

export const ProductDevicesRequestSchema = z.object({
  type: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  sort_by: z.string().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const ProductShowResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      devices: z.array(DeviceResponseSchema),
      pagination: z.record(z.string(), z.unknown()),
      filters: z.record(z.string(), z.unknown()),
    }),
  })
  .openapi('ProductShowResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/{product}',
  tags: ['products'],
  summary: 'Paginated devices under the product',
  request: { params: ProductIdParamSchema, query: ProductDevicesRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ProductShowResponseSchema } },
    },
  },
});

export const UpdateProductRequestSchema = z
  .object({
    name: z.string().max(255).optional(),
    // D-0106: `preconfigure_template_id` is `sometimes|exists:...` on update in Laravel — NOT
    // `nullable` (unlike its own create-time rule) — sending `null` here is genuinely invalid
    // input, not a way to clear it; `device_protocol_id` IS `nullable` on update (it can be
    // cleared), matching its create-time rule.
    preconfigure_template_id: z.coerce.number().int().optional(),
    device_protocol_id: z.coerce.number().int().nullable().optional(),
  })
  .openapi('UpdateProductRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/products/{product}',
  tags: ['products'],
  summary:
    'Returns the bare model, no envelope (matches Laravel exactly). network_server_id/plan_id dropped (11.19 — validate against nonexistent tables)',
  request: {
    params: ProductIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateProductRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated — bare model',
      content: { 'application/json': { schema: ProductResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/products/{product}',
  tags: ['products'],
  summary: 'Cascades device_values, devices, attribute preferences, raw_packet_values',
  request: { params: ProductIdParamSchema },
  responses: { 204: { description: 'Deleted, no body' } },
});

// -- POST /products/bulk/destroy ---------------------------------------------

export const BulkDeleteProductsRequestSchema = z
  .object({ product_ids: z.array(z.coerce.number().int()) })
  .openapi('BulkDeleteProductsRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/products/bulk/destroy',
  tags: ['products'],
  request: {
    body: { content: { 'application/json': { schema: BulkDeleteProductsRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': {
          schema: z
            .object({
              success: z.literal(true),
              message: z.string(),
              data: z.object({
                deleted_count: z.number().int(),
                product_ids: z.array(z.number().int()),
              }),
            })
            .openapi('BulkDeleteProductsResponse'),
        },
      },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /products/company/{company_id} --------------------------------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/products/company/{company_id}',
  tags: ['products'],
  summary:
    "company_id path param kept for URL-shape parity but unused for scoping (D-0042/D-0045 pattern) — always the caller's own company",
  request: { params: z.object({ company_id: z.coerce.number().int() }) },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.array(ProductResponseSchema),
          }),
        },
      },
    },
    404: {
      description: 'None found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /get-encrypt-token (D-0047) -----------------------------------------

export const GetEncryptTokenRequestSchema = z
  .object({ protocol_id: z.coerce.number().int(), product_id: z.coerce.number().int() })
  .openapi('GetEncryptTokenRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/get-encrypt-token',
  tags: ['products'],
  summary:
    "Issues the ingestion token. AES-256-GCM, random IV (D-0047 — hardened, not Laravel's deterministic-IV CBC scheme).",
  request: { body: { content: { 'application/json': { schema: GetEncryptTokenRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            token: z.object({
              id: z.number().int(),
              product_id: z.number().int(),
              protocol_id: z.number().int(),
              user_id: z.number().int(),
              token: z.string(),
            }),
          }),
        },
      },
    },
    404: {
      description: 'Protocol or product not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /product-settings/{id}, POST /store-product-settings ----------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/product-settings/{id}',
  tags: ['products'],
  request: { params: z.object({ id: z.coerce.number().int() }) },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            product_id: z.number().int(),
            product_name: z.string(),
            raw_packet: z.unknown(),
            user_preference_attributes: z.array(z.record(z.string(), z.unknown())),
            token: z.string().nullable(),
          }),
        },
      },
    },
    403: {
      description: 'Not owner and not admin/super_admin',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Product not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const StoreProductSettingsRequestSchema = z
  .object({
    product_id: z.coerce.number().int(),
    // Laravel's TrimStrings + ConvertEmptyStringsToNull make `required` reject "" / "   ", and the trimmed value is what gets stored (D-0124).
    product_name: z.string().trim().min(1, 'The product name field is required.'),
    // Laravel validates this as `nullable|array` only and `(int)`-casts each value (D-0123), so the real frontend's `{826: 1}` must pass.
    preference_toggle: z
      .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
      .nullish()
      .openapi({ type: 'object', additionalProperties: {} }),
  })
  .openapi('StoreProductSettingsRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/store-product-settings',
  tags: ['products'],
  summary:
    'Requires at least one unique-identifier attribute + settings on every selected attribute',
  request: {
    body: { content: { 'application/json': { schema: StoreProductSettingsRequestSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessMessageSchema } } },
    500: {
      description: 'Validation-style failure (thrown as Exception, caught as 500)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /store-user-preferences-attributes (11.46) --------------------------

export const StoreUserPreferenceAttributesRequestSchema = z
  .object({
    product_id: z.coerce.number().int(),
    user_id: z.coerce.number().int(),
    user_preference_packet_values: z.record(z.string(), z.unknown()),
  })
  .openapi('StoreUserPreferenceAttributesRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/store-user-preferences-attributes',
  tags: ['products'],
  summary:
    "11.46: the submitted values are not actually persisted anywhere (no such column exists) — matches Laravel's own silent no-op exactly",
  request: {
    body: {
      content: { 'application/json': { schema: StoreUserPreferenceAttributesRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'updateOrCreate on (product_id,user_id)',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
  },
});

// -- Attribute preferences --------------------------------------------------

const AlertSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  conditions: z.array(z.record(z.string(), z.unknown())).optional(),
});

const AttributePreferenceResponseSchema = z
  .object({
    id: z.number().int(),
    product_id: z.number().int(),
    user_id: z.number().int(),
    attribute_key: z.string().nullable(),
    is_selected: z.boolean(),
    is_unique_identifier: z.boolean(),
    label: z.string().nullable(),
    unit: z.string().nullable(),
    rule_id: z.number().int().nullable(),
    widget_id: z.number().int().nullable(),
  })
  .openapi('AttributePreference');

export const AttributePreferenceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/attribute/preference/{id}',
  tags: ['products'],
  request: { params: AttributePreferenceIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': { schema: z.object({ data: AttributePreferenceResponseSchema }) },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/attribute/preference/setting/{id}',
  tags: ['products'],
  request: { params: AttributePreferenceIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            productAttributeData: z.unknown(),
            productAttributeSetting: z.unknown(),
            productAttributeSettingUnit: z.unknown(),
            ruleConditions: z.unknown(),
            enabled: z.unknown(),
            widgetType: z.unknown(),
          }),
        },
      },
    },
  },
});

export const CreateAttributePreferenceRequestSchema = z
  .object({
    product_id: z.coerce.number().int(),
    attribute_key: z.string().max(255),
    label: z.string().max(255),
    widget_type: z.string().max(255).optional(),
    unit: z.string().optional(),
    alert_settings: AlertSettingsSchema.optional(),
  })
  .openapi('CreateAttributePreferenceRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/setting/store',
  tags: ['products'],
  summary:
    'Side effects: creates a Rule if alert_settings given (or a stub rule otherwise), creates a Widget+WidgetSetting per device on the product (D-0048 — always, closing 11.45)',
  request: {
    body: { content: { 'application/json': { schema: CreateAttributePreferenceRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({ message: z.string(), data: AttributePreferenceResponseSchema }),
        },
      },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const UpdateAttributePreferenceRequestSchema = z
  .object({
    product_id: z.coerce.number().int().optional(),
    attribute_key: z.string().optional(),
    unit: z.string().optional(),
    label: z.string().optional(),
    widget_type: z.string().optional(),
    alert_settings: AlertSettingsSchema.optional(),
  })
  .openapi('UpdateAttributePreferenceRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/attribute/preference/setting/{id}',
  tags: ['products'],
  request: {
    params: AttributePreferenceIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateAttributePreferenceRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: AttributePreferenceResponseSchema }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/attribute/preference/setting/{id}',
  tags: ['products'],
  summary: 'Cascades linked widget + rule if present',
  request: { params: AttributePreferenceIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const MarkUniqueRequestSchema = z
  .object({ product_id: z.coerce.number().int(), attribute_key: z.string() })
  .openapi('MarkUniqueRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/marked-as-unique',
  tags: ['products'],
  summary: 'Unsets any existing unique-identifier for the product first',
  request: { body: { content: { 'application/json': { schema: MarkUniqueRequestSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessMessageSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/unmark-unique',
  tags: ['products'],
  request: { body: { content: { 'application/json': { schema: MarkUniqueRequestSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessMessageSchema } } },
    404: {
      description: 'No matching record',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

/** D-0154 ("Mark as location", fleet GPS roles) — kept in step with `ATTRIBUTE_ROLES` in `products.types.ts`. */
export const MarkRoleRequestSchema = z
  .object({
    product_id: z.coerce.number().int(),
    attribute_key: z.string().min(1),
    role: z.enum(['latitude', 'longitude', 'speed', 'heading']),
  })
  .openapi('MarkRoleRequest');

export const UnmarkRoleRequestSchema = z
  .object({ product_id: z.coerce.number().int(), attribute_key: z.string().min(1) })
  .openapi('UnmarkRoleRequest');

const MarkRoleResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      product_id: z.number().int(),
      attribute_key: z.string(),
      attribute_role: z.enum(['latitude', 'longitude', 'speed', 'heading']),
      replaced_attribute_key: z.string().nullable(),
    }),
  })
  .openapi('MarkRoleResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/mark-role',
  tags: ['products'],
  summary:
    'Fleet GPS "Mark as location": gives an attribute the role latitude / longitude / speed / heading (no label, unit or alert needed). One attribute per role per product — choosing a role another attribute holds moves it (`replaced_attribute_key`). Mutually exclusive with the unique identifier. Ingestion is role-only.',
  request: { body: { content: { 'application/json': { schema: MarkRoleRequestSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: MarkRoleResponseSchema } } },
    404: {
      description: 'Product not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/unmark-role',
  tags: ['products'],
  summary:
    'Clears the GPS role from an attribute (a row that only existed to carry the role is removed).',
  request: { body: { content: { 'application/json': { schema: UnmarkRoleRequestSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: SuccessMessageSchema } } },
    404: {
      description: 'Product or role not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const MappingPreviewRequestSchema = z
  .object({
    product_id: z.coerce.number().int(),
    sample_payload: z.record(z.string(), z.unknown()),
  })
  .openapi('MappingPreviewRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/attribute/preference/mapping-preview',
  tags: ['products'],
  summary:
    'Uses the real (shared) PayloadMapper (D-0049) — never drifts from live ingestion behavior once module 2.4 exists',
  request: { body: { content: { 'application/json': { schema: MappingPreviewRequestSchema } } } },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.object({
              product_id: z.number().int(),
              mapped_count: z.number().int(),
              available_count: z.number().int(),
              mapping: z.array(
                z.object({ source_field: z.string(), point_key: z.string(), value: z.unknown() })
              ),
              unmapped_fields: z.array(z.string()),
            }),
          }),
        },
      },
    },
  },
});

// -- Preconfigure templates ---------------------------------------------------

const TemplateFieldSchema = z.object({
  attribute_key: z.string(),
  label: z.string().optional(),
  unit: z.string().optional(),
});

const PreconfigureTemplateResponseSchema = z
  .object({
    id: z.number().int(),
    company_id: z.number().int().nullable(),
    created_by: z.number().int().nullable(),
    name: z.string(),
    manufacturer: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    configuration: z.unknown(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('PreconfigureTemplate');

export const ListTemplatesRequestSchema = z.object({
  manufacturer: z.string().optional(),
  search: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

const TemplatesPaginatorResponseSchema = z
  .object({
    current_page: z.number().int(),
    data: z.array(PreconfigureTemplateResponseSchema),
    first_page_url: z.string(),
    from: z.number().int().nullable(),
    last_page: z.number().int(),
    last_page_url: z.string(),
    links: z.array(LaravelPaginatorLinkSchema),
    next_page_url: z.string().nullable(),
    path: z.string(),
    per_page: z.number().int(),
    prev_page_url: z.string().nullable(),
    to: z.number().int().nullable(),
    total: z.number().int(),
  })
  .openapi('TemplatesPaginator');

openApiRegistry.registerPath({
  method: 'get',
  path: '/preconfigure-templates',
  tags: ['products'],
  summary: 'Global (company_id null) + own-company templates only',
  request: { query: ListTemplatesRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: TemplatesPaginatorResponseSchema,
          }),
        },
      },
    },
  },
});

export const CreateTemplateRequestSchema = z
  .object({
    name: z.string(),
    manufacturer: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    fields: z.array(TemplateFieldSchema).min(1),
  })
  .openapi('CreateTemplateRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/preconfigure-templates',
  tags: ['products'],
  summary: 'Created — always company-scoped to the caller',
  request: { body: { content: { 'application/json': { schema: CreateTemplateRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: PreconfigureTemplateResponseSchema,
          }),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/preconfigure-templates/manufacturers',
  tags: ['products'],
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.array(z.string()),
          }),
        },
      },
    },
  },
});

export const CreateTemplateFromProductRequestSchema = z
  .object({
    name: z.string(),
    manufacturer: z.string().optional(),
    description: z.string().optional(),
  })
  .openapi('CreateTemplateFromProductRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/preconfigure-templates/from-product/{productId}',
  tags: ['products'],
  request: {
    params: z.object({ productId: z.coerce.number().int() }),
    body: { content: { 'application/json': { schema: CreateTemplateFromProductRequestSchema } } },
  },
  responses: {
    201: {
      description: "Created from the product's real ProductAttributePreference rows",
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: PreconfigureTemplateResponseSchema,
          }),
        },
      },
    },
    404: {
      description: 'Product not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Product has no configured fields',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/preconfigure-templates/{id}',
  tags: ['products'],
  summary: '404 for both not-found AND wrong-company, deliberately (avoids ID enumeration)',
  request: { params: z.object({ id: z.coerce.number().int() }) },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: PreconfigureTemplateResponseSchema,
          }),
        },
      },
    },
    404: {
      description: 'Not found or not accessible',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
