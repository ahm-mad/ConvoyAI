import { Router } from 'express';
import type { OnboardingController } from './onboarding.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Neither route requires
 * `requireAuth` (`security: []` in the frozen contract) — both resolve
 * the acting user from the verification token in the request body, the
 * same way Laravel's originals never went through the normal
 * `Authorization: Bearer` header at all.
 */
export function createOnboardingRouter(controller: OnboardingController): Router {
  const router = Router();

  router.post('/verify-token', controller.verifyToken);
  router.post('/resend-verification-email', controller.resendVerificationEmail);

  return router;
}
