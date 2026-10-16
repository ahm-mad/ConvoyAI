import { Router } from 'express';
import { requireAuth, requireRole } from '../../platform/http/guards.js';
import type { SuperadminController } from './superadmin.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). D-0091: Laravel's
 * `SuperAdminController` has zero auth middleware at all (KNOWN_ISSUES
 * 11.14a) — both real endpoints gated on `platform_operator` here (D-0039's
 * precedent, reused rather than a separate `super_admin` role). `GET
 * /get-encryption-key` is deliberately not registered at all — see
 * `superadmin.schemas.ts`'s own note.
 */
export function createSuperadminRouter(controller: SuperadminController): Router {
  const router = Router();
  const platformOperatorOnly = [requireAuth, requireRole('platform_operator')];

  router.get(
    '/superadmin/companies/users',
    ...platformOperatorOnly,
    controller.totalUsersPerCompany
  );
  router.get('/superadmin/subscriptions', ...platformOperatorOnly, controller.totalSubscriptions);

  return router;
}
