import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors/app-error.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { RbacRepository } from './rbac.repository.js';
import {
  CRITICAL_PERMISSION_NAMES,
  PROTECTED_ROLES_FOR_DELETE,
  PROTECTED_ROLES_FOR_UPDATE,
  RESERVED_ROLE_NAME,
  type AccessPathEntry,
  type Company,
  type CompanyAssetRow,
  type CompanyDetail,
  type CompanyListItem,
  type CompanyProductRow,
  type CompanyRoleWithUsers,
  type CompanyUserRow,
  type CreateCompanyInput,
  type CreateRoleInput,
  type ListCompaniesQuery,
  type ModuleCatalogEntry,
  type Paginated,
  type Permission,
  type Role,
  type UpdateCompanyInput,
  type UpdateRoleInput,
  type UserModulesResult,
} from './rbac.types.js';

/** Module 5.2's `SubscriptionsRepository` doubles as this (interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045. */
export interface RbacSubscriptionsLookup {
  findActiveForUser(userId: string): Promise<{ stripePrice: string | null } | undefined>;
}

/** Module 5.1's `PlansRepository` doubles as this. */
export interface RbacPlansLookup {
  findByStripePlan(
    stripePlan: string
  ): Promise<{ modules: { code: string; permissions: string[] }[] } | undefined>;
}

/**
 * D-0100 revisits D-0041's now-stale lean `GET /companies` call — the
 * blocking modules (1.2 auth/users, 3.1 assets, 2.1 products, 2.3 devices)
 * are all built now. Each of the four lookups below is implemented by
 * that owning module's own repository, wired in `container.ts` — same
 * "interface owned by the consumer" pattern as `RbacSubscriptionsLookup`/
 * `RbacPlansLookup` above.
 */
export interface RbacCompanyUsersLookup {
  findAllForCompany(companyId: string): Promise<CompanyUserRow[]>;
  countForCompany(companyId: string): Promise<number>;
}

/** Module 3.1's `AssetsRepository` doubles as this. */
export interface RbacCompanyAssetsLookup {
  findAllForCompany(companyId: string): Promise<CompanyAssetRow[]>;
  countForCompany(companyId: string): Promise<number>;
}

/** Module 2.1's `ProductsRepository` doubles as this — exact `company_id` match, not the OR-global visibility other `products` queries use. */
export interface RbacCompanyProductsLookup {
  findAllForCompanyExact(companyId: string): Promise<CompanyProductRow[]>;
  countForCompanyExact(companyId: string): Promise<number>;
}

/** Module 2.3's `DevicesRepository` doubles as this — `devices` has no `company_id` column, so this takes already-resolved user ids rather than joining itself. */
export interface RbacCompanyDevicesLookup {
  countForUserIds(userIds: string[]): Promise<number>;
}

/**
 * `RolePremissionController::getUserRoles`/`accessPath`/`getCompanyRoles`
 * (D-0113 — a live security-fixes-integration hotfix, KNOWN_ISSUES 11.20):
 * `company_id` is derived from the authenticated caller only, never a
 * client-suppliable query param (the original bug) — the 400 now only
 * fires if the caller's own JWT context has no company at all.
 */
function requireCallerCompanyId(): string {
  const context = getRequestContext();
  if (!context?.companyId) {
    throw new AppError({
      code: 'COMPANY_ID_REQUIRED',
      httpStatus: 400,
      message: 'The company id field is required.',
    });
  }
  return context.companyId;
}

/**
 * Business logic for module 1.3's RBAC CRUD surface (ARCHITECTURE.md §2
 * — services never touch Prisma directly). Validation messages match
 * `CompanyController.php`'s custom Laravel messages verbatim (D-0013).
 */
