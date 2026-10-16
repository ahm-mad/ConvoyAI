import { Router } from 'express';
import { requireAuth, requireRole } from '../../platform/http/guards.js';
import type { ContactsSettingsNotificationsController } from './contacts-settings-notifications.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). D-0090: Laravel's `ContactController`
 * and `NotificationController` have zero auth middleware at all (KNOWN_ISSUES
 * 11.58/11.59, contradicting `api-catalog.md`'s stale `auth:api` label for
 * both) — `POST /contact` stays public (a real contact-us form must remain
 * reachable pre-login, the one legitimate unauthenticated case here), but
 * `GET/DELETE /contact/{id}` and `GET /contact` expose/delete every
 * submitter's PII with no owner to scope by, so they're gated on
 * `platform_operator` instead (D-0039's precedent — a cross-tenant admin
 * concern, same standard as `companies`/`plans` mutations). `/notifications`'s
 * entire surface requires auth, self-scoped via the tenant-scoping
 * extension (`user`-ruled, `tenant-rules.ts`). `/settings/*` already had
 * real auth + scoping in Laravel — ported as-is.
 */
export function createContactsSettingsNotificationsRouter(
  controller: ContactsSettingsNotificationsController
): Router {
  const router = Router();
  const platformOperatorOnly = [requireAuth, requireRole('platform_operator')];

  router.get('/contact', ...platformOperatorOnly, controller.listContacts);
  router.post('/contact', controller.createContact);
  router.get('/contact/:id', ...platformOperatorOnly, controller.getContact);
  router.delete('/contact/:id', ...platformOperatorOnly, controller.deleteContact);

  router.post('/notifications', requireAuth, controller.createNotification);
  router.get('/notifications', requireAuth, controller.listNotifications);
  router.put('/notifications/:id/read', requireAuth, controller.markNotificationRead);
  router.delete('/notifications/:id', requireAuth, controller.deleteNotification);

  router.get('/settings/user', requireAuth, controller.listSettings);
  router.get('/settings/user/edit/:id', requireAuth, controller.getSetting);
  router.post('/settings/user/update', requireAuth, controller.updateSettings);

  return router;
}
