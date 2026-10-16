import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetFuelMaintenanceComplianceController } from './fleet-fuel-maintenance-compliance.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires the real
 * `all-fleet` permission, same guard as modules 4.1–4.4.
 * `/compliance-documents*` are top-level (not nested under `/vehicles`),
 * matching `routes/api.php`'s own registration exactly.
 */
export function createFleetFuelMaintenanceComplianceRouter(
  controller: FleetFuelMaintenanceComplianceController
): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.post(
    '/vehicles/:vehicleId/maintenance-schedules',
    ...guards,
    controller.storeMaintenanceSchedule
  );
  router.post('/vehicles/:vehicleId/maintenance-logs', ...guards, controller.storeMaintenanceLog);
  router.post('/vehicles/:vehicleId/fuel-logs', ...guards, controller.storeFuelLog);

  // `/compliance-documents/expiring-soon` must be registered before the
  // parameter-free `/compliance-documents` GET so Express doesn't need to
  // disambiguate — both are static paths here, no route-collision risk
  // (unlike a `:id`-style param route, which would need this ordering).
  router.get(
    '/compliance-documents/expiring-soon',
    ...guards,
    controller.expiringSoonComplianceDocuments
  );
  router.get('/compliance-documents', ...guards, controller.listComplianceDocuments);
  router.post('/compliance-documents', ...guards, controller.storeComplianceDocument);

  // D-0169 (B3): edit / delete (static `expiring-soon` above is a GET; these are PUT/DELETE on `:id`)
  router.put('/maintenance-schedules/:id', ...guards, controller.updateMaintenanceSchedule);
  router.delete('/maintenance-schedules/:id', ...guards, controller.deleteMaintenanceSchedule);
  router.put('/maintenance-logs/:id', ...guards, controller.updateMaintenanceLog);
  router.delete('/maintenance-logs/:id', ...guards, controller.deleteMaintenanceLog);
  router.put('/fuel-logs/:id', ...guards, controller.updateFuelLog);
  router.delete('/fuel-logs/:id', ...guards, controller.deleteFuelLog);
  router.put('/compliance-documents/:id', ...guards, controller.updateComplianceDocument);
  router.delete('/compliance-documents/:id', ...guards, controller.deleteComplianceDocument);

  return router;
}
