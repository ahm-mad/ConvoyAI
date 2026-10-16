import type { members as MemberRow, users as UserRow } from '@prisma/client';
import type { LookedUpCompany } from '../../platform/auth/company-lookup.js';
import { toEagerLoadedCompanyResponse } from '../../shared/utils/company-response.js';
import { toCompanyEmbeddedUserResponse, toCompanyRoleResponse } from '../rbac/rbac.mapper.js';
import type { Member, MemberUserRef, Profile } from './users.types.js';

/** Prisma row -> domain DTO. `id`/`company_id` are BigInt in Postgres — stringified once, here (same pattern as `auth.mapper.ts`). */
export function toProfile(row: UserRow): Profile {
  return {
    id: row.id.toString(),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    number: row.number,
    companyId: row.company_id === null ? null : row.company_id.toString(),
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    profileImage: row.profile_image,
    timezone: row.timezone,
    companyDomain: row.company_domain,
    socialProvider: row.social_provider,
    socialProviderId: row.social_provider_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stripeId: row.stripe_id,
    pmType: row.pm_type,
    pmLastFour: row.pm_last_four,
    trialEndsAt: row.trial_ends_at,
  };
}

/** Domain DTO -> the frozen, lean `User` API shape (D-0030's precedent). Used where the caller doesn't need `/profile`'s fuller D-0099 shape (e.g. member responses' embedded user ref). */
export function toProfileUserResponse(profile: Profile) {
  return {
    id: Number(profile.id),
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: profile.email,
    number: profile.number,
    company_id: profile.companyId === null ? null : Number(profile.companyId),
    status: profile.status,
    email_verified_at: profile.emailVerifiedAt ? profile.emailVerifiedAt.toISOString() : null,
  };
}

/**
 * `GET /profile`'s real raw-column response (D-0099 revisits D-0030/D-0045
 * — every `users` column Laravel doesn't `$hidden`, plus the `company`
 * eager load). `updateProfile`'s response stays on the lean
 * `toProfileUserResponse` above — only `GET /profile` was asked to match.
 */
export function toFullProfileUserResponse(profile: Profile, company: LookedUpCompany | undefined) {
  return {
    ...toProfileUserResponse(profile),
    timezone: profile.timezone,
    profile_image: profile.profileImage,
    company_domain: profile.companyDomain,
    social_provider: profile.socialProvider,
    social_provider_id: profile.socialProviderId,
    created_at: profile.createdAt ? profile.createdAt.toISOString() : null,
    updated_at: profile.updatedAt ? profile.updatedAt.toISOString() : null,
    company: toEagerLoadedCompanyResponse(company),
  };
}

/** `roles` is populated by the service layer (`UsersService`'s own `RolesWithPermissionsLookup` dependency) — the repository has no cross-module access, so it's always `[]` straight out of `toMember`. */
function toMemberUserRef(row: UserRow): MemberUserRef {
  return { ...toProfile(row), roles: [] };
}

export function toMember(row: MemberRow & { users: UserRow }): Member {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    companyId: row.company_id.toString(),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: toMemberUserRef(row.users),
  };
}

/** `MemberController::index()`'s real `Member::with('user.roles')` shape (D-0111) — full raw `users` row + `roles` (Spatie shape incl. `guard_name`/`pivot`, no nested `permissions` — matches `GET /companies/{id}`'s own `users.roles`, not `/login`'s trimmed `roles.permissions`). */
export function toMemberResponse(member: Member) {
  return {
    id: Number(member.id),
    user_id: Number(member.userId),
    name: member.name,
    address: member.address,
    city: member.city,
    state: member.state,
    country: member.country,
    company_id: Number(member.companyId),
    created_by: member.createdBy,
    created_at: member.createdAt ? member.createdAt.toISOString() : null,
    updated_at: member.updatedAt ? member.updatedAt.toISOString() : null,
    user: {
      ...toCompanyEmbeddedUserResponse(member.user),
      roles: member.user.roles.map(role => toCompanyRoleResponse(role, member.user.id)),
    },
  };
}
