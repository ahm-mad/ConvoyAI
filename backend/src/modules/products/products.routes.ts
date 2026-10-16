import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../platform/http/guards.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { ProductsController } from './products.controller.js';

// D-0148: the CSV bulk-import file — memory storage (assets.routes.ts's established pattern, D-0044),
// 5 MB cap matching the frontend's own client-side limit (`Dropzone.tsx`).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires plain
 * auth (matches Laravel's `auth:api`-only gate on this whole controller
 * set — no extra role gate exists in the live app for products/attribute
 * preferences/templates). Static segments (`bulk`, `company`,
 * `manufacturers`, `from-product`) are registered before their sibling
 * `:param` routes — Express matches in registration order, and a
 * wildcard param would otherwise swallow a literal segment.
 */
export function createProductsRouter(controller: ProductsController): Router {
  const router = Router();

  router.get('/products', requireAuth, controller.listProducts);
  // D-0148: `upload.single("file")` only engages for a real `multipart/form-data` request (the
  // CSV bulk-import path) — a plain `application/json` request (still supported, the historical
  // manual-only shape) passes straight through untouched, already parsed by Express's own global
  // JSON body parser before this middleware runs.
  router.post(
    '/products',
    requireAuth,
    (req, res, next) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (!err) {
          next();
          return;
        }
        next(
          err instanceof multer.MulterError
            ? new ValidationError(err.message, { file: [err.message] })
            : err
        );
      });
    },
    controller.createProduct
  );
  router.post('/products/bulk/destroy', requireAuth, controller.bulkDeleteProducts);
  router.get('/products/company/:company_id', requireAuth, controller.getProductsByCompany);
  router.get('/products/:product', requireAuth, controller.getProductDevices);
  router.put('/products/:product', requireAuth, controller.updateProduct);
  router.delete('/products/:product', requireAuth, controller.deleteProduct);

  router.post('/get-encrypt-token', requireAuth, controller.getEncryptToken);

  router.get('/product-settings/:id', requireAuth, controller.getProductSettings);
  router.post('/store-product-settings', requireAuth, controller.storeProductSettings);
  router.post(
    '/store-user-preferences-attributes',
    requireAuth,
    controller.storeUserPreferenceAttributes
  );

  router.post(
    '/attribute/preference/setting/store',
    requireAuth,
    controller.createAttributePreference
  );
  router.post(
    '/attribute/preference/marked-as-unique',
    requireAuth,
    controller.markAsUniqueIdentifier
  );
  router.post(
    '/attribute/preference/unmark-unique',
    requireAuth,
    controller.unmarkAsUniqueIdentifier
  );
  router.post('/attribute/preference/mark-role', requireAuth, controller.markRole);
  router.post('/attribute/preference/unmark-role', requireAuth, controller.unmarkRole);
  router.post('/attribute/preference/mapping-preview', requireAuth, controller.previewMapping);
  router.get(
    '/attribute/preference/setting/:id',
    requireAuth,
    controller.getAttributePreferenceSettings
  );
  router.put(
    '/attribute/preference/setting/:id',
    requireAuth,
    controller.updateAttributePreference
  );
  router.delete(
    '/attribute/preference/setting/:id',
    requireAuth,
    controller.deleteAttributePreference
  );
  router.get('/attribute/preference/:id', requireAuth, controller.getAttributePreference);
  // 11.18 confirmed dead (`x-known-broken` in the frozen contract) — /attribute/preference/select
  // and /unselect are not wired; markedAsSelected/markedAsUnSelected never existed on the
  // Laravel controller.

  router.get('/preconfigure-templates/manufacturers', requireAuth, controller.listManufacturers);
  router.post(
    '/preconfigure-templates/from-product/:productId',
    requireAuth,
    controller.createTemplateFromProduct
  );
  router.get('/preconfigure-templates', requireAuth, controller.listTemplates);
  router.post('/preconfigure-templates', requireAuth, controller.createTemplate);
  router.get('/preconfigure-templates/:id', requireAuth, controller.getTemplate);

  return router;
}
