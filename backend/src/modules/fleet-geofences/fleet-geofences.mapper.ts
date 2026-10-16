import type { geofences as GeofenceRow, geofence_events as GeofenceEventRow } from '@prisma/client';
import type { Geofence, GeofenceEvent } from './fleet-geofences.types.js';

export function toGeofence(row: GeofenceRow): Geofence {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    yardId: row.yard_id?.toString() ?? null,
    name: row.name,
    centerLatitude: Number(row.center_latitude),
    centerLongitude: Number(row.center_longitude),
    radiusM: row.radius_m,
    alertOn: row.alert_on,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toGeofenceEvent(row: GeofenceEventRow): GeofenceEvent {
  return {
    id: row.id.toString(),
    geofenceId: row.geofence_id.toString(),
    vehicleId: row.vehicle_id.toString(),
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    tripId: row.trip_id?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
