import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { OPTIONS_LIMIT, flagValue, resolveWindow } from '../../platform/http/list-query.js';
import { bodyFlag } from '../../platform/http/bulk.js';
import { streamCsv } from '../../platform/http/csv.js';
import type { FleetGeofencesService } from './fleet-geofences.service.js';
import type {
  CreateGeofenceInput,
  GeofenceEventListQuery,
  GeofenceListQuery,
  UpdateGeofenceInput,
} from './fleet-geofences.types.js';
import {
  CreateGeofenceRequestSchema,
  GeofenceIdParamSchema,
  ListGeofenceEventsQuerySchema,
  ListGeofencesQuerySchema,
  GeofenceOptionsQuerySchema,
  BulkGeofencesBodySchema,
  UpdateGeofenceRequestSchema,
} from './fleet-geofences.schemas.js';

function toCreateGeofenceInput(
  body: ReturnType<typeof CreateGeofenceRequestSchema.parse>
): CreateGeofenceInput {
  return {
    name: body.name,
    yardId: body.yard_id !== undefined && body.yard_id !== null ? String(body.yard_id) : null,
    centerLatitude: body.center_latitude ?? null,
    centerLongitude: body.center_longitude ?? null,
    radiusM: body.radius_m,
    alertOn: body.alert_on,
  };
}

function toUpdateGeofenceInput(
  body: ReturnType<typeof UpdateGeofenceRequestSchema.parse>
): UpdateGeofenceInput {
  return {
    name: body.name,
    radiusM: body.radius_m,
    alertOn: body.alert_on,
    isActive: body.is_active,
    centerLatitude: body.center_latitude,
    centerLongitude: body.center_longitude,
  };
}

export class FleetGeofencesController {
  constructor(private readonly service: FleetGeofencesService) {}

  private geofenceListQuery(
    query: ReturnType<typeof ListGeofencesQuerySchema.parse>
  ): Omit<GeofenceListQuery, 'window'> {
    return {
      search: query.search,
      isActive: flagValue(query.is_active),
      yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
      linked: flagValue(query.linked),
      alertOn: query.alert_on,
      bbox: query.bbox,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  listGeofences = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListGeofencesQuerySchema, req.query);
    res.status(200).json(
      await this.service.listGeofences({
        ...this.geofenceListQuery(query),
        window: resolveWindow(query),
      })
    );
  };

  /** `GET /geofences/export` (D-0168, B11): the list's own filters/sort, streamed as CSV. */
  exportGeofences = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListGeofencesQuerySchema, req.query);
    await streamCsv(res, await this.service.exportGeofences(this.geofenceListQuery(query)));
  };

  geofenceOptions = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(GeofenceOptionsQuerySchema, req.query);
    res.status(200).json(
      await this.service.geofenceOptions({
        includeInactive: flagValue(query.include_inactive) === true,
        search: query.search,
        yardId: query.yard_id === undefined ? undefined : String(query.yard_id),
        linked: flagValue(query.linked),
        limit: query.limit ?? OPTIONS_LIMIT,
      })
    );
  };

  bulkEnableGeofences = (req: Request, res: Response): Promise<void> =>
    this.bulkGeofences('enable', req, res);

  bulkDisableGeofences = (req: Request, res: Response): Promise<void> =>
    this.bulkGeofences('disable', req, res);

  bulkDeleteGeofences = (req: Request, res: Response): Promise<void> =>
    this.bulkGeofences('delete', req, res);

  private bulkGeofences = async (
    action: 'enable' | 'disable' | 'delete',
    req: Request,
    res: Response
  ): Promise<void> => {
    const body = parseOrThrow(BulkGeofencesBodySchema, req.body);
    const filter = body.filter;
    res.status(200).json(
      await this.service.bulkGeofences(action, {
        ids: body.ids?.map(String),
        filter: filter && {
          search: filter.search?.trim() || undefined,
          isActive: bodyFlag(filter.is_active),
          yardId: filter.yard_id === undefined ? undefined : String(filter.yard_id),
          linked: bodyFlag(filter.linked),
          alertOn: filter.alert_on,
        },
      })
    );
  };

  createGeofence = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateGeofenceRequestSchema, req.body);
    res.status(201).json(await this.service.createGeofence(toCreateGeofenceInput(input)));
  };

  updateGeofence = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(GeofenceIdParamSchema, req.params);
    const input = parseOrThrow(UpdateGeofenceRequestSchema, req.body);
    res
      .status(200)
      .json(
        await this.service.updateGeofence(
          id,
          toUpdateGeofenceInput(input),
          input.expected_updated_at
        )
      );
  };

  deleteGeofence = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(GeofenceIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteGeofence(id));
  };

  private eventListQuery(
    query: ReturnType<typeof ListGeofenceEventsQuerySchema.parse>
  ): Omit<GeofenceEventListQuery, 'window' | 'limit'> {
    return {
      search: query.search,
      geofenceId: query.geofence_id === undefined ? undefined : String(query.geofence_id),
      vehicleId: query.vehicle_id === undefined ? undefined : String(query.vehicle_id),
      tripId: query.trip_id === undefined ? undefined : String(query.trip_id),
      eventType: query.event_type,
      from: query.from,
      to: query.to,
      sortOrder: query.sort_order,
    };
  }

  listEvents = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListGeofenceEventsQuerySchema, req.query);
    res.status(200).json(
      await this.service.listEvents({
        ...this.eventListQuery(query),
        limit: query.limit,
        window: resolveWindow(query),
      })
    );
  };

  /** `GET /geofences/events/export` (D-0168, B11): the event list's own filters/sort, streamed as CSV. */
  exportEvents = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListGeofenceEventsQuerySchema, req.query);
    await streamCsv(res, await this.service.exportEvents(this.eventListQuery(query)));
  };
}
