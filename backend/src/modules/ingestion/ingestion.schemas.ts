import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 2.4 (ingestion). `POST /webhook` is device-facing
 * (`security: []` in the frozen contract — token-header auth, not
 * `requireAuth`/JWT), matching `WebhookController::storePacketData` and
 * `ingestion.md` §2 exactly.
 */
export const WebhookHeadersSchema = z.object({ token: z.string() });

export const WebhookBodySchema = z.record(z.string(), z.unknown());

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .openapi('IngestionErrorResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/webhook',
  tags: ['connectivity'],
  security: [],
  summary:
    'THE real ingestion path. Token header holds the AES-256-GCM ingestion token (D-0047). First packet for a token stores raw json_body only; subsequent packets resolve the device, persist raw, and enqueue async cleaning (D-0054 — ARCHITECTURE.md §8, no sync fan-out).',
  request: {
    headers: z.object({ token: z.string() }),
    body: { content: { 'application/json': { schema: WebhookBodySchema, example: {} } } },
  },
  responses: {
    201: {
      description: 'Packet accepted (first or subsequent)',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    400: {
      description: 'Invalid token structure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Token not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Device not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
