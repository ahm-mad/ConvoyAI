import { Router } from 'express';
import { requireAuth, requireRole } from '../../platform/http/guards.js';
import type { PlansController } from './plans.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Designed fresh (11.26 — Laravel
 * had zero live routes here). Writes require `platform_operator`
 * (D-0039's precedent — a cross-tenant catalog, same standard as
 * `companies` CRUD); reads only require auth, matching
 * `PlanController::index()`/`show()`'s own real (if it were reachable)
 * auth level.
 */
export function createPlansRouter(controller: PlansController): Router {
  const router = Router();
  const platformOperatorOnly = [requireAuth, requireRole('platform_operator')];

  router.get('/plans', requireAuth, controller.listPlans);
  router.post('/plans', ...platformOperatorOnly, controller.createPlan);
  router.get('/plans/:plan', requireAuth, controller.getPlan);
  router.put('/plans/:plan', ...platformOperatorOnly, controller.updatePlan);
  router.post('/plans/:planId/assign-modules', ...platformOperatorOnly, controller.assignModules);

  return router;
}
