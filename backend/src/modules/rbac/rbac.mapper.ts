import type {
  companies as CompanyRow,
  modules as ModuleRow,
  permissions as PermissionRow,
  roles as RoleRow,
} from '@prisma/client';
import type { LookedUpRole } from '../../platform/auth/roles-with-permissions-lookup.js';
import type {
  AccessPathEntry,
  Company,
  CompanyAssetRow,
  CompanyDetail,
  CompanyListItem,
  CompanyProductRow,
  CompanyRoleWithUsers,
  CompanyUserRow,
  CompanyUserWithRoles,
  ModuleCatalogEntry,
  Permission,
  Role,
  RoleModuleRef,
  RolePermissionRef,
} from './rbac.types.js';

/** Prisma row -> domain DTO. `id` is BigInt in Postgres — stringified once, here (same pattern as `auth.mapper.ts`). */
export function toCompany(row: CompanyRow): Company {
  return {
    id: row.id.toString(),
    name: row.name,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    zipCode: row.zip_code,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Domain DTO -> the real Laravel `Company` row shape, incl. timestamps (D-0100 revisits D-0041's lean call — nothing on this model was ever `$hidden`). */
export function toCompanyResponse(company: Company) {
  return {
    id: Number(company.id),
    name: company.name,
    email: company.email,
    address: company.address,
    city: company.city,
    state: company.state,
    country: company.country,
    zip_code: company.zipCode,
    currency: company.currency,
    created_at: company.createdAt ? company.createdAt.toISOString() : null,
    updated_at: company.updatedAt ? company.updatedAt.toISOString() : null,
  };
}

export function toModuleRef(row: ModuleRow): RoleModuleRef {
  return { id: row.id.toString(), code: row.code, slug: row.slug };
}

export function toPermissionRef(row: PermissionRow): RolePermissionRef {
  return { id: row.id.toString(), name: row.name };
}

export function toRole(
  row: RoleRow,
  moduleRows: ModuleRow[],
  permissionRows: PermissionRow[]
): Role {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    name: row.name,
    guardName: row.guard_name,
    description: row.description,
    modules: moduleRows.map(toModuleRef),
    permissions: permissionRows.map(toPermissionRef),
  };
}

/** Domain DTO -> the frozen `role` shape (lean — D-0041/D-0030 precedent, no eager-loaded `users`). */
export function toRoleResponse(role: Role) {
  return {
    id: Number(role.id),
    company_id: Number(role.companyId),
    name: role.name,
    guard_name: role.guardName,
    description: role.description,
    modules: role.modules.map(m => ({ id: Number(m.id), code: m.code, slug: m.slug })),
    permissions: role.permissions.map(p => ({ id: Number(p.id), name: p.name })),
  };
}

export function toModuleCatalogEntry(
  row: Pick<ModuleRow, 'id' | 'code' | 'slug'>
): ModuleCatalogEntry {
  return { id: row.id.toString(), code: row.code, slug: row.slug };
}

export function toModuleCatalogResponse(entry: ModuleCatalogEntry) {
  return { id: Number(entry.id), code: entry.code, slug: entry.slug };
}

export function toPermission(row: PermissionRow): Permission {
  return { id: row.id.toString(), name: row.name };
}

/**
 * `GET /companies`'s real embedded `users` row (D-0100) — every raw
 * `users` column Laravel serializes here, no computed `user_image`
 * (that's `/profile`'s own addition, not part of a plain `Company::
 * with('users')` eager load).
 */
export function toCompanyEmbeddedUserResponse(user: CompanyUserRow) {
  return {
    id: Number(user.id),
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    number: user.number,
    timezone: user.timezone,
    profile_image: user.profileImage,
    company_id: user.companyId === null ? null : Number(user.companyId),
    company_domain: user.companyDomain,
    status: user.status,
    email_verified_at: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    social_provider: user.socialProvider,
    social_provider_id: user.socialProviderId,
    created_at: user.createdAt ? user.createdAt.toISOString() : null,
    updated_at: user.updatedAt ? user.updatedAt.toISOString() : null,
    stripe_id: user.stripeId,
    pm_type: user.pmType,
    pm_last_four: user.pmLastFour,
    trial_ends_at: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
  };
}

/** `GET /companies/{id}`'s real `users.roles` eager load — roles only, no nested `permissions` (unlike `/login`'s `roles.permissions`, D-0098). */
export function toCompanyRoleResponse(role: LookedUpRole, userId: string) {
  return {
    id: Number(role.id),
    company_id: Number(role.companyId),
    name: role.name,
    guard_name: role.guardName,
    display_name: role.displayName,
    description: role.description,
    created_by: role.createdBy === null ? null : Number(role.createdBy),
    created_at: role.createdAt ? role.createdAt.toISOString() : null,
    updated_at: role.updatedAt ? role.updatedAt.toISOString() : null,
    pivot: {
      role_id: Number(role.id),
      model_id: Number(userId),
      model_type: 'App\\Domain\\Auth\\Models\\User',
    },
  };
}

function toCompanyEmbeddedUserWithRolesResponse(user: CompanyUserWithRoles) {
  return {
    ...toCompanyEmbeddedUserResponse(user),
    roles: user.roles.map(role => toCompanyRoleResponse(role, user.id)),
  };
}

/** `RolePremissionController::getCompanyRoles`'s real `Role::with(['permissions', 'users'])` shape (D-0114) — distinct from `toRoleResponse` (no `modules`, has `users`), only for `GET /roles/company`. */
export function toCompanyRoleWithUsersResponse(role: CompanyRoleWithUsers) {
  return {
    id: Number(role.id),
    company_id: Number(role.companyId),
    name: role.name,
    guard_name: role.guardName,
    display_name: role.displayName,
    description: role.description,
    created_by: role.createdBy === null ? null : Number(role.createdBy),
    created_at: role.createdAt ? role.createdAt.toISOString() : null,
    updated_at: role.updatedAt ? role.updatedAt.toISOString() : null,
    permissions: role.permissions.map(permission => ({
      id: Number(permission.id),
      name: permission.name,
      guard_name: permission.guardName,
      created_at: permission.createdAt ? permission.createdAt.toISOString() : null,
      updated_at: permission.updatedAt ? permission.updatedAt.toISOString() : null,
      pivot: { role_id: Number(role.id), permission_id: Number(permission.id) },
    })),
    users: role.users.map(user => ({
      ...toCompanyEmbeddedUserResponse(user),
      pivot: {
        model_type: 'App\\Domain\\Auth\\Models\\User',
        role_id: Number(role.id),
        model_id: Number(user.id),
      },
    })),
  };
}

/** `GET /companies`'s real embedded `assets` row (D-0100). */
export function toCompanyEmbeddedAssetResponse(asset: CompanyAssetRow) {
  return {
    id: Number(asset.id),
    name: asset.name,
    icon: asset.icon,
    type: asset.type,
    company_id: asset.companyId,
    description: asset.description,
    created_at: asset.createdAt ? asset.createdAt.toISOString() : null,
    updated_at: asset.updatedAt ? asset.updatedAt.toISOString() : null,
  };
}

/** `GET /companies`/`GET /companies/{id}`'s real embedded `products` row (D-0100). */
export function toCompanyEmbeddedProductResponse(product: CompanyProductRow) {
  return {
    id: Number(product.id),
    created_by: Number(product.createdBy),
    name: product.name,
    status: product.status,
    company_id: Number(product.companyId),
    device_protocol_id: product.deviceProtocolId === null ? null : Number(product.deviceProtocolId),
    preconfigure_template_id:
      product.preconfigureTemplateId === null ? null : Number(product.preconfigureTemplateId),
    created_at: product.createdAt ? product.createdAt.toISOString() : null,
    updated_at: product.updatedAt ? product.updatedAt.toISOString() : null,
  };
}

/** `GET /companies`' real per-item eager-loaded shape + `withCount` figures (D-0100). */
export function toCompanyListItemResponse(item: CompanyListItem) {
  return {
    ...toCompanyResponse(item),
    users: item.users.map(toCompanyEmbeddedUserResponse),
    assets: item.assets.map(toCompanyEmbeddedAssetResponse),
    products: item.products.map(toCompanyEmbeddedProductResponse),
    users_count: item.usersCount,
    assets_count: item.assetsCount,
    products_count: item.productsCount,
    devices_count: item.devicesCount,
  };
}

/** `GET /companies/{id}`'s real eager-loaded shape (D-0100) — `users.roles` + `products`, no `assets`/counts (matches Laravel's own `show()`). */
export function toCompanyDetailResponse(detail: CompanyDetail) {
  return {
    ...toCompanyResponse(detail),
    users: detail.users.map(toCompanyEmbeddedUserWithRolesResponse),
    products: detail.products.map(toCompanyEmbeddedProductResponse),
  };
}

export function toAccessPathResponse(entry: AccessPathEntry) {
  return {
    relationship: entry.relationship,
    user: { id: Number(entry.user.id), name: entry.user.name },
    role: { id: Number(entry.role.id), name: entry.role.name },
    scope: { type: entry.scope.type, id: Number(entry.scope.id) },
    grants: {
      modules: entry.grants.modules.map(m => ({ id: Number(m.id), slug: m.slug, code: m.code })),
      permissions: entry.grants.permissions.map(p => ({ id: Number(p.id), name: p.name })),
    },
  };
}
