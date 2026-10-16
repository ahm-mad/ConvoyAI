import type { LookedUpRole } from '../../platform/auth/roles-with-permissions-lookup.js';

/**
 * Domain types for module 1.4 (users-members). `GET /members` matches
 * Laravel's real `Member::with('user.roles')` eager load exactly (D-0111) —
 * `MemberUserRef` is the full raw `users` row (reuses every field `Profile`
 * already captures) plus `roles` (via `RolesWithPermissionsLookup`, same
 * cross-module interface `/login` already depends on, just without the
 * nested `permissions` rendered in the response — matches
 * `GET /companies/{id}`'s own `users.roles` shape, D-0100).
 */
export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  number: string;
  companyId: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  profileImage: string | null;
  /** D-0099 revisits D-0030/D-0045's lean shape — `/profile`'s real response includes every raw `users` column (none are `$hidden` besides password/remember_token). */
  timezone: string | null;
  companyDomain: string | null;
  socialProvider: string | null;
  socialProviderId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  stripeId: string | null;
  pmType: string | null;
  pmLastFour: string | null;
  trialEndsAt: Date | null;
}

export interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  number: string;
}

export interface MemberUserRef extends Profile {
  roles: LookedUpRole[];
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  companyId: string;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  user: MemberUserRef;
}

export interface CreateMemberInput {
  firstName: string;
  lastName: string;
  number: string;
  email: string;
  address: string | undefined;
  city: string | undefined;
  state: string | undefined;
  country: string | undefined;
  role: string;
  password: string | undefined;
}

export interface UpdateMemberInput {
  name: string;
  address: string | undefined;
  city: string | undefined;
  state: string | undefined;
  country: string | undefined;
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

export interface ListMembersQuery {
  search?: string | undefined;
  page: number;
  perPage: number;
}
