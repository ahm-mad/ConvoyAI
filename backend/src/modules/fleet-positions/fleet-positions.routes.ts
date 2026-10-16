import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetPositionsController } from './fleet-positions.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Requires the real `all-fleet`
 * permission, same guard as modules 4.1–4.7 — Laravel's own route group
 * here still checks the stale, unreachable `all-fleet-management`
 * (`routes/api.php`), same root cause as D-0110.
 */
export function createFleetPositionsRouter(controller: FleetPositionsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/fleet/positions', ...guards, controller.positions);
  router.get('/fleet/devices/:deviceId/history', ...guards, controller.history);

  return router;
}
