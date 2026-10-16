import { createContainer, asValue, asFunction, InjectionMode, type AwilixContainer } from 'awilix';
import { config, type Env } from './platform/config/index.js';
import { logger, type Logger } from './platform/logging/logger.js';
import { prisma } from './platform/db/prisma.js';
import { redis } from './platform/cache/redis.js';
import type { AppPrismaClient } from './platform/db/tenant-scoping.js';
import type { Redis } from 'ioredis';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { SocialLoginService } from './modules/auth/social-login.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { RbacRepository } from './modules/rbac/rbac.repository.js';
import { RbacService } from './modules/rbac/rbac.service.js';
import { RbacController } from './modules/rbac/rbac.controller.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { UsersService } from './modules/users/users.service.js';
import { UsersController } from './modules/users/users.controller.js';
import { ProductsRepository } from './modules/products/products.repository.js';
import { ProductsService } from './modules/products/products.service.js';
import { ProductsController } from './modules/products/products.controller.js';
import { ProtocolsRepository } from './modules/protocols/protocols.repository.js';
import { ProtocolsService } from './modules/protocols/protocols.service.js';
import { ProtocolsController } from './modules/protocols/protocols.controller.js';
import { DevicesRepository } from './modules/devices/devices.repository.js';
import { DevicesService } from './modules/devices/devices.service.js';
import { DevicesController } from './modules/devices/devices.controller.js';
import { IngestionRepository } from './modules/ingestion/ingestion.repository.js';
import { IngestionService } from './modules/ingestion/ingestion.service.js';
import { IngestionController } from './modules/ingestion/ingestion.controller.js';
import { BullMqIngestionQueue } from './modules/ingestion/queue-adapter.js';
import { IngestionAssetsAdapter } from './modules/ingestion/ingestion-assets-adapter.js';
import { RulesRepository } from './modules/rules/rules.repository.js';
import { RulesService } from './modules/rules/rules.service.js';
import { RulesController } from './modules/rules/rules.controller.js';
import { BullMqRulesQueue } from './modules/rules/queue-adapter.js';
import { DashboardsRepository } from './modules/dashboards/dashboards.repository.js';
import { DashboardsService } from './modules/dashboards/dashboards.service.js';
import { DashboardsController } from './modules/dashboards/dashboards.controller.js';
import { SummariesRepository } from './modules/summaries/summaries.repository.js';
import { SummariesService } from './modules/summaries/summaries.service.js';
import { AssetsRepository } from './modules/assets/assets.repository.js';
import { AssetsService } from './modules/assets/assets.service.js';
import { AssetsController } from './modules/assets/assets.controller.js';
import { FleetVehiclesDriversRepository } from './modules/fleet-vehicles-drivers/fleet-vehicles-drivers.repository.js';
import { FleetVehiclesDriversService } from './modules/fleet-vehicles-drivers/fleet-vehicles-drivers.service.js';
import { FleetVehiclesDriversController } from './modules/fleet-vehicles-drivers/fleet-vehicles-drivers.controller.js';
import { BullMqFleetRealtime, type FleetRealtimePort } from './platform/realtime/fleet-realtime.js';
import { FleetTripsRepository } from './modules/fleet-trips/fleet-trips.repository.js';
import { FleetTripsService } from './modules/fleet-trips/fleet-trips.service.js';
import { FleetTripsController } from './modules/fleet-trips/fleet-trips.controller.js';
import { FleetGeofencesRepository } from './modules/fleet-geofences/fleet-geofences.repository.js';
import { FleetGeofencesService } from './modules/fleet-geofences/fleet-geofences.service.js';
import { FleetGeofencesController } from './modules/fleet-geofences/fleet-geofences.controller.js';
import { FleetYardsRepository } from './modules/fleet-yards/fleet-yards.repository.js';
import { FleetYardsService } from './modules/fleet-yards/fleet-yards.service.js';
import { FleetYardsController } from './modules/fleet-yards/fleet-yards.controller.js';
import { FleetFuelMaintenanceComplianceRepository } from './modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.repository.js';
import { FleetFuelMaintenanceComplianceService } from './modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.service.js';
import { FleetFuelMaintenanceComplianceController } from './modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.controller.js';
import { FleetDashboardRepository } from './modules/fleet-dashboard/fleet-dashboard.repository.js';
import { FleetDashboardService } from './modules/fleet-dashboard/fleet-dashboard.service.js';
import { FleetDashboardController } from './modules/fleet-dashboard/fleet-dashboard.controller.js';
import { FleetCrmBillingRepository } from './modules/fleet-crm-billing/fleet-crm-billing.repository.js';
import { FleetCrmBillingService } from './modules/fleet-crm-billing/fleet-crm-billing.service.js';
import { FleetCrmBillingController } from './modules/fleet-crm-billing/fleet-crm-billing.controller.js';
import { FleetPositionsService } from './modules/fleet-positions/fleet-positions.service.js';
import { FleetMaintenanceDueRepository } from './modules/fleet-maintenance-due/fleet-maintenance-due.repository.js';
import { FleetMaintenanceDueService } from './modules/fleet-maintenance-due/fleet-maintenance-due.service.js';
import { FleetMaintenanceDueController } from './modules/fleet-maintenance-due/fleet-maintenance-due.controller.js';
import { FleetRecordsRepository } from './modules/fleet-records/fleet-records.repository.js';
import { FleetRecordsService } from './modules/fleet-records/fleet-records.service.js';
import { FleetRecordsController } from './modules/fleet-records/fleet-records.controller.js';
import { FleetStatusBroadcaster } from './modules/fleet-dashboard/fleet-status.broadcaster.js';
import { FleetAttentionService } from './modules/fleet-dashboard/fleet-attention.service.js';
import { FleetAnalyticsService } from './modules/fleet-dashboard/fleet-analytics.service.js';
import { FleetTelemetryRepository } from './modules/fleet-dashboard/fleet-telemetry.repository.js';
import { FleetTelemetryRollupService } from './modules/fleet-dashboard/fleet-telemetry-rollup.service.js';
import { FleetUtilisationReportService } from './modules/fleet-dashboard/fleet-utilisation-report.service.js';
import { FleetDriversReportService } from './modules/fleet-dashboard/fleet-drivers-report.service.js';
import { FleetIncidentsSummaryService } from './modules/fleet-dashboard/fleet-incidents-summary.service.js';
import { FleetTripsReportService } from './modules/fleet-dashboard/fleet-trips-report.service.js';
import { FleetFuelReportService } from './modules/fleet-dashboard/fleet-fuel-report.service.js';
import { FleetMaintenanceReportService } from './modules/fleet-dashboard/fleet-maintenance-report.service.js';
import { FleetComplianceReportService } from './modules/fleet-dashboard/fleet-compliance-report.service.js';
import { FleetActivityService } from './modules/fleet-dashboard/fleet-activity.service.js';
import { FleetAnalyticsController } from './modules/fleet-dashboard/fleet-analytics.controller.js';
import { FleetSettingsRepository } from './modules/fleet-settings/fleet-settings.repository.js';
import { FleetSettingsService } from './modules/fleet-settings/fleet-settings.service.js';
import { FleetSettingsController } from './modules/fleet-settings/fleet-settings.controller.js';
import { FleetPositionsController } from './modules/fleet-positions/fleet-positions.controller.js';
import { PlansRepository } from './modules/plans/plans.repository.js';
import { PlansService } from './modules/plans/plans.service.js';
import { PlansController } from './modules/plans/plans.controller.js';
import { SubscriptionsRepository } from './modules/subscriptions/subscriptions.repository.js';
import { SubscriptionsService } from './modules/subscriptions/subscriptions.service.js';
import { OnboardingService } from './modules/onboarding/onboarding.service.js';
import { OnboardingController } from './modules/onboarding/onboarding.controller.js';
import { ContactsSettingsNotificationsRepository } from './modules/contacts-settings-notifications/contacts-settings-notifications.repository.js';
import { ContactsSettingsNotificationsService } from './modules/contacts-settings-notifications/contacts-settings-notifications.service.js';
import { ContactsSettingsNotificationsController } from './modules/contacts-settings-notifications/contacts-settings-notifications.controller.js';
import { SuperadminRepository } from './modules/superadmin/superadmin.repository.js';
import { SuperadminService } from './modules/superadmin/superadmin.service.js';
import { SuperadminController } from './modules/superadmin/superadmin.controller.js';
import { AiSuggestionsService } from './modules/ai-suggestions/ai-suggestions.service.js';
import { AiSuggestionsController } from './modules/ai-suggestions/ai-suggestions.controller.js';
import { ConnectivityService } from './modules/connectivity/connectivity.service.js';
import { ConnectivityController } from './modules/connectivity/connectivity.controller.js';
import {
  BullMqConnectivityQueueLookup,
  RedisConnectivityMqttStateLookup,
} from './modules/connectivity/connectivity.adapters.js';
import { MqttConfigurationsRepository } from './modules/mqtt-configurations/mqtt-configurations.repository.js';
import { MqttConfigurationsService } from './modules/mqtt-configurations/mqtt-configurations.service.js';
import { MqttConfigurationsController } from './modules/mqtt-configurations/mqtt-configurations.controller.js';

