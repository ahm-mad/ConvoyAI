import { auditFields, loadActors, type ActorMap } from '../../platform/http/actors.js';
import { statusCounts } from '../../platform/http/counts.js';
import { assertNotStale } from '../../platform/http/concurrency.js';
import { BULK_LIMIT, bulkResponse, resolveBulkTargets, runBulk } from '../../platform/http/bulk.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { getRequestContext, runAsSystemAsync } from '../../platform/http/request-context.js';
import { logger } from '../../platform/logging/logger.js';
import type { TripUpdateReason } from '../../platform/realtime/events.js';
import type { FleetRealtimePort } from '../../platform/realtime/fleet-realtime.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { haversineMeters } from '../../shared/utils/geo.js';
import {
  tripIsEditable,
  tripCanStart,
  tripCanComplete,
  tripCanCancel,
  tripAwaitingCompletion,
  formatTripReference,
} from './fleet-trips.mapper.js';
import type { GeofencesTripContext } from '../fleet-geofences/fleet-geofences.types.js';
import type { FleetTripsRepository } from './fleet-trips.repository.js';
import type {
  CancelTripInput,
  CompleteTripInput,
  CreateTripInput,
  DevicePositionPoint,
  ListTripsQuery,
  RecordStopEventInput,
  StopActionInput,
  Trip,
  TripPlannedYard,
  TripStopEvent,
  TripsAssignmentMetricsLookup,
  TripsDevicesLookup,
  TripsDriversLookup,
  TripsGeofencesLookup,
  TripsUsersLookup,
  TripsVehiclesLookup,
  UpdateTripInput,
} from './fleet-trips.types.js';
import { effectiveStops, validateStopRules } from './fleet-trips.stops.js';

interface TripExportRow {
  trip: Trip;
  vehicleName: string | null;
  driverName: string | null;
}

/** D-0168 (B11) — the trip CSV's documented column set. */
const TRIP_EXPORT_COLUMNS: CsvColumn<TripExportRow>[] = [
  { header: 'id', value: r => r.trip.id },
  { header: 'trip_reference', value: r => r.trip.tripReference },
  { header: 'status', value: r => r.trip.status },
  { header: 'purpose', value: r => r.trip.purpose },
  { header: 'vehicle_id', value: r => r.trip.vehicleId },
  { header: 'vehicle', value: r => r.vehicleName },
  { header: 'driver_id', value: r => r.trip.driverId },
  { header: 'driver', value: r => r.driverName },
  { header: 'origin_address', value: r => r.trip.originAddress },
  { header: 'origin_latitude', value: r => r.trip.originLatitude },
  { header: 'origin_longitude', value: r => r.trip.originLongitude },
  { header: 'destination_address', value: r => r.trip.destinationAddress },
  { header: 'destination_latitude', value: r => r.trip.destinationLatitude },
  { header: 'destination_longitude', value: r => r.trip.destinationLongitude },
  { header: 'planned_start_at', value: r => r.trip.plannedStartAt },
  { header: 'planned_end_at', value: r => r.trip.plannedEndAt },
  { header: 'actual_start_at', value: r => r.trip.actualStartAt },
  { header: 'actual_end_at', value: r => r.trip.actualEndAt },
  { header: 'destination_reached_at', value: r => r.trip.destinationReachedAt },
  { header: 'planned_distance_km', value: r => r.trip.plannedDistanceKm },
  { header: 'actual_distance_km', value: r => r.trip.actualDistanceKm },
  { header: 'actual_duration_minutes', value: r => r.trip.actualDurationMinutes },
  { header: 'odometer_start_km', value: r => r.trip.odometerStartKm },
  { header: 'odometer_end_km', value: r => r.trip.odometerEndKm },
  { header: 'fuel_used_liters', value: r => r.trip.fuelUsedLiters },
  { header: 'cancellation_reason', value: r => r.trip.cancellationReason },
  { header: 'notes', value: r => r.trip.notes },
  { header: 'created_at', value: r => r.trip.createdAt },
];

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

/** D-0155: how far ahead of the server clock a client-supplied stop time may be (client clock skew), and the trail size cap of `GET /trips/{id}/route`. */
const FUTURE_TOLERANCE_MS = 60_000;
const ROUTE_TRAIL_MAX_POINTS = 5000;
/** D-0151 (owner): the vehicle counts as having reached the trip's destination when it is within this distance of the destination coordinates. */
const DESTINATION_RADIUS_M = 200;

/** `TIMESTAMP(0)` columns hold whole seconds — normalise before comparing so an input can never be "before" the value it was rounded into. */
function toWholeSecond(date: Date): Date {
  return new Date(Math.round(date.getTime() / 1000) * 1000);
}

/** Evenly thins `items` to at most `max`, always keeping the first and last (a route drawn from the result still starts and ends where the trail does). */
function thinEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const result: T[] = [];
  for (let i = 0; i < max; i += 1) {
    const item = items[Math.round((i * (items.length - 1)) / (max - 1))];
    if (item !== undefined) result.push(item);
  }
  return result;
}

/**
 * Business logic for module 4.2 (`TripController`/`TripService`,
 * `app/Domain/Devices/{Http/Controllers,Services}/Trip*`). GPS distance
 * uses the shared `shared/utils/geo.ts`'s `haversineMeters` (already
 * extracted from module 4.1's `VehicleAnalyticsService` port) — folds in
 * `geofence-detection.md` §3's noted third duplicate haversine
 * (`TripService::haversineKm()`), not a separate copy.
 */
export class FleetTripsService {
  constructor(
    private readonly repo: FleetTripsRepository,
    private readonly vehiclesLookup: TripsVehiclesLookup,
    private readonly driversLookup: TripsDriversLookup,
    private readonly assignmentMetricsLookup: TripsAssignmentMetricsLookup,
    private readonly devicesLookup: TripsDevicesLookup,
    private readonly usersLookup: TripsUsersLookup,
    private readonly geofencesLookup: TripsGeofencesLookup,
    private readonly realtime: FleetRealtimePort
  ) {}

