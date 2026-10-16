import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { FleetVehiclesDriversController } from './fleet-vehicles-drivers.controller.js';

// `required|image|max:10240` (Laravel, KB) — memory storage: buffers
// straight to R2 (D-0044's established pattern), never touches local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10240 * 1024 },
});

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires `all-fleet`
 * (D-0110 — `routes/api.php`'s middleware group literally still checks
 * `permission:all-fleet-management`, a stale string left over from before
 * the module was renamed `fleet-management` → `fleet`; the seeder only
 * creates `all-fleet`/`none-fleet`, so Laravel's own gate is permanently
 * unreachable by any real user. Node intentionally follows the corrected,
 * currently-real permission name, not Laravel's stale one), not just plain
 * auth — matches module 1.3's real permission infrastructure, not
 * `role:admin`. Static/prefixed segments
 * (`/assignment-history`) registered before their sibling `:id` routes
 * where a collision is possible, matching house style
 * (`assets.routes.ts`).
 */
export function createFleetVehiclesDriversRouter(
  controller: FleetVehiclesDriversController
): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/fleet/options', ...guards, controller.fleetOptions);
  router.get('/vehicles', ...guards, controller.listVehicles);
  router.post('/vehicles', ...guards, controller.createVehicle);
  // Static segment before the `:id` routes below (a `:id` route would swallow it).
  router.get('/vehicles/assignable-trackers', ...guards, controller.listAssignableTrackers);
  router.get('/vehicles/options', ...guards, controller.vehicleOptions);
  router.get('/vehicles/export', ...guards, controller.exportVehicles);
  router.post('/vehicles/bulk-deactivate', ...guards, controller.bulkDeactivateVehicles);
  router.post('/vehicles/bulk-reactivate', ...guards, controller.bulkReactivateVehicles);
  router.post('/vehicles/bulk-delete', ...guards, controller.bulkDeleteVehicles);
  router.get('/vehicles/counts', ...guards, controller.vehicleCounts);
  router.get('/vehicles/:id/assignment-history', ...guards, controller.vehicleAssignmentHistory);
  router.get('/vehicles/:id/maintenance-logs', ...guards, controller.vehicleMaintenanceLogs);
  router.get('/vehicles/:id/fuel-logs', ...guards, controller.vehicleFuelLogs);
  router.get('/vehicles/:id/yard-history', ...guards, controller.vehicleYardHistory);
  router.get('/vehicles/:id/incidents', ...guards, controller.vehicleIncidents);
  router.get('/vehicles/:id', ...guards, controller.getVehicle);
  router.put('/vehicles/:id', ...guards, controller.updateVehicle);
  router.delete('/vehicles/:id', ...guards, controller.deleteVehicle);
  router.post('/vehicles/:id/deactivate', ...guards, controller.deactivateVehicle);
  router.post('/vehicles/:id/reactivate', ...guards, controller.reactivateVehicle);
  router.post(
    '/vehicles/:id/image',
    ...guards,
    (req, res, next) => {
      upload.single('image')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        next(
          err instanceof multer.MulterError
            ? new ValidationError(err.message, { image: [err.message] })
            : err
        );
      });
    },
    controller.uploadVehicleImage
  );
  router.post('/vehicles/:vehicleId/assign-device', ...guards, controller.assignDevice);
  router.post('/vehicles/:vehicleId/unassign-device', ...guards, controller.unassignDevice);

  router.get('/drivers', ...guards, controller.listDrivers);
  router.get('/drivers/options', ...guards, controller.driverOptions);
  router.get('/drivers/export', ...guards, controller.exportDrivers);
  router.post('/drivers/bulk-deactivate', ...guards, controller.bulkDeactivateDrivers);
  router.post('/drivers/bulk-reactivate', ...guards, controller.bulkReactivateDrivers);
  router.post('/drivers/bulk-delete', ...guards, controller.bulkDeleteDrivers);
  router.get('/drivers/counts', ...guards, controller.driverCounts);
  router.post('/drivers', ...guards, controller.createDriver);
  router.post('/drivers/:driverId/assign-vehicle', ...guards, controller.assignVehicle);
  router.post('/drivers/:driverId/unassign-vehicle', ...guards, controller.unassignVehicle);
  router.post('/drivers/:driverId/incidents', ...guards, controller.storeIncident);
  router.get('/drivers/:id/incidents', ...guards, controller.driverIncidents);
  router.put('/incidents/:id', ...guards, controller.updateIncident);
  router.delete('/incidents/:id', ...guards, controller.deleteIncident);
  router.get('/incidents', ...guards, controller.companyIncidents);
  router.delete('/vehicles/:id/image', ...guards, controller.deleteVehicleImage);
  router.get('/drivers/:id/assignment-history', ...guards, controller.driverAssignmentHistory);
  router.get('/drivers/:id', ...guards, controller.getDriver);
  router.put('/drivers/:id', ...guards, controller.updateDriver);
  router.delete('/drivers/:id', ...guards, controller.deleteDriver);
  router.post('/drivers/:id/deactivate', ...guards, controller.deactivateDriver);
  router.post('/drivers/:id/reactivate', ...guards, controller.reactivateDriver);

  router.get('/assignment-history', ...guards, controller.companyAssignmentHistory);

  return router;
}
