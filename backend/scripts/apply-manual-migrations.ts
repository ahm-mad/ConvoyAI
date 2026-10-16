import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/platform/logging/logger.js';

/**
 * Applies every `prisma/manual-migrations/*.sql` file, in filename order,
 * against the configured database. This is the general-purpose sibling of
 * `apply-timescale-migrations.ts` (which stays Timescale-specific) — it
 * exists because `prisma db push`/`migrate dev` can no longer be trusted
 * to apply *any* schema change safely: D-0057's hypertable conversion left
 * `device_values`'s live primary key permanently diverged from
 * `schema.prisma`'s declared shape, and both Prisma schema-diffing
 * commands plan the entire schema in one pass, so every future change —
 * however unrelated — drags in a `device_values` primary-key "fix"
 * Postgres rejects outright on a compressed hypertable. Confirmed while
 * building D-0060 (module 2.5): `db push` applied part of that
 * migration's changes, then aborted on the `device_values` step, silently
 * leaving one column un-added — not the atomic all-or-nothing behavior
 * the tool's own framing implies. See D-0064 and
 * `prisma/manual-migrations/001-rule-alarm-severity.sql`'s own doc
 * comment.
 *
 * Statement-splitting logic identical to `apply-timescale-migrations.ts`
 * — kept duplicated rather than shared, since these two small scripts are
 * meant to stay independently readable/removable, not grow a shared
 * abstraction for two callers.
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'prisma',
  'manual-migrations'
);

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    if (sql.startsWith('$$', i)) {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i += 1;
      continue;
    }
    if (!inDollarQuote && sql.startsWith('--', i)) {
      const newline = sql.indexOf('\n', i);
      i = newline === -1 ? sql.length : newline;
      continue;
    }
    const char = sql[i] ?? '';
    if (char === ';' && !inDollarQuote) {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());

  return statements.filter(stmt => stmt.trim() !== '');
}

/**
 * Exported so `bootstrap-db.ts` (Phase 7) can call this directly, bundled.
 * Deliberately has **no top-level side effect of its own** (D-0095) — see
 * `apply-timescale-migrations.ts`'s own doc comment for why a "run
 * standalone" guard here would silently misfire once tsup bundles this
 * into `dist/bootstrap-db.js` alongside other scripts. The standalone CLI
 * entrypoint (`run-apply-manual-migrations.ts`, `npm run
 * db:manual-migrations`) is a separate, tiny file instead. Every file
 * under `prisma/manual-migrations/` must be idempotent (D-0094) — this
 * bootstrap path runs unconditionally on every deploy, fresh database or
 * not.
 */
export async function applyManualMigrations(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      logger.info({ file }, 'Applying manual migration');
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      for (const statement of splitStatements(sql)) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
    logger.info({ count: files.length }, 'Applied manual migration file(s)');
  } finally {
    await prisma.$disconnect();
  }
}
