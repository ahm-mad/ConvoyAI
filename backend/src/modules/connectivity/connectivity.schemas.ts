import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for the connectivity module (D-0104) — also the OpenAPI
 * source (ARCHITECTURE.md §4). Matches `reference/openapi.yaml`'s
 * `/connectors/health`/`/connectors/{connector}/health` (already frozen,
 * tag `connectivity`, never previously built against).
 */

const AdapterCapabilitiesResponseSchema = z.object({
  supports_discovery: z.boolean(),
  supports_read: z.boolean(),
  supports_write: z.boolean(),
  is_push_based: z.boolean(),
});

export const ConnectorHealthResponseSchema = z
  .object({
    connector_id: z.string(),
    runtime_id: z.string(),
    state: z.enum(['running', 'stopped', 'error']),
    connected: z.boolean(),
    last_message_at: z.string().nullable(),
    messages_received_total: z.number().int(),
    messages_sent_total: z.number().int(),
    errors_total: z.number().int(),
    reconnects_total: z.number().int(),
    queue_depth: z.number().int(),
    reported_at: z.string(),
    capabilities: AdapterCapabilitiesResponseSchema,
  })
  .openapi('ConnectorHealth');

const ConnectorHealthIndexResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ mqtt: ConnectorHealthResponseSchema, webhook: ConnectorHealthResponseSchema }),
  })
  .openapi('ConnectorHealthIndexResponse');

const ConnectorHealthShowResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: ConnectorHealthResponseSchema,
  })
  .openapi('ConnectorHealthShowResponse');

const ErrorResponseSchema = z
  .object({ success: z.literal(false), message: z.string() })
  .openapi('ConnectivityErrorResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/connectors/health',
  tags: ['connectivity'],
  summary: 'Aggregated health for every known connector (mqtt, webhook)',
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ConnectorHealthIndexResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/connectors/{connector}/health',
  tags: ['connectivity'],
  summary: 'Health for a single connector',
  request: { params: z.object({ connector: z.enum(['mqtt', 'webhook']) }) },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ConnectorHealthShowResponseSchema } },
    },
    404: {
      description: 'Unknown connector',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
