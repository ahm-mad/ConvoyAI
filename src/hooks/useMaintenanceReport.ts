/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

export interface MaintenanceReportQuery {
  from: string;
  to: string;
  days: number;
  compare: boolean;
  /** "year" compares with the same dates one year earlier (default: the window just before). */
  compareMode?: 'period' | 'year';
  /** Group-by interval; omitted = automatic (day ≤ 92 days, then week, then month). */
  interval?: 'day' | 'week' | 'month';
  /** Scope filters (`vehicle_category`, `vehicle_id`, `yard_id`, …) — every chart and the table follow them. */
  scope?: Record<string, unknown>;
}

/**
 * The maintenance report (backend B7, flows/07 §26.2): cost / services / cost per distance / vehicles
 * serviced with the previous period, a per-bucket cost series, cost by service type and vehicle category,
 * the costliest vehicles, plus two POINT-IN-TIME blocks (`schedules` due buckets and `fleet
 * .vehicles_in_maintenance_now`) that ignore the range. The server caps a request at 92 buckets, so the
 * interval widens with the range. Query name starts with `fleet-dashboard-an` so fleet realtime refetches it.
 */
export function useMaintenanceReport(q: MaintenanceReportQuery) {
  const interval = q.interval ?? (q.days <= 92 ? 'day' : q.days <= 644 ? 'week' : 'month');
  const query = useSimpleQuery<any>(
    'fleet-dashboard-an-maint-report',
    '/api/fleet/analytics/maintenance',
    {
      from: q.from,
      to: q.to,
      interval,
      compare: q.compare
        ? q.compareMode === 'year'
          ? 'previous_year'
          : 'previous_period'
        : 'none',
      top_service_types: 8,
      top_vehicles: 8,
      ...(q.scope ?? {}),
    },
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
  };
}
