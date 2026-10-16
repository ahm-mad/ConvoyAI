import type {
  LookedUpPermission,
  LookedUpRole,
} from '../../platform/auth/roles-with-permissions-lookup.js';
import type { Profile } from '../users/users.types.js';

/**
 * Domain types for module 1.3 (rbac-tenancy)'s CRUD surface. `Company`
 * carries every raw column (D-0100 revisits D-0041's now-stale lean call —
 * the blocking modules, users/assets/products, are all built now); the
 * `users`/`assets`/`products`/count relations `GET /companies`'s list and
 * show responses eager-load are assembled separately in the service layer
 * via cross-module lookups, not stored on this type.
 */
export interface Company {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  /** D-0158: ISO 4217, upper-case. */
  currency: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateCompanyInput {
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  /** D-0158: optional — omitted keeps the current value (update) / the default `USD` (create). */
  currency?: string | undefined;
}

export interface UpdateCompanyInput {
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  /** D-0158: optional — omitted keeps the current value (update) / the default `USD` (create). */
  currency?: string | undefined;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface ListCompaniesQuery {
  search?: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  perPage: number;
}

/**
 * D-0100 revisits D-0041: `GET /companies`'s real eager-loaded `users`
 * relation — every raw `users` column (D-0099's precedent), fetched for an
 * arbitrary target company (the platform_operator viewing another
 * company), not the caller's own scoped context.
 */
export interface CompanyUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  number: string;
  timezone: string | null;
  profileImage: string | null;
  companyId: string | null;
  companyDomain: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  socialProvider: string | null;
  socialProviderId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  stripeId: string | null;
  pmType: string | null;
  pmLastFour: string | null;
  trialEndsAt: Date | null;
}

/** D-0100: `GET /companies`'s real eager-loaded `assets` relation. */
export interface CompanyAssetRow {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  companyId: string | null;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** D-0100: `GET /companies`'s real eager-loaded `products` relation. */
export interface CompanyProductRow {
  id: string;
  createdBy: string;
  name: string;
  status: string;
  companyId: string;
  deviceProtocolId: string | null;
  preconfigureTemplateId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `GET /companies/{id}`'s real `users.roles` eager load — roles only, no nested `permissions` (unlike `/login`'s `roles.permissions`). */
export interface CompanyUserWithRoles extends CompanyUserRow {
  roles: LookedUpRole[];
}

/** `GET /companies` list item — the real eager-loaded relations + `withCount` fields. */
export interface CompanyListItem extends Company {
  users: CompanyUserRow[];
  assets: CompanyAssetRow[];
  products: CompanyProductRow[];
  usersCount: number;
  assetsCount: number;
  productsCount: number;
  devicesCount: number;
}

/** `GET /companies/{id}` detail — `users.roles` + `products` (no `assets`, matching Laravel's own commented-out eager load). */
export interface CompanyDetail extends Company {
  users: CompanyUserWithRoles[];
  products: CompanyProductRow[];
}

/** D-0038: the fixed bootstrap role skeleton every new company gets — see `bootstrapCompany()`. */
export const BOOTSTRAP_ROLE_NAMES = ['admin', 'manager', 'user'] as const;

/** D-0039: reserved — never creatable/renamable-to via the roles CRUD below. */
export const RESERVED_ROLE_NAME = 'platform_operator';

/** Ported verbatim from `RolePremissionController::updateRoleDetails` (parity, not a new decision). */
export const PROTECTED_ROLES_FOR_UPDATE = ['superadmin', 'super_admin'] as const;
/** Ported verbatim from `RolePremissionController::deleteRole`. */
export const PROTECTED_ROLES_FOR_DELETE = ['superadmin', 'super_admin', 'admin'] as const;
/** Ported verbatim from `RolePremissionController::deletePermission`. */
export const CRITICAL_PERMISSION_NAMES = ['all', 'all-access'] as const;

export interface RoleModuleRef {
  id: string;
  code: string;
  slug: string;
}

export interface RolePermissionRef {
  id: string;
  name: string;
}

/**
 * Lean (D-0041/D-0030 precedent) — omits Laravel's eager-loaded `users`
 * relation (`RolePremissionController::getRoleDetails`/`getCompanyRoles`
 * both `with(['permissions', 'users'])`): user-role assignment display
 * belongs to module 1.4 (users-members), which doesn't exist yet.
 */
export interface Role {
  id: string;
  companyId: string;
  name: string;
  guardName: string;
  description: string | null;
  modules: RoleModuleRef[];
  permissions: RolePermissionRef[];
}

/** `RolePremissionController::getCompanyRoles`'s real `Role::with(['permissions', 'users'])` eager load (D-0114) — a distinct shape from `Role` above (no `modules`, has `users`), only used for `GET /roles/company`. */
export interface CompanyRoleWithUsers {
  id: string;
  companyId: string;
  name: string;
  guardName: string;
  displayName: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  permissions: LookedUpPermission[];
  users: Profile[];
}

export interface CreateRoleInput {
  name: string;
  description: string | undefined;
  moduleIds: string[];
}

export interface UpdateRoleInput {
  name: string;
  description: string | undefined;
  moduleIds: string[];
}

export interface ModuleCatalogEntry {
  id: string;
  code: string;
  slug: string;
}

/** `GET /modules/user/{userId}` (module 5.2) — module *codes*, not slugs, matching the frozen contract and `ModuleController::index()`'s real query (`$plan->modules->pluck('code')`). */
export interface UserModulesResult {
  modules: string[];
  permissions: string[];
}

export interface Permission {
  id: string;
  name: string;
}

/** Mirrors `RolePremissionController::accessPath`'s reshaped chain exactly (field names included). */
export interface AccessPathEntry {
  relationship: 'assigned_role';
  user: { id: string; name: string | null };
  role: { id: string; name: string };
  scope: { type: 'company'; id: string };
  grants: {
    modules: { id: string; slug: string | null; code: string | null }[];
    permissions: { id: string; name: string }[];
  };
}
