/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  COMPANY_ID,
  positionModels,
  scheduleModels,
  showcaseNow,
  vehicleModels,
  yards,
  geofenceEvents,
} from './dataset';
import {
  aggregate,
  attentionItems,
  bucketList,
  bucketOf,
  dayStr,
  daysBetween,
  fleetStatus,
  performance,
  posState,
  round,
} from './metrics';
import { DAY, iso, ymd } from './rng';
import { simulatedPositions } from './simulation';

export const TZ = 'Asia/Karachi';

type Params = Record<string, any>;
type Row = Record<string, any>;

export const ok = (data: unknown, extra: Row = {}, message = 'OK') => ({
  success: true,
  message,
  data,
  ...extra,
});
export const meta = (from: string, to: string, extra: Row = {}) => ({
  from,
  to,
  timezone: TZ,
  generated_at: iso(showcaseNow()),
  ...extra,
});

export const range = (p: Params) => {
  const to = String(p.to ?? ymd(showcaseNow()));
  const from = String(p.from ?? ymd(Date.parse(to) - 29 * DAY));

  return { from, to, days: daysBetween(from, to) };
};
export const previousRange = (from: string, to: string, mode?: string) => {
  const n = daysBetween(from, to).length;

  if (mode === 'previous_year') {
    const shift = (d: string) => ymd(Date.parse(d) - 365 * DAY);

    return { from: shift(from), to: shift(to) };
  }

  return { from: ymd(Date.parse(from) - n * DAY), to: ymd(Date.parse(from) - DAY) };
};

const dashboard = (p: Params) => {
  const { from, to, days } = range(p);
  const a = aggregate(days);
  const fs = fleetStatus();
  const trips = a.trips;
  const att = attentionItems();
  const plannedKm = a.completed.reduce((x, t) => x + t.planned_distance_km, 0);
  const actualKm = a.completed.reduce((x, t) => x + t.actual_distance_km, 0);
  const avgDur = a.completed.length
    ? a.completed.reduce((x, t) => x + t.actual_duration_minutes, 0) / a.completed.length
    : 0;
  const count = (s: string) => trips.filter(t => t.status === s).length;

  return ok(
    {
      fleet_status: {
        total: fs.total,
        moving: fs.by.moving,
        idle: fs.by.idle,
        parked: fs.by.parked,
        offline: fs.by.offline,
        no_tracker: fs.by.no_tracker,
        unknown: 0,
        active_trips: count('in_progress'),
      },
      trips: {
        total: trips.length,
        completed: count('completed'),
        in_progress: count('in_progress'),
        cancelled: count('cancelled'),
        planned: count('planned'),
        planned_distance_km: Math.round(plannedKm),
        actual_distance_km: Math.round(actualKm),
        distance_variance_km: round(actualKm - plannedKm),
        distance_variance_sample: a.completed.length,
        on_time_pct: round(a.onTimePct),
        on_time_sample: a.onTimeSample,
        avg_duration_minutes: Math.round(avgDur),
      },
      alerts: {
        total: att.length,
        critical: att.filter(i => i.severity === 'critical').length,
        warning: att.filter(i => i.severity === 'warning').length,
        info: 0,
        offline_vehicles: fs.by.offline,
        expiring_documents: 0,
        expiring_driver_licences: att.filter(i => i.type === 'licence_expiring').length,
      },
      utilisation: {
        rate: round(a.utilisation, 2),
        driving_hours: round(a.drive),
        idle_hours: round(a.idle),
        parked_hours: round(Math.max(0, a.available - a.drive - a.idle)),
        distance_km: round(a.km),
        available_hours: Math.round(a.available),
        basis: 'telemetry',
        vehicles_in_scope: vehicleModels.filter(v => v.status === 'active').length,
        scheduled_hours_per_day: 12,
      },
      fuel: {
        used_liters: Math.round(a.liters),
        total_cost: Math.round(a.fuelCost),
        average_efficiency_km_per_liter: round(a.economy, 2),
        efficiency_basis: 'full_tank',
        cost_per_km: a.km ? round(a.fuelCost / a.km, 2) : null,
        idle_fuel_liters: Math.round(a.idle * 2.1),
      },
      financial: {
        revenue: Math.round(a.revenue),
        total_cost: Math.round(a.totalCost),
        profit: Math.round(a.revenue - a.totalCost),
        margin: round(((a.revenue - a.totalCost) / a.revenue) * 100),
        outstanding: Math.round(a.revenue * 0.31),
        overdue: Math.round(a.revenue * 0.07),
        cost_breakdown: {
          fuel: Math.round(a.fuelCost),
          maintenance: Math.round(a.maint),
          driver: Math.round(a.driver),
          tolls: Math.round(a.tolls),
          other: Math.round(a.other),
        },
      },
    },
    { meta: meta(from, to) }
  );
};

