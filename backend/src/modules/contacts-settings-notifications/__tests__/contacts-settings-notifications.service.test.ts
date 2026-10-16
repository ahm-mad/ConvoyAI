import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError } from '../../../platform/errors/app-error.js';
import { ContactsSettingsNotificationsService } from '../contacts-settings-notifications.service.js';
import { fakeContactsSettingsNotificationsRepository } from './fakes.js';
import type {
  Contact,
  ListContactsQuery,
  Notification,
  Setting,
} from '../contacts-settings-notifications.types.js';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: '1',
    companyId: undefined,
    roles: [],
    perms: [],
    jti: 't',
    exp: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Question',
    message: 'Hello',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeSetting(overrides: Partial<Setting> = {}): Setting {
  return { id: '1', userId: '1', locale: 'en', createdAt: null, updatedAt: null, ...overrides };
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '1',
    title: 'Rule Triggered: High Temp',
    message: 'Device 1 is hot',
    isRead: false,
    userId: '1',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

const LIST_QUERY: ListContactsQuery = {
  search: undefined,
  sortBy: 'id',
  sortOrder: 'desc',
  page: 1,
  perPage: 10,
};

describe('ContactsSettingsNotificationsService — contacts', () => {
  it("createContact returns the frozen contract's exact success message", async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      createContact: () => Promise.resolve(makeContact()),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await service.createContact({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      subject: 'Question',
      message: 'Hello',
    });
    expect(result).toMatchObject({
      success: true,
      message: 'Contact form submitted successfully.',
    });
  });

  it('getContact 404s with the exact Laravel message when missing', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      findContactById: () => Promise.resolve(undefined),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(service.getContact('999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Contact record not found.',
    });
  });

  it("deleteContact 404s before deleting when the contact doesn't exist", async () => {
    let deleteCalled = false;
    const repo = fakeContactsSettingsNotificationsRepository({
      findContactById: () => Promise.resolve(undefined),
      deleteContact: () => {
        deleteCalled = true;
        return Promise.resolve();
      },
    });
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(service.deleteContact('999')).rejects.toBeInstanceOf(NotFoundError);
    expect(deleteCalled).toBe(false);
  });

  it("listContacts passes total/items through untouched (pagination itself is the controller's job)", async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      listContacts: () => Promise.resolve({ items: [makeContact()], total: 1 }),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await service.listContacts(LIST_QUERY);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});

describe('ContactsSettingsNotificationsService — settings (scoped to caller)', () => {
  it('listSettings returns {success:false, no data key} when empty (matches SettingsController::index exactly)', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      listSettingsForCaller: () => Promise.resolve([]),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await runWithContextAsync(ctx(), () => service.listSettings());
    expect(result).toEqual({ message: 'No settings found.', success: false });
    expect(result).not.toHaveProperty('data');
  });

  it('listSettings returns {success:true, data} when non-empty', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      listSettingsForCaller: () => Promise.resolve([makeSetting()]),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await runWithContextAsync(ctx(), () => service.listSettings());
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('data');
  });

  it('getSetting 404s with the exact Laravel message when missing or not owned', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      findSettingByIdForCaller: () => Promise.resolve(undefined),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(runWithContextAsync(ctx(), () => service.getSetting('999'))).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
        message: 'Setting not found.',
      }
    );
  });

  it('updateSettings responds under the `settings` key, not `data` (matches Laravel exactly)', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      upsertLocaleForCaller: () => Promise.resolve(makeSetting({ locale: 'ar' })),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await runWithContextAsync(ctx(), () => service.updateSettings('ar'));
    expect(result).toMatchObject({ success: true, message: 'Locale updated successfully.' });
    expect(result).toHaveProperty('settings');
    expect(result).not.toHaveProperty('data');
  });

  it('every settings method requires a request context (403 otherwise)', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({});
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(service.listSettings()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ContactsSettingsNotificationsService — notifications (D-0090 closes 11.59)', () => {
  it('createNotification ignores any client-supplied target and always creates for the caller (self-only)', async () => {
    let capturedArgs: unknown;
    const repo = fakeContactsSettingsNotificationsRepository({
      createNotificationForCaller: (title, message) => {
        capturedArgs = { title, message };
        return Promise.resolve(makeNotification());
      },
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await runWithContextAsync(ctx(), () => service.createNotification('Hi', 'Body'));
    expect(capturedArgs).toEqual({ title: 'Hi', message: 'Body' });
    expect(result).toMatchObject({ success: true });
  });

  it('listNotifications returns a bare array (no envelope, matches Notification::latest()->get())', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({
      listNotificationsForCaller: () => Promise.resolve([makeNotification()]),
    });
    const service = new ContactsSettingsNotificationsService(repo);

    const result = await runWithContextAsync(ctx(), () => service.listNotifications());
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("markNotificationRead 404s (not found or not owned) instead of updating another user's row", async () => {
    let updateCalled = false;
    const repo = fakeContactsSettingsNotificationsRepository({
      findNotificationByIdForCaller: () => Promise.resolve(undefined),
      markNotificationReadForCaller: () => {
        updateCalled = true;
        return Promise.resolve(makeNotification());
      },
    });
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(
      runWithContextAsync(ctx(), () => service.markNotificationRead('999'))
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(updateCalled).toBe(false);
  });

  it("deleteNotification 404s (not found or not owned) instead of deleting another user's row", async () => {
    let deleteCalled = false;
    const repo = fakeContactsSettingsNotificationsRepository({
      findNotificationByIdForCaller: () => Promise.resolve(undefined),
      deleteNotificationForCaller: () => {
        deleteCalled = true;
        return Promise.resolve();
      },
    });
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(
      runWithContextAsync(ctx(), () => service.deleteNotification('999'))
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(deleteCalled).toBe(false);
  });

  it('every notifications method requires a request context (403 otherwise)', async () => {
    const repo = fakeContactsSettingsNotificationsRepository({});
    const service = new ContactsSettingsNotificationsService(repo);

    await expect(service.listNotifications()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
