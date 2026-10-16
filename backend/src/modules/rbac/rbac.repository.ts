import type { roles as RoleRow } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import type { ClaimsResolver, UserClaims } from '../../platform/auth/claims-resolver.js';
import type { RoleLookup } from '../../platform/auth/role-lookup.js';
import type { CompanyLookup, LookedUpCompany } from '../../platform/auth/company-lookup.js';
import type {
  LookedUpRole,
  RolesWithPermissionsLookup,
} from '../../platform/auth/roles-with-permissions-lookup.js';
import { toProfile } from '../users/users.mapper.js';
import type { Profile } from '../users/users.types.js';
import {
  BOOTSTRAP_ROLE_NAMES,
  type Company,
  type CompanyRoleWithUsers,
  type CreateCompanyInput,
  type CreateRoleInput,
  type ListCompaniesQuery,
  type ModuleCatalogEntry,
  type Paginated,
  type Permission,
  type Role,
  type UpdateCompanyInput,
  type UpdateRoleInput,
} from './rbac.types.js';
import { toCompany, toModuleCatalogEntry, toPermission, toRole } from './rbac.mapper.js';

/**
 * Spatie's default polymorphic morph type for the `users` model
 * (`model_has_roles.model_type` / `model_has_permissions.model_type`) —
 * confirmed by grep that no `morphMap` is registered anywhere in the
 * Laravel app (`config/`, `app/`, `bootstrap/`), so Eloquent falls back
 * to the literal FQCN, not a short alias (D-0040).
 */
const USER_MODEL_TYPE = 'App\\Domain\\Auth\\Models\\User';

const SORTABLE_COLUMNS = new Set([
  'id',
  'name',
  'email',
  'city',
  'state',
  'country',
  'created_at',
  'updated_at',
]);

/**
 * All Prisma access for module 1.3's RBAC CRUD surface + the
 * `ClaimsResolver` module 1.2 depends on (D-0040). `companies` is
 * `none`-ruled (the tenant root itself, `tenant-rules.ts`) — every query
 * here runs unscoped, no `runAsSystemAsync` needed, same as any other
 * `none`/`parent`-ruled table. `roles` IS `company`-ruled, so
 * `bootstrapCompany()` — which must write under an arbitrary *new*
 * company's id, not the caller's own — explicitly uses the SYSTEM escape
 * hatch (never the caller's own context, which would silently mis-scope
 * the new rows to the platform operator's own company instead of the
 * one just created).
 */
