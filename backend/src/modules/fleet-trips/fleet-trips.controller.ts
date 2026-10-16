import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { streamCsv } from '../../platform/http/csv.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import type { FleetTripsService } from './fleet-trips.service.js';
import type { CreateTripInput, ListTripsQuery, UpdateTripInput } from './fleet-trips.types.js';
import {
  CancelTripRequestSchema,
  CompleteTripRequestSchema,
  CreateTripRequestSchema,
  ListTripsQuerySchema,
  TripCountsQuerySchema,
  BulkTripsBodySchema,
  mergedTripStatuses,
  StopActionRequestSchema,
  TripIdParamSchema,
  TripStopParamSchema,
  UpdateTripRequestSchema,
} from './fleet-trips.schemas.js';

function toCreateTripInput(
  body: ReturnType<typeof CreateTripRequestSchema.parse>
): CreateTripInput {
  return {
    vehicleId: String(body.vehicle_id),
    driverId:
      body.driver_id !== undefined && body.driver_id !== null ? String(body.driver_id) : null,
    fleetCustomerId:
      body.fleet_customer_id !== undefined && body.fleet_customer_id !== null
        ? String(body.fleet_customer_id)
        : null,
    tripReference: body.trip_reference ?? null,
    purpose: body.purpose ?? null,
    originAddress: body.origin_address ?? null,
    originLatitude: body.origin_latitude ?? null,
    originLongitude: body.origin_longitude ?? null,
    destinationAddress: body.destination_address ?? null,
    destinationLatitude: body.destination_latitude ?? null,
    destinationLongitude: body.destination_longitude ?? null,
    plannedStartAt: body.planned_start_at ?? null,
    plannedEndAt: body.planned_end_at ?? null,
    plannedDistanceKm: body.planned_distance_km ?? null,
    odometerStartKm: body.odometer_start_km ?? null,
    notes: body.notes ?? null,
    plannedYards: (body.planned_yards ?? []).map(y => ({
      yardId: String(y.yard_id),
      stopPurpose: y.stop_purpose ?? null,
      plannedArrivalAt: y.planned_arrival_at ?? null,
      plannedDepartureAt: y.planned_departure_at ?? null,
      notes: y.notes ?? null,
    })),
  };
}

function toUpdateTripInput(
  body: ReturnType<typeof UpdateTripRequestSchema.parse>
): UpdateTripInput {
  return {
    fleetCustomerId:
      body.fleet_customer_id !== undefined
        ? body.fleet_customer_id !== null
          ? String(body.fleet_customer_id)
          : null
        : undefined,
    tripReference: body.trip_reference,
    purpose: body.purpose,
    originAddress: body.origin_address,
    originLatitude: body.origin_latitude,
    originLongitude: body.origin_longitude,
    destinationAddress: body.destination_address,
    destinationLatitude: body.destination_latitude,
    destinationLongitude: body.destination_longitude,
    plannedStartAt: body.planned_start_at,
    plannedEndAt: body.planned_end_at,
    plannedDistanceKm: body.planned_distance_km,
    odometerStartKm: body.odometer_start_km,
    fuelUsedLiters: body.fuel_used_liters,
    notes: body.notes,
    plannedYards: body.planned_yards?.map(y => ({
      id: y.id !== undefined ? String(y.id) : undefined,
      yardId: String(y.yard_id),
      stopPurpose: y.stop_purpose,
      plannedArrivalAt: y.planned_arrival_at,
      plannedDepartureAt: y.planned_departure_at,
      notes: y.notes,
    })),
  };
}

function toListQuery(query: ReturnType<typeof ListTripsQuerySchema.parse>): ListTripsQuery {
  return {
    status: mergedTripStatuses(query) as ListTripsQuery['status'],
    vehicleId: query.vehicle_id !== undefined ? String(query.vehicle_id) : undefined,
    driverId: query.driver_id !== undefined ? String(query.driver_id) : undefined,
    customerId: query.customer_id !== undefined ? String(query.customer_id) : undefined,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    search: query.search,
    sortBy: query.sort_by,
    sortOrder: query.sort_order,
    page: query.page,
    perPage: query.per_page,
  };
}

