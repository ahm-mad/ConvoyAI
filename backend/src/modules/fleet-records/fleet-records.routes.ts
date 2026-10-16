import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetRecordsController } from './fleet-records.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Same `all-fleet` guard as the other fleet modules. The static paths here (`/maintenance-logs`,
 * `/fuel-logs`, `/compliance-documents/counts`) do not collide with module 4.5's `PUT|DELETE /…-logs/:id` or `GET /compliance-documents[/expiring-soon]`.
 */
export function createFleetRecordsRouter(controller: FleetRecordsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/maintenance-logs', ...guards, controller.listMaintenanceLogs);
  router.get('/maintenance-logs/export', ...guards, controller.exportMaintenanceLogs);
  router.get('/fuel-logs', ...guards, controller.listFuelLogs);
  router.get('/fuel-logs/export', ...guards, controller.exportFuelLogs);
  router.get('/compliance-documents/counts', ...guards, controller.complianceCounts);

  return router;
}