/**
 * Composition root (ARCHITECTURE.md §3). Builds and wires every
 * dependency — config, Prisma, Redis, queue clients — plus each module's
 * { repository, service, controller }. `asFunction` factories explicitly
 * destructure the cradle keys each one needs and construct the instance
 * themselves — no `asClass()` constructor-param-name reflection.
 */
export interface Cradle {
  config: Env;
  logger: Logger;
  prisma: AppPrismaClient;
  redis: Redis;
  /** D-0161: producer side of the fleet socket events (`fleet:position`, `geofence:event`, `trip:update`). */
  fleetRealtime: FleetRealtimePort;
  authRepository: AuthRepository;
  authService: AuthService;
  socialLoginService: SocialLoginService;
  authController: AuthController;
  rbacRepository: RbacRepository;
  rbacService: RbacService;
  rbacController: RbacController;
  usersRepository: UsersRepository;
  usersService: UsersService;
  usersController: UsersController;
  productsRepository: ProductsRepository;
  productsService: ProductsService;
  productsController: ProductsController;
  protocolsRepository: ProtocolsRepository;
  protocolsService: ProtocolsService;
  protocolsController: ProtocolsController;
  devicesRepository: DevicesRepository;
  devicesService: DevicesService;
  devicesController: DevicesController;
  ingestionRepository: IngestionRepository;
  ingestionService: IngestionService;
  ingestionController: IngestionController;
  rulesRepository: RulesRepository;
  rulesService: RulesService;
  rulesController: RulesController;
  dashboardsRepository: DashboardsRepository;
  dashboardsService: DashboardsService;
  dashboardsController: DashboardsController;
  summariesRepository: SummariesRepository;
  summariesService: SummariesService;
  assetsRepository: AssetsRepository;
  assetsService: AssetsService;
  assetsController: AssetsController;
  fleetVehiclesDriversRepository: FleetVehiclesDriversRepository;
  fleetVehiclesDriversService: FleetVehiclesDriversService;
  fleetVehiclesDriversController: FleetVehiclesDriversController;
  fleetTripsRepository: FleetTripsRepository;
  fleetTripsService: FleetTripsService;
  fleetTripsController: FleetTripsController;
  fleetGeofencesRepository: FleetGeofencesRepository;
  fleetGeofencesService: FleetGeofencesService;
  fleetGeofencesController: FleetGeofencesController;
  fleetYardsRepository: FleetYardsRepository;
  fleetYardsService: FleetYardsService;
  fleetYardsController: FleetYardsController;
  fleetFuelMaintenanceComplianceRepository: FleetFuelMaintenanceComplianceRepository;
  fleetFuelMaintenanceComplianceService: FleetFuelMaintenanceComplianceService;
  fleetFuelMaintenanceComplianceController: FleetFuelMaintenanceComplianceController;
  fleetDashboardRepository: FleetDashboardRepository;
  fleetDashboardService: FleetDashboardService;
  fleetDashboardController: FleetDashboardController;
  fleetCrmBillingRepository: FleetCrmBillingRepository;
  fleetCrmBillingService: FleetCrmBillingService;
  fleetCrmBillingController: FleetCrmBillingController;
  fleetMaintenanceDueRepository: FleetMaintenanceDueRepository;
  fleetMaintenanceDueService: FleetMaintenanceDueService;
  fleetMaintenanceDueController: FleetMaintenanceDueController;
  fleetRecordsRepository: FleetRecordsRepository;
  fleetRecordsService: FleetRecordsService;
  fleetRecordsController: FleetRecordsController;
  fleetStatusBroadcaster: FleetStatusBroadcaster;
  fleetTelemetryRepository: FleetTelemetryRepository;
  fleetTelemetryRollupService: FleetTelemetryRollupService;
  fleetAttentionService: FleetAttentionService;
  fleetAnalyticsService: FleetAnalyticsService;
  fleetActivityService: FleetActivityService;
  fleetTripsReportService: FleetTripsReportService;
  fleetDriversReportService: FleetDriversReportService;
  fleetIncidentsSummaryService: FleetIncidentsSummaryService;
  fleetUtilisationReportService: FleetUtilisationReportService;
  fleetFuelReportService: FleetFuelReportService;
  fleetMaintenanceReportService: FleetMaintenanceReportService;
  fleetComplianceReportService: FleetComplianceReportService;
  fleetAnalyticsController: FleetAnalyticsController;
  fleetSettingsRepository: FleetSettingsRepository;
  fleetSettingsService: FleetSettingsService;
  fleetSettingsController: FleetSettingsController;
  fleetPositionsService: FleetPositionsService;
  fleetPositionsController: FleetPositionsController;
  plansRepository: PlansRepository;
  plansService: PlansService;
  plansController: PlansController;
  subscriptionsRepository: SubscriptionsRepository;
  subscriptionsService: SubscriptionsService;
  onboardingService: OnboardingService;
  onboardingController: OnboardingController;
  contactsSettingsNotificationsRepository: ContactsSettingsNotificationsRepository;
  contactsSettingsNotificationsService: ContactsSettingsNotificationsService;
  contactsSettingsNotificationsController: ContactsSettingsNotificationsController;
  superadminRepository: SuperadminRepository;
  superadminService: SuperadminService;
  superadminController: SuperadminController;
  aiSuggestionsService: AiSuggestionsService;
  aiSuggestionsController: AiSuggestionsController;
  connectivityService: ConnectivityService;
  connectivityController: ConnectivityController;
  mqttConfigurationsRepository: MqttConfigurationsRepository;
  mqttConfigurationsService: MqttConfigurationsService;
  mqttConfigurationsController: MqttConfigurationsController;
}

