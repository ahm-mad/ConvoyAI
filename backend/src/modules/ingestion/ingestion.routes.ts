import { Router } from 'express';
import type { IngestionController } from './ingestion.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Device-facing, no `requireAuth` —
 * matches the frozen contract's `security: []` for `POST /webhook`
 * (token-header auth, handled inside the controller/service).
 * `/packet_values/{encoded}` (confirmed "NOT the real ingestion path...
 * stores nothing" in the frozen contract, already flagged not-ported by
 * module 2.1's task file) and `/mqtts` (11.11, legacy per-user MQTT config,
 * confirmed dropped) are both deliberately not wired here.
 */
export function createIngestionRouter(controller: IngestionController): Router {
  const router = Router();

  router.post('/webhook', controller.storePacket);

  return router;
}