export class RbacService {
  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly subscriptionsLookup: RbacSubscriptionsLookup,
    private readonly plansLookup: RbacPlansLookup,
    private readonly companyUsersLookup: RbacCompanyUsersLookup,
    private readonly companyAssetsLookup: RbacCompanyAssetsLookup,
    private readonly companyProductsLookup: RbacCompanyProductsLookup,
    private readonly companyDevicesLookup: RbacCompanyDevicesLookup
  ) {}

  /**
   * `GET /modules/user/{userId}` (`ModuleController::getUserModulesWithPermissions`,
   * live-routed per `routes/api.php` — confirmed via `php artisan route:list`,
   * unlike `index()`'s shadowed duplicate at plain `/modules`). Built from
   * `index()`'s correct subscription-lookup logic (real `activeSubscription`
   * filter), not this method's own buggy `$subscription->first()` chain
   * (11.55 — `$subscription` is already a model, so `->first()` silently
   * runs a brand-new unscoped `Subscription::query()->first()`). Self-only
   * (11.22's IDOR half — Laravel's real behavior had zero ownership check
   * on this endpoint at all).
   */
  async getUserModules(userId: string): Promise<UserModulesResult> {
    const context = getRequestContext();
    if (!context) throw new ForbiddenError();
    if (context.userId !== userId) {
      throw new ForbiddenError('You may only view your own modules.');
    }

    const subscription = await this.subscriptionsLookup.findActiveForUser(userId);
    if (!subscription) {
      throw new AppError({
        code: 'USER_NO_ACTIVE_SUBSCRIPTION',
        httpStatus: 403,
        message: 'User has no active subscription.',
      });
    }
    if (!subscription.stripePrice) {
      throw new AppError({
        code: 'NO_PLAN_FOUND_FOR_SUBSCRIPTION',
        httpStatus: 404,
        message: 'No plan found for this subscription.',
      });
    }

    const plan = await this.plansLookup.findByStripePlan(subscription.stripePrice);
    if (!plan) {
      throw new AppError({
        code: 'NO_PLAN_FOUND_FOR_SUBSCRIPTION',
        httpStatus: 404,
        message: 'No plan found for this subscription.',
      });
    }

    return {
      modules: plan.modules.map(module => module.code),
      permissions: [...new Set(plan.modules.flatMap(module => module.permissions))],
    };
  }

  async listCompanies(query: ListCompaniesQuery): Promise<Paginated<Company>> {
    return this.rbacRepository.list(query);
  }

  /**
   * D-0100: `GET /companies`'s real eager-loaded `users`/`assets`/
   * `products` + `withCount` figures, per company. Companies are gated to
   * `platform_operator` already (D-0039) — a low-traffic, cross-tenant
   * admin surface, so the per-company relation fetches below (mirroring
   * Laravel's own eager-load shape, not its exact query count) are an
   * acceptable trade for staying close to the real behavior rather than a
   * hand-optimized batch query.
   */
  async listCompaniesWithRelations(query: ListCompaniesQuery): Promise<Paginated<CompanyListItem>> {
    const page = await this.rbacRepository.list(query);
    const items = await Promise.all(page.items.map(company => this.attachRelations(company)));
    return { items, pagination: page.pagination };
  }

  private async attachRelations(company: Company): Promise<CompanyListItem> {
    const [users, assets, products, usersCount, assetsCount, productsCount] = await Promise.all([
      this.companyUsersLookup.findAllForCompany(company.id),
      this.companyAssetsLookup.findAllForCompany(company.id),
      this.companyProductsLookup.findAllForCompanyExact(company.id),
      this.companyUsersLookup.countForCompany(company.id),
      this.companyAssetsLookup.countForCompany(company.id),
      this.companyProductsLookup.countForCompanyExact(company.id),
    ]);
    const devicesCount = await this.companyDevicesLookup.countForUserIds(
      users.map(user => user.id)
    );
    return {
      ...company,
      users,
      assets,
      products,
      usersCount,
      assetsCount,
      productsCount,
      devicesCount,
    };
  }

  async getCompany(id: string): Promise<Company> {
    const company = await this.rbacRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    return company;
  }

  /**
   * D-0103: `GET`/`PUT /companies/:id` allow the caller's own company (in
   * addition to `platform_operator`'s full cross-tenant access) — real
   * Laravel's `update()`/`show()` have *no* ownership check at all (any
   * authenticated user can touch any company), a real gap D-0039 closed
   * too bluntly by requiring `platform_operator` for everything,
   * including a company managing its own record. `list`/`create`/`delete`
   * stay `platform_operator`-only at the route level (`rbac.routes.ts`) —
   * unchanged, genuinely cross-tenant actions with no "self" case.
   */
  private assertCanAccessCompany(id: string): void {
    const context = getRequestContext();
    if (!context) throw new ForbiddenError();
    if (context.roles.includes(RESERVED_ROLE_NAME)) return;
    if (context.companyId === id) return;
    throw new ForbiddenError('Not authorized to access this company.');
  }

  /** D-0100: `GET /companies/{id}`'s real `users.roles` + `products` eager load (no `assets` — Laravel's own show() has that commented out). */
  async getCompanyWithRelations(id: string): Promise<CompanyDetail> {
    this.assertCanAccessCompany(id);
    const company = await this.getCompany(id);
    const [users, products] = await Promise.all([
      this.companyUsersLookup.findAllForCompany(id),
      this.companyProductsLookup.findAllForCompanyExact(id),
    ]);
    const usersWithRoles = await Promise.all(
      users.map(async user => ({
        ...user,
        roles: await this.rbacRepository.findRolesWithPermissionsForUser(user.id),
      }))
    );
    return { ...company, users: usersWithRoles, products };
  }

  /** D-0038: bootstraps the company's `admin`/`manager`/`user` role skeleton after insert. */
  async createCompany(input: CreateCompanyInput): Promise<Company> {
    await this.assertNameAvailable(input.name);
    await this.assertEmailAvailable(input.email);

    const company = await this.rbacRepository.create(input);
    await this.rbacRepository.bootstrapCompany(company.id);
    return company;
  }

  async updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
    this.assertCanAccessCompany(id);
    await this.getCompany(id); // 404s if missing, matches Laravel's implicit route-model binding

    await this.assertNameAvailable(input.name, id);
    await this.assertEmailAvailable(input.email, id);

    return this.rbacRepository.update(id, input);
  }

  async deleteCompany(id: string): Promise<void> {
    await this.getCompany(id);
    await this.rbacRepository.delete(id);
  }

  /** Matches Laravel's `company_ids.*` => `exists:companies,id` — all ids must exist or none are deleted. */
  async bulkDeleteCompanies(ids: string[]): Promise<void> {
    const existingIds = new Set(await this.rbacRepository.findExistingIds(ids));
    const missing = ids.filter(id => !existingIds.has(id));
    if (missing.length > 0) {
      const message = `One or more selected companies do not exist: ${missing.join(', ')}.`;
      throw new ValidationError(message, { company_ids: [message] });
    }

    await this.rbacRepository.bulkDelete(ids);
  }

  private async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const existing = await this.rbacRepository.findByName(name, excludeId);
    if (existing) {
      throw new ValidationError('This company name is already taken.', {
        name: ['This company name is already taken.'],
      });
    }
  }

  private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const existing = await this.rbacRepository.findByEmail(email, excludeId);
    if (existing) {
      throw new ValidationError('This email is already associated with another company.', {
        email: ['This email is already associated with another company.'],
      });
    }
  }

  // -- Roles ------------------------------------------------------------

  /**
   * `company_id` is accepted (and required, per the frozen contract — the
   * controller enforces it) but its *value* is never read for scoping —
   * the tenant-scoping extension derives the real company from the
   * caller's own context regardless of what the client supplies, closing
   * 11.20's client-suppliable-`company_id` gap structurally rather than
   * trusting the query param at all.
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    requireCallerCompanyId();
    const roleIds = await this.rbacRepository.findRoleIdsForUser(userId);
    return this.rbacRepository.findRolesByIds(roleIds);
  }

  async getUserAccessPath(userId: string): Promise<AccessPathEntry[]> {
    const companyId = requireCallerCompanyId();

    const roleIds = await this.rbacRepository.findRoleIdsForUser(userId);
    const roles = await this.rbacRepository.findRolesByIds(roleIds);
    const user = await this.rbacRepository.findUserSummary(userId);

    return roles.map(role => ({
      relationship: 'assigned_role' as const,
      user: { id: userId, name: user?.name ?? null },
      role: { id: role.id, name: role.name },
      scope: { type: 'company' as const, id: companyId },
      grants: {
        modules: role.modules.map(module => ({
          id: module.id,
          slug: module.slug,
          code: module.code,
        })),
        permissions: role.permissions.map(permission => ({
          id: permission.id,
          name: permission.name,
        })),
      },
    }));
  }

  async getCompanyRoles(): Promise<CompanyRoleWithUsers[]> {
    requireCallerCompanyId();
    return this.rbacRepository.findRolesForCompany();
  }

  async getRoleDetails(roleId: string): Promise<Role> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    return role;
  }

  /** D-0039: reject the reserved `platform_operator` name outright — never creatable via this endpoint. */
  async createRole(input: CreateRoleInput): Promise<Role> {
    this.assertNotReservedName(input.name);
    await this.assertRoleNameAvailable(input.name);

    return this.rbacRepository.createRole(input);
  }

  async updateRole(roleId: string, input: UpdateRoleInput): Promise<Role> {
    const role = await this.getRoleDetails(roleId);

    if ((PROTECTED_ROLES_FOR_UPDATE as readonly string[]).includes(role.name)) {
      throw new ForbiddenError('Superadmin role cannot be updated.');
    }
    this.assertNotReservedName(input.name);
    await this.assertRoleNameAvailable(input.name, roleId);

    // Matches `updateRoleDetails`'s `$validated['description'] ?? $role->description` —
    // an omitted description keeps the role's existing one, not null.
    const description = input.description ?? role.description ?? undefined;

    return this.rbacRepository.updateRole(roleId, { ...input, description });
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.getRoleDetails(roleId);

    if ((PROTECTED_ROLES_FOR_DELETE as readonly string[]).includes(role.name)) {
      throw new ForbiddenError('This role cannot be deleted.');
    }
    if (await this.rbacRepository.roleHasAssignedUsers(roleId)) {
      throw new ConflictError('Role is assigned to users and cannot be deleted.');
    }

    await this.rbacRepository.deleteRole(roleId);
  }

  private assertNotReservedName(name: string): void {
    if (name === RESERVED_ROLE_NAME) {
      throw new ValidationError(`The role name "${RESERVED_ROLE_NAME}" is reserved.`, {
        name: [`The role name "${RESERVED_ROLE_NAME}" is reserved.`],
      });
    }
  }

  private async assertRoleNameAvailable(name: string, excludeId?: string): Promise<void> {
    if (await this.rbacRepository.roleNameExists(name, excludeId)) {
      const message = 'The name has already been taken.';
      throw new ValidationError(message, { name: [message] });
    }
  }

  // -- Modules ------------------------------------------------------------

  async listModulesForAdmin(): Promise<ModuleCatalogEntry[]> {
    return this.rbacRepository.listModulesForAdmin();
  }

  async createModule(code: string): Promise<void> {
    if (await this.rbacRepository.moduleCodeExists(code)) {
      const message = 'The code has already been taken.';
      throw new ValidationError(message, { code: [message] });
    }
    await this.rbacRepository.createModule(code);
  }

  // -- Permissions ----------------------------------------------------------

  async deletePermission(permissionId: string): Promise<Permission> {
    const permission = await this.rbacRepository.findPermissionById(permissionId);
    if (!permission) {
      throw new NotFoundError('Permission not found');
    }
    if ((CRITICAL_PERMISSION_NAMES as readonly string[]).includes(permission.name)) {
      throw new ForbiddenError('Critical permissions cannot be deleted.');
    }

    await this.rbacRepository.deletePermission(permissionId);
    return permission;
  }
}
