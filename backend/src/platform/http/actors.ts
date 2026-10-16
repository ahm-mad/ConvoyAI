/**
 * The "who" half of the fleet audit fields (D-0172, ask B6): `created_by` / `updated_by` ids on a record plus the people
 * behind them as `{ id, first_name, last_name }`. The ids are written centrally (`platform/db/audit-actors.ts`); this
 * file only shapes them for responses. One batched lookup per response (a page of rows names a handful of distinct
 * users at most), never one query per row.
 *
 * A `null` id means "unknown" on a record that predates the audit columns, or "System" on `updated_by` when the last
 * change was automatic (sensor / worker) — the API does not distinguish the two; the frontend decides the wording.
 */
export interface ActorBrief {
  id: string;
  first_name: string;
  last_name: string;
}

/** Implemented by the users repository (interface-typed, not a direct import — CONVENTIONS.md "Modules"). */
export interface ActorDirectory {
  findContactsByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; firstName: string; lastName: string }>>;
}

export type ActorMap = ReadonlyMap<string, ActorBrief>;

export const NO_ACTORS: ActorMap = new Map();

export interface AuditFields {
  created_by: string | null;
  updated_by: string | null;
  created_by_user: ActorBrief | null;
  updated_by_user: ActorBrief | null;
}

/** Look every distinct, non-null id up once. A failing lookup degrades to "no names" — it never fails the response. */
export async function loadActors(
  directory: ActorDirectory,
  ids: Iterable<string | null | undefined>
): Promise<ActorMap> {
  const distinct = [
    ...new Set([...ids].filter((id): id is string => typeof id === 'string' && id !== '')),
  ];
  if (distinct.length === 0) return NO_ACTORS;
  try {
    const found = await directory.findContactsByIds(distinct);
    const map = new Map<string, ActorBrief>();
    for (const [id, user] of found)
      map.set(id, { id: user.id, first_name: user.firstName, last_name: user.lastName });
    return map;
  } catch {
    return NO_ACTORS;
  }
}

/** The four response fields for one record. */
export function auditFields(
  actors: ActorMap,
  createdBy: string | null,
  updatedBy: string | null
): AuditFields {
  return {
    created_by: createdBy,
    updated_by: updatedBy,
    created_by_user: createdBy ? (actors.get(createdBy) ?? null) : null,
    updated_by_user: updatedBy ? (actors.get(updatedBy) ?? null) : null,
  };
}

/** Collect both ids of every audited record (for one `loadActors` call). */
export function actorIdsOf(
  rows: ReadonlyArray<{ createdBy: string | null; updatedBy: string | null }>
): Array<string | null> {
  return rows.flatMap(row => [row.createdBy, row.updatedBy]);
}
