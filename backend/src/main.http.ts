import './platform/network/tuning.js';
import { createServer } from 'node:http';
import { buildContainer } from './container.js';
import { createApp } from './platform/http/app.js';
import { createSocketServer } from './platform/realtime/socket.js';
import { disconnectPrisma } from './platform/db/prisma.js';
import { registerShutdown } from './platform/lifecycle/shutdown.js';
import { logger } from './platform/logging/logger.js';

const container = buildContainer();
const {
  config,
  prisma,
  redis,
  authController,
  rbacController,
  usersController,
  productsController,
  protocolsController,
  devicesController,
  ingestionController,
  rulesController,
  dashboardsController,
  assetsController,
  fleetVehiclesDriversController,
  fleetTripsController,
  fleetGeofencesController,
  fleetYardsController,
  fleetFuelMaintenanceComplianceController,
  fleetDashboardController,
  fleetCrmBillingController,
  fleetPositionsController,
  fleetSettingsController,
  fleetMaintenanceDueController,
  fleetRecordsController,
  fleetAnalyticsController,
  plansController,
  onboardingController,
  contactsSettingsNotificationsController,
  superadminController,
  aiSuggestionsController,
  connectivityController,
  mqttConfigurationsController,
} = container.cradle;

const app = createApp({
  prisma,
  redis,
  authController,
  rbacController,
  usersController,
  productsController,
  protocolsController,
  devicesController,
  ingestionController,
  rulesController,
  dashboardsController,
  assetsController,
  fleetVehiclesDriversController,
  fleetTripsController,
  fleetGeofencesController,
  fleetYardsController,
  fleetFuelMaintenanceComplianceController,
  fleetDashboardController,
  fleetCrmBillingController,
  fleetPositionsController,
  fleetSettingsController,
  fleetMaintenanceDueController,
  fleetRecordsController,
  fleetAnalyticsController,
  plansController,
  onboardingController,
  contactsSettingsNotificationsController,
  superadminController,
  aiSuggestionsController,
  connectivityController,
  mqttConfigurationsController,
});
const httpServer = createServer(app);
const io = createSocketServer(httpServer);

httpServer.listen(config.HTTP_PORT, () => {
  logger.info({ port: config.HTTP_PORT }, 'HTTP server listening');
});

registerShutdown('http', async () => {
  // Socket.IO's close() also closes the underlying HTTP server it was
  // attached to — a second, separate httpServer.close() call here throws
  // ERR_SERVER_NOT_RUNNING (confirmed by actually running this shutdown
  // path, not just typechecking it). One close call, not two.
  await io.close();
  await disconnectPrisma();
  redis.disconnect();
});
