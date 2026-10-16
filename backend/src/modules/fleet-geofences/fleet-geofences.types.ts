import type { Bbox } from '../../platform/http/bbox.js';

/**
 * Module 4.3 (`geofences`/`geofence_events`, `GeofenceController`/
 * `GeofenceService`). `geofences` is `company`-ruled (tenant-rules.ts);
 * `geofence_events` is `parent`-ruled (no own tenant column) — reached only
 * through an already company-scoped `geofence_id` this module's own
 * `findGeofenceById` already verified, same discipline as module 4.2's
 * `trip_planned_yards`.
 *
 * Circular geometry only (`center_latitude`/`center_longitude`/`radius_m`)
 * — the frozen schema has no polygon/shape column at all, confirmed in
 * `geofence-detection.md` §1.3.
 */
export interface Geofence {
  id: string;
  companyId: string;
  yardId: string | null;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusM: number;
  alertOn: 'enter' | 'exit' | 'both';
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** D-0172 (B6): who created / last changed the record (`null` = unknown, or — `updatedBy` — an automatic change). */
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateGeofenceInput {
  name: string;
  yardId: string | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusM: number;
  alertOn: 'enter' | 'exit' | 'both';
}

export interface UpdateGeofenceInput {
  name: string | undefined;
  radiusM: number | undefined;
  alertOn: 'enter' | 'exit' | 'both' | undefined;
  isActive: boolean | undefined;
  /** D-0162: a new centre — allowed for MANUAL geofences only (a yard-linked geofence moves with its yard). Always both or neither. */
  centerLatitude?: number | undefined;
  centerLongitude?: number | undefined;
}

/** D-0162: `FleetYardsService` keeps a yard's linked geofence in step with the yard (interface-typed; `FleetGeofencesRepository` implements it). Company-scoped by the ambient request context. */
export interface YardsGeofencesLookup {
  /** The EARLIEST geofence linked to each yard (a yard may have several — the first is "its" geofence), keyed by yard id. */
  linkedGeofencesForYards(yardIds: string[]): Promise<Map<string, { id: string; radiusM: number }>>;
  createYardGeofence(input: {
    yardId: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusM: number;
  }): Promise<{ id: string; radiusM: number }>;
  updateYardGeofence(
    id: string,
    input: { latitude?: number; longitude?: number; radiusM?: number }
  ): Promise<void>;
  /** D-0182 (L5): switches EVERY geofence linked to the yard on / off with the yard; returns the ids that actually changed. */
  setYardGeofencesActive(yardId: string, isActive: boolean): Promise<string[]>;
}

/** `GeofenceEvent` — keyed by `vehicle_id`, never `device_id` (no such column exists at all, 11.4). */
export interface GeofenceEvent {
  id: string;
  geofenceId: string;
  vehicleId: string;
  eventType: 'enter' | 'exit';
  occurredAt: Date;
  /** D-0156: the vehicle's in-progress trip when it happened; `null` = none (and for every event recorded before step 5). */
  tripId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** D-0164 (B1) — the geofence list's filters; `window` undefined = the flat, unpaged list. */
export interface GeofenceListQuery {
  search?: string | undefined;
  isActive?: boolean | undefined;
  yardId?: string | undefined;
  linked?: boolean | undefined;
  alertOn?: 'enter' | 'exit' | 'both' | undefined;
  /** D-0180 (B8): keep only geofences whose circle overlaps this map box. */
  bbox?: Bbox | undefined;
  sortBy?: 'name' | 'radius_m' | 'created_at' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** D-0165 (B2) — the geofence picker's filters. */
export interface GeofenceOptionsQuery {
  /** D-0171 */
  includeInactive?: boolean | undefined;
  search?: string | undefined;
  yardId?: string | undefined;
  linked?: boolean | undefined;
  limit: number;
}

/** D-0164 (B1) — the geofence-event list's filters. `window` set = paged, else the newest `limit` events. */
export interface GeofenceEventListQuery {
  limit: number;
  search?: string | undefined;
  geofenceId?: string | undefined;
  vehicleId?: string | undefined;
  tripId?: string | undefined;
  eventType?: 'enter' | 'exit' | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}

/** A `GeofenceEvent` joined with its geofence's *current* `alert_on` — see the repository's own doc comment for why this join, not a stored column, is what `alert_on`-filters `GET /geofences/events` (D-0079). */
export interface GeofenceEventWithAlertOn extends GeofenceEvent {
  geofenceAlertOn: 'enter' | 'exit' | 'both';
  /** KNOWN_ISSUES 11.79 — Laravel's `events()` eager-loads `geofence:id,name`; Node's 11.4 fix had dropped it. */
  geofenceName: string;
  geofenceYardId: string | null;
}

export interface YardBrief {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface VehicleBrief {
  id: string;
  name: string;
}

/**
 * `fleetVehiclesDriversRepository` doubles as this module's device→vehicle
 * resolution (interface-typed, not a direct repository import —
 * CONVENTIONS.md "Modules"), same pattern as module 4.2's
 * `TripsVehiclesLookup`. `currentVehicleIdForDevice` is a new method added
 * alongside this module (module 4.1 owns `vehicle_device_assignments`) —
 * the reverse direction of that module's own `currentDeviceAssignmentForVehicle`,
 * `GeofenceService::checkPosition`'s device→vehicle resolution step (§1.1).
 * Global, unscoped by device id — matches Laravel's own unscoped
 * `VehicleDeviceAssignment::where('device_id', ...)`, and this is reached
 * from ingestion's no-request-context path (same discipline as that
 * module's `deviceHasActiveAssignment`).
 */
export interface GeofencesVehicleAssignmentLookup {
  currentVehicleIdForDevice(deviceId: string): Promise<string | undefined>;
}

/** Same repository, doubling as this module's vehicle-brief lookup for `events()`'s `vehicle:id,name` eager load (11.4's resolution). */
export interface GeofencesVehiclesLookup {
  findVehicleById(id: string): Promise<{ id: string; name: string } | undefined>;
}

/** The slice of a trip the detector needs per position (D-0156). */
export interface GeofencesTripContext {
  id: string;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationReachedAt: Date | null;
}

/**
 * D-0156 (fleet step 5, the sensor→trip bridge): `FleetTripsService` doubles as the detector's trips side
 * (interface-typed, not a direct import — CONVENTIONS.md "Modules"). All three methods are callable from ingestion's
 * no-request-context worker path (`companyId` is passed explicitly). Trips never depend on the geofences *service*
 * (only its repository, through `TripsGeofencesLookup`), so the wiring stays acyclic.
 */
export interface GeofencesTripsLookup {
  /** The vehicle's `in_progress` trip, if any. */
  findInProgressTripForVehicle(
    companyId: string,
    vehicleId: string
  ): Promise<GeofencesTripContext | undefined>;
  /** Sets `destination_reached_at` (once, never cleared) when the position is within 200 m of the trip's destination coordinates. */
  checkDestinationProximity(
    trip: GeofencesTripContext,
    latitude: number,
    longitude: number
  ): Promise<void>;
  /** Enter → the first `planned` stop of that yard becomes `arrived`; exit → the earliest `arrived` stop departs. Fills empty values only. */
  recordGeofenceStopTransition(input: {
    tripId: string;
    yardId: string;
    eventType: 'enter' | 'exit';
    occurredAt: Date;
  }): Promise<void>;
}
