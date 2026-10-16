import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 6.3. `GroqController::highlight`'s real
 * validation (`keys: required|array|min:1`, `context: nullable|string`,
 * defaulting to `"Building automation"` in code, not the validation rule).
 */
export const HighlightAttributesRequestSchema = z
  .object({
    keys: z.array(z.string()).min(1),
    context: z.string().optional(),
  })
  .openapi('HighlightAttributesRequest');

const HighlightAttributesResponseSchema = z
  .object({ success: z.literal(true), highlighted_keys: z.array(z.string()) })
  .openapi('HighlightAttributesResponse');

const HighlightAttributesNotFoundSchema = z
  .object({ success: z.literal(false), message: z.string(), highlighted_keys: z.array(z.string()) })
  .openapi('HighlightAttributesNotFound');

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('AiSuggestionsErrorResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/highlight-attributes',
  tags: ['peripheral'],
  summary:
    "Groq-backed attribute suggestion (D-0092). 404's message text is a deliberate fix, not a port — Laravel's own translation key for it doesn't exist in messages.php",
  request: {
    body: { content: { 'application/json': { schema: HighlightAttributesRequestSchema } } },
  },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: HighlightAttributesResponseSchema } },
    },
    404: {
      description:
        'Groq returned nothing usable (unconfigured, rate-limited, or a real API failure)',
      content: { 'application/json': { schema: HighlightAttributesNotFoundSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
