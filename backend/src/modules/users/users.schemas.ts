import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 1.4 (users-members). Response envelope/field
 * names match Laravel's actual controller code exactly, including the
 * odd cases where `success` holds a message *string*, not a boolean
 * (`membersStore`/`membersUpdate`/`authUpdateUserProfile` — the frozen
 * `openapi.yaml` documents this explicitly: "holds a message string, not
 * a bool") — D-0045, same "match the real behavior, not a cleaner
 * envelope" instruction as D-0042. Lean `User`/`Member` shapes (D-0030/
 * D-0041/D-0042 precedent) — no eager-loaded `user.roles`.
 */

const UserResponseSchema = z
  .object({
    id: z.number().int(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    number: z.string(),
    company_id: z.number().int().nullable(),
    status: z.string(),
    email_verified_at: z.string().nullable(),
  })
  .openapi('UsersModuleUser');

const MemberRoleSchema = z.object({
  id: z.number().int(),
  company_id: z.number().int(),
  name: z.string(),
  guard_name: z.string(),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  created_by: z.number().int().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  pivot: z.object({
    model_type: z.string(),
    model_id: z.number().int(),
    role_id: z.number().int(),
  }),
});

/** `Member::with('user.roles')` (D-0111) — the full raw `users` row + `roles`, matching `GET /companies/{id}`'s own `users.roles` shape (Spatie fields incl. `guard_name`/`pivot`, no nested `permissions`). */
const MemberUserRefSchema = z.object({
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
  roles: z.array(MemberRoleSchema),
});

const MemberResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    name: z.string(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    company_id: z.number().int(),
    created_by: z.string(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    user: MemberUserRefSchema,
  })
  .openapi('Member');

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('UsersModuleErrorResponse');

// -- GET /profile -----------------------------------------------------------

/** `GET /profile`'s real embedded `company` row (D-0099 revisits D-0030/D-0045). */
const ProfileCompanyResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    zip_code: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .openapi('ProfileCompany');

/** `GET /profile`'s real raw-column shape (D-0099) — every `users` column Laravel doesn't `$hidden`, plus `company`. `POST /profile/{user}/update` keeps the lean `UserResponseSchema` above — only `GET /profile` was asked to match. */
const FullProfileUserResponseSchema = UserResponseSchema.extend({
  timezone: z.string().nullable(),
  profile_image: z.string().nullable(),
  company_domain: z.string().nullable(),
  social_provider: z.string().nullable(),
  social_provider_id: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  company: ProfileCompanyResponseSchema.nullable(),
}).openapi('FullProfileUser');

export const ProfileResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ user: FullProfileUserResponseSchema, user_image: z.string().nullable() }),
  })
  .openapi('ProfileResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/profile',
  tags: ['users'],
  summary:
    "Get the caller's own profile (D-0043 closed 11.43 — no user_id param, always the authenticated caller)",
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: ProfileResponseSchema } } },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /profile/{user}/update ---------------------------------------------

export const UpdateProfileRequestSchema = z.object({
  first_name: z.string().max(255),
  last_name: z.string().max(255),
  number: z.string().max(255),
  email: z.email().max(255),
});

export const UpdateProfileResponseSchema = z
  .object({ success: z.string(), user: UserResponseSchema })
  .openapi('UpdateProfileResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/profile/{user}/update',
  tags: ['users'],
  summary:
    "Update the caller's own profile (D-0042 closed 11.42 — the {user} path param is kept for URL-shape parity but must equal the caller's own id, 403 otherwise; multipart/form-data for the optional profile_image file)",
  request: {
    params: z.object({ user: z.coerce.number().int().positive() }),
    body: { content: { 'multipart/form-data': { schema: UpdateProfileRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: UpdateProfileResponseSchema } },
    },
    403: {
      description: "Not the caller's own account",
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /members -------------------------------------------------------

export const ListMembersRequestSchema = z.object({
  search: z.string().optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
});

const MembersPaginatorResponseSchema = z
  .object({
    current_page: z.number().int(),
    data: z.array(MemberResponseSchema),
    first_page_url: z.string(),
    from: z.number().int().nullable(),
    last_page: z.number().int(),
    last_page_url: z.string(),
    links: z.array(
      z.object({ url: z.string().nullable(), label: z.string(), active: z.boolean() })
    ),
    next_page_url: z.string().nullable(),
    path: z.string(),
    per_page: z.number().int(),
    prev_page_url: z.string().nullable(),
    to: z.number().int().nullable(),
    total: z.number().int(),
  })
  .openapi('MembersPaginator');

export const ListMembersResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: MembersPaginatorResponseSchema,
  })
  .openapi('ListMembersResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/members',
  tags: ['users'],
  summary: "List members in the caller's own company (closes 11.41)",
  request: { query: ListMembersRequestSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: ListMembersResponseSchema } },
    },
  },
});

// -- POST /members ------------------------------------------------------

export const CreateMemberRequestSchema = z
  .object({
    first_name: z.string().max(255),
    last_name: z.string().max(255),
    number: z.string().max(20),
    email: z.email(),
    address: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    role: z.string(),
    password: z.string().min(8).optional(),
  })
  .openapi('CreateMemberRequest');

/** `success` holds a message string here, not a boolean — matches Laravel's actual `MemberController::store` response exactly (see the file-level doc comment). */
export const CreateMemberResponseSchema = z
  .object({ success: z.string() })
  .openapi('CreateMemberResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/members',
  tags: ['users'],
  summary:
    "Create a member (a new User + role assignment + Member row) in the caller's own company (closes 11.41)",
  request: { body: { content: { 'application/json': { schema: CreateMemberRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: CreateMemberResponseSchema } },
    },
    404: {
      description: 'Role not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- GET /members/{id} ---------------------------------------------------

export const MemberIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const MemberDataResponseSchema = z
  .object({ success: z.literal(true), message: z.string(), data: MemberResponseSchema })
  .openapi('MemberDataResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/members/{id}',
  tags: ['users'],
  summary: "Get a member by id, scoped to the caller's own company (closes 11.41)",
  request: { params: MemberIdParamSchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: MemberDataResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- PUT /members/{id} ----------------------------------------------------

export const UpdateMemberRequestSchema = z
  .object({
    name: z.string().max(255),
    address: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
  })
  .openapi('UpdateMemberRequest');

export const UpdateMemberResponseSchema = z
  .object({ success: z.string() })
  .openapi('UpdateMemberResponse');

openApiRegistry.registerPath({
  method: 'put',
  path: '/members/{id}',
  tags: ['users'],
  summary: "Update a member, scoped to the caller's own company (closes 11.41)",
  request: {
    params: MemberIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateMemberRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: UpdateMemberResponseSchema } },
    },
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

// -- DELETE /members/bulk-delete ---------------------------------------------

export const BulkDeleteMembersRequestSchema = z
  .object({ ids: z.array(z.coerce.number().int()).min(1) })
  .openapi('BulkDeleteMembersRequest');

export const BulkDeleteMembersResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    deleted_count: z.number().int(),
    not_deleted_count: z.number().int(),
  })
  .openapi('BulkDeleteMembersResponse');

openApiRegistry.registerPath({
  method: 'delete',
  path: '/members/bulk-delete',
  tags: ['users'],
  summary:
    "Bulk-delete members (and their underlying User accounts), scoped to the caller's own company (closes 11.41)",
  request: {
    body: { content: { 'application/json': { schema: BulkDeleteMembersRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: BulkDeleteMembersResponseSchema } },
    },
    404: {
      description: 'No valid members found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