export class RbacRepository
  implements ClaimsResolver, RoleLookup, CompanyLookup, RolesWithPermissionsLookup
{
  constructor(private readonly prisma: AppPrismaClient) {}

  /** `CompanyLookup` implementation (D-0098/D-0099) — same query as `findById`, kept separate since callers across modules depend on the narrower interface, not this repository directly (`CONVENTIONS.md` "Modules"). */
  async findCompanyById(companyId: string): Promise<LookedUpCompany | undefined> {
    return this.findById(companyId);
  }

  /**
   * `RolesWithPermissionsLookup` implementation (D-0098) — the exact same
   * `model_has_roles -> roles -> role_has_permissions -> permissions`
   * shape `resolveClaims` (D-0040) already queries, returning full rows
   * instead of names only, for `/login`'s `roles.permissions` eager-load
   * parity.
   */
  async findRolesWithPermissionsForUser(userId: string): Promise<LookedUpRole[]> {
    const roleLinks = await this.prisma.model_has_roles.findMany({
      where: { model_type: USER_MODEL_TYPE, model_id: BigInt(userId) },
      include: { roles: { include: { role_has_permissions: { include: { permissions: true } } } } },
    });

    return roleLinks.map(link => ({
      id: link.roles.id.toString(),
      companyId: link.roles.company_id.toString(),
      name: link.roles.name,
      guardName: link.roles.guard_name,
      displayName: link.roles.display_name,
      description: link.roles.description,
      createdBy: link.roles.created_by === null ? null : link.roles.created_by.toString(),
      createdAt: link.roles.created_at,
      updatedAt: link.roles.updated_at,
      permissions: link.roles.role_has_permissions.map(rolePermission => ({
        id: rolePermission.permissions.id.toString(),
        name: rolePermission.permissions.name,
        guardName: rolePermission.permissions.guard_name,
        createdAt: rolePermission.permissions.created_at,
        updatedAt: rolePermission.permissions.updated_at,
      })),
    }));
  }

  async list(query: ListCompaniesQuery): Promise<Paginated<Company>> {
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};
    const orderByField = SORTABLE_COLUMNS.has(query.sortBy) ? query.sortBy : 'id';
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.companies.findMany({
        where,
        orderBy: { [orderByField]: query.sortOrder },
        skip,
        take: query.perPage,
      }),
      this.prisma.companies.count({ where }),
    ]);

    return {
      items: rows.map(toCompany),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async findById(id: string): Promise<Company | undefined> {
    const row = await this.prisma.companies.findUnique({ where: { id: BigInt(id) } });
    return row ? toCompany(row) : undefined;
  }

  /** Excludes `excludeId` so an update's own row doesn't collide with itself. */
  async findByName(name: string, excludeId?: string): Promise<Company | undefined> {
    const row = await this.prisma.companies.findFirst({
      where: excludeId ? { name, id: { not: BigInt(excludeId) } } : { name },
    });
    return row ? toCompany(row) : undefined;
  }

  async findByEmail(email: string, excludeId?: string): Promise<Company | undefined> {
    const row = await this.prisma.companies.findFirst({
      where: excludeId ? { email, id: { not: BigInt(excludeId) } } : { email },
    });
    return row ? toCompany(row) : undefined;
  }

  async create(input: CreateCompanyInput): Promise<Company> {
    const row = await this.prisma.companies.create({
      data: {
        name: input.name,
        email: input.email,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        zip_code: input.zipCode,
        ...(input.currency ? { currency: input.currency } : {}),
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
    return toCompany(row);
  }

  async update(id: string, input: UpdateCompanyInput): Promise<Company> {
    const row = await this.prisma.companies.update({
      where: { id: BigInt(id) },
      data: {
        name: input.name,
        email: input.email,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        zip_code: input.zipCode,
        ...(input.currency ? { currency: input.currency } : {}),
        updated_at: new Date(),
      },
    });
    return toCompany(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.companies.delete({ where: { id: BigInt(id) } });
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.prisma.companies.deleteMany({ where: { id: { in: ids.map(id => BigInt(id)) } } });
  }

  /** Returns the subset of `ids` that actually exist — used to replicate Laravel's `exists:companies,id` bulk-delete validation. */
  async findExistingIds(ids: string[]): Promise<string[]> {
    const rows = await this.prisma.companies.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
      select: { id: true },
    });
    return rows.map(row => row.id.toString());
  }

  /**
   * D-0038: the `admin`/`manager`/`user` role skeleton for a brand-new
   * company — idempotent (`upsert`, matching Laravel's `firstOrCreate`),
   * grants no permissions (nothing to scope them to without a plan —
   * see D-0038/D-0024). Always the SYSTEM escape hatch: `roles` is
   * `company`-ruled, and the company being bootstrapped is essentially
   * never the caller's own (a platform operator creating company Y
   * belongs to company X) — trusting the caller's own context here
   * would silently mis-scope the new rows to X instead of Y.
   */
  async bootstrapCompany(companyId: string): Promise<void> {
    await runAsSystemAsync(async () => {
      for (const name of BOOTSTRAP_ROLE_NAMES) {
        await this.prisma.roles.upsert({
          where: {
            company_id_guard_name_name: { company_id: BigInt(companyId), guard_name: 'api', name },
          },
          create: {
            company_id: BigInt(companyId),
            name,
            guard_name: 'api',
            created_at: new Date(),
            updated_at: new Date(),
          },
          update: {},
        });
      }
    });
  }

  /** Module 5.3's `OnboardingRolesLookup` — resolves a bootstrap role's id under `runAsSystemAsync` (no request context exists yet at onboarding time), scoped by an explicit `companyId` rather than ambient context. */
  async findRoleIdByCompanyAndName(companyId: string, name: string): Promise<string | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.roles.findFirst({
        where: { company_id: BigInt(companyId), name },
        select: { id: true },
      })
    );
    return row ? row.id.toString() : undefined;
  }

  /**
   * `verifyToken` steps 9-10 (`onboarding-verifytoken.md` §1.2) — the
   * *only* surviving permission-bootstrap mechanism (11.34's D-0080
   * resolution: exactly one, not both this and `CompanyObserver`'s
   * all-existing-modules grant). For each of the resolved plan's module
   * slugs: `admin`/`manager` get `all-{slug}`, `user` gets `none-{slug}`.
   * A full replace (matches Laravel's `syncPermissions()`), which is also
   * what makes this idempotent — re-running it for a second verifying
   * user in an already-bootstrapped company is a no-op once the set
   * matches. Deliberately does **not** touch `model_has_permissions`
   * (Laravel's own dual-write onto the user directly) — `resolveClaims()`
   * (D-0040) never reads that table, so duplicating permissions there
   * would be inert dead weight in this app, not a behavior to preserve.
   */
  async grantModulePermissionsToBootstrapRoles(
    companyId: string,
    moduleSlugs: string[]
  ): Promise<void> {
    await runAsSystemAsync(async () => {
      const allNames = moduleSlugs.map(slug => `all-${slug}`);
      const noneNames = moduleSlugs.map(slug => `none-${slug}`);
      for (const name of [...allNames, ...noneNames]) {
        await this.prisma.permissions.upsert({
          where: { name_guard_name: { name, guard_name: 'api' } },
          create: { name, guard_name: 'api', created_at: new Date(), updated_at: new Date() },
          update: {},
        });
      }

      const allRows = await this.prisma.permissions.findMany({
        where: { name: { in: allNames }, guard_name: 'api' },
      });
      const noneRows = await this.prisma.permissions.findMany({
        where: { name: { in: noneNames }, guard_name: 'api' },
      });

      for (const roleName of ['admin', 'manager']) {
        const role = await this.prisma.roles.findFirst({
          where: { company_id: BigInt(companyId), name: roleName },
        });
        if (!role) continue;
        await this.prisma.role_has_permissions.deleteMany({ where: { role_id: role.id } });
        if (allRows.length > 0) {
          await this.prisma.role_has_permissions.createMany({
            data: allRows.map(permission => ({ role_id: role.id, permission_id: permission.id })),
          });
        }
      }

      const userRole = await this.prisma.roles.findFirst({
        where: { company_id: BigInt(companyId), name: 'user' },
      });
      if (userRole) {
        await this.prisma.role_has_permissions.deleteMany({ where: { role_id: userRole.id } });
        if (noneRows.length > 0) {
          await this.prisma.role_has_permissions.createMany({
            data: noneRows.map(permission => ({
              role_id: userRole.id,
              permission_id: permission.id,
            })),
          });
        }
      }
    });
  }

  /** Idempotent — a retried onboarding pipeline (e.g. after a mid-pipeline failure) must not throw on `model_has_roles`' composite primary key. `parent`-ruled (`tenant-rules.ts`), no context wrapping needed. */
  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    const existing = await this.prisma.model_has_roles.findFirst({
      where: { role_id: BigInt(roleId), model_id: BigInt(userId), model_type: USER_MODEL_TYPE },
    });
    if (existing) return;
    await this.prisma.model_has_roles.create({
      data: { role_id: BigInt(roleId), model_id: BigInt(userId), model_type: USER_MODEL_TYPE },
    });
  }

  /** Module 5.3's lean company creation — no address/city/state/country/zip (onboarding has none of that, unlike the admin-facing `POST /companies`). `companies` is `none`-ruled, no context wrapping needed. */
  async createMinimal(name: string, email: string): Promise<Company> {
    const row = await this.prisma.companies.create({
      data: { name, email, created_at: new Date(), updated_at: new Date() },
    });
    return toCompany(row);
  }

  /**
   * D-0040 — `ClaimsResolver` implementation module 1.2 calls on every
   * token issuance. Runs pre-context (login/register/refresh have no
   * request context yet), so the `users` lookup uses `runAsSystemAsync`
   * (same reasoning as `AuthRepository`). `model_has_roles` and
   * `role_has_permissions` are `parent`-ruled — they pass through the
   * tenant-scoping extension unscoped regardless of context
   * (`tenant-rules.ts`), so no further wrapping is needed for them; we
   * trust the pivot rows structurally (looked up by this exact user's
   * id), not caller-supplied input.
   */
  async resolveClaims(userId: string): Promise<UserClaims> {
    const user = await runAsSystemAsync(() =>
      this.prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { company_id: true } })
    );

    const roleLinks = await this.prisma.model_has_roles.findMany({
      where: { model_type: USER_MODEL_TYPE, model_id: BigInt(userId) },
      include: { roles: { include: { role_has_permissions: { include: { permissions: true } } } } },
    });

    const roles = roleLinks.map(link => link.roles.name);
    const perms = new Set<string>();
    for (const link of roleLinks) {
      for (const rolePermission of link.roles.role_has_permissions) {
        perms.add(rolePermission.permissions.name);
      }
    }

    return {
      companyId: user?.company_id != null ? user.company_id.toString() : undefined,
      roles,
      perms: Array.from(perms),
    };
  }

  // -- Roles (RolePremissionController) -------------------------------------

  async findRoleById(roleId: string): Promise<Role | undefined> {
    const row = await this.prisma.roles.findUnique({ where: { id: BigInt(roleId) } });
    return row ? this.attachGrants(row) : undefined;
  }

  async findRolesByIds(roleIds: string[]): Promise<Role[]> {
    if (roleIds.length === 0) return [];
    const rows = await this.prisma.roles.findMany({
      where: { id: { in: roleIds.map(id => BigInt(id)) } },
    });
    return Promise.all(rows.map(row => this.attachGrants(row)));
  }

  /**
   * `RolePremissionController::getCompanyRoles`'s real `Role::with(['permissions', 'users'])`
   * eager load (D-0114) — no `where` needed, the tenant-scoping extension forces `company_id` from
   * the caller's own context. `model_has_roles` has no Prisma relation to `users` (a polymorphic
   * `model_id`, no FK modeled), so user rows are batch-resolved in a second query, same pattern as
   * D-0112's `devices.user`.
   */
  async findRolesForCompany(): Promise<CompanyRoleWithUsers[]> {
    const rows = await this.prisma.roles.findMany({
      include: {
        role_has_permissions: { include: { permissions: true } },
        model_has_roles: { where: { model_type: USER_MODEL_TYPE } },
      },
    });

    const userIds = [
      ...new Set(rows.flatMap(row => row.model_has_roles.map(link => link.model_id))),
    ];
    const userRows =
      userIds.length > 0
        ? await this.prisma.users.findMany({ where: { id: { in: userIds } } })
        : [];
    const usersById = new Map<string, Profile>(userRows.map(u => [u.id.toString(), toProfile(u)]));

    return rows.map(row => ({
      id: row.id.toString(),
      companyId: row.company_id.toString(),
      name: row.name,
      guardName: row.guard_name,
      displayName: row.display_name,
      description: row.description,
      createdBy: row.created_by === null ? null : row.created_by.toString(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      permissions: row.role_has_permissions.map(link => ({
        id: link.permissions.id.toString(),
        name: link.permissions.name,
        guardName: link.permissions.guard_name,
        createdAt: link.permissions.created_at,
        updatedAt: link.permissions.updated_at,
      })),
      users: row.model_has_roles
        .map(link => usersById.get(link.model_id.toString()))
        .filter((user): user is Profile => user !== undefined),
    }));
  }

  /** `model_has_roles` is `parent`-ruled (unscoped) — safe here since it's keyed on the exact target `userId`, never caller-supplied scope. */
  async findRoleIdsForUser(userId: string): Promise<string[]> {
    const links = await this.prisma.model_has_roles.findMany({
      where: { model_type: USER_MODEL_TYPE, model_id: BigInt(userId) },
      select: { role_id: true },
    });
    return links.map(link => link.role_id.toString());
  }

  async roleNameExists(name: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.roles.findFirst({
      where: excludeId ? { name, id: { not: BigInt(excludeId) } } : { name },
      select: { id: true },
    });
    return row !== null;
  }

  /** `RoleLookup` implementation module 1.4 depends on (D-0045). Scoped to the caller's own company automatically. */
  async findRoleIdByName(name: string): Promise<string | undefined> {
    const row = await this.prisma.roles.findFirst({ where: { name }, select: { id: true } });
    return row ? row.id.toString() : undefined;
  }

  async roleHasAssignedUsers(roleId: string): Promise<boolean> {
    const count = await this.prisma.model_has_roles.count({ where: { role_id: BigInt(roleId) } });
    return count > 0;
  }

  /**
   * `company_id` in `data` below is a required field on Prisma's generated
   * `rolesCreateInput` (the column is `NOT NULL`) but is structurally
   * unreachable at runtime — the tenant-scoping extension's `forceData`
   * always overwrites it from the caller's own context before the query
   * runs (proven by `tenant-scoping.integration.test.ts`'s "create() forces
   * the tenant key… ignoring whatever the caller supplies" case). `0n` is a
   * deliberate, honest placeholder, not a real value.
   */
  async createRole(input: CreateRoleInput): Promise<Role> {
    const row = await this.prisma.roles.create({
      data: {
        company_id: 0n,
        name: input.name,
        guard_name: 'api',
        description: input.description ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
    await this.syncModulesAndPermissions(row.id.toString(), input.moduleIds);
    return this.attachGrants(row);
  }

  async updateRole(roleId: string, input: UpdateRoleInput): Promise<Role> {
    const row = await this.prisma.roles.update({
      where: { id: BigInt(roleId) },
      data: { name: input.name, description: input.description ?? null, updated_at: new Date() },
    });
    await this.syncModulesAndPermissions(roleId, input.moduleIds);
    return this.attachGrants(row);
  }

  /** `module_role`/`role_has_permissions` are `parent`-ruled (unscoped) — safe: `roleId` is already tenant-verified by the service before this is called. */
  async deleteRole(roleId: string): Promise<void> {
    await this.prisma.role_has_permissions.deleteMany({ where: { role_id: BigInt(roleId) } });
    await this.prisma.module_role.deleteMany({ where: { role_id: BigInt(roleId) } });
    await this.prisma.roles.delete({ where: { id: BigInt(roleId) } });
  }

  async findUserSummary(userId: string): Promise<{ name: string | null } | undefined> {
    const row = await this.prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { first_name: true, last_name: true },
    });
    if (!row) return undefined;
    const name = `${row.first_name} ${row.last_name}`.trim();
    return { name: name || null };
  }

  /**
   * Ported from `RolePremissionController::syncModulesAndPermissions`:
   * replaces the role's module set and derives/ensures an `all-<slug>`
   * permission per module, then replaces the role's permission set to
   * match exactly (a full sync, not a merge — same as Laravel's
   * `syncPermissions()`).
   */
  private async syncModulesAndPermissions(roleId: string, moduleIds: string[]): Promise<void> {
    const modules =
      moduleIds.length > 0
        ? await this.prisma.modules.findMany({
            where: { id: { in: moduleIds.map(id => BigInt(id)) } },
          })
        : [];

    await this.prisma.module_role.deleteMany({ where: { role_id: BigInt(roleId) } });
    if (modules.length > 0) {
      await this.prisma.module_role.createMany({
        data: modules.map(module => ({
          role_id: BigInt(roleId),
          module_id: module.id,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      });
    }

    const permissionNames = modules.map(module => `all-${module.slug}`);
    for (const name of permissionNames) {
      await this.prisma.permissions.upsert({
        where: { name_guard_name: { name, guard_name: 'api' } },
        create: { name, guard_name: 'api', created_at: new Date(), updated_at: new Date() },
        update: {},
      });
    }

    const permissionRows =
      permissionNames.length > 0
        ? await this.prisma.permissions.findMany({
            where: { name: { in: permissionNames }, guard_name: 'api' },
          })
        : [];

    await this.prisma.role_has_permissions.deleteMany({ where: { role_id: BigInt(roleId) } });
    if (permissionRows.length > 0) {
      await this.prisma.role_has_permissions.createMany({
        data: permissionRows.map(permission => ({
          role_id: BigInt(roleId),
          permission_id: permission.id,
        })),
      });
    }
  }

  private async attachGrants(row: RoleRow): Promise<Role> {
    const moduleLinks = await this.prisma.module_role.findMany({
      where: { role_id: row.id },
      include: { modules: true },
    });
    const permissionLinks = await this.prisma.role_has_permissions.findMany({
      where: { role_id: row.id },
      include: { permissions: true },
    });
    return toRole(
      row,
      moduleLinks.map(link => link.modules),
      permissionLinks.map(link => link.permissions)
    );
  }

  // -- Modules (ModuleController::createModule / RolePremissionController::getAllModulesForAdmin) --

  async listModulesForAdmin(): Promise<ModuleCatalogEntry[]> {
    const rows = await this.prisma.modules.findMany({
      select: { id: true, code: true, slug: true },
    });
    return rows.map(toModuleCatalogEntry);
  }

  async moduleCodeExists(code: string): Promise<boolean> {
    const row = await this.prisma.modules.findFirst({ where: { code }, select: { id: true } });
    return row !== null;
  }

  async createModule(code: string): Promise<void> {
    const module = await this.prisma.modules.create({
      data: { code, slug: code, created_at: new Date(), updated_at: new Date() },
    });
    for (const suffix of ['all', 'none']) {
      const name = `${module.code}_${suffix}`;
      await this.prisma.permissions.upsert({
        where: { name_guard_name: { name, guard_name: 'api' } },
        create: { name, guard_name: 'api', created_at: new Date(), updated_at: new Date() },
        update: {},
      });
    }
  }

  /** Module 5.1's `ModulesLookup` — validates every id in `assign-modules`' payload is a real module before granting it to a plan. */
  async moduleIdsExist(moduleIds: string[]): Promise<boolean> {
    if (moduleIds.length === 0) return true;
    const uniqueIds = [...new Set(moduleIds)];
    const count = await this.prisma.modules.count({
      where: { id: { in: uniqueIds.map(id => BigInt(id)) } },
    });
    return count === uniqueIds.length;
  }

  // -- Permissions (RolePremissionController::deletePermission) -------------

  async findPermissionById(permissionId: string): Promise<Permission | undefined> {
    const row = await this.prisma.permissions.findUnique({ where: { id: BigInt(permissionId) } });
    return row ? toPermission(row) : undefined;
  }

  async deletePermission(permissionId: string): Promise<void> {
    await this.prisma.role_has_permissions.deleteMany({
      where: { permission_id: BigInt(permissionId) },
    });
    await this.prisma.model_has_permissions.deleteMany({
      where: { permission_id: BigInt(permissionId) },
    });
    await this.prisma.permissions.delete({ where: { id: BigInt(permissionId) } });
  }
}
