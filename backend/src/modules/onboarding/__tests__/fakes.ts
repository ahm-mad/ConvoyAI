import type {
  OnboardingCompaniesLookup,
  OnboardingPlansLookup,
  OnboardingRolesLookup,
  OnboardingSubscriptionsProvisioner,
  OnboardingUsersLookup,
} from '../onboarding.service.js';
import type { OnboardingPlanModule } from '../onboarding.types.js';

interface FakeUser {
  id: string;
  firstName?: string;
  email: string;
  emailVerifiedAt: Date | null;
}

let nextId = 1000;
const newId = () => String(nextId++);

/** In-memory stand-in for `AuthRepository` (module 1.2), scoped to what module 5.3 needs. */
export function fakeUsersLookup(seedUsers: FakeUser[] = []): {
  lookup: OnboardingUsersLookup;
  state: { users: Map<string, FakeUser> };
} {
  const state = { users: new Map(seedUsers.map(u => [u.id, u])) };
  const lookup: OnboardingUsersLookup = {
    findById: (id: string) => {
      const user = state.users.get(id);
      return Promise.resolve(user ? { ...user, firstName: user.firstName ?? 'Test' } : undefined);
    },
    markVerifiedAndAssignCompany: (
      userId: string,
      _companyId: string,
      _companyDomain: string | null
    ) => {
      const user = state.users.get(userId);
      if (user) state.users.set(userId, { ...user, emailVerifiedAt: new Date() });
      return Promise.resolve();
    },
  };
  return { lookup, state };
}

interface FakeCompany {
  id: string;
  name: string;
  email: string;
}

/** In-memory stand-in for `RbacRepository`'s companies half. */
export function fakeCompaniesLookup(seedCompanies: FakeCompany[] = []): {
  lookup: OnboardingCompaniesLookup;
  state: { companies: Map<string, FakeCompany> };
} {
  const state = { companies: new Map(seedCompanies.map(c => [c.id, c])) };
  const lookup: OnboardingCompaniesLookup = {
    findByName: (name: string) =>
      Promise.resolve([...state.companies.values()].find(c => c.name === name)),
    createMinimal: (name: string, email: string) => {
      const company: FakeCompany = { id: newId(), name, email };
      state.companies.set(company.id, company);
      return Promise.resolve(company);
    },
  };
  return { lookup, state };
}

/** In-memory stand-in for `RbacRepository`'s role/permission-bootstrap half. */
export function fakeRolesLookup(): {
  lookup: OnboardingRolesLookup;
  state: {
    bootstrappedCompanyIds: string[];
    grantedPermissions: { companyId: string; moduleSlugs: string[] }[];
    roleIdsByCompanyAndName: Map<string, string>;
    assignedRoles: { userId: string; roleId: string }[];
  };
} {
  const state = {
    bootstrappedCompanyIds: [] as string[],
    grantedPermissions: [] as { companyId: string; moduleSlugs: string[] }[],
    roleIdsByCompanyAndName: new Map<string, string>(),
    assignedRoles: [] as { userId: string; roleId: string }[],
  };
  const lookup: OnboardingRolesLookup = {
    bootstrapCompany: (companyId: string) => {
      state.bootstrappedCompanyIds.push(companyId);
      state.roleIdsByCompanyAndName.set(`${companyId}:admin`, `role-admin-${companyId}`);
      state.roleIdsByCompanyAndName.set(`${companyId}:manager`, `role-manager-${companyId}`);
      state.roleIdsByCompanyAndName.set(`${companyId}:user`, `role-user-${companyId}`);
      return Promise.resolve();
    },
    grantModulePermissionsToBootstrapRoles: (companyId: string, moduleSlugs: string[]) => {
      state.grantedPermissions.push({ companyId, moduleSlugs });
      return Promise.resolve();
    },
    findRoleIdByCompanyAndName: (companyId: string, name: string) =>
      Promise.resolve(state.roleIdsByCompanyAndName.get(`${companyId}:${name}`)),
    assignRoleToUser: (userId: string, roleId: string) => {
      state.assignedRoles.push({ userId, roleId });
      return Promise.resolve();
    },
  };
  return { lookup, state };
}

/** In-memory stand-in for `PlansRepository`'s `findByStripePlan`. */
export function fakePlansLookup(
  byStripePlan: Record<string, { modules: OnboardingPlanModule[] }> = {}
): OnboardingPlansLookup {
  return {
    findByStripePlan: (stripePlan: string) => Promise.resolve(byStripePlan[stripePlan]),
  };
}

/** In-memory stand-in for `SubscriptionsService`. */
export function fakeSubscriptionsProvisioner(): {
  provisioner: OnboardingSubscriptionsProvisioner;
  state: { calls: number };
} {
  const state = { calls: 0 };
  const provisioner: OnboardingSubscriptionsProvisioner = {
    ensurePlaceholderSubscription: () => {
      state.calls += 1;
      return Promise.resolve({ id: 'sub-1' });
    },
  };
  return { provisioner, state };
}
