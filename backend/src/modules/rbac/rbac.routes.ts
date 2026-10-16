import { Router } from 'express';
import { requireAuth, requireRole } from '../../platform/http/guards.js';
import type { RbacController } from './rbac.controller.js';

/**
 * Route wiring only (ARCHITECTURE.md §2). List/create/delete require the
 * reserved `platform_operator` role (D-0039) — those are inherently
 * cross-tenant actions (browsing/creating/destroying companies you don't
 * belong to), never a single company's own admin action. `GET`/`PUT
 * /companies/:id` are `authOnly` here — D-0103 moved their real check
 * into `RbacService` (self-company access OR `platform_operator`), since
 * route-level role middleware can't compare the `:id` param against the
 * caller's own `companyId`.
 */
export function createRbacRouter(controller: RbacController): Router {
  const router = Router();
  const platformOperatorOnly = [requireAuth, requireRole('platform_operator')];
  // Ported from `routes/api.php`'s `Route::middleware(['role:admin'])` group
  // wrapping role/permission writes — a per-company 'admin' role (from
  // `bootstrapCompany()`), NOT `platform_operator` (a different, cross-
  // tenant concept, D-0039).
  const adminOnly = [requireAuth, requireRole('admin')];
  const authOnly = [requireAuth];

  router.get('/companies', ...platformOperatorOnly, controller.listCompanies);
  router.post('/companies', ...platformOperatorOnly, controller.createCompany);
  router.get('/companies/:id', ...authOnly, controller.getCompany);
  router.put('/companies/:id', ...authOnly, controller.updateCompany);
  router.delete('/companies/:id', ...platformOperatorOnly, controller.deleteCompany);
  router.post('/companies/bulk-delete', ...platformOperatorOnly, controller.bulkDeleteCompanies);

  // Static segments (`user`, `company`) registered before the `:roleId`
  // wildcard below — Express matches path patterns in registration order,
  // and `:roleId` would otherwise swallow `GET /roles/company` as
  // `roleId = "company"`.
  router.get('/roles/user/:userId/access-path', ...authOnly, controller.getUserAccessPath);
  router.get('/roles/user/:userId', ...authOnly, controller.getUserRoles);
  router.get('/roles/company', ...authOnly, controller.getCompanyRoles);
  router.get('/roles/:roleId', ...authOnly, controller.getRoleDetails);
  router.post('/roles/create', ...adminOnly, controller.createRole);
  router.put('/roles/:roleId/update', ...adminOnly, controller.updateRole);
  router.delete('/roles/:roleId/delete', ...adminOnly, controller.deleteRole);

  router.delete('/permissions/:permissionId/delete', ...adminOnly, controller.deletePermission);

  router.get('/modules', ...authOnly, controller.listModulesForAdmin);
  router.post('/modules/create', ...authOnly, controller.createModule);
  router.get('/modules/user/:userId', ...authOnly, controller.getUserModules);

  return router;
}
