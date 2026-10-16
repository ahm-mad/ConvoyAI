import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { OPTIONS_LIMIT, flagValue, resolveWindow } from '../../platform/http/list-query.js';
import { bodyFlag } from '../../platform/http/bulk.js';
import { streamCsv } from '../../platform/http/csv.js';
import { ValidationError } from '../../platform/errors/app-error.js';
import type { FleetYardsService } from './fleet-yards.service.js';
import type {
  CreateYardInput,
  CreateYardSlotInput,
  UpdateYardInput,
  UpdateYardSlotInput,
  YardListQuery,
} from './fleet-yards.types.js';
import {
  CheckInRequestSchema,
  CreateYardRequestSchema,
  CreateYardSlotRequestSchema,
  ListYardsQuerySchema,
  YardOptionsQuerySchema,
  BulkYardsBodySchema,
  SlotIdParamSchema,
  UpdateYardRequestSchema,
  UpdateYardSlotRequestSchema,
  YardIdParamSchema,
  YardIdRouteParamSchema,
} from './fleet-yards.schemas.js';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function toCreateYardInput(
  body: ReturnType<typeof CreateYardRequestSchema.parse>
): CreateYardInput {
  return {
    name: body.name,
    address: body.address ?? null,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    radiusM: body.radius_m ?? null,
  };
}

function toUpdateYardInput(
  body: ReturnType<typeof UpdateYardRequestSchema.parse>
): UpdateYardInput {
  return {
    name: body.name,
    address: body.address,
    latitude: body.latitude,
    longitude: body.longitude,
    radiusM: body.radius_m,
  };
}

function toUpdateYardSlotInput(
  body: ReturnType<typeof UpdateYardSlotRequestSchema.parse>
): UpdateYardSlotInput {
  return {
    slotNumber: body.slot_number,
    positionX: body.position_x,
    positionY: body.position_y,
    maxLengthM: body.max_length_m,
  };
}

function toCreateYardSlotInput(
  body: ReturnType<typeof CreateYardSlotRequestSchema.parse>
): CreateYardSlotInput {
  return {
    slotNumber: body.slot_number,
    positionX: body.position_x ?? null,
    positionY: body.position_y ?? null,
    maxLengthM: body.max_length_m ?? null,
  };
}

export class FleetYardsController {
  constructor(private readonly service: FleetYardsService) {}

  private yardListQuery(
    query: ReturnType<typeof ListYardsQuerySchema.parse>
  ): Omit<YardListQuery, 'window'> {
    return {
      includeInactive: flagValue(query.include_inactive) === true,
      search: query.search,
      hasCoordinates: flagValue(query.has_coordinates),
      hasLayout: flagValue(query.has_layout),
      isActive: flagValue(query.is_active),
      hasSlots: flagValue(query.has_slots),
      minSlots: query.min_slots,
      bbox: query.bbox,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
    };
  }

