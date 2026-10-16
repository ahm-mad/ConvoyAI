import { vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { AuthRepository } from '../auth.repository.js';
import type { AuthUser, RegisterInput, SocialProvider } from '../auth.types.js';
import type { ClaimsResolver } from '../../../platform/auth/claims-resolver.js';
import type { CompanyLookup, LookedUpCompany } from '../../../platform/auth/company-lookup.js';
import type {
  LookedUpRole,
  RolesWithPermissionsLookup,
} from '../../../platform/auth/roles-with-permissions-lookup.js';

let nextId = 1;

/**
 * In-memory stand-in for `AuthRepository` — shared across module 1.2's
 * unit tests. No Prisma/DB touched (CONVENTIONS.md "Tests": unit tests,
 * no network/DB); a real Postgres integration test comes later once
 * `docker-compose` is up (see `tasks/02-auth.md`'s Next actions).
 */
export function fakeAuthRepository(seedUsers: AuthUser[] = []): AuthRepository {
  const users = new Map<string, AuthUser>(seedUsers.map(u => [u.id, u]));
  const resetTokens = new Map<string, { tokenHash: string; createdAt: Date | null }>();
  const socialAccounts = new Map<string, { provider: SocialProvider; providerId: string }>();

  const repo = {
    findByEmail: (email: string) =>
      Promise.resolve([...users.values()].find(u => u.email === email)),
    findById: (id: string) => Promise.resolve(users.get(id)),
    findBySocialAccount: (provider: SocialProvider, providerId: string) =>
      Promise.resolve(
        [...users.values()].find(
          u =>
            socialAccounts.get(u.id)?.provider === provider &&
            socialAccounts.get(u.id)?.providerId === providerId
        )
      ),
    createUser: (input: RegisterInput, passwordHash: string) => {
      const user: AuthUser = {
        id: String(nextId++),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        number: input.number,
        companyId: null,
        status: 'active',
        emailVerifiedAt: null,
        passwordHash,
        socialProvider: null,
      };
      users.set(user.id, user);
      return Promise.resolve(user);
    },
    createSocialUser: (params: {
      firstName: string;
      lastName: string;
      email: string;
      provider: SocialProvider;
      providerId: string;
      passwordHash: string;
    }) => {
      const user: AuthUser = {
        id: String(nextId++),
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        number: '',
        companyId: null,
        status: 'active',
        emailVerifiedAt: new Date(),
        passwordHash: params.passwordHash,
        socialProvider: params.provider,
      };
      users.set(user.id, user);
      socialAccounts.set(user.id, { provider: params.provider, providerId: params.providerId });
      return Promise.resolve(user);
    },
    linkSocialAccount: (user: AuthUser, provider: SocialProvider, providerId: string) => {
      socialAccounts.set(user.id, { provider, providerId });
      const existing = users.get(user.id);
      if (existing) {
        users.set(user.id, {
          ...existing,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        });
      }
      return Promise.resolve();
    },
    updatePassword: (userId: string, passwordHash: string) => {
      const existing = users.get(userId);
      if (existing) {
        users.set(userId, { ...existing, passwordHash });
      }
      return Promise.resolve();
    },
    upsertPasswordResetToken: (email: string, tokenHash: string) => {
      resetTokens.set(email, { tokenHash, createdAt: new Date() });
      return Promise.resolve();
    },
    findPasswordResetToken: (email: string) => Promise.resolve(resetTokens.get(email)),
    deletePasswordResetToken: (email: string) => {
      resetTokens.delete(email);
      return Promise.resolve();
    },
  };

  return repo as unknown as AuthRepository;
}

/**
 * D-0040/D-0098: always-empty claims + no company/roles by default —
 * sufficient for most of module 1.2's own tests. Pass `overrides` to
 * exercise `/login`'s enrichment (company/roles) in the tests that need it.
 */
export function fakeClaimsResolver(
  overrides: { company?: LookedUpCompany; roles?: LookedUpRole[] } = {}
): ClaimsResolver & CompanyLookup & RolesWithPermissionsLookup {
  return {
    resolveClaims: () => Promise.resolve({ companyId: undefined, roles: [], perms: [] }),
    findCompanyById: () => Promise.resolve(overrides.company),
    findRolesWithPermissionsForUser: () => Promise.resolve(overrides.roles ?? []),
  };
}

export function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
  } as unknown as Redis;
  return { redis, store };
}
