import type { AppPrismaClient } from './tenant-scoping.js';
import { getRequestContext, isSystemContext } from '../http/request-context.js';

/**
 * Who created / last changed a fleet record (D-0172, fleet enterprise readiness ask B6) — a Prisma Client extension,
 * sibling to `timestamps.ts` (D-0051) and composed next to it in `prisma.ts`, for the same reason: one central place
 * instead of every repository remembering to set the columns on every write.
 *
 * Only the models listed in `AUDITED_MODELS` are touched (an explicit allow-list — several other tables have a
 * `created_by` column with a different meaning, e.g. `dashboards`/`widgets`/`products`, and `trips` already sets its
 * own `created_by` explicitly). Per query, from the request context:
 * - a **human** caller (a real user id) → `create*`: `created_by` (when the model has one) and `updated_by` = the user;
 *   `update*`: `updated_by` = the user; `upsert`: both branches accordingly.
 * - the **system** context (sensor / worker / scheduler / ingestion) → `create*` leaves both NULL; `update*` sets
 *   `updated_by` to NULL explicitly, so an automatic change never shows the previous human editor next to a newer
 *   `updated_at`. The API reports NULL as "System".
 * - **no context at all** (scripts, tests) → pass through unchanged.
 * A value the caller already supplied (even an explicit NULL) always wins — this fills gaps, it never overrides.
 * `logged_by` (maintenance logs, fuel logs, driver incidents) and `trips.created_by` are still set by their repositories
 * as before; those models only get `updated_by` here.
 */
export interface AuditedModel {
  /** The model also has a `created_by` column that this extension should fill (false: the creator is recorded elsewhere). */
  readonly created: boolean;
}

export const AUDITED_MODELS: Readonly<Record<string, AuditedModel>> = {
  vehicles: { created: true },
  drivers: { created: true },
  yards: { created: true },
  yard_slots: { created: true },
  geofences: { created: true },
  vehicle_maintenance_schedules: { created: true },
  compliance_documents: { created: true },
  trips: { created: false },
  vehicle_maintenance_logs: { created: false },
  fuel_logs: { created: false },
  driver_incidents: { created: false },
  fleet_settings: { created: false }, // D-0183 (F1): only `updated_by` exists
};

export function applyAuditActors(client: AppPrismaClient): AppPrismaClient {
  return client.$extends({
    name: 'audit-actors',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const audited = AUDITED_MODELS[model];
          if (!audited) return query(args);

          const context = getRequestContext();
          if (!context) return query(args);

          const actor = isSystemContext(context) ? null : parseActorId(context.userId);
          if (actor === undefined) return query(args); // a non-numeric user id — nothing sensible to record

          return query(stampActors(operation, args, audited, actor));
        },
      },
    },
  });
}

/** The caller's user id as a BigInt, or `undefined` when it is not a plain number (then nothing is written). */
function parseActorId(userId: string): bigint | undefined {
  return /^\d+$/.test(userId) ? BigInt(userId) : undefined;
}

type PrismaArgs = Record<string, unknown>;

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPDATE_OPS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

function withDefaults(data: unknown, defaults: Record<string, unknown>): unknown {
  if (Object.keys(defaults).length === 0) return data;
  if (Array.isArray(data))
    return data.map(row => ({ ...defaults, ...(row as Record<string, unknown>) }));
  return { ...defaults, ...(data as Record<string, unknown>) };
}

/** Exported for the unit tests — the pure part of the extension. `actor` is `null` for the system context. */
export function stampActors(
  operation: string,
  args: PrismaArgs,
  audited: AuditedModel,
  actor: bigint | null
): PrismaArgs {
  const createDefaults: Record<string, unknown> = {};
  if (actor !== null) {
    if (audited.created) createDefaults['created_by'] = actor;
    createDefaults['updated_by'] = actor;
  }
  const updateDefaults: Record<string, unknown> = { updated_by: actor };

  if (CREATE_OPS.has(operation))
    return { ...args, data: withDefaults(args['data'], createDefaults) };
  if (UPDATE_OPS.has(operation))
    return { ...args, data: withDefaults(args['data'], updateDefaults) };
  if (operation === 'upsert') {
    return {
      ...args,
      create: withDefaults(args['create'], createDefaults),
      update: withDefaults(args['update'], updateDefaults),
    };
  }
  return args;
}
