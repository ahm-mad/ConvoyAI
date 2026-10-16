import type {
  plans as PlanRow,
  modules as ModuleRow,
  plan_module_permissions as PlanModulePermissionRow,
} from '@prisma/client';
import type { Plan, PlanModuleGrant } from './plans.types.js';

/** Row shape this mapper needs from the repository's include — kept narrow rather than importing Prisma's full generated payload type. */
export interface PlanRowWithGrants {
  plan: PlanRow;
  planModules: ModuleRow[];
  planModulePermissions: PlanModulePermissionRow[];
}

export function toPlan({ plan, planModules, planModulePermissions }: PlanRowWithGrants): Plan {
  const permissionsByModuleId = new Map(
    planModulePermissions.map(row => [row.module_id.toString(), row.permissions as string[]])
  );
  const modules: PlanModuleGrant[] = planModules.map(module => ({
    moduleId: module.id.toString(),
    code: module.code,
    slug: module.slug,
    permissions: permissionsByModuleId.get(module.id.toString()) ?? [],
  }));

  return {
    id: plan.id.toString(),
    name: plan.name,
    stripePlan: plan.stripe_plan,
    price: plan.price,
    description: plan.description,
    modules,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  };
}

export function toPlanResponse(plan: Plan) {
  return {
    id: Number(plan.id),
    name: plan.name,
    stripe_plan: plan.stripePlan,
    price: plan.price,
    description: plan.description,
    modules: plan.modules.map(module => ({
      id: Number(module.moduleId),
      code: module.code,
      slug: module.slug,
      permissions: module.permissions,
    })),
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };
}
