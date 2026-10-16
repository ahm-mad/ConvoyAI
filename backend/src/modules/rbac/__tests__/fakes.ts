import type { RbacRepository } from '../rbac.repository.js';
import type {
  RbacCompanyAssetsLookup,
  RbacCompanyDevicesLookup,
  RbacCompanyProductsLookup,
  RbacCompanyUsersLookup,
  RbacPlansLookup,
  RbacSubscriptionsLookup,
} from '../rbac.service.js';
import type {
  Company,
  CompanyAssetRow,
  CompanyProductRow,
  CompanyUserRow,
  CreateCompanyInput,
  CreateRoleInput,
  ListCompaniesQuery,
  ModuleCatalogEntry,
  Permission,
  Role,
  UpdateCompanyInput,
  UpdateRoleInput,
} from '../rbac.types.js';

let nextId = 1;

interface FakeState {
  companies: Map<string, Company>;
  roles: Map<string, Role>;
  modules: Map<string, ModuleCatalogEntry>;
  permissions: Map<string, Permission>;
  userRoleLinks: Map<string, string[]>;
  userNames: Map<string, string>;
  bootstrappedCompanyIds: string[];
}

/** In-memory stand-in for `RbacRepository` — module 1.3's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeRbacRepository(
  seedCompanies: Company[] = [],
  seedModules: ModuleCatalogEntry[] = []
): { repository: RbacRepository; state: FakeState } {
  const state: FakeState = {
    companies: new Map(seedCompanies.map(c => [c.id, c])),
    roles: new Map(),
    modules: new Map(seedModules.map(m => [m.id, m])),
    permissions: new Map(),
    userRoleLinks: new Map(),
    userNames: new Map(),
    bootstrappedCompanyIds: [],
  };

  const repo = {
    // -- Companies --
    list: (query: ListCompaniesQuery) => {
      let items = [...state.companies.values()];
      const search = query.search;
      if (search) {
        items = items.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
      }
      const total = items.length;
      const start = (query.page - 1) * query.perPage;
      const page = items.slice(start, start + query.perPage);
      return Promise.resolve({
        items: page,
        pagination: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      });
    },
    findById: (id: string) => Promise.resolve(state.companies.get(id)),
    findByName: (name: string, excludeId?: string) =>
      Promise.resolve(
        [...state.companies.values()].find(c => c.name === name && c.id !== excludeId)
      ),
    findByEmail: (email: string, excludeId?: string) =>
      Promise.resolve(
        [...state.companies.values()].find(c => c.email === email && c.id !== excludeId)
      ),
    create: (input: CreateCompanyInput) => {
      const now = new Date();
      const company: Company = {
        id: String(nextId++),
        createdAt: now,
        updatedAt: now,
        ...input,
        currency: input.currency ?? 'USD',
      };
      state.companies.set(company.id, company);
      return Promise.resolve(company);
    },
    update: (id: string, input: UpdateCompanyInput) => {
      const existing = state.companies.get(id);
      if (!existing) throw new Error('not found');
      const updated: Company = {
        ...existing,
        ...input,
        currency: input.currency ?? existing.currency,
        updatedAt: new Date(),
      };
      state.companies.set(id, updated);
      return Promise.resolve(updated);
    },
    delete: (id: string) => {
      state.companies.delete(id);
      return Promise.resolve();
    },
    bulkDelete: (ids: string[]) => {
      for (const id of ids) state.companies.delete(id);
      return Promise.resolve();
    },
    findExistingIds: (ids: string[]) => Promise.resolve(ids.filter(id => state.companies.has(id))),
    bootstrapCompany: (companyId: string) => {
      state.bootstrappedCompanyIds.push(companyId);
      return Promise.resolve();
    },
    resolveClaims: () => Promise.resolve({ companyId: undefined, roles: [], perms: [] }),

    // -- Roles --
    findRoleById: (roleId: string) => Promise.resolve(state.roles.get(roleId)),
    findRolesByIds: (roleIds: string[]) =>
      Promise.resolve(
        roleIds.map(id => state.roles.get(id)).filter((r): r is Role => r !== undefined)
      ),
    findRolesForCompany: () =>
      Promise.resolve(
        [...state.roles.values()].map(role => ({
          ...role,
          displayName: null,
          createdBy: null,
          createdAt: null,
          updatedAt: null,
          permissions: role.permissions.map(p => ({
            id: p.id,
            name: p.name,
            guardName: 'api',
            createdAt: null,
            updatedAt: null,
          })),
          users: [],
        }))
      ),
    findRoleIdsForUser: (userId: string) => Promise.resolve(state.userRoleLinks.get(userId) ?? []),
    roleNameExists: (name: string, excludeId?: string) =>
      Promise.resolve([...state.roles.values()].some(r => r.name === name && r.id !== excludeId)),
    roleHasAssignedUsers: (roleId: string) =>
      Promise.resolve([...state.userRoleLinks.values()].some(ids => ids.includes(roleId))),
    createRole: (input: CreateRoleInput) => {
      const role: Role = {
        id: String(nextId++),
        companyId: '1',
        name: input.name,
        guardName: 'api',
        description: input.description ?? null,
        modules: input.moduleIds.map(id => {
          const m = state.modules.get(id);
          return { id, code: m?.code ?? '', slug: m?.slug ?? '' };
        }),
        permissions: input.moduleIds.map(id => ({
          id: `perm-${id}`,
          name: `all-${state.modules.get(id)?.slug ?? id}`,
        })),
      };
      state.roles.set(role.id, role);
      return Promise.resolve(role);
    },
    updateRole: (roleId: string, input: UpdateRoleInput) => {
      const existing = state.roles.get(roleId);
      if (!existing) throw new Error('not found');
      const updated: Role = {
        ...existing,
        name: input.name,
        description: input.description ?? null,
        modules: input.moduleIds.map(id => {
          const m = state.modules.get(id);
          return { id, code: m?.code ?? '', slug: m?.slug ?? '' };
        }),
      };
      state.roles.set(roleId, updated);
      return Promise.resolve(updated);
    },
    deleteRole: (roleId: string) => {
      state.roles.delete(roleId);
      return Promise.resolve();
    },
    findUserSummary: (userId: string) => {
      const name = state.userNames.get(userId);
      return Promise.resolve(name !== undefined ? { name } : undefined);
    },

    // -- Modules --
    listModulesForAdmin: () => Promise.resolve([...state.modules.values()]),
    moduleCodeExists: (code: string) =>
      Promise.resolve([...state.modules.values()].some(m => m.code === code)),
    createModule: (code: string) => {
      const module: ModuleCatalogEntry = { id: String(nextId++), code, slug: code };
      state.modules.set(module.id, module);
      return Promise.resolve();
    },

    // -- Permissions --
    findPermissionById: (permissionId: string) =>
      Promise.resolve(state.permissions.get(permissionId)),
    deletePermission: (permissionId: string) => {
      state.permissions.delete(permissionId);
      return Promise.resolve();
    },

    // -- D-0098/D-0100: RolesWithPermissionsLookup (empty by default — module 1.2/1.3's own dedicated tests exercise real content) --
    findRolesWithPermissionsForUser: () => Promise.resolve([]),
  };

  return { repository: repo as unknown as RbacRepository, state };
}

/** In-memory stand-in for the `RbacSubscriptionsLookup` cross-module interface (`SubscriptionsRepository` in production) — `GET /modules/user/{userId}` (D-0086). */
export function fakeSubscriptionsLookup(
  activeByUserId: Record<string, { stripePrice: string | null }> = {}
): RbacSubscriptionsLookup {
  return {
    findActiveForUser: (userId: string) => Promise.resolve(activeByUserId[userId]),
  };
}

