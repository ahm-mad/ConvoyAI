import { getRequestContext, runAsSystemAsync } from '../../platform/http/request-context.js';
import { listData, optionsResponse } from '../../platform/http/list-query.js';
import {
  auditFields,
  loadActors,
  type ActorDirectory,
  type ActorMap,
} from '../../platform/http/actors.js';
import { assertFresh } from '../../platform/http/concurrency.js';
import { BULK_LIMIT, bulkResponse, resolveBulkTargets, runBulk } from '../../platform/http/bulk.js';
import { EXPORT_LIMIT, planExport, type CsvColumn } from '../../platform/http/csv.js';
import type { FleetRealtimePort } from '../../platform/realtime/fleet-realtime.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { haversineMeters, deriveGeofenceTransition } from '../../shared/utils/geo.js';
import type { FleetGeofencesRepository } from './fleet-geofences.repository.js';
import type {
  CreateGeofenceInput,
  Geofence,
  GeofenceEventListQuery,
  GeofenceEventWithAlertOn,
  GeofenceListQuery,
  GeofenceOptionsQuery,
  GeofencesTripsLookup,
  GeofencesVehicleAssignmentLookup,
  GeofencesVehiclesLookup,
  UpdateGeofenceInput,
} from './fleet-geofences.types.js';

interface GeofenceExportRow {
  geofence: Geofence;
  yardName: string | null;
}

interface EventExportRow {
  event: GeofenceEventWithAlertOn;
  vehicleName: string | null;
}

/** D-0168 (B11) — the geofence CSV's documented column set. */
const GEOFENCE_EXPORT_COLUMNS: CsvColumn<GeofenceExportRow>[] = [
  { header: 'id', value: r => r.geofence.id },
  { header: 'name', value: r => r.geofence.name },
  { header: 'yard_id', value: r => r.geofence.yardId },
  { header: 'yard', value: r => r.yardName },
  { header: 'center_latitude', value: r => r.geofence.centerLatitude },
  { header: 'center_longitude', value: r => r.geofence.centerLongitude },
  { header: 'radius_m', value: r => r.geofence.radiusM },
  { header: 'alert_on', value: r => r.geofence.alertOn },
  { header: 'is_active', value: r => r.geofence.isActive },
  { header: 'created_at', value: r => r.geofence.createdAt },
];

/** D-0168 (B11) — the geofence-event CSV's documented column set. */
const EVENT_EXPORT_COLUMNS: CsvColumn<EventExportRow>[] = [
  { header: 'id', value: r => r.event.id },
  { header: 'occurred_at', value: r => r.event.occurredAt },
  { header: 'event_type', value: r => r.event.eventType },
  { header: 'geofence_id', value: r => r.event.geofenceId },
  { header: 'geofence', value: r => r.event.geofenceName },
  { header: 'yard_id', value: r => r.event.geofenceYardId },
  { header: 'vehicle_id', value: r => r.event.vehicleId },
  { header: 'vehicle', value: r => r.vehicleName },
  { header: 'trip_id', value: r => r.event.tripId },
];

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

type Json = Record<string, unknown>;

/**
 * Business logic for module 4.3 (`GeofenceController`/`GeofenceService`).
 * Circular geometry only — `geofences` has no polygon/shape column at all
 * (`geofence-detection.md` §1.3). `checkPosition` is the
 * `GeofenceService::checkPosition` equivalent, wired into ingestion's
 * worker path (`IngestionGeofencesLookup`, D-0079) — the detection math
 * itself (`deriveGeofenceTransition`) was already ported ahead of schedule
 * in module 2.4 (D-0055) with 11.35's fix baked in; this module supplies
 * the real data (device→vehicle resolution, active geofences, event
 * persistence) that math operates on.
 */
export class FleetGeofencesService {
  constructor(
    private readonly repo: FleetGeofencesRepository,
    private readonly vehicleAssignmentLookup: GeofencesVehicleAssignmentLookup,
    private readonly vehiclesLookup: GeofencesVehiclesLookup,
    private readonly tripsLookup: GeofencesTripsLookup,
    private readonly realtime: FleetRealtimePort,
    private readonly usersLookup: ActorDirectory
  ) {}

  /** D-0172 (B6): one batched lookup of the people behind a response's `created_by` / `updated_by` ids. */
  private actorsFor(...ids: Array<string | null>): Promise<ActorMap> {
    return loadActors(this.usersLookup, ids);
  }

