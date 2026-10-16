import type { Request, Response } from 'express';
import { toConnectorHealthResponse } from './connectivity.mapper.js';
import type { ConnectivityService } from './connectivity.service.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class ConnectivityController {
  constructor(private readonly connectivityService: ConnectivityService) {}

  index = async (_req: Request, res: Response): Promise<void> => {
    const health = await this.connectivityService.getAllConnectorsHealth();

    res.status(200).json({
      success: true,
      message: 'Connector health retrieved.',
      data: {
        mqtt: toConnectorHealthResponse(health.mqtt),
        webhook: toConnectorHealthResponse(health.webhook),
      },
    });
  };

  show = async (req: Request, res: Response): Promise<void> => {
    const connector = String(req.params['connector']);
    const health = await this.connectivityService.getConnectorHealth(connector);

    res.status(200).json({
      success: true,
      message: 'Connector health retrieved.',
      data: toConnectorHealthResponse(health),
    });
  };
}
