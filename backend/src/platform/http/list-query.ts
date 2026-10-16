import { z } from 'zod';

/**
 * Shared building blocks for the fleet list endpoints (D-0164, B1 of
 * `flows/06-fleet-enterprise-readiness.md`). One vocabulary for every list:
 * `search`, `sort_by`/`sort_order`, `page`/`per_page`.
 *
 * Owner decision Q1: **opt-in paging** — a request that sends `page` or
 * `per_page` gets `data: { items, pagination }`; a request that sends neither
 * gets today's flat array (filters/search/sort still apply). Nothing that
 * already calls a list without paging parameters changes shape.
 */

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

/**
 * `?vehicle_id=1,2` or Express 5's `?vehicle_id[]=1&vehicle_id[]=2` (the "simple" query parser hands the latter over as a key literally named
 * `vehicle_id[]`) → a de-duplicated list of numeric id strings; anything that is not a whole number is a 422 with a fixed message.
 * `undefined` = the filter was not sent. Use `mergeIdLists(a, b)` to combine the plain and the `[]` spelling.
 */
export function idListParam(label: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const parts = (Array.isArray(value) ? value : [value])
        .flatMap(entry => entry.split(','))
        .map(entry => entry.trim())
        .filter(entry => entry !== '');
      if (parts.some(part => !/^\d+$/.test(part))) {
        ctx.addIssue({ code: 'custom', message: `The ${label} must be a list of ids.` });
        return z.NEVER;
      }
      return parts.length > 0 ? [...new Set(parts)] : undefined;
    });
}

/** `?type=a,b` or `?type[]=a&type[]=b` restricted to `allowed` (anything else is a 422 with `message`); `undefined` = not sent. */
export function enumListParam<const T extends readonly [string, ...string[]]>(
  allowed: T,
  message: string
) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value, ctx): T[number][] | undefined => {
      if (value === undefined) return undefined;
      const parts = (Array.isArray(value) ? value : [value])
        .flatMap(entry => entry.split(','))
        .map(entry => entry.trim())
        .filter(entry => entry !== '');
      if (parts.some(part => !(allowed as readonly string[]).includes(part))) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return parts.length > 0 ? ([...new Set(parts)] as T[number][]) : undefined;
    });
}

export function mergeIdLists(...lists: Array<string[] | undefined>): string[] | undefined {
  const all = lists.flatMap(list => list ?? []);
  return all.length > 0 ? [...new Set(all)] : undefined;
}

/** `?flag=1|true|0|false` (the same spelling `include_inactive` already uses). */
export const FlagSchema = z.enum(['0', '1', 'true', 'false']).optional();

export function flagValue(value: '0' | '1' | 'true' | 'false' | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === '1' || value === 'true';
}

/** The parameters every paged/searchable list accepts (spread into the list's own `z.object`). */
export const listQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  /** Trimmed; an empty/blank value means "no search". */
  search: z
    .string()
    .max(255)
    .optional()
    .transform(value => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  sort_order: z.enum(['asc', 'desc'], { error: 'The selected sort order is invalid.' }).optional(),
};

/** `sort_by` limited to one list's whitelist — anything else is a 422 with this fixed message. */
export function sortByEnum<const T extends readonly [string, ...string[]]>(fields: T) {
  return z.enum(fields, { error: 'The selected sort by is invalid.' }).optional();
}

export interface ListWindow {
  page: number;
  perPage: number;
}

/** `undefined` = the caller did not ask for paging (flat array). */
export function resolveWindow(query: {
  page?: number | undefined;
  per_page?: number | undefined;
}): ListWindow | undefined {
  if (query.page === undefined && query.per_page === undefined) return undefined;
  return { page: query.page ?? 1, perPage: query.per_page ?? DEFAULT_PER_PAGE };
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export function buildPagination(total: number, window: ListWindow): Pagination {
  return {
    page: window.page,
    per_page: window.perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / window.perPage)),
  };
}

/** Case-insensitive "contains" match (Prisma/Postgres `ILIKE '%term%'`). */
export function containsInsensitive(term: string): { contains: string; mode: 'insensitive' } {
  return { contains: term, mode: 'insensitive' };
}

/**
 * `orderBy` for a sorted list: the chosen column, then `id` in the same direction as a deterministic
 * tie-break (D-0147 — without it `LIMIT/OFFSET` can duplicate/drop rows that tie on the sort column).
 * With no `sortBy` the list keeps its historical default order.
 *
 * D-0167 (R1): an explicit `sort_by` puts NULLs **last in both directions** (Postgres would put them first on `DESC`) — pass the
 * list's nullable sort columns in `nullable` (Prisma only accepts `nulls` on nullable columns). Default orders are unchanged.
 */
export function orderByWithTieBreak(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  defaultOrder: Record<string, 'asc' | 'desc'>[],
  nullable: readonly string[] = []
): Record<string, 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls: 'last' }>[] {
  // default order: `id` follows the direction of the default's first key, so "newest first" stays newest-first among same-second rows
  if (!sortBy) return [...defaultOrder, { id: Object.values(defaultOrder[0] ?? {})[0] ?? 'asc' }];
  const direction = sortOrder ?? 'asc';
  if (sortBy === 'id') return [{ id: direction }];
  return [
    { [sortBy]: nullable.includes(sortBy) ? { sort: direction, nulls: 'last' } : direction },
    { id: direction },
  ];
}

/** Response body for a list: paged → `{ items, pagination }`, flat → the array itself. */
export function listData<T>(
  items: T[],
  total: number,
  window: ListWindow | undefined
): T[] | { items: T[]; pagination: Pagination } {
  return window ? { items, pagination: buildPagination(total, window) } : items;
}

/** `now + days` as a date-only cut-off (for "expiring within N days"), computed in UTC. */
export function dateWithinDays(days: number, now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + days * 86_400_000);
  return { from, to };
}

/** D-0165 (B2): dropdown "options" endpoints are unpaginated but capped. */
export const OPTIONS_LIMIT = 1000;

export const optionsQueryShape = {
  search: listQueryShape.search,
  /** 1–1000, default 1000. */
  limit: z.coerce.number().int().min(1).max(OPTIONS_LIMIT).optional(),
};

/** Body of an options endpoint: a flat `data` array plus `meta` so a picker can tell it was cut off (`truncated`) and switch to searching. */
export function optionsResponse<T>(message: string, items: T[], total: number, limit: number) {
  return {
    success: true,
    message,
    data: items,
    meta: { total, limit, truncated: total > items.length },
  };
}
