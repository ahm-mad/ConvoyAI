import type { RoleLookup } from '../../../platform/auth/role-lookup.js';
import type { CompanyLookup, LookedUpCompany } from '../../../platform/auth/company-lookup.js';
import type {
  LookedUpRole,
  RolesWithPermissionsLookup,
} from '../../../platform/auth/roles-with-permissions-lookup.js';
import type { UsersRepository } from '../users.repository.js';
import type {
  CreateMemberInput,
  ListMembersQuery,
  Member,
  Profile,
  UpdateMemberInput,
} from '../users.types.js';

let nextId = 1;

interface FakeState {
  profiles: Map<string, Profile>;
  members: Map<string, Member>;
  roleIdsByName: Map<string, string>;
}

/** In-memory stand-in for `UsersRepository` — module 1.4's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeUsersRepository(
  seedProfiles: Profile[] = [],
  seedMembers: Member[] = []
): { repository: UsersRepository; state: FakeState } {
  const state: FakeState = {
    profiles: new Map(seedProfiles.map(p => [p.id, p])),
    members: new Map(seedMembers.map(m => [m.id, m])),
    roleIdsByName: new Map(),
  };

  const repo = {
    findProfileById: (userId: string) => Promise.resolve(state.profiles.get(userId)),
    updateProfile: (
      userId: string,
      input: {
        firstName: string;
        lastName: string;
        email: string;
        number: string;
        profileImage?: string | null;
      }
    ) => {
      const existing = state.profiles.get(userId);
      if (!existing) throw new Error('not found');
      const updated: Profile = {
        ...existing,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        number: input.number,
        ...(input.profileImage !== undefined ? { profileImage: input.profileImage } : {}),
      };
      state.profiles.set(userId, updated);
      return Promise.resolve(updated);
    },
    emailTakenByAnotherUser: (email: string, excludeUserId: string) =>
      Promise.resolve(
        [...state.profiles.values()].some(p => p.email === email && p.id !== excludeUserId)
      ),
    emailExists: (email: string) =>
      Promise.resolve([...state.profiles.values()].some(p => p.email === email)),

    listMembers: (query: ListMembersQuery) => {
      let items = [...state.members.values()];
      const search = query.search;
      if (search) {
        items = items.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
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
    findMemberById: (id: string) => Promise.resolve(state.members.get(id)),
    createMember: (
      input: CreateMemberInput,
      _passwordHash: string,
      _roleId: string,
      _createdByUserId: string
    ) => {
      const userId = String(nextId++);
      const memberId = String(nextId++);
      const profile: Profile = {
        id: userId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        number: input.number,
        companyId: '1',
        status: 'Active',
        emailVerifiedAt: new Date(),
        profileImage: null,
        timezone: null,
        companyDomain: null,
        socialProvider: null,
        socialProviderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        stripeId: null,
        pmType: null,
        pmLastFour: null,
        trialEndsAt: null,
      };
      state.profiles.set(userId, profile);
      const member: Member = {
        id: memberId,
        userId,
        name: `${input.firstName} ${input.lastName}`,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
        companyId: '1',
        createdBy: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { ...profile, roles: [] },
      };
      state.members.set(memberId, member);
      return Promise.resolve(member);
    },
    updateMember: (id: string, input: UpdateMemberInput) => {
      const existing = state.members.get(id);
      if (!existing) throw new Error('not found');
      const updated: Member = {
        ...existing,
        name: input.name,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
      };
      state.members.set(id, updated);
      return Promise.resolve(updated);
    },
    bulkDeleteMembersByUserIds: (userIds: string[]) => {
      let count = 0;
      for (const [memberId, member] of state.members) {
        if (userIds.includes(member.userId)) {
          state.members.delete(memberId);
          state.profiles.delete(member.userId);
          count += 1;
        }
      }
      return Promise.resolve(count);
    },
  };

  return { repository: repo as unknown as UsersRepository, state };
}

/** D-0099: `companiesById` lets tests exercise `/profile`'s embedded `company` — empty by default (no company found, same as an unregistered id). `rolesByUserId` (D-0111): empty by default — no roles unless a test seeds them. */
export function fakeRoleLookup(
  roleIdsByName: Record<string, string> = {},
  companiesById: Record<string, LookedUpCompany> = {},
  rolesByUserId: Record<string, LookedUpRole[]> = {}
): RoleLookup & CompanyLookup & RolesWithPermissionsLookup {
  return {
    findRoleIdByName: (name: string) => Promise.resolve(roleIdsByName[name]),
    findCompanyById: (companyId: string) => Promise.resolve(companiesById[companyId]),
    findRolesWithPermissionsForUser: (userId: string) =>
      Promise.resolve(rolesByUserId[userId] ?? []),
  };
}