const trends = (p: Params) => {
  const { from, to, days } = range(p);
  const interval = String(p.interval ?? 'day');
  const buckets = bucketList(from, to, interval);
  const per = buckets.map(b => ({
    b,
    a: aggregate(days.filter(d => bucketOf(d, interval) === b)),
  }));

  return ok(
    {
      utilisation: per.map(({ b, a }) => ({
        date: b,
        rate: round(a.utilisation, 2),
        hours: round(a.drive),
      })),
      distance: per.map(({ b, a }) => ({ date: b, km: Math.round(a.km) })),
      fuel: per.map(({ b, a }) => ({
        date: b,
        liters: Math.round(a.liters),
        cost: Math.round(a.fuelCost),
      })),
      trips: per.map(({ b, a }) => ({
        date: b,
        total: a.trips.length,
        completed: a.trips.filter(t => t.status === 'completed').length,
        cancelled: a.trips.filter(t => t.status === 'cancelled').length,
      })),
    },
    { meta: meta(from, to, { interval }) }
  );
};

export const kpi = (
  value: number | null,
  previous: number | null,
  target: number | null = null
) => ({
  value,
  previous,
  delta_abs: value != null && previous != null ? round(value - previous, 2) : null,
  delta_pct: value != null && previous ? round(((value - previous) / previous) * 100, 1) : null,
  target,
});

const summary = (p: Params) => {
  const { from, to, days } = range(p);
  const interval = String(p.interval ?? 'day');
  const cur = aggregate(days);
  const compare = p.compare && p.compare !== 'none';
  const pr = previousRange(from, to, p.compare);
  const prev = compare ? aggregate(daysBetween(pr.from, pr.to)) : null;
  const att = attentionItems().filter(i => i.severity !== 'info').length;
  const fleetVeh = vehicleModels.filter(v => v.status !== 'retired' && v.status !== 'sold');
  const avail = (fleetVeh.filter(v => v.status === 'active').length / fleetVeh.length) * 100;

  return ok(
    {
      summary: {
        fleet_availability: kpi(round(avail), compare ? round(avail - 1.9) : null),
        utilisation: kpi(round(cur.utilisation, 1), prev ? round(prev.utilisation, 1) : null),
        on_time_pct: kpi(round(cur.onTimePct), prev ? round(prev.onTimePct) : null),
        cost_per_km: kpi(round(cur.costPerKm, 2), prev ? round(prev.costPerKm, 2) : null),
        fuel_economy: kpi(round(cur.economy, 2), prev ? round(prev.economy, 2) : null),
        open_issues: kpi(att, compare ? att + 4 : null),
      },
      series: bucketList(from, to, interval).map(b => {
        const a = aggregate(days.filter(d => bucketOf(d, interval) === b));

        return {
          bucket: b,
          utilisation: round(a.utilisation, 1),
          on_time_pct: round(a.onTimePct),
          cost_per_km: round(a.costPerKm, 2),
          fuel_economy: round(a.economy, 2),
        };
      }),
      previous_period: compare ? pr : null,
    },
    {
      meta: meta(from, to, {
        interval,
        compare: p.compare ?? 'none',
        definition_version: 1,
        data_quality: {
          vehicles_total: fleetVeh.length,
          vehicles_with_tracker: fleetVeh.filter(v => v.tracker).length,
          basis: {
            utilisation: 'telemetry',
            on_time_pct: 'trips',
            cost_per_km: 'trips + fuel logs + maintenance logs',
            fuel_economy: 'full_tank',
            fleet_availability: 'current lifecycle status',
            open_issues: 'attention feed (critical + warning)',
          },
        },
      }),
    }
  );
};