  /** D-0163: tell the company room "this geofence changed — refetch the list" (best-effort; the port never throws). */
  private async announce(id: string, action: 'created' | 'updated' | 'deleted'): Promise<void> {
    const companyId = getRequestContext()?.companyId;
    if (!companyId) return;
    await this.realtime.publishFleetChanged(companyId, {
      entity: 'geofence',
      id,
      action,
      occurredAt: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // JSON shaping
  // ===========================================================================

  private baseGeofenceJson(geofence: Geofence, actors: ActorMap): Json {
    return {
      id: geofence.id,
      company_id: geofence.companyId,
      yard_id: geofence.yardId,
      name: geofence.name,
      center_latitude: geofence.centerLatitude,
      center_longitude: geofence.centerLongitude,
      radius_m: geofence.radiusM,
      alert_on: geofence.alertOn,
      is_active: geofence.isActive,
      created_at: geofence.createdAt,
      updated_at: geofence.updatedAt,
      ...auditFields(actors, geofence.createdBy, geofence.updatedBy),
    };
  }

  // ===========================================================================
  // CRUD
  // ===========================================================================

  /** D-0164 (B1): search/filters/sort + opt-in paging (`data: { items, pagination }` when `page`/`per_page` is sent, else the flat array). */
  async listGeofences(query: GeofenceListQuery) {
    const { items, total } = await this.repo.listGeofencesForCompany(query);
    const actors = await this.actorsFor(
      ...items.flatMap(geofence => [geofence.createdBy, geofence.updatedBy])
    );
    const rows: Json[] = [];
    for (const geofence of items) {
      const yard = geofence.yardId ? await this.repo.findYardBrief(geofence.yardId) : undefined;
      rows.push({
        ...this.baseGeofenceJson(geofence, actors),
        yard: yard ? { id: yard.id, name: yard.name } : null,
      });
    }
    return {
      success: true,
      message: 'Geofences retrieved successfully.',
      data: listData(rows, total, query.window),
    };
  }

  /** `POST /geofences/bulk-enable|bulk-disable|bulk-delete` (D-0166, B10) — each geofence goes through the single-geofence action. */
  async bulkGeofences(
    action: 'enable' | 'disable' | 'delete',
    target: { ids?: string[] | undefined; filter?: Omit<GeofenceListQuery, 'window'> | undefined }
  ) {
    const targets = await resolveBulkTargets({ ids: target.ids }, async () => {
      const { items, total } = await this.repo.listGeofencesForCompany({
        ...(target.filter ?? {}),
        window: { page: 1, perPage: BULK_LIMIT },
      });
      return { ids: items.map(geofence => geofence.id), total };
    });
    const results = await runBulk(
      targets.ids,
      async id => {
        if (action === 'delete') return { message: (await this.deleteGeofence(id)).message };
        // D-0171: a geofence already enabled/disabled as asked is left alone (no write, no realtime event) and reported as `changed: false`
        const existing = await this.repo.findGeofenceById(id);
        if (existing && existing.isActive === (action === 'enable')) {
          return {
            changed: false,
            message:
              action === 'enable'
                ? 'Geofence is already enabled.'
                : 'Geofence is already disabled.',
          };
        }
        const result = await this.updateGeofence(id, {
          name: undefined,
          radiusM: undefined,
          alertOn: undefined,
          isActive: action === 'enable',
        });
        return { message: result.message };
      },
      action === 'delete' ? 'Geofence deleted successfully.' : 'Geofence updated successfully.',
      async id => (await this.repo.findGeofenceById(id))?.name
    );
    return bulkResponse(targets, results);
  }

  /** `GET /geofences/export` (D-0168, B11) — the geofence list's own filters/sort, every matching row as CSV (≤ 50 000; 422 above). */
  exportGeofences(query: Omit<GeofenceListQuery, 'window'>) {
    const yardNames = new Map<string, string | null>(); // one lookup per distinct yard, not per row
    return planExport('geofences', GEOFENCE_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listGeofencesForCompany({
        ...query,
        window: { page, perPage },
      });
      const rows: GeofenceExportRow[] = [];
      for (const geofence of items) {
        let yardName: string | null = null;
        if (geofence.yardId) {
          if (!yardNames.has(geofence.yardId))
            yardNames.set(
              geofence.yardId,
              (await this.repo.findYardBrief(geofence.yardId))?.name ?? null
            );
          yardName = yardNames.get(geofence.yardId) ?? null;
        }
        rows.push({ geofence, yardName });
      }
      return { items: rows, total };
    });
  }

  /** `GET /geofences/events/export` (D-0168, B11) — the event list's own filters/sort (`alert_on` applied first, as in the list), every matching event as CSV. */
  exportEvents(query: Omit<GeofenceEventListQuery, 'window' | 'limit'>) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');
    const companyId = context.companyId;
    const vehicleNames = new Map<string, string | null>();
    return planExport('geofence-events', EVENT_EXPORT_COLUMNS, async (page, perPage) => {
      const { items, total } = await this.repo.listRecentEventsForCompany(companyId, {
        ...query,
        limit: EXPORT_LIMIT,
        window: { page, perPage },
      });
      const rows: EventExportRow[] = [];
      for (const event of items) {
        if (!vehicleNames.has(event.vehicleId))
          vehicleNames.set(
            event.vehicleId,
            (await this.vehiclesLookup.findVehicleById(event.vehicleId))?.name ?? null
          );
        rows.push({ event, vehicleName: vehicleNames.get(event.vehicleId) ?? null });
      }
      return { items: rows, total };
    });
  }

  /** `GET /geofences/options` (D-0165, B2) — lean, unpaginated (capped) list of active geofences for pickers. */
  async geofenceOptions(query: GeofenceOptionsQuery) {
    const { items, total } = await this.repo.listGeofencesForCompany({
      isActive: query.includeInactive === true ? undefined : true,
      search: query.search,
      yardId: query.yardId,
      linked: query.linked,
      sortBy: 'name',
      sortOrder: 'asc',
      window: { page: 1, perPage: query.limit },
    });
    const rows = items.map(geofence => ({
      id: geofence.id,
      name: geofence.name,
      yard_id: geofence.yardId,
      alert_on: geofence.alertOn,
      radius_m: geofence.radiusM,
      is_active: geofence.isActive,
    }));
    return optionsResponse('Geofence options retrieved successfully.', rows, total, query.limit);
  }

  /** `GeofenceController::store` — a `yard_id` given without explicit coords defaults the center to that yard's own lat/lng ("the highest-leverage case", `geofence-detection.md` §4); falls through to the generic coordinates-required 422 if the yard has none, matching Laravel exactly. */
  async createGeofence(input: CreateGeofenceInput) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    let { centerLatitude, centerLongitude } = input;

    if (input.yardId && (centerLatitude === null || centerLongitude === null)) {
      const yard = await this.repo.findYardBrief(input.yardId);
      if (yard && yard.latitude !== null && yard.longitude !== null) {
        centerLatitude = yard.latitude;
        centerLongitude = yard.longitude;
      }
    }

    if (centerLatitude === null || centerLongitude === null) {
      throw new ValidationError(
        'Geofence coordinates are required (provide center_latitude/center_longitude, or a yard_id with coordinates).'
      );
    }

    const geofence = await this.repo.createGeofence({ ...input, centerLatitude, centerLongitude });
    await this.announce(geofence.id, 'created');
    const yard = geofence.yardId ? await this.repo.findYardBrief(geofence.yardId) : undefined;

    return {
      success: true,
      message: 'Geofence created successfully.',
      data: {
        ...this.baseGeofenceJson(
          geofence,
          await this.actorsFor(geofence.createdBy, geofence.updatedBy)
        ),
        yard: yard ? { id: yard.id, name: yard.name } : null,
      },
    };
  }

