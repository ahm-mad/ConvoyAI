import { Router } from 'express';
import { requireAuth, requireRole, requirePermission } from '../../platform/http/guards.js';
import type { DashboardsController } from './dashboards.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). Ordering discipline matches
 * every prior module (`rules.routes.ts`, `devices.routes.ts`): literal
 * path segments (`/widgets/graph-data`) registered *before* the param
 * route they'd otherwise be swallowed by (`/widgets/:widget`) — Express
 * matches in registration order, not literal-before-param automatically.
 *
 * `GET /widget/{widgetId}/sensor-count` is deliberately **not** registered
 * — `HomeController::getCountOfSensorsByWidget` doesn't exist in Laravel
 * at all (user-approved drop, see `11-dashboards.md` Scope).
 * `POST /widgets/graph-data` deliberately has **no** `requireAuth` —
 * matches Laravel/`openapi.yaml`'s `security: []` exactly (resolved
 * judgment call, not an oversight).
 */
export function createDashboardsRouter(controller: DashboardsController): Router {
  const router = Router();
  const adminOnly = [requireAuth, requireRole('admin')];
  const manageUsersOnly = [requireAuth, requireRole('admin'), requirePermission('manage users')];

  // -- Unauthenticated (must be registered before /widgets/:widget below) --
  router.post('/widgets/graph-data', controller.graphData);

  // -- Dashboards --
  router.get('/dashboards', requireAuth, controller.listDashboards);
  router.post('/dashboards', requireAuth, controller.createDashboard);
  router.get('/admin/dashboard', ...adminOnly, controller.listAdminDashboards);
  router.get('/admin/manage-users', ...manageUsersOnly, controller.manageUsers);
  router.get('/stats/count-all', requireAuth, controller.countAll);
  router.get('/users/all', requireAuth, controller.listAllUsers);
  router.get('/users/monthly-registrations', requireAuth, controller.monthlyRegistrations);
  router.get('/user/:userId/dashboards', requireAuth, controller.getUserDashboards);
  router.get('/dashboard/analytics', requireAuth, controller.getAnalytics);
  router.get('/dashboard/packet-history', requireAuth, controller.getPacketHistory);
  router.get('/dashboards/:id', requireAuth, controller.getDashboard);
  router.put('/dashboards/:id', requireAuth, controller.updateDashboard);
  router.patch('/dashboards/:id', requireAuth, controller.updateDashboard);
  router.delete('/dashboards/:id', requireAuth, controller.deleteDashboard);

  // -- Widgets --
  router.get('/widgets', requireAuth, controller.listWidgets);
  router.post('/widgets', requireAuth, controller.createWidget);
  router.get('/widgets/:widget', requireAuth, controller.getWidget);
  router.put('/widgets/:widget', requireAuth, controller.updateWidget);
  router.patch('/widgets/:widget', requireAuth, controller.updateWidget);
  router.delete('/widgets/:widget', requireAuth, controller.deleteWidget);
  router.post('/widgets/:widget/settings', requireAuth, controller.storeWidgetSettings);

  // -- Widget settings --
  router.get('/widget-settings', requireAuth, controller.listWidgetSettings);
  router.post('/widget-settings', requireAuth, controller.storeWidgetSettingsResource);
  router.get('/widget-settings/:widgetSetting', requireAuth, controller.getWidgetSetting);
  router.put('/widget-settings/:widgetSetting', requireAuth, controller.updateWidgetSettings);
  router.patch('/widget-settings/:widgetSetting', requireAuth, controller.updateWidgetSettings);
  router.delete('/widget-settings/:widgetSetting', requireAuth, controller.deleteWidgetSetting);

  return router;
}