  // ===========================================================================
  // JSON shaping helpers
  // ===========================================================================

  /** D-0172 (B6): one batched lookup of the people behind a response's `created_by` / `updated_by` ids. */
  private actorsFor(...ids: Array<string | null>): Promise<ActorMap> {
    return loadActors(this.usersLookup, ids);
  }

  private baseTripJson(trip: Trip, actors: ActorMap): Json {
    return {
      id: trip.id,
      company_id: trip.companyId,
      vehicle_id: trip.vehicleId,
      driver_id: trip.driverId,
      device_id: trip.deviceId,
      fleet_customer_id: trip.fleetCustomerId,
      trip_reference: trip.tripReference,
      purpose: trip.purpose,
      status: trip.status,
      origin_address: trip.originAddress,
      origin_latitude: trip.originLatitude,
      origin_longitude: trip.originLongitude,
      destination_address: trip.destinationAddress,
      destination_latitude: trip.destinationLatitude,
      destination_longitude: trip.destinationLongitude,
      planned_start_at: trip.plannedStartAt,
      planned_end_at: trip.plannedEndAt,
      actual_start_at: trip.actualStartAt,
      actual_end_at: trip.actualEndAt,
      planned_distance_km: trip.plannedDistanceKm,
      actual_distance_km: trip.actualDistanceKm,
      actual_duration_minutes: trip.actualDurationMinutes,
      fuel_used_liters: trip.fuelUsedLiters,
      odometer_start_km: trip.odometerStartKm,
      odometer_end_km: trip.odometerEndKm,
      notes: trip.notes,
      cancellation_reason: trip.cancellationReason,
      created_at: trip.createdAt,
      updated_at: trip.updatedAt,
      ...auditFields(actors, trip.createdBy, trip.updatedBy),
    };
  }

  private async vehicleBrief(vehicleId: string, rich: boolean): Promise<Json | null> {
    const vehicle = await this.vehiclesLookup.findVehicleById(vehicleId);
    if (!vehicle) return null;
    return rich
      ? {
          id: vehicle.id,
          name: vehicle.name,
          vehicle_category: vehicle.vehicleCategory,
          make: vehicle.make,
          model: vehicle.model,
        }
      : { id: vehicle.id, name: vehicle.name };
  }

  private async driverBrief(driverId: string, rich: boolean): Promise<Json | null> {
    const driver = await this.driversLookup.findDriverById(driverId);
    if (!driver) return null;
    return rich
      ? {
          id: driver.id,
          first_name: driver.firstName,
          last_name: driver.lastName,
          license_number: driver.licenseNumber,
        }
      : { id: driver.id, first_name: driver.firstName, last_name: driver.lastName };
  }

  private async customerBrief(customerId: string | null, rich: boolean): Promise<Json | null> {
    if (!customerId) return null;
    const customer = await this.repo.findFleetCustomerBrief(customerId);
    if (!customer) return null;
    return rich
      ? {
          id: customer.id,
          name: customer.name,
          contact_name: customer.contactName,
          contact_phone: customer.contactPhone,
        }
      : { id: customer.id, name: customer.name };
  }

  /** The audit-log entry shape (`05` §5 4.4). `recorded_by` is resolved through the users lookup (cached per request — one operator usually recorded many events). */
  private async stopEventJson(
    event: TripStopEvent,
    userCache: Map<string, Json | null>
  ): Promise<Json> {
    let recordedBy: Json | null = null;
    if (event.recordedBy) {
      if (!userCache.has(event.recordedBy)) {
        const user = await this.usersLookup.findContactById(event.recordedBy);
        userCache.set(
          event.recordedBy,
          user ? { id: user.id, first_name: user.firstName, last_name: user.lastName } : null
        );
      }
      recordedBy = userCache.get(event.recordedBy) ?? null;
    }
    return {
      id: event.id,
      event_type: event.eventType,
      occurred_at: event.occurredAt,
      source: event.source,
      reason: event.reason,
      recorded_by: recordedBy,
      created_at: event.createdAt,
    };
  }

  private async stopJson(
    py: TripPlannedYard,
    events: TripStopEvent[],
    userCache: Map<string, Json | null>
  ): Promise<Json> {
    const yard = await this.repo.findYardBrief(py.yardId);
    const stopEvents: Json[] = [];
    for (const event of events) {
      if (event.tripPlannedYardId === py.id)
        stopEvents.push(await this.stopEventJson(event, userCache));
    }
    return {
      id: py.id,
      trip_id: py.tripId,
      yard_id: py.yardId,
      sequence: py.sequence,
      stop_purpose: py.stopPurpose,
      planned_arrival_at: py.plannedArrivalAt,
      planned_departure_at: py.plannedDepartureAt,
      actual_arrival_at: py.actualArrivalAt,
      actual_departure_at: py.actualDepartureAt,
      dwell_time_minutes: py.dwellTimeMinutes,
      actual_source: py.actualSource,
      status: py.status,
      notes: py.notes,
      yard: yard
        ? {
            id: yard.id,
            name: yard.name,
            address: yard.address,
            latitude: yard.latitude,
            longitude: yard.longitude,
          }
        : null,
      events: stopEvents,
    };
  }

  private async plannedYardsJson(tripId: string): Promise<Json[]> {
    const plannedYards = await this.repo.listPlannedYardsForTrip(tripId);
    const events = await this.repo.listStopEventsForTrip(tripId);
    const userCache = new Map<string, Json | null>();
    const result: Json[] = [];
    for (const py of plannedYards) result.push(await this.stopJson(py, events, userCache));
    return result;
  }

  // ===========================================================================
  // GPS distance (Haversine over device_positions)
  // ===========================================================================

  private distanceFromPositions(positions: DevicePositionPoint[]): number | null {
    if (positions.length < 2) return null;
    let totalMeters = 0;
    for (let i = 1; i < positions.length; i += 1) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (!prev || !curr) continue;
      totalMeters += haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return Math.round((totalMeters / 1000) * 1000) / 1000;
  }

