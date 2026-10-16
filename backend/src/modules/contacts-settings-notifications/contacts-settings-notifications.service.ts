import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError } from '../../platform/errors/app-error.js';
import type { ContactsSettingsNotificationsRepository } from './contacts-settings-notifications.repository.js';
import {
  toContactResponse,
  toNotificationResponse,
  toSettingResponse,
} from './contacts-settings-notifications.mapper.js';
import type {
  CreateContactInput,
  ListContactsQuery,
} from './contacts-settings-notifications.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

/**
 * Business logic for module 6.1. `contacts`' `index`/`show`/`destroy` are
 * gated on `platform_operator` at the route level (D-0090 — Laravel's
 * `ContactController` has zero auth middleware at all, KNOWN_ISSUES
 * 11.58), so this service does no additional ownership check for them
 * (there is no owner to check — `contacts` is `none`-ruled). `settings`/
 * `notifications` rely on the tenant-scoping extension's auto-injected
 * `user_id` for every check below (D-0090, closes 11.59).
 */
export class ContactsSettingsNotificationsService {
  constructor(private readonly repo: ContactsSettingsNotificationsRepository) {}

  // ===========================================================================
  // Contacts
  // ===========================================================================

  async listContacts(query: ListContactsQuery) {
    const { items, total } = await this.repo.listContacts(query);
    return { items: items.map(toContactResponse), total };
  }

  async createContact(input: CreateContactInput) {
    const contact = await this.repo.createContact(input);
    return {
      success: true,
      message: 'Contact form submitted successfully.',
      data: toContactResponse(contact),
    };
  }

  async getContact(id: string) {
    const contact = await this.repo.findContactById(id);
    if (!contact) throw new NotFoundError('Contact record not found.');
    return { success: true, data: toContactResponse(contact) };
  }

  async deleteContact(id: string): Promise<void> {
    const contact = await this.repo.findContactById(id);
    if (!contact) throw new NotFoundError('Contact record not found.');
    await this.repo.deleteContact(id);
  }

  // ===========================================================================
  // Settings
  // ===========================================================================

  async listSettings() {
    requireContext();
    const settings = await this.repo.listSettingsForCaller();
    if (settings.length === 0) {
      return { message: 'No settings found.', success: false as const };
    }
    return {
      message: 'Settings fetched successfully.',
      success: true as const,
      data: settings.map(toSettingResponse),
    };
  }

  async getSetting(id: string) {
    requireContext();
    const setting = await this.repo.findSettingByIdForCaller(id);
    if (!setting) throw new NotFoundError('Setting not found.');
    return {
      message: 'Setting fetched successfully.',
      success: true,
      data: toSettingResponse(setting),
    };
  }

  async updateSettings(locale: string | undefined) {
    const context = requireContext();
    const setting = await this.repo.upsertLocaleForCaller(context.userId, locale);
    return {
      success: true,
      message: 'Locale updated successfully.',
      settings: toSettingResponse(setting),
    };
  }

  // ===========================================================================
  // Notifications (D-0090 closes 11.59)
  // ===========================================================================

  async listNotifications() {
    requireContext();
    const notifications = await this.repo.listNotificationsForCaller();
    return notifications.map(toNotificationResponse);
  }

  async createNotification(title: string, message: string) {
    requireContext();
    const notification = await this.repo.createNotificationForCaller(title, message);
    return { success: true, data: toNotificationResponse(notification) };
  }

  async markNotificationRead(id: string) {
    requireContext();
    const existing = await this.repo.findNotificationByIdForCaller(id);
    if (!existing) throw new NotFoundError('Notification not found.');
    const notification = await this.repo.markNotificationReadForCaller(id);
    return { success: true, data: toNotificationResponse(notification) };
  }

  async deleteNotification(id: string): Promise<void> {
    requireContext();
    const existing = await this.repo.findNotificationByIdForCaller(id);
    if (!existing) throw new NotFoundError('Notification not found.');
    await this.repo.deleteNotificationForCaller(id);
  }
}
