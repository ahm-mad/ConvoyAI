import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import { CONTACT_SORTABLE_COLUMNS } from './contacts-settings-notifications.types.js';

/**
 * Zod schemas for module 6.1. Paths/payloads/response field names match
 * `reference/openapi.yaml`'s `/contact*`/`/notifications*`/`/settings*`
 * paths, except the auth model: D-0090 gates `/contact` index/show/destroy
 * behind `platform_operator` and `/notifications`'s whole surface behind
 * `requireAuth` + real per-user scoping — Laravel had zero auth middleware
 * on either resource at all (KNOWN_ISSUES 11.58/11.59), contradicting
 * `api-catalog.md`'s stale `auth:api` label for both (corrected alongside
 * this module, see `DECISIONS.md`).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('PeripheralErrorResponse');

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('PeripheralSuccessMessage');

// -- Contacts -----------------------------------------------------------------

const ContactResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    email: z.string(),
    subject: z.string(),
    message: z.string(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Contact');

const LaravelPaginatorLinkSchema = z.object({
  url: z.string().nullable(),
  label: z.string(),
  active: z.boolean(),
});

const ContactsPaginatorResponseSchema = z
  .object({
    current_page: z.number().int(),
    data: z.array(ContactResponseSchema),
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
  .openapi('ContactsPaginator');

export const ListContactsRequestSchema = z.object({
  search: z.string().optional(),
  sort_by: z.enum(CONTACT_SORTABLE_COLUMNS).default('id'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

export const CreateContactRequestSchema = z
  .object({
    name: z.string().max(255),
    email: z.email(),
    subject: z.string().max(255),
    message: z.string(),
  })
  .openapi('CreateContactRequest');

export const ContactIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/contact',
  tags: ['peripheral'],
  summary:
    'Requires platform_operator (D-0090 fix — live Laravel has zero auth middleware at all, 11.58)',
  request: { query: ListContactsRequestSchema },
  responses: {
    200: {
      description: '{success,message,data:<paginator>}',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: ContactsPaginatorResponseSchema,
          }),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/contact',
  tags: ['peripheral'],
  summary:
    'Public — no auth (a real contact-us form must stay reachable pre-login; the only endpoint on this table not gated)',
  security: [],
  request: { body: { content: { 'application/json': { schema: CreateContactRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            data: ContactResponseSchema,
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

openApiRegistry.registerPath({
  method: 'get',
  path: '/contact/{id}',
  tags: ['peripheral'],
  summary: 'Requires platform_operator (D-0090 fix, 11.58)',
  request: { params: ContactIdParamSchema },
  responses: {
    200: {
      description: '{success,data}',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: ContactResponseSchema }),
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
  path: '/contact/{id}',
  tags: ['peripheral'],
  summary: 'Requires platform_operator (D-0090 fix, 11.58)',
  request: { params: ContactIdParamSchema },
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

// -- Settings -------------------------------------------------------------------

const SettingResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    locale: z.string(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Setting');

export const SettingIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const UpdateSettingsRequestSchema = z
  .object({ locale: z.enum(['en', 'ar']).optional() })
  .openapi('UpdateSettingsRequest');

openApiRegistry.registerPath({
  method: 'get',
  path: '/settings/user',
  tags: ['peripheral'],
  summary: 'Scoped to caller. 200 even when empty (success:false, no data key)',
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            success: z.boolean(),
            data: z.array(SettingResponseSchema).optional(),
          }),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/settings/user/edit/{id}',
  tags: ['peripheral'],
  summary:
    'id AND user_id must both match the caller (tenant-scoping extension auto-enforces user_id)',
  request: { params: SettingIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            success: z.literal(true),
            data: SettingResponseSchema,
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

openApiRegistry.registerPath({
  method: 'post',
  path: '/settings/user/update',
  tags: ['peripheral'],
  summary: 'upsert; response key is `settings`, not `data` (matches Laravel exactly)',
  request: { body: { content: { 'application/json': { schema: UpdateSettingsRequestSchema } } } },
  responses: {
    200: {
      description: 'Updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            settings: SettingResponseSchema,
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

// -- Notifications (D-0090 closes 11.59) -----------------------------------------

const NotificationResponseSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    message: z.string(),
    is_read: z.boolean(),
    user_id: z.number().int().nullable(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Notification');

export const NotificationIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** `user_id` is accepted for URL-shape parity with the frozen contract but never read — D-0090: self-only, same discipline as 11.48/D-0053. */
export const CreateNotificationRequestSchema = z
  .object({ title: z.string().max(255), message: z.string(), user_id: z.number().int().optional() })
  .openapi('CreateNotificationRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/notifications',
  tags: ['peripheral'],
  summary:
    'Requires auth (D-0090 fix — live Laravel has zero auth middleware, 11.59). Self-only: user_id is accepted but ignored',
  request: {
    body: { content: { 'application/json': { schema: CreateNotificationRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: NotificationResponseSchema }),
        },
      },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/notifications',
  tags: ['peripheral'],
  summary:
    "Bare array, no envelope. Requires auth + scoped to caller (D-0090 fix — live Laravel returns every user's rows unauthenticated, 11.59)",
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.array(NotificationResponseSchema) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/notifications/{id}/read',
  tags: ['peripheral'],
  summary: 'Requires auth + ownership (D-0090 fix, 11.59)',
  request: { params: NotificationIdParamSchema },
  responses: {
    200: {
      description: 'Marked read',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: NotificationResponseSchema }),
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
  path: '/notifications/{id}',
  tags: ['peripheral'],
  summary: 'Requires auth + ownership (D-0090 fix, 11.59)',
  request: { params: NotificationIdParamSchema },
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
