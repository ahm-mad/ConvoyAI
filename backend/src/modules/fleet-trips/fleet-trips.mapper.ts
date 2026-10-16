import type {
  trips as TripRow,
  trip_planned_yards as TripPlannedYardRow,
  trip_stop_events as TripStopEventRow,
} from '@prisma/client';
import type { Trip, TripPlannedYard, TripStopEvent } from './fleet-trips.types.js';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toTrip(row: TripRow): Trip {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    vehicleId: row.vehicle_id.toString(),
    driverId: row.driver_id.toString(),
    deviceId: row.device_id?.toString() ?? null,
    fleetCustomerId: row.fleet_customer_id?.toString() ?? null,
    tripReference: row.trip_reference,
    purpose: row.purpose,
    status: row.status,
    originAddress: row.origin_address,
    originLatitude: toNumberOrNull(row.origin_latitude),
    originLongitude: toNumberOrNull(row.origin_longitude),
    destinationAddress: row.destination_address,
    destinationLatitude: toNumberOrNull(row.destination_latitude),
    destinationLongitude: toNumberOrNull(row.destination_longitude),
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    plannedDistanceKm: toNumberOrNull(row.planned_distance_km),
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    actualDistanceKm: toNumberOrNull(row.actual_distance_km),
    actualDurationMinutes: toNumberOrNull(row.actual_duration_minutes),
    fuelUsedLiters: toNumberOrNull(row.fuel_used_liters),
    odometerStartKm: toNumberOrNull(row.odometer_start_km),
    odometerEndKm: toNumberOrNull(row.odometer_end_km),
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    destinationReachedAt: row.destination_reached_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTripPlannedYard(row: TripPlannedYardRow): TripPlannedYard {
  return {
    id: row.id.toString(),
    tripId: row.trip_id.toString(),
    yardId: row.yard_id.toString(),
    sequence: row.sequence,
    stopPurpose: row.stop_purpose,
    plannedArrivalAt: row.planned_arrival_at,
    plannedDepartureAt: row.planned_departure_at,
    actualArrivalAt: row.actual_arrival_at,
    actualDepartureAt: row.actual_departure_at,
    dwellTimeMinutes: toNumberOrNull(row.dwell_time_minutes),
    actualSource: row.actual_source,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTripStopEvent(row: TripStopEventRow): TripStopEvent {
  return {
    id: row.id.toString(),
    tripPlannedYardId: row.trip_planned_yard_id.toString(),
    tripId: row.trip_id.toString(),
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    source: row.source,
    reason: row.reason,
    recordedBy: row.recorded_by?.toString() ?? null,
    createdAt: row.created_at,
  };
}

/** D-0155: the trip is waiting for the operator to confirm completion — destination reached, still `in_progress`. */
export function tripAwaitingCompletion(
  trip: Pick<Trip, 'status' | 'destinationReachedAt'>
): boolean {
  return trip.status === 'in_progress' && trip.destinationReachedAt !== null;
}

/** `Trip::isEditable`/`canStart`/`canComplete`/`canCancel` ported exactly. */
export function tripIsEditable(status: Trip['status']): boolean {
  return status === 'planned' || status === 'in_progress';
}

export function tripCanStart(status: Trip['status']): boolean {
  return status === 'planned';
}

export function tripCanComplete(status: Trip['status']): boolean {
  return status === 'in_progress';
}

export function tripCanCancel(status: Trip['status']): boolean {
  return status === 'planned' || status === 'in_progress';
}

/** `TripService::generateReference` ported exactly — "TRP-00042", 5-digit zero-padded, company-scoped sequential count + 1. */
export function formatTripReference(countIncludingNew: number): string {
  return `TRP-${String(countIncludingNew).padStart(5, '0')}`;
}
