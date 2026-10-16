import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetGeofencesController } from './fleet-geofences.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires `all-fleet`
 * (D-0110 — `routes/api.php`'s middleware group literally still checks
 * `permission:all-fleet-management`, a stale string left over from before
 * the module was renamed `fleet-management` → `fleet`; the seeder only
 * creates `all-fleet`/`none-fleet`, so Laravel's own gate is permanently
 * unreachable by any real user. Node intentionally follows the corrected,
 * currently-real permission name, not Laravel's stale one), same guard as
 * modules 4.1/4.2. `GET /geofences/events` is registered before
 * `/geofences/{id}`-shaped routes would collide with it — Laravel doesn't
 * have that collision (no `GET /geofences/{id}` exists at all, confirmed
 * against `GeofenceController`: only `index`/`store`/`update`/`destroy`/
 * `events`), so no ordering hazard here in practice, but the events route
 * is declared first anyway to match `routes/api.php`'s own declaration
 * order.
 */
export function createFleetGeofencesRouter(controller: FleetGeofencesController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/geofences', ...guards, controller.listGeofences);
  router.get('/geofences/options', ...guards, controller.geofenceOptions);
  router.get('/geofences/export', ...guards, controller.exportGeofences);
  router.get('/geofences/events/export', ...guards, controller.exportEvents);
  router.post('/geofences/bulk-enable', ...guards, controller.bulkEnableGeofences);
  router.post('/geofences/bulk-disable', ...guards, controller.bulkDisableGeofences);
  router.post('/geofences/bulk-delete', ...guards, controller.bulkDeleteGeofences);
  router.post('/geofences', ...guards, controller.createGeofence);
  router.put('/geofences/:id', ...guards, controller.updateGeofence);
  router.delete('/geofences/:id', ...guards, controller.deleteGeofence);
  router.get('/geofences/events', ...guards, controller.listEvents);

  return router;
}