function requestPath(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`;
}

export class FleetTripsController {
  constructor(private readonly service: FleetTripsService) {}

  listTrips = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListTripsQuerySchema, req.query);
    const { items, total } = await this.service.listTrips(toListQuery(query));
    const paginator = buildLaravelPaginator({
      items,
      page: query.page,
      perPage: query.per_page,
      total,
      path: requestPath(req),
      query: {
        status: mergedTripStatuses(query)?.join(','),
        vehicle_id: query.vehicle_id,
        driver_id: query.driver_id,
        customer_id: query.customer_id,
        date_from: query.date_from,
        date_to: query.date_to,
        search: query.search,
        sort_by: query.sort_by,
        sort_order: query.sort_order,
      },
    });
    res
      .status(200)
      .json({ success: true, message: 'Trips retrieved successfully.', data: paginator });
  };

  bulkDeleteTrips = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(BulkTripsBodySchema, req.body);
    const filter = body.filter;
    res.status(200).json(
      await this.service.bulkDeleteTrips({
        ids: body.ids?.map(String),
        filter: filter && {
          status: filter.status,
          vehicleId: filter.vehicle_id === undefined ? undefined : String(filter.vehicle_id),
          driverId: filter.driver_id === undefined ? undefined : String(filter.driver_id),
          customerId: filter.customer_id === undefined ? undefined : String(filter.customer_id),
          dateFrom: filter.date_from,
          dateTo: filter.date_to,
          search: filter.search?.trim() || undefined,
        },
      })
    );
  };

  /** `GET /trips/export` (D-0168, B11): the list's own filters/search/sort, streamed as CSV (paging parameters are ignored). */
  exportTrips = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListTripsQuerySchema, req.query);
    await streamCsv(res, await this.service.exportTrips(toListQuery(query)));
  };

  createTrip = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateTripRequestSchema, req.body);
    res.status(201).json(await this.service.createTrip(toCreateTripInput(input)));
  };

  /** `GET /trips/counts` (D-0179, B7) — trips per status under the list's filters and search. */
  tripCounts = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(TripCountsQuerySchema, req.query);
    res.status(200).json(
      await this.service.tripCounts({
        status: undefined,
        vehicleId: query.vehicle_id !== undefined ? String(query.vehicle_id) : undefined,
        driverId: query.driver_id !== undefined ? String(query.driver_id) : undefined,
        customerId: query.customer_id !== undefined ? String(query.customer_id) : undefined,
        dateFrom: query.date_from,
        dateTo: query.date_to,
        search: query.search,
      })
    );
  };

  getTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    res.status(200).json(await this.service.getTrip(id));
  };

  updateTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    const input = parseOrThrow(UpdateTripRequestSchema, req.body);
    res
      .status(200)
      .json(await this.service.updateTrip(id, toUpdateTripInput(input), input.expected_updated_at));
  };

  startTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    res.status(200).json(await this.service.startTrip(id));
  };

  completeTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    const input = parseOrThrow(CompleteTripRequestSchema, req.body);
    res.status(200).json(
      await this.service.completeTrip(id, {
        odometerEndKm: input.odometer_end_km ?? null,
        fuelUsedLiters: input.fuel_used_liters ?? null,
        notes: input.notes ?? null,
      })
    );
  };

  cancelTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    const input = parseOrThrow(CancelTripRequestSchema, req.body);
    res
      .status(200)
      .json(
        await this.service.cancelTrip(id, { cancellationReason: input.cancellation_reason ?? null })
      );
  };

  arriveStop = async (req: Request, res: Response): Promise<void> => {
    const { id, stopId } = parseOrThrow(TripStopParamSchema, req.params);
    const body = parseOrThrow(StopActionRequestSchema, req.body);
    res.status(200).json(
      await this.service.arriveStop(id, stopId, {
        occurredAt: body.occurred_at ?? null,
        reason: body.reason ?? null,
      })
    );
  };

  departStop = async (req: Request, res: Response): Promise<void> => {
    const { id, stopId } = parseOrThrow(TripStopParamSchema, req.params);
    const body = parseOrThrow(StopActionRequestSchema, req.body);
    res.status(200).json(
      await this.service.departStop(id, stopId, {
        occurredAt: body.occurred_at ?? null,
        reason: body.reason ?? null,
      })
    );
  };

  route = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    res.status(200).json(await this.service.route(id));
  };

  deleteTrip = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteTrip(id));
  };

  gpsTrail = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(TripIdParamSchema, req.params);
    res.status(200).json(await this.service.gpsTrail(id));
  };
}
