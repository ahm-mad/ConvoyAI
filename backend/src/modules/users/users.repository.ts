import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toMember, toProfile } from './users.mapper.js';
import type {
  CreateMemberInput,
  ListMembersQuery,
  Member,
  Paginated,
  Profile,
  UpdateMemberInput,
} from './users.types.js';

/** Same morph-type constant as `RbacRepository` — see its doc comment (D-0040) for why it's the literal FQCN. */
const USER_MODEL_TYPE = 'App\\Domain\\Auth\\Models\\User';

/**
 * All Prisma access for module 1.4 (ARCHITECTURE.md §2). `members` is
 * `company`-ruled and every members-management query here runs under the
 * caller's own real request context (the tenant-scoping extension does the
 * work). `users` is also `company`-ruled, but the profile methods below
 * deliberately use `runAsSystemAsync` instead — see their doc comment.
 */
export class UsersRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // -- Profile (AuthController::profile / updateUserProfile) --------------

  /**
   * `runAsSystemAsync`, not the caller's own context: `userId` is always
   * `Auth::id()` from the controller (self-only, enforced there) — the
   * security boundary here is *that* check, not company scoping. Using the
   * real (company-scoped) context would throw for a user who hasn't joined
   * a company yet (`company_id: null` right after `register()`, before
   * onboarding/5.3 runs) — such a user must still be able to view/edit
   * their own profile.
   */
  async findProfileById(userId: string): Promise<Profile | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    );
    return row ? toProfile(row) : undefined;
  }

  /**
   * Module 2.5 (rules) cross-module lookup — the rule-actions worker (no
   * HTTP request/company context) needs a rule owner's/device owner's
   * email, phone, name, and `timezone` (used by `RuleBuilderController`'s
   * timestamp formatting, `rule-engine.md` — not on `Profile`, which is
   * the lean self-service DTO for module 1.4's own endpoints). Same
   * `runAsSystemAsync` reasoning as `findProfileById`.
   */
  async findContactById(userId: string): Promise<
    | {
        id: string;
        email: string;
        number: string;
        firstName: string;
        lastName: string;
        timezone: string | null;
      }
    | undefined
  > {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    );
    if (!row) return undefined;
    return {
      id: row.id.toString(),
      email: row.email,
      number: row.number,
      firstName: row.first_name,
      lastName: row.last_name,
      timezone: row.timezone,
    };
  }

  /**
   * The name of every listed user, in one query (D-0172 — the fleet audit fields' "created by / last changed by"). Same
   * `runAsSystemAsync` reasoning as `findContactById`: the ids come from records the caller's company already owns.
   */
  async findContactsByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; firstName: string; lastName: string }>> {
    const numeric = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    if (numeric.length === 0) return new Map();
    const rows = await runAsSystemAsync(() =>
      this.prisma.users.findMany({
        where: { id: { in: numeric } },
        select: { id: true, first_name: true, last_name: true },
      })
    );
    return new Map(
      rows.map(
        row =>
          [
            row.id.toString(),
            { id: row.id.toString(), firstName: row.first_name, lastName: row.last_name },
          ] as const
      )
    );
  }

  /** See `findProfileById`'s doc comment — same reasoning applies to updates. */
  async updateProfile(
    userId: string,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      number: string;
      profileImage?: string | null;
    }
  ): Promise<Profile> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.update({
        where: { id: BigInt(userId) },
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          number: input.number,
          ...(input.profileImage !== undefined ? { profile_image: input.profileImage } : {}),
        },
      })
    );
    return toProfile(row);
  }

  /**
   * `users.email` has a GLOBAL unique index (`schema.sql`), not a
   * per-company one — this check (and `emailExists` below) must see across
   * every company, so it uses `runAsSystemAsync`, not the caller's own
   * (company-scoped) context. Without this, a duplicate email from a
   * *different* company would pass this check and only fail later as a
   * raw, unhandled Prisma unique-constraint error on `create()`.
   */
  async emailTakenByAnotherUser(email: string, excludeUserId: string): Promise<boolean> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findFirst({
        where: { email, id: { not: BigInt(excludeUserId) } },
        select: { id: true },
      })
    );
    return row !== null;
  }

  /** `unique:users,email` on member creation — see the doc comment on `emailTakenByAnotherUser` above. */
  async emailExists(email: string): Promise<boolean> {
    const row = await runAsSystemAsync(() =>
      this.prisma.users.findFirst({ where: { email }, select: { id: true } })
    );
    return row !== null;
  }

  // -- Members (MemberController) ------------------------------------------

  /** No `where` company filter needed — the extension forces it from the caller's own context. Search matches `members.name` (first+last, set at creation) — not Laravel's additional role-name leg, see D-0045. */
  async listMembers(query: ListMembersQuery): Promise<Paginated<Member>> {
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};
    const skip = (query.page - 1) * query.perPage;

    const [rows, total] = await Promise.all([
      this.prisma.members.findMany({
        where,
        include: { users: true },
        orderBy: { id: 'desc' },
        skip,
        take: query.perPage,
      }),
      this.prisma.members.count({ where }),
    ]);

    return {
      items: rows.map(toMember),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async findMemberById(id: string): Promise<Member | undefined> {
    const row = await this.prisma.members.findUnique({
      where: { id: BigInt(id) },
      include: { users: true },
    });
    return row ? toMember(row) : undefined;
  }

  /**
   * `company_id` in both `data` blocks below is a required field on
   * Prisma's generated `CreateInput` (the columns are `NOT NULL`) but is
   * structurally unreachable at runtime — the tenant-scoping extension's
   * `forceData` always overwrites it from the caller's own context before
   * the query runs (same pattern as `RbacRepository.createRole`). `0n` is a
   * deliberate, honest placeholder, not a real value.
   */
  async createMember(
    input: CreateMemberInput,
    passwordHash: string,
    roleId: string,
    createdByUserId: string
  ): Promise<Member> {
    const user = await this.prisma.users.create({
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        number: input.number,
        email: input.email,
        password: passwordHash,
        company_id: 0n,
        status: 'Active',
        email_verified_at: new Date(),
      },
    });

    await this.prisma.model_has_roles.create({
      data: { role_id: BigInt(roleId), model_type: USER_MODEL_TYPE, model_id: user.id },
    });

    const member = await this.prisma.members.create({
      data: {
        user_id: user.id,
        name: `${input.firstName} ${input.lastName}`,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
        company_id: 0n,
        created_by: createdByUserId,
      },
      include: { users: true },
    });

    return toMember(member);
  }

  async updateMember(id: string, input: UpdateMemberInput): Promise<Member> {
    const row = await this.prisma.members.update({
      where: { id: BigInt(id) },
      data: {
        name: input.name,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
      },
      include: { users: true },
    });
    return toMember(row);
  }

  /**
   * Deletes the given members' underlying `users` rows (scoped by the
   * extension to the caller's own company — a cross-tenant id in `ids`
   * simply matches nothing and is silently skipped, same "act as not
   * found" posture as the rest of this session's tenant-scoping work).
   * `members` rows cascade-delete automatically (`members.user_id`'s real
   * FK has `onDelete: Cascade`), but `model_has_roles`/`model_has_permissions`
   * don't (polymorphic, no real FK to `users`) — detached explicitly first,
   * matching Laravel's `$user->roles()->detach(); $user->permissions()->detach();`.
   */
  async bulkDeleteMembersByUserIds(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const ids = userIds.map(id => BigInt(id));

    await this.prisma.model_has_roles.deleteMany({
      where: { model_type: USER_MODEL_TYPE, model_id: { in: ids } },
    });
    await this.prisma.model_has_permissions.deleteMany({
      where: { model_type: USER_MODEL_TYPE, model_id: { in: ids } },
    });

    const result = await this.prisma.users.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  }
}
