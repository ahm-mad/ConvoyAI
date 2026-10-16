import { z } from 'zod';
import { openApiRegistry } from '../../platform/openapi/registry.js';

/**
 * Zod schemas for module 1.2 (auth) — also the OpenAPI source
 * (ARCHITECTURE.md §4). Response envelopes follow D-0026 (`{success,
 * message, errors?}`) and D-0030 (the frozen lean `User` shape, not
 * Laravel's eager-loaded blob).
 */

export const UserResponseSchema = z
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
  .openapi('User');

const SuccessMessageSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi('SuccessMessage');

/**
 * `/login`'s real `company`/`roles.permissions` eager load (D-0098
 * revisits D-0030) — distinct from `UserResponseSchema` since `/register`
 * and other callers keep the lean shape; only `/login`'s response uses
 * `LoginUserResponseSchema` below.
 */
const LoginCompanyResponseSchema = z
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
  .openapi('LoginCompany');

/** D-0102: `guard_name`/`pivot` dropped — Spatie framework boilerplate, not app data (user-directed after comparing side by side with the real Laravel response). */
const LoginRolePermissionResponseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .openapi('LoginRolePermission');

const LoginRoleResponseSchema = z
  .object({
    id: z.number().int(),
    company_id: z.number().int(),
    name: z.string(),
    display_name: z.string().nullable(),
    description: z.string().nullable(),
    created_by: z.number().int().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    permissions: z.array(LoginRolePermissionResponseSchema),
  })
  .openapi('LoginRole');

export const LoginUserResponseSchema = UserResponseSchema.extend({
  social_provider: z.string().nullable(),
  company: LoginCompanyResponseSchema.nullable(),
  roles: z.array(LoginRoleResponseSchema),
  companyInfo: z.boolean(),
  role_type: z.string().nullable(),
}).openapi('LoginUser');

const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi('ErrorResponse');

// -- POST /login --------------------------------------------------------

export const LoginRequestSchema = z
  .object({ email: z.email(), password: z.string() })
  .openapi('LoginRequest');

export const LoginResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    user: LoginUserResponseSchema,
    token: z.string(),
    access_token: z.string(),
    refresh_token: z.string(),
    packet_issues: z.array(z.string()),
  })
  .openapi('LoginResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/login',
  tags: ['auth'],
  summary: 'Login with email + password',
  request: { body: { content: { 'application/json': { schema: LoginRequestSchema } } } },
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: LoginResponseSchema } },
    },
    401: {
      description: 'Invalid credentials or user not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Email not verified',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /register -------------------------------------------------------

export const RegisterRequestSchema = z
  .object({
    first_name: z.string().max(255),
    last_name: z.string().max(255),
    number: z.string().max(255),
    email: z.email().max(255),
    password: z.string().min(8),
    timezone: z.string(),
    locale: z.string().optional(),
  })
  .openapi('RegisterRequest');

export const RegisterResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    user: UserResponseSchema,
    access_token: z.string(),
    refresh_token: z.string(),
    token_type: z.literal('bearer'),
  })
  .openapi('RegisterResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/register',
  tags: ['auth'],
  summary: 'Register a new user (does NOT create a company — see 5.3 onboarding)',
  request: { body: { content: { 'application/json': { schema: RegisterRequestSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: RegisterResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /logout (D-0027, D-0029 — real implementation, 11.6) -----------

export const LogoutRequestSchema = z
  .object({ refresh_token: z.string().optional() })
  .openapi('LogoutRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/logout',
  tags: ['auth'],
  summary: 'Revoke the current access token and (if supplied) its refresh token',
  request: { body: { content: { 'application/json': { schema: LogoutRequestSchema } } } },
  responses: {
    200: {
      description: 'Logged out',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /refresh (D-0027, D-0029 — new endpoint) -----------------------

export const RefreshRequestSchema = z
  .object({ refresh_token: z.string() })
  .openapi('RefreshRequest');

export const RefreshResponseSchema = z
  .object({ access_token: z.string(), refresh_token: z.string(), token_type: z.literal('bearer') })
  .openapi('RefreshResponse');

openApiRegistry.registerPath({
  method: 'post',
  path: '/refresh',
  tags: ['auth'],
  summary: 'Rotate a refresh token for a new access+refresh pair',
  request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
  responses: {
    200: {
      description: 'Rotated',
      content: { 'application/json': { schema: RefreshResponseSchema } },
    },
    401: {
      description: 'Invalid, expired, or revoked refresh token',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /forgot-password ------------------------------------------------

export const ForgotPasswordRequestSchema = z
  .object({ email: z.email() })
  .openapi('ForgotPasswordRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/forgot-password',
  tags: ['auth'],
  summary: 'Send a password reset link',
  request: { body: { content: { 'application/json': { schema: ForgotPasswordRequestSchema } } } },
  responses: {
    200: { description: 'Sent', content: { 'application/json': { schema: SuccessMessageSchema } } },
    500: {
      description: 'Failed (e.g. throttled)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /verify-reset-token (D-0029 — new, closes 11.7) -----------------

export const VerifyResetTokenRequestSchema = z
  .object({ email: z.email(), token: z.string() })
  .openapi('VerifyResetTokenRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/verify-reset-token',
  tags: ['auth'],
  summary: 'Check a password-reset token is valid without consuming it (closes 11.7)',
  request: { body: { content: { 'application/json': { schema: VerifyResetTokenRequestSchema } } } },
  responses: {
    200: {
      description: 'Valid',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    401: {
      description: 'Invalid or expired token',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /reset-password --------------------------------------------------

export const ResetPasswordRequestSchema = z
  .object({ token: z.string(), email: z.email(), password: z.string().min(8) })
  .openapi('ResetPasswordRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/reset-password',
  tags: ['auth'],
  summary: 'Reset password using a token',
  request: { body: { content: { 'application/json': { schema: ResetPasswordRequestSchema } } } },
  responses: {
    200: {
      description: 'Reset',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    500: {
      description: 'Invalid/expired token or other failure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- POST /change-password (D-0031 — scope gap fill) -----------------------

export const ChangePasswordRequestSchema = z
  .object({ current_password: z.string(), new_password: z.string().min(8) })
  .openapi('ChangePasswordRequest');

openApiRegistry.registerPath({
  method: 'post',
  path: '/change-password',
  tags: ['auth'],
  summary: "Change the authenticated user's password",
  request: { body: { content: { 'application/json': { schema: ChangePasswordRequestSchema } } } },
  responses: {
    200: {
      description: 'Changed',
      content: { 'application/json': { schema: SuccessMessageSchema } },
    },
    403: {
      description: 'Current password mismatch',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// -- Social login: GET /auth/{provider}/redirect, /callback ----------------

export const SocialRedirectResponseSchema = z
  .object({ success: z.boolean(), redirect_url: z.string() })
  .openapi('SocialRedirectResponse');

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/{provider}/redirect',
  tags: ['auth'],
  summary: 'Get OAuth redirect URL (google|github only)',
  request: { params: z.object({ provider: z.enum(['google', 'github']) }) },
  responses: {
    200: {
      description: 'Redirect URL',
      content: { 'application/json': { schema: SocialRedirectResponseSchema } },
    },
    422: {
      description: 'Unsupported provider',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/{provider}/callback',
  tags: ['auth'],
  summary: 'OAuth callback — returns an HTML page (window.opener.postMessage), not JSON',
  request: { params: z.object({ provider: z.enum(['google', 'github']) }) },
  responses: {
    200: {
      description: 'HTML page with postMessage script',
      content: { 'text/html': { schema: z.string() } },
    },
  },
});
