/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

/** The six expiry classes of a compliance record, against today in the company timezone. */
export type ComplianceStatus =
  'expired' | 'expiring_0_7' | 'expiring_8_30' | 'expiring_31_60' | 'valid_after_60' | 'no_expiry';

export interface ComplianceQuery {
  /** How far ahead the "expiring soon" outlook looks (7–365 days). */
  horizonDays: number;
  page: number;
  perPage: number;
  kind: 'document' | 'licence' | null;
  status: ComplianceStatus | null;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
}

/**
 * The compliance report (backend B7, flows/07 §26.4): every compliance document plus every active driver's
 * licence, each in exactly ONE expiry class, with the compliance rate, breakdowns by kind / owner / document
 * type, an outlook of what expires per week (month for a year), and a paged records table. POINT-IN-TIME:
 * there is no history, so no date range and no compare. `kind` / `status` / `search` narrow the TABLE only
 * (`meta.table_counts` counts the filtered table). Query name starts with `fleet-dashboard-an` so fleet
 * realtime refetches it.
 */
export function useComplianceReport(q: ComplianceQuery) {
  const interval = q.horizonDays > 180 ? 'month' : 'week';
  const filters = {
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { search: q.search } : {}),
    sort_by: q.sort,
    sort_order: q.direction,
  };
  const query = useSimpleQuery<any>(
    'fleet-dashboard-an-compliance',
    '/api/fleet/analytics/compliance',
    { horizon_days: q.horizonDays, interval, page: q.page, per_page: q.perPage, ...filters },
    { placeholderData: keepPreviousData, refetchInterval: 300000 }
  );
  const ok = query.data?.success ? query.data : null;

  return {
    data: (ok?.data ?? null) as any,
    meta: (ok?.meta ?? null) as any,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error:
      query.data && !query.data.success ? String(query.data.message || 'Could not load') : null,
    refetch: query.refetch,
    interval,
    /** Same filters / sort as the table, for the server CSV export (paging is ignored there). */
    exportParams: filters as Record<string, unknown>,
  };
}
