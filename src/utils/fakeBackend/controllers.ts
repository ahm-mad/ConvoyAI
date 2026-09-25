// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { demoDb } from './db';
import { wrapInLaravelMockPagination, formatDateTime, formatRelativeTime } from './helpers';
import { fetchAssetsDemoData, userDemoPreferences } from './Data';
import { triggerMockSocketEvent } from './mockSocket';

async function login() {
  const baseUser = await demoDb.users.get('demo-user-1');
  const companyData = await demoDb.company.get(baseUser.company_id);
  const databaseRoles = await demoDb.roles
    .where('company_id')
    .equals(baseUser.company_id)
    .toArray();

  const formattedUser = {
    ...baseUser,
    company: companyData,
    roles: databaseRoles,
  };

  return {
    user: formattedUser,
    token: 'demoAccountToken',
  };
}
async function updateUserSettings(payload) {
  await demoDb.users.update('demo-user-1', payload);
}
async function fetchAnalytics() {
  const targetUserId = 'demo-user-1';
  const now = Date.now();

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  const userDevices = await demoDb.devices.where('userId').equals(targetUserId).toArray();

  let onlineCount = 0;
  let offlineCount = 0;
  let active24hCount = 0;

  const recentlyActiveDevices = [];
  const offlineDevicesList = [];

  // const formatRelativeTime = (msDiff) => {
  //     if (!msDiff && msDiff !== 0) return "Never";
  //     const minutes = Math.floor(msDiff / 60000);
  //     const hours = Math.floor(minutes / 60);
  //     const days = Math.floor(hours / 24);

  //     if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  //     if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  //     if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  //     return "Just now";
  // };

  // const formatDateTime = (timestamp) => {
  //     if (!timestamp) return null;
  //     return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
  // };

  userDevices.forEach(device => {
    const latestPacket = device.latest_packet;
    const latestTimestamp = latestPacket ? latestPacket.timestamp : null;
    const msDiff = latestTimestamp ? now - latestTimestamp : null;

    const formattedDeviceRecord = {
      id: device.id,
      name: device.name,
      device_unique_identifier: device.device_unique_identifier,
      last_heard: formatRelativeTime(latestTimestamp),
      last_heard_at: formatDateTime(latestTimestamp),
    };

    if (latestTimestamp && msDiff <= TWO_HOURS_MS) {
      onlineCount++;
      active24hCount++;
      recentlyActiveDevices.push(formattedDeviceRecord);
    } else {
      offlineCount++;
      offlineDevicesList.push(formattedDeviceRecord);

      if (latestTimestamp && msDiff <= TWENTY_FOUR_HOURS_MS) {
        active24hCount++;
      }
    }
  });

  return {
    total_devices: userDevices.length,
    online_devices: onlineCount,
    offline_devices: offlineCount,
    active_in_last_24h: active24hCount,
    recently_active_devices: recentlyActiveDevices,
    offline_devices_list: offlineDevicesList,
  };
}
async function fetchProducts() {
  const targetUserId = 'demo-user-1';
  const userDevices = await demoDb.devices.where('userId').equals(targetUserId).toArray();
  const uniqueProductIds = [...new Set(userDevices.map(d => d.productId))];
  const productRecords = await Promise.all(uniqueProductIds.map(id => demoDb.products.get(id)));
  const userProducts = productRecords.filter(product => product !== undefined);
  return wrapInLaravelMockPagination(userProducts);
}
async function fetchProductDevcies(productId) {
  const devices = await demoDb.devices.where('productId').equals(productId).toArray();
  const transformedDevices = devices.map(device => {
    const hasPacket = device.latest_packet;

    return {
      id: device.id,
      device_unique_identifier: device.device_unique_identifier || null,
      name: device.name || 'Unnamed Device',
      type: device.type || null,
      status: device.status || 'active',
      location: device.location || 'Arfa Tower',
      tags: device.tags || 'Live device',
      product_id: device.productId,
      user_id: device.userId,
      created_at: formatDateTime(device.created_at),
      updated_at: formatDateTime(device.updated_at),
      last_updated: formatDateTime(hasPacket ? device.latest_packet.timestamp : null),
      latest_device_value: hasPacket ? device.latest_packet.value : null,
    };
  });
  const formattedResponse = {
    devices: transformedDevices,
    filters: {},
    pagination: {
      current_page: 1,
      from: 1,
      has_more_pages: false,
      last_page: 1,
      per_page: 10,
      to: transformedDevices.length,
      total: transformedDevices.length,
      path: `http://example.com{productId}`,
    },
  };

  return formattedResponse;
}
async function fetchProductDetails(productId) {
  const devices = await demoDb.devices.where('productId').equals(productId).toArray();
  let aassigned_device_ids = [];
  let data = [];
  devices.forEach(dev => {
    aassigned_device_ids.push(`${dev.id}`);
    data.push(dev);
  });
  const userPreference = userDemoPreferences[productId];
  return {
    aassigned_device_ids,
    data,
    userPreference,
  };
}
async function fetchProductSettings(productId) {
  const product = await demoDb.products.where('id').equals(productId).first();
  console.log('checkckin', product);
  const raw_packet = {
    dr: 3,
    adr: true,
    data: 'DgAADwQAAQ==',
    fCnt: 12,
    time: '2025-08-25T14:15:33.159689164+00:00',
    fPort: 10,
    object: {
      move: null,
      bytes: [14, 0, 0, 15, 4, 0, 1],
      light: null,
      activity: null,
      humidity: null,
      reed_count: null,
      reed_state: null,
      temperature: 6,
      external_input: true,
      warmcoldthresh: false,
      battery_voltage: 2,
    },
    rxInfo: [
      {
        snr: 9.8,
        rssi: -38,
        nsTime: '2025-08-25T14:15:32.943414043+00:00',
        channel: 6,
        context: 'cdJyvA==',
        location: [],
        uplinkId: 38165,
        crcStatus: 'CRC_OK',
        gatewayId: '647fdafffe005960',
      },
    ],
    txInfo: {
      frequency: 903500000,
      modulation: {
        lora: {
          codeRate: 'CR_4_5',
          bandwidth: 125000,
          spreadingFactor: 7,
        },
      },
    },
    devAddr: '01cd9e9c',
    confirmed: false,
    deviceInfo: {
      tags: [],
      devEui: '1234567890',
      tenantId: 'a8d41aeb-323b-42b4-be1f-e56b895215e1',
      deviceName: 'holo test max-one-p new',
      tenantName: 'ChirpStack',
      applicationId: '49e93702-cf83-4c3c-90d0-19a293dd0328',
      applicationName: 'TEST HOLO ',
      deviceProfileId: 'a2fbc345-7e70-4bd7-b284-f00e83d76b4d',
      deviceProfileName: 'MAX-ONE-P',
      deviceClassEnabled: 'CLASS_A',
    },
    regionConfigId: 'us915_0',
    deduplicationId: '0154198e-b6c1-4511-9f9b-4f8eace36437',
  };
  const token =
    'eyJkYXRhIjoiMlpsMVpRVVhkdlY0WDl3eXRvUk5jZmRxallibHpUQzh6c05QSWFHbndmQU9pTjZySmp3VU1IRnR1REJaR2lldCIsImhhc2giOiIyNGE0MTVhMWViMTJiZGY1ZGZjMGI3MWU4MjM2NjQ1NmNmMzlhY2UxMTQ2ZjA5MWYwZGY2ODc3ZjE4ZDIxZjYxIn0=';
  const user_preference_attributes = userDemoPreferences[productId];
  //  [
  //   {
  //     id: 1,
  //     label: 'devEUI',
  //     unit: null,
  //     attribute_key: 'deviceInfo.devEui',
  //     is_selected: 1,
  //     is_unique_identifier: true,
  //   },
  //   {
  //     id: 2,
  //     label: 'Temperature',
  //     unit: null,
  //     attribute_key: 'object.temperature',
  //     is_selected: 1,
  //     is_unique_identifier: false,
  //   },
  // ];
  return {
    product_id: product.id,
    product_name: product.name,
    raw_packet,
    token,
    user_preference_attributes,
  };
}
async function deleteProduct(payload) {
  const targetProductId = payload.product_ids?.[0];
  await demoDb.transaction('rw', [demoDb.products, demoDb.devices, demoDb.widgets], async () => {
    await demoDb.products.delete(targetProductId);
    await demoDb.devices.where('productId').equals(targetProductId).delete();
    await demoDb.widgets.where('productId').equals(targetProductId).delete();
  });
  return { success: true, message: "Product and it's related assets deleted successfully" };
}
async function fetchDashboards() {
  const targetUserId = 'demo-user-1';
  const userDashboards = await demoDb.dashboards.where('userId').equals(targetUserId).toArray();
  return userDashboards;
}
async function createDashboard(payload) {
  console.log('reqeust', payload);
  const targetUserId = 'demo-user-1';
  const newDashboard = {
    id: `demo-dashboard-${crypto.randomUUID()}`,
    name: payload.name,
    userId: targetUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await demoDb.dashboards.add(newDashboard);

  return newDashboard;
}
async function updateDashboard(payload, params) {
  await demoDb.dashboards.update(params.id, payload);
}
async function deleteDashboard(id) {
  if (!id) return false;
  await demoDb.transaction(
    'rw',
    [demoDb.dashboards, demoDb.widgets, demoDb.widgetSettings],
    async () => {
      const widgets = await demoDb.widgets.where('dashboard_id').equals(id).toArray();
      const widgetIds = widgets.map(w => w.id);
      await demoDb.dashboards.delete(id);
      await demoDb.widgets.where('dashboard_id').equals(id).delete();
      if (widgetIds.length > 0) {
        await demoDb.widgetSettings.where('widgetId').anyOf(widgetIds).delete();
      }
    }
  );
  return true;
}
async function fetchProfile() {
  const userProfile = await demoDb.users.where('email').equals('demoAccount@chirptech.io').first();
  return userProfile;
}
async function fetchAssetHierarchyTree() {
  const dummyBuildingAsset = {
    asset_id: 'demo-asset-1',
    children: [],
    created_at: new Date().toISOString(),
    description: null,
    icon: 'BuildingIcon',
    id: 'demo-asset-1',
    name: 'building',
    type: 'BuildingIcon',
    updated_at: new Date().toISOString(),
  };
  return dummyBuildingAsset;
}
async function fetchAssetData() {
  const userDevices = await demoDb.devices
    // .where('userId')
    // .equals('demo-user-1')
    .toArray();
  const obj = {};
  let alerts_count = 0;
  userDevices.forEach(device => {
    if (!obj[device.id]) {
      obj[device.id] = { latest_device_values: {} };
    }
    obj[device.id].latest_device_values.device_unique_identifier = device.device_unique_identifier;
    obj[device.id].latest_device_values.battery_voltage = device.battery_voltage;
    obj[device.id].latest_device_values[device.attribute] = device.latest_packet?.value;
    obj[device.id].is_alert = device.latest_packet?.isAlert;
    obj[device.id].alert_attributes = device.latest_packet?.isAlert ? [device.attribute] : [];
    alerts_count += device.alerts_count;
  });
  obj.alerts_count = alerts_count;
  return fetchAssetsDemoData(obj);
}
async function fetchAssetSummary(params) {
  const userDevices = await demoDb.devices.where('userId').equals('demo-user-1').toArray();
  let alerts_count = 0;
  let offline_devices = 0;
  let online_devices = 0;
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  userDevices.forEach(device => {
    const latestPacket = device.latest_packet;
    const latestTimestamp = latestPacket ? latestPacket.timestamp : null;
    const msDiff = latestTimestamp ? now - latestTimestamp : null;
    if (latestTimestamp && msDiff <= TWO_HOURS_MS) {
      online_devices++;
      // active24hCount++;
      // recentlyActiveDevices.push(formattedDeviceRecord);
    } else {
      offline_devices++;
    }
    alerts_count += device.alerts_count;
  });
  return {
    alerts_count,
    offline_devices,
    online_devices,
    success: true,
    id: params.id,
  };
}
async function fetchAssetDevices() {
  const userDevices = await demoDb.devices.where('userId').equals('demo-user-1').toArray();
  const assetDevices = userDevices.map(ud => ({
    asset_id: 'demo-asset-1',
    attributes: [
      {
        isAlert: ud.latest_packet?.isAlert,
        last_packet_value: ud.latest_packet?.value,
        widgetType: ud.widgetType,
        label: userDemoPreferences[ud.productId].find(p => !p.is_unique_identifier).label,
        unit: userDemoPreferences[ud.productId].find(p => !p.is_unique_identifier).unit,
      },
    ],
    name: ud.name,
    status: 'active',
    uuid: ud.id,
    created_at: ud.latest_packet?.timestamp ? new Date(ud.latest_packet?.timestamp) : '',
    // child_id_1:,
    // child_id_2:,
    // child_id_3:,
    // child_id_4:,
  }));
  const formattedResponse = {
    devices: assetDevices,
    filters: {},
    pagination: {
      current_page: 1,
      from: 1,
      has_more_pages: false,
      last_page: 1,
      per_page: 10,
      to: assetDevices.length,
      total: assetDevices.length,
    },
  };
  return formattedResponse;
}
async function createWidget(payload) {
  const newWidget = {
    ...payload,
    id: `demo-widget-${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await demoDb.widgets.add(newWidget);
  return newWidget;
}
async function updateWidget(payload, params) {
  const updatedWidget = {
    h: payload.h,
    w: payload.w,
    x: payload.x,
    y: payload.y,
    updated_at: new Date().toISOString(),
  };
  // await demoDb.widgets.add(newWidget);
  await demoDb.widgets.update(params.id, updatedWidget);
  return updatedWidget;
}
async function createWidgetSettings(payload, params) {
  // console.log('reqeustsample-setting', payload);
  const newWidgetSettings = {
    // ...payload,
    id: `demo-widget-setting-${crypto.randomUUID()}`,
    widgetId: params.id,
    name: payload.widget_name,
    attributes: payload.widget_settings?.[0].attributes,
    deviceId: payload.widget_settings?.[0].device,
    productId: payload.widget_settings?.[0].product,
    unit: payload.widget_settings?.[0].unit,
    label: payload.widget_settings?.[0].label,
    value_color: '#000000',
    text_color: '#000000',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await demoDb.transaction('rw', [demoDb.widgetSettings, demoDb.widgets], async () => {
    await demoDb.widgetSettings.add(newWidgetSettings);
    await demoDb.widgets.update(params.id, {
      deviceId: payload.widget_settings?.[0].device,
      productId: payload.widget_settings?.[0].product,
    });
  });
  return newWidgetSettings;
}
async function updateWidgetSettings(payload, params) {
  // console.log('reqeustsample-setting', payload);
  const updatedWidgetSettings = {
    // ...payload,
    // id: `demo-widget-setting-${crypto.randomUUID()}`,
    // widgetId: params.id,
    name: payload.widget_name,
    // attributes: payload.widget_settings?.[0].attributes,
    // deviceId: payload.widget_settings?.[0].device,
    // productId: payload.widget_settings?.[0].product,
    unit: payload.widget_settings?.[0].unit,
    label: payload.widget_settings?.[0].label,
    // value_color: '#000000',
    // text_color: '#000000',
    // created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await demoDb.widgetSettings.update(params.id, updatedWidgetSettings);
  // await demoDb.transaction('rw', [demoDb.widgetSettings, demoDb.widgets], async () => {
  //   await demoDb.widgetSettings.add(newWidgetSettings);
  //   await demoDb.widgets.update(params.id, {
  //     deviceId: payload.widget_settings?.[0].device,
  //     productId: payload.widget_settings?.[0].product,
  //   });
  // });
  return updatedWidgetSettings;
}
async function fetchWidgetSettings(params) {
  const widget = await demoDb.widgets.where('id').equals(params.id).first();
  // console.log('widget check', widget);
  const [widgetSettings, product, device] = await Promise.all([
    demoDb.widgetSettings.where('widgetId').equals(params.id).first(),
    demoDb.products.where('id').equals(widget.productId).first(),
    demoDb.devices.where('id').equals(widget.deviceId).first(),
  ]);
  return {
    id: widgetSettings.id,
    attributes: widgetSettings.attributes,
    device: widgetSettings.deviceId,
    device_name: device.name,
    label: widgetSettings.name,
    product: widgetSettings.productId,
    product_name: product.name,
    unit: widgetSettings.unit,
    value_color: widgetSettings.value_color,
    widget: widget,
    widget_id: widget.id,
    widget_name: widgetSettings.name,
    widget_settings: [
      {
        ...widgetSettings,
        device_name: device.name,
        device: widgetSettings.deviceId,
        label: widgetSettings.name,
        product: widgetSettings.productId,
        product_name: product.name,
        unit: widgetSettings.unit,
        widget_name: widgetSettings.name,
      },
    ],
  };
}
async function deleteWidget(params) {
  await demoDb.transaction('rw', [demoDb.widgets, demoDb.widgetSettings], async () => {
    await demoDb.widgets.delete(params.id);
    await demoDb.widgetSettings.where('widgetId').equals(params.id).delete();
  });
  return true;
}
async function fetchDashboardWidgets(params) {
  const widgets = await demoDb.widgets.where('dashboard_id').equals(params.id).toArray();

  const widgetsDetails = await Promise.all(
    widgets.map(async widget => {
      const widgetSettings = await demoDb.widgetSettings
        .where('widgetId')
        .equals(widget.id)
        .first();
      const safeSettings = widgetSettings || {};
      const device = await demoDb.devices.where('id').equals(safeSettings.deviceId).first();
      const product = await demoDb.products.where('id').equals(safeSettings.productId).first();
      return {
        ...widget,
        values: [
          {
            attribute_name: safeSettings.attributes,
            attribute_value: device?.latest_packet?.value,
            is_alert: device?.latest_packet?.isAlert,
          },
        ],
        widget_settings: [
          {
            ...safeSettings,
            device: device || null,
            proudct: product,
            product_name: product.name,
            label:
              userDemoPreferences[safeSettings.productId].find(
                up => up.attribute_key === safeSettings.attributes
              ).label || '',
            product: safeSettings.productId || null,
            unit: safeSettings.unit || '',
            widget_name: safeSettings.name || '',
          },
        ],
      };
    })
  );
  return { id: params.id, widgets: widgetsDetails };
}
async function checkConfiguredDevices() {
  const userDevices = await demoDb.devices.where('userId').equals('demo-user-1').toArray();
  const userDevicesIds = userDevices.map(u => u.id);
  return userDevicesIds;
}
async function addDemoProduct(payload) {
  await Promise.all(
    payload.map(async deviceId => {
      await demoDb.devices.update(deviceId, { userId: 'demo-user-1' });
    })
  );
}

async function executePacketTick(payload) {
  let value = payload.value;
  let isAlert = payload.status === 'alert';
  if (payload.sending_mode == 'concurrent') {
    if (payload.device_id == 'demo-device-3' || payload.device_id == 'demo-device-4') {
      value = Math.random() < 0.5;
      isAlert = value;
    } else {
      value = Number((Math.random() * (99.9 - 0.1) + 0.1).toFixed(1));
      isAlert = value > 50;
    }
  }
  const mockPacket = {
    id: `seed-pkt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    deviceId: payload.device_id,
    // device_unique_identifier: '647fda0000007f48',
    userId: 'demo-user-1',
    value: value,
    batteryVoltage: Number((Math.round(Math.random() * 30) / 10).toFixed(1)),
    isAlert: isAlert,
    timestamp: Date.now(),
  };

  const currentDevice = await demoDb.devices.where('id').equals(payload.device_id).first();
  const currentAlertsCount = currentDevice ? currentDevice.alerts_count || 0 : 0;
  await demoDb.transaction('rw', [demoDb.deviceValues, demoDb.devices], async () => {
    await demoDb.deviceValues.add(mockPacket);

    await demoDb.devices.update(payload.device_id, {
      latest_packet: {
        id: mockPacket.id,
        timestamp: mockPacket.timestamp,
        value: mockPacket.value,
        isAlert: mockPacket.isAlert,
      },
      alerts_count: currentAlertsCount + 1,
      updated_at: new Date().toISOString(),
    });
  });
  const widgets = await demoDb.widgets.where('deviceId').equals(payload.device_id).toArray();
  //    //much better way, learn this instead of what you used if (widgets.length > 0) {
  //   // 1. OPTIMIZATION: Group widgets by dashboard_id in a single O(N) pass
  //   const widgetsByDashboard = widgets.reduce((acc, widget) => {
  //     if (!widget.dashboard_id) return acc;
  //     if (!acc[widget.dashboard_id]) acc[widget.dashboard_id] = [];

  //     acc[widget.dashboard_id].push({
  //       widget_id: widget.id,
  //       dashboard_id: widget.dashboard_id,
  //       values: [
  //         {
  //           attribute_name: 'temperature',
  //           attribute_value: mockPacket.value,
  //           is_alert: mockPacket.isAlert,
  //         },
  //       ],
  //     });
  //     return acc;
  //   }, {});

  //   // 2. OPTIMIZATION: Dispatch to each dashboard cleanly without using .filter() loops
  //   Object.entries(widgetsByDashboard).forEach(([dId, widgetDataArray]) => {
  //     triggerMockPusher(`dashboard-values-event.${dId}`, {
  //       widget_data: widgetDataArray,
  //       dashboard_id: dId,
  //       userId: 'demo-user-1',
  //       status: 'success',
  //       message: 'Dashboard values updated',
  //     });
  //   });
  // }
  // dashboard:update / building:update (api_contract §4.2-§4.3): one fixed event name, resource id
  // INSIDE the payload (string, per the contract), no more status/message/userId envelope fields.
  const dashboardIds = widgets.map(w => w.dashboard_id) ?? [];
  if (dashboardIds?.length > 0) {
    dashboardIds?.forEach(d => {
      const widgets_payload = widgets
        ?.filter(w => w.dashboard_id == d)
        .map(wid => ({
          widgetId: String(wid.id),
          values: [
            {
              attribute_name: userDemoPreferences[wid.productId][1].attribute_key,
              attribute_value: mockPacket.value,
              is_alert: mockPacket.isAlert,
            },
          ],
        }));
      triggerMockSocketEvent('dashboard:update', {
        dashboardId: String(d),
        widgets: widgets_payload,
      });
    });
  }
  const mockBuildingAssetData = await fetchAssetData();
  triggerMockSocketEvent('building:update', {
    buildingId: 'demo-asset-1',
    deviceId: String(currentDevice.id),
    deviceIdentifier: currentDevice.device_unique_identifier,
    asset: mockBuildingAssetData,
  });
}

// Global active loop runtime registry
let activeIntervals = {};

const SimulationEngine = {
  async start(payload) {
    if (payload.sending_mode === 'single') {
      await executePacketTick(payload);
    } else {
      // Setup persistent tracking database fallback item
      const simId = await demoDb.simulations.add({
        ...payload,
        remainingPackets: payload.packet_count,
        status: 'running',
      });

      this.runInterval(simId, payload);
    }
  },

  runInterval(simId, payload) {
    const intervalMs = payload.interval_seconds * 1000;

    const intervalId = setInterval(async () => {
      const currentSim = await demoDb.simulations.get(simId);

      if (!currentSim || currentSim.remainingPackets <= 0 || currentSim.status !== 'running') {
        clearInterval(intervalId);
        if (currentSim) await demoDb.simulations.update(simId, { status: 'completed' });
        return;
      }

      await executePacketTick(payload);

      await demoDb.simulations.update(simId, {
        remainingPackets: currentSim.remainingPackets - 1,
      });
    }, intervalMs);

    activeIntervals[simId] = intervalId;
  },

  // Call this inside your main App component loading useEffect to fix page refreshes
  async resumeAll() {
    const activeJobs = await demoDb.simulations.where('status').equals('running').toArray();
    activeJobs.forEach(job => {
      if (activeIntervals[job.id]) clearInterval(activeIntervals[job.id]);
      this.runInterval(job.id, job);
    });
  },
};

export {
  login,
  updateUserSettings,
  fetchAnalytics,
  fetchProducts,
  fetchProductDevcies,
  fetchProductSettings,
  deleteProduct,
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
};
