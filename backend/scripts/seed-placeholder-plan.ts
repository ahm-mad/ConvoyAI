import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../src/platform/db/tenant-scoping.js';
import { PlansRepository } from '../src/modules/plans/plans.repository.js';
import { PLACEHOLDER_PLAN } from '../src/modules/plans/placeholder-plan.js';
import { logger } from '../src/platform/logging/logger.js';

/**
 * D-0080's one placeholder plan (module 5.1). Idempotent — safe to run
 * against any environment at any time (dev bootstrap, staging, a fresh
 * prod deploy): creates the sentinel plan if missing, then additively
 * syncs `plan_modules` to cover every module currently in the catalog
 * (never removes an existing grant). Run via `npm run db:seed-placeholder-plan`.
 *
 * `plans`/`modules`/`plan_modules` are all `none`-ruled (tenant-rules.ts)
 * — no request context needed, `applyTenantScoping` passes these through
 * unscoped regardless.
 *
 * Exported so `bootstrap-db.ts` (Phase 7) can call this directly, bundled.
 * Deliberately has **no top-level side effect of its own** (D-0095) — see
 * `apply-timescale-migrations.ts`'s own doc comment for why a "run
 * standalone" guard here would silently misfire once tsup bundles this
 * into `dist/bootstrap-db.js` alongside other scripts. The standalone CLI
 * entrypoint (`run-seed-placeholder-plan.ts`, `npm run
 * db:seed-placeholder-plan`) is a separate, tiny file instead.
 */
export async function seedPlaceholderPlan(): Promise<void> {
  const prisma = applyTenantScoping(new PrismaClient());
  try {
    const repository = new PlansRepository(prisma);
    const plan = await repository.ensurePlaceholderPlan(PLACEHOLDER_PLAN);
    logger.info(
      { planId: plan.id, stripePlan: plan.stripePlan, moduleCount: plan.modules.length },
      'Placeholder plan seeded/synced'
    );
  } finally {
    await prisma.$disconnect();
  }
}
