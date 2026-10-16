import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';
import { applyAuditActors } from './audit-actors.js';
import { applyTenantScoping } from './tenant-scoping.js';
import { applyTimestamps } from './timestamps.js';

/**
 * The Prisma client singleton (ARCHITECTURE.md §2 platform/db) — every
 * module gets this one client, already wrapped in the default
 * tenant-scoping extension (module 1.3, ARCHITECTURE.md §6). There is no
 * separate "raw" client: a query that must bypass scoping (a pre-auth
 * lookup, a genuinely cross-tenant admin op) uses the named
 * `runAsSystem()` escape hatch (module 1.1's `request-context.ts`), never
 * a different client instance — one client, one code path, so scoping
 * can't be silently skipped by picking the "other" import.
 */
const basePrisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export const prisma = applyAuditActors(applyTimestamps(applyTenantScoping(basePrisma)));

export async function disconnectPrisma(): Promise<void> {
  await basePrisma.$disconnect();
  logger.debug('Prisma client disconnected');
}
