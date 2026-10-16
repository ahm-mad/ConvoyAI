import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { MqttConfigurationsController } from './mqtt-configurations.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). `requireAuth` only, no extra
 * role/permission — matches real Laravel exactly (this whole resource
 * sits under a plain `auth:api` group, `routes/api.php`). `/active` is
 * registered before the `/:id` param route, same registration-order
 * discipline as Laravel's own group (Express matches in registration
 * order, not literal-before-param automatically).
 */
export function createMqttConfigurationsRouter(controller: MqttConfigurationsController): Router {
  const router = Router();

  router.get('/mqtt-configurations', requireAuth, controller.list);
  router.get('/mqtt-configurations/active', requireAuth, controller.getActive);
  router.get('/mqtt-configurations/:id', requireAuth, controller.show);
  router.post('/mqtt-configurations', requireAuth, controller.create);
  router.put('/mqtt-configurations/:id', requireAuth, controller.update);
  router.delete('/mqtt-configurations/:id', requireAuth, controller.destroy);
  router.post('/mqtt-configurations/:id/test', requireAuth, controller.testConnection);

  return router;
}
