import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/platform/logging/logger.js';

/**
 * Applies every `platform/timeseries/migrations/*.sql` file, in filename
 * order, against the configured database. These are additive Timescale
 * DDL statements (hypertable conversion, compression/retention policies)
 * that Prisma's own migration flow can't express (ARCHITECTURE.md §9) —
 * this script is their one, explicit apply path, run by hand or in CI/
 * deploy, never automatically from application code.
 *
 * Prisma's `$executeRawUnsafe` rejects multi-statement input outright
 * ("cannot insert multiple commands into a prepared statement", confirmed
 * by testing) — each `.sql` file is split into individual statements here,
 * respecting `$$...$$` dollar-quoted bodies (a `DO $$ ... END $$;` block
 * contains its own semicolons and must run as one statement, not be split
 * on them).
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'platform',
  'timeseries',
  'migrations'
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
    // A `--` line comment (outside a dollar-quoted body) runs to the next
    // newline — its contents (including any semicolons in prose) must
    // never be scanned for statement boundaries or sent to Postgres.
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
 * Deliberately has **no top-level side effect of its own** (D-0095) — a
 * `if (import.meta.url === ...)` "am I the entrypoint" guard here would
 * silently misfire once bundled together with other scripts into one
 * `dist/bootstrap-db.js` file: after bundling, every module's
 * `import.meta.url` resolves to the *same* bundle URL, so this file's own
 * guard would fire unconditionally whenever `dist/bootstrap-db.js` runs —
 * confirmed by actually hitting this bug (this function ran before
 * `bootstrap-db.ts`'s own `prisma db push` step, against a table that
 * didn't exist yet). The standalone CLI entrypoint
 * (`run-apply-timescale-migrations.ts`, `npm run db:timescale`) is a
 * separate, tiny file instead — importing this one is always pure.
 */
export async function applyTimescaleMigrations(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      logger.info({ file }, 'Applying Timescale migration');
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      for (const statement of splitStatements(sql)) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
    logger.info({ count: files.length }, 'Applied Timescale migration file(s)');
  } finally {
    await prisma.$disconnect();
  }
}
