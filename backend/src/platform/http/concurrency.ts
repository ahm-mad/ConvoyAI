import { z } from 'zod';
import { ConflictError, NotFoundError } from '../errors/app-error.js';
import { auditFields, loadActors, type ActorDirectory } from './actors.js';

/**
 * Optimistic concurrency for the fleet `PUT`s (D-0176, ask B13, owner Q19–Q22): the client sends back the `updated_at` it last saw as
 * `expected_updated_at`; if the record changed since, the edit is refused with 409 and nothing is written. **Opt-in** — a request without the
 * field behaves exactly as before.
 *
 * Precision: `updated_at` is a whole-second column (`Timestamp(0)`), so two changes inside the same second cannot be told apart, and the
 * comparison is at whole seconds. The check runs just before the write (not inside a DB lock), so a race inside the same instant can still
 * slip through — this catches the real case, an edit form open for a while, not a sub-millisecond collision.
 */
export const ExpectedUpdatedAtSchema = z.coerce.date().nullable().optional();

export const STALE_RECORD_MESSAGE =
  'This record was changed by someone else. Reload it and try again.';

interface Versioned {
  id: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const wholeSecond = (date: Date | null): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null;

/** `undefined` = no check (the client did not send the field); `null` = "I saw no `updated_at`"; a date = compare at whole seconds. */
export function isStale(expected: Date | null | undefined, current: Date | null): boolean {
  if (expected === undefined) return false;
  return wholeSecond(expected) !== wholeSecond(current);
}

/** Throws 409 `{ success:false, message, current:{ id, updated_at, updated_by, updated_by_user } }` when the record moved on; a no-op without the field. */
export async function assertNotStale(
  expected: Date | null | undefined,
  current: Versioned,
  directory: ActorDirectory
): Promise<void> {
  if (!isStale(expected, current.updatedAt)) return;
  const actors = await loadActors(directory, [current.updatedBy]);
  const audit = auditFields(actors, null, current.updatedBy);
  throw new ConflictError(STALE_RECORD_MESSAGE, {
    current: {
      id: current.id,
      updated_at: current.updatedAt,
      updated_by: audit.updated_by,
      updated_by_user: audit.updated_by_user,
    },
  });
}

/** For services that do not already hold the record: load it (only when the field was sent), 404 if missing, then `assertNotStale`. */
export async function assertFresh(
  expected: Date | null | undefined,
  load: () => Promise<Versioned | undefined>,
  notFoundMessage: string,
  directory: ActorDirectory
): Promise<void> {
  if (expected === undefined) return;
  const current = await load();
  if (!current) throw new NotFoundError(notFoundMessage);
  await assertNotStale(expected, current, directory);
}
