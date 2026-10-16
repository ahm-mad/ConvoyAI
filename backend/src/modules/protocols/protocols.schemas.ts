import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 2.2 (protocols). Paths/payloads/response field
 * names match the frozen contract exactly (`reference/openapi.yaml`'s
 * `/protocols*` paths). `description` is accepted on create/update but
 * never persisted — the frozen contract's own note: "not a real column —
 * dropped silently" (matches Laravel's `Protocol` model, whose
 * `$fillable` never included it; same pattern as 11.46).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('ProtocolsErrorResponse');

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('ProtocolsSuccessMessage');

const ProtocolResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    category: z.enum(['transport', 'device_protocol']),
    image: z.string().nullable(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Protocol');

const LaravelPaginatorLinkSchema = z.object({
  url: z.string().nullable(),
  label: z.string(),
  active: z.boolean(),
});

const ProtocolsPaginatorResponseSchema = z
  .object({
    current_page: z.number().int(),
    data: z.array(ProtocolResponseSchema),
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
  .openapi('ProtocolsPaginator');

// -- GET /protocols, POST /protocols ------------------------------------

export const ListProtocolsRequestSchema = z.object({
  search: z.string().optional(),
  category: z.enum(['transport', 'device_protocol']).optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/protocols',
  tags: ['products'],
  summary:
    'Laravel default paginator, no envelope. Requires auth (D-0050 fix — live Laravel has zero auth on this whole resource, 11.47)',
  request: { query: ListProtocolsRequestSchema },
  responses: {
    200: {
      description: 'Laravel default paginator, no envelope',
      content: { 'application/json': { schema: ProtocolsPaginatorResponseSchema } },
    },
  },
});

export const CreateProtocolRequestSchema = z
  .object({ name: z.string().max(255), description: z.string().optional() })
  .openapi('CreateProtocolRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/protocols',
  tags: ['products'],
  summary: 'Created — bare model. description is accepted but not a real column (dropped silently)',
  request: { body: { content: { 'application/json': { schema: CreateProtocolRequestSchema } } } },
  responses: {
    201: {
      description: 'Created — bare model',
      content: { 'application/json': { schema: ProtocolResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET/PUT/DELETE /protocols/{protocol} ------------------------------------

export const ProtocolIdParamSchema = z.object({ protocol: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/protocols/{protocol}',
  tags: ['products'],
  summary: 'Bare model',
  request: { params: ProtocolIdParamSchema },
  responses: {
    200: {
      description: 'Bare model',
      content: { 'application/json': { schema: ProtocolResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const UpdateProtocolRequestSchema = z
  .object({ name: z.string().max(255).optional(), description: z.string().nullable().optional() })
  .openapi('UpdateProtocolRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/protocols/{protocol}',
  tags: ['products'],
  summary: 'Bare model. description is accepted but not a real column (dropped silently)',
  request: {
    params: ProtocolIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateProtocolRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Bare model',
      content: { 'application/json': { schema: ProtocolResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/protocols/{protocol}',
  tags: ['products'],
  request: { params: ProtocolIdParamSchema },
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
