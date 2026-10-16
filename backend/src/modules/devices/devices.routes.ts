import { Router } from 'express';
import { requireAuth } from '../../platform/http/guards.js';
import type { DevicesController } from './devices.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Every route requires plain
 * auth (matches Laravel's own constructor-middleware gate on
 * `DeviceController`/`UserDeviceController` — `auth:api`-only, no extra
 * role gate). `GET /devices/{id}` is deliberately **not** registered here
 * (11.24 — permanently shadowed by `AssetController::componentsDevices`
 * in the live app; the frozen contract tags that path `[devices, assets]`
 * and marks it `x-known-broken` for the `DeviceController::show()`
 * meaning — module 3.1 owns the real handler for this path). Static
 * segments (`bulk`, `product`) registered before their sibling `:id`
 * routes, matching house style (`products.routes.ts`).
 */
export function createDevicesRouter(controller: DevicesController): Router {
  const router = Router();

  router.get('/devices', requireAuth, controller.listDevices);
  router.post('/devices', requireAuth, controller.createDevice);
  router.post('/devices/bulk/enable', requireAuth, controller.bulkEnable);
  router.post('/devices/bulk/disable', requireAuth, controller.bulkDisable);
  router.post('/devices/bulk/destroy', requireAuth, controller.bulkDestroy);
  router.post('/devices/bulk/commands', requireAuth, controller.sendBulkCommands);
  router.get('/devices/product/:product_id', requireAuth, controller.getDevicesByProduct);
  router.put('/devices/:id', requireAuth, controller.updateDevice);
  router.delete('/devices/:id', requireAuth, controller.deleteDevice);
  router.get('/devices/:id/points', requireAuth, controller.getDevicePoints);
  router.patch('/devices/:id/enable', requireAuth, controller.enableDevice);
  router.patch('/devices/:id/disable', requireAuth, controller.disableDevice);
  router.post('/devices/:id/command', requireAuth, controller.sendCommand);
  // 11.24: no GET /devices/:id here — see the module doc comment above.

  router.get('/userDevices/list', requireAuth, controller.listUserDevices);
  // 11.23 confirmed dead (`x-known-broken` in the frozen contract) — POST
  // /userDevices/activate is not wired; UserDeviceController::activateDevice()
  // calls a nonexistent checkIfEncrypted() method, fatal on every call.

  return router;
}
