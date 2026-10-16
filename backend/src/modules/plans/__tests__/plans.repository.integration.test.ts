import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { PlansRepository } from '../plans.repository.js';

/** Real-Postgres integration test (CONVENTIONS.md "Tests"), same skip-if-unreachable convention as this project's other integration suites. */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@plans-repo-test';

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const plans = await rawPrisma.plans.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const planIds = plans.map(p => p.id);
  if (planIds.length > 0) {
    await rawPrisma.plan_module_permissions.deleteMany({ where: { plan_id: { in: planIds } } });
    await rawPrisma.plan_modules.deleteMany({ where: { plan_id: { in: planIds } } });
    await rawPrisma.plans.deleteMany({ where: { id: { in: planIds } } });
  }
  await rawPrisma.modules.deleteMany({ where: { code: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('PlansRepository (real Postgres)', () => {
  it('findById returns undefined for a missing id', async () => {
    const repo = new PlansRepository(prisma);

    expect(await repo.findById('999999999')).toBeUndefined();
  });

  it('findByStripePlan finds a plan by its stripe_plan sentinel; undefined for a miss', async () => {
    const repo = new PlansRepository(prisma);
    const plan = await repo.create({
      name: `StripePlanLookup${MARK}`,
      stripePlan: `price_lookup${MARK}`,
      price: '0',
      description: 'x',
    });

    const found = await repo.findByStripePlan(`price_lookup${MARK}`);
    expect(found?.id).toBe(plan.id);
    expect(await repo.findByStripePlan(`nonexistent${MARK}`)).toBeUndefined();
  });

  it('list returns every plan with real modules/plan_module_permissions included', async () => {
    const repo = new PlansRepository(prisma);
    const module = await rawPrisma.modules.create({
      data: { code: `list-mod${MARK}`, slug: `list-mod${MARK}` },
    });
    const plan = await repo.create({
      name: `List${MARK}`,
      stripePlan: `price_list${MARK}`,
      price: '0',
      description: 'x',
    });
    await repo.assignModules(plan.id, [{ moduleId: module.id.toString(), permissions: ['all-x'] }]);

    const all = await repo.list();

    const found = all.find(p => p.id === plan.id);
    expect(found?.modules).toEqual([
      expect.objectContaining({ moduleId: module.id.toString(), permissions: ['all-x'] }),
    ]);
  });

  it('update changes the given fields and leaves the rest untouched', async () => {
    const repo = new PlansRepository(prisma);
    const plan = await repo.create({
      name: `ToUpdate${MARK}`,
      stripePlan: `price_toupdate${MARK}`,
      price: '0',
      description: 'original',
    });

    const updated = await repo.update(plan.id, {
      name: undefined,
      stripePlan: undefined,
      price: '999',
      description: undefined,
    });

    expect(updated.price).toBe('999');
    expect(updated.name).toBe(`ToUpdate${MARK}`);
    expect(updated.description).toBe('original');
  });

  it('creates and finds a plan, real modules/plan_module_permissions included', async () => {
    const repo = new PlansRepository(prisma);
    const module = await rawPrisma.modules.create({
      data: { code: `fleet-mgmt${MARK}`, slug: `fleet-mgmt${MARK}` },
    });

    const created = await repo.create({
      name: `Gold${MARK}`,
      stripePlan: `price_gold${MARK}`,
      price: '250',
      description: 'gold',
    });
    expect(created.modules).toEqual([]);

    const granted = await repo.assignModules(created.id, [
      { moduleId: module.id.toString(), permissions: ['all-fleet'] },
    ]);
    expect(granted.modules).toHaveLength(1);
    expect(granted.modules[0]).toMatchObject({
      moduleId: module.id.toString(),
      permissions: ['all-fleet'],
    });

    const found = await repo.findById(created.id);
    expect(found?.modules).toHaveLength(1);
  });

  it('assignModules is additive — re-running with a different module never detaches the first one (syncWithoutDetaching semantics)', async () => {
    const repo = new PlansRepository(prisma);
    const moduleA = await rawPrisma.modules.create({
      data: { code: `mod-a${MARK}`, slug: `mod-a${MARK}` },
    });
    const moduleB = await rawPrisma.modules.create({
      data: { code: `mod-b${MARK}`, slug: `mod-b${MARK}` },
    });
    const plan = await repo.create({
      name: `Plat${MARK}`,
      stripePlan: `price_plat${MARK}`,
      price: '300',
      description: 'x',
    });

    await repo.assignModules(plan.id, [{ moduleId: moduleA.id.toString(), permissions: [] }]);
    const afterSecond = await repo.assignModules(plan.id, [
      { moduleId: moduleB.id.toString(), permissions: [] },
    ]);

    const moduleIds = afterSecond.modules.map(m => m.moduleId).sort();
    expect(moduleIds).toEqual([moduleA.id.toString(), moduleB.id.toString()].sort());
  });

  it('assignModules updates an existing plan_module_permissions row when the permission list changes', async () => {
    const repo = new PlansRepository(prisma);
    const module = await rawPrisma.modules.create({
      data: { code: `perm-mod${MARK}`, slug: `perm-mod${MARK}` },
    });
    const plan = await repo.create({
      name: `Basic${MARK}`,
      stripePlan: `price_basic${MARK}`,
      price: '200',
      description: 'x',
    });

    await repo.assignModules(plan.id, [{ moduleId: module.id.toString(), permissions: ['all-x'] }]);
    const updated = await repo.assignModules(plan.id, [
      { moduleId: module.id.toString(), permissions: ['all-x', 'edit-x'] },
    ]);

    expect(updated.modules[0]?.permissions).toEqual(['all-x', 'edit-x']);

    const rows = await rawPrisma.plan_module_permissions.findMany({
      where: { plan_id: BigInt(plan.id) },
    });
    expect(rows).toHaveLength(1);
  });

  it('assignModules is a no-op write when re-run with identical permissions (no update, no error)', async () => {
    const repo = new PlansRepository(prisma);
    const module = await rawPrisma.modules.create({
      data: { code: `same-perm${MARK}`, slug: `same-perm${MARK}` },
    });
    const plan = await repo.create({
      name: `SamePerm${MARK}`,
      stripePlan: `price_sameperm${MARK}`,
      price: '0',
      description: 'x',
    });

    await repo.assignModules(plan.id, [{ moduleId: module.id.toString(), permissions: ['all-x'] }]);
    const again = await repo.assignModules(plan.id, [
      { moduleId: module.id.toString(), permissions: ['all-x'] },
    ]);

    expect(again.modules[0]?.permissions).toEqual(['all-x']);
    const rows = await rawPrisma.plan_module_permissions.findMany({
      where: { plan_id: BigInt(plan.id) },
    });
    expect(rows).toHaveLength(1);
  });

  it("nameExists / stripePlanExists exclude the plan's own id (update-in-place case)", async () => {
    const repo = new PlansRepository(prisma);
    const plan = await repo.create({
      name: `Self${MARK}`,
      stripePlan: `price_self${MARK}`,
      price: '0',
      description: 'x',
    });

    expect(await repo.nameExists(`Self${MARK}`)).toBe(true);
    expect(await repo.nameExists(`Self${MARK}`, plan.id)).toBe(false);
    expect(await repo.stripePlanExists(`price_self${MARK}`, plan.id)).toBe(false);
  });

  it('ensurePlaceholderPlan is idempotent and additively syncs every module in the catalog', async () => {
    const repo = new PlansRepository(prisma);
    const moduleA = await rawPrisma.modules.create({
      data: { code: `placeholder-a${MARK}`, slug: `placeholder-a${MARK}` },
    });

    const first = await repo.ensurePlaceholderPlan({
      stripePlan: `placeholder-full-access${MARK}`,
      name: `Full Access${MARK}`,
      price: '0',
      description: 'placeholder',
    });
    expect(first.modules.map(m => m.moduleId)).toContain(moduleA.id.toString());

    const moduleB = await rawPrisma.modules.create({
      data: { code: `placeholder-b${MARK}`, slug: `placeholder-b${MARK}` },
    });
    const second = await repo.ensurePlaceholderPlan({
      stripePlan: `placeholder-full-access${MARK}`,
      name: `Full Access${MARK}`,
      price: '0',
      description: 'placeholder',
    });

    expect(second.id).toBe(first.id);
    const moduleIds = second.modules.map(m => m.moduleId);
    expect(moduleIds).toContain(moduleA.id.toString());
    expect(moduleIds).toContain(moduleB.id.toString());

    // A third call with no new modules in the catalog hits the "nothing missing" branch — still a no-op, not an error.
    const third = await repo.ensurePlaceholderPlan({
      stripePlan: `placeholder-full-access${MARK}`,
      name: `Full Access${MARK}`,
      price: '0',
      description: 'placeholder',
    });
    expect(third.modules.map(m => m.moduleId).sort()).toEqual(moduleIds.sort());
  });
});
