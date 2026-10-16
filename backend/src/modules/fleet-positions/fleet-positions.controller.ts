import type { Request, Response } from 'express';
import { getRequestContext } from '../../platform/http/request-context.js';
import { UnauthenticatedError } from '../../platform/errors/app-error.js';
import { parseOrThrow } from '../../platform/http/validate.js';
import {
  DeviceHistoryParamSchema,
  DeviceHistoryQuerySchema,
  PositionsQuerySchema,
} from './fleet-positions.schemas.js';
import type { FleetPositionsService } from './fleet-positions.service.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new UnauthenticatedError();
  return context;
}

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class FleetPositionsController {
  constructor(private readonly service: FleetPositionsService) {}

  positions = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const query = parseOrThrow(PositionsQuerySchema, req.query);
    res.status(200).json(
      await this.service.positions(context.companyId ?? '', query.include_unassigned, {
        bbox: query.bbox,
        limit: query.limit,
      })
    );
  };

  history = async (req: Request, res: Response): Promise<void> => {
    const context = requireContext();
    const { deviceId } = parseOrThrow(DeviceHistoryParamSchema, req.params);
    const query = parseOrThrow(DeviceHistoryQuerySchema, req.query);
    res
      .status(200)
      .json(await this.service.history(context.companyId ?? '', deviceId, query.limit));
  };
}
