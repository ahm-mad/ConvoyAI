/** Domain types for module 6.1 — see `tasks/24-contacts-settings-notifications.md`. */

// -- Contacts (`ContactController.php`) --------------------------------------

export const CONTACT_SORTABLE_COLUMNS = [
  'id',
  'name',
  'email',
  'subject',
  'message',
  'created_at',
  'updated_at',
] as const;
export type ContactSortableColumn = (typeof CONTACT_SORTABLE_COLUMNS)[number];

export interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListContactsQuery {
  search: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface CreateContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// -- Settings (`SettingsController.php`) -------------------------------------

export interface Setting {
  id: string;
  userId: string;
  locale: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// -- Notifications (`NotificationController.php`) ----------------------------

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  userId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateNotificationInput {
  title: string;
  message: string;
}
