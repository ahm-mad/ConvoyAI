// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { demoDb } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const nowIso = () => new Date().toISOString();

function isExpired(dateStr) {
  return !!dateStr && new Date(dateStr).getTime() < Date.now();
}

function isExpiringSoon(dateStr, withinDays = 30) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff >= 0 && diff <= withinDays * DAY_MS;
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

async function attachVehicleAssignments(vehicle) {
  const [deviceAssignment, driverAssignment] = await Promise.all([
    demoDb.vehicleDeviceAssignments
      .where('vehicleId')
      .equals(vehicle.id)
      .filter(a => a.active)
      .first(),
    demoDb.vehicleDriverAssignments
      .where('vehicleId')
      .equals(vehicle.id)
      .filter(a => a.is_active)
      .first(),
  ]);

  const device = deviceAssignment
    ? await demoDb.fleetTrackers.get(deviceAssignment.deviceId)
    : null;
  const driver = driverAssignment ? await demoDb.drivers.get(driverAssignment.driverId) : null;

  return {
    ...vehicle,
    current_device_assignment: deviceAssignment ? { id: deviceAssignment.id, device } : null,
    current_driver_assignment: driverAssignment ? { id: driverAssignment.id, driver } : null,
  };
}

async function fetchVehicles() {
  const vehicles = await demoDb.vehicles.toArray();
  return Promise.all(vehicles.map(attachVehicleAssignments));
}

