import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 2.3 (devices). Paths/payloads/response field
 * names match the frozen contract exactly (`reference/openapi.yaml`'s
 * `/devices*`, `/userDevices/*` paths).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('DevicesErrorResponse');

const DeviceResponseSchema = z
  .object({
    id: z.number().int(),
    device_unique_identifier: z.string(),
    name: z.string(),
    type: z.string().nullable(),
    status: z.string(),
    location: z.string(),
    tags: z.string(),
    product_id: z.number().int(),
    user_id: z.number().int(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
    last_updated: z.string(),
  })
  .openapi('Device');

// -- GET /devices (11.29: paginated Products with nested devices), POST /devices --

export const ListDevicesRequestSchema = z.object({
  product_id: z.coerce.number().int().optional(),
  search: z.string().optional(),
  sort_by: z.string().default('id'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/devices',
  tags: ['devices'],
  summary:
    '11.29: despite the path/name, returns paginated Products with nested devices, not a flat device list',
  request: { query: ListDevicesRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), message: z.string(), data: z.unknown() }),
        },
      },
    },
  },
});

export const CreateDeviceRequestSchema = z
  .object({
    device_unique_identifier: z.string(),
    name: z.string(),
    type: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    location: z.string().optional(),
    tags: z.string().optional(),
    product_id: z.coerce.number().int(),
  })
  .openapi('CreateDeviceRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/devices',
  tags: ['devices'],
  summary:
    "D-0022/11.5: sets user_id from the caller; product_id must belong to the caller's own company",
  request: { body: { content: { 'application/json': { schema: CreateDeviceRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: DeviceResponseSchema,
          }),
        },
      },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- PUT/DELETE /devices/{id} (GET is claimed by 3.1 assets — 11.24) ------------

export const DeviceIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const UpdateDeviceRequestSchema = z
  .object({
    device_unique_identifier: z.string().optional(),
    name: z.string().optional(),
    location: z.string().optional(),
    tags: z.string().optional(),
  })
  .openapi('UpdateDeviceRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/devices/{id}',
  tags: ['devices'],
  request: {
    params: DeviceIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateDeviceRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: DeviceResponseSchema,
          }),
        },
      },
    },
    404: {
      description:
        'Not found (or not authorized — D-0022 avoids a cross-tenant enumeration oracle)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/devices/{id}',
  tags: ['devices'],
  request: { params: DeviceIdParamSchema },
  responses: {
    204: {
      description:
        "Deleted, no body (frozen contract flags Laravel's 204-with-a-body oddity; the new app sends a clean 204)",
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /devices/{id}/points --------------------------------------------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/devices/{id}/points',
  tags: ['devices'],
  request: { params: DeviceIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.object({
              device_id: z.number().int(),
              device_unique_identifier: z.string(),
              last_reported_at: z.date().nullable(),
              points: z.array(
                z.object({
                  point_key: z.string(),
                  label: z.string().nullable(),
                  unit: z.string().nullable(),
                  is_unique_identifier: z.boolean(),
                  is_selected: z.boolean(),
                  semantic_type: z.null(),
                  commandable: z.null(),
                  last_value: z.unknown(),
                })
              ),
            }),
          }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- Bulk status/destroy --------------------------------------------------------

export const BulkDeviceIdsRequestSchema = z
  .object({ device_ids: z.array(z.coerce.number().int()).min(1) })
  .openapi('BulkDeviceIdsRequest');

for (const [path, summary] of [
  ['/devices/bulk/enable', 'Sets status=active on every owned id in the list'],
  ['/devices/bulk/disable', 'Sets status=inactive on every owned id in the list'],
  ['/devices/bulk/destroy', 'Deletes every owned id in the list'],
] as const) {
  openApiRegistry.registerPath({
    method: 'post',
    path,
    tags: ['devices'],
    summary,
    request: { body: { content: { 'application/json': { schema: BulkDeviceIdsRequestSchema } } } },
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              message: z.string(),
              data: z.object({
                updated_count: z.number().int().optional(),
                deleted_count: z.number().int().optional(),
                device_ids: z.array(z.number().int()),
              }),
            }),
          },
        },
      },
      422: {
        description: "One or more ids don't exist at all",
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}

// -- PATCH /devices/{id}/enable|disable ------------------------------------------

for (const path of ['/devices/{id}/enable', '/devices/{id}/disable'] as const) {
  openApiRegistry.registerPath({
    method: 'patch',
    path,
    tags: ['devices'],
    request: { params: DeviceIdParamSchema },
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              message: z.string(),
              data: DeviceResponseSchema,
            }),
          },
        },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}

// -- Device command / MQTT downlink (D-0052: publish deferred to 2.4) -----------

const AlertParametersSchema = z.record(z.string(), z.unknown()).optional();

export const SendCommandRequestSchema = z
  .object({ command: z.string(), parameters: AlertParametersSchema })
  .openapi('SendCommandRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/devices/{id}/command',
  tags: ['devices'],
  summary:
    'D-0052: tries the platform MQTT publisher; the real broker connection lands with module 2.4',
  request: {
    params: DeviceIdParamSchema,
    body: { content: { 'application/json': { schema: SendCommandRequestSchema } } },
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), message: z.string(), data: z.unknown() }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Command failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const SendBulkCommandsRequestSchema = z
  .object({
    device_ids: z.array(z.coerce.number().int()).min(1),
    command: z.string(),
    parameters: AlertParametersSchema,
  })
  .openapi('SendBulkCommandsRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/devices/bulk/commands',
  tags: ['devices'],
  request: { body: { content: { 'application/json': { schema: SendBulkCommandsRequestSchema } } } },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), message: z.string(), data: z.unknown() }),
        },
      },
    },
  },
});

// -- GET /devices/product/{product_id} -------------------------------------------

export const ProductIdParamSchema = z.object({ product_id: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/devices/product/{product_id}',
  tags: ['devices'],
  summary: 'D-0022 closes 11.37 for this method: whereHas product.company_id',
  request: { params: ProductIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.array(DeviceResponseSchema),
            userPreference: z.unknown(),
            assigned_device_ids: z.array(z.number().int()),
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

// -- /userDevices/list (11.48: user_id query param accepted for contract parity, ignored for scoping) --

export const UserDevicesListRequestSchema = z.object({
  user_id: z.coerce.number().int().optional(),
});

const UserDeviceResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    device_id: z.number().int().nullable(),
    device_name: z.string().nullable(),
    device_location: z.string().nullable(),
    status: z.string().nullable(),
    toggle_status: z.boolean(),
    notification_phone_number: z.string().nullable(),
    notification_email: z.string().nullable(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('UserDevice');

openApiRegistry.registerPath({
  method: 'get',
  path: '/userDevices/list',
  tags: ['devices'],
  summary:
    'D-0053 (closes 11.48): the live app trusts the user_id query param instead of the token — the new app always scopes to the caller, the param is accepted but unused',
  request: { query: UserDevicesListRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: z.array(UserDeviceResponseSchema),
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
// 11.23 confirmed dead (`x-known-broken` in the frozen contract) — /userDevices/activate is not
// wired; UserDeviceController::activateDevice() calls a nonexistent checkIfEncrypted() method.