  /**
   * `PUT /geofences/{id}` — D-0162: a centre may be set for MANUAL geofences only; a yard-linked geofence's centre follows its yard
   * (`PUT /yards/{id}`), so an attempt to move it here is refused instead of silently ignored (Laravel dropped the centre with a 200).
   */
  async updateGeofence(id: string, input: UpdateGeofenceInput, expectedUpdatedAt?: Date | null) {
    await assertFresh(
      expectedUpdatedAt,
      () => this.repo.findGeofenceById(id),
      'Geofence not found.',
      this.usersLookup
    ); // D-0176 (B13)
    if (input.centerLatitude !== undefined || input.centerLongitude !== undefined) {
      const existing = await this.repo.findGeofenceById(id);
      if (!existing) throw new NotFoundError('Geofence not found.');
      if (existing.yardId) {
        throw new ValidationError(
          "This geofence is linked to a yard. Change the yard's location to move it."
        );
      }
    }
    const updated = await this.repo.updateGeofence(id, input);
    if (!updated) throw new NotFoundError('Geofence not found.');
    await this.announce(updated.id, 'updated');
    return {
      success: true,
      message: 'Geofence updated successfully.',
      data: this.baseGeofenceJson(
        updated,
        await this.actorsFor(updated.createdBy, updated.updatedBy)
      ),
    };
  }

  async deleteGeofence(id: string) {
    const deleted = await this.repo.deleteGeofence(id);
    if (!deleted) throw new NotFoundError('Geofence not found.');
    await this.announce(id, 'deleted');
    return { success: true, message: 'Geofence deleted successfully.' };
  }

  // ===========================================================================
  // Events (11.4's resolution: loads `vehicle`, not `device` — no such
  // relation exists; `alert_on`-filtered at read time, D-0079)
  // ===========================================================================