  listYards = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListYardsQuerySchema, req.query);
    res
      .status(200)
      .json(
        await this.service.listYards({ ...this.yardListQuery(query), window: resolveWindow(query) })
      );
  };

  /** `GET /yards/export` (D-0168, B11): the list's own filters/sort, streamed as CSV. */
  exportYards = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListYardsQuerySchema, req.query);
    await streamCsv(res, await this.service.exportYards(this.yardListQuery(query)));
  };

  yardOptions = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(YardOptionsQuerySchema, req.query);
    res.status(200).json(
      await this.service.yardOptions({
        includeInactive: flagValue(query.include_inactive) === true,
        search: query.search,
        hasCoordinates: flagValue(query.has_coordinates),
        limit: query.limit ?? OPTIONS_LIMIT,
      })
    );
  };

  bulkDeactivateYards = (req: Request, res: Response): Promise<void> =>
    this.bulkYards('deactivate', req, res);

  bulkReactivateYards = (req: Request, res: Response): Promise<void> =>
    this.bulkYards('reactivate', req, res);

  bulkDeleteYards = (req: Request, res: Response): Promise<void> =>
    this.bulkYards('delete', req, res);

  private bulkYards = async (
    action: 'deactivate' | 'reactivate' | 'delete',
    req: Request,
    res: Response
  ): Promise<void> => {
    const body = parseOrThrow(BulkYardsBodySchema, req.body);
    const filter = body.filter;
    res.status(200).json(
      await this.service.bulkYards(action, {
        ids: body.ids?.map(String),
        filter: filter && {
          includeInactive: bodyFlag(filter.include_inactive) ?? action !== 'deactivate',
          search: filter.search?.trim() || undefined,
          hasCoordinates: bodyFlag(filter.has_coordinates),
          hasLayout: bodyFlag(filter.has_layout),
          isActive: bodyFlag(filter.is_active),
          hasSlots: bodyFlag(filter.has_slots),
          minSlots: filter.min_slots,
        },
      })
    );
  };

  updateYard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(YardIdParamSchema, req.params);
    const input = parseOrThrow(UpdateYardRequestSchema, req.body);
    res
      .status(200)
      .json(await this.service.updateYard(id, toUpdateYardInput(input), input.expected_updated_at));
  };

  deleteYard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(YardIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteYard(id));
  };

  deactivateYard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(YardIdParamSchema, req.params);
    res.status(200).json(await this.service.deactivateYard(id));
  };

  reactivateYard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(YardIdParamSchema, req.params);
    res.status(200).json(await this.service.reactivateYard(id));
  };

  updateSlot = async (req: Request, res: Response): Promise<void> => {
    const { slotId } = parseOrThrow(SlotIdParamSchema, req.params);
    const input = parseOrThrow(UpdateYardSlotRequestSchema, req.body);
    res
      .status(200)
      .json(
        await this.service.updateSlot(
          slotId,
          toUpdateYardSlotInput(input),
          input.expected_updated_at
        )
      );
  };

  createYard = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateYardRequestSchema, req.body);
    res.status(201).json(await this.service.createYard(toCreateYardInput(input)));
  };

  getYard = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(YardIdParamSchema, req.params);
    res.status(200).json(await this.service.getYard(id));
  };

  deleteSlot = async (req: Request, res: Response): Promise<void> => {
    const { slotId } = parseOrThrow(SlotIdParamSchema, req.params);
    res.status(200).json(await this.service.deleteSlot(slotId));
  };

  deleteLayout = async (req: Request, res: Response): Promise<void> => {
    const { yardId } = parseOrThrow(YardIdRouteParamSchema, req.params);
    res.status(200).json(await this.service.deleteLayout(yardId));
  };

  uploadLayout = async (req: Request, res: Response): Promise<void> => {
    const { yardId } = parseOrThrow(YardIdRouteParamSchema, req.params);
    const file = req.file;
    if (!file) {
      throw new ValidationError('Validation failed', { image: ['The image field is required.'] });
    }
    const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];
    if (!extension) {
      throw new ValidationError('Validation failed', {
        image: ['The image must be a file of type: jpeg, png, jpg, webp, gif.'],
      });
    }
    const { status, body } = await this.service.uploadLayout(yardId, {
      buffer: file.buffer,
      contentType: file.mimetype,
      extension,
    });
    res.status(status).json(body);
  };

  createSlot = async (req: Request, res: Response): Promise<void> => {
    const { yardId } = parseOrThrow(YardIdRouteParamSchema, req.params);
    const input = parseOrThrow(CreateYardSlotRequestSchema, req.body);
    res.status(201).json(await this.service.createSlot(yardId, toCreateYardSlotInput(input)));
  };

  checkIn = async (req: Request, res: Response): Promise<void> => {
    const { slotId } = parseOrThrow(SlotIdParamSchema, req.params);
    const input = parseOrThrow(CheckInRequestSchema, req.body);
    res.status(201).json(await this.service.checkIn(slotId, String(input.vehicle_id)));
  };

  checkOut = async (req: Request, res: Response): Promise<void> => {
    const { slotId } = parseOrThrow(SlotIdParamSchema, req.params);
    res.status(200).json(await this.service.checkOut(slotId));
  };
}
