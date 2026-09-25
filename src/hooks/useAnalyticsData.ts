/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

interface Filters {
  from: string;
  to: string;
  days: number;
  compare: boolean;
  prev: { from: string; to: string };
}

const KEEP = { placeholderData: keepPreviousData, refetchInterval: 300000 } as const;

const failure = (q: any): string | null =>
  q.data && !q.data.success ? String(q.data.message || 'Could not load') : null;

/**
 * Data shared by the Fleet Analytics report pages (flows/07 slice 1, definition-fixed endpoints): the
 * dashboard overview for the range and the previous period, the per-day trends and — only when a page
 * asks for it — the per-vehicle performance rows. Query names start with `fleet-dashboard-an` so the
 * existing realtime rules (trip:update, fleet:changed) refetch them. Replaced by the B-series report
 * endpoints one page at a time as they are built.
 */
export interface VehicleTableQuery {
  page: number;
  perPage: number;
  search: string;
  sort: string;
  direction: 'asc' | 'desc';
}

export function useAnalyticsData(f: Filters, opts: { vehicles?: VehicleTableQuery } = {}) {
  const range = { from: f.from, to: f.to, fleet_only: 1 };
  const current = useSimpleQuery<any>(
    'fleet-dashboard-an-current',
    '/api/fleet/dashboard',
    range,
    KEEP
  );
  const previous = useSimpleQuery<any>(
    'fleet-dashboard-an-previous',
    '/api/fleet/dashboard',
    { from: f.prev.from, to: f.prev.to, fleet_only: 1 },
    { ...KEEP, enabled: f.compare }
  );
  const trends = useSimpleQuery<any>(
    'fleet-dashboard-an-trends',
    '/api/fleet/dashboard/trends',
    { from: f.from, to: f.to, interval: f.days > 92 ? 'week' : 'day' },
    KEEP
  );
  const previousTrends = useSimpleQuery<any>(
    'fleet-dashboard-an-trends-previous',
    '/api/fleet/dashboard/trends',
    { from: f.prev.from, to: f.prev.to, interval: f.days > 92 ? 'week' : 'day' },
    { ...KEEP, enabled: f.compare }
  );
  const vehicles = useSimpleQuery<any>(
    'fleet-dashboard-an-vehicles',
    '/api/fleet/dashboard/vehicle-performance',
    {
      from: f.from,
      to: f.to,
      ...(opts.vehicles
        ? {
            page: opts.vehicles.page,
            per_page: opts.vehicles.perPage,
            sort: opts.vehicles.sort,
            direction: opts.vehicles.direction,
            ...(opts.vehicles.search ? { search: opts.vehicles.search } : {}),
          }
        : {}),
    },
    { ...KEEP, enabled: !!opts.vehicles }
  );

  const ok = (q: any) => (q.data?.success ? q.data : null);
  const all = [current, previous, trends, previousTrends, ...(opts.vehicles ? [vehicles] : [])];

  return {
    overview: ok(current)?.data ?? null,
    overviewMeta: ok(current)?.meta ?? null,
    previousOverview: f.compare ? (ok(previous)?.data ?? null) : null,
    trends: ok(trends)?.data ?? null,
    previousTrends: f.compare ? (ok(previousTrends)?.data ?? null) : null,
    // A8: paging is opt-in — with `page` the data is { items, pagination } (server-paged, sorted, searched).
    vehicles: (ok(vehicles)?.data?.items ?? []) as any[],
    vehiclesTotal: (ok(vehicles)?.data?.pagination?.total ?? 0) as number,
    vehiclesFetching: vehicles.isFetching,
    loading: {
      overview: current.isLoading,
      trends: trends.isLoading,
      vehicles: vehicles.isLoading,
    },
    error: {
      overview: failure(current),
      trends: failure(trends),
      vehicles: failure(vehicles),
    },
    fetching: all.some(q => q.isFetching),
    refetchAll: () => all.forEach(q => q.refetch()),
  };
}
