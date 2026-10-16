import type { ActorDirectory } from '../../platform/http/actors.js';
/**
 * Module 4.2 (Gap #5, "the central operational entity"). Domain types for
 * `trips`/`trip_planned_yards` — both `company`/`parent`-ruled per
 * `tenant-rules.ts`. `trip_planned_yards` is confirmed (from
 * `TripPlannedYard.php`'s own docblock + `ARCHITECTURE_DECISIONS.md`
 * ADR-001) to be the yard-specific "planned stop" layer, distinct from
 * `yard_slot_events` (raw geofence enter/exit for ANY vehicle at ANY
 * yard) — ADR-001's broader generic `trip_stops` (any stop type: yard/
 * customer/fuel/rest/…) was never actually built; no such table exists
 * in the frozen schema, so it is out of scope here (Design notes).
 */
export interface Trip {
  id: string;
  companyId: string;
  vehicleId: string;
  driverId: string;
  deviceId: string | null;
  fleetCustomerId: string | null;
  tripReference: string | null;
  purpose: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  originAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  plannedDistanceKm: number | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualDistanceKm: number | null;
  actualDurationMinutes: number | null;
  fuelUsedLiters: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  notes: string | null;
  cancellationReason: string | null;
  /** D-0155: set once by the sensor bridge (step 5) when the destination is reached; never cleared. Step 4 only reads it. */
  destinationReachedAt: Date | null;
  createdBy: string | null;
  /** D-0172 (B6): who last changed the trip (`null` = never edited by a user, or an automatic change — sensor / worker). */
  updatedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreatePlannedYardInput {
  yardId: string;
  stopPurpose: string | null;
  plannedArrivalAt: Date | null;
  plannedDepartureAt: Date | null;
  notes: string | null;
}

/** D-0175 (B5): one entry of `PUT /trips/{id}`'s `planned_yards` — `id` = keep that stop (an `undefined` field keeps its current value), no `id` = a new stop. */
export interface EditPlannedYardInput {
  id?: string | undefined;
  yardId: string;
  stopPurpose?: string | null | undefined;
  plannedArrivalAt?: Date | null | undefined;
  plannedDepartureAt?: Date | null | undefined;
  notes?: string | null | undefined;
}

/** The maximum number of stops on one trip (create and edit). */
export const MAX_TRIP_STOPS = 100;

export interface CreateTripInput {
  vehicleId: string;
  driverId: string | null;
  fleetCustomerId: string | null;
  tripReference: string | null;
  purpose: string | null;
  originAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  plannedDistanceKm: number | null;
  odometerStartKm: number | null;
  notes: string | null;
  plannedYards: CreatePlannedYardInput[];
}

export interface UpdateTripInput {
  fleetCustomerId?: string | null | undefined;
  tripReference?: string | null | undefined;
  purpose?: string | null | undefined;
  originAddress?: string | null | undefined;
  originLatitude?: number | null | undefined;
  originLongitude?: number | null | undefined;
  destinationAddress?: string | null | undefined;
  destinationLatitude?: number | null | undefined;
  destinationLongitude?: number | null | undefined;
  plannedStartAt?: Date | null | undefined;
  plannedEndAt?: Date | null | undefined;
  plannedDistanceKm?: number | null | undefined;
  odometerStartKm?: number | null | undefined;
  fuelUsedLiters?: number | null | undefined;
  notes?: string | null | undefined;
  /** D-0175 (B5): the new stop list (planned trips only); `undefined` = leave the stops alone. */
  plannedYards?: EditPlannedYardInput[] | undefined;
}

export interface CompleteTripInput {
  odometerEndKm: number | null;
  fuelUsedLiters: number | null;
  notes: string | null;
}

export interface CancelTripInput {
  cancellationReason: string | null;
}

export interface ListTripsQuery {
  /** D-0164 (B1): one or several statuses (`undefined` = any). */
  status: ('planned' | 'in_progress' | 'completed' | 'cancelled')[] | undefined;
  search?: string | undefined;
  sortBy?: 'planned_start_at' | 'created_at' | 'status' | 'trip_reference' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  vehicleId: string | undefined;
  driverId: string | undefined;
  customerId: string | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  page: number;
  perPage: number;
}

export interface TripPlannedYard {
  id: string;
  tripId: string;
  yardId: string;
  sequence: number;
  stopPurpose: string | null;
  plannedArrivalAt: Date | null;
  plannedDepartureAt: Date | null;
  actualArrivalAt: Date | null;
  actualDepartureAt: Date | null;
  dwellTimeMinutes: number | null;
  actualSource: 'geofence_auto' | 'driver_reported' | 'manual' | null;
  status: 'planned' | 'arrived' | 'departed' | 'missed';
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** One row of the append-only `trip_stop_events` audit log (D-0155). The stop itself holds the effective value; this keeps every value ever recorded. */
export interface TripStopEvent {
  id: string;
  tripPlannedYardId: string;
  tripId: string;
  eventType: 'arrive' | 'depart';
  occurredAt: Date;
  source: 'geofence_auto' | 'driver_reported' | 'manual';
  reason: string | null;
  recordedBy: string | null;
  createdAt: Date | null;
}

/** Body of `POST /trips/{id}/stops/{stopId}/arrive|depart`. */
export interface StopActionInput {
  /** `null` = "now". */
  occurredAt: Date | null;
  reason: string | null;
}

/** What an arrive/depart writes on the stop row (the audit event is appended in the same transaction). */
export interface RecordStopEventInput {
  eventType: 'arrive' | 'depart';
  /** `manual` from the arrive/depart endpoints; `geofence_auto` from the sensor bridge (D-0156). */
  source: 'geofence_auto' | 'driver_reported' | 'manual';
  occurredAt: Date;
  reason: string | null;
  /** `null` for sensor events. */
  recordedBy: string | null;
  /** Sensor writes only *fill*: the update applies only while the stop still has this status (guards against a racing manual edit). */
  requireStatus?: 'planned' | 'arrived' | undefined;
  stopUpdate: {
    status: 'arrived' | 'departed';
    actualArrivalAt?: Date | undefined;
    actualDepartureAt?: Date | undefined;
    dwellTimeMinutes: number | null;
  };
}

export interface DevicePositionPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: Date;
}

export interface FleetCustomerBrief {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
}

export interface YardBrief {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** `fleetVehiclesDriversRepository` doubles as this module's vehicle-ownership + current-assignment + display-brief lookup (interface-typed, not a direct repository import — CONVENTIONS.md "Modules"), same pattern as module 4.1's own cross-module lookups. Method names match the concrete repository exactly (`findVehicleById`/`currentAssignmentForVehicle`/`currentDeviceAssignmentForVehicle` already exist there); `findVehicleById`'s return type here is a narrower structural subset of the real `Vehicle` it returns. */
export interface TripsVehiclesLookup {
  findVehicleById(id: string): Promise<
    | {
        id: string;
        name: string;
        vehicleCategory: string | null;
        make: string | null;
        model: string | null;
        plate?: string | null;
      }
    | undefined
  >;
  currentAssignmentForVehicle(vehicleId: string): Promise<{ driverId: string } | undefined>;
  currentDeviceAssignmentForVehicle(vehicleId: string): Promise<{ deviceId: string } | undefined>;
  /** D-0156: completing a trip with an end odometer updates the vehicle's odometer. */
  setOdometerKm(vehicleId: string, odometerKm: number): Promise<void>;
}

/** D-0156: `fleetGeofencesRepository` doubles as `startTrip`'s "is the vehicle already inside a stop's geofence?" lookup (repository, not service — keeps the wiring acyclic). */
export interface TripsGeofencesLookup {
  yardIdsVehicleIsInside(vehicleId: string, yardIds: string[]): Promise<string[]>;
}

/** `fleetVehiclesDriversRepository` doubles as this module's driver-ownership check + display-brief lookup — tightens Laravel's own bare `exists:drivers,id` (no company scoping, same bug class as module 4.1's D-0077 findings) to the caller's own already company-scoped `findDriverById`. */
export interface TripsDriversLookup {
  findDriverById(
    id: string
  ): Promise<
    { id: string; firstName: string; lastName: string; licenseNumber: string | null } | undefined
  >;
}

/** `fleetVehiclesDriversRepository.incrementAssignmentMetrics` (new method, added alongside this module) doubles as this module's `driver_vehicle_assignments.trip_count`/`distance_km` updater — `TripService::incrementAssignmentMetrics`'s exact targeted-UPDATE port, kept on module 4.1's own repository since it owns `driver_vehicle_assignments`. */
export interface TripsAssignmentMetricsLookup {
  incrementAssignmentMetrics(
    driverId: string,
    vehicleId: string,
    asOf: Date,
    distanceKm: number
  ): Promise<void>;
}

/** `devicesRepository` doubles as this module's device-brief lookup for `show()`'s `device:id,name,device_unique_identifier` eager load (interface-typed, not a direct repository import), same pattern as module 4.1's `FleetDevicesLookup`. */
export interface TripsDevicesLookup {
  findByIdUnscoped(
    id: string
  ): Promise<{ id: string; name: string; deviceUniqueIdentifier: string } | undefined>;
}

/** `usersRepository` doubles as this module's `created_by` display-name lookup, same pattern as module 4.1's `FleetUsersLookup`. */
export interface TripsUsersLookup extends ActorDirectory {
  findContactById(
    userId: string
  ): Promise<{ id: string; firstName: string; lastName: string } | undefined>;
}