  /** D-0164 (B1): filters + `alert_on` applied before `limit`/paging; opt-in paging like the other lists. */
  async listEvents(query: GeofenceEventListQuery) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError('Unauthorized action.');

    const { items, total } = await this.repo.listRecentEventsForCompany(context.companyId, query);
    const rows: Json[] = [];
    for (const event of items) {
      const vehicle = await this.vehiclesLookup.findVehicleById(event.vehicleId);
      rows.push({
        id: event.id,
        geofence_id: event.geofenceId,
        geofence: { id: event.geofenceId, name: event.geofenceName, yard_id: event.geofenceYardId },
        vehicle_id: event.vehicleId,
        trip_id: event.tripId,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        vehicle: vehicle ? { id: vehicle.id, name: vehicle.name } : null,
      });
    }
    return {
      success: true,
      message: 'Geofence events retrieved successfully.',
      data: listData(rows, total, query.window),
    };
  }

  // ===========================================================================
  // Detection (`GeofenceService::checkPosition` equivalent — called from
  // ingestion's worker path, no request context; `companyId` supplied by
  // the caller, resolved there from the packet's product)
  // ===========================================================================

  /** `position` (D-0161): the rest of the packet's position — broadcast as `fleet:position`; omitted by callers that only want the geofence bookkeeping. */
  async checkPosition(
    companyId: string,
    deviceId: string,
    latitude: number,
    longitude: number,
    position?: { speed: number | null; heading: number | null; recordedAt: Date }
  ): Promise<void> {
    const vehicleId = await this.vehicleAssignmentLookup.currentVehicleIdForDevice(deviceId);
    if (!vehicleId) return; // tracker isn't currently installed in any vehicle — nothing to attribute this to

    // D-0156: the vehicle's in-progress trip (if any) — stamped on every event below, and checked against its destination.
    const trip = await this.tripsLookup.findInProgressTripForVehicle(companyId, vehicleId);
    if (trip) await this.tripsLookup.checkDestinationProximity(trip, latitude, longitude);

    // D-0161: only trackers installed in a vehicle are broadcast (we are past the vehicle resolution above).
    if (position) {
      await this.realtime.publishPosition(companyId, {
        vehicleId,
        deviceId,
        latitude,
        longitude,
        speed: position.speed,
        heading: position.heading,
        recordedAt: position.recordedAt.toISOString(),
        tripId: trip?.id ?? null,
      });
    }
    let vehicleName: string | null | undefined;

    const geofences = await this.repo.listActiveGeofencesForCompanyUnscoped(companyId);

    for (const geofence of geofences) {
      const distanceM = haversineMeters(
        geofence.centerLatitude,
        geofence.centerLongitude,
        latitude,
        longitude
      );
      const isInside = distanceM <= geofence.radiusM;

      const lastEvent = await this.repo.findLastEventForPair(geofence.id, vehicleId);
      const wasInside = lastEvent ? lastEvent.eventType === 'enter' : false;

      const transition = deriveGeofenceTransition({
        isInside,
        wasInside,
        alertOn: geofence.alertOn,
      });
      if (!transition) continue; // no state change — matches step 5's dedup

      // Always persist the real transition (D-0079) — `alert_on` no longer
      // gates the write (that's exactly what broke 11.35); it only filters
      // `listRecentEventsForCompany`'s read side. `undefined` = a concurrent
      // packet already recorded this same transition (D-0156's lock re-check).
      const event = await this.repo.createGeofenceEvent(
        geofence.id,
        vehicleId,
        transition.eventType,
        trip?.id ?? null
      );
      if (!event) continue;

      // D-0161: every real transition is broadcast (the geofence's `alert_on` only filters the events list).
      if (vehicleName === undefined) {
        const vehicle = await runAsSystemAsync(() =>
          this.vehiclesLookup.findVehicleById(vehicleId)
        ); // worker path: no request context
        vehicleName = vehicle?.name ?? null;
      }
      await this.realtime.publishGeofenceEvent(companyId, {
        id: event.id,
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        yardId: geofence.yardId,
        vehicleId,
        vehicleName,
        eventType: transition.eventType,
        occurredAt: event.occurredAt.toISOString(),
        tripId: event.tripId,
      });

      // D-0156 — the sensor→trip bridge: only a geofence linked to a yard can be a planned stop.
      if (trip && geofence.yardId) {
        await this.tripsLookup.recordGeofenceStopTransition({
          tripId: trip.id,
          yardId: geofence.yardId,
          eventType: transition.eventType,
          occurredAt: event.occurredAt,
        });
      }
    }
  }
}