/** In-memory stand-in for the `RbacPlansLookup` cross-module interface (`PlansRepository` in production). */
export function fakePlansLookup(
  byStripePlan: Record<string, { modules: { code: string; permissions: string[] }[] }> = {}
): RbacPlansLookup {
  return {
    findByStripePlan: (stripePlan: string) => Promise.resolve(byStripePlan[stripePlan]),
  };
}

/** D-0100: in-memory stand-ins for `GET /companies`'s 4 cross-module lookups — empty by default, keyed by `companyId` for tests that need real content. */
export function fakeCompanyUsersLookup(
  byCompanyId: Record<string, CompanyUserRow[]> = {}
): RbacCompanyUsersLookup {
  return {
    findAllForCompany: (companyId: string) => Promise.resolve(byCompanyId[companyId] ?? []),
    countForCompany: (companyId: string) => Promise.resolve((byCompanyId[companyId] ?? []).length),
  };
}

export function fakeCompanyAssetsLookup(
  byCompanyId: Record<string, CompanyAssetRow[]> = {}
): RbacCompanyAssetsLookup {
  return {
    findAllForCompany: (companyId: string) => Promise.resolve(byCompanyId[companyId] ?? []),
    countForCompany: (companyId: string) => Promise.resolve((byCompanyId[companyId] ?? []).length),
  };
}

export function fakeCompanyProductsLookup(
  byCompanyId: Record<string, CompanyProductRow[]> = {}
): RbacCompanyProductsLookup {
  return {
    findAllForCompanyExact: (companyId: string) => Promise.resolve(byCompanyId[companyId] ?? []),
    countForCompanyExact: (companyId: string) =>
      Promise.resolve((byCompanyId[companyId] ?? []).length),
  };
}

export function fakeCompanyDevicesLookup(count = 0): RbacCompanyDevicesLookup {
  return { countForUserIds: () => Promise.resolve(count) };
}
