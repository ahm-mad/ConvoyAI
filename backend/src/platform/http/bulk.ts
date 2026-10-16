import { z } from 'zod';
import { AppError, ValidationError } from '../errors/app-error.js';
import { logger } from '../logging/logger.js';

/**
 * Shared building blocks for the fleet bulk endpoints (D-0166, B10 of `flows/06-fleet-enterprise-readiness.md`).
 * Owner decision Q4: every bulk endpoint takes **either** `ids` **or** a `filter` (the list's own parameters), acts on at most
 * `BULK_LIMIT` (500) records per request, runs each record through the same single-record action (so every guard and message is
 * identical) and answers with per-record results — partial success is normal, the HTTP status stays 200.
 */

export const BULK_LIMIT = 500;
export const BULK_LIMIT_MESSAGE = `You can act on at most ${String(BULK_LIMIT)} records per request.`;

/** `1`/`0`/`true`/`false` as a JSON boolean, number or string — a body (unlike a query string) can carry real booleans. */
export const BodyFlagSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.enum(['0', '1', 'true', 'false'])])
  .optional();

export function bodyFlag(
  value: boolean | 0 | 1 | '0' | '1' | 'true' | 'false' | undefined
): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === 1 || value === '1' || value === 'true';
}

export const BulkIdsSchema = z
  .array(z.union([z.string().min(1), z.number().int()]))
  .min(1)
  .max(BULK_LIMIT, { error: BULK_LIMIT_MESSAGE });

/** `{ ids }` XOR `{ filter }` — anything else is a 422. `filter` takes the same parameters as the matching list (no paging/sort). */
export function bulkBodySchema<F extends z.ZodType>(filter: F) {
  return z
    .object({ ids: BulkIdsSchema.optional(), filter: filter.optional() })
    .refine(body => (body.ids === undefined) !== (body.filter === undefined), {
      message: 'Provide either ids or filter (exactly one).',
      path: ['ids'],
    });
}

export interface BulkResult {
  id: string;
  ok: boolean;
  /** D-0171: `false` when the record was already in the target state (nothing was done, no realtime event) and for every refusal; `true` when the action really changed it. */
  changed: boolean;
  /** D-0171: a human-readable name for the record (vehicle name, driver "first last", yard/geofence name, trip reference) — `null` when the record does not exist or has no name. */
  label: string | null;
  message: string;
}

/** What one record's action reports: its message, and whether it really changed anything (default `true`). */
export interface BulkOutcome {
  message?: string;
  changed?: boolean;
}

export interface BulkTargets {
  ids: string[];
  mode: 'ids' | 'filter';
  matched: number;
}

/** Ids as given (deduplicated, as strings), or the records matching the filter — refused with a 422 when more than `BULK_LIMIT` match. */
export async function resolveBulkTargets(
  body: { ids?: (string | number)[] | undefined },
  fetchByFilter: () => Promise<{ ids: string[]; total: number }>
): Promise<BulkTargets> {
  if (body.ids) {
    const ids = [...new Set(body.ids.map(id => String(id)))];
    return { ids, mode: 'ids', matched: ids.length };
  }
  const { ids, total } = await fetchByFilter();
  if (total > BULK_LIMIT) {
    throw new ValidationError(
      `The filter matches ${String(total)} records; the limit is ${String(BULK_LIMIT)} per request. Narrow the filter.`
    );
  }
  return { ids, mode: 'filter', matched: total };
}

/**
 * Runs `action` for each id, one after another; an `AppError` becomes that record's `ok: false` message, anything else a generic one (and is logged).
 * `labelFor` resolves the record's display name once per id (also for refusals and unknown ids); a failing lookup just leaves the label `null`.
 */
export async function runBulk(
  ids: string[],
  action: (id: string) => Promise<BulkOutcome>,
  okMessage: string,
  labelFor?: (id: string) => Promise<string | null | undefined>
): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const id of ids) {
    const label = labelFor ? ((await labelFor(id).catch(() => null)) ?? null) : null;
    try {
      const outcome = await action(id);
      results.push({
        id,
        ok: true,
        changed: outcome.changed ?? true,
        label,
        message: outcome.message ?? okMessage,
      });
    } catch (error) {
      if (error instanceof AppError) {
        results.push({ id, ok: false, changed: false, label, message: error.message });
      } else {
        logger.warn({ err: error, id }, 'bulk action failed unexpectedly');
        results.push({ id, ok: false, changed: false, label, message: 'Unexpected error.' });
      }
    }
  }
  return results;
}

export function bulkResponse(targets: BulkTargets, results: BulkResult[]) {
  const succeeded = results.filter(result => result.ok).length;
  const changed = results.filter(result => result.changed).length;
  return {
    success: true,
    message: `${String(succeeded)} of ${String(results.length)} succeeded.`,
    data: {
      results,
      summary: {
        mode: targets.mode,
        matched: targets.matched,
        processed: results.length,
        succeeded,
        changed,
        failed: results.length - succeeded,
      },
    },
  };
}
