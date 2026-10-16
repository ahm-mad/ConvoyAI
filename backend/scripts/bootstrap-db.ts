import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/platform/logging/logger.js';
import { applyTimescaleMigrations } from './apply-timescale-migrations.js';
import { applyManualMigrations } from './apply-manual-migrations.js';
import { seedPlatformOperator } from './seed-platform-operator.js';
import { seedPlaceholderPlan } from './seed-placeholder-plan.js';
import { seedDemoData } from './seed-demo-data.js';

/**
 * The one consolidated, idempotent database bootstrap for Phase 7
 * (D-0094) — everything a fresh deployment needs, and everything a
 * restart of an already-provisioned deployment needs, run in one call
 * with no manual judgment about which step applies. Used by both cutover
 * paths (Docker Compose's one-shot `migrate` service and the plain-Node
 * deploy script), and safe to run by hand too (`node dist/bootstrap-db.js`
 * in production, `tsx scripts/bootstrap-db.ts` in dev).
 *
 * Sequence:
 * 1. Detect whether the target database is genuinely empty (no tables in
 *    `public` at all). Only then is `prisma db push` run, to create the
 *    full 86-table frozen schema from `schema.prisma` in one pass — safe
 *    ONLY because nothing has diverged from it yet. An already-provisioned
 *    database (this dev DB, or a redeployed instance) never gets `db push`
 *    run against it again: D-0064 established this is unsafe once
 *    `device_values` has been converted to a Timescale hypertable, since
 *    both Prisma schema-diffing commands plan the *entire* schema in one
 *    pass and would drag in a primary-key "fix" Postgres rejects outright.
 * 2. `applyTimescaleMigrations()` — idempotent (checks the current
 *    primary-key shape, every Timescale call uses `if_not_exists`), always
 *    safe to run regardless of step 1's outcome.
 * 3. `applyManualMigrations()` — idempotent as of D-0094 (every file under
 *    `prisma/manual-migrations/` now guards its own DDL), always safe to
 *    run regardless of whether `db push` already created the same columns.
 * 4. `seedPlatformOperator()` — idempotent, non-destructive on re-run: the
 *    `superadmin@example.com` account's password is generated once on first
 *    creation and never rotated afterward, satisfying the standing
 *    requirement that this account's credentials never change once set.
 * 5. `seedDemoData()` — idempotent, ported from the real Laravel seeders
 *    (D-0097): the real protocol catalog (fixes MQTT ingestion's
 *    otherwise-unresolvable `MQTT` lookup), the real 8-module catalog,
 *    5 real preconfigure templates, and a Default Company + admin/manager/
 *    user roles + the real `junead@chaminade-hs.org` seed user. Runs
 *    BEFORE step 6 so the real module catalog exists when the placeholder
 *    plan syncs against it.
 * 6. `seedPlaceholderPlan()` — idempotent, additive-only.
 */

async function isDatabaseEmpty(): Promise<boolean> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    return (rows[0]?.count ?? 0n) === 0n;
  } finally {
    await prisma.$disconnect();
  }
}

export async function bootstrapDb(): Promise<void> {
  const empty = await isDatabaseEmpty();

  if (empty) {
    logger.info('Empty database detected — creating the full frozen schema (prisma db push)');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
  } else {
    logger.info(
      'Existing schema detected — skipping prisma db push (D-0064: unsafe once the Timescale hypertable conversion has run)'
    );
  }

  await applyTimescaleMigrations();
  await applyManualMigrations();
  await seedPlatformOperator();
  await seedDemoData();
  await seedPlaceholderPlan();

  logger.info('Database bootstrap complete');
}

// This file is itself the entrypoint (`dist/bootstrap-db.js`, `tsx
// scripts/bootstrap-db.ts`), never imported by anything else — no "am I
// the main module" guard needed here, same convention as `src/main.*.ts`.
// See `apply-timescale-migrations.ts`'s doc comment for why the four
// scripts this file imports deliberately do NOT have that guard either.
await bootstrapDb();