const attention = (p: Params) => {
  const all = attentionItems();
  const rows = p.severity ? all.filter(i => i.severity === p.severity) : all;
  const per = Number(p.per_page) || 50;
  const page = Number(p.page) || 1;
  const types = [
    'alarm',
    'maintenance_overdue',
    'maintenance_due_soon',
    'document_expired',
    'document_expiring',
    'licence_expired',
    'licence_expiring',
    'vehicle_offline',
    'incident_severe',
    'trip_at_risk',
    'yard_long_stay',
  ];

  return ok(
    {
      items: rows.slice((page - 1) * per, page * per),
      pagination: {
        page,
        per_page: per,
        total: rows.length,
        total_pages: Math.max(1, Math.ceil(rows.length / per)),
      },
    },
    {
      meta: {
        counts: {
          total: all.length,
          by_severity: {
            critical: all.filter(i => i.severity === 'critical').length,
            warning: all.filter(i => i.severity === 'warning').length,
            info: 0,
          },
          by_type: Object.fromEntries(types.map(t => [t, all.filter(i => i.type === t).length])),
        },
        generated_at: iso(showcaseNow()),
        rules: {
          expiryWindowDays: 30,
          offlineHours: 24,
          incidentDays: 7,
          tripLookaheadHours: 24,
          defaultYardDays: 7,
        },
      },
    }
  );
};

const statusSummary = () => {
  const fs = fleetStatus();
  const cats = [
    ...new Set(
      vehicleModels
        .filter(v => v.status === 'active' || v.status === 'in_maintenance')
        .map(v => v.category)
    ),
  ];
  const withTracker = vehicleModels.filter(
    v => v.tracker && (v.status === 'active' || v.status === 'in_maintenance')
  ).length;

  return ok(
    {
      total: fs.total,
      by_status: fs.by,
      by_category: cats.map(c => {
        const vs = vehicleModels.filter(
          v => v.category === c && (v.status === 'active' || v.status === 'in_maintenance')
        );
        const row: Row = {
          category: c,
          total: vs.length,
          moving: 0,
          idle: 0,
          parked: 0,
          offline: 0,
          no_tracker: 0,
        };

        vs.forEach(v => {
          row[v.tracker ? (fs.stateOf.get(v.id) ?? 'parked') : 'no_tracker']++;
        });

        return row;
      }),
      coverage: {
        with_tracker: withTracker,
        no_tracker: fs.total - withTracker,
        tracker_pct: round((withTracker / fs.total) * 100),
      },
      active_trips: 8,
    },
    { meta: { timezone: TZ, position_freshness_minutes: 15, generated_at: iso(showcaseNow()) } }
  );
};

const positions = (p: Params) => {
  let rows = simulatedPositions();

  if (p.bbox) {
    const [x0, y0, x1, y1] = String(p.bbox).split(',').map(Number);

    rows = rows.filter(
      r => r.longitude >= x0 && r.longitude <= x1 && r.latitude >= y0 && r.latitude <= y1
    );
  }
  rows.sort((a, b) => a.age_seconds - b.age_seconds);
  const limit = Number(p.limit) || 500;

  return ok(rows.slice(0, limit), {
    meta: { total: rows.length, limit, truncated: rows.length > limit },
  });
};

