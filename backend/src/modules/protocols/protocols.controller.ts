import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import { toProtocolResponse } from './protocols.mapper.js';
import type { ProtocolsService } from './protocols.service.js';
import {
  CreateProtocolRequestSchema,
  ListProtocolsRequestSchema,
  ProtocolIdParamSchema,
  UpdateProtocolRequestSchema,
} from './protocols.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class ProtocolsController {
  constructor(private readonly protocolsService: ProtocolsService) {}

  listProtocols = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListProtocolsRequestSchema, req.query);
    const { items, total } = await this.protocolsService.listProtocols({
      search: query.search,
      category: query.category,
      page: query.page,
      perPage: query.per_page,
    });

    const paginator = buildLaravelPaginator({
      items: items.map(toProtocolResponse),
      page: query.page,
      perPage: query.per_page,
      total,
      path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      query: { search: query.search, category: query.category },
    });

    res.status(200).json(paginator);
  };

  createProtocol = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreateProtocolRequestSchema, req.body);
    const protocol = await this.protocolsService.createProtocol({ name: input.name });

    res.status(201).json(toProtocolResponse(protocol));
  };

  getProtocol = async (req: Request, res: Response): Promise<void> => {
    const { protocol } = parseOrThrow(ProtocolIdParamSchema, req.params);
    const result = await this.protocolsService.getProtocol(String(protocol));

    res.status(200).json(toProtocolResponse(result));
  };

  updateProtocol = async (req: Request, res: Response): Promise<void> => {
    const { protocol } = parseOrThrow(ProtocolIdParamSchema, req.params);
    const input = parseOrThrow(UpdateProtocolRequestSchema, req.body);
    const updated = await this.protocolsService.updateProtocol(String(protocol), {
      name: input.name,
    });

    res.status(200).json(toProtocolResponse(updated));
  };

  deleteProtocol = async (req: Request, res: Response): Promise<void> => {
    const { protocol } = parseOrThrow(ProtocolIdParamSchema, req.params);
    await this.protocolsService.deleteProtocol(String(protocol));

    res.status(200).json({ success: true, message: 'Record deleted successfully.' });
  };
}
