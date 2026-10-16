import { ValidationError } from '../errors/app-error.js';

/**
 * Guarded hard delete (D-0178, fleet enterprise readiness ask C14, owner Q26 "(2)" + Q27 "(a)"): vehicles, drivers and yards are deactivated
 * by default so history is never lost; a record that was NEVER USED — nothing references it — may also be deleted for real. Each repository
 * reports what still references a record as a list of human labels; an empty list means "never used".
 */

/** "trips" · "trips and fuel logs" · "trips, fuel logs and incidents". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1] ?? ''}`;
}

/** 422 `This vehicle can't be deleted because it has trips and fuel logs. Deactivate it instead.` when anything still references the record. */
export function assertNeverUsed(
  entity: 'vehicle' | 'driver' | 'yard',
  blockers: readonly string[]
): void {
  if (blockers.length === 0) return;
  throw new ValidationError(
    `This ${entity} can't be deleted because it has ${joinLabels(blockers)}. Deactivate it instead.`
  );
}
