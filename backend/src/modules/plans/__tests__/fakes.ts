import type { PlansRepository } from '../plans.repository.js';
import type { ModulesLookup } from '../plans.service.js';
import type {
  AssignModuleInput,
  CreatePlanInput,
  Plan,
  PlanModuleGrant,
  UpdatePlanInput,
} from '../plans.types.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  plans: Map<string, Plan>;
}

/** In-memory stand-in for `PlansRepository` — module 5.1's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakePlansRepository(seedPlans: Plan[] = []): {
  repository: PlansRepository;
  state: FakeState;
} {
  const state: FakeState = { plans: new Map(seedPlans.map(p => [p.id, p])) };

  const repo = {
    list: () => Promise.resolve([...state.plans.values()]),

    findById: (id: string) => Promise.resolve(state.plans.get(id)),

    findByStripePlan: (stripePlan: string) =>
      Promise.resolve([...state.plans.values()].find(p => p.stripePlan === stripePlan)),

    nameExists: (name: string, excludePlanId?: string) =>
      Promise.resolve(
        [...state.plans.values()].some(p => p.name === name && p.id !== excludePlanId)
      ),

    stripePlanExists: (stripePlan: string, excludePlanId?: string) =>
      Promise.resolve(
        [...state.plans.values()].some(p => p.stripePlan === stripePlan && p.id !== excludePlanId)
      ),

    create: (input: CreatePlanInput) => {
      const plan: Plan = {
        id: newId(),
        name: input.name,
        stripePlan: input.stripePlan,
        price: input.price,
        description: input.description,
        modules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.plans.set(plan.id, plan);
      return Promise.resolve(plan);
    },

    update: (id: string, input: UpdatePlanInput) => {
      const existing = state.plans.get(id);
      if (!existing) throw new Error('not found');
      const updated: Plan = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.stripePlan !== undefined ? { stripePlan: input.stripePlan } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
      state.plans.set(id, updated);
      return Promise.resolve(updated);
    },

    assignModules: (planId: string, grants: AssignModuleInput[]) => {
      const existing = state.plans.get(planId);
      if (!existing) throw new Error('not found');
      const byModuleId = new Map(existing.modules.map(m => [m.moduleId, m]));
      for (const grant of grants) {
        const current = byModuleId.get(grant.moduleId);
        const merged: PlanModuleGrant = {
          moduleId: grant.moduleId,
          code: current?.code ?? `module-${grant.moduleId}`,
          slug: current?.slug ?? `module-${grant.moduleId}`,
          permissions: grant.permissions,
        };
        byModuleId.set(grant.moduleId, merged);
      }
      const updated: Plan = { ...existing, modules: [...byModuleId.values()] };
      state.plans.set(planId, updated);
      return Promise.resolve(updated);
    },

    ensurePlaceholderPlan: (params: {
      stripePlan: string;
      name: string;
      price: string;
      description: string;
    }) => {
      const existing = [...state.plans.values()].find(p => p.stripePlan === params.stripePlan);
      if (existing) return Promise.resolve(existing);
      const plan: Plan = {
        id: newId(),
        name: params.name,
        stripePlan: params.stripePlan,
        price: params.price,
        description: params.description,
        modules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.plans.set(plan.id, plan);
      return Promise.resolve(plan);
    },
  };

  return { repository: repo as unknown as PlansRepository, state };
}

/** In-memory stand-in for the `ModulesLookup` cross-module interface (`RbacRepository` in production). */
export function fakeModulesLookup(existingModuleIds: string[] = []): ModulesLookup {
  const known = new Set(existingModuleIds);
  return {
    moduleIdsExist: (moduleIds: string[]) => Promise.resolve(moduleIds.every(id => known.has(id))),
  };
}