async function createVehicle(payload) {
  const vehicle = {
    id: uid('demo-vehicle'),
    company_id: 'demo-company-1',
    lifecycle_status: 'active',
    image_url: null,
    ...payload,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await demoDb.vehicles.add(vehicle);
  return vehicle;
}

async function fetchVehicleStats(vehicleId) {
  const trips = await demoDb.trips.where('vehicle_id').equals(vehicleId).toArray();
  const now = Date.now();

  const sumWithin = days =>
    trips
      .filter(
        t => t.actual_start_at && now - new Date(t.actual_start_at).getTime() <= days * DAY_MS
      )
      .reduce((sum, t) => sum + (t.actual_distance_km ?? 0), 0);

  const distance7d = sumWithin(7);
  const distance30d = sumWithin(30);

  const timedTrips = trips.filter(t => t.actual_distance_km != null && t.actual_duration_minutes);
  const speeds = timedTrips.map(t => t.actual_distance_km / (t.actual_duration_minutes / 60));

  return {
    distance_km_7d: trips.length === 0 ? null : distance7d,
    distance_km_30d: trips.length === 0 ? null : distance30d,
    avg_speed_kmh_7d: speeds.length
      ? Number((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1))
      : null,
    max_speed_kmh_7d: speeds.length ? Number(Math.max(...speeds).toFixed(1)) : null,
  };
}

async function fetchFuelEconomy(vehicleId) {
  const logs = await demoDb.fuelLogs
    .where('vehicleId')
    .equals(vehicleId)
    .filter(l => l.is_full_tank && l.odometer_km != null)
    .toArray();
  logs.sort((a, b) => new Date(a.fill_date) - new Date(b.fill_date));

  if (logs.length < 2) return null;

  const [prev, latest] = logs.slice(-2);
  const distance = latest.odometer_km - prev.odometer_km;
  if (distance <= 0 || !latest.volume) return null;

  return { economy: Number((distance / latest.volume).toFixed(2)), unit: 'km/L' };
}

async function fetchVehicleDetail(vehicleId) {
  const vehicleRow = await demoDb.vehicles.get(vehicleId);
  if (!vehicleRow) return null;
  const vehicle = await attachVehicleAssignments(vehicleRow);

  const positionRow = vehicle.current_device_assignment
    ? await demoDb.vehiclePositions.get(vehicleId)
    : null;

  let current_position = null;
  if (positionRow) {
    const jitteredPosition = {
      ...positionRow,
      latitude: positionRow.latitude + (Math.random() - 0.5) * 0.01,
      longitude: positionRow.longitude + (Math.random() - 0.5) * 0.01,
      recorded_at: nowIso(),
    };
    await demoDb.vehiclePositions.put(jitteredPosition);
    current_position = jitteredPosition;
  }

  const [schedules, logs, fuelLogs, fuelEconomy, stats] = await Promise.all([
    demoDb.maintenanceSchedules.where('vehicleId').equals(vehicleId).toArray(),
    demoDb.maintenanceLogs.where('vehicleId').equals(vehicleId).toArray(),
    demoDb.fuelLogs.where('vehicleId').equals(vehicleId).toArray(),
    fetchFuelEconomy(vehicleId),
    fetchVehicleStats(vehicleId),
  ]);

  const maintenance_schedules = schedules.map(s => {
    const next_service_date = s.last_service_date
      ? new Date(new Date(s.last_service_date).getTime() + s.interval_days * DAY_MS).toISOString()
      : null;
    return {
      ...s,
      next_service_date,
      is_overdue_by_date: next_service_date ? new Date(next_service_date) < new Date() : false,
    };
  });

  const yardEvents = await demoDb.yardSlotEvents.where('vehicleId').equals(vehicleId).toArray();
  const yard_history = await Promise.all(
    yardEvents.map(async event => {
      const slot = await demoDb.yardSlots.get(event.slotId);
      const yard = slot ? await demoDb.yards.get(slot.yardId) : null;
      return { ...event, slot: slot ? { ...slot, yard } : null };
    })
  );

  const driverAssignments = await demoDb.vehicleDriverAssignments
    .where('vehicleId')
    .equals(vehicleId)
    .toArray();
  const driver_assignment_history = await Promise.all(
    driverAssignments.map(async assignment => {
      const driver = await demoDb.drivers.get(assignment.driverId);
      const duration_days = assignment.unassigned_at
        ? Math.round(
            (new Date(assignment.unassigned_at) - new Date(assignment.assigned_at)) / DAY_MS
          )
        : null;
      return { ...assignment, driver, duration_days };
    })
  );

  return {
    vehicle,
    current_position,
    stats,
    maintenance_schedules,
    maintenance_logs: logs,
    fuel_logs: fuelLogs,
    fuel_economy: fuelEconomy,
    yard_history,
    driver_assignment_history,
  };
}

async function assignDeviceToVehicle(vehicleId, deviceId) {
  const alreadyInstalled = await demoDb.vehicleDeviceAssignments
    .where('deviceId')
    .equals(deviceId)
    .filter(a => a.active && a.vehicleId !== vehicleId)
    .first();
  if (alreadyInstalled) {
    return { success: false, message: 'This tracker is already installed in another vehicle.' };
  }

  await demoDb.transaction('rw', demoDb.vehicleDeviceAssignments, async () => {
    const current = await demoDb.vehicleDeviceAssignments
      .where('vehicleId')
      .equals(vehicleId)
      .filter(a => a.active)
      .first();
    if (current) {
      await demoDb.vehicleDeviceAssignments.update(current.id, {
        active: 0,
        unassigned_at: nowIso(),
      });
    }
    await demoDb.vehicleDeviceAssignments.add({
      id: uid('demo-vda'),
      vehicleId,
      deviceId,
      active: 1,
      assigned_at: nowIso(),
      unassigned_at: null,
    });
  });

  return { success: true, message: 'Tracker assigned successfully.' };
}

async function unassignDeviceFromVehicle(vehicleId) {
  const current = await demoDb.vehicleDeviceAssignments
    .where('vehicleId')
    .equals(vehicleId)
    .filter(a => a.active)
    .first();
  if (current) {
    await demoDb.vehicleDeviceAssignments.update(current.id, {
      active: 0,
      unassigned_at: nowIso(),
    });
  }
  return { success: true, message: 'Tracker unassigned successfully.' };
}

async function assignVehicleToDriver(driverId, vehicleId) {
  const driver = await demoDb.drivers.get(driverId);
  const vehicle = await demoDb.vehicles.get(vehicleId);
  if (!driver || !vehicle) {
    return { success: false, message: 'Driver or vehicle not found.' };
  }

  await demoDb.transaction('rw', demoDb.vehicleDriverAssignments, async () => {
    const existingForDriver = await demoDb.vehicleDriverAssignments
      .where('driverId')
      .equals(driverId)
      .filter(a => a.is_active)
      .first();
    if (existingForDriver) {
      await demoDb.vehicleDriverAssignments.update(existingForDriver.id, {
        is_active: 0,
        unassigned_at: nowIso(),
      });
    }

    const existingForVehicle = await demoDb.vehicleDriverAssignments
      .where('vehicleId')
      .equals(vehicleId)
      .filter(a => a.is_active)
      .first();
    if (existingForVehicle) {
      await demoDb.vehicleDriverAssignments.update(existingForVehicle.id, {
        is_active: 0,
        unassigned_at: nowIso(),
      });
    }

    await demoDb.vehicleDriverAssignments.add({
      id: uid('demo-vdra'),
      vehicleId,
      driverId,
      is_active: 1,
      assigned_at: nowIso(),
      unassigned_at: null,
      notes: null,
      trip_count: 0,
      distance_km: 0,
    });
  });

  return { success: true, message: 'Vehicle assigned successfully.' };
}

async function unassignVehicleFromDriver(driverId) {
  const current = await demoDb.vehicleDriverAssignments
    .where('driverId')
    .equals(driverId)
    .filter(a => a.is_active)
    .first();
  if (current) {
    await demoDb.vehicleDriverAssignments.update(current.id, {
      is_active: 0,
      unassigned_at: nowIso(),
    });
  }
  return { success: true, message: 'Vehicle unassigned successfully.' };
}

async function createMaintenanceSchedule(vehicleId, payload) {
  const schedule = {
    id: uid('demo-ms'),
    vehicleId,
    service_type: payload.service_type,
    interval_days: payload.interval_days ?? null,
    last_service_date: payload.last_service_date ?? null,
  };
  await demoDb.maintenanceSchedules.add(schedule);
  return schedule;
}

async function createMaintenanceLog(vehicleId, payload) {
  const log = {
    id: uid('demo-ml'),
    vehicleId,
    service_type: payload.service_type,
    service_date: payload.service_date,
    cost: payload.cost ?? null,
    vendor: payload.vendor ?? null,
  };
  await demoDb.maintenanceLogs.add(log);
  return log;
}

async function createFuelLog(vehicleId, payload) {
  const log = {
    id: uid('demo-fl'),
    vehicleId,
    fill_date: payload.fill_date,
    volume: payload.volume,
    unit: payload.unit ?? 'liters',
    odometer_km: payload.odometer_km ?? null,
    is_full_tank: payload.is_full_tank ? 1 : 0,
    cost: payload.cost ?? null,
  };
  await demoDb.fuelLogs.add(log);
  return log;
}

// ---------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------

async function attachDriverAssignment(driver) {
  const assignment = await demoDb.vehicleDriverAssignments
    .where('driverId')
    .equals(driver.id)
    .filter(a => a.is_active)
    .first();
  const vehicle = assignment
    ? await attachVehicleAssignments(await demoDb.vehicles.get(assignment.vehicleId))
    : null;

  return {
    ...driver,
    is_license_expired: isExpired(driver.license_expiry_date),
    is_license_expiring_soon: isExpiringSoon(driver.license_expiry_date),
    current_assignment: assignment ? { id: assignment.id, vehicle } : null,
  };
}

async function fetchDrivers() {
  const drivers = await demoDb.drivers.toArray();
  return Promise.all(drivers.map(attachDriverAssignment));
}

async function createDriver(payload) {
  const driver = {
    id: uid('demo-driver'),
    company_id: 'demo-company-1',
    status: 'active',
    ...payload,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await demoDb.drivers.add(driver);
  return driver;
}

async function fetchDriverDetail(driverId) {
  const driverRow = await demoDb.drivers.get(driverId);
  if (!driverRow) return null;
  const driver = await attachDriverAssignment(driverRow);
  const incidents = await demoDb.driverIncidents.where('driverId').equals(driverId).toArray();
  return { ...driver, incidents };
}

async function createDriverIncident(driverId, payload) {
  const incident = {
    id: uid('demo-di'),
    driverId,
    incident_type: payload.incident_type,
    severity: payload.severity ?? 'minor',
    incident_date: payload.incident_date,
    description: payload.description ?? null,
  };
  await demoDb.driverIncidents.add(incident);
  return incident;
}

// ---------------------------------------------------------------------
// Geofences
// ---------------------------------------------------------------------

async function fetchGeofences() {
  const geofences = await demoDb.geofences.toArray();
  return Promise.all(
    geofences.map(async g => ({
      ...g,
      yard: g.yard_id ? await demoDb.yards.get(g.yard_id) : null,
    }))
  );
}

async function createGeofence(payload) {
  let centerLat = payload.center_latitude;
  let centerLng = payload.center_longitude;

  if (payload.yard_id) {
    const yard = await demoDb.yards.get(payload.yard_id);
    centerLat = yard?.latitude ?? null;
    centerLng = yard?.longitude ?? null;
  }

  const geofence = {
    id: uid('demo-geofence'),
    company_id: 'demo-company-1',
    name: payload.name,
    yard_id: payload.yard_id || null,
    center_latitude: centerLat,
    center_longitude: centerLng,
    radius_m: payload.radius_m ?? 300,
    alert_on: payload.alert_on ?? 'both',
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await demoDb.geofences.add(geofence);
  return geofence;
}

async function updateGeofence(id, payload) {
  await demoDb.geofences.update(id, { ...payload, updated_at: nowIso() });
  return demoDb.geofences.get(id);
}

async function deleteGeofence(id) {
  await demoDb.geofences.delete(id);
  return true;
}

async function fetchGeofenceEvents(limit = 20) {
  const events = await demoDb.geofenceEvents.toArray();
  events.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  return Promise.all(
    events.slice(0, limit).map(async e => ({
      ...e,
      device: { name: e.deviceName },
      geofence: await demoDb.geofences.get(e.geofenceId),
    }))
  );
}

// ---------------------------------------------------------------------
// Yards
// ---------------------------------------------------------------------

async function fetchYards() {
  const yards = await demoDb.yards.toArray();
  return Promise.all(
    yards.map(async y => ({
      ...y,
      slots_count: await demoDb.yardSlots.where('yardId').equals(y.id).count(),
    }))
  );
}

async function createYard(payload) {
  const yard = {
    id: uid('demo-yard'),
    company_id: 'demo-company-1',
    layout: null,
    ...payload,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await demoDb.yards.add(yard);
  return yard;
}

async function fetchYardDetail(yardId) {
  const yard = await demoDb.yards.get(yardId);
  if (!yard) return null;

  const slots = await demoDb.yardSlots.where('yardId').equals(yardId).toArray();
  const slotsWithEvents = await Promise.all(
    slots.map(async slot => {
      const currentEvent = await demoDb.yardSlotEvents
        .where('slotId')
        .equals(slot.id)
        .filter(e => !e.checked_out_at)
        .first();
      const vehicle = currentEvent ? await demoDb.vehicles.get(currentEvent.vehicleId) : null;
      return {
        ...slot,
        current_event: currentEvent ? { ...currentEvent, vehicle } : null,
      };
    })
  );

  return { ...yard, slots: slotsWithEvents };
}

function blobToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadYardLayout(yardId, file) {
  const url = await blobToDataUrl(file);
  await demoDb.yards.update(yardId, { layout: { url }, updated_at: nowIso() });
  return demoDb.yards.get(yardId);
}

async function createYardSlot(yardId, payload) {
  const slot = {
    id: uid('demo-slot'),
    yardId,
    slot_number: payload.slot_number,
    position_x: payload.position_x,
    position_y: payload.position_y,
    max_length_m: payload.max_length_m ?? null,
  };
  await demoDb.yardSlots.add(slot);
  return slot;
}

async function yardSlotCheckIn(slotId, vehicleId) {
  const slot = await demoDb.yardSlots.get(slotId);
  const vehicle = await demoDb.vehicles.get(vehicleId);
  if (!slot || !vehicle) {
    return { success: false, message: 'Slot or vehicle not found.' };
  }
  if (slot.max_length_m && vehicle.length_m && vehicle.length_m > slot.max_length_m) {
    return {
      success: false,
      message: `${vehicle.name} (${vehicle.length_m}m) exceeds this slot's maximum length of ${slot.max_length_m}m.`,
    };
  }

  const existing = await demoDb.yardSlotEvents
    .where('slotId')
    .equals(slotId)
    .filter(e => !e.checked_out_at)
    .first();
  if (existing) {
    return { success: false, message: 'This slot is already occupied.' };
  }

  await demoDb.yardSlotEvents.add({
    id: uid('demo-yse'),
    slotId,
    vehicleId,
    checked_in_at: nowIso(),
    checked_out_at: null,
  });

  return { success: true, message: 'Checked in successfully.' };
}

async function yardSlotCheckOut(slotId) {
  const current = await demoDb.yardSlotEvents
    .where('slotId')
    .equals(slotId)
    .filter(e => !e.checked_out_at)
    .first();
  if (current) {
    await demoDb.yardSlotEvents.update(current.id, { checked_out_at: nowIso() });
  }
  return { success: true, message: 'Checked out successfully.' };
}

// ---------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------

async function attachTripRelations(trip) {
  const [vehicle, driver, plannedYardRows] = await Promise.all([
    demoDb.vehicles.get(trip.vehicle_id),
    trip.driver_id ? demoDb.drivers.get(trip.driver_id) : null,
    demoDb.tripPlannedYards.where('tripId').equals(trip.id).toArray(),
  ]);

  const planned_yards = await Promise.all(
    plannedYardRows.map(async py => ({
      ...py,
      yard_id: py.yardId,
      yard: await demoDb.yards.get(py.yardId),
    }))
  );
  planned_yards.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  return { ...trip, vehicle, driver, planned_yards };
}

async function fetchTrips() {
  const trips = await demoDb.trips.toArray();
  trips.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return Promise.all(trips.map(attachTripRelations));
}

async function createTrip(payload) {
  const trip = {
    id: uid('demo-trip'),
    vehicle_id: payload.vehicle_id,
    driver_id: payload.driver_id ?? null,
    fleet_customer_id: payload.fleet_customer_id ?? null,
    trip_reference: payload.trip_reference ?? null,
    purpose: payload.purpose ?? null,
    origin_address: payload.origin_address,
    origin_latitude: payload.origin_latitude ?? null,
    origin_longitude: payload.origin_longitude ?? null,
    destination_address: payload.destination_address,
    destination_latitude: payload.destination_latitude ?? null,
    destination_longitude: payload.destination_longitude ?? null,
    planned_start_at: payload.planned_start_at ?? null,
    planned_end_at: payload.planned_end_at ?? null,
    planned_distance_km: payload.planned_distance_km ?? null,
    odometer_start_km: payload.odometer_start_km ?? null,
    odometer_end_km: null,
    actual_start_at: null,
    actual_end_at: null,
    actual_distance_km: null,
    actual_duration_minutes: null,
    fuel_used_liters: null,
    notes: payload.notes ?? null,
    cancellation_reason: null,
    status: 'planned',
    created_by: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await demoDb.trips.add(trip);

  const plannedYards = payload.planned_yards ?? [];
  await Promise.all(
    plannedYards.map((py, index) =>
      demoDb.tripPlannedYards.add({
        id: uid('demo-tpy'),
        tripId: trip.id,
        yardId: py.yard_id,
        sequence: index + 1,
        stop_purpose: py.stop_purpose ?? null,
        planned_arrival_at: py.planned_arrival_at ?? null,
        planned_departure_at: py.planned_departure_at ?? null,
        actual_arrival_at: null,
        actual_departure_at: null,
        dwell_time_minutes: null,
        status: 'planned',
        actual_source: null,
        notes: null,
      })
    )
  );

  return trip;
}

async function fetchTripDetail(tripId) {
  const trip = await demoDb.trips.get(tripId);
  if (!trip) return null;
  return attachTripRelations(trip);
}

async function startTrip(tripId) {
  await demoDb.trips.update(tripId, {
    status: 'in_progress',
    actual_start_at: nowIso(),
    updated_at: nowIso(),
  });
  return { success: true, message: 'Trip started.' };
}

async function completeTrip(tripId, payload) {
  const trip = await demoDb.trips.get(tripId);
  if (!trip) return { success: false, message: 'Trip not found.' };

  const odometerEnd = payload.odometer_end_km;
  const actualDistance =
    trip.odometer_start_km != null && odometerEnd != null
      ? Number((odometerEnd - trip.odometer_start_km).toFixed(1))
      : trip.planned_distance_km;

  const actualDuration = trip.actual_start_at
    ? Math.round((Date.now() - new Date(trip.actual_start_at).getTime()) / 60000)
    : null;

  await demoDb.trips.update(tripId, {
    status: 'completed',
    odometer_end_km: odometerEnd ?? null,
    fuel_used_liters: payload.fuel_used_liters ?? null,
    notes: payload.notes ?? trip.notes,
    actual_end_at: nowIso(),
    actual_distance_km: actualDistance ?? null,
    actual_duration_minutes: actualDuration,
    updated_at: nowIso(),
  });

  return { success: true, message: 'Trip completed.' };
}

async function cancelTrip(tripId, payload) {
  await demoDb.trips.update(tripId, {
    status: 'cancelled',
    cancellation_reason: payload.cancellation_reason,
    updated_at: nowIso(),
  });
  return { success: true, message: 'Trip cancelled.' };
}

// ---------------------------------------------------------------------
// Compliance documents (shared by vehicles and drivers)
// ---------------------------------------------------------------------

async function fetchComplianceDocuments(documentableType, documentableId) {
  const documents = await demoDb.complianceDocuments
    .where('documentable_type')
    .equals(documentableType)
    .filter(d => d.documentable_id === documentableId)
    .toArray();

  return documents.map(d => ({
    ...d,
    is_expired: isExpired(d.expiry_date),
    is_expiring_soon: isExpiringSoon(d.expiry_date),
  }));
}

async function createComplianceDocument(payload) {
  const document = {
    id: uid('demo-cd'),
    documentable_type: payload.documentable_type,
    documentable_id: payload.documentable_id,
    document_type: payload.document_type,
    document_number: payload.document_number ?? null,
    expiry_date: payload.expiry_date ?? null,
    created_at: nowIso(),
  };
  await demoDb.complianceDocuments.add(document);
  return document;
}

export {
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
};
