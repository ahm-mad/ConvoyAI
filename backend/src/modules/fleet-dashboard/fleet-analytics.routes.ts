import { Router } from 'express';
import { requireAuth, requirePermission } from '../../platform/http/guards.js';
import type { FleetAnalyticsController } from './fleet-analytics.controller.js';

/** Route wiring only (ARCHITECTURE.md §2). Same `all-fleet` guard as the other fleet modules. */
export function createFleetAnalyticsRouter(controller: FleetAnalyticsController): Router {
  const router = Router();
  const guards = [requireAuth, requirePermission('all-fleet')];

  router.get('/fleet/analytics/summary', ...guards, controller.summary);
  router.get('/fleet/attention', ...guards, controller.listAttention);
  router.get('/fleet/analytics/yards', ...guards, controller.yardSummary);
  router.get('/geofences/events/summary', ...guards, controller.geofenceSummary);
  router.get('/fleet/analytics/trips', ...guards, controller.tripsReportHandler);
  router.get('/fleet/analytics/trips/export', ...guards, controller.tripsReportExport);
  router.get('/fleet/analytics/fuel', ...guards, controller.fuelReportHandler);
  router.get('/fleet/analytics/fuel/export', ...guards, controller.fuelReportExport);
  router.get('/fleet/analytics/maintenance', ...guards, controller.maintenanceReportHandler);
  router.get('/fleet/analytics/compliance', ...guards, controller.complianceReportHandler);
  router.get('/fleet/analytics/compliance/export', ...guards, controller.complianceReportExport);
  router.get('/fleet/analytics/drivers', ...guards, controller.driversReportHandler);
  router.get('/fleet/analytics/drivers/export', ...guards, controller.driversReportExport);
  router.get('/incidents/summary', ...guards, controller.incidentsSummaryHandler);
  router.get('/fleet/analytics/utilisation', ...guards, controller.utilisationReportHandler);
  router.get('/fleet/analytics/utilisation/export', ...guards, controller.utilisationReportExport);

  return router;
}
