import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { toPlan } from './plans.mapper.js';
import type { AssignModuleInput, CreatePlanInput, Plan, UpdatePlanInput } from './plans.types.js';

const PLAN_INCLUDE = {
  plan_modules: { include: { modules: true } },
  plan_module_permissions: true,
} as const;

/**
 * All Prisma access for module 5.1. `plans`/`plan_modules`/
 * `plan_module_permissions` are all `none`-ruled (`schema-tables.md`'s
 * tenant-key map, `tenant-rules.ts`) — a genuinely global, cross-tenant
 * catalog, same class as `modules` itself. No company/user scoping anywhere
 * in this repository.
 */
export class PlansRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async list(): Promise<Plan[]> {
    const rows = await this.prisma.plans.findMany({
      include: PLAN_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return rows.map(row =>
      toPlan({
        plan: row,
        planModules: row.plan_modules.map(link => link.modules),
        planModulePermissions: row.plan_module_permissions,
      })
    );
  }

  async findById(id: string): Promise<Plan | undefined> {
    const row = await this.prisma.plans.findUnique({
      where: { id: BigInt(id) },
      include: PLAN_INCLUDE,
    });
    if (!row) return undefined;
    return toPlan({
      plan: row,
      planModules: row.plan_modules.map(link => link.modules),
      planModulePermissions: row.plan_module_permissions,
    });
  }

  /**
   * `Plan::where('stripe_plan', ...)` — the soft, string-based join a real
   * `subscription_items.stripe_price` uses against `plans.stripe_plan`
   * (`platform-billing-stripe.md` §1.4, no DB FK enforces it). Module 5.2's
   * `GET /modules/user/{userId}` uses this to resolve the caller's active
   * subscription's plan (the correct `ModuleController::index()`-based
   * lookup, not 11.55's buggy `getUserModulesWithPermissions` chain).
   */
  async findByStripePlan(stripePlan: string): Promise<Plan | undefined> {
    const row = await this.prisma.plans.findFirst({
      where: { stripe_plan: stripePlan },
      include: PLAN_INCLUDE,
    });
    if (!row) return undefined;
    return toPlan({
      plan: row,
      planModules: row.plan_modules.map(link => link.modules),
      planModulePermissions: row.plan_module_permissions,
    });
  }

  async nameExists(name: string, excludePlanId?: string): Promise<boolean> {
    const row = await this.prisma.plans.findFirst({
      where: { name, ...(excludePlanId ? { id: { not: BigInt(excludePlanId) } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async stripePlanExists(stripePlan: string, excludePlanId?: string): Promise<boolean> {
    const row = await this.prisma.plans.findFirst({
      where: {
        stripe_plan: stripePlan,
        ...(excludePlanId ? { id: { not: BigInt(excludePlanId) } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    const row = await this.prisma.plans.create({
      data: {
        name: input.name,
        stripe_plan: input.stripePlan,
        price: input.price,
        description: input.description,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
    return this.findByIdOrThrow(row.id.toString());
  }

  async update(id: string, input: UpdatePlanInput): Promise<Plan> {
    await this.prisma.plans.update({
      where: { id: BigInt(id) },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.stripePlan !== undefined ? { stripe_plan: input.stripePlan } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updated_at: new Date(),
      },
    });
    return this.findByIdOrThrow(id);
  }

  /**
   * `PlanController::assignModulesToPlan` ported (11's one real, reachable-
   * if-ever-routed method): additive module grant (`syncWithoutDetaching` —
   * never detaches a module already on the plan), plus an upsert-or-update
   * of that module's `plan_module_permissions` JSON row.
   */
  async assignModules(planId: string, grants: AssignModuleInput[]): Promise<Plan> {
    const planIdBig = BigInt(planId);
    for (const grant of grants) {
      const moduleIdBig = BigInt(grant.moduleId);
      const existingLink = await this.prisma.plan_modules.findFirst({
        where: { plan_id: planIdBig, module_id: moduleIdBig },
        select: { id: true },
      });
      if (!existingLink) {
        await this.prisma.plan_modules.create({
          data: {
            plan_id: planIdBig,
            module_id: moduleIdBig,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }

      const existingPermission = await this.prisma.plan_module_permissions.findFirst({
        where: { plan_id: planIdBig, module_id: moduleIdBig },
      });
      if (!existingPermission) {
        await this.prisma.plan_module_permissions.create({
          data: {
            plan_id: planIdBig,
            module_id: moduleIdBig,
            permissions: grant.permissions,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      } else if (
        JSON.stringify(existingPermission.permissions) !== JSON.stringify(grant.permissions)
      ) {
        await this.prisma.plan_module_permissions.update({
          where: { id: existingPermission.id },
          data: { permissions: grant.permissions, updated_at: new Date() },
        });
      }
    }
    return this.findByIdOrThrow(planId);
  }

  /**
   * D-0080's placeholder plan, idempotent: creates the one sentinel plan if
   * missing, then additively syncs `plan_modules` to cover *every* module
   * currently in the catalog (never removes a grant — same
   * `syncWithoutDetaching` discipline as `assignModules`, so a manually
   * broadened plan is never narrowed by re-running this). Deliberately does
   * NOT write any `plan_module_permissions` rows — task-21's own note:
   * a module present in `plan_modules` with no `plan_module_permissions`
   * row falls back to the two default `all-{slug}`/`none-{slug}`
   * permissions during role bootstrap (23-onboarding), which is exactly
   * the "maximally permissive, no fine-tuning" placeholder this plan is.
   */
  async ensurePlaceholderPlan(params: {
    stripePlan: string;
    name: string;
    price: string;
    description: string;
  }): Promise<Plan> {
    let plan = await this.prisma.plans.findFirst({ where: { stripe_plan: params.stripePlan } });
    if (!plan) {
      plan = await this.prisma.plans.create({
        data: {
          name: params.name,
          stripe_plan: params.stripePlan,
          price: params.price,
          description: params.description,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    const allModules = await this.prisma.modules.findMany({ select: { id: true } });
    const alreadyLinked = await this.prisma.plan_modules.findMany({
      where: { plan_id: plan.id },
      select: { module_id: true },
    });
    const alreadyLinkedIds = new Set(alreadyLinked.map(link => link.module_id.toString()));
    const missingModuleIds = allModules.filter(
      module => !alreadyLinkedIds.has(module.id.toString())
    );

    if (missingModuleIds.length > 0) {
      await this.prisma.plan_modules.createMany({
        data: missingModuleIds.map(module => ({
          plan_id: plan.id,
          module_id: module.id,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      });
    }

    return this.findByIdOrThrow(plan.id.toString());
  }

  /** Every write path re-fetches by id to return the same shape `findById` does (real modules/permissions included) — this throw is an internal invariant (the row this method just wrote must exist), not a user-facing 404. */
  private async findByIdOrThrow(id: string): Promise<Plan> {
    const plan = await this.findById(id);
    if (!plan) {
      throw new Error(
        `Plan ${id} not found immediately after a write that should have created/kept it`
      );
    }
    return plan;
  }
}
