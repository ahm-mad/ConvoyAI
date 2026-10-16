import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { FleetYardsController } from './fleet-yards.controller.js';

// `required|image|max:10240` (Laravel, KB) — memory storage: buffers
// straight to R2 (D-0044's established pattern), never touches local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10240 * 1024 },
});

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires the real
 * `all-fleet` permission, same guard as modules 4.1–4.3.
 * `/yard-slots/{slotId}/check-in|check-out` are top-level (not nested
 * under `/yards`), matching `routes/api.php`'s own registration exactly.
 */
export function createFleetYardsRouter(controller: FleetYardsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/yards', ...guards, controller.listYards);
  router.post('/yards', ...guards, controller.createYard);
  router.get('/yards/options', ...guards, controller.yardOptions);
  router.get('/yards/export', ...guards, controller.exportYards);
  router.post('/yards/bulk-deactivate', ...guards, controller.bulkDeactivateYards);
  router.post('/yards/bulk-reactivate', ...guards, controller.bulkReactivateYards);
  router.post('/yards/bulk-delete', ...guards, controller.bulkDeleteYards);
  router.get('/yards/:id', ...guards, controller.getYard);
  router.put('/yards/:id', ...guards, controller.updateYard);
  router.delete('/yards/:id', ...guards, controller.deleteYard);
  router.post('/yards/:id/deactivate', ...guards, controller.deactivateYard);
  router.post('/yards/:id/reactivate', ...guards, controller.reactivateYard);
  router.post(
    '/yards/:yardId/layout',
    ...guards,
    (req, res, next) => {
      upload.single('image')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        next(
          err instanceof multer.MulterError
            ? new ValidationError(err.message, { image: [err.message] })
            : err
        );
      });
    },
    controller.uploadLayout
  );
  router.delete('/yards/:yardId/layout', ...guards, controller.deleteLayout);
  router.post('/yards/:yardId/slots', ...guards, controller.createSlot);

  router.put('/yard-slots/:slotId', ...guards, controller.updateSlot);
  router.delete('/yard-slots/:slotId', ...guards, controller.deleteSlot);
  router.post('/yard-slots/:slotId/check-in', ...guards, controller.checkIn);
  router.post('/yard-slots/:slotId/check-out', ...guards, controller.checkOut);

  return router;
}
