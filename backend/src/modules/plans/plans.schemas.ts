import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 5.1 (plans). Designed fresh (11.26 — Laravel has
 * zero live routes here) — this is a NEW real contract, not a port of the
 * frozen `openapi.yaml`'s `x-known-broken` `/plans*` stubs (those documented
 * dead/broken Laravel code; `reference/openapi.yaml` is updated alongside
 * this module, see `DECISIONS.md` for the logged deviation).
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('PlansErrorResponse');

const PlanModuleGrantResponseSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    slug: z.string(),
    permissions: z.array(z.string()),
  })
  .openapi('PlanModuleGrant');

const PlanResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    stripe_plan: z.string(),
    price: z.string(),
    description: z.string(),
    modules: z.array(PlanModuleGrantResponseSchema),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
  })
  .openapi('Plan');

// -- GET /plans, POST /plans ------------------------------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans',
  tags: ['billing'],
  summary:
    "Module 5.1, designed fresh (11.26 — no live Laravel route existed). Any authenticated user may list plans (matches PlanController::index()'s own auth level).",
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.array(PlanResponseSchema) } },
    },
  },
});

export const CreatePlanRequestSchema = z
  .object({
    name: z.string().min(1).max(255),
    stripe_plan: z.string().min(1).max(255),
    price: z.string().min(1).max(255),
    description: z.string().min(1),
  })
  .openapi('CreatePlanRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans',
  tags: ['billing'],
  summary:
    "Requires platform_operator (cross-tenant catalog write, same standard as D-0039's `companies` CRUD)",
  request: { body: { content: { 'application/json': { schema: CreatePlanRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: PlanResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Requires platform_operator',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET/PUT /plans/{plan} ------------------------------------

export const PlanIdParamSchema = z.object({ plan: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/{plan}',
  tags: ['billing'],
  summary:
    "Fixes 11.25 — Laravel's show() returned the literal strings {'plan':'plan',...} instead of the real data, and made an unconditional real Stripe createSetupIntent() side effect on every call. This rebuild returns the real plan+modules and makes zero Stripe calls (D-0080).",
  request: { params: PlanIdParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: PlanResponseSchema } } },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const UpdatePlanRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    stripe_plan: z.string().min(1).max(255).optional(),
    price: z.string().min(1).max(255).optional(),
    description: z.string().min(1).optional(),
  })
  .openapi('UpdatePlanRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/plans/{plan}',
  tags: ['billing'],
  summary: 'Requires platform_operator',
  request: {
    params: PlanIdParamSchema,
    body: { content: { 'application/json': { schema: UpdatePlanRequestSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: PlanResponseSchema } } },
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

// -- POST /plans/{planId}/assign-modules ------------------------------------

export const PlanAssignModulesParamSchema = z.object({
  planId: z.coerce.number().int().positive(),
});

export const AssignModulesRequestSchema = z
  .object({
    modules: z
      .array(
        z.object({
          id: z.coerce.number().int().positive(),
          permissions: z.array(z.string()).optional(),
        })
      )
      .min(1),
  })
  .openapi('AssignModulesRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{planId}/assign-modules',
  tags: ['billing'],
  summary:
    'Ported from PlanController::assignModulesToPlan (the one PlanController method with a real, reachable-if-ever-routed purpose). Additive grant — never removes a module already on the plan. Requires platform_operator.',
  request: {
    params: PlanAssignModulesParamSchema,
    body: { content: { 'application/json': { schema: AssignModulesRequestSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: PlanResponseSchema } } },
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
