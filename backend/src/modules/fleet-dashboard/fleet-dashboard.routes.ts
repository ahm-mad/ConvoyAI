import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetDashboardController } from './fleet-dashboard.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires the real
 * `all-fleet` permission, same guard as modules 4.1–4.5.
 */
export function createFleetDashboardRouter(controller: FleetDashboardController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/fleet/dashboard', ...guards, controller.overview);
  router.get('/fleet/dashboard/trends', ...guards, controller.trends);
  router.get('/fleet/dashboard/vehicle-performance', ...guards, controller.vehiclePerformance);
  router.get(
    '/fleet/dashboard/vehicle-performance/export',
    ...guards,
    controller.exportVehiclePerformance
  );
  router.get('/fleet/status-summary', ...guards, controller.statusSummary);
  router.get('/fleet/dashboard/alerts', ...guards, controller.alerts);
  router.get('/fleet/dashboard/financial', ...guards, controller.financial);

  return router;
}
