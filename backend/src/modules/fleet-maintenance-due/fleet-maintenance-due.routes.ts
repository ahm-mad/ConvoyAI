import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetMaintenanceDueController } from './fleet-maintenance-due.controller.js';

/** Route wiring only (ARCHITECTURE.md §2). Same `all-fleet` guard as the other fleet modules. */
export function createFleetMaintenanceDueRouter(controller: FleetMaintenanceDueController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/maintenance-schedules', ...guards, controller.list);
  router.get('/maintenance-schedules/export', ...guards, controller.exportSchedules);

  return router;
}
