import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { RulesController } from './rules.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). `bulk/*` and `users/{user}`
 * registered before the generic `:id` route, same ordering discipline as
 * `devices.routes.ts` — otherwise Express would match `bulk`/`users` as an
 * `:id` value first.
 */
export function createRulesRouter(controller: RulesController): Router {
  const router = Router();

  router.get('/rules', requireAuth, controller.listRules);
  router.get('/rules/users/:user', requireAuth, controller.listRules);
  router.post('/rules/store', requireAuth, controller.createRule);
  router.post('/rules/bulk/activate', requireAuth, controller.bulkActivate);
  router.post('/rules/bulk/deactivate', requireAuth, controller.bulkDeactivate);
  router.post('/rules/bulk/delete', requireAuth, controller.bulkForceDelete);
  router.get('/rules/:id', requireAuth, controller.getRule);
  router.put('/rules/:id', requireAuth, controller.updateRule);
  router.delete('/rules/:id', requireAuth, controller.deleteRule);

  router.get('/alarms', requireAuth, controller.listAlarms);
  router.post('/alarms/:id/acknowledge', requireAuth, controller.acknowledgeAlarm);

  return router;
}
