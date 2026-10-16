import type { PrismaClient } from '@prisma/client';
import { getRequestContext, isSystemContext } from '../http/request-context.js';
import { tenantRuleFor } from './tenant-rules.js';

/**
 * The default tenant-scoping Prisma Client extension (ARCHITECTURE.md §6,
 * D-0011) — the single most load-bearing piece of infrastructure in the
 * rewrite. Every query against a `company`/`user`-ruled model gets the
 * tenant filter injected automatically; there is no opt-out except the
 * named `runAsSystem()` escape hatch (module 1.1). This is what makes
 * KNOWN_ISSUES 11.20/11.37/11.38 (and the client-suppliable-`company_id`
 * pattern found alongside them) structurally impossible to reproduce in
 * the new app, rather than something every controller must remember.
 *
 * Behavior per query, for a `company`/`user`-ruled model:
 * - System context (`runAsSystem()`) → unscoped, pass through.
 * - No context at all → throw. Silence here would be indistinguishable
 *   from "wrap this in runAsSystem() if it's deliberate" and "someone
 *   forgot requireAuth ran first" — ARCHITECTURE.md §6 requires escapes
 *   to be explicit and named, never accidental, so this fails loud
 *   instead of returning an empty/unscoped result.
 * - Real user context missing the relevant key (e.g. a pre-verification
 *   user with no `companyId` querying a company-scoped model) → throw,
 *   same reasoning.
 * - Otherwise → the tenant field is forced into `where` (overwriting
 *   anything the caller supplied for that field — never trust client
 *   input for a tenant key, KNOWN_ISSUES 11.20/11.38) and into `data` on
 *   create/upsert, so a caller cannot even create a row for another
 *   tenant by supplying it in the request body.
 *
 * `none`/`parent`-ruled models pass through unscoped — `parent` models
 * are the caller's own responsibility to scope via an already-verified
 * parent row (see `tenant-rules.ts`'s doc comment).
 */
export function applyTenantScoping(client: PrismaClient) {
  return client.$extends({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const rule = tenantRuleFor(model);

          if (rule.kind === 'none' || rule.kind === 'parent') {
            return query(args);
          }

          const context = getRequestContext();
          if (isSystemContext(context)) {
            return query(args);
          }
          if (!context) {
            throw new Error(
              `Tenant-scoped query on model "${model}" with no request context. ` +
                `Wrap in runAsSystemAsync() if this is deliberate (e.g. a pre-auth lookup), ` +
                `or ensure requireAuth ran first.`
            );
          }

          const tenantValue = rule.kind === 'company' ? context.companyId : context.userId;
          if (tenantValue === undefined) {
            throw new Error(
              `Tenant-scoped query on model "${model}" (rule: ${rule.kind}) but the current ` +
                `context has no ${rule.field} — the caller has no tenant to scope by yet.`
            );
          }

          return runScoped(operation, args, rule.field, tenantValue, query);
        },
      },
    },
  });
}

/**
 * The extended client's type — structurally a `PrismaClient` for every
 * model/query purpose, but not nominally identical (extensions drop
 * `$on`, which must be attached before extending). Every module's
 * repository takes this type, not the base `PrismaClient`, since this is
 * the only client instance the app ever constructs (`platform/db/prisma.ts`).
 */
export type AppPrismaClient = ReturnType<typeof applyTenantScoping>;

type PrismaArgs = Record<string, unknown>;
type QueryFn = (args: PrismaArgs) => Promise<unknown>;

const WHERE_FILTER_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);
const SINGLE_RECORD_OPS = new Set(['update', 'delete']);
const CREATE_OPS = new Set(['create']);
const CREATE_MANY_OPS = new Set(['createMany', 'createManyAndReturn']);

function forceWhere(args: PrismaArgs, field: string, value: string): PrismaArgs {
  const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
  return { ...args, where: { ...where, [field]: value } };
}

function forceData(data: unknown, field: string, value: string): unknown {
  if (Array.isArray(data)) {
    return data.map(row => ({ ...(row as Record<string, unknown>), [field]: value }));
  }
  return { ...(data as Record<string, unknown>), [field]: value };
}

async function runScoped(
  operation: string,
  args: PrismaArgs,
  field: string,
  value: string,
  query: QueryFn
): Promise<unknown> {
  if (WHERE_FILTER_OPS.has(operation) || SINGLE_RECORD_OPS.has(operation)) {
    return query(forceWhere(args, field, value));
  }

  if (CREATE_OPS.has(operation)) {
    return query({ ...args, data: forceData(args['data'], field, value) });
  }

  if (CREATE_MANY_OPS.has(operation)) {
    return query({ ...args, data: forceData(args['data'], field, value) });
  }

  if (operation === 'upsert') {
    const scoped = forceWhere(args, field, value);
    return query({ ...scoped, create: forceData(args['create'], field, value) });
  }

  throw new Error(
    `Tenant-scoping extension has no handling for Prisma operation "${operation}" — ` +
      `add it to tenant-scoping.ts rather than letting it run unscoped.`
  );
}
