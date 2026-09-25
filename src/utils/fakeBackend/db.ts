// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import Dexie from 'dexie';

export const demoDb = new Dexie('DemoConvoyDatabase');

demoDb.version(1).stores({
  company: 'id,name,email',
  dashboards: 'id,name,userId',
  devices: 'id,device_unique_identifier,productId,userId',
  deviceValues: 'id,deviceId,userId',
  products: 'id,name,company_id',
  roles: 'id,company_id,name',
  users: 'id,email,company_id',
  widgets: 'id,dashboard_id,productId,deviceId',
  widgetSettings: 'id,name,widgetId,productId,deviceId',
  simulations: '++id, status',
});

// Fleet Management demo tables — added as a separate schema version so
// existing demo IndexedDB databases (already at version 1) upgrade in
// place instead of needing a wipe. See fleetControllers.js for the
// endpoints these back.
demoDb.version(2).stores({
  vehicles: 'id,company_id,lifecycle_status',
  drivers: 'id,company_id,status',
  fleetTrackers: 'id,company_id',
  vehicleDeviceAssignments: 'id,vehicleId,deviceId,active',
  vehicleDriverAssignments: 'id,vehicleId,driverId,is_active',
  vehiclePositions: 'vehicleId',
  driverIncidents: 'id,driverId',
  geofences: 'id,company_id,yard_id',
  geofenceEvents: 'id,geofenceId,occurred_at',
  yards: 'id,company_id',
  yardSlots: 'id,yardId',
  yardSlotEvents: 'id,slotId,vehicleId,checked_out_at',
  trips: 'id,vehicle_id,driver_id,status',
  tripPlannedYards: 'id,tripId,yardId',
  maintenanceSchedules: 'id,vehicleId',
  maintenanceLogs: 'id,vehicleId',
  fuelLogs: 'id,vehicleId',
  complianceDocuments: 'id,documentable_type,documentable_id',
});

