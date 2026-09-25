/* eslint-disable @typescript-eslint/no-explicit-any */
import { keepPreviousData } from '@tanstack/react-query';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { addDays } from '@components/analytics/format';

interface Filters {
  from: string;
  to: string;
  today: string;
  days: number;
  compare: boolean;
  compareMode?: 'period' | 'year';
  prev: { from: string; to: string };
}

const KEEP = { placeholderData: keepPreviousData, refetchInterval: 300000 } as const;

/**
 * Data for the new Fleet Overview (flows/07). Real endpoints only where the backend already returns correct,
 * definition-fixed numbers (A1–A7, slice 1): the dashboard overview for the range and the previous period,
 * trends, vehicle counts, alerts, expiring documents / licences, vehicle performance, incidents. Query names
 * start with `fleet-dashboard-ov` so the existing realtime rules (trip:update, fleet:changed) refetch them.
 * Everything a later slice replaces (B1 KPI summary, B2 attention feed, B3 status summary …) is isolated
 * here, so swapping it is a one-file change.
 */
export function useOverviewData(f: Filters, opts: { severity?: string; rankBy?: string } = {}) {
  const range = { from: f.from, to: f.to, fleet_only: 1 };
  const weekly = f.days > 92;

  const current = useSimpleQuery<any>(
    'fleet-dashboard-ov-current',
    '/api/fleet/dashboard',
    range,
    KEEP
  );
  const previous = useSimpleQuery<any>(
    'fleet-dashboard-ov-previous',
    '/api/fleet/dashboard',
    { from: f.prev.from, to: f.prev.to, fleet_only: 1 },
    { ...KEEP, enabled: f.compare }
  );
  const trends = useSimpleQuery<any>(
    'fleet-dashboard-ov-trends',
    '/api/fleet/dashboard/trends',
    { from: f.from, to: f.to, interval: weekly ? 'week' : 'day' },
    KEEP
  );
  // Trailing 14 days for the KPI sparklines, independent of the selected range.
  const spark = useSimpleQuery<any>(
    'fleet-dashboard-ov-spark',
    '/api/fleet/dashboard/trends',
    { from: addDays(f.today, -13), to: f.today, interval: 'day' },
    KEEP
  );
  const counts = useSimpleQuery<any>('vehicles-counts-ov', '/api/vehicles/counts', {}, KEEP);
  // Compliance (backend C4): every document is in exactly ONE of six expiry buckets, per owner type.
  const docCounts = useSimpleQuery<any>(
    'fleet-dashboard-ov-doccounts',
    '/api/compliance-documents/counts',
    {},
    KEEP
  );
  // Driver licences: the drivers list filtered by `license_state` — only the totals are read (per_page 1).
  const licence = (state: string) =>
    useSimpleQuery<any>(
      `drivers-ov-licence-${state}`,
      '/api/drivers',
      { license_state: state, per_page: 1, page: 1 },
      KEEP
    );
  const licExpired = licence('expired');
  const licExpiring = licence('expiring');
  const licValid = licence('valid');
  // Yard occupancy + check-ins (B9): busiest first, 8 rows. Occupancy is point-in-time; check-ins follow the range.
  const yards = useSimpleQuery<any>(
    'fleet-dashboard-ov-yards',
    '/api/fleet/analytics/yards',
    {
      from: f.from,
      to: f.to,
      interval: f.days <= 92 ? 'day' : f.days <= 644 ? 'week' : 'month',
      sort_by: 'occupancy_pct',
      sort_order: 'desc',
      per_page: 8,
      page: 1,
    },
    KEEP
  );
  // Geofence activity (B9): hourly for a day or two, otherwise per day / week / month (hour is capped at 7 days).
  const geoInterval =
    f.days <= 2 ? 'hour' : f.days <= 92 ? 'day' : f.days <= 644 ? 'week' : 'month';
  const geofences = useSimpleQuery<any>(
    'fleet-dashboard-ov-geofences',
    '/api/geofences/events/summary',
    { from: f.from, to: f.to, interval: geoInterval, top: 3 },
    KEEP
  );
  const perf = useSimpleQuery<any>(
    'fleet-dashboard-ov-perf',
    '/api/fleet/dashboard/vehicle-performance',
    // Top 6 by the chosen metric, ranked on the server (A8) — never the whole vehicle table.
    {
      from: f.from,
      to: f.to,
      page: 1,
      per_page: 6,
      sort: opts.rankBy ?? 'distance_km',
      direction: 'desc',
    },
    KEEP
  );
  const incidents = useSimpleQuery<any>(
    'fleet-dashboard-ov-incidents',
    '/api/incidents',
    { date_from: addDays(f.today, -55), date_to: f.today, per_page: 100, page: 1 },
    KEEP
  );

  // Server-side numbers (flows/07 slice 2): the six KPI tiles with value / previous / delta / target and the
  // per-bucket series (B1), the attention feed (B2), the status summary (B3, live on `fleet:status_summary`)
  // and the company-wide maintenance schedules with their computed due state (C1). Buckets are capped at 92.
  const interval = f.days <= 92 ? 'day' : f.days <= 644 ? 'week' : 'month';
  const summary = useSimpleQuery<any>(
    'fleet-dashboard-ov-summary',
    '/api/fleet/analytics/summary',
    {
      from: f.from,
      to: f.to,
      interval,
      compare: f.compare
        ? f.compareMode === 'year'
          ? 'previous_year'
          : 'previous_period'
        : 'none',
    },
    KEEP
  );
  const attention = useSimpleQuery<any>(
    'fleet-dashboard-ov-attention',
    '/api/fleet/attention',
    { per_page: 50, page: 1, ...(opts.severity ? { severity: opts.severity } : {}) },
    KEEP
  );
  const status = useSimpleQuery<any>(
    'fleet-dashboard-ov-status',
    '/api/fleet/status-summary',
    {},
    KEEP
  );
  const schedules = useSimpleQuery<any>(
    'fleet-dashboard-ov-schedules',
    '/api/maintenance-schedules',
    { per_page: 1, page: 1 },
    KEEP
  );

  const ok = (q: any) => (q.data?.success ? q.data : null);
  const all = [
    summary,
    attention,
    status,
    schedules,
    current,
    previous,
    trends,
    spark,
    counts,
    docCounts,
    licExpired,
    licExpiring,
    licValid,
    yards,
    geofences,
    perf,
    incidents,
  ];

  return {
    overview: ok(current)?.data ?? null,
    overviewMeta: ok(current)?.meta ?? null,
    previousOverview: f.compare ? (ok(previous)?.data ?? null) : null,
    trends: ok(trends)?.data ?? null,
    spark: ok(spark)?.data ?? null,
    vehicleCounts: ok(counts)?.data ?? null,
    docCounts: ok(docCounts)?.data ?? null,
    expiredLicenceTotal: (ok(licExpired)?.data?.pagination?.total ?? 0) as number,
    expiringLicenceTotal: (ok(licExpiring)?.data?.pagination?.total ?? 0) as number,
    validLicenceTotal: (ok(licValid)?.data?.pagination?.total ?? 0) as number,
    yards: ok(yards)?.data ?? null,
    geofenceSummary: ok(geofences)?.data ?? null,
    geofenceInterval: geoInterval,
    summary: ok(summary)?.data ?? null,
    summaryMeta: ok(summary)?.meta ?? null,
    attention: (ok(attention)?.data?.items ?? []) as any[],
    attentionCounts: ok(attention)?.meta?.counts ?? null,
    statusSummary: ok(status)?.data ?? null,
    scheduleCounts: ok(schedules)?.meta?.counts ?? null,
    performance: (ok(perf)?.data?.items ?? []) as any[],
    incidents: (ok(incidents)?.data?.items ?? []) as any[],
    loading: {
      overview: current.isLoading,
      trends: trends.isLoading,
      spark: spark.isLoading,
      counts: counts.isLoading,
      summary: summary.isLoading,
      status: status.isLoading,
      schedules: schedules.isLoading,
      compliance:
        docCounts.isLoading || licExpired.isLoading || licExpiring.isLoading || licValid.isLoading,
      yards: yards.isLoading,
      geofences: geofences.isLoading,
      attention: attention.isLoading,
      perf: perf.isLoading,
      incidents: incidents.isLoading,
    },
    error: {
      overview:
        current.data && !current.data.success
          ? String(current.data.message || 'Could not load')
          : null,
      trends:
        trends.data && !trends.data.success
          ? String(trends.data.message || 'Could not load')
          : null,
      perf: perf.data && !perf.data.success ? String(perf.data.message || 'Could not load') : null,
      summary:
        summary.data && !summary.data.success
          ? String(summary.data.message || 'Could not load')
          : null,
      attention:
        attention.data && !attention.data.success
          ? String(attention.data.message || 'Could not load')
          : null,
      yards:
        yards.data && !yards.data.success ? String(yards.data.message || 'Could not load') : null,
      geofences:
        geofences.data && !geofences.data.success
          ? String(geofences.data.message || 'Could not load')
          : null,
      status:
        status.data && !status.data.success
          ? String(status.data.message || 'Could not load')
          : null,
    },
    fetching: all.some(q => q.isFetching),
    refetchAll: () => all.forEach(q => q.refetch()),
  };
}
