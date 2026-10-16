import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 1.3's RBAC CRUD surface (`companies` only so
 * far — `roles`/`modules`/`permissions` are not yet built, see the task
 * file's Next actions). Response envelope follows D-0026
 * (`{success, message, errors?}`) and D-0041 (lean `Company` shape, no
 * eager-loaded relations; `data.items`/`data.pagination`, not Laravel's
 * doubly-nested paginator).
 */

/** D-0158: ISO 4217 code — three letters, stored upper-case. Optional so existing callers of the full-body company forms keep working. */
const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'The currency must be a 3-letter ISO 4217 code.')
  .transform(value => value.toUpperCase());

export const CompanyResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    zip_code: z.string().nullable(),
    currency: z.string(),
  })
  .openapi('Company');

const PaginationSchema = z
  .object({
    page: z.number().int(),
    per_page: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
  })
  .openapi('Pagination');

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('RbacSuccessMessage');

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('RbacErrorResponse');

export const CompanyIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

// -- GET /companies ---------------------------------------------------------

export const ListCompaniesRequestSchema = z.object({
  search: z.string().optional(),
  sort_by: z.string().default('id'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

export const ListCompaniesResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ items: z.array(CompanyResponseSchema), pagination: PaginationSchema }),
  })
  .openapi('ListCompaniesResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/companies',
  tags: ['rbac'],
  summary: 'List companies (requires platform_operator role, D-0039)',
  request: { query: ListCompaniesRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ListCompaniesResponseSchema } },
    },
    403: {
      description: 'Not a platform operator',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /companies ---------------------------------------------------------

export const CreateCompanyRequestSchema = z
  .object({
    name: z.string().max(255),
    email: z.email().max(255),
    address: z.string().max(500),
    city: z.string().max(100),
    state: z.string().max(100),
    country: z.string().max(100),
    zip_code: z.string().max(20),
    currency: CurrencyCodeSchema.optional(),
  })
  .openapi('CreateCompanyRequest');

export const CompanyDataResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: CompanyResponseSchema })
  .openapi('CompanyDataResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/companies',
  tags: ['rbac'],
  summary:
    'Create a company (requires platform_operator role, D-0039). Bootstraps the admin/manager/user role skeleton (D-0038).',
  request: { body: { content: { 'application/json': { schema: CreateCompanyRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: CompanyDataResponseSchema } },
    },
    422: {
      description: 'Validation/duplicate',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /companies/{id} ------------------------------------------------------

openApiRegistry.registerPath({
  method: 'get',
  path: '/companies/{id}',
  tags: ['rbac'],
  summary: 'Get a company by id (requires platform_operator role, D-0039)',
  request: { params: z.object({ id: z.coerce.number().int() }) },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: CompanyDataResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- PUT /companies/{id} ------------------------------------------------------

export const UpdateCompanyRequestSchema = z
  .object({
    name: z.string().max(255),
    email: z.email().max(255),
    address: z.string().max(500),
    city: z.string().max(100),
    state: z.string().max(100),
    country: z.string().max(100),
    zip_code: z.string().max(20),
    currency: CurrencyCodeSchema.optional(),
  })
  .openapi('UpdateCompanyRequest');

openApiRegistry.registerPath({
  method: 'put',
  path: '/companies/{id}',
  tags: ['rbac'],
  summary: 'Update a company (requires platform_operator role, D-0039)',
  request: {
    params: z.object({ id: z.coerce.number().int() }),
    body: { content: { 'application/json': { schema: UpdateCompanyRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: CompanyDataResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation/duplicate',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- DELETE /companies/{id} ---------------------------------------------------

openApiRegistry.registerPath({
  method: 'delete',
  path: '/companies/{id}',
  tags: ['rbac'],
  summary:
    'Delete a company (requires platform_operator role, D-0039). NOTE: 201, not 200/204 — matches frozen contract.',
  request: { params: z.object({ id: z.coerce.number().int() }) },
  responses: {
    201: {
      description: 'Deleted',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /companies/bulk-delete (D-0041 — path per the frozen contract) -----

export const BulkDeleteCompaniesRequestSchema = z
  .object({ company_ids: z.array(z.coerce.number().int()) })
  .openapi('BulkDeleteCompaniesRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/companies/bulk-delete',
  tags: ['rbac'],
  summary:
    'Bulk-delete companies (requires platform_operator role, D-0039). NOTE: 201, not 200 — matches frozen contract.',
  request: {
    body: { content: { 'application/json': { schema: BulkDeleteCompaniesRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Deleted',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    422: {
      description: "One or more ids don't exist",
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

/**
 * Roles/modules/permissions — paths and response field names match the
 * frozen contract AND Laravel's actual controller code exactly (not the
 * generic `SuccessData`/`SuccessMessage` envelope `openapi.yaml` uses as
 * a documentation shortcut for these — the real live responses use
 * top-level `roles`/`role`/`modules`/`module` keys, confirmed by direct
 * read of `RolePremissionController.php`/`ModuleController.php`). Lean
 * nested `role`/module shapes (D-0041/D-0030 precedent) — no eager-loaded
 * `users` relation.
 */

export const RoleModuleRefSchema = z
  .object({ id: z.number().int(), code: z.string(), slug: z.string() })
  .openapi('RoleModuleRef');
export const RolePermissionRefSchema = z
  .object({ id: z.number().int(), name: z.string() })
  .openapi('RolePermissionRef');

export const RoleResponseSchema = z
  .object({
    id: z.number().int(),
    company_id: z.number().int(),
    name: z.string(),
    guard_name: z.string(),
    description: z.string().nullable(),
    modules: z.array(RoleModuleRefSchema),
    permissions: z.array(RolePermissionRefSchema),
  })
  .openapi('Role');

export const ModuleCatalogEntrySchema = z
  .object({ id: z.number().int(), code: z.string(), slug: z.string() })
  .openapi('ModuleCatalogEntry');

export const AccessPathEntrySchema = z
  .object({
    relationship: z.literal('assigned_role'),
    user: z.object({ id: z.number().int(), name: z.string().nullable() }),
    role: z.object({ id: z.number().int(), name: z.string() }),
    scope: z.object({ type: z.literal('company'), id: z.number().int() }),
    grants: z.object({
      modules: z.array(
        z.object({ id: z.number().int(), slug: z.string().nullable(), code: z.string().nullable() })
      ),
      permissions: z.array(z.object({ id: z.number().int(), name: z.string() })),
    }),
  })
  .openapi('AccessPathEntry');

export const UserIdParamSchema = z.object({ userId: z.coerce.number().int().positive() });
export const RoleIdParamSchema = z.object({ roleId: z.coerce.number().int().positive() });
export const PermissionIdParamSchema = z.object({
  permissionId: z.coerce.number().int().positive(),
});

export const CreateRoleRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    module_ids: z.array(z.coerce.number().int()).min(1),
  })
  .openapi('CreateRoleRequest');

export const UpdateRoleRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    module_ids: z.array(z.coerce.number().int()).min(1),
  })
  .openapi('UpdateRoleRequest');

export const CreateModuleRequestSchema = z
  .object({ code: z.string().min(1) })
  .openapi('CreateModuleRequest');

// -- GET /roles/user/{userId} -------------------------------------------

export const UserRolesResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), roles: z.array(RoleResponseSchema) })
  .openapi('UserRolesResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/roles/user/{userId}',
  tags: ['rbac'],
  summary:
    "Roles a user has in the caller's own company. company_id is derived from the caller's own JWT context, never a query param (D-0113, a live security-fixes-integration hotfix closing KNOWN_ISSUES 11.20's IDOR) — 400 only if the caller's own account has no company",
  request: { params: UserIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: UserRolesResponseSchema } },
    },
    400: {
      description: 'caller has no company',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /roles/user/{userId}/access-path --------------------------------

export const AccessPathResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: z.array(AccessPathEntrySchema) })
  .openapi('AccessPathResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/roles/user/{userId}/access-path',
  tags: ['rbac'],
  summary:
    "Explicit User->Role->Module/Permission reshape, scoped to the caller's own company (D-0113, same company_id-from-caller-context fix as /roles/user/{userId})",
  request: { params: UserIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: AccessPathResponseSchema } },
    },
    400: {
      description: 'caller has no company',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /roles/company ---------------------------------------------------

/** `RolePremissionController::getCompanyRoles`'s real `Role::with(['permissions', 'users'])` shape (D-0114) — distinct from `RoleResponseSchema` (no `modules`, has `users`). */
const CompanyRoleWithUsersResponseSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  name: z.string(),
  guard_name: z.string(),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  created_by: z.number().int().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  permissions: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      guard_name: z.string(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
      pivot: z.object({ role_id: z.number().int(), permission_id: z.number().int() }),
    })
  ),
  users: z.array(
    z.object({
      id: z.number().int(),
      first_name: z.string(),
      last_name: z.string(),
      email: z.string(),
      number: z.string(),
      timezone: z.string().nullable(),
      profile_image: z.string().nullable(),
      company_id: z.number().int().nullable(),
      company_domain: z.string().nullable(),
      status: z.string(),
      email_verified_at: z.string().nullable(),
      social_provider: z.string().nullable(),
      social_provider_id: z.string().nullable(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
      stripe_id: z.string().nullable(),
      pm_type: z.string().nullable(),
      pm_last_four: z.string().nullable(),
      trial_ends_at: z.string().nullable(),
      pivot: z.object({
        model_type: z.string(),
        role_id: z.number().int(),
        model_id: z.number().int(),
      }),
    })
  ),
});

export const CompanyRolesResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    roles: z.array(CompanyRoleWithUsersResponseSchema),
  })
  .openapi('CompanyRolesResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/roles/company',
  tags: ['rbac'],
  summary:
    "All roles in the caller's own company (D-0113, same company_id-from-caller-context fix as /roles/user/{userId})",
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: CompanyRolesResponseSchema } },
    },
    400: {
      description: 'caller has no company',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /roles/{roleId} ---------------------------------------------------

export const RoleDetailsResponseSchema = z
  .object({ success: z.literal(true), role: RoleResponseSchema })
  .openapi('RoleDetailsResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/roles/{roleId}',
  tags: ['rbac'],
  summary:
    "A single role's details, scoped to the caller's own company (404 for a cross-tenant id, closes 11.20)",
  request: { params: RoleIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: RoleDetailsResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /roles/create (requires role:admin) ------------------------------

export const RoleMutationResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), role: RoleResponseSchema })
  .openapi('RoleMutationResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/roles/create',
  tags: ['rbac'],
  summary:
    'Create a role (requires role:admin). Plain names, no company-id prefix (11.21 resolved). Rejects the reserved platform_operator name (D-0039).',
  request: { body: { content: { 'application/json': { schema: CreateRoleRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: RoleMutationResponseSchema } },
    },
    422: {
      description: 'Validation/duplicate/reserved name',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- PUT /roles/{roleId}/update (requires role:admin) ------------------------

openApiRegistry.registerPath({
  method: 'put',
  path: '/roles/{roleId}/update',
  tags: ['rbac'],
  summary:
    "Update a role (requires role:admin). Scoped to the caller's own company (closes 11.20's cross-tenant update gap).",
  request: {
    params: RoleIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateRoleRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: RoleMutationResponseSchema } },
    },
    403: {
      description: 'Superadmin role cannot be updated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation/duplicate/reserved name',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- DELETE /roles/{roleId}/delete (requires role:admin) ---------------------

openApiRegistry.registerPath({
  method: 'delete',
  path: '/roles/{roleId}/delete',
  tags: ['rbac'],
  summary: "Delete a role (requires role:admin). Scoped to the caller's own company.",
  request: { params: RoleIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    403: {
      description: 'Protected role (superadmin/super_admin/admin)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Role assigned to users',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- DELETE /permissions/{permissionId}/delete (requires role:admin) --------

openApiRegistry.registerPath({
  method: 'delete',
  path: '/permissions/{permissionId}/delete',
  tags: ['rbac'],
  summary: 'Delete a permission (requires role:admin)',
  request: { params: PermissionIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    403: {
      description: 'Critical permission (all/all-access)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /modules (RolePremissionController::getAllModulesForAdmin) ---------

export const ModulesListResponseSchema = z
  .object({ success: z.literal(true), modules: z.array(ModuleCatalogEntrySchema) })
  .openapi('ModulesListResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/modules',
  tags: ['rbac'],
  summary:
    'Module catalog (RolePremissionController::getAllModulesForAdmin — NOT ModuleController::index, which loses a real Laravel route collision at this same path; the frozen contract already resolved this, see D-0042)',
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ModulesListResponseSchema } },
    },
  },
});

// -- POST /modules/create ----------------------------------------------------

export const CreateModuleResponseSchema = z
  .object({ success: z.literal(true), module: z.string(), message: z.string() })
  .openapi('CreateModuleResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/modules/create',
  tags: ['rbac'],
  summary:
    'Create a module + its {code}_all/{code}_none permissions (a different naming convention than all-<slug> used everywhere else — ported as-is, matches Laravel exactly)',
  request: { body: { content: { 'application/json': { schema: CreateModuleRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: CreateModuleResponseSchema } },
    },
    422: {
      description: 'Duplicate code',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /modules/user/{userId} (module 5.2, D-0086) ---------------------

export const UserModulesResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    modules: z.array(z.string()),
    permissions: z.array(z.string()),
  })
  .openapi('UserModulesResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/modules/user/{userId}',
  tags: ['rbac'],
  summary:
    "Fixes 11.55 (built from ModuleController::index()'s correct activeSubscription lookup, not getUserModulesWithPermissions' own buggy $subscription->first() chain) and 11.22's IDOR half (self-only — Laravel had zero ownership check here). Was blocked on modules 5.1/5.2 existing; both now do (D-0085/D-0086).",
  request: { params: UserIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: UserModulesResponseSchema } },
    },
    403: {
      description: "No active subscription, or requesting another user's modules",
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'No plan for subscription',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