const yardAnalytics = (p: Params) => {
  const { from, to, days } = range(p);
  const interval = String(p.interval ?? 'day');
  const inR = (d: string) => days.includes(Math.floor(Date.parse(d) / DAY));
  const rows = yards.map((y, i) => {
    const ev = geofenceEvents.filter(e => e.geofence.yard_id === y.id && inR(e.occurred_at));
    const ins = ev.filter(e => e.event_type === 'enter').length;
    const occ = Math.min(
      y.slots_count,
      Math.round(y.slots_count * (0.42 + (0.5 * ((i * 37) % 10)) / 10))
    );

    return {
      yard_id: y.id,
      name: y.name,
      is_active: true,
      slots_total: y.slots_count,
      occupied_now: occ,
      occupancy_pct: round((occ / y.slots_count) * 100),
      check_ins: ins,
      check_outs: ev.length - ins,
      avg_dwell_minutes: 90 + ((i * 53) % 240),
      longest_dwell_minutes: 300 + ((i * 97) % 900),
      longest_open_stay_minutes: 200 + ((i * 131) % 2400),
    };
  });
  const key = p.sort_by ?? 'occupancy_pct';
  const dir = p.sort_order === 'asc' ? 1 : -1;

  rows.sort((a, b) => ((a as any)[key] > (b as any)[key] ? 1 : -1) * dir);
  const per = Number(p.per_page) || 20;
  const page = Number(p.page) || 1;
  const slots = rows.reduce((a, r) => a + r.slots_total, 0);
  const occ = rows.reduce((a, r) => a + r.occupied_now, 0);
  const ins = rows.reduce((a, r) => a + r.check_ins, 0);

  return ok(
    {
      summary: {
        yards_total: rows.length,
        slots_total: slots,
        occupied_now: occ,
        occupancy_pct: round((occ / slots) * 100),
        check_ins: ins,
        check_outs: rows.reduce((a, r) => a + r.check_outs, 0),
        avg_dwell_minutes: 168,
        longest_dwell_minutes: 1140,
      },
      series: bucketList(from, to, interval).map(b => {
        const ev = geofenceEvents.filter(
          e =>
            e.geofence.yard_id &&
            inR(e.occurred_at) &&
            bucketOf(Math.floor(Date.parse(e.occurred_at) / DAY), interval) === b
        );
        const i2 = ev.filter(e => e.event_type === 'enter').length;

        return { bucket: b, check_ins: i2, check_outs: ev.length - i2 };
      }),
      table: {
        items: rows.slice((page - 1) * per, page * per),
        pagination: {
          page,
          per_page: per,
          total: rows.length,
          total_pages: Math.max(1, Math.ceil(rows.length / per)),
        },
      },
    },
    {
      meta: meta(from, to, {
        interval,
        definition_version: 1,
        basis: {
          occupancy: 'open yard stays now ÷ slots (a point-in-time metric)',
          dwell: 'stays checked out within the period, check-out minus check-in',
        },
      }),
    }
  );
};

const geofenceSummary = (p: Params) => {
  const { from, to, days } = range(p);
  const interval = String(p.interval ?? 'day');
  const inR = (d: string) => days.includes(Math.floor(Date.parse(d) / DAY));
  const ev = geofenceEvents.filter(e => inR(e.occurred_at));
  const bucketOfEv = (e: Row) =>
    interval === 'hour'
      ? e.occurred_at.slice(0, 13) + ':00:00.000Z'
      : bucketOf(Math.floor(Date.parse(e.occurred_at) / DAY), interval);
  const buckets =
    interval === 'hour' ? [...new Set(ev.map(bucketOfEv))].sort() : bucketList(from, to, interval);
  const series = buckets.map(b => {
    const x = ev.filter(e => bucketOfEv(e) === b);
    const en = x.filter(e => e.event_type === 'enter').length;

    return { bucket: b, enter: en, exit: x.length - en, total: x.length };
  });
  const busiest = series.reduce((m, s) => (s.total > m.total ? s : m), {
    bucket: from,
    total: 0,
  } as any);
  const top = Object.values(
    ev.reduce((m: Row, e) => {
      const r = (m[e.geofence_id] ??= {
        geofence_id: e.geofence_id,
        name: e.geofence.name,
        yard_id: e.geofence.yard_id,
        enter: 0,
        exit: 0,
        total: 0,
      });

      r[e.event_type]++;
      r.total++;

      return m;
    }, {})
  ).sort((a: any, b: any) => b.total - a.total);

  return ok(
    {
      summary: {
        total: ev.length,
        enter: ev.filter(e => e.event_type === 'enter').length,
        exit: ev.filter(e => e.event_type === 'exit').length,
        geofences_with_events: top.length,
        vehicles_involved: new Set(ev.map(e => e.vehicle_id)).size,
        busiest_bucket: { bucket: busiest.bucket, total: busiest.total },
      },
      series,
      top_geofences: top.slice(0, Number(p.top) || 3),
    },
    {
      meta: meta(from, to, {
        interval,
        definition_version: 1,
        basis: {
          events: 'real transitions shown by GET /geofences/events',
          bucket: 'occurred_at in the company timezone',
        },
      }),
    }
  );
};

