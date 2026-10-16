import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { AiSuggestionsController } from './ai-suggestions.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Confirmed directly in
 * `routes/api.php` (not assumed from `api-catalog.md`'s label alone, same
 * discipline every module this phase has used): `GroqController::highlight`
 * sits inside Laravel's general `Route::middleware('auth:api')->group()`
 * with no extra role gate — plain `requireAuth`, same level as `settings`.
 */
export function createAiSuggestionsRouter(controller: AiSuggestionsController): Router {
  const router = Router();

  router.post('/highlight-attributes', requireAuth, controller.highlightAttributes);

  return router;
}
