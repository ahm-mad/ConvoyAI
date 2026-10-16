import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { ProtocolsController } from './protocols.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). D-0050: gated on `requireAuth`,
 * unlike the live Laravel app, whose `Route::apiResource('protocols', ...)`
 * sits under only a `SetLocale` middleware group with **no** `auth:api` at
 * all (11.47 — confirmed via `routes/api.php`: full unauthenticated CRUD,
 * including delete, on the shared protocol catalog). Every other module
 * built so far requires at minimum `requireAuth`; this is treated as an
 * accidental grouping bug in the live app (it sits alongside `/login`/
 * `/register`, which genuinely must be public) rather than a deliberate
 * public-catalog design, so the new app does not reproduce the gap.
 */
export function createProtocolsRouter(controller: ProtocolsController): Router {
  const router = Router();

  router.get('/protocols', requireAuth, controller.listProtocols);
  router.post('/protocols', requireAuth, controller.createProtocol);
  router.get('/protocols/:protocol', requireAuth, controller.getProtocol);
  router.put('/protocols/:protocol', requireAuth, controller.updateProtocol);
  router.delete('/protocols/:protocol', requireAuth, controller.deleteProtocol);

  return router;
}
