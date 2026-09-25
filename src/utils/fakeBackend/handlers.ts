// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { http, HttpResponse } from 'msw';
import {
  login,
  updateUserSettings,
  fetchAnalytics,
  fetchProducts,
  fetchProductDevcies,
  deleteProduct,
  fetchProductSettings,
  fetchDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  fetchProfile,
  fetchAssetHierarchyTree,
  fetchAssetData,
  fetchAssetSummary,
  fetchAssetDevices,
  fetchProductDetails,
  createWidget,
  updateWidget,
  createWidgetSettings,
  updateWidgetSettings,
  fetchWidgetSettings,
  deleteWidget,
  fetchDashboardWidgets,
  checkConfiguredDevices,
  addDemoProduct,
  SimulationEngine,
} from './controllers';
import {
  fetchVehicles,
  createVehicle,
  fetchVehicleDetail,
  assignDeviceToVehicle,
  unassignDeviceFromVehicle,
  assignVehicleToDriver,
  unassignVehicleFromDriver,
  createMaintenanceSchedule,
  createMaintenanceLog,
  createFuelLog,
  fetchDrivers,
  createDriver,
  fetchDriverDetail,
  createDriverIncident,
  fetchGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  fetchGeofenceEvents,
  fetchYards,
  createYard,
  fetchYardDetail,
  uploadYardLayout,
  createYardSlot,
  yardSlotCheckIn,
  yardSlotCheckOut,
  fetchTrips,
  createTrip,
  fetchTripDetail,
  startTrip,
  completeTrip,
  cancelTrip,
  fetchComplianceDocuments,
  createComplianceDocument,
} from './fleetControllers';
import { wrapInLaravelMockPagination } from './helpers';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const handlers = [
  http.post(`${BASE_URL}api/login`, async () => {
    const result = await login();
    return HttpResponse.json({
      ...result,
      success: true,
      message: 'Login successful',
    });
  }),
  http.post(`${BASE_URL}api/settings/user/update`, async ({ request }) => {
    const payload = await request.json();
    await updateUserSettings(payload);
    return HttpResponse.json({
      // data: result,
      success: true,
      message: 'Success!',
    });
  }),
  http.get(`${BASE_URL}api/dashboard/analytics`, async () => {
    const result = await fetchAnalytics();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Dashboard analytics fetched successfully',
    });
  }),
  http.get(`${BASE_URL}api/products`, async () => {
    const result = await fetchProducts();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Products fetched successfully.',
    });
  }),
  http.get(`${BASE_URL}api/products/:id`, async ({ params }) => {
    const result = await fetchProductDevcies(params.id);
    return HttpResponse.json({
      data: result,
      success: true,
      // message: "Products fetched successfully.",
    });
  }),
  http.get(`${BASE_URL}api/product-settings/:id`, async ({ params }) => {
    const result = await fetchProductSettings(params.id);
    return HttpResponse.json({
      ...result,
      success: true,
      message: 'Product settings retrieved successfully.',
    });
  }),
  http.post(`${BASE_URL}api/attribute/preference/setting/store`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.post(`${BASE_URL}api/store-product-settings`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.get(`${BASE_URL}api/attribute/preference/setting/:id`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.put(`${BASE_URL}api/attribute/preference/setting/:id`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.post(`${BASE_URL}api/attribute/preference/marked-as-unique`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.post(`${BASE_URL}api/products/bulk/destroy`, async ({ request }) => {
    const payload = await request.json();
    await deleteProduct(payload);
    return HttpResponse.json({
      success: true,
      message: "Product and it's related assets deleted successfully",
    });
  }),
  http.get(`${BASE_URL}api/user/:id/dashboards`, async () => {
    const result = await fetchDashboards();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Fetched user dashboard list successfully',
    });
  }),
  http.post(`${BASE_URL}api/dashboards`, async ({ request }) => {
    const payload = await request.json();
    const result = await createDashboard(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Fetched user dashboard list successfully',
    });
  }),
  http.get(`${BASE_URL}api/dashboards/:id`, async ({ params }) => {
    const result = await fetchDashboardWidgets(params);
    return HttpResponse.json(result);
  }),
  http.put(`${BASE_URL}api/dashboards/:id`, async ({ params, request }) => {
    const payload = await request.json();
    await updateDashboard(payload, params);
    return HttpResponse.json({ success: true, message: 'Dashboard updated successfully' });
  }),
  http.delete(`${BASE_URL}api/dashboards/:id`, async ({ params }) => {
    const dashboardId = params.id;
    await deleteDashboard(dashboardId);
    return HttpResponse.json({
      // data: result,
      success: true,
      message: 'Dashboard deleted successfully.',
    });
  }),
  http.get(`${BASE_URL}api/profile`, async () => {
    const result = await fetchProfile();
    return HttpResponse.json({
      data: { user: result, user_image: null },
      success: true,
      message: 'Fetch user profile details successfully.',
    });
  }),
  http.put(`${BASE_URL}api/devices/:id`, async () => {
    return HttpResponse.json(
      {
        success: false,
        message: 'You do not have permission to perform this action.',
      },
      { status: 422 }
    );
  }),
  http.get(`${BASE_URL}api/devices/product/:id`, async ({ params }) => {
    const result = await fetchProductDetails(params.id);
    return HttpResponse.json({
      ...result,
      message: 'Devices retrieved successfully.',
      success: true,
    });
  }),
  http.get(`${BASE_URL}api/assets`, async () => {
    const assetTree = await fetchAssetHierarchyTree();
    return HttpResponse.json({
      success: true,
      message: 'Asset hierarchy tree map loaded successfully.',
      assets: [assetTree], // Will return your exact nested building JSON block directly!
    });
  }),
  http.get(`${BASE_URL}api/assets/:id`, async () => {
    const assetData = await fetchAssetData();
    // console.log("assetTree",assetTree)
    return HttpResponse.json({
      success: true,
      message: 'Asset hierarchy tree map loaded successfully.',
      asset: assetData,
    });
  }),
  http.get(`${BASE_URL}api/assets/:id/status-summary`, async ({ params }) => {
    const result = await fetchAssetSummary(params);
    return HttpResponse.json(result);
  }),
  http.get(`${BASE_URL}api/devices/:id`, async () => {
    const result = await fetchAssetDevices();
    return HttpResponse.json({
      ...result,
      // message: 'Devices retrieved successfully.',
      success: true,
    });
  }),
  http.post(`${BASE_URL}api/widgets`, async ({ request }) => {
    const payload = await request.json();
    const result = await createWidget(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Widget created successfully.',
    });
  }),
  http.put(`${BASE_URL}api/widgets/:id`, async ({ request, params }) => {
    const payload = await request.json();
    const result = await updateWidget(payload, params);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Widget updated successfully.',
    });
  }),
  http.post(`${BASE_URL}api/widgets/:id/settings`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createWidgetSettings(payload, params);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Widget settings saved successfully.',
    });
  }),
  http.put(`${BASE_URL}api/widget-settings/:id`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await updateWidgetSettings(payload, params);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Widget settings updated successfully.',
    });
  }),
  http.get(`${BASE_URL}api/widgets/:id`, async ({ params }) => {
    const widgetSettings = await fetchWidgetSettings(params);
    return HttpResponse.json({
      success: true,
      message: 'Retrieving widget settings.',
      data: widgetSettings,
    });
  }),
  http.delete(`${BASE_URL}api/widgets/:id`, async ({ params }) => {
    await deleteWidget(params);
    return HttpResponse.json({
      // data: result,
      success: true,
      message: 'Widget deleted successfully',
    });
  }),
  http.get(`${BASE_URL}api/check-configured-devices`, async () => {
    const confiredDevices = await checkConfiguredDevices();
    return HttpResponse.json(confiredDevices);
  }),
  http.post(`${BASE_URL}api/add-demo-product`, async ({ request }) => {
    const payload = await request.json();
    await addDemoProduct(payload);
    return HttpResponse.json({ success: true, message: 'Demo products addedd successfully!' });
  }),
  http.post(`${BASE_URL}api/simulate-packet`, async ({ request }) => {
    const payload = await request.json();
    SimulationEngine.start(payload);
    // console.log("payload-simulate-packet:",payload)
    return HttpResponse.json({ success: true, message: 'Simulation configured successfully!' });
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Vehicles
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/vehicles`, async () => {
    const result = await fetchVehicles();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Vehicles fetched successfully.',
    });
  }),
  http.post(`${BASE_URL}api/vehicles`, async ({ request }) => {
    const payload = await request.json();
    const result = await createVehicle(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Vehicle created successfully.',
    });
  }),
  http.get(`${BASE_URL}api/vehicles/:id`, async ({ params }) => {
    const result = await fetchVehicleDetail(params.id);
    if (!result) {
      return HttpResponse.json({ success: false, message: 'Vehicle not found.' }, { status: 404 });
    }
    return HttpResponse.json({ data: result, success: true });
  }),
  http.post(`${BASE_URL}api/vehicles/:id/assign-device`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await assignDeviceToVehicle(params.id, payload.device_id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/vehicles/:id/unassign-device`, async ({ params }) => {
    const result = await unassignDeviceFromVehicle(params.id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/vehicles/:id/maintenance-schedules`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createMaintenanceSchedule(params.id, payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Maintenance schedule created.',
    });
  }),
  http.post(`${BASE_URL}api/vehicles/:id/maintenance-logs`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createMaintenanceLog(params.id, payload);
    return HttpResponse.json({ data: result, success: true, message: 'Service logged.' });
  }),
  http.post(`${BASE_URL}api/vehicles/:id/fuel-logs`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createFuelLog(params.id, payload);
    return HttpResponse.json({ data: result, success: true, message: 'Fuel logged.' });
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Drivers
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/drivers`, async () => {
    const result = await fetchDrivers();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Drivers fetched successfully.',
    });
  }),
  http.post(`${BASE_URL}api/drivers`, async ({ request }) => {
    const payload = await request.json();
    const result = await createDriver(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Driver created successfully.',
    });
  }),
  http.get(`${BASE_URL}api/drivers/:id`, async ({ params }) => {
    const result = await fetchDriverDetail(params.id);
    if (!result) {
      return HttpResponse.json({ success: false, message: 'Driver not found.' }, { status: 404 });
    }
    return HttpResponse.json({ data: result, success: true });
  }),
  http.post(`${BASE_URL}api/drivers/:id/assign-vehicle`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await assignVehicleToDriver(params.id, payload.vehicle_id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/drivers/:id/unassign-vehicle`, async ({ params }) => {
    const result = await unassignVehicleFromDriver(params.id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/drivers/:id/incidents`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createDriverIncident(params.id, payload);
    return HttpResponse.json({ data: result, success: true, message: 'Incident logged.' });
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Geofences
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/geofences/events`, async ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 20;
    const result = await fetchGeofenceEvents(limit);
    return HttpResponse.json({ data: result, success: true, message: 'Geofence events fetched.' });
  }),
  http.get(`${BASE_URL}api/geofences`, async () => {
    const result = await fetchGeofences();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Geofences fetched successfully.',
    });
  }),
  http.post(`${BASE_URL}api/geofences`, async ({ request }) => {
    const payload = await request.json();
    const result = await createGeofence(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Geofence created successfully.',
    });
  }),
  http.put(`${BASE_URL}api/geofences/:id`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await updateGeofence(params.id, payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Geofence updated successfully.',
    });
  }),
  http.delete(`${BASE_URL}api/geofences/:id`, async ({ params }) => {
    await deleteGeofence(params.id);
    return HttpResponse.json({ success: true, message: 'Geofence deleted successfully.' });
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Yards
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/yards`, async () => {
    const result = await fetchYards();
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Yards fetched successfully.',
    });
  }),
  http.post(`${BASE_URL}api/yards`, async ({ request }) => {
    const payload = await request.json();
    const result = await createYard(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Yard created successfully.',
    });
  }),
  http.get(`${BASE_URL}api/yards/:id`, async ({ params }) => {
    const result = await fetchYardDetail(params.id);
    if (!result) {
      return HttpResponse.json({ success: false, message: 'Yard not found.' }, { status: 404 });
    }
    return HttpResponse.json({ data: result, success: true });
  }),
  http.post(`${BASE_URL}api/yards/:id/layout`, async ({ params, request }) => {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) {
      return HttpResponse.json({ success: false, message: 'No image provided.' }, { status: 422 });
    }
    const result = await uploadYardLayout(params.id, file);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Layout uploaded successfully.',
    });
  }),
  http.post(`${BASE_URL}api/yards/:id/slots`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await createYardSlot(params.id, payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Slot created successfully.',
    });
  }),
  http.post(`${BASE_URL}api/yard-slots/:id/check-in`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await yardSlotCheckIn(params.id, payload.vehicle_id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/yard-slots/:id/check-out`, async ({ params }) => {
    const result = await yardSlotCheckOut(params.id);
    return HttpResponse.json(result);
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Trips
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/trips`, async () => {
    const result = await fetchTrips();
    return HttpResponse.json({
      data: wrapInLaravelMockPagination(result),
      success: true,
      message: 'Trips fetched successfully.',
    });
  }),
  http.post(`${BASE_URL}api/trips`, async ({ request }) => {
    const payload = await request.json();
    const result = await createTrip(payload);
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Trip created successfully.',
    });
  }),
  http.get(`${BASE_URL}api/trips/:id`, async ({ params }) => {
    const result = await fetchTripDetail(params.id);
    if (!result) {
      return HttpResponse.json({ success: false, message: 'Trip not found.' }, { status: 404 });
    }
    return HttpResponse.json({ data: result, success: true });
  }),
  http.post(`${BASE_URL}api/trips/:id/start`, async ({ params }) => {
    const result = await startTrip(params.id);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/trips/:id/complete`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await completeTrip(params.id, payload);
    return HttpResponse.json(result);
  }),
  http.post(`${BASE_URL}api/trips/:id/cancel`, async ({ params, request }) => {
    const payload = await request.json();
    const result = await cancelTrip(params.id, payload);
    return HttpResponse.json(result);
  }),

  // -------------------------------------------------------------------
  // Fleet Management — Compliance documents (shared: vehicles + drivers)
  // -------------------------------------------------------------------
  http.get(`${BASE_URL}api/compliance-documents`, async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const result = await fetchComplianceDocuments(
      params.get('documentable_type'),
      params.get('documentable_id')
    );
    return HttpResponse.json({
      data: result,
      success: true,
      message: 'Compliance documents fetched.',
    });
  }),
  http.post(`${BASE_URL}api/compliance-documents`, async ({ request }) => {
    const payload = await request.json();
    const result = await createComplianceDocument(payload);
    return HttpResponse.json({ data: result, success: true, message: 'Document added.' });
  }),
];
