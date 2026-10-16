import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetSettingsController } from './fleet-settings.controller.js';

/** Route wiring only (ARCHITECTURE.md §2). Same `all-fleet` guard as the other fleet modules (a separate right is the owner's later RBAC decision). */
export function createFleetSettingsRouter(controller: FleetSettingsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/fleet/settings', ...guards, controller.getSettings);
  router.put('/fleet/settings', ...guards, controller.updateSettings);

  return router;
}
