import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 6.5 (mqtt-configurations) — `MqttConfigurationController`
 * (D-0117). Real Laravel's `store()` accepts a client-supplied `company_id`
 * in the body (`required|exists:companies,id`) with no check that it
 * matches the caller's own company — an already-flagged gap
 * (`api-catalog.md`'s own note on this endpoint, same class as
 * 11.20/11.37/11.48). This app deliberately does not accept `company_id`
 * from the body at all on any endpoint here — it is always derived from
 * the caller's own verified context (ARCHITECTURE.md §6's tenant-scoping
 * extension), matching every other company-scoped resource in this app.
 */

const SuccessDataSchema = z.record(z.string(), z.unknown());
const ErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export const MqttConfigurationIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const CreateMqttConfigurationRequestSchema = z.object({
  name: z.string().max(255).nullable().optional(),
  host: z.string().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().max(255).nullable().optional(),
  password: z.string().max(255).nullable().optional(),
  use_tls: z.coerce.boolean().optional(),
  client_id_prefix: z.string().max(50).nullable().optional(),
  description: z.string().nullable().optional(),
});

export const UpdateMqttConfigurationRequestSchema = z.object({
  name: z.string().max(255).nullable().optional(),
  host: z.string().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().max(255).nullable().optional(),
  password: z.string().max(255).nullable().optional(),
  use_tls: z.coerce.boolean().optional(),
  client_id_prefix: z.string().max(50).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
});

for (const [method, path, summary] of [
  [
    'get',
    '/mqtt-configurations',
    "Every MQTT configuration for the caller's company, newest first. No pagination (Laravel's own ->get()).",
  ],
  [
    'get',
    '/mqtt-configurations/active',
    "The company's single active-status configuration, or 404.",
  ],
  ['get', '/mqtt-configurations/{id}', 'One configuration by id, company-scoped.'],
  [
    'post',
    '/mqtt-configurations',
    "Create — company_id always derived from the caller's context, never from the body (D-0117).",
  ],
  ['put', '/mqtt-configurations/{id}', 'Update — any subset of fields.'],
  ['delete', '/mqtt-configurations/{id}', 'Delete.'],
  [
    'post',
    '/mqtt-configurations/{id}/test',
    'Real one-shot MQTT connection test (D-0117) — not a stub.',
  ],
] as const) {
  openApiRegistry.registerPath({
    method,
    path,
    tags: ['connectivity'],
    summary,
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: SuccessDataSchema } } },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      422: {
        description: 'Validation failed',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });
}
