import type { Request, Response } from 'express';
import type { SuperadminService } from './superadmin.service.js';

/** Transport layer only (ARCHITECTURE.md §2): call service -> shape response. No business logic, no Prisma. */
export class SuperadminController {
  constructor(private readonly service: SuperadminService) {}

  totalUsersPerCompany = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.totalUsersPerCompany();
    res.status(200).json(result);
  };

  totalSubscriptions = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.totalSubscriptions();
    res.status(200).json(result);
  };
}
