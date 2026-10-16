import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import type { AppPrismaClient } from '../db/tenant-scoping.js';
import type { Redis } from 'ioredis';
import { logger } from '../logging/logger.js';
import { config } from '../config/index.js';
import { createErrorHandler } from '../errors/error-handler.js';
import { createRequestContextMiddleware } from './request-context.js';
import { createCorsMiddleware } from './cors.js';
import { checkReadiness } from '../telemetry/health.js';
import { generateOpenApiDocument } from '../openapi/registry.js';
import '../../modules/auth/auth.schemas.js'; // registers auth's OpenAPI paths as a side effect
import '../../modules/rbac/rbac.schemas.js'; // registers rbac's OpenAPI paths as a side effect
import '../../modules/users/users.schemas.js'; // registers users' OpenAPI paths as a side effect
import { createAuthRouter } from '../../modules/auth/auth.routes.js';
import type { AuthController } from '../../modules/auth/auth.controller.js';
import { createRbacRouter } from '../../modules/rbac/rbac.routes.js';
import type { RbacController } from '../../modules/rbac/rbac.controller.js';
import { createUsersRouter } from '../../modules/users/users.routes.js';
import type { UsersController } from '../../modules/users/users.controller.js';
import '../../modules/products/products.schemas.js'; // registers products' OpenAPI paths as a side effect
import { createProductsRouter } from '../../modules/products/products.routes.js';
import type { ProductsController } from '../../modules/products/products.controller.js';
import '../../modules/protocols/protocols.schemas.js'; // registers protocols' OpenAPI paths as a side effect
import { createProtocolsRouter } from '../../modules/protocols/protocols.routes.js';
import type { ProtocolsController } from '../../modules/protocols/protocols.controller.js';
import '../../modules/devices/devices.schemas.js'; // registers devices' OpenAPI paths as a side effect
import { createDevicesRouter } from '../../modules/devices/devices.routes.js';
import type { DevicesController } from '../../modules/devices/devices.controller.js';
import '../../modules/ingestion/ingestion.schemas.js'; // registers ingestion's OpenAPI paths as a side effect
import { createIngestionRouter } from '../../modules/ingestion/ingestion.routes.js';
import type { IngestionController } from '../../modules/ingestion/ingestion.controller.js';
import '../../modules/rules/rules.schemas.js'; // registers rules' OpenAPI paths as a side effect
import { createRulesRouter } from '../../modules/rules/rules.routes.js';
import type { RulesController } from '../../modules/rules/rules.controller.js';
import '../../modules/dashboards/dashboards.schemas.js'; // registers dashboards' OpenAPI paths as a side effect
import { createDashboardsRouter } from '../../modules/dashboards/dashboards.routes.js';
import type { DashboardsController } from '../../modules/dashboards/dashboards.controller.js';
import '../../modules/assets/assets.schemas.js'; // registers assets' OpenAPI paths as a side effect
import { createAssetsRouter } from '../../modules/assets/assets.routes.js';
import type { AssetsController } from '../../modules/assets/assets.controller.js';
import '../../modules/fleet-vehicles-drivers/fleet-vehicles-drivers.schemas.js'; // registers fleet-vehicles-drivers' OpenAPI paths as a side effect
import { createFleetVehiclesDriversRouter } from '../../modules/fleet-vehicles-drivers/fleet-vehicles-drivers.routes.js';
import type { FleetVehiclesDriversController } from '../../modules/fleet-vehicles-drivers/fleet-vehicles-drivers.controller.js';
import '../../modules/fleet-trips/fleet-trips.schemas.js'; // registers fleet-trips' OpenAPI paths as a side effect
import { createFleetTripsRouter } from '../../modules/fleet-trips/fleet-trips.routes.js';
import type { FleetTripsController } from '../../modules/fleet-trips/fleet-trips.controller.js';
import '../../modules/fleet-geofences/fleet-geofences.schemas.js'; // registers fleet-geofences' OpenAPI paths as a side effect
import { createFleetGeofencesRouter } from '../../modules/fleet-geofences/fleet-geofences.routes.js';
import type { FleetGeofencesController } from '../../modules/fleet-geofences/fleet-geofences.controller.js';
import '../../modules/fleet-yards/fleet-yards.schemas.js'; // registers fleet-yards' OpenAPI paths as a side effect
import { createFleetYardsRouter } from '../../modules/fleet-yards/fleet-yards.routes.js';
import type { FleetYardsController } from '../../modules/fleet-yards/fleet-yards.controller.js';
import '../../modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.schemas.js'; // registers fleet-fuel-maintenance-compliance's OpenAPI paths as a side effect
import { createFleetFuelMaintenanceComplianceRouter } from '../../modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.routes.js';
import type { FleetFuelMaintenanceComplianceController } from '../../modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.controller.js';
import '../../modules/fleet-dashboard/fleet-dashboard.schemas.js'; // registers fleet-dashboard's OpenAPI paths as a side effect
import { createFleetDashboardRouter } from '../../modules/fleet-dashboard/fleet-dashboard.routes.js';
import type { FleetDashboardController } from '../../modules/fleet-dashboard/fleet-dashboard.controller.js';
import '../../modules/fleet-crm-billing/fleet-crm-billing.schemas.js'; // registers fleet-crm-billing's OpenAPI paths as a side effect
import { createFleetCrmBillingRouter } from '../../modules/fleet-crm-billing/fleet-crm-billing.routes.js';
import type { FleetCrmBillingController } from '../../modules/fleet-crm-billing/fleet-crm-billing.controller.js';
import '../../modules/fleet-positions/fleet-positions.schemas.js'; // registers fleet-positions' OpenAPI path as a side effect
import { createFleetPositionsRouter } from '../../modules/fleet-positions/fleet-positions.routes.js';
import type { FleetPositionsController } from '../../modules/fleet-positions/fleet-positions.controller.js';
import '../../modules/fleet-settings/fleet-settings.schemas.js'; // registers fleet-settings' OpenAPI paths as a side effect
import '../../modules/fleet-maintenance-due/fleet-maintenance-due.schemas.js'; // registers fleet-maintenance-due's OpenAPI paths as a side effect
import { createFleetMaintenanceDueRouter } from '../../modules/fleet-maintenance-due/fleet-maintenance-due.routes.js';
import type { FleetMaintenanceDueController } from '../../modules/fleet-maintenance-due/fleet-maintenance-due.controller.js';
import '../../modules/fleet-records/fleet-records.schemas.js'; // registers fleet-records' OpenAPI paths as a side effect
import { createFleetRecordsRouter } from '../../modules/fleet-records/fleet-records.routes.js';
import type { FleetRecordsController } from '../../modules/fleet-records/fleet-records.controller.js';
import '../../modules/fleet-dashboard/fleet-analytics.schemas.js'; // registers the fleet analytics OpenAPI paths as a side effect
import { createFleetAnalyticsRouter } from '../../modules/fleet-dashboard/fleet-analytics.routes.js';
import type { FleetAnalyticsController } from '../../modules/fleet-dashboard/fleet-analytics.controller.js';
import { createFleetSettingsRouter } from '../../modules/fleet-settings/fleet-settings.routes.js';
import type { FleetSettingsController } from '../../modules/fleet-settings/fleet-settings.controller.js';
import '../../modules/plans/plans.schemas.js'; // registers plans' OpenAPI paths as a side effect
import { createPlansRouter } from '../../modules/plans/plans.routes.js';
import type { PlansController } from '../../modules/plans/plans.controller.js';
import '../../modules/onboarding/onboarding.schemas.js'; // registers onboarding's OpenAPI paths as a side effect
import { createOnboardingRouter } from '../../modules/onboarding/onboarding.routes.js';
import type { OnboardingController } from '../../modules/onboarding/onboarding.controller.js';
import '../../modules/contacts-settings-notifications/contacts-settings-notifications.schemas.js'; // registers contacts-settings-notifications' OpenAPI paths as a side effect
import { createContactsSettingsNotificationsRouter } from '../../modules/contacts-settings-notifications/contacts-settings-notifications.routes.js';
import type { ContactsSettingsNotificationsController } from '../../modules/contacts-settings-notifications/contacts-settings-notifications.controller.js';
import '../../modules/superadmin/superadmin.schemas.js'; // registers superadmin's OpenAPI paths as a side effect
import { createSuperadminRouter } from '../../modules/superadmin/superadmin.routes.js';
import type { SuperadminController } from '../../modules/superadmin/superadmin.controller.js';
import '../../modules/ai-suggestions/ai-suggestions.schemas.js'; // registers ai-suggestions' OpenAPI paths as a side effect
import { createAiSuggestionsRouter } from '../../modules/ai-suggestions/ai-suggestions.routes.js';
import type { AiSuggestionsController } from '../../modules/ai-suggestions/ai-suggestions.controller.js';
import '../../modules/connectivity/connectivity.schemas.js'; // registers connectivity's OpenAPI paths as a side effect
import { createConnectivityRouter } from '../../modules/connectivity/connectivity.routes.js';
import type { ConnectivityController } from '../../modules/connectivity/connectivity.controller.js';
import '../../modules/mqtt-configurations/mqtt-configurations.schemas.js'; // registers mqtt-configurations' OpenAPI paths as a side effect
import { createMqttConfigurationsRouter } from '../../modules/mqtt-configurations/mqtt-configurations.routes.js';
import type { MqttConfigurationsController } from '../../modules/mqtt-configurations/mqtt-configurations.controller.js';

