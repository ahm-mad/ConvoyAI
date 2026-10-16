import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetTripsController } from './fleet-trips.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires `all-fleet`
 * (D-0110 — `routes/api.php`'s middleware group literally still checks
 * `permission:all-fleet-management`, a stale string left over from before
 * the module was renamed `fleet-management` → `fleet`; the seeder only
 * creates `all-fleet`/`none-fleet`, so Laravel's own gate is permanently
 * unreachable by any real user. Node intentionally follows the corrected,
 * currently-real permission name, not Laravel's stale one), same guard as
 * module 4.1.
 */
export function createFleetTripsRouter(controller: FleetTripsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/trips', ...guards, controller.listTrips);
  router.post('/trips', ...guards, controller.createTrip);
  router.post('/trips/bulk-delete', ...guards, controller.bulkDeleteTrips);
  router.get('/trips/export', ...guards, controller.exportTrips);
  router.get('/trips/counts', ...guards, controller.tripCounts);
  router.get('/trips/:id', ...guards, controller.getTrip);
  router.put('/trips/:id', ...guards, controller.updateTrip);
  router.delete('/trips/:id', ...guards, controller.deleteTrip);
  router.post('/trips/:id/start', ...guards, controller.startTrip);
  router.post('/trips/:id/complete', ...guards, controller.completeTrip);
  router.post('/trips/:id/cancel', ...guards, controller.cancelTrip);
  router.get('/trips/:id/gps-trail', ...guards, controller.gpsTrail);
  router.get('/trips/:id/route', ...guards, controller.route);
  router.post('/trips/:id/stops/:stopId/arrive', ...guards, controller.arriveStop);
  router.post('/trips/:id/stops/:stopId/depart', ...guards, controller.departStop);

  return router;
}
