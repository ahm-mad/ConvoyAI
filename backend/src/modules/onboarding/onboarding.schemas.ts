import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 5.3 (onboarding). Matches the frozen contract's
 * `/verify-token`/`/resend-verification-email` paths exactly (both
 * already documented against the real Laravel behavior at 0.3 freeze
 * time) — no deviation to log here.
 */

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('OnboardingSuccessMessage');

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('OnboardingErrorResponse');

export const VerifyTokenRequestSchema = z
  .object({ token: z.string().min(1) })
  .openapi('VerifyTokenRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/verify-token',
  tags: ['onboarding'],
  summary:
    "Module 5.3, decomposed from Laravel's monolithic verifyToken (onboarding-verifytoken.md §3). D-0080: step 7 creates a placeholder subscription, never calls Stripe.",
  request: { body: { content: { 'application/json': { schema: VerifyTokenRequestSchema } } } },
  responses: {
    200: {
      description: 'Verified',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    401: {
      description: 'Token expired/invalid',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Placeholder plan not found (seed script not yet run)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Token missing',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const ResendVerificationEmailRequestSchema = z
  .object({ token: z.string().min(1) })
  .openapi('ResendVerificationEmailRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/resend-verification-email',
  tags: ['onboarding'],
  summary:
    "Re-send verification email using an expired token's subject claim (D-0028's ignoreExpiration path).",
  request: {
    body: { content: { 'application/json': { schema: ResendVerificationEmailRequestSchema } } },
  },
  responses: {
    200: { description: 'Sent', content: { 'application/json': { schema: SuccessMessageSchema } } },
    401: {
      description: 'Token invalid (signature check still runs)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'User not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Token missing',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
