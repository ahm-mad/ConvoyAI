import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { createApp } from '../app.js';
import type { AppPrismaClient } from '../../db/tenant-scoping.js';
import type { AuthController } from '../../../modules/auth/auth.controller.js';
import type { RbacController } from '../../../modules/rbac/rbac.controller.js';
import type { UsersController } from '../../../modules/users/users.controller.js';
import type { ProductsController } from '../../../modules/products/products.controller.js';
import type { ProtocolsController } from '../../../modules/protocols/protocols.controller.js';
import type { DevicesController } from '../../../modules/devices/devices.controller.js';
import type { IngestionController } from '../../../modules/ingestion/ingestion.controller.js';
import type { RulesController } from '../../../modules/rules/rules.controller.js';
import type { DashboardsController } from '../../../modules/dashboards/dashboards.controller.js';
import type { AssetsController } from '../../../modules/assets/assets.controller.js';
import type { FleetVehiclesDriversController } from '../../../modules/fleet-vehicles-drivers/fleet-vehicles-drivers.controller.js';
import type { FleetTripsController } from '../../../modules/fleet-trips/fleet-trips.controller.js';
import type { FleetGeofencesController } from '../../../modules/fleet-geofences/fleet-geofences.controller.js';
import type { FleetYardsController } from '../../../modules/fleet-yards/fleet-yards.controller.js';
import type { FleetFuelMaintenanceComplianceController } from '../../../modules/fleet-fuel-maintenance-compliance/fleet-fuel-maintenance-compliance.controller.js';
import type { FleetDashboardController } from '../../../modules/fleet-dashboard/fleet-dashboard.controller.js';
import type { FleetCrmBillingController } from '../../../modules/fleet-crm-billing/fleet-crm-billing.controller.js';
import type { FleetPositionsController } from '../../../modules/fleet-positions/fleet-positions.controller.js';
import type { FleetAnalyticsController } from '../../../modules/fleet-dashboard/fleet-analytics.controller.js';
import type { FleetMaintenanceDueController } from '../../../modules/fleet-maintenance-due/fleet-maintenance-due.controller.js';
import type { FleetRecordsController } from '../../../modules/fleet-records/fleet-records.controller.js';
import type { FleetSettingsController } from '../../../modules/fleet-settings/fleet-settings.controller.js';
import type { PlansController } from '../../../modules/plans/plans.controller.js';
import type { OnboardingController } from '../../../modules/onboarding/onboarding.controller.js';
import type { ContactsSettingsNotificationsController } from '../../../modules/contacts-settings-notifications/contacts-settings-notifications.controller.js';
import type { SuperadminController } from '../../../modules/superadmin/superadmin.controller.js';
import type { AiSuggestionsController } from '../../../modules/ai-suggestions/ai-suggestions.controller.js';
import type { ConnectivityController } from '../../../modules/connectivity/connectivity.controller.js';
import type { MqttConfigurationsController } from '../../../modules/mqtt-configurations/mqtt-configurations.controller.js';

/**
 * 0.7 walking-skeleton smoke test (ROADMAP.md exit criteria: "passes its
 * own smoke test"). Uses fakes for Prisma/Redis rather than live infra —
 * this is a unit-level check that the app boots and wires its platform
 * routes correctly, not an integration test (ARCHITECTURE.md §13 keeps
 * those separate; real-DB/Redis integration tests land with module 1.1+).
 */
function fakePrisma(queryRawOk: boolean): Pick<PrismaClient, '$queryRaw'> {
  return {
    $queryRaw: queryRawOk
      ? () => Promise.resolve([{ '?column?': 1 }])
      : () => Promise.reject(new Error('connection refused')),
  } as unknown as Pick<PrismaClient, '$queryRaw'>;
}

function fakeRedis(pingOk: boolean): Pick<Redis, 'ping'> {
  return {
    ping: pingOk ? () => Promise.resolve('PONG') : () => Promise.reject(new Error('ECONNREFUSED')),
  } as unknown as Pick<Redis, 'ping'>;
}

