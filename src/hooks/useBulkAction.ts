/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { post } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';

export interface BulkFailure {
  id: string | number;
  name: string;
  message: string;
}

export interface BulkResult {
  label: string;
  done: number;
  failures: BulkFailure[];
}

export type BulkKind = 'vehicles' | 'drivers' | 'yards' | 'trips' | 'geofences';
export type BulkAction = 'deactivate' | 'reactivate' | 'delete' | 'enable' | 'disable';

/** Exactly one of: the ids the operator ticked, or the list's own filter ("all N matching"). */
export type BulkTarget = { ids: (string | number)[] } | { filter: Record<string, unknown> };

/** Wording for "already in the target state" (backend skips those: ok, changed = false — flows/06 §17.3). */
const ALREADY: Record<BulkAction, string> = {
  deactivate: 'already deactivated',
  reactivate: 'already active',
  delete: 'already gone',
  enable: 'already enabled',
  disable: 'already disabled',
};

const VERB: Record<BulkAction, string> = {
  deactivate: 'Deactivated',
  reactivate: 'Reactivated',
  delete: 'Deleted',
  enable: 'Enabled',
  disable: 'Disabled',
};

/**
 * Bulk actions on backend's bulk endpoints (flows/06 §13): `POST /{kind}/bulk-{action}` with
 * `{ ids }` or `{ filter }`, at most 500 records per request. Backend runs every record through the
 * same single-record action (same guards, same fixed messages) and always answers HTTP 200 with a
 * per-record `{ id, ok, message }`; a refused record never aborts the batch. Only a malformed or
 * over-cap request is a 422 (e.g. "The filter matches N records; the limit is 500 per request.
 * Narrow the filter.") — shown as-is, nothing was processed.
 */
export function useBulkAction(kind: BulkKind, entityLabel: string) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  /**
   * `targets` is one request or several (e.g. "reactivate all matching vehicles" is two: retired and
   * sold), run one after another and reported as one result. `names` maps id → display name for the
   * refusal list (filter mode can only show "#id").
   */
  const run = async (
    action: BulkAction,
    targets: BulkTarget | BulkTarget[],
    names?: Map<string, string>
  ): Promise<{ done: number; failures: BulkFailure[] } | null> => {
    setRunning(true);
    setResult(null);

    let done = 0;
    let skipped = 0;
    const failures: BulkFailure[] = [];

    for (const target of Array.isArray(targets) ? targets : [targets]) {
      const res: any = await post(`/api/${kind}/bulk-${action}`, target, {}, false);

      if (res?.error || res?.success === false) {
        setRunning(false);
        toast.error(res?.message || `Could not ${action}.`);
        invalidateFleetQueries(qc);

        return null;
      }

      // results[] = { id, ok, changed, label, message }: `changed` false = refused OR already in the target
      // state (skipped by the backend, no write, no realtime event); `label` = the record's name.
      const results: {
        id: string | number;
        ok: boolean;
        changed?: boolean;
        label?: string | null;
        message: string;
      }[] = res?.data?.results ?? [];

      done +=
        res?.data?.summary?.changed ?? results.filter(r => r.ok && r.changed !== false).length;
      skipped += results.filter(r => r.ok && r.changed === false).length;
      results
        .filter(r => !r.ok)
        .forEach(r =>
          failures.push({
            id: r.id,
            name: r.label ?? names?.get(String(r.id)) ?? `${entityLabel} #${r.id}`,
            message: r.message,
          })
        );
    }

    setRunning(false);
    invalidateFleetQueries(qc);

    const label =
      `${VERB[action]} ${done} ${entityLabel}${done === 1 ? '' : 's'}` +
      (skipped ? ` (${skipped} ${ALREADY[action]})` : '');

    setResult({ label, done, failures });

    if (failures.length === 0) toast.success(label);
    else toast.error(`${label}; ${failures.length} refused (see details).`);

    return { done, failures };
  };

  return { run, running, result, dismiss: () => setResult(null) };
}

const PAGING_KEYS = ['page', 'per_page', 'sort_by', 'sort_order'];

/**
 * The request(s) for a bulk action on the current selection, or `null` when there is nothing to do.
 *  - ids mode: `{ ids }` (the caller passes only the rows the action applies to);
 *  - "all matching" mode: `{ filter }` = the list's own search/filters (no paging / sort), narrowed to
 *    the rows the action can act on — backend treats reactivating an ACTIVE record (or deleting a
 *    non-planned trip) as a success / refusal, so the filter must not include them:
 *      deactivate → active only (backend default), reactivate → inactive only, trips delete → planned,
 *      geofence enable → disabled only, disable → enabled only.
 */
export function bulkTargets(
  kind: BulkKind,
  action: BulkAction,
  sel: { allMatching: boolean; ids: (string | number)[] },
  filterParams: Record<string, unknown>
): BulkTarget[] | null {
  if (!sel.allMatching) return sel.ids.length ? [{ ids: sel.ids }] : null;

  const base: Record<string, unknown> = { ...filterParams };

  PAGING_KEYS.forEach(k => delete base[k]);

  // Permanent delete (backend C14): in filter mode the backend defaults `include_inactive` to TRUE (a
  // never-used record may already be deactivated), so send the list's own value explicitly - otherwise
  // "all N matching" (which counts only what the list shows) could delete more than N records.
  if (action === 'delete' && (kind === 'vehicles' || kind === 'drivers' || kind === 'yards')) {
    return [{ filter: { ...base, include_inactive: base.include_inactive ? 1 : 0 } }];
  }

  if (kind === 'vehicles') {
    delete base.include_inactive;

    if (action === 'deactivate') return [{ filter: base }];

    // reactivate: retired and sold are two statuses (a filter takes one), so two requests.
    const status = base.status as string | undefined;

    if (status === 'retired' || status === 'sold') return [{ filter: base }];
    if (status) return null; // active / in_maintenance: nothing to reactivate

    return [{ filter: { ...base, status: 'retired' } }, { filter: { ...base, status: 'sold' } }];
  }

  if (kind === 'drivers') {
    delete base.include_inactive;

    if (action === 'deactivate') return [{ filter: base }];
    if (base.status && base.status !== 'inactive') return null;

    return [{ filter: { ...base, status: 'inactive' } }];
  }

  if (kind === 'yards') {
    delete base.include_inactive;

    if (action === 'deactivate') return [{ filter: base }];

    // reactivate: deactivated only (`is_active=0` wins over include_inactive)
    if (base.is_active !== undefined && String(base.is_active) !== '0') return null;

    return [{ filter: { ...base, is_active: 0 } }];
  }

  if (kind === 'trips') {
    // Only planned trips can be deleted; a status filter of another value leaves nothing to delete.
    if (base.status && base.status !== 'planned') return null;

    return [{ filter: { ...base, status: ['planned'] } }];
  }

  // geofences
  if (action === 'delete') return [{ filter: base }];

  const want = action === 'enable' ? 0 : 1; // only the ones that would change

  if (base.is_active !== undefined && Number(base.is_active) !== want) return null;

  return [{ filter: { ...base, is_active: want } }];
}
