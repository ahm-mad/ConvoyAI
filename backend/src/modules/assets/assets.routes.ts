import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../platform/http/guards.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { AssetsController } from './assets.controller.js';

// `required|image|max:10240` (Laravel, KB) — memory storage: buffers
// straight to R2 (D-0044's established pattern), never touches local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10240 * 1024 },
});

/**
 * Route wiring only (ARCHITECTURE.md §2) — every route requires plain
 * auth; ownership/company checks happen in the service (D-0075's
 * structural half). `GET /devices/:id` is registered *here*, not in
 * `devices.routes.ts` — 11.24 (resolved 2026-09-14): the frozen contract
 * documents `AssetController::componentsDevices` as this path's real,
 * live behavior (`x-known-broken` on the `DeviceController::show()`
 * meaning), and module 2.3 deliberately left it unregistered for this
 * module to own. Static/prefixed segments (`bulk-delete`,
 * `bulk-update`, `{companyId}/tree`) registered before their sibling
 * `:id` routes, matching house style (`products.routes.ts`).
 */
export function createAssetsRouter(controller: AssetsController): Router {
  const router = Router();

  router.get('/assets', requireAuth, controller.listAssets);
  router.post('/assets', requireAuth, controller.createAsset);
  router.delete('/bulk-delete', requireAuth, controller.bulkDeleteAssets);
  router.get('/assets/:companyId/tree', requireAuth, controller.getCompanyAssetsTree);
  router.post('/assets/:id/components', requireAuth, controller.addComponents);
  router.get('/assets/:id/status-summary', requireAuth, controller.getStatusSummary);
  router.get('/assets/:id', requireAuth, controller.getAsset);
  router.put('/assets/:id', requireAuth, controller.updateAsset);
  router.delete('/assets/:id', requireAuth, controller.deleteAsset);

  router.put('/components/bulk-update', requireAuth, controller.bulkUpdateComponents);
  router.get('/components/:id/status-and-devices', requireAuth, controller.statusAndDevices);
  router.get('/components/:componentId', requireAuth, controller.getComponent);
  router.put('/components/:componentId', requireAuth, controller.updateComponent);
  router.delete('/components/:id', requireAuth, controller.deleteComponent);

  // 11.24 (resolved): the real handler for GET /devices/{id}.
  router.get('/devices/:id', requireAuth, controller.componentsDevices);

  router.post(
    '/floor-plans',
    requireAuth,
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
    controller.uploadFloorPlan
  );
  router.get('/floor-plans/component/:assetComponentId', requireAuth, controller.getFloorPlan);
  router.get('/floor-plans/building/:assetId', requireAuth, controller.getBuildingFloorPlans);

  return router;
}