function fakeAuthController(): AuthController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    login: noop,
    register: noop,
    logout: noop,
    refresh: noop,
    changePassword: noop,
    forgotPassword: noop,
    verifyResetToken: noop,
    resetPassword: noop,
    socialRedirect: noop,
    socialCallback: noop,
  } as unknown as AuthController;
}

function fakeRbacController(): RbacController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listCompanies: noop,
    createCompany: noop,
    getCompany: noop,
    updateCompany: noop,
    deleteCompany: noop,
    bulkDeleteCompanies: noop,
    getUserRoles: noop,
    getUserAccessPath: noop,
    getCompanyRoles: noop,
    getRoleDetails: noop,
    createRole: noop,
    updateRole: noop,
    deleteRole: noop,
    deletePermission: noop,
    listModulesForAdmin: noop,
    createModule: noop,
    getUserModules: noop,
  } as unknown as RbacController;
}

function fakeUsersController(): UsersController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    getProfile: noop,
    updateProfile: noop,
    listMembers: noop,
    createMember: noop,
    getMember: noop,
    updateMember: noop,
    bulkDeleteMembers: noop,
  } as unknown as UsersController;
}

function fakeProductsController(): ProductsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listProducts: noop,
    createProduct: noop,
    getProductDevices: noop,
    updateProduct: noop,
    deleteProduct: noop,
    bulkDeleteProducts: noop,
    getProductsByCompany: noop,
    getEncryptToken: noop,
    getProductSettings: noop,
    storeProductSettings: noop,
    storeUserPreferenceAttributes: noop,
    createAttributePreference: noop,
    getAttributePreference: noop,
    getAttributePreferenceSettings: noop,
    updateAttributePreference: noop,
    deleteAttributePreference: noop,
    markAsUniqueIdentifier: noop,
    unmarkAsUniqueIdentifier: noop,
    markRole: noop,
    unmarkRole: noop,
    previewMapping: noop,
    listTemplates: noop,
    getTemplate: noop,
    listManufacturers: noop,
    createTemplate: noop,
    createTemplateFromProduct: noop,
  } as unknown as ProductsController;
}

function fakeProtocolsController(): ProtocolsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listProtocols: noop,
    createProtocol: noop,
    getProtocol: noop,
    updateProtocol: noop,
    deleteProtocol: noop,
  } as unknown as ProtocolsController;
}

function fakePlansController(): PlansController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listPlans: noop,
    createPlan: noop,
    getPlan: noop,
    updatePlan: noop,
    assignModules: noop,
  } as unknown as PlansController;
}

function fakeOnboardingController(): OnboardingController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    verifyToken: noop,
    resendVerificationEmail: noop,
  } as unknown as OnboardingController;
}

function fakeContactsSettingsNotificationsController(): ContactsSettingsNotificationsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listContacts: noop,
    createContact: noop,
    getContact: noop,
    deleteContact: noop,
    listSettings: noop,
    getSetting: noop,
    updateSettings: noop,
    createNotification: noop,
    listNotifications: noop,
    markNotificationRead: noop,
    deleteNotification: noop,
  } as unknown as ContactsSettingsNotificationsController;
}

function fakeSuperadminController(): SuperadminController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    totalUsersPerCompany: noop,
    totalSubscriptions: noop,
  } as unknown as SuperadminController;
}

function fakeAiSuggestionsController(): AiSuggestionsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return { highlightAttributes: noop } as unknown as AiSuggestionsController;
}

function fakeConnectivityController(): ConnectivityController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return { index: noop, show: noop } as unknown as ConnectivityController;
}

function fakeMqttConfigurationsController(): MqttConfigurationsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    list: noop,
    getActive: noop,
    show: noop,
    create: noop,
    update: noop,
    destroy: noop,
    testConnection: noop,
  } as unknown as MqttConfigurationsController;
}

