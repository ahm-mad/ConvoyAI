import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from './tenant-scoping.js';

/**
 * The default timestamp-stamping Prisma Client extension (D-0050,
 * sibling to `tenant-scoping.ts`). Laravel's Eloquent auto-manages
 * `created_at`/`updated_at` on every model by default; Prisma does not
 * unless the schema itself declares `@default(now())`/`@updatedAt` (the
 * frozen schema does this for only 3 of 86 tables). Without this
 * extension, every repository has to remember to set both columns by
 * hand on every write — `rbac.repository.ts` does, consistently;
 * `auth.repository.ts`'s `users.create()` and module 2.1's
 * `products.repository.ts` do not, so every user/product/device/
 * attribute-preference/template/rule/widget created through the new app
 * silently got `created_at`/`updated_at` = `null` forever, a real parity
 * gap versus Laravel found live-testing module 2.2 (protocols). Fixing
 * this centrally, once, retroactively covers every already-built module
 * and every future one, rather than patching each repository's call
 * sites (the exact pattern that let the gap recur twice).
 *
 * Behavior per query, for a model that actually has the relevant
 * column(s) (checked once from the Prisma DMMF at module load, not
 * hardcoded — `tenant-rules.ts` is a parallel hand-maintained registry
 * for tenancy because that needs a human judgment call per table;
 * whether a column exists is a structural fact the schema itself
 * already answers):
 * - `create`/`createMany`/`createManyAndReturn` → fills `created_at`
 *   and `updated_at` with `now()` if the caller didn't already supply
 *   them (an explicit value — e.g. a data-migration backfill — always
 *   wins).
 * - `update`/`updateMany`/`updateManyAndReturn` → fills `updated_at`
 *   with `now()` if the caller didn't already supply it. `created_at`
 *   is never touched on update.
 * - `upsert` → the `create` branch gets both columns, the `update`
 *   branch gets only `updated_at`, same "fill if absent" rule.
 * - Everything else (reads, `delete`) passes through unchanged.
 *
 * Unlike tenant-scoping's `forceData` (which always overwrites — never
 * trust client input for a tenant key), this fills gaps rather than
 * overriding, so code that already sets these columns explicitly
 * (`rbac.repository.ts`) keeps working unchanged.
 */
export function applyTimestamps(client: AppPrismaClient): AppPrismaClient {
  return client.$extends({
    name: 'timestamps',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const columns = COLUMNS_BY_MODEL.get(model);
          if (!columns) return query(args);

          return query(stampArgs(operation, args, columns));
        },
      },
    },
  });
}

interface ModelTimestampColumns {
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
}

const COLUMNS_BY_MODEL: Map<string, ModelTimestampColumns> = new Map(
  Prisma.dmmf.datamodel.models.map(model => {
    const fieldNames = new Set(model.fields.filter(f => f.kind === 'scalar').map(f => f.name));
    return [
      model.name,
      { hasCreatedAt: fieldNames.has('created_at'), hasUpdatedAt: fieldNames.has('updated_at') },
    ] as const;
  })
);

type PrismaArgs = Record<string, unknown>;

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPDATE_OPS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

function withDefaults(data: unknown, defaults: Record<string, unknown>): unknown {
  if (Object.keys(defaults).length === 0) return data;
  if (Array.isArray(data)) {
    return data.map(row => ({ ...defaults, ...(row as Record<string, unknown>) }));
  }
  return { ...defaults, ...(data as Record<string, unknown>) };
}

function stampArgs(
  operation: string,
  args: PrismaArgs,
  columns: ModelTimestampColumns
): PrismaArgs {
  const now = new Date();

  if (CREATE_OPS.has(operation)) {
    const defaults: Record<string, unknown> = {};
    if (columns.hasCreatedAt) defaults['created_at'] = now;
    if (columns.hasUpdatedAt) defaults['updated_at'] = now;
    return { ...args, data: withDefaults(args['data'], defaults) };
  }

  if (UPDATE_OPS.has(operation)) {
    if (!columns.hasUpdatedAt) return args;
    return { ...args, data: withDefaults(args['data'], { updated_at: now }) };
  }

  if (operation === 'upsert') {
    const createDefaults: Record<string, unknown> = {};
    if (columns.hasCreatedAt) createDefaults['created_at'] = now;
    if (columns.hasUpdatedAt) createDefaults['updated_at'] = now;
    const updateDefaults: Record<string, unknown> = columns.hasUpdatedAt ? { updated_at: now } : {};
    return {
      ...args,
      create: withDefaults(args['create'], createDefaults),
      update: withDefaults(args['update'], updateDefaults),
    };
  }

  return args;
}
