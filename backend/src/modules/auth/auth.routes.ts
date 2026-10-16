import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { AuthController } from './auth.controller.js';

/** Route wiring only (ARCHITECTURE.md §2) — path + middleware, no logic. */
export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post('/login', controller.login);
  router.post('/register', controller.register);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/verify-reset-token', controller.verifyResetToken);
  router.post('/reset-password', controller.resetPassword);
  router.post('/refresh', controller.refresh);

  router.post('/logout', requireAuth, controller.logout);
  router.post('/change-password', requireAuth, controller.changePassword);

  router.get('/auth/:provider/redirect', controller.socialRedirect);
  router.get('/auth/:provider/callback', controller.socialCallback);

  return router;
}
