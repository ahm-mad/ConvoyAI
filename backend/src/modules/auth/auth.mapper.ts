import type { users as UserRow } from '@prisma/client';
import type { LookedUpRole } from '../../platform/auth/roles-with-permissions-lookup.js';
import { toEagerLoadedCompanyResponse } from '../../shared/utils/company-response.js';
import type { AuthUser, LoginEnrichment } from './auth.types.js';

/** Prisma row -> domain DTO. `id`/`company_id` are BigInt in Postgres — stringified once, here. */
export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id.toString(),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    number: row.number,
    companyId: row.company_id === null ? null : row.company_id.toString(),
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    passwordHash: row.password,
    socialProvider: row.social_provider,
  };
}

/** Domain DTO -> the frozen, lean `User` API shape (D-0030). Never leaks `passwordHash`. Used by `register`/`logout`-adjacent responses that don't need `/login`'s fuller enrichment. */
export function toUserResponse(user: AuthUser) {
  return {
    id: Number(user.id),
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    number: user.number,
    company_id: user.companyId === null ? null : Number(user.companyId),
    status: user.status,
    email_verified_at: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
  };
}

/**
 * `/login`'s real embedded `roles.permissions` eager load (D-0098).
 * `guard_name` and both `pivot` objects (Spatie framework boilerplate —
 * `model_has_roles`/`role_has_permissions` join-row plumbing, not app
 * data) are deliberately dropped per D-0102 (user-directed, after seeing
 * the real Laravel response side by side).
 */
export function toLoginRoleResponse(role: LookedUpRole) {
  return {
    id: Number(role.id),
    company_id: Number(role.companyId),
    name: role.name,
    display_name: role.displayName,
    description: role.description,
    created_by: role.createdBy === null ? null : Number(role.createdBy),
    created_at: role.createdAt ? role.createdAt.toISOString() : null,
    updated_at: role.updatedAt ? role.updatedAt.toISOString() : null,
    permissions: role.permissions.map(permission => ({
      id: Number(permission.id),
      name: permission.name,
      created_at: permission.createdAt ? permission.createdAt.toISOString() : null,
      updated_at: permission.updatedAt ? permission.updatedAt.toISOString() : null,
    })),
  };
}

/** The `user` object `/login` returns (D-0098) — also what the Google/GitHub popup posts back to the frontend (D-0132). */
export function toLoginUserResponse(user: AuthUser, enrichment: LoginEnrichment) {
  return {
    ...toUserResponse(user),
    social_provider: user.socialProvider,
    company: toEagerLoadedCompanyResponse(enrichment.company),
    roles: enrichment.roles.map(role => toLoginRoleResponse(role)),
    companyInfo: enrichment.companyInfo,
    role_type: enrichment.roleType,
  };
}