  private async computeGpsDistanceKm(
    deviceId: string,
    from: Date,
    to: Date
  ): Promise<number | null> {
    const positions = await this.repo.positionsInWindow(deviceId, from, to);
    return this.distanceFromPositions(positions);
  }

  // ===========================================================================
  // List / Create / Show / Update
  // ===========================================================================

  /** `GET /trips/counts` (D-0179, B7) — trips per status under the list's filters and search (`status` ignored, so every chip has its true count). */
  async tripCounts(query: Omit<ListTripsQuery, 'page' | 'perPage'>) {
    const rows = await this.repo.tripStatusCounts(query);
    return {
      success: true,
      message: 'Trip counts retrieved successfully.',
      data: statusCounts(['planned', 'in_progress', 'completed', 'cancelled'], rows),
    };
  }

  async listTrips(query: ListTripsQuery): Promise<{ items: Json[]; total: number }> {
    const { items, total } = await this.repo.listTrips(query);
    const actors = await this.actorsFor(...items.flatMap(trip => [trip.createdBy, trip.updatedBy]));
    const result: Json[] = [];
    for (const trip of items) {
      result.push({
        ...this.baseTripJson(trip, actors),
        vehicle: await this.vehicleBrief(trip.vehicleId, false),
        driver: await this.driverBrief(trip.driverId, false),
        customer: await this.customerBrief(trip.fleetCustomerId, false),
      });
    }
    return { items: result, total };
  }

  /** `TripService::create` — vehicle/driver/customer/yard existence checks all tightened to the caller's own company (D-0077's class of finding: Laravel's are all bare `exists:<table>,id`, no scoping). */
  async createTrip(input: CreateTripInput) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    const vehicle = await this.vehiclesLookup.findVehicleById(input.vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found.');

    // D-0151 (owner, 2026-09-24): several `planned` trips per vehicle are allowed — Laravel also rejected a *create* while another
    // trip was in progress, which blocked pre-planning. The real invariant (one `in_progress` trip per vehicle) is still enforced by `startTrip`.
    let driverId: string;
    if (input.driverId) {
      const driver = await this.driversLookup.findDriverById(input.driverId);
      if (!driver) {
        throw new ValidationError('The selected driver id is invalid.', {
          driver_id: ['The selected driver id is invalid.'],
        });
      }
      driverId = input.driverId;
    } else {
      const currentAssignment = await this.vehiclesLookup.currentAssignmentForVehicle(
        input.vehicleId
      );
      if (!currentAssignment) {
        throw new ValidationError(
          'No driver is currently assigned to this vehicle. Provide driver_id or assign a driver first.',
          {
            driver_id: [
              'No driver is currently assigned to this vehicle. Provide driver_id or assign a driver first.',
            ],
          }
        );
      }
      driverId = currentAssignment.driverId;
    }

    if (input.fleetCustomerId) {
      const customer = await this.repo.findFleetCustomerBrief(input.fleetCustomerId);
      if (!customer) {
        throw new ValidationError('The selected fleet customer id is invalid.', {
          fleet_customer_id: ['The selected fleet customer id is invalid.'],
        });
      }
    }

    validateStopRules(input.plannedYards);
    await this.assertStopYardsAreTheCallers(input.plannedYards);

    const deviceAssignment = await this.vehiclesLookup.currentDeviceAssignmentForVehicle(
      input.vehicleId
    );
    const tripReference =
      input.tripReference ?? formatTripReference((await this.repo.countTripsForCompany()) + 1);

    const trip = await this.repo.createTrip({
      vehicleId: input.vehicleId,
      driverId,
      deviceId: deviceAssignment?.deviceId ?? null,
      fleetCustomerId: input.fleetCustomerId,
      tripReference,
      purpose: input.purpose,
      originAddress: input.originAddress,
      originLatitude: input.originLatitude,
      originLongitude: input.originLongitude,
      destinationAddress: input.destinationAddress,
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
      plannedStartAt: input.plannedStartAt,
      plannedEndAt: input.plannedEndAt,
      plannedDistanceKm: input.plannedDistanceKm,
      odometerStartKm: input.odometerStartKm,
      notes: input.notes,
      createdBy: context.userId,
    });

    if (input.plannedYards.length > 0) {
      await this.repo.createPlannedYards(trip.id, input.plannedYards);
    }
    await this.publishTripUpdate(trip.id, 'created', null, trip.createdAt ?? new Date()); // D-0163

    return {
      success: true,
      message: 'Trip created successfully.',
      data: {
        ...this.baseTripJson(trip, await this.actorsFor(trip.createdBy, trip.updatedBy)),
        vehicle: await this.vehicleBrief(trip.vehicleId, false),
        driver: await this.driverBrief(trip.driverId, false),
        customer: await this.customerBrief(trip.fleetCustomerId, false),
        planned_yards: await this.plannedYardsJson(trip.id),
      },
    };
  }

  async getTrip(id: string) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');

    const device = trip.deviceId
      ? await this.devicesLookup.findByIdUnscoped(trip.deviceId)
      : undefined;

