/**
 * Domain types for module 5.1 (plans-modules) — see `tasks/21-plans-modules.md`.
 *
 * Designed fresh (11.26: `PlanController` has zero live routes in Laravel) —
 * not a behavior port. Per D-0080/its Addendum 2, this is real, shippable
 * code: `plans`/`plan_modules`/`plan_module_permissions` CRUD, gated behind
 * the platform-operator role, with zero Stripe involvement. `stripe_plan`
 * stays as a column name (matches the frozen schema) but only ever holds a
 * sentinel string (e.g. `"placeholder-full-access"`) — never a real Stripe
 * price id, never sent to Stripe.
 */

export interface PlanModuleGrant {
  moduleId: string;
  code: string;
  slug: string;
  /** `plan_module_permissions.permissions` JSON array for this module, `[]` if no row exists (11.25/§1.3's fine-grained layer, on top of the module being in `plan_modules` at all). */
  permissions: string[];
}

export interface Plan {
  id: string;
  name: string;
  stripePlan: string;
  price: string;
  description: string;
  modules: PlanModuleGrant[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreatePlanInput {
  name: string;
  stripePlan: string;
  price: string;
  description: string;
}

export interface UpdatePlanInput {
  name: string | undefined;
  stripePlan: string | undefined;
  price: string | undefined;
  description: string | undefined;
}

export interface AssignModuleInput {
  moduleId: string;
  permissions: string[];
}
