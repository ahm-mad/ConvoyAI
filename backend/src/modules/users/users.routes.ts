import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../platform/http/guards.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { UsersController } from './users.controller.js';

// `nullable|image|mimes:jpeg,png,jpg|max:3048` (Laravel, KB) — memory
// storage: buffers straight to R2 (D-0044), never touches local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3048 * 1024 },
});

/** Route wiring only (ARCHITECTURE.md §2) — every route here requires plain auth; ownership/company checks happen in the controller/service. */
export function createUsersRouter(controller: UsersController): Router {
  const router = Router();

  router.get('/profile', requireAuth, controller.getProfile);
  router.post(
    '/profile/:user/update',
    requireAuth,
    (req, res, next) => {
      upload.single('profile_image')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        next(
          err instanceof multer.MulterError
            ? new ValidationError(err.message, { profile_image: [err.message] })
            : err
        );
      });
    },
    controller.updateProfile
  );

  router.get('/members', requireAuth, controller.listMembers);
  router.post('/members', requireAuth, controller.createMember);
  router.get('/members/:id', requireAuth, controller.getMember);
  router.put('/members/:id', requireAuth, controller.updateMember);
  router.delete('/members/bulk-delete', requireAuth, controller.bulkDeleteMembers);

  return router;
}