const FLEET_OPTIONS = {
  fuel_types: ['diesel', 'petrol', 'electric', 'hybrid', 'lpg'],
  ownership_types: ['owned', 'leased', 'rented'],
  employment_statuses: ['full_time', 'part_time', 'contractor', 'terminated'],
  availability_statuses: ['available', 'on_trip', 'on_leave', 'off_duty'],
  vehicle_categories: ['Bus', 'Pickup', 'Semi-Trailer', 'Tanker', 'Trailer', 'Truck', 'Van'],
};

const settings = () =>
  ok({
    timezone: TZ,
    position_freshness_minutes: 15,
    idle_threshold_minutes: 5,
    scheduled_hours_per_vehicle_per_day: 12,
    on_time_grace_minutes: 15,
    maintenance_due_soon_days: 14,
    maintenance_due_soon_km: 1000,
    utilisation_target_pct: 60,
    on_time_target_pct: 85,
    cost_per_km_target: 95,
    idle_limit_pct: 20,
    fuel_economy_target: 3.2,
    unit_system: 'metric',
    is_default: false,
    created_at: iso(showcaseNow() - 200 * DAY),
    updated_at: iso(showcaseNow() - 9 * DAY),
    updated_by: '2',
    updated_by_user: { id: '2', first_name: 'Junead', last_name: 'Chaminade' },
  });

const company = () =>
  ok({
    id: COMPANY_ID,
    name: 'Indus Freight Co.',
    email: 'ops@indusfreight.pk',
    address: 'Plot 14, Korangi Industrial Area',
    city: 'Karachi',
    state: 'Sindh',
    country: 'PK',
    zip_code: '74900',
    currency: 'PKR',
    created_at: iso(showcaseNow() - 400 * DAY),
    updated_at: iso(showcaseNow() - 30 * DAY),
    users: [],
    products: [],
  });

export function resolveFleet(url: string, p: Params): any | undefined {
  switch (url) {
    case '/api/fleet/dashboard':
      return dashboard(p);
    case '/api/fleet/dashboard/trends':
      return trends(p);
    case '/api/fleet/dashboard/vehicle-performance': {
      const { from, to, days } = range(p);
      const key = p.sort ?? 'distance_km';
      const dir = p.direction === 'asc' ? 1 : -1;
      const rows = performance(days).sort(
        (a: any, b: any) => ((a[key] ?? -1) > (b[key] ?? -1) ? 1 : -1) * dir
      );
      const per = Number(p.per_page) || 20;
      const page = Number(p.page) || 1;

      return ok(
        {
          items: rows.slice((page - 1) * per, page * per),
          pagination: {
            page,
            per_page: per,
            total: rows.length,
            total_pages: Math.max(1, Math.ceil(rows.length / per)),
          },
        },
        {
          meta: {
            from,
            to,
            timezone: TZ,
            sort: key,
            direction: p.direction ?? 'desc',
            total: rows.length,
            generated_at: iso(showcaseNow()),
          },
        }
      );
    }
    case '/api/fleet/analytics/summary':
      return summary(p);
    case '/api/fleet/analytics/yards':
      return yardAnalytics(p);
    case '/api/fleet/attention':
      return attention(p);
    case '/api/fleet/status-summary':
      return statusSummary();
    case '/api/fleet/positions':
      return positions(p);
    case '/api/fleet/options':
      return ok(FLEET_OPTIONS);
    case '/api/fleet/settings':
      return settings();
    case `/api/companies/${COMPANY_ID}`:
      return company();
    case '/api/geofences/events/summary':
      return geofenceSummary(p);
    default:
      return undefined;
  }
}

export { dayStr, posState, scheduleModels };
