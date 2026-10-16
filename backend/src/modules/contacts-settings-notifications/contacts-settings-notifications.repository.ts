import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toContact, toNotification, toSetting } from './contacts-settings-notifications.mapper.js';
import type {
  Contact,
  CreateContactInput,
  ListContactsQuery,
  Notification,
  Setting,
} from './contacts-settings-notifications.types.js';

/**
 * All Prisma access for module 6.1. `contacts` is `none`-ruled
 * (`tenant-rules.ts`) — a genuinely global, ownerless public-contact-form
 * table, same as `protocols`. `settings`/`notifications` are `user`-ruled;
 * every method below except `createNotificationForTarget` runs under the
 * caller's own real request context, so the tenant-scoping extension
 * injects `user_id` automatically.
 */
export class ContactsSettingsNotificationsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Contacts
  // ===========================================================================

  async listContacts(query: ListContactsQuery): Promise<{ items: Contact[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (query.search) {
      where['email'] = { contains: query.search, mode: 'insensitive' as const };
    }

    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await Promise.all([
      this.prisma.contacts.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.perPage,
      }),
      this.prisma.contacts.count({ where }),
    ]);
    return { items: rows.map(toContact), total };
  }

  async findContactById(id: string): Promise<Contact | undefined> {
    const row = await this.prisma.contacts.findUnique({ where: { id: BigInt(id) } });
    return row ? toContact(row) : undefined;
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    const row = await this.prisma.contacts.create({ data: input });
    return toContact(row);
  }

  async deleteContact(id: string): Promise<void> {
    await this.prisma.contacts.delete({ where: { id: BigInt(id) } });
  }

  // ===========================================================================
  // Settings — scoped to the caller (SettingsController's own `Auth::id()`)
  // ===========================================================================

  async listSettingsForCaller(): Promise<Setting[]> {
    const rows = await this.prisma.settings.findMany({});
    return rows.map(toSetting);
  }

  /** `SettingsController::show($id)` — `id` AND `user_id` both must match; the extension's auto-injected `user_id` filter is what makes a foreign settings id 404 instead of leaking another user's row. */
  async findSettingByIdForCaller(id: string): Promise<Setting | undefined> {
    const row = await this.prisma.settings.findUnique({ where: { id: BigInt(id) } });
    return row ? toSetting(row) : undefined;
  }

  /**
   * `updateOrCreate`-style upsert, ported as a manual find-then-update-or-
   * create (matches `SettingsController::updateSettings` line for line)
   * since `settings.user_id` has no unique constraint in the frozen schema
   * for a native Prisma `upsert` to key off. `userId` is an explicit
   * parameter purely to satisfy Prisma's required-field typing on
   * `create()` — the tenant-scoping extension forces the real value from
   * request context into `data` regardless (same convention as
   * `subscriptions.repository.ts`'s `createPlaceholder`).
   */
  async upsertLocaleForCaller(userId: string, locale: string | undefined): Promise<Setting> {
    const existing = await this.prisma.settings.findFirst({});
    if (existing) {
      const row = await this.prisma.settings.update({
        where: { id: existing.id },
        data: locale !== undefined ? { locale } : {},
      });
      return toSetting(row);
    }
    const row = await this.prisma.settings.create({
      data: { user_id: BigInt(userId), ...(locale !== undefined ? { locale } : {}) },
    });
    return toSetting(row);
  }

  // ===========================================================================
  // Notifications — D-0090 closes 11.59 (previously fully unscoped)
  // ===========================================================================

  async listNotificationsForCaller(): Promise<Notification[]> {
    const rows = await this.prisma.notifications.findMany({ orderBy: { created_at: 'desc' } });
    return rows.map(toNotification);
  }

  async findNotificationByIdForCaller(id: string): Promise<Notification | undefined> {
    const row = await this.prisma.notifications.findUnique({ where: { id: BigInt(id) } });
    return row ? toNotification(row) : undefined;
  }

  /** D-0090: self-only — the caller can only ever create a notification owned by themselves (Laravel's client-suppliable `user_id` is not ported, same discipline as 11.48/D-0053). */
  async createNotificationForCaller(title: string, message: string): Promise<Notification> {
    const row = await this.prisma.notifications.create({ data: { title, message } });
    return toNotification(row);
  }

  async markNotificationReadForCaller(id: string): Promise<Notification> {
    const row = await this.prisma.notifications.update({
      where: { id: BigInt(id) },
      data: { is_read: true },
    });
    return toNotification(row);
  }

  async deleteNotificationForCaller(id: string): Promise<void> {
    await this.prisma.notifications.delete({ where: { id: BigInt(id) } });
  }

  /**
   * `RulesNotificationsLookup.createForTarget` (D-0089) — the rule-actions
   * worker has no HTTP request context, and the target user is the rule's
   * owner, not any ambient caller, so this runs under `runAsSystemAsync`
   * with an explicit `user_id`, same discipline as `RulesRepository`'s own
   * system-context methods (`createAlarm` et al.).
   */
  async createForTarget(userId: string, title: string, message: string): Promise<{ id: string }> {
    const row = await runAsSystemAsync(() =>
      this.prisma.notifications.create({ data: { user_id: BigInt(userId), title, message } })
    );
    return { id: row.id.toString() };
  }
}