function fakeDevicesController(): DevicesController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listDevices: noop,
    createDevice: noop,
    updateDevice: noop,
    deleteDevice: noop,
    getDevicePoints: noop,
    getDevicesByProduct: noop,
    enableDevice: noop,
    disableDevice: noop,
    bulkEnable: noop,
    bulkDisable: noop,
    bulkDestroy: noop,
    sendCommand: noop,
    sendBulkCommands: noop,
    listUserDevices: noop,
  } as unknown as DevicesController;
}

function fakeIngestionController(): IngestionController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return { storePacket: noop } as unknown as IngestionController;
}

function fakeRulesController(): RulesController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listRules: noop,
    getRule: noop,
    createRule: noop,
    updateRule: noop,
    deleteRule: noop,
    bulkActivate: noop,
    bulkDeactivate: noop,
    bulkForceDelete: noop,
    listAlarms: noop,
    acknowledgeAlarm: noop,
  } as unknown as RulesController;
}

function fakeDashboardsController(): DashboardsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listDashboards: noop,
    listAdminDashboards: noop,
    createDashboard: noop,
    getDashboard: noop,
    updateDashboard: noop,
    deleteDashboard: noop,
    getUserDashboards: noop,
    manageUsers: noop,
    countAll: noop,
    listAllUsers: noop,
    monthlyRegistrations: noop,
    getAnalytics: noop,
    getPacketHistory: noop,
    listWidgets: noop,
    createWidget: noop,
    getWidget: noop,
    updateWidget: noop,
    deleteWidget: noop,
    storeWidgetSettings: noop,
    storeWidgetSettingsResource: noop,
    listWidgetSettings: noop,
    getWidgetSetting: noop,
    updateWidgetSettings: noop,
    deleteWidgetSetting: noop,
    graphData: noop,
  } as unknown as DashboardsController;
}

function fakeAssetsController(): AssetsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listAssets: noop,
    createAsset: noop,
    getAsset: noop,
    updateAsset: noop,
    deleteAsset: noop,
    bulkDeleteAssets: noop,
    getCompanyAssetsTree: noop,
    addComponents: noop,
    getComponent: noop,
    updateComponent: noop,
    deleteComponent: noop,
    bulkUpdateComponents: noop,
    getStatusSummary: noop,
    componentsDevices: noop,
    statusAndDevices: noop,
    uploadFloorPlan: noop,
    getFloorPlan: noop,
    getBuildingFloorPlans: noop,
  } as unknown as AssetsController;
}

function fakeFleetVehiclesDriversController(): FleetVehiclesDriversController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listVehicles: noop,
    vehicleOptions: noop,
    exportVehicles: noop,
    bulkDeactivateVehicles: noop,
    bulkReactivateVehicles: noop,
    bulkDeleteVehicles: noop,
    vehicleCounts: noop,
    driverCounts: noop,
    companyIncidents: noop,
    deleteVehicle: noop,
    listAssignableTrackers: noop,
    fleetOptions: noop,
    updateVehicle: noop,
    deactivateVehicle: noop,
    reactivateVehicle: noop,
    updateDriver: noop,
    deactivateDriver: noop,
    reactivateDriver: noop,
    createVehicle: noop,
    getVehicle: noop,
    uploadVehicleImage: noop,
    assignDevice: noop,
    unassignDevice: noop,
    vehicleAssignmentHistory: noop,
    listDrivers: noop,
    driverOptions: noop,
    exportDrivers: noop,
    bulkDeactivateDrivers: noop,
    bulkReactivateDrivers: noop,
    bulkDeleteDrivers: noop,
    deleteDriver: noop,
    vehicleMaintenanceLogs: noop,
    vehicleFuelLogs: noop,
    vehicleYardHistory: noop,
    vehicleIncidents: noop,
    driverIncidents: noop,
    updateIncident: noop,
    deleteIncident: noop,
    deleteVehicleImage: noop,
    createDriver: noop,
    getDriver: noop,
    assignVehicle: noop,
    unassignVehicle: noop,
    storeIncident: noop,
    driverAssignmentHistory: noop,
    companyAssignmentHistory: noop,
  } as unknown as FleetVehiclesDriversController;
}