/**
 * Express app factory (ARCHITECTURE.md §1, §2). Modules mount their
 * routers here (module 1.2 auth is the first, 0.8+ onward).
 */
export function createApp(deps: {
  prisma: AppPrismaClient;
  redis: Redis;
  authController: AuthController;
  rbacController: RbacController;
  usersController: UsersController;
  productsController: ProductsController;
  protocolsController: ProtocolsController;
  devicesController: DevicesController;
  ingestionController: IngestionController;
  rulesController: RulesController;
  dashboardsController: DashboardsController;
  assetsController: AssetsController;
  fleetVehiclesDriversController: FleetVehiclesDriversController;
  fleetTripsController: FleetTripsController;
  fleetGeofencesController: FleetGeofencesController;
  fleetYardsController: FleetYardsController;
  fleetFuelMaintenanceComplianceController: FleetFuelMaintenanceComplianceController;
  fleetDashboardController: FleetDashboardController;
  fleetCrmBillingController: FleetCrmBillingController;
  fleetPositionsController: FleetPositionsController;
  fleetSettingsController: FleetSettingsController;
  fleetMaintenanceDueController: FleetMaintenanceDueController;
  fleetRecordsController: FleetRecordsController;
  fleetAnalyticsController: FleetAnalyticsController;
  plansController: PlansController;
  onboardingController: OnboardingController;
  contactsSettingsNotificationsController: ContactsSettingsNotificationsController;
  superadminController: SuperadminController;
  aiSuggestionsController: AiSuggestionsController;
  connectivityController: ConnectivityController;
  mqttConfigurationsController: MqttConfigurationsController;
}): Express {
  const app = express();

  app.disable('x-powered-by');
  // D-0096: CORS as early as possible in the chain, before request
  // logging/parsing/auth — so a preflight OPTIONS request short-circuits
  // here rather than reaching any of that.
  app.use(createCorsMiddleware());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' ? existing : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    })
  );
  app.use(express.json());
  app.use(createRequestContextMiddleware(deps.redis));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    const { ready, checks } = await checkReadiness(deps.prisma, deps.redis);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', checks });
  });

  if (config.NODE_ENV !== 'production') {
    app.get('/docs/openapi.json', (_req, res) => {
      res.json(generateOpenApiDocument());
    });
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(generateOpenApiDocument()));
  }

  // Frozen contract's `servers: /api` (openapi.yaml) — every module mounts under this prefix.
  app.use('/api', createAuthRouter(deps.authController));
  app.use('/api', createRbacRouter(deps.rbacController));
  app.use('/api', createUsersRouter(deps.usersController));
  app.use('/api', createProductsRouter(deps.productsController));
  app.use('/api', createProtocolsRouter(deps.protocolsController));
  app.use('/api', createDevicesRouter(deps.devicesController));
  app.use('/api', createIngestionRouter(deps.ingestionController));
  app.use('/api', createRulesRouter(deps.rulesController));
  app.use('/api', createDashboardsRouter(deps.dashboardsController));
  app.use('/api', createAssetsRouter(deps.assetsController));
  app.use('/api', createFleetVehiclesDriversRouter(deps.fleetVehiclesDriversController));
  app.use('/api', createFleetTripsRouter(deps.fleetTripsController));
  app.use('/api', createFleetGeofencesRouter(deps.fleetGeofencesController));
  app.use('/api', createFleetYardsRouter(deps.fleetYardsController));
  app.use(
    '/api',
    createFleetFuelMaintenanceComplianceRouter(deps.fleetFuelMaintenanceComplianceController)
  );
  app.use('/api', createFleetDashboardRouter(deps.fleetDashboardController));
  app.use('/api', createFleetCrmBillingRouter(deps.fleetCrmBillingController));
  app.use('/api', createFleetPositionsRouter(deps.fleetPositionsController));
  app.use('/api', createFleetSettingsRouter(deps.fleetSettingsController));
  app.use('/api', createFleetMaintenanceDueRouter(deps.fleetMaintenanceDueController));
  app.use('/api', createFleetRecordsRouter(deps.fleetRecordsController));
  app.use('/api', createFleetAnalyticsRouter(deps.fleetAnalyticsController));
  app.use('/api', createPlansRouter(deps.plansController));
  app.use('/api', createOnboardingRouter(deps.onboardingController));
  app.use(
    '/api',
    createContactsSettingsNotificationsRouter(deps.contactsSettingsNotificationsController)
  );
  app.use('/api', createSuperadminRouter(deps.superadminController));
  app.use('/api', createAiSuggestionsRouter(deps.aiSuggestionsController));
  app.use('/api', createConnectivityRouter(deps.connectivityController));
  app.use('/api', createMqttConfigurationsRouter(deps.mqttConfigurationsController));

  // TODO(future modules): mount their routers under /api too.

  app.use(createErrorHandler(logger));

  return app;
}
