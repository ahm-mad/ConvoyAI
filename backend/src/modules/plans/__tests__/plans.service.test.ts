import { describe, expect, it } from 'vitest';
import { PlansService } from '../plans.service.js';
import { fakeModulesLookup, fakePlansRepository } from './fakes.js';
import type { Plan } from '../plans.types.js';

const PLAN: Plan = {
  id: '1',
  name: 'Full Access (Placeholder)',
  stripePlan: 'placeholder-full-access',
  price: '0',
  description: 'placeholder',
  modules: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PlansService', () => {
  it('getPlan 404s for a missing id (fixes 11.25 by construction — no literal-string placeholder response exists)', async () => {
    const { repository } = fakePlansRepository();
    const service = new PlansService(repository, fakeModulesLookup());

    await expect(service.getPlan('999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("getPlan returns the real plan (not Laravel's literal-string bug)", async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup());

    const result = await service.getPlan('1');

    expect(result.name).toBe('Full Access (Placeholder)');
    expect(result.stripePlan).toBe('placeholder-full-access');
  });

  it('createPlan rejects a duplicate name with a 422 ValidationError', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup());

    await expect(
      service.createPlan({ name: PLAN.name, stripePlan: 'different', price: '0', description: 'x' })
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('createPlan rejects a duplicate stripe_plan with a 422 ValidationError', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup());

    await expect(
      service.createPlan({
        name: 'Different Name',
        stripePlan: PLAN.stripePlan,
        price: '0',
        description: 'x',
      })
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('createPlan creates a new plan when name/stripe_plan are unique', async () => {
    const { repository, state } = fakePlansRepository();
    const service = new PlansService(repository, fakeModulesLookup());

    const created = await service.createPlan({
      name: 'Gold',
      stripePlan: 'price_gold',
      price: '250',
      description: 'gold',
    });

    expect(created.name).toBe('Gold');
    expect(state.plans.size).toBe(1);
  });

  it('updatePlan 404s for a missing id', async () => {
    const { repository } = fakePlansRepository();
    const service = new PlansService(repository, fakeModulesLookup());

    await expect(
      service.updatePlan('999', {
        name: 'x',
        stripePlan: undefined,
        price: undefined,
        description: undefined,
      })
    ).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('updatePlan allows a plan to keep its own name/stripe_plan (excludePlanId)', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup());

    const updated = await service.updatePlan('1', {
      name: PLAN.name,
      stripePlan: PLAN.stripePlan,
      price: '10',
      description: undefined,
    });

    expect(updated.price).toBe('10');
  });

  it('assignModules 404s for a missing plan', async () => {
    const { repository } = fakePlansRepository();
    const service = new PlansService(repository, fakeModulesLookup(['1']));

    await expect(
      service.assignModules('999', [{ moduleId: '1', permissions: [] }])
    ).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('assignModules rejects a nonexistent module id with a 422 ValidationError', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup(['1']));

    await expect(
      service.assignModules('1', [{ moduleId: '999', permissions: [] }])
    ).rejects.toMatchObject({
      httpStatus: 422,
    });
  });

  it('assignModules grants a module + permissions when the module exists', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup(['8']));

    const updated = await service.assignModules('1', [
      { moduleId: '8', permissions: ['all-fleet'] },
    ]);

    expect(updated.modules).toHaveLength(1);
    expect(updated.modules[0]).toMatchObject({ moduleId: '8', permissions: ['all-fleet'] });
  });

  it('listPlans delegates to the repository', async () => {
    const { repository } = fakePlansRepository([PLAN]);
    const service = new PlansService(repository, fakeModulesLookup());

    const result = await service.listPlans();

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe(PLAN.name);
  });
});