function fakeFleetTripsController(): FleetTripsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listTrips: noop,
    createTrip: noop,
    bulkDeleteTrips: noop,
    exportTrips: noop,
    tripCounts: noop,
    getTrip: noop,
    updateTrip: noop,
    startTrip: noop,
    completeTrip: noop,
    cancelTrip: noop,
    gpsTrail: noop,
    arriveStop: noop,
    deleteTrip: noop,
    departStop: noop,
    route: noop,
  } as unknown as FleetTripsController;
}

function fakeFleetGeofencesController(): FleetGeofencesController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listGeofences: noop,
    geofenceOptions: noop,
    exportGeofences: noop,
    exportEvents: noop,
    bulkEnableGeofences: noop,
    bulkDisableGeofences: noop,
    bulkDeleteGeofences: noop,
    createGeofence: noop,
    updateGeofence: noop,
    deleteGeofence: noop,
    listEvents: noop,
  } as unknown as FleetGeofencesController;
}

function fakeFleetYardsController(): FleetYardsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listYards: noop,
    yardOptions: noop,
    exportYards: noop,
    bulkDeactivateYards: noop,
    bulkReactivateYards: noop,
    bulkDeleteYards: noop,
    deleteYard: noop,
    deleteSlot: noop,
    deleteLayout: noop,
    updateYard: noop,
    deactivateYard: noop,
    reactivateYard: noop,
    updateSlot: noop,
    createYard: noop,
    getYard: noop,
    uploadLayout: noop,
    createSlot: noop,
    checkIn: noop,
    checkOut: noop,
  } as unknown as FleetYardsController;
}

function fakeFleetFuelMaintenanceComplianceController(): FleetFuelMaintenanceComplianceController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    storeMaintenanceSchedule: noop,
    storeMaintenanceLog: noop,
    storeFuelLog: noop,
    listComplianceDocuments: noop,
    storeComplianceDocument: noop,
    updateMaintenanceSchedule: noop,
    deleteMaintenanceSchedule: noop,
    updateMaintenanceLog: noop,
    deleteMaintenanceLog: noop,
    updateFuelLog: noop,
    deleteFuelLog: noop,
    updateComplianceDocument: noop,
    deleteComplianceDocument: noop,
    expiringSoonComplianceDocuments: noop,
  } as unknown as FleetFuelMaintenanceComplianceController;
}

function fakeFleetDashboardController(): FleetDashboardController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    overview: noop,
    trends: noop,
    vehiclePerformance: noop,
    exportVehiclePerformance: noop,
    statusSummary: noop,
    alerts: noop,
    financial: noop,
  } as unknown as FleetDashboardController;
}

function fakeFleetCrmBillingController(): FleetCrmBillingController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listFleetCustomers: noop,
    createFleetCustomer: noop,
    getFleetCustomer: noop,
    updateFleetCustomer: noop,
    deleteFleetCustomer: noop,
    listContracts: noop,
    createContract: noop,
    getContract: noop,
    updateContract: noop,
    deleteContract: noop,
    listRateCards: noop,
    createRateCard: noop,
    updateRateCard: noop,
    deleteRateCard: noop,
    gateways: noop,
    generateEvents: noop,
    listPendingEvents: noop,
    createInvoice: noop,
    listInvoices: noop,
    getInvoice: noop,
    initiatePayment: noop,
    markPaid: noop,
    paymentHistory: noop,
  } as unknown as FleetCrmBillingController;
}

function fakeFleetAnalyticsController(): FleetAnalyticsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    summary: noop,
    listAttention: noop,
    yardSummary: noop,
    geofenceSummary: noop,
    tripsReportHandler: noop,
    tripsReportExport: noop,
    fuelReportHandler: noop,
    fuelReportExport: noop,
    maintenanceReportHandler: noop,
    complianceReportHandler: noop,
    complianceReportExport: noop,
    driversReportHandler: noop,
    driversReportExport: noop,
    incidentsSummaryHandler: noop,
    utilisationReportHandler: noop,
    utilisationReportExport: noop,
  } as unknown as FleetAnalyticsController;
}

