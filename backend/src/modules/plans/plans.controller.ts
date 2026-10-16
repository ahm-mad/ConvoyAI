import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { toPlanResponse } from './plans.mapper.js';
import type { PlansService } from './plans.service.js';
import {
  AssignModulesRequestSchema,
  CreatePlanRequestSchema,
  PlanAssignModulesParamSchema,
  PlanIdParamSchema,
  UpdatePlanRequestSchema,
} from './plans.schemas.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  listPlans = async (_req: Request, res: Response): Promise<void> => {
    const plans = await this.plansService.listPlans();
    res.status(200).json(plans.map(toPlanResponse));
  };

  createPlan = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(CreatePlanRequestSchema, req.body);
    const plan = await this.plansService.createPlan({
      name: input.name,
      stripePlan: input.stripe_plan,
      price: input.price,
      description: input.description,
    });
    res.status(201).json(toPlanResponse(plan));
  };

  getPlan = async (req: Request, res: Response): Promise<void> => {
    const { plan: planId } = parseOrThrow(PlanIdParamSchema, req.params);
    const plan = await this.plansService.getPlan(String(planId));
    res.status(200).json(toPlanResponse(plan));
  };

  updatePlan = async (req: Request, res: Response): Promise<void> => {
    const { plan: planId } = parseOrThrow(PlanIdParamSchema, req.params);
    const input = parseOrThrow(UpdatePlanRequestSchema, req.body);
    const plan = await this.plansService.updatePlan(String(planId), {
      name: input.name,
      stripePlan: input.stripe_plan,
      price: input.price,
      description: input.description,
    });
    res.status(200).json(toPlanResponse(plan));
  };

  assignModules = async (req: Request, res: Response): Promise<void> => {
    const { planId } = parseOrThrow(PlanAssignModulesParamSchema, req.params);
    const input = parseOrThrow(AssignModulesRequestSchema, req.body);
    const plan = await this.plansService.assignModules(
      String(planId),
      input.modules.map(module => ({
        moduleId: String(module.id),
        permissions: module.permissions ?? [],
      }))
    );
    res.status(200).json(toPlanResponse(plan));
  };
}
