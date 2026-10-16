import type {
  contacts as ContactRow,
  notifications as NotificationRow,
  settings as SettingRow,
} from '@prisma/client';
import type { Contact, Notification, Setting } from './contacts-settings-notifications.types.js';

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id.toString(),
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Bare-model shape (no envelope) — matches Laravel's `response()->json($contact)`/paginator `data` items exactly. */
export function toContactResponse(contact: Contact) {
  return {
    id: Number(contact.id),
    name: contact.name,
    email: contact.email,
    subject: contact.subject,
    message: contact.message,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  };
}

export function toSetting(row: SettingRow): Setting {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSettingResponse(setting: Setting) {
  return {
    id: Number(setting.id),
    user_id: Number(setting.userId),
    locale: setting.locale,
    created_at: setting.createdAt,
    updated_at: setting.updatedAt,
  };
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id.toString(),
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    userId: row.user_id?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toNotificationResponse(notification: Notification) {
  return {
    id: Number(notification.id),
    title: notification.title,
    message: notification.message,
    is_read: notification.isRead,
    user_id: notification.userId === null ? null : Number(notification.userId),
    created_at: notification.createdAt,
    updated_at: notification.updatedAt,
  };
}