function fakeFleetRecordsController(): FleetRecordsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    listMaintenanceLogs: noop,
    exportMaintenanceLogs: noop,
    listFuelLogs: noop,
    exportFuelLogs: noop,
    complianceCounts: noop,
  } as unknown as FleetRecordsController;
}

function fakeFleetMaintenanceDueController(): FleetMaintenanceDueController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return { list: noop, exportSchedules: noop } as unknown as FleetMaintenanceDueController;
}

function fakeFleetSettingsController(): FleetSettingsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return { getSettings: noop, updateSettings: noop } as unknown as FleetSettingsController;
}

function fakeFleetPositionsController(): FleetPositionsController {
  const noop = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } }
  ) => {
    res.status(501).json({ success: false, message: 'not implemented in this smoke test' });
  };
  return {
    positions: noop,
    history: noop,
  } as unknown as FleetPositionsController;
}

function buildApp(prismaOk: boolean, redisOk: boolean) {
  return createApp({
    prisma: fakePrisma(prismaOk) as unknown as AppPrismaClient,
    redis: fakeRedis(redisOk) as Redis,
    authController: fakeAuthController(),
    rbacController: fakeRbacController(),
    usersController: fakeUsersController(),
    productsController: fakeProductsController(),
    protocolsController: fakeProtocolsController(),
    devicesController: fakeDevicesController(),
    ingestionController: fakeIngestionController(),
    rulesController: fakeRulesController(),
    dashboardsController: fakeDashboardsController(),
    assetsController: fakeAssetsController(),
    fleetVehiclesDriversController: fakeFleetVehiclesDriversController(),
    fleetTripsController: fakeFleetTripsController(),
    fleetGeofencesController: fakeFleetGeofencesController(),
    fleetYardsController: fakeFleetYardsController(),
    fleetFuelMaintenanceComplianceController: fakeFleetFuelMaintenanceComplianceController(),
    fleetDashboardController: fakeFleetDashboardController(),
    fleetCrmBillingController: fakeFleetCrmBillingController(),
    fleetPositionsController: fakeFleetPositionsController(),
    fleetSettingsController: fakeFleetSettingsController(),
    fleetMaintenanceDueController: fakeFleetMaintenanceDueController(),
    fleetRecordsController: fakeFleetRecordsController(),
    fleetAnalyticsController: fakeFleetAnalyticsController(),
    plansController: fakePlansController(),
    onboardingController: fakeOnboardingController(),
    contactsSettingsNotificationsController: fakeContactsSettingsNotificationsController(),
    superadminController: fakeSuperadminController(),
    aiSuggestionsController: fakeAiSuggestionsController(),
    connectivityController: fakeConnectivityController(),
    mqttConfigurationsController: fakeMqttConfigurationsController(),
  });
}

describe('createApp', () => {
  it('GET /health returns 200 with no dependency checks', async () => {
    const app = buildApp(true, true);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200 when Postgres and Redis are reachable', async () => {
    const app = buildApp(true, true);

    const res = await request(app).get('/ready');
    const body = res.body as { status: string; checks: unknown[] };

    expect(res.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'postgres', ok: true }),
        expect.objectContaining({ name: 'redis', ok: true }),
      ])
    );
  });

  it('GET /ready returns 503 when a dependency is unreachable', async () => {
    const app = buildApp(false, true);

    const res = await request(app).get('/ready');
    const body = res.body as { status: string };

    expect(res.status).toBe(503);
    expect(body.status).toBe('not-ready');
  });

  it("GET /docs/openapi.json serves a valid OpenAPI document, including module 1.2's auth paths", async () => {
    const app = buildApp(true, true);

    const res = await request(app).get('/docs/openapi.json');
    const body = res.body as { openapi: string; paths: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths).toHaveProperty('/login');
    expect(body.paths).toHaveProperty('/companies');
  });

  it('unknown routes fall through to a 404', async () => {
    const app = buildApp(true, true);

    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
  });
});
