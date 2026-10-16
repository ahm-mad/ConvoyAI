import { randomBytes } from 'node:crypto';
import {
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../../platform/errors/app-error.js';
import { hashPassword } from '../../platform/auth/password.js';
import type { RoleLookup } from '../../platform/auth/role-lookup.js';
import type { CompanyLookup, LookedUpCompany } from '../../platform/auth/company-lookup.js';
import type { RolesWithPermissionsLookup } from '../../platform/auth/roles-with-permissions-lookup.js';
import { deleteObject, keyFromUrl, uploadObject } from '../../platform/storage/r2-storage.js';
import type { UsersRepository } from './users.repository.js';
import type {
  CreateMemberInput,
  ListMembersQuery,
  Member,
  Paginated,
  Profile,
  UpdateMemberInput,
  UpdateProfileInput,
} from './users.types.js';

export interface ProfileImageUpload {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Business logic for module 1.4 (ARCHITECTURE.md §2 — services never touch
 * Prisma directly). Validation messages match Laravel's custom ones
 * verbatim where they exist (D-0013); a few fall back to plain English
 * where Laravel's own `messages.php` is missing the translation key it
 * references (D-0045 — porting the literal untranslated key string, e.g.
 * `"messages.member_not_found"`, would be replicating an oversight, not a
 * deliberate contract).
 */
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly roleLookup: RoleLookup & CompanyLookup & RolesWithPermissionsLookup
  ) {}

  async getProfile(userId: string): Promise<Profile> {
    const profile = await this.usersRepository.findProfileById(userId);
    if (!profile) {
      throw new UnauthenticatedError('Unauthorized access.');
    }
    return profile;
  }

  /** D-0099: `/profile`'s real embedded `company` row, fetched separately from `getProfile` so callers that don't need it (e.g. `updateProfile`'s response) don't pay for it. */
  async getProfileCompany(companyId: string | null): Promise<LookedUpCompany | undefined> {
    if (!companyId) return undefined;
    return this.roleLookup.findCompanyById(companyId);
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    image: ProfileImageUpload | undefined
  ): Promise<Profile> {
    if (await this.usersRepository.emailTakenByAnotherUser(input.email, userId)) {
      throw new ValidationError('The email address is already registered to another user.', {
        email: ['The email address is already registered to another user.'],
      });
    }

    let profileImage: string | undefined;
    if (image) {
      const current = await this.usersRepository.findProfileById(userId);
      if (current?.profileImage) {
        const oldKey = keyFromUrl(current.profileImage);
        if (oldKey) {
          await deleteObject(oldKey);
        }
      }
      const uploaded = await uploadObject({ prefix: 'profile-images', ...image });
      profileImage = uploaded.url;
    }

    return this.usersRepository.updateProfile(userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      number: input.number,
      ...(profileImage !== undefined ? { profileImage } : {}),
    });
  }

  /** `Member::with('user.roles')` (D-0111) — roles come from the cross-module `RolesWithPermissionsLookup` (same interface `/login` depends on), the repository has no access to them. */
  private async withRoles(member: Member): Promise<Member> {
    const roles = await this.roleLookup.findRolesWithPermissionsForUser(member.userId);
    return { ...member, user: { ...member.user, roles } };
  }

  async listMembers(query: ListMembersQuery): Promise<Paginated<Member>> {
    const result = await this.usersRepository.listMembers(query);
    return {
      ...result,
      items: await Promise.all(result.items.map(member => this.withRoles(member))),
    };
  }

  async getMember(id: string): Promise<Member> {
    const member = await this.usersRepository.findMemberById(id);
    if (!member) {
      throw new NotFoundError('Member not found.');
    }
    return this.withRoles(member);
  }

  /** Ported from `MemberController::store` — a random password when none is supplied, matches Laravel's `Str::random(10)`. */
  async createMember(input: CreateMemberInput, createdByUserId: string): Promise<void> {
    if (await this.usersRepository.emailExists(input.email)) {
      throw new ValidationError('The email has already been taken.', {
        email: ['The email has already been taken.'],
      });
    }

    const roleId = await this.roleLookup.findRoleIdByName(input.role);
    if (!roleId) {
      throw new NotFoundError('Role does not exist for this company.');
    }

    const password = input.password ?? randomBytes(8).toString('hex');
    const passwordHash = await hashPassword(password);

    await this.usersRepository.createMember(input, passwordHash, roleId, createdByUserId);
  }

  async updateMember(id: string, input: UpdateMemberInput): Promise<void> {
    await this.getMember(id); // 404s if missing/cross-tenant, matches Laravel's implicit route-model binding
    await this.usersRepository.updateMember(id, input);
  }

  /** Matches `MemberController::destroy` — returns the counts it reported, deleted/not_deleted. */
  async bulkDeleteMembers(
    ids: string[]
  ): Promise<{ deletedCount: number; notDeletedCount: number }> {
    const members = await Promise.all(ids.map(id => this.usersRepository.findMemberById(id)));
    const found = members.filter((member): member is Member => member !== undefined);

    if (found.length === 0) {
      throw new NotFoundError('No valid members found');
    }

    const deletedCount = await this.usersRepository.bulkDeleteMembersByUserIds(
      found.map(member => member.userId)
    );
    return { deletedCount, notDeletedCount: found.length - deletedCount };
  }
}
