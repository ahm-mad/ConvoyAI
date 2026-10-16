import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { ConnectivityController } from './connectivity.controller.js';

/** Route wiring only (ARCHITECTURE.md §2). `auth:api` only, no role gate — matches the frozen contract (`api-catalog.md`) exactly. */
export function createConnectivityRouter(controller: ConnectivityController): Router {
  const router = Router();

  router.get('/connectors/health', requireAuth, controller.index);
  router.get('/connectors/:connector/health', requireAuth, controller.show);

  return router;
}