    return {
      success: true,
      message: 'Trip retrieved successfully.',
      data: {
        ...this.baseTripJson(trip, await this.actorsFor(trip.createdBy, trip.updatedBy)),
        vehicle: await this.vehicleBrief(trip.vehicleId, true),
        driver: await this.driverBrief(trip.driverId, true),
        device: device
          ? {
              id: device.id,
              name: device.name,
              device_unique_identifier: device.deviceUniqueIdentifier,
            }
          : null,
        customer: await this.customerBrief(trip.fleetCustomerId, true),
        destination_reached_at: trip.destinationReachedAt,
        awaiting_completion: tripAwaitingCompletion(trip),
        planned_yards: await this.plannedYardsJson(trip.id),
      },
    };
  }

  /** `TripController::update` — only `planned`/`in_progress` trips are editable, matching `Trip::isEditable`. */
  async updateTrip(id: string, input: UpdateTripInput, expectedUpdatedAt?: Date | null) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    await assertNotStale(expectedUpdatedAt, trip, this.usersLookup); // D-0176 (B13) — before any other rule, so the operator learns first that the trip moved on
    if (!tripIsEditable(trip.status)) {
      throw new ValidationError('Only planned or in_progress trips can be edited.');
    }

    if (input.fleetCustomerId !== undefined && input.fleetCustomerId !== null) {
      const customer = await this.repo.findFleetCustomerBrief(input.fleetCustomerId);
      if (!customer) {
        throw new ValidationError('The selected fleet customer id is invalid.', {
          fleet_customer_id: ['The selected fleet customer id is invalid.'],
        });
      }
    }

    // D-0175 (B5): the stop list is replaced as a whole, and only while the trip is still `planned`.
    const { plannedYards, ...tripFields } = input;
    if (plannedYards !== undefined) {
      if (trip.status !== 'planned') {
        throw new ValidationError('Stops can only be edited while the trip is planned.', {
          planned_yards: ['Stops can only be edited while the trip is planned.'],
        });
      }
      const existing = await this.repo.listPlannedYardsForTrip(id);
      const effective = effectiveStops(plannedYards, existing);
      validateStopRules(effective, new Set(existing.map(stop => stop.id)));
      await this.assertStopYardsAreTheCallers(effective);
      if (!(await this.repo.replacePlannedYards(id, plannedYards))) {
        throw new ValidationError('Stops can only be edited while the trip is planned.', {
          planned_yards: ['Stops can only be edited while the trip is planned.'],
        });
      }
    }

    const updated = await this.repo.updateTrip(id, tripFields); // also stamps updated_at / updated_by when only the stops changed
    if (!updated) throw new NotFoundError('Trip not found.');
    await this.publishTripUpdate(id, 'updated', null, updated.updatedAt ?? new Date()); // D-0175 (B5): other operators refetch this trip

    return {
      success: true,
      message: 'Trip updated successfully.',
      data: {
        ...this.baseTripJson(updated, await this.actorsFor(updated.createdBy, updated.updatedBy)),
        vehicle: await this.vehicleBrief(updated.vehicleId, false),
        driver: await this.driverBrief(updated.driverId, false),
        planned_yards: await this.plannedYardsJson(id),
      },
    };
  }

  /** Every stop's yard must be one of the caller's yards (same 422 as create, keyed by the stop's position). */
  private async assertStopYardsAreTheCallers(
    stops: ReadonlyArray<{ yardId: string }>
  ): Promise<void> {
    for (const [index, stop] of stops.entries()) {
      if (!(await this.repo.findYardBrief(stop.yardId))) {
        throw new ValidationError('Validation failed.', {
          [`planned_yards.${String(index)}.yard_id`]: ['The selected yard id is invalid.'],
        });
      }
    }
  }

  /** D-0162 (owner D7): only a `planned` trip can be deleted (anything that has started, finished or been cancelled is history). Removes its planned stops. */
  /** `GET /trips/export` (D-0168, B11) — the trip list's own filters/search/sort, every matching trip as CSV (≤ 50 000; 422 above). */
  exportTrips(query: Omit<ListTripsQuery, 'page' | 'perPage'>) {
    const vehicleNames = new Map<string, string | null>(); // one lookup per distinct vehicle / driver, not per row
    const driverNames = new Map<string, string | null>();
    return planExport('trips', TRIP_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listTrips({ ...query, page, perPage });
      const rows: TripExportRow[] = [];
      for (const trip of items) {
        if (!vehicleNames.has(trip.vehicleId))
          vehicleNames.set(
            trip.vehicleId,
            (await this.vehiclesLookup.findVehicleById(trip.vehicleId))?.name ?? null
          );
        if (!driverNames.has(trip.driverId)) {
          const driver = await this.driversLookup.findDriverById(trip.driverId);
          driverNames.set(
            trip.driverId,
            driver ? `${driver.firstName} ${driver.lastName}`.trim() : null
          );
        }
        rows.push({
          trip,
          vehicleName: vehicleNames.get(trip.vehicleId) ?? null,
          driverName: driverNames.get(trip.driverId) ?? null,
        });
      }
      return { items: rows, total };
    });
  }

  /** `POST /trips/bulk-delete` (D-0166, B10) — each trip goes through the single-trip delete (only `planned` trips; same messages and realtime events). */
  async bulkDeleteTrips(target: {
    ids?: string[] | undefined;
    filter?: Omit<ListTripsQuery, 'page' | 'perPage'> | undefined;
  }) {
    const targets = await resolveBulkTargets({ ids: target.ids }, async () => {
      const { items, total } = await this.repo.listTrips({
        status: undefined,
        vehicleId: undefined,
        driverId: undefined,
        customerId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        ...(target.filter ?? {}),
        page: 1,
        perPage: BULK_LIMIT,
      });
      return { ids: items.map(trip => trip.id), total };
    });
    const results = await runBulk(
      targets.ids,
      async id => ({ message: (await this.deleteTrip(id)).message }),
      'Trip deleted successfully.',
      async id => (await this.repo.findTripById(id))?.tripReference // must be read BEFORE the delete
    );
    return bulkResponse(targets, results);
  }

  async deleteTrip(id: string) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (trip.status !== 'planned') throw new ValidationError('Only planned trips can be deleted.');
    if (!(await this.repo.deleteTrip(id))) throw new NotFoundError('Trip not found.');
    // D-0163: the trip is gone, so the payload comes from the snapshot taken before the delete (a planned trip: no stop, never awaiting completion).
    try {
      await this.realtime.publishTripUpdate(trip.companyId, {
        tripId: trip.id,
        reason: 'deleted',
        status: trip.status,
        awaitingCompletion: false,
        destinationReachedAt: null,
        stop: null,
        occurredAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err, tripId: id }, 'trip:update (deleted) publish failed — dropped');
    }
    return { success: true, message: 'Trip deleted successfully.' };
  }

  // ===========================================================================
  // Lifecycle transitions
  // ===========================================================================

  /** `TripService::start` — planned -> in_progress; re-confirms the device snapshot in case the tracker changed since the trip was planned. */
  async startTrip(id: string) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (!tripCanStart(trip.status)) {
      throw new ValidationError(`Trip cannot be started from status '${trip.status}'.`, {
        status: [`Trip cannot be started from status '${trip.status}'.`],
      });
    }

    if (await this.repo.vehicleHasActiveTrip(trip.vehicleId, id)) {
      throw new ValidationError(
        'This vehicle already has a trip in progress. Complete or cancel it first.'
      );
    }

    const deviceAssignment = await this.vehiclesLookup.currentDeviceAssignmentForVehicle(
      trip.vehicleId
    );
    const updated = await this.repo.updateTrip(id, {
      status: 'in_progress',
      actualStartAt: new Date(),
      deviceId: deviceAssignment?.deviceId ?? trip.deviceId,
    });
    if (!updated) throw new NotFoundError('Trip not found.');

    const seeded = await this.seedStopsAlreadyInside(updated);
    const startedAt = updated.actualStartAt ?? new Date();
    await this.publishTripUpdate(updated.id, 'started', null, startedAt);
    for (const seed of seeded) {
      await this.publishTripUpdate(updated.id, 'stop_arrived', seed.stopId, startedAt);
      if (seed.destinationReached)
        await this.publishTripUpdate(updated.id, 'destination_reached', null, startedAt);
    }

    return {
      success: true,
      message: 'Trip started successfully.',
      data: {
        ...this.baseTripJson(updated, await this.actorsFor(updated.createdBy, updated.updatedBy)),
        vehicle: await this.vehicleBrief(updated.vehicleId, false),
        driver: await this.driverBrief(updated.driverId, false),
      },
    };
  }

  /** `TripService::complete` — in_progress -> completed; distance prefers odometer delta, falls back to GPS Haversine sum. */
  async completeTrip(id: string, input: CompleteTripInput) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (!tripCanComplete(trip.status)) {
      throw new ValidationError(`Trip cannot be completed from status '${trip.status}'.`, {
        status: [`Trip cannot be completed from status '${trip.status}'.`],
      });
    }

    const actualEndAt = new Date();
    const durationMinutes = trip.actualStartAt
      ? Math.round(((actualEndAt.getTime() - trip.actualStartAt.getTime()) / 1000 / 60) * 100) / 100
      : null;

    let distanceKm: number | null = null;
    if (input.odometerEndKm !== null && trip.odometerStartKm !== null) {
      distanceKm = Math.max(0, input.odometerEndKm - trip.odometerStartKm);
    } else if (trip.deviceId && trip.actualStartAt) {
      distanceKm = await this.computeGpsDistanceKm(trip.deviceId, trip.actualStartAt, actualEndAt);
    }

    const updated = await this.repo.updateTrip(id, {
      status: 'completed',
      actualEndAt,
      actualDurationMinutes: durationMinutes,
      actualDistanceKm: distanceKm,
      odometerEndKm: input.odometerEndKm ?? trip.odometerEndKm,
      fuelUsedLiters: input.fuelUsedLiters ?? trip.fuelUsedLiters,
      notes: input.notes ?? trip.notes,
    });
    if (!updated) throw new NotFoundError('Trip not found.');

    // D-0156 (owner D2/D4): stops that never got an arrival are `missed`; an end odometer becomes the vehicle's odometer.
    await this.repo.markPlannedStopsMissed(id);
    if (input.odometerEndKm !== null) {
      await this.vehiclesLookup.setOdometerKm(trip.vehicleId, input.odometerEndKm);
    }

    if (trip.driverId && trip.actualStartAt) {
      await this.assignmentMetricsLookup.incrementAssignmentMetrics(
        trip.driverId,
        trip.vehicleId,
        trip.actualStartAt,
        distanceKm ?? 0
      );
    }
    await this.publishTripUpdate(id, 'completed', null, actualEndAt);

    return {
      success: true,
      message: 'Trip completed successfully.',
      data: {
        ...this.baseTripJson(updated, await this.actorsFor(updated.createdBy, updated.updatedBy)),
        vehicle: await this.vehicleBrief(updated.vehicleId, false),
        driver: await this.driverBrief(updated.driverId, false),
      },
    };
  }

  /** `TripService::cancel` — planned|in_progress -> cancelled. Matches Laravel exactly: no nested relations in the response (the old app returns the bare, freshly-updated trip here, unlike every other transition). */
  async cancelTrip(id: string, input: CancelTripInput) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (!tripCanCancel(trip.status)) {
      throw new ValidationError(`Trip cannot be cancelled from status '${trip.status}'.`, {
        status: [`Trip cannot be cancelled from status '${trip.status}'.`],
      });
    }

    const updated = await this.repo.updateTrip(id, {
      status: 'cancelled',
      cancellationReason: input.cancellationReason,
    });
    if (!updated) throw new NotFoundError('Trip not found.');

    await this.publishTripUpdate(id, 'cancelled', null, new Date());
    return {
      success: true,
      message: 'Trip cancelled successfully.',
      data: this.baseTripJson(updated, await this.actorsFor(updated.createdBy, updated.updatedBy)),
    };
  }

  // ===========================================================================
  // Manual stop arrive / depart (D-0155, owner D5)
  // ===========================================================================

  /** `POST /trips/{id}/stops/{stopId}/arrive` — an operator marks the vehicle as having reached a planned stop (or corrects the time). */
  arriveStop(tripId: string, stopId: string, input: StopActionInput) {
    return this.applyStopEvent('arrive', tripId, stopId, input);
  }

  /** `POST /trips/{id}/stops/{stopId}/depart` — an operator marks the vehicle as having left a planned stop (or corrects the time). */
  departStop(tripId: string, stopId: string, input: StopActionInput) {
    return this.applyStopEvent('depart', tripId, stopId, input);
  }

  /**
   * Shared arrive/depart rules (`05` §9 has the exact strings). The stop keeps the EFFECTIVE time; every recorded value —
   * including the sensor time a manual entry replaces — stays in `trip_stop_events` (owner: "the original sensor time must
   * stay visible/auditable"), which is why replacing an existing time demands a `reason`.
   */
  private async applyStopEvent(
    kind: 'arrive' | 'depart',
    tripId: string,
    stopId: string,
    input: StopActionInput
  ) {
    const context = requireContext();
    const trip = await this.repo.findTripById(tripId);
    if (!trip) throw new NotFoundError('Trip not found.');
    const stop = await this.repo.findPlannedYard(trip.id, stopId);
    if (!stop) throw new NotFoundError('Stop not found.');

    if (trip.status !== 'in_progress' && trip.status !== 'completed') {
      throw new ValidationError(
        'Stops can only be updated while the trip is in progress or after it has completed.'
      );
    }

    const now = new Date();
    const occurredAt = toWholeSecond(input.occurredAt ?? now);
    if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS)
      throw new ValidationError("The time can't be in the future.");
    if (trip.actualStartAt && occurredAt.getTime() < trip.actualStartAt.getTime()) {
      throw new ValidationError("The time can't be before the trip started.");
    }

    const reason = input.reason?.trim() ? input.reason.trim() : null;
    const dwellMinutes = (from: Date, to: Date) =>
      Math.round(((to.getTime() - from.getTime()) / 1000 / 60) * 100) / 100;

    let stopUpdate: RecordStopEventInput['stopUpdate'];
    if (kind === 'arrive') {
      if (stop.actualDepartureAt && occurredAt.getTime() > stop.actualDepartureAt.getTime()) {
        throw new ValidationError("The arrival can't be after the departure.");
      }
      if (stop.actualArrivalAt && !reason) {
        throw new ValidationError('A reason is required to replace an existing arrival time.', {
          reason: ['A reason is required to replace an existing arrival time.'],
        });
      }
      stopUpdate = stop.actualDepartureAt
        ? {
            status: 'departed',
            actualArrivalAt: occurredAt,
            dwellTimeMinutes: dwellMinutes(occurredAt, stop.actualDepartureAt),
          }
        : {
            status: 'arrived',
            actualArrivalAt: occurredAt,
            dwellTimeMinutes: stop.dwellTimeMinutes,
          };
    } else {
      if (!stop.actualArrivalAt)
        throw new ValidationError('Mark the arrival before the departure.');
      if (occurredAt.getTime() < stop.actualArrivalAt.getTime()) {
        throw new ValidationError("The departure can't be before the arrival.");
      }
      if (stop.actualDepartureAt && !reason) {
        throw new ValidationError('A reason is required to replace an existing departure time.', {
          reason: ['A reason is required to replace an existing departure time.'],
        });
      }
      stopUpdate = {
        status: 'departed',
        actualDepartureAt: occurredAt,
        dwellTimeMinutes: dwellMinutes(stop.actualArrivalAt, occurredAt),
      };
    }

    const written = await this.repo.recordStopEvent(trip.id, stop.id, {
      eventType: kind,
      source: 'manual',
      occurredAt,
      reason,
      recordedBy: context.userId,
      stopUpdate,
    });
    if (!written) throw new NotFoundError('Stop not found.');
    const updatedStop = written.stop;
    const events = await this.repo.listStopEventsForTrip(trip.id);

    // D-0156 (owner §0): the last planned stop becoming `arrived` — however it was recorded — is "destination reached".
    let destinationReachedAt = trip.destinationReachedAt;
    let destinationJustReached = false;
    if (kind === 'arrive' && trip.status === 'in_progress' && !destinationReachedAt) {
      if (await this.markDestinationIfLastStop(trip.id, stop.id, occurredAt)) {
        destinationReachedAt = occurredAt;
        destinationJustReached = true;
      }
    }

    // D-0161: a first arrival/departure is `stop_arrived`/`stop_departed`; replacing an existing time is `stop_updated`.
    const replaced =
      kind === 'arrive' ? stop.actualArrivalAt !== null : stop.actualDepartureAt !== null;
    await this.publishTripUpdate(
      trip.id,
      replaced ? 'stop_updated' : kind === 'arrive' ? 'stop_arrived' : 'stop_departed',
      stop.id,
      occurredAt
    );
    if (destinationJustReached)
      await this.publishTripUpdate(trip.id, 'destination_reached', null, occurredAt);

    return {
      success: true,
      message:
        kind === 'arrive'
          ? 'Stop arrival recorded successfully.'
          : 'Stop departure recorded successfully.',
      data: {
        stop: await this.stopJson(updatedStop, events, new Map()),
        trip: {
          id: trip.id,
          status: trip.status,
          awaiting_completion: tripAwaitingCompletion({
            status: trip.status,
            destinationReachedAt,
          }),
        },
      },
    };
  }

  // ===========================================================================
  // Realtime (D-0161) — `trip:update` after every change, from the HTTP process (manual/lifecycle) and the worker (sensor)
  // ===========================================================================

  /**
   * Builds the `trip:update` payload from FRESH data (`05` §7: status, awaitingCompletion, destinationReachedAt, and — for the
   * `stop_*` reasons — the full stop object incl. `events[]`) and puts it on the realtime queue. Runs under the system context
   * because the sensor path has no request context (the trip id is already trusted). **Never throws**: a realtime problem must not
   * fail the arrive/complete/packet that caused it.
   */
  private async publishTripUpdate(
    tripId: string,
    reason: TripUpdateReason,
    stopId: string | null,
    occurredAt: Date
  ): Promise<void> {
    try {
      await runAsSystemAsync(async () => {
        const trip = await this.repo.findTripById(tripId);
        if (!trip) return;
        let stop: Json | null = null;
        if (stopId) {
          const [stops, events] = await Promise.all([
            this.repo.listPlannedYardsForTrip(tripId),
            this.repo.listStopEventsForTrip(tripId),
          ]);
          const found = stops.find(candidate => candidate.id === stopId);
          if (found) stop = await this.stopJson(found, events, new Map());
        }
        await this.realtime.publishTripUpdate(trip.companyId, {
          tripId: trip.id,
          reason,
          status: trip.status,
          awaitingCompletion: tripAwaitingCompletion(trip),
          destinationReachedAt: trip.destinationReachedAt
            ? trip.destinationReachedAt.toISOString()
            : null,
          stop,
          occurredAt: occurredAt.toISOString(),
        });
      });
    } catch (err) {
      logger.warn({ err, tripId, reason }, 'trip:update publish failed — dropped');
    }
  }

  // ===========================================================================
  // Sensor -> trip bridge (D-0156, owner D2/D4) — called from the ingestion worker via `FleetGeofencesService.checkPosition`
  // (no request context: `companyId` is explicit, the repository uses the system context for the company-ruled `trips`)
  // ===========================================================================

  /** `GeofencesTripsLookup` — the vehicle's `in_progress` trip, reduced to what the detector needs per position. */
  async findInProgressTripForVehicle(
    companyId: string,
    vehicleId: string
  ): Promise<GeofencesTripContext | undefined> {
    const trip = await this.repo.findInProgressTripForVehicleUnscoped(companyId, vehicleId);
    if (!trip) return undefined;
    return {
      id: trip.id,
      destinationLatitude: trip.destinationLatitude,
      destinationLongitude: trip.destinationLongitude,
      destinationReachedAt: trip.destinationReachedAt,
    };
  }

  /** `GeofencesTripsLookup` — destination reached by proximity (within 200 m of the trip's destination coordinates); set once, never cleared, never auto-completes. */
  async checkDestinationProximity(
    trip: GeofencesTripContext,
    latitude: number,
    longitude: number
  ): Promise<void> {
    if (trip.destinationReachedAt) return;
    if (trip.destinationLatitude === null || trip.destinationLongitude === null) return;
    const distanceM = haversineMeters(
      trip.destinationLatitude,
      trip.destinationLongitude,
      latitude,
      longitude
    );
    if (distanceM <= DESTINATION_RADIUS_M) {
      const now = new Date();
      if (await this.repo.setDestinationReachedIfUnset(trip.id, now)) {
        await this.publishTripUpdate(trip.id, 'destination_reached', null, now);
      }
    }
  }

  /**
   * `GeofencesTripsLookup` — a geofence linked to a yard was entered/exited by the trip's vehicle.
   * **Enter** → the FIRST still-`planned` stop of that yard (by `sequence` — the same yard can be two stops) becomes `arrived`
   * (`actual_source: geofence_auto`); **exit** → the earliest `arrived`, not-yet-departed stop of that yard becomes `departed`
   * with its dwell. The sensor only **fills** empty values: a stop that already has a manual (or earlier sensor) time is never
   * touched, and a yard that isn't a stop of this trip is ignored (stops are never invented).
   */
  async recordGeofenceStopTransition(input: {
    tripId: string;
    yardId: string;
    eventType: 'enter' | 'exit';
    occurredAt: Date;
  }): Promise<void> {
    const stops = await this.repo.listPlannedYardsForTrip(input.tripId); // ordered by sequence
    const forYard = stops.filter(stop => stop.yardId === input.yardId);
    const occurredAt = toWholeSecond(input.occurredAt);

    if (input.eventType === 'enter') {
      const stop = forYard.find(s => s.status === 'planned' && s.actualArrivalAt === null);
      if (!stop) return;
      const written = await this.repo.recordStopEvent(input.tripId, stop.id, {
        eventType: 'arrive',
        source: 'geofence_auto',
        occurredAt,
        reason: null,
        recordedBy: null,
        requireStatus: 'planned',
        stopUpdate: { status: 'arrived', actualArrivalAt: occurredAt, dwellTimeMinutes: null },
      });
      if (written) {
        const destinationReached = await this.markDestinationIfLastStop(
          input.tripId,
          stop.id,
          occurredAt,
          stops
        );
        await this.publishTripUpdate(input.tripId, 'stop_arrived', stop.id, occurredAt);
        if (destinationReached)
          await this.publishTripUpdate(input.tripId, 'destination_reached', null, occurredAt);
      }
      return;
    }

    const stop = forYard.find(
      s => s.status === 'arrived' && s.actualArrivalAt !== null && s.actualDepartureAt === null
    );
    if (!stop?.actualArrivalAt) return;
    // A manual arrival can be a few seconds "ahead" of the sensor clock — never let the departure precede the arrival.
    const departedAt = new Date(Math.max(occurredAt.getTime(), stop.actualArrivalAt.getTime()));
    const departed = await this.repo.recordStopEvent(input.tripId, stop.id, {
      eventType: 'depart',
      source: 'geofence_auto',
      occurredAt: departedAt,
      reason: null,
      recordedBy: null,
      requireStatus: 'arrived',
      stopUpdate: {
        status: 'departed',
        actualDepartureAt: departedAt,
        dwellTimeMinutes:
          Math.round(((departedAt.getTime() - stop.actualArrivalAt.getTime()) / 1000 / 60) * 100) /
          100,
      },
    });
    if (departed) await this.publishTripUpdate(input.tripId, 'stop_departed', stop.id, departedAt);
  }

  /** Sets `destination_reached_at` when `stopId` is the trip's LAST stop (highest `sequence`); returns whether this call set it. */
  private async markDestinationIfLastStop(
    tripId: string,
    stopId: string,
    at: Date,
    knownStops?: TripPlannedYard[]
  ): Promise<boolean> {
    const stops = knownStops ?? (await this.repo.listPlannedYardsForTrip(tripId));
    const last = stops[stops.length - 1];
    if (!last || last.id !== stopId) return false;
    return this.repo.setDestinationReachedIfUnset(tripId, at);
  }

  /**
   * Trip start (`5.3`): a vehicle that is ALREADY inside a stop's geofence when the trip starts will never produce an `enter`,
   * so that stop (the first `planned` one of each such yard) is marked `arrived` at the start time.
   */
  private async seedStopsAlreadyInside(
    trip: Trip
  ): Promise<{ stopId: string; destinationReached: boolean }[]> {
    const seeded: { stopId: string; destinationReached: boolean }[] = [];
    if (!trip.actualStartAt) return seeded;
    const stops = await this.repo.listPlannedYardsForTrip(trip.id);
    if (stops.length === 0) return seeded;

    const yardIds = [...new Set(stops.map(stop => stop.yardId))];
    const insideYardIds = new Set(
      await this.geofencesLookup.yardIdsVehicleIsInside(trip.vehicleId, yardIds)
    );
    if (insideYardIds.size === 0) return seeded;

    const startAt = toWholeSecond(trip.actualStartAt);
    for (const yardId of insideYardIds) {
      const stop = stops.find(s => s.yardId === yardId && s.status === 'planned');
      if (!stop) continue;
      const written = await this.repo.recordStopEvent(trip.id, stop.id, {
        eventType: 'arrive',
        source: 'geofence_auto',
        occurredAt: startAt,
        reason: null,
        recordedBy: null,
        requireStatus: 'planned',
        stopUpdate: { status: 'arrived', actualArrivalAt: startAt, dwellTimeMinutes: null },
      });
      if (written) {
        const destinationReached = await this.markDestinationIfLastStop(
          trip.id,
          stop.id,
          startAt,
          stops
        );
        seeded.push({ stopId: stop.id, destinationReached });
      }
    }
    return seeded;
  }

  // ===========================================================================
  // Trip route — the one map/trip response (D-0155, owner D9)
  // ===========================================================================

  /**
   * `GET /trips/{id}/route` — summary + vehicle + driver + origin/destination + ordered stops (with audit events) + the
   * driven trail + the current position, in one call. Works for any status; `trail`/`current_position` are `null` for a trip
   * that never started or has no tracker. A trail over 5 000 points is thinned evenly (first/last kept) but
   * `total_points`/`computed_distance_km` always describe the full trail.
   */
  async route(id: string) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');

    const vehicle = await this.vehiclesLookup.findVehicleById(trip.vehicleId);
    const driver = await this.driversLookup.findDriverById(trip.driverId);

    let trail: Json | null = null;
    let currentPosition: Json | null = null;
    if (trip.deviceId && trip.actualStartAt) {
      const endAt = trip.actualEndAt ?? new Date();
      const positions = await this.repo.positionsInWindow(trip.deviceId, trip.actualStartAt, endAt);
      trail = {
        device_id: trip.deviceId,
        total_points: positions.length,
        computed_distance_km: this.distanceFromPositions(positions),
        positions: thinEvenly(positions, ROUTE_TRAIL_MAX_POINTS).map(toPositionJson),
      };
      const latest = await this.repo.latestPosition(trip.deviceId, endAt);
      currentPosition = latest ? toPositionJson(latest) : null;
    }

    return {
      success: true,
      message: 'Trip route retrieved successfully.',
      data: {
        trip: {
          id: trip.id,
          trip_reference: trip.tripReference,
          status: trip.status,
          purpose: trip.purpose,
          planned_start_at: trip.plannedStartAt,
          planned_end_at: trip.plannedEndAt,
          actual_start_at: trip.actualStartAt,
          actual_end_at: trip.actualEndAt,
          planned_distance_km: trip.plannedDistanceKm,
          actual_distance_km: trip.actualDistanceKm,
          destination_reached_at: trip.destinationReachedAt,
          awaiting_completion: tripAwaitingCompletion(trip),
        },
        vehicle: vehicle
          ? {
              id: vehicle.id,
              name: vehicle.name,
              vehicle_category: vehicle.vehicleCategory,
              plate: vehicle.plate ?? null,
            }
          : null,
        driver: driver
          ? { id: driver.id, first_name: driver.firstName, last_name: driver.lastName }
          : null,
        origin: {
          address: trip.originAddress,
          latitude: trip.originLatitude,
          longitude: trip.originLongitude,
        },
        destination: {
          address: trip.destinationAddress,
          latitude: trip.destinationLatitude,
          longitude: trip.destinationLongitude,
        },
        stops: await this.plannedYardsJson(trip.id),
        trail,
        current_position: currentPosition,
      },
    };
  }

  // ===========================================================================
  // GPS trail
  // ===========================================================================

  async gpsTrail(id: string) {
    const trip = await this.repo.findTripById(id);
    if (!trip) throw new NotFoundError('Trip not found.');
    if (!trip.deviceId || !trip.actualStartAt) {
      throw new ValidationError(
        'GPS trail is not available: trip has not started or has no device assigned.'
      );
    }

    const endAt = trip.actualEndAt ?? new Date();
    const positions = await this.repo.positionsInWindow(trip.deviceId, trip.actualStartAt, endAt);
    const distanceKm = this.distanceFromPositions(positions);

    return {
      success: true,
      message: 'Trip GPS trail retrieved successfully.',
      data: {
        trip_id: trip.id,
        status: trip.status,
        device_id: trip.deviceId,
        from: trip.actualStartAt,
        to: endAt,
        total_points: positions.length,
        computed_distance_km: distanceKm,
        positions: positions.map(p => ({
          latitude: p.latitude,
          longitude: p.longitude,
          speed: p.speed,
          heading: p.heading,
          recorded_at: p.recordedAt,
        })),
      },
    };
  }
}

function toPositionJson(p: DevicePositionPoint): Json {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    heading: p.heading,
    recorded_at: p.recordedAt,
  };
}
