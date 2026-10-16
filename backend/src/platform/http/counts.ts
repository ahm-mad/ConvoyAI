/**
 * Status counts for filter chips (D-0179, fleet enterprise readiness ask B7): every status of the list always appears, `0` when nothing has it,
 * and `total` is their sum. The counts endpoints take the matching list's own filters and search but never its `status` filter, so choosing
 * one chip does not zero the others.
 */
export interface StatusCounts {
  total: number;
  by_status: Record<string, number>;
}

/** `rows` = one `{ status, count }` per status that has at least one record (a Prisma `groupBy`). */
export function statusCounts(
  statuses: readonly string[],
  rows: ReadonlyArray<{ status: string; count: number }>
): StatusCounts {
  const by_status: Record<string, number> = Object.fromEntries(statuses.map(status => [status, 0]));
  for (const row of rows) by_status[row.status] = (by_status[row.status] ?? 0) + row.count;
  return { total: Object.values(by_status).reduce((sum, n) => sum + n, 0), by_status };
}
