import { NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import type { PlansRepository } from './plans.repository.js';
import type { AssignModuleInput, CreatePlanInput, Plan, UpdatePlanInput } from './plans.types.js';

/** Cross-module lookup module 5.1 needs to validate `assign-modules`' module ids exist — `RbacRepository` doubles as this (interface-typed, not a direct cross-module repository import — CONVENTIONS.md "Modules"), same pattern as D-0040/D-0045. */
export interface ModulesLookup {
  moduleIdsExist(moduleIds: string[]): Promise<boolean>;
}

/**
 * Business logic for module 5.1 (plans-modules). Designed fresh (11.26 —
 * no live Laravel routes to preserve). Fixes 11.25 (`show()`'s
 * literal-string bug) by construction: this service always returns the
 * real `Plan`, never a placeholder object shaped like the bug.
 */
export class PlansService {
  constructor(
    private readonly plansRepository: PlansRepository,
    private readonly modulesLookup: ModulesLookup
  ) {}

  async listPlans(): Promise<Plan[]> {
    return this.plansRepository.list();
  }

  async getPlan(id: string): Promise<Plan> {
    const plan = await this.plansRepository.findById(id);
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    await this.assertNameAndStripePlanUnique(input.name, input.stripePlan);
    return this.plansRepository.create(input);
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<Plan> {
    await this.getPlan(id);
    await this.assertNameAndStripePlanUnique(input.name, input.stripePlan, id);
    return this.plansRepository.update(id, input);
  }

  /** `PlanController::assignModulesToPlan` — additive module grant + per-module permission set, ported behavior (this method's Laravel body was the one real, reachable-if-ever-routed piece of an otherwise dead/broken controller). */
  async assignModules(planId: string, grants: AssignModuleInput[]): Promise<Plan> {
    await this.getPlan(planId);
    const moduleIds = grants.map(grant => grant.moduleId);
    const allExist = await this.modulesLookup.moduleIdsExist(moduleIds);
    if (!allExist) {
      throw new ValidationError('One or more modules do not exist', {
        'modules.*.id': ['Module not found'],
      });
    }
    return this.plansRepository.assignModules(planId, grants);
  }

  private async assertNameAndStripePlanUnique(
    name: string | undefined,
    stripePlan: string | undefined,
    excludePlanId?: string
  ): Promise<void> {
    if (name !== undefined && (await this.plansRepository.nameExists(name, excludePlanId))) {
      throw new ValidationError('The name has already been taken.', {
        name: ['The name has already been taken.'],
      });
    }
    if (
      stripePlan !== undefined &&
      (await this.plansRepository.stripePlanExists(stripePlan, excludePlanId))
    ) {
      throw new ValidationError('The stripe plan has already been taken.', {
        stripe_plan: ['The stripe plan has already been taken.'],
      });
    }
  }
}
