import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';
import {
  laravelBoolean,
  laravelInteger,
  normalizeLaravelInputDeep,
} from '../../shared/utils/laravel-input.js';

/**
 * Zod schemas for module 2.5 (rules). Request shapes match
 * `RuleBuilderController`/`AlarmController`'s validation exactly
 * (`reference/api-catalog.md`'s Rules/Alarms section,
 * `reference/deep-dives/rule-engine.md` §1.1). `severity` is a genuine
 * addition to the frozen contract (D-0060, user-approved) — optional on
 * write, defaults to `warning`.
 */

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('RulesErrorResponse');

const RuleSeveritySchema = z.enum(['info', 'warning', 'critical']);

// D-0130: `RuleBuilderController::store`/`update` validate `conditions.*.selectedProduct` as `nullable` (ANY type — the
// frontend sends the product id as a number), and `emailData`/`smsData`/`notificationData` as `nullable|array` only (free-form:
// the frontend sends `emailData.to` as an array, plus UI-only keys like `newRecipient`). Everything is stored verbatim.
// `logicalOperator` is `required|string` on store, `nullable|string` on update.
const conditionSchema = (logicalOperatorRequired: boolean) =>
  z.object({
    selectedProduct: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
    selectedAttribute: z.string().nullable().optional(),
    selectedCondition: z.string(),
    conditionValue: z.string().nullable().optional(),
    logicalOperator: logicalOperatorRequired ? z.string() : z.string().nullable().optional(),
  });

const RuleActionsSchema = z.object({
  sendEmail: laravelBoolean,
  sendMessage: laravelBoolean,
  systemNotification: laravelBoolean,
});

const FreeFormArraySchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

// -- GET /rules, GET /rules/users/{user} -----------------------------------

export const ListRulesRequestSchema = z.object({
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().max(255).optional(),
  sort_by: z
    .enum([
      'id',
      'name',
      'created_at',
      'updated_at',
      'execution_interval',
      'is_active',
      'user_id',
      'last_triggered',
    ])
    .default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  is_active: z.coerce.boolean().optional(),
  has_email_data: z.coerce.boolean().optional(),
  has_sms_data: z.coerce.boolean().optional(),
  has_notification_data: z.coerce.boolean().optional(),
  can_be_triggered: z.coerce.boolean().optional(),
  recently_triggered: z.coerce.number().int().min(1).max(168).optional(),
});

export const UserIdParamSchema = z.object({ user: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/rules',
  tags: ['rules'],
  summary: 'Own rules only (D-0062 — no cross-user admin bypass)',
  request: { query: ListRulesRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/rules/users/{user}',
  tags: ['rules'],
  summary: "Same as GET /rules — {user} must equal the caller's own id (D-0062), 403 otherwise",
  request: { query: ListRulesRequestSchema, params: UserIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET/PUT/DELETE /rules/{id} ---------------------------------------------

export const RuleIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/rules/{id}',
  tags: ['rules'],
  request: { params: RuleIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const ruleRequestSchema = (logicalOperatorRequired: boolean) =>
  z.preprocess(
    normalizeLaravelInputDeep,
    z.object({
      ruleName: z.string().max(255).nullable().optional(),
      executionInterval: laravelInteger.transform(Number).pipe(z.number().min(1)),
      allowRetriggering: laravelBoolean,
      severity: RuleSeveritySchema.optional(),
      conditions: z.array(conditionSchema(logicalOperatorRequired)).min(1),
      actions: RuleActionsSchema,
      emailData: FreeFormArraySchema.nullable().optional(),
      smsData: FreeFormArraySchema.nullable().optional(),
      notificationData: FreeFormArraySchema.nullable().optional(),
      is_active: laravelBoolean,
    })
  );

/** `POST /rules/store` — `logicalOperator` required on every condition. */
export const RuleRequestSchema = ruleRequestSchema(true);
/** `PUT /rules/{id}` — `logicalOperator` nullable. */
export const RuleUpdateRequestSchema = ruleRequestSchema(false);

openApiRegistry.registerPath({
  method: 'post',
  path: '/rules/store',
  tags: ['rules'],
  request: { body: { content: { 'application/json': { schema: RuleRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/rules/{id}',
  tags: ['rules'],
  request: {
    params: RuleIdParamSchema,
    body: { content: { 'application/json': { schema: RuleUpdateRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/rules/{id}',
  tags: ['rules'],
  request: { params: RuleIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- Bulk ops (D-0062: owner-only, no admin bypass) --------------------------

export const BulkRuleIdsRequestSchema = z
  .object({ rule_ids: z.array(z.coerce.number().int()).min(1) })
  .openapi('BulkRuleIdsRequest');

for (const [path, summary] of [
  ['/rules/bulk/activate', 'Sets is_active=true on every owned id in the list'],
  ['/rules/bulk/deactivate', 'Sets is_active=false on every owned id in the list'],
] as const) {
  openApiRegistry.registerPath({
    method: 'post',
    path,
    tags: ['rules'],
    summary,
    request: { body: { content: { 'application/json': { schema: BulkRuleIdsRequestSchema } } } },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
      },
    },
  });
}

openApiRegistry.registerPath({
  method: 'post',
  path: '/rules/bulk/delete',
  tags: ['rules'],
  summary: 'Hard-deletes every owned id in the list',
  request: { body: { content: { 'application/json': { schema: BulkRuleIdsRequestSchema } } } },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
  },
});

// -- Alarms -------------------------------------------------------------------

export const ListAlarmsRequestSchema = z.object({
  state: z.enum(['active', 'acknowledged', 'cleared']).optional(),
  device_id: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

export const AlarmIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/alarms',
  tags: ['rules'],
  summary: 'Company-scoped alarm list',
  request: { query: ListAlarmsRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/alarms/{id}/acknowledge',
  tags: ['rules'],
  summary: 'Only valid from state=active (422 otherwise)',
  request: { params: AlarmIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Not in a state that can be acknowledged',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