export async function seedDemoData() {
  const count = await demoDb.users.count();
  if (count > 0) return;
  const baseTime = Date.now();
  const formatISO = offset => new Date(baseTime + offset).toISOString();
  await demoDb.company.add({
    id: 'demo-company-1',
    name: 'Demo Company',
    email: 'demoCompanyAccount@chirptech.io',
    address: 'demoAddress',
    city: 'demoCity',
    state: 'demoState',
    country: 'demoCountry',
    zip_code: 'demoZipCode',
    created_at: baseTime,
    updated_at: baseTime,
  });

  await demoDb.roles.add({
    id: 'demo-role-type-1',
    company_id: 'demo-company-1',
    name: 'admin',
    created_at: baseTime,
    updated_at: baseTime,
  });

  await demoDb.users.add({
    id: 'demo-user-1',
    email: 'demoAccount@chirptech.io',
    company_id: 'demo-company-1',
    companyInfo: true,
    isFirstLogin: true,
    role_type: 'admin',
    locale: 'en',
    isDemo: true,
    created_at: baseTime,
    updated_at: baseTime,
  });

  await demoDb.products.bulkAdd([
    {
      id: 'demo-product-1',
      name: 'Temperature',
      status: 'active',
      company_id: 'demo-company-1',
      devices_count: 1,
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-product-2',
      name: 'Humidity',
      status: 'active',
      company_id: 'demo-company-1',
      devices_count: 1,
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-product-3',
      name: 'Water Leak',
      status: 'active',
      company_id: 'demo-company-1',
      devices_count: 1,
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-product-4',
      name: 'Move',
      status: 'active',
      company_id: 'demo-company-1',
      devices_count: 1,
      created_at: baseTime,
      updated_at: baseTime,
    },
  ]);

  // Generate 100 realistic temperature packets array
  const packets = [];
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  let alertCount = 0;
  for (let i = 99; i >= 0; i--) {
    // Walk backwards in time so index 0 is the newest (current time)
    const packetTimestamp = baseTime - i * TEN_MINUTES_MS;

    // Create a realistic fluctuating temperature curve (22°C to 26°C) with tiny noise
    const dynamicValue = (24 + Math.sin(i * 0.2) * 2 + Math.random() * 0.4).toFixed(2);
    const temperatureNum = parseFloat(dynamicValue);

    // Trigger a fake alert if the random fluctuation spikes past 25.6°C
    const isAlert = temperatureNum > 25.6;
    isAlert && ++alertCount;

    packets.push({
      id: `seed-pkt-${100 - i}`,
      deviceId: 'demo-device-1',
      // device_unique_identifier: '647fda0000007f48',
      userId: 'demo-user-1',
      value: temperatureNum,
      batteryVoltage: Number((Math.round(Math.random() * 30) / 10).toFixed(1)),
      isAlert: isAlert,
      timestamp: packetTimestamp,
    });
  }
  // Bulk add telemetry logs to history
  await demoDb.deviceValues.bulkAdd(packets);
  // Extract the very latest packet (the last element in our ordered timeline array)
  const latestPacket = packets[packets.length - 1];
  // Seed the device records, pre-baking the latest packet shadow snapshot onto Device 1
  await demoDb.devices.bulkAdd([
    {
      id: 'demo-device-1',
      productId: 'demo-product-1',
      device_unique_identifier: '647fda0000007f48',
      name: 'Temperature Sensor',
      company_id: 'demo-company-1',
      userId: 'demo-user-1',
      alerts_count: alertCount,
      latest_packet: {
        id: latestPacket.id,
        timestamp: latestPacket.timestamp,
        value: latestPacket.value,
        // isAlert: true,
        isAlert: latestPacket.isAlert,
        battery_voltage: latestPacket.batteryVoltage,
      },
      attribute: 'temperature',
      widgetType: 'Temperature',
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-device-2',
      productId: 'demo-product-2',
      device_unique_identifier: '647fda0000007f49',
      name: 'Humidity Sensor',
      company_id: 'demo-company-1',
      userId: null,
      alerts_count: 0,
      latest_packet: null,
      attribute: 'humidity',
      widgetType: 'Humidity',
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-device-3',
      productId: 'demo-product-3',
      device_unique_identifier: '647fda0000007f50',
      name: 'Water Leak Sensor',
      company_id: 'demo-company-1',
      userId: null,
      alerts_count: 0,
      latest_packet: null,
      attribute: 'external_input',
      widgetType: 'Water Leak',
      created_at: baseTime,
      updated_at: baseTime,
    },
    {
      id: 'demo-device-4',
      productId: 'demo-product-4',
      device_unique_identifier: '647fda0000007f51',
      name: 'Move Sensor',
      company_id: 'demo-company-1',
      userId: null,
      alerts_count: 0,
      latest_packet: null,
      attribute: 'move',
      widgetType: 'Motion',
      created_at: baseTime,
      updated_at: baseTime,
    },
  ]);

  console.log('Demo database successfully seeded with IoT data and 100 history packets.');

  await seedFleetDemoData(baseTime);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const yardLayoutSvg = title => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380">
  <rect width="640" height="380" fill="#1a1f24"/>
  <rect x="20" y="20" width="600" height="340" fill="none" stroke="#3a4048" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="320" y="34" fill="#8b95a1" font-size="14" text-anchor="middle" font-family="sans-serif">${title}</text>
</svg>`;
const svgToDataUrl = svg => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

async function seedFleetDemoData(baseTime) {
  const companyId = 'demo-company-1';
  const iso = offsetMs => new Date(baseTime + offsetMs).toISOString();

  await demoDb.fleetTrackers.bulkAdd([
    {
      id: 'demo-tracker-1',
      company_id: companyId,
      name: 'GPS Tracker Alpha',
      device_unique_identifier: '860123456789011',
    },
    {
      id: 'demo-tracker-2',
      company_id: companyId,
      name: 'GPS Tracker Bravo',
      device_unique_identifier: '860123456789022',
    },
  ]);

  await demoDb.vehicles.bulkAdd([
    {
      id: 'demo-vehicle-1',
      company_id: companyId,
      name: 'Truck 5',
      vehicle_category: 'Semi-Trailer',
      make: 'Volvo',
      model: 'FH16',
      length_m: 16.5,
      lifecycle_status: 'active',
      image_url: null,
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-vehicle-2',
      company_id: companyId,
      name: 'Sea Breeze',
      vehicle_category: 'Yacht',
      make: 'Beneteau',
      model: 'Oceanis 46',
      length_m: 14,
      lifecycle_status: 'active',
      image_url: null,
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-vehicle-3',
      company_id: companyId,
      name: 'Truck 9',
      vehicle_category: 'Box Truck',
      make: 'Isuzu',
      model: 'NPR',
      length_m: 7.2,
      lifecycle_status: 'in_maintenance',
      image_url: null,
      created_at: iso(0),
      updated_at: iso(0),
    },
  ]);

  await demoDb.drivers.bulkAdd([
    {
      id: 'demo-driver-1',
      company_id: companyId,
      first_name: 'Ahmed',
      last_name: 'Raza',
      license_number: 'DL-88213',
      license_class: 'CDL-A',
      license_expiry_date: iso(200 * DAY_MS),
      status: 'active',
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-driver-2',
      company_id: companyId,
      first_name: 'Bilal',
      last_name: 'Khan',
      license_number: 'DL-55210',
      license_class: 'CDL-B',
      license_expiry_date: iso(-5 * DAY_MS),
      status: 'active',
      created_at: iso(0),
      updated_at: iso(0),
    },
  ]);

  await demoDb.vehicleDeviceAssignments.bulkAdd([
    {
      id: 'demo-vda-1',
      vehicleId: 'demo-vehicle-1',
      deviceId: 'demo-tracker-1',
      active: 1,
      assigned_at: iso(-30 * DAY_MS),
      unassigned_at: null,
    },
    {
      id: 'demo-vda-2',
      vehicleId: 'demo-vehicle-3',
      deviceId: 'demo-tracker-2',
      active: 1,
      assigned_at: iso(-10 * DAY_MS),
      unassigned_at: null,
    },
  ]);

  await demoDb.vehicleDriverAssignments.bulkAdd([
    {
      id: 'demo-vdra-1',
      vehicleId: 'demo-vehicle-1',
      driverId: 'demo-driver-1',
      is_active: 1,
      assigned_at: iso(-30 * DAY_MS),
      unassigned_at: null,
      notes: 'Primary long-haul driver.',
      trip_count: 12,
      distance_km: 8400,
    },
  ]);

  await demoDb.vehiclePositions.bulkAdd([
    {
      vehicleId: 'demo-vehicle-1',
      deviceId: 'demo-tracker-1',
      latitude: 31.4757729,
      longitude: 74.3399971,
      recorded_at: iso(0),
    },
    {
      vehicleId: 'demo-vehicle-3',
      deviceId: 'demo-tracker-2',
      latitude: 24.8607,
      longitude: 67.0011,
      recorded_at: iso(-20 * 60 * 1000),
    },
  ]);

  await demoDb.yards.bulkAdd([
    {
      id: 'demo-yard-1',
      company_id: companyId,
      name: 'Karachi Port Yard',
      address: 'Karachi Port, Karachi, Pakistan',
      latitude: 24.8607,
      longitude: 67.0011,
      layout: { url: svgToDataUrl(yardLayoutSvg('Karachi Port Yard — Layout')) },
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-yard-2',
      company_id: companyId,
      name: 'Lahore Depot',
      address: 'Lahore, Pakistan',
      latitude: 31.5204,
      longitude: 74.3587,
      layout: null,
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-yard-3',
      company_id: companyId,
      name: 'Multan Transit Yard',
      address: 'Multan, Pakistan',
      latitude: 30.1575,
      longitude: 71.5249,
      layout: null,
      created_at: iso(0),
      updated_at: iso(0),
    },
  ]);

  await demoDb.yardSlots.bulkAdd([
    {
      id: 'demo-slot-1',
      yardId: 'demo-yard-1',
      slot_number: 'A1',
      position_x: 0.22,
      position_y: 0.5,
      max_length_m: 20,
    },
    {
      id: 'demo-slot-2',
      yardId: 'demo-yard-1',
      slot_number: 'A2',
      position_x: 0.48,
      position_y: 0.5,
      max_length_m: 20,
    },
    {
      id: 'demo-slot-3',
      yardId: 'demo-yard-1',
      slot_number: 'A3',
      position_x: 0.74,
      position_y: 0.5,
      max_length_m: 10,
    },
  ]);

  await demoDb.yardSlotEvents.bulkAdd([
    {
      id: 'demo-yse-1',
      slotId: 'demo-slot-1',
      vehicleId: 'demo-vehicle-3',
      checked_in_at: iso(-2 * DAY_MS),
      checked_out_at: null,
    },
  ]);

  await demoDb.geofences.bulkAdd([
    {
      id: 'demo-geofence-1',
      company_id: companyId,
      name: 'Main Yard Perimeter',
      yard_id: 'demo-yard-1',
      center_latitude: null,
      center_longitude: null,
      radius_m: 300,
      alert_on: 'both',
      is_active: 1,
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-geofence-2',
      company_id: companyId,
      name: 'Port Exclusion Zone',
      yard_id: null,
      center_latitude: 24.85,
      center_longitude: 67.02,
      radius_m: 500,
      alert_on: 'exit',
      is_active: 1,
      created_at: iso(0),
      updated_at: iso(0),
    },
  ]);

  await demoDb.geofenceEvents.bulkAdd([
    {
      id: 'demo-gfe-1',
      geofenceId: 'demo-geofence-1',
      deviceName: 'GPS Tracker Alpha',
      event_type: 'exit',
      occurred_at: iso(-6 * 60 * 60 * 1000),
    },
    {
      id: 'demo-gfe-2',
      geofenceId: 'demo-geofence-1',
      deviceName: 'GPS Tracker Bravo',
      event_type: 'enter',
      occurred_at: iso(-2 * DAY_MS),
    },
  ]);

  await demoDb.maintenanceSchedules.bulkAdd([
    {
      id: 'demo-ms-1',
      vehicleId: 'demo-vehicle-1',
      service_type: 'Oil Change',
      interval_days: 90,
      last_service_date: iso(-60 * DAY_MS),
    },
    {
      id: 'demo-ms-2',
      vehicleId: 'demo-vehicle-3',
      service_type: 'Brake Inspection',
      interval_days: 30,
      last_service_date: iso(-40 * DAY_MS),
    },
  ]);

  await demoDb.maintenanceLogs.bulkAdd([
    {
      id: 'demo-ml-1',
      vehicleId: 'demo-vehicle-1',
      service_type: 'Oil Change',
      service_date: iso(-60 * DAY_MS),
      cost: 85,
      vendor: 'City Auto Care',
    },
    {
      id: 'demo-ml-2',
      vehicleId: 'demo-vehicle-3',
      service_type: 'Tire Rotation',
      service_date: iso(-20 * DAY_MS),
      cost: 40,
      vendor: 'FastFix Garage',
    },
  ]);

  await demoDb.fuelLogs.bulkAdd([
    {
      id: 'demo-fl-1',
      vehicleId: 'demo-vehicle-1',
      fill_date: iso(-10 * DAY_MS),
      volume: 200,
      unit: 'liters',
      odometer_km: 50000,
      is_full_tank: 1,
      cost: 42000,
    },
    {
      id: 'demo-fl-2',
      vehicleId: 'demo-vehicle-1',
      fill_date: iso(-3 * DAY_MS),
      volume: 210,
      unit: 'liters',
      odometer_km: 50650,
      is_full_tank: 1,
      cost: 44000,
    },
  ]);

  await demoDb.driverIncidents.bulkAdd([
    {
      id: 'demo-di-1',
      driverId: 'demo-driver-2',
      incident_type: 'Speeding Violation',
      severity: 'moderate',
      incident_date: iso(-15 * DAY_MS),
      description: 'Exceeded posted limit by 20 km/h on N5 highway.',
    },
  ]);

  await demoDb.complianceDocuments.bulkAdd([
    {
      id: 'demo-cd-1',
      documentable_type: 'vehicle',
      documentable_id: 'demo-vehicle-1',
      document_type: 'Registration',
      document_number: 'REG-88231',
      expiry_date: iso(200 * DAY_MS),
      created_at: iso(0),
    },
    {
      id: 'demo-cd-2',
      documentable_type: 'vehicle',
      documentable_id: 'demo-vehicle-1',
      document_type: 'Insurance',
      document_number: 'INS-5521',
      expiry_date: iso(10 * DAY_MS),
      created_at: iso(0),
    },
    {
      id: 'demo-cd-3',
      documentable_type: 'driver',
      documentable_id: 'demo-driver-1',
      document_type: 'Driving License',
      document_number: 'DL-88213',
      expiry_date: iso(200 * DAY_MS),
      created_at: iso(0),
    },
    {
      id: 'demo-cd-4',
      documentable_type: 'driver',
      documentable_id: 'demo-driver-2',
      document_type: 'Driving License',
      document_number: 'DL-55210',
      expiry_date: iso(-5 * DAY_MS),
      created_at: iso(0),
    },
  ]);

  await demoDb.trips.bulkAdd([
    {
      id: 'demo-trip-1',
      vehicle_id: 'demo-vehicle-1',
      driver_id: 'demo-driver-1',
      fleet_customer_id: null,
      trip_reference: 'TRP-1001',
      purpose: 'delivery',
      origin_address: 'Karachi Port, Karachi, Pakistan',
      origin_latitude: 24.8607,
      origin_longitude: 67.0011,
      destination_address: 'Lahore Depot, Lahore, Pakistan',
      destination_latitude: 31.5204,
      destination_longitude: 74.3587,
      planned_start_at: iso(-2 * DAY_MS),
      planned_end_at: iso(-1 * DAY_MS),
      planned_distance_km: 1200,
      odometer_start_km: 49000,
      odometer_end_km: 50210,
      actual_start_at: iso(-2 * DAY_MS + 30 * 60 * 1000),
      actual_end_at: iso(-1 * DAY_MS - 45 * 60 * 1000),
      actual_distance_km: 1210,
      actual_duration_minutes: 22 * 60,
      fuel_used_liters: 310,
      notes: 'Standard freight run.',
      cancellation_reason: null,
      status: 'completed',
      created_by: { first_name: 'Ahmed', last_name: 'Raza' },
      created_at: iso(-2 * DAY_MS),
      updated_at: iso(-1 * DAY_MS),
    },
    {
      id: 'demo-trip-2',
      vehicle_id: 'demo-vehicle-1',
      driver_id: 'demo-driver-1',
      fleet_customer_id: null,
      trip_reference: 'TRP-1002',
      purpose: 'inspection',
      origin_address: 'Lahore Depot, Lahore, Pakistan',
      origin_latitude: 31.5204,
      origin_longitude: 74.3587,
      destination_address: 'Karachi Port, Karachi, Pakistan',
      destination_latitude: 24.8607,
      destination_longitude: 67.0011,
      planned_start_at: iso(DAY_MS),
      planned_end_at: iso(2 * DAY_MS),
      planned_distance_km: 1200,
      odometer_start_km: null,
      odometer_end_km: null,
      actual_start_at: null,
      actual_end_at: null,
      actual_distance_km: null,
      actual_duration_minutes: null,
      fuel_used_liters: null,
      notes: null,
      cancellation_reason: null,
      status: 'planned',
      created_by: { first_name: 'Ahmed', last_name: 'Raza' },
      created_at: iso(0),
      updated_at: iso(0),
    },
    {
      id: 'demo-trip-3',
      vehicle_id: 'demo-vehicle-3',
      driver_id: null,
      fleet_customer_id: null,
      trip_reference: 'TRP-1003',
      purpose: 'relocation',
      origin_address: 'Multan Transit Yard, Multan, Pakistan',
      origin_latitude: 30.1575,
      origin_longitude: 71.5249,
      destination_address: 'Karachi Port, Karachi, Pakistan',
      destination_latitude: 24.8607,
      destination_longitude: 67.0011,
      planned_start_at: iso(-4 * 60 * 60 * 1000),
      planned_end_at: iso(4 * 60 * 60 * 1000),
      planned_distance_km: 950,
      odometer_start_km: 30500,
      odometer_end_km: null,
      actual_start_at: iso(-3 * 60 * 60 * 1000),
      actual_end_at: null,
      actual_distance_km: null,
      actual_duration_minutes: null,
      fuel_used_liters: null,
      notes: null,
      cancellation_reason: null,
      status: 'in_progress',
      created_by: null,
      created_at: iso(-4 * 60 * 60 * 1000),
      updated_at: iso(-3 * 60 * 60 * 1000),
    },
  ]);

  await demoDb.tripPlannedYards.bulkAdd([
    {
      id: 'demo-tpy-1',
      tripId: 'demo-trip-1',
      yardId: 'demo-yard-3',
      sequence: 1,
      stop_purpose: 'refuel',
      planned_arrival_at: iso(-2 * DAY_MS + 10 * 60 * 60 * 1000),
      planned_departure_at: iso(-2 * DAY_MS + 11 * 60 * 60 * 1000),
      actual_arrival_at: iso(-2 * DAY_MS + 10.25 * 60 * 60 * 1000),
      actual_departure_at: iso(-2 * DAY_MS + 11 * 60 * 60 * 1000),
      dwell_time_minutes: 45,
      status: 'completed',
      actual_source: 'gps_geofence',
      notes: null,
    },
  ]);

  console.log('Fleet Management demo data seeded (vehicles, drivers, geofences, yards, trips).');
}
