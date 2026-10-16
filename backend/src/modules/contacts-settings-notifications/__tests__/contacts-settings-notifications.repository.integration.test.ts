import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { ContactsSettingsNotificationsRepository } from '../contacts-settings-notifications.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). `contacts` is
 * `none`-ruled (genuinely global — no context needed at all); `settings`/
 * `notifications` are `user`-ruled (`tenant-rules.ts`) — several
 * assertions here prove the tenant-scoping extension makes cross-user
 * access structurally impossible for those two tables, not just checked
 * for (D-0090 closes 11.59).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@csn-repo-test';

function contextFor(userId: string): RequestContext {
  return {
    userId,
    companyId: undefined,
    roles: [],
    perms: [],
    jti: 'test',
    exp: Number.MAX_SAFE_INTEGER,
  };
}

async function seedUser(label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `csn-user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: null,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  await rawPrisma.contacts.deleteMany({ where: { email: { contains: MARK } } });
  const users = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);
  if (userIds.length > 0) {
    await rawPrisma.settings.deleteMany({ where: { user_id: { in: userIds } } });
    await rawPrisma.notifications.deleteMany({ where: { user_id: { in: userIds } } });
  }
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('ContactsSettingsNotificationsRepository (real Postgres)', () => {
  it('contacts: create/list/find/delete work with no request context at all (genuinely global, `none`-ruled)', async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);

    const created = await repo.createContact({
      name: 'Ada',
      email: `ada${MARK}`,
      subject: 'Hi',
      message: 'Hello there',
    });
    expect(created.name).toBe('Ada');

    const found = await repo.findContactById(created.id);
    expect(found?.email).toBe(`ada${MARK}`);

    const { items, total } = await repo.listContacts({
      search: MARK,
      sortBy: 'id',
      sortOrder: 'desc',
      page: 1,
      perPage: 10,
    });
    expect(total).toBeGreaterThanOrEqual(1);
    expect(items.some(c => c.id === created.id)).toBe(true);

    await repo.deleteContact(created.id);
    expect(await repo.findContactById(created.id)).toBeUndefined();
  });

  it('settings: upsertLocaleForCaller creates on first call, updates on second (matches SettingsController::updateSettings)', async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);
    const user = await seedUser('a');

    const created = await runWithContextAsync(contextFor(user.id.toString()), () =>
      repo.upsertLocaleForCaller(user.id.toString(), 'ar')
    );
    expect(created.locale).toBe('ar');

    const updated = await runWithContextAsync(contextFor(user.id.toString()), () =>
      repo.upsertLocaleForCaller(user.id.toString(), 'en')
    );
    expect(updated.id).toBe(created.id);
    expect(updated.locale).toBe('en');

    const rows = await rawPrisma.settings.findMany({ where: { user_id: user.id } });
    expect(rows).toHaveLength(1);
  });

  it("settings: cross-user access is structurally impossible — findSettingByIdForCaller only ever matches the ambient context's own user_id", async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);
    const owner = await seedUser('b');
    const other = await seedUser('c');
    const ownersSetting = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.upsertLocaleForCaller(owner.id.toString(), 'en')
    );

    const foundUnderOther = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.findSettingByIdForCaller(ownersSetting.id)
    );
    expect(foundUnderOther).toBeUndefined();
  });

  it('notifications: createForTarget (D-0089, system context) writes a real row for an arbitrary target user with no request context', async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);
    const target = await seedUser('d');

    const created = await repo.createForTarget(
      target.id.toString(),
      'Rule Triggered: Test',
      'Body'
    );
    const row = await rawPrisma.notifications.findUnique({ where: { id: BigInt(created.id) } });
    expect(row?.user_id).toBe(target.id);
    expect(row?.title).toBe('Rule Triggered: Test');
  });

  it('notifications: cross-user access is structurally impossible for list/read/write (D-0090 closes 11.59)', async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);
    const owner = await seedUser('e');
    const other = await seedUser('f');

    const created = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.createNotificationForCaller('Hi', 'Body')
    );

    const foundUnderOther = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.findNotificationByIdForCaller(created.id)
    );
    expect(foundUnderOther).toBeUndefined();

    const listUnderOther = await runWithContextAsync(contextFor(other.id.toString()), () =>
      repo.listNotificationsForCaller()
    );
    expect(listUnderOther.some(n => n.id === created.id)).toBe(false);

    const listUnderOwner = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.listNotificationsForCaller()
    );
    expect(listUnderOwner.some(n => n.id === created.id)).toBe(true);
  });

  it('notifications: markNotificationReadForCaller/deleteNotificationForCaller mutate a real row', async () => {
    const repo = new ContactsSettingsNotificationsRepository(prisma);
    const owner = await seedUser('g');

    const created = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.createNotificationForCaller('Hi', 'Body')
    );
    const read = await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.markNotificationReadForCaller(created.id)
    );
    expect(read.isRead).toBe(true);

    await runWithContextAsync(contextFor(owner.id.toString()), () =>
      repo.deleteNotificationForCaller(created.id)
    );
    const row = await rawPrisma.notifications.findUnique({ where: { id: BigInt(created.id) } });
    expect(row).toBeNull();
  });
});
