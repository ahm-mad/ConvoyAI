import type { LookedUpCompany } from '../../platform/auth/company-lookup.js';
import type { LookedUpRole } from '../../platform/auth/roles-with-permissions-lookup.js';

/**
 * Domain types for module 1.2 (auth). `AuthUser`'s base shape was
 * deliberately lean (D-0030); `/login`'s `company`/`roles` eager-load and
 * computed fields are modeled separately below as `LoginEnrichment`
 * (D-0098 revisits D-0030 now that the blocking modules exist). `products`/
 * `raw_packet_values`/`member`/`activeSubscription` remain out of scope —
 * not requested.
 */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  number: string;
  companyId: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  /** D-0098 — `/login`'s real `select('id','email','social_provider','company_id')` base columns include this; Node's lean base shape never carried it forward. */
  socialProvider: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * `/login`'s real eager-load enrichment (D-0098 revisits D-0030): company
 * row, roles-with-permissions, and the two computed fields Laravel derives
 * inline (`companyInfo`, `role_type`). Kept as a distinct shape from
 * `AuthUser` since it's response-shaping data, not part of the user's own
 * identity.
 */
export interface LoginEnrichment {
  company: LookedUpCompany | undefined;
  roles: LookedUpRole[];
  companyInfo: boolean;
  roleType: string | null;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  number: string;
  password: string;
  timezone: string;
}

export type SocialProvider = 'google' | 'github';

export interface SocialProfile {
  provider: SocialProvider;
  providerId: string;
  email: string | undefined;
  name: string | undefined;
}