export function buildContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY });

  container.register({
    config: asValue(config),
    logger: asValue(logger),
    prisma: asValue(prisma),
    redis: asValue(redis),

    rbacRepository: asFunction(({ prisma }: Cradle) => new RbacRepository(prisma)).singleton(),
    // subscriptionsRepository/plansRepository double as this module's
    // RbacSubscriptionsLookup/RbacPlansLookup (interface-typed, not direct
    // cross-module repository imports — CONVENTIONS.md "Modules"), same
    // pattern as D-0040/D-0045 — `GET /modules/user/{userId}`, D-0086.
    // authRepository/assetsRepository/productsRepository/devicesRepository
    // double as RbacCompanyUsersLookup/RbacCompanyAssetsLookup/
    // RbacCompanyProductsLookup/RbacCompanyDevicesLookup (D-0100, same
    // interface-typed pattern) — `GET /companies`'s real eager-loaded shape.
    rbacService: asFunction(
      ({
        rbacRepository,
        subscriptionsRepository,
        plansRepository,
        authRepository,
        assetsRepository,
        productsRepository,
        devicesRepository,
      }: Cradle) =>
        new RbacService(
          rbacRepository,
          subscriptionsRepository,
          plansRepository,
          authRepository,
          assetsRepository,
          productsRepository,
          devicesRepository
        )
    ).singleton(),
    rbacController: asFunction(
      ({ rbacService }: Cradle) => new RbacController(rbacService)
    ).singleton(),

    usersRepository: asFunction(({ prisma }: Cradle) => new UsersRepository(prisma)).singleton(),
    // D-0045: rbacRepository doubles as the RoleLookup usersService depends
    // on (interface-typed, not a direct cross-module repository import —
    // CONVENTIONS.md "Modules"), same pattern as D-0040's ClaimsResolver.
    usersService: asFunction(
      ({ usersRepository, rbacRepository }: Cradle) =>
        new UsersService(usersRepository, rbacRepository)
    ).singleton(),
    usersController: asFunction(
      ({ usersService }: Cradle) => new UsersController(usersService)
    ).singleton(),

    productsRepository: asFunction(
      ({ prisma }: Cradle) => new ProductsRepository(prisma)
    ).singleton(),
    // protocolsRepository doubles as this module's ProductsProtocolsLookup (D-0106,
    // interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules").
    productsService: asFunction(
      ({ productsRepository, protocolsRepository }: Cradle) =>
        new ProductsService(productsRepository, protocolsRepository)
    ).singleton(),
    productsController: asFunction(
      ({ productsService }: Cradle) => new ProductsController(productsService)
    ).singleton(),

    protocolsRepository: asFunction(
      ({ prisma }: Cradle) => new ProtocolsRepository(prisma)
    ).singleton(),
    protocolsService: asFunction(
      ({ protocolsRepository }: Cradle) => new ProtocolsService(protocolsRepository)
    ).singleton(),
    protocolsController: asFunction(
      ({ protocolsService }: Cradle) => new ProtocolsController(protocolsService)
    ).singleton(),

    devicesRepository: asFunction(
      ({ prisma }: Cradle) => new DevicesRepository(prisma)
    ).singleton(),
    // D-0022's authorizedDeviceQuery() equivalent needs product ownership
    // data — productsRepository doubles as the ProductsLookup this module
    // depends on (interface-typed, not a direct cross-module repository
    // import — CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045.
    devicesService: asFunction(
      ({ devicesRepository, productsRepository }: Cradle) =>
        new DevicesService(devicesRepository, productsRepository)
    ).singleton(),
    devicesController: asFunction(
      ({ devicesService }: Cradle) => new DevicesController(devicesService)
    ).singleton(),

    ingestionRepository: asFunction(
      ({ prisma }: Cradle) => new IngestionRepository(prisma)
    ).singleton(),
    // productsRepository/devicesRepository/protocolsRepository double as
    // this module's three cross-module lookups (interface-typed, not
    // direct repository imports — CONVENTIONS.md "Modules"), same pattern
    // as D-0040/D-0045/D-0022's ProductsLookup. fleetGeofencesService
    // doubles as this module's IngestionGeofencesLookup (D-0079, module
    // 4.3) — wires the geofence detector into the real ingestion pipeline.
    // dashboardsRepository doubles as IngestionWidgetsLookup (D-0139, the
    // per-packet widget-alert loop); IngestionAssetsAdapter composes
    // assetsRepository + assetsService into IngestionAssetsLookup (D-0139,
    // the building/asset live-update bridge) — see lookups.ts.
    ingestionService: asFunction(
      ({
        ingestionRepository,
        productsRepository,
        devicesRepository,
        protocolsRepository,
        fleetGeofencesService,
        dashboardsRepository,
        assetsRepository,
        assetsService,
      }: Cradle) =>
        new IngestionService(
          ingestionRepository,
          productsRepository,
          devicesRepository,
          protocolsRepository,
          new BullMqIngestionQueue(),
          fleetGeofencesService,
          dashboardsRepository,
          new IngestionAssetsAdapter(assetsRepository, assetsService)
        )
    ).singleton(),
    ingestionController: asFunction(
      ({ ingestionService }: Cradle) => new IngestionController(ingestionService)
    ).singleton(),

    rulesRepository: asFunction(({ prisma }: Cradle) => new RulesRepository(prisma)).singleton(),
    // devicesRepository/usersRepository/productsRepository double as this
    // module's RulesDevicesLookup/RulesUsersLookup/RulesProductsLookup
    // (interface-typed, not direct repository imports —
    // CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045/D-0022's
    // ProductsLookup. contactsSettingsNotificationsRepository doubles as
    // RulesNotificationsLookup (D-0089) — the systemNotification action's
    // real in-app delivery.
    rulesService: asFunction(
      ({
        rulesRepository,
        devicesRepository,
        usersRepository,
        productsRepository,
        contactsSettingsNotificationsRepository,
      }: Cradle) =>
        new RulesService(
          rulesRepository,
          devicesRepository,
          usersRepository,
          productsRepository,
          contactsSettingsNotificationsRepository,
          new BullMqRulesQueue()
        )
    ).singleton(),
    rulesController: asFunction(
      ({ rulesService }: Cradle) => new RulesController(rulesService)
    ).singleton(),

    dashboardsRepository: asFunction(
      ({ prisma }: Cradle) => new DashboardsRepository(prisma)
    ).singleton(),
    // productsRepository doubles as this module's DashboardsProductsLookup
    // (interface-typed, not a direct repository import — CONVENTIONS.md
    // "Modules"), same pattern as D-0040/D-0045/D-0022's ProductsLookup.
    dashboardsService: asFunction(
      ({ dashboardsRepository, productsRepository }: Cradle) =>
        new DashboardsService(dashboardsRepository, productsRepository)
    ).singleton(),
    dashboardsController: asFunction(
      ({ dashboardsService }: Cradle) => new DashboardsController(dashboardsService)
    ).singleton(),

    assetsRepository: asFunction(({ prisma }: Cradle) => new AssetsRepository(prisma)).singleton(),
    // dashboardsRepository/devicesRepository/productsRepository/rbacRepository
    // double as this module's AssetsRulesLookup/AssetsDevicesLookup/
    // AssetsProductsLookup/AssetsCompanyLookup (interface-typed, not direct
    // repository imports — CONVENTIONS.md "Modules"), same pattern as
    // D-0040/D-0045/D-0022's ProductsLookup.
    assetsService: asFunction(
      ({
        assetsRepository,
        dashboardsRepository,
        devicesRepository,
        productsRepository,
        rbacRepository,
      }: Cradle) =>
        new AssetsService(
          assetsRepository,
          dashboardsRepository,
          devicesRepository,
          productsRepository,
          rbacRepository
        )
    ).singleton(),
    assetsController: asFunction(
      ({ assetsService }: Cradle) => new AssetsController(assetsService)
    ).singleton(),

    fleetVehiclesDriversRepository: asFunction(
      ({ prisma }: Cradle) => new FleetVehiclesDriversRepository(prisma)
    ).singleton(),
    // devicesRepository/usersRepository double as this module's
    // FleetDevicesLookup/FleetUsersLookup (interface-typed, not direct
    // repository imports — CONVENTIONS.md "Modules"), same pattern as
    // D-0040/D-0045/D-0022's ProductsLookup.
    fleetVehiclesDriversService: asFunction(
      ({
        fleetVehiclesDriversRepository,
        devicesRepository,
        usersRepository,
        fleetYardsRepository,
        fleetTripsRepository,
        fleetRealtime,
      }: Cradle) =>
        new FleetVehiclesDriversService(
          fleetVehiclesDriversRepository,
          devicesRepository,
          usersRepository,
          fleetYardsRepository,
          // D-0162: the trips repository doubles as the deactivate-vehicle guard's "trip in progress?" lookup.
          fleetTripsRepository,
          fleetRealtime
        )
    ).singleton(),
    fleetVehiclesDriversController: asFunction(
      ({ fleetVehiclesDriversService }: Cradle) =>
        new FleetVehiclesDriversController(fleetVehiclesDriversService)
    ).singleton(),

    fleetRealtime: asFunction(() => new BullMqFleetRealtime()).singleton(),
    fleetTripsRepository: asFunction(
      ({ prisma }: Cradle) => new FleetTripsRepository(prisma)
    ).singleton(),
    // fleetVehiclesDriversRepository doubles as this module's
    // TripsVehiclesLookup/TripsDriversLookup/TripsAssignmentMetricsLookup,
    // devicesRepository as TripsDevicesLookup, usersRepository as
    // TripsUsersLookup (interface-typed, not direct repository imports —
    // CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045/D-0022's
    // ProductsLookup.
    fleetTripsService: asFunction(
      ({
        fleetTripsRepository,
        fleetVehiclesDriversRepository,
        devicesRepository,
        usersRepository,
        fleetGeofencesRepository,
        fleetRealtime,
      }: Cradle) =>
        new FleetTripsService(
          fleetTripsRepository,
          fleetVehiclesDriversRepository,
          fleetVehiclesDriversRepository,
          fleetVehiclesDriversRepository,
          devicesRepository,
          usersRepository,
          // D-0156: the geofences *repository* (not its service) answers "is the vehicle already inside this yard?" —
          // keeps trips ← geofences-service ← trips from becoming a cycle.
          fleetGeofencesRepository,
          fleetRealtime
        )
    ).singleton(),
    fleetTripsController: asFunction(
      ({ fleetTripsService }: Cradle) => new FleetTripsController(fleetTripsService)
    ).singleton(),

    fleetGeofencesRepository: asFunction(
      ({ prisma }: Cradle) => new FleetGeofencesRepository(prisma)
    ).singleton(),
    // fleetVehiclesDriversRepository doubles as this module's
    // GeofencesVehicleAssignmentLookup/GeofencesVehiclesLookup
    // (interface-typed, not a direct repository import — CONVENTIONS.md
    // "Modules"), same pattern as module 4.2's TripsVehiclesLookup.
    fleetGeofencesService: asFunction(
      ({
        fleetGeofencesRepository,
        fleetVehiclesDriversRepository,
        fleetTripsService,
        fleetRealtime,
        usersRepository,
      }: Cradle) =>
        new FleetGeofencesService(
          fleetGeofencesRepository,
          fleetVehiclesDriversRepository,
          fleetVehiclesDriversRepository,
          // D-0156: the trips service doubles as GeofencesTripsLookup (the sensor→trip bridge).
          fleetTripsService,
          fleetRealtime,
          // D-0172 (B6): usersRepository doubles as the ActorDirectory (the "created / last changed by" names).
          usersRepository
        )
    ).singleton(),
    fleetGeofencesController: asFunction(
      ({ fleetGeofencesService }: Cradle) => new FleetGeofencesController(fleetGeofencesService)
    ).singleton(),

    fleetYardsRepository: asFunction(
      ({ prisma }: Cradle) => new FleetYardsRepository(prisma)
    ).singleton(),
    // fleetVehiclesDriversRepository doubles as this module's
    // YardsVehiclesLookup (interface-typed, not a direct repository
    // import — CONVENTIONS.md "Modules"), same pattern as every other
    // fleet module.
    fleetYardsService: asFunction(
      ({
        fleetYardsRepository,
        fleetVehiclesDriversRepository,
        fleetGeofencesRepository,
        fleetRealtime,
        usersRepository,
      }: Cradle) =>
        // D-0162: the geofences repository doubles as YardsGeofencesLookup (a yard's linked geofence follows the yard).
        new FleetYardsService(
          fleetYardsRepository,
          fleetVehiclesDriversRepository,
          fleetGeofencesRepository,
          fleetRealtime,
          usersRepository
        )
    ).singleton(),
    fleetYardsController: asFunction(
      ({ fleetYardsService }: Cradle) => new FleetYardsController(fleetYardsService)
    ).singleton(),

    fleetFuelMaintenanceComplianceRepository: asFunction(
      ({ prisma }: Cradle) => new FleetFuelMaintenanceComplianceRepository(prisma)
    ).singleton(),
    // fleetVehiclesDriversRepository doubles as this module's
    // FuelMaintenanceVehiclesLookup/FuelMaintenanceDriversLookup,
    // fleetTripsRepository as FuelMaintenanceTripsLookup (interface-typed,
    // not direct repository imports — CONVENTIONS.md "Modules"), same
    // pattern as every other fleet module.
    fleetFuelMaintenanceComplianceService: asFunction(
      ({
        fleetFuelMaintenanceComplianceRepository,
        fleetVehiclesDriversRepository,
        fleetTripsRepository,
        usersRepository,
      }: Cradle) =>
        new FleetFuelMaintenanceComplianceService(
          fleetFuelMaintenanceComplianceRepository,
          fleetVehiclesDriversRepository,
          fleetVehiclesDriversRepository,
          fleetTripsRepository,
          usersRepository
        )
    ).singleton(),
    fleetFuelMaintenanceComplianceController: asFunction(
      ({ fleetFuelMaintenanceComplianceService }: Cradle) =>
        new FleetFuelMaintenanceComplianceController(fleetFuelMaintenanceComplianceService)
    ).singleton(),

    fleetDashboardRepository: asFunction(
      ({ prisma }: Cradle) => new FleetDashboardRepository(prisma)
    ).singleton(),
    // fleetVehiclesDriversRepository doubles as this module's
    // FleetDashboardVehiclesLookup (interface-typed, not a direct
    // repository import — CONVENTIONS.md "Modules"), same pattern as every
    // other fleet module.
    fleetDashboardService: asFunction(
      ({
        fleetDashboardRepository,
        fleetVehiclesDriversRepository,
        fleetSettingsService,
      }: Cradle) =>
        new FleetDashboardService(
          fleetDashboardRepository,
          fleetVehiclesDriversRepository,
          fleetSettingsService
        )
    ).singleton(),
    fleetDashboardController: asFunction(
      ({ fleetDashboardService }: Cradle) => new FleetDashboardController(fleetDashboardService)
    ).singleton(),

    fleetCrmBillingRepository: asFunction(
      ({ prisma }: Cradle) => new FleetCrmBillingRepository(prisma)
    ).singleton(),
    // fleetTripsRepository doubles as this module's FleetBillingTripsLookup
    // (interface-typed, not a direct repository import — CONVENTIONS.md
    // "Modules"), same cross-module pattern as every other fleet module.
    fleetCrmBillingService: asFunction(
      ({ fleetCrmBillingRepository, fleetTripsRepository }: Cradle) =>
        new FleetCrmBillingService(fleetCrmBillingRepository, fleetTripsRepository)
    ).singleton(),
    fleetCrmBillingController: asFunction(
      ({ fleetCrmBillingService }: Cradle) => new FleetCrmBillingController(fleetCrmBillingService)
    ).singleton(),

    // Module 4.8 — owns no table of its own; devicesRepository doubles as
    // FleetPositionsDevicesLookup and fleetVehiclesDriversRepository as
    // FleetPositionsVehicleAssignmentLookup (interface-typed, not a direct
    // repository import — CONVENTIONS.md "Modules"), same cross-module
    // pattern as every other fleet module.
    // Module 4.9 (D-0183, flow 07 F1): company fleet settings; the service doubles as the `FleetSettingsLookup` the dashboards / positions read.
    fleetSettingsRepository: asFunction(
      ({ prisma }: Cradle) => new FleetSettingsRepository(prisma)
    ).singleton(),
    fleetSettingsService: asFunction(
      ({ fleetSettingsRepository, usersRepository }: Cradle) =>
        new FleetSettingsService(fleetSettingsRepository, usersRepository)
    ).singleton(),
    // Module 4.10 (D-0184, flow 07 C1): company-wide maintenance schedules with computed due state — a read-only view, no table of its own.
    fleetMaintenanceDueRepository: asFunction(
      ({ prisma }: Cradle) => new FleetMaintenanceDueRepository(prisma)
    ).singleton(),
    fleetMaintenanceDueService: asFunction(
      ({ fleetMaintenanceDueRepository, fleetSettingsService, usersRepository }: Cradle) =>
        new FleetMaintenanceDueService(
          fleetMaintenanceDueRepository,
          fleetSettingsService,
          usersRepository
        )
    ).singleton(),
    fleetMaintenanceDueController: asFunction(
      ({ fleetMaintenanceDueService }: Cradle) =>
        new FleetMaintenanceDueController(fleetMaintenanceDueService)
    ).singleton(),
    // Module 4.11 (D-0188, flow 07 C2 / C3 / C4): company-wide maintenance-log and fuel-log lists + compliance-document counts — read-only views, no table of its own.
    fleetRecordsRepository: asFunction(
      ({ prisma }: Cradle) => new FleetRecordsRepository(prisma)
    ).singleton(),
    fleetRecordsService: asFunction(
      ({ fleetRecordsRepository, fleetSettingsService, usersRepository }: Cradle) =>
        new FleetRecordsService(fleetRecordsRepository, fleetSettingsService, usersRepository)
    ).singleton(),
    fleetRecordsController: asFunction(
      ({ fleetRecordsService }: Cradle) => new FleetRecordsController(fleetRecordsService)
    ).singleton(),
    // D-0185 (flow 07 B1 / B2): the attention feed and the Overview KPI summary — read-only, over the dashboard repository and the settings / maintenance services.
    // D-0185 (A9): the scheduled `fleet:status_summary` announcer (used by the worker process).
    fleetStatusBroadcaster: asFunction(
      ({ fleetDashboardRepository, fleetDashboardService, fleetRealtime, redis }: Cradle) =>
        new FleetStatusBroadcaster(
          fleetDashboardRepository,
          fleetDashboardService,
          fleetRealtime,
          redis
        )
    ).singleton(),
    // D-0194 (D1): the hourly telemetry rollup (repository + the scheduled job's service, used by the worker process).
    fleetTelemetryRepository: asFunction(
      ({ prisma }: Cradle) => new FleetTelemetryRepository(prisma)
    ).singleton(),
    fleetTelemetryRollupService: asFunction(
      ({ fleetDashboardRepository, fleetTelemetryRepository, fleetSettingsService }: Cradle) =>
        new FleetTelemetryRollupService(
          fleetDashboardRepository,
          fleetTelemetryRepository,
          fleetSettingsService
        )
    ).singleton(),
    fleetAttentionService: asFunction(
      ({
        fleetDashboardRepository,
        fleetVehiclesDriversRepository,
        fleetSettingsService,
        fleetMaintenanceDueService,
      }: Cradle) =>
        new FleetAttentionService(
          fleetDashboardRepository,
          fleetVehiclesDriversRepository,
          fleetSettingsService,
          fleetMaintenanceDueService
        )
    ).singleton(),
    fleetAnalyticsService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService, fleetAttentionService }: Cradle) =>
        new FleetAnalyticsService(
          fleetDashboardRepository,
          fleetSettingsService,
          fleetAttentionService
        )
    ).singleton(),
    fleetActivityService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetActivityService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetTripsReportService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetTripsReportService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetFuelReportService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetFuelReportService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetMaintenanceReportService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService, fleetMaintenanceDueService }: Cradle) =>
        new FleetMaintenanceReportService(
          fleetDashboardRepository,
          fleetSettingsService,
          fleetMaintenanceDueService
        )
    ).singleton(),
    fleetComplianceReportService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetComplianceReportService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetDriversReportService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetDriversReportService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetIncidentsSummaryService: asFunction(
      ({ fleetDashboardRepository, fleetSettingsService }: Cradle) =>
        new FleetIncidentsSummaryService(fleetDashboardRepository, fleetSettingsService)
    ).singleton(),
    fleetUtilisationReportService: asFunction(
      ({ fleetDashboardRepository, fleetTelemetryRepository, fleetSettingsService }: Cradle) =>
        new FleetUtilisationReportService(
          fleetDashboardRepository,
          fleetTelemetryRepository,
          fleetSettingsService
        )
    ).singleton(),
    fleetAnalyticsController: asFunction(
      ({
        fleetAnalyticsService,
        fleetAttentionService,
        fleetActivityService,
        fleetTripsReportService,
        fleetFuelReportService,
        fleetMaintenanceReportService,
        fleetComplianceReportService,
        fleetDriversReportService,
        fleetIncidentsSummaryService,
        fleetUtilisationReportService,
      }: Cradle) =>
        new FleetAnalyticsController(
          fleetAnalyticsService,
          fleetAttentionService,
          fleetActivityService,
          fleetTripsReportService,
          fleetFuelReportService,
          fleetMaintenanceReportService,
          fleetComplianceReportService,
          fleetDriversReportService,
          fleetIncidentsSummaryService,
          fleetUtilisationReportService
        )
    ).singleton(),
    fleetSettingsController: asFunction(
      ({ fleetSettingsService }: Cradle) => new FleetSettingsController(fleetSettingsService)
    ).singleton(),
    fleetPositionsService: asFunction(
      ({ devicesRepository, fleetVehiclesDriversRepository, fleetSettingsService }: Cradle) =>
        new FleetPositionsService(
          devicesRepository,
          fleetVehiclesDriversRepository,
          fleetSettingsService
        )
    ).singleton(),
    fleetPositionsController: asFunction(
      ({ fleetPositionsService }: Cradle) => new FleetPositionsController(fleetPositionsService)
    ).singleton(),

    summariesRepository: asFunction(
      ({ prisma }: Cradle) => new SummariesRepository(prisma)
    ).singleton(),
    summariesService: asFunction(
      ({ summariesRepository }: Cradle) => new SummariesService(summariesRepository)
    ).singleton(),

    plansRepository: asFunction(({ prisma }: Cradle) => new PlansRepository(prisma)).singleton(),
    // rbacRepository doubles as this module's ModulesLookup (interface-typed,
    // not a direct cross-module repository import — CONVENTIONS.md
    // "Modules"), same pattern as D-0040/D-0045.
    plansService: asFunction(
      ({ plansRepository, rbacRepository }: Cradle) =>
        new PlansService(plansRepository, rbacRepository)
    ).singleton(),
    plansController: asFunction(
      ({ plansService }: Cradle) => new PlansController(plansService)
    ).singleton(),

    subscriptionsRepository: asFunction(
      ({ prisma }: Cradle) => new SubscriptionsRepository(prisma)
    ).singleton(),
    subscriptionsService: asFunction(
      ({ subscriptionsRepository }: Cradle) => new SubscriptionsService(subscriptionsRepository)
    ).singleton(),

    // authRepository/rbacRepository/plansRepository/subscriptionsService
    // double as this module's OnboardingUsersLookup/OnboardingCompaniesLookup+
    // OnboardingRolesLookup/OnboardingPlansLookup/OnboardingSubscriptionsProvisioner
    // (interface-typed, not direct cross-module repository imports —
    // CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045.
    onboardingService: asFunction(
      ({ authRepository, rbacRepository, plansRepository, subscriptionsService }: Cradle) =>
        new OnboardingService(
          authRepository,
          rbacRepository,
          rbacRepository,
          plansRepository,
          subscriptionsService
        )
    ).singleton(),
    onboardingController: asFunction(
      ({ onboardingService }: Cradle) => new OnboardingController(onboardingService)
    ).singleton(),

    contactsSettingsNotificationsRepository: asFunction(
      ({ prisma }: Cradle) => new ContactsSettingsNotificationsRepository(prisma)
    ).singleton(),
    contactsSettingsNotificationsService: asFunction(
      ({ contactsSettingsNotificationsRepository }: Cradle) =>
        new ContactsSettingsNotificationsService(contactsSettingsNotificationsRepository)
    ).singleton(),
    contactsSettingsNotificationsController: asFunction(
      ({ contactsSettingsNotificationsService }: Cradle) =>
        new ContactsSettingsNotificationsController(contactsSettingsNotificationsService)
    ).singleton(),

    superadminRepository: asFunction(
      ({ prisma }: Cradle) => new SuperadminRepository(prisma)
    ).singleton(),
    superadminService: asFunction(
      ({ superadminRepository }: Cradle) => new SuperadminService(superadminRepository)
    ).singleton(),
    superadminController: asFunction(
      ({ superadminService }: Cradle) => new SuperadminController(superadminService)
    ).singleton(),

    aiSuggestionsService: asFunction(() => new AiSuggestionsService()).singleton(),
    aiSuggestionsController: asFunction(
      ({ aiSuggestionsService }: Cradle) => new AiSuggestionsController(aiSuggestionsService)
    ).singleton(),

    // protocolsRepository/ingestionRepository double as ConnectivityProtocolsLookup/
    // ConnectivityPacketsLookup (D-0104, interface-typed, not a direct
    // cross-module repository import — CONVENTIONS.md "Modules").
    connectivityService: asFunction(
      ({ protocolsRepository, ingestionRepository, redis }: Cradle) =>
        new ConnectivityService(
          protocolsRepository,
          ingestionRepository,
          new BullMqConnectivityQueueLookup(),
          new RedisConnectivityMqttStateLookup(redis)
        )
    ).singleton(),
    connectivityController: asFunction(
      ({ connectivityService }: Cradle) => new ConnectivityController(connectivityService)
    ).singleton(),

    mqttConfigurationsRepository: asFunction(
      ({ prisma }: Cradle) => new MqttConfigurationsRepository(prisma)
    ).singleton(),
    mqttConfigurationsService: asFunction(
      ({ mqttConfigurationsRepository }: Cradle) =>
        new MqttConfigurationsService(mqttConfigurationsRepository)
    ).singleton(),
    mqttConfigurationsController: asFunction(
      ({ mqttConfigurationsService }: Cradle) =>
        new MqttConfigurationsController(mqttConfigurationsService)
    ).singleton(),

    authRepository: asFunction(({ prisma }: Cradle) => new AuthRepository(prisma)).singleton(),
    // D-0040: rbacRepository doubles as the ClaimsResolver auth depends on
    // (interface-typed, not a direct cross-module repository import —
    // CONVENTIONS.md "Modules").
    authService: asFunction(
      ({ authRepository, redis, rbacRepository }: Cradle) =>
        new AuthService(authRepository, redis, rbacRepository)
    ).singleton(),
    socialLoginService: asFunction(
      ({ authService, onboardingService }: Cradle) =>
        new SocialLoginService(authService, onboardingService)
    ).singleton(),
    authController: asFunction(
      ({ authService, socialLoginService }: Cradle) =>
        new AuthController(authService, socialLoginService)
    ).singleton(),
  });

  // TODO(future modules): register each module's { repository, service, controller } here too.

  return container;
}
