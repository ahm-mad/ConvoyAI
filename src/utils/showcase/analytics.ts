/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  complianceDocs,
  driverModels,
  maintenanceLogModels,
  scheduleModels,
  showcaseNow,
  vehicleModels,
} from './dataset';
import { TZ, kpi, meta, ok, previousRange, range } from './fleet';
import {
  activeIdx,
  aggregate,
  bucketList,
  bucketOf,
  dayStr,
  daysBetween,
  fuelPrice,
  round,
  tripDate,
  vehDay,
} from './metrics';
import { DAY, iso, makeRng, ymd } from './rng';

type Params = Record<string, any>;
type Row = Record<string, any>;

const pageOf = (rows: Row[], p: Params) => {
  const per = Number(p.per_page) || 10;
  const page = Number(p.page) || 1;

  return {
    items: rows.slice((page - 1) * per, page * per),
    pagination: {
      page,
      per_page: per,
      total: rows.length,
      total_pages: Math.max(1, Math.ceil(rows.length / per)),
    },
  };
};

const sorted = (rows: Row[], p: Params, fallback: string, dir = 'desc') => {
  const key = p.sort_by ?? fallback;
  const d = (p.sort_order ?? dir) === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];

    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;

    return (x > y ? 1 : x < y ? -1 : 0) * d;
  });
};

const searchRows = (rows: Row[], q: unknown, keys: (r: Row) => string) => {
  const s = String(q ?? '')
    .trim()
    .toLowerCase();

  return s ? rows.filter(r => keys(r).toLowerCase().includes(s)) : rows;
};

const vehById = new Map(vehicleModels.map(v => [v.id, v]));
const scopeOk = (vehicleId: string | null, p: Params) => {
  const v = vehicleId ? vehById.get(vehicleId) : null;

  if (p.vehicle_id && vehicleId !== String(p.vehicle_id)) return false;
  if (p.vehicle_category && v?.category !== p.vehicle_category) return false;

  return true;
};

const cmpMeta = (p: Params) => {
  const { from, to, days } = range(p);
  const compare = p.compare && p.compare !== 'none';
  const pr = previousRange(from, to, p.compare);

  return {
    from,
    to,
    days,
    compare,
    pr,
    prevDays: compare ? daysBetween(pr.from, pr.to) : [],
    interval: String(p.interval ?? 'day'),
  };
};

// ── trips ─────────────────────────────────────────────────────────────────
const DUR = [
  ['under_30', 'Under 30 min', 0, 30],
  ['30_to_60', '30 – 60 min', 30, 60],
  ['1_to_2_h', '1 – 2 h', 60, 120],
  ['2_to_4_h', '2 – 4 h', 120, 240],
  ['4_to_8_h', '4 – 8 h', 240, 480],
  ['8_h_plus', '8 h or more', 480, null],
] as const;
const DELAY = [
  ['early_30_plus', 'More than 30 min early', -Infinity, -30],
  ['early_0_30', 'Up to 30 min early, or on the minute', -30, 0],
  ['late_0_15', 'Up to 15 min late', 0, 15],
  ['late_15_60', '15 – 60 min late', 15, 60],
  ['late_60_240', '1 – 4 h late', 60, 240],
  ['late_240_plus', 'More than 4 h late', 240, Infinity],
] as const;

const tripStats = (days: number[], p: Params) => {
  const a = aggregate(days);
  const trips = a.trips.filter(t => scopeOk(t.vehicle_id, p));
  const done = trips.filter(t => t.status === 'completed');
  const c = (s: string) => trips.filter(t => t.status === s).length;
  const late = done.filter(t => t._delay > 15).length;

  return {
    trips,
    done,
    counts: {
      total: trips.length,
      planned: c('planned'),
      in_progress: c('in_progress'),
      completed: c('completed'),
      cancelled: c('cancelled'),
    },
    onTime: done.length ? round(((done.length - late) / done.length) * 100) : null,
    avgDelay: done.length ? round(done.reduce((x, t) => x + t._delay, 0) / done.length) : null,
    avgDur: done.length
      ? round(done.reduce((x, t) => x + t.actual_duration_minutes, 0) / done.length)
      : null,
    km: round(done.reduce((x, t) => x + t.actual_distance_km, 0)) ?? 0,
    planned: round(done.reduce((x, t) => x + t.planned_distance_km, 0)) ?? 0,
    late,
  };
};

const tripsReport = (p: Params) => {
  const { from, to, days, compare, pr, prevDays, interval } = cmpMeta(p);
  const cur = tripStats(days, p);
  const prev = compare ? tripStats(prevDays, p) : null;
  const rate = (s: typeof cur) =>
    s.counts.total ? round((s.counts.cancelled / s.counts.total) * 100) : null;
  const reasons = Object.entries(
    cur.trips
      .filter(t => t.status === 'cancelled')
      .reduce(
        (m: Row, t) => ((m[t.cancellation_reason] = (m[t.cancellation_reason] ?? 0) + 1), m),
        {}
      )
  ).sort((a: any, b: any) => b[1] - a[1]);
  const cancelled = cur.counts.cancelled;
  const table = cur.trips.map(t => {
    const done = t.status === 'completed';

    return {
      trip_id: t.id,
      trip_reference: t.trip_reference,
      status: t.status,
      vehicle: {
        id: t.vehicle_id,
        name: t.vehicle.name,
        plate: vehById.get(t.vehicle_id)?.raw.plate,
      },
      driver: { id: t.driver_id, name: `${t.driver.first_name} ${t.driver.last_name}` },
      customer: null,
      origin_address: t.origin_address,
      destination_address: t.destination_address,
      period_start: tripDate(t),
      period_date: tripDate(t).slice(0, 10),
      planned_start_at: t.planned_start_at,
      actual_start_at: t.actual_start_at,
      planned_end_at: t.planned_end_at,
      actual_end_at: t.actual_end_at,
      delay_minutes: done ? t._delay : null,
      on_time: done ? t._delay <= 15 : null,
      duration_minutes: done ? t.actual_duration_minutes : null,
      planned_distance_km: t.planned_distance_km,
      actual_distance_km: t.actual_distance_km,
      distance_variance_km: done ? round(t.actual_distance_km - t.planned_distance_km) : null,
      cancellation_reason: t.cancellation_reason,
      vehicle_name: t.vehicle.name,
      driver_name: `${t.driver.first_name} ${t.driver.last_name}`,
    };
  });
  const filtered = searchRows(
    p.status ? table.filter(r => String(p.status).split(',').includes(r.status)) : table,
    p.search,
    r =>
      `${r.trip_reference} ${r.vehicle_name} ${r.driver_name} ${r.origin_address} ${r.destination_address}`
  );
  const tc = (s: string) => table.filter(r => r.status === s).length;

  return ok(
    {
      summary: {
        trips_total: kpi(cur.counts.total, prev?.counts.total ?? null),
        trips_completed: kpi(cur.counts.completed, prev?.counts.completed ?? null),
        trips_cancelled: kpi(cancelled, prev?.counts.cancelled ?? null),
        cancellation_rate_pct: kpi(rate(cur), prev ? rate(prev) : null),
        on_time_pct: kpi(cur.onTime, prev?.onTime ?? null, 85),
        avg_delay_minutes: kpi(cur.avgDelay, prev?.avgDelay ?? null),
        avg_duration_minutes: kpi(cur.avgDur, prev?.avgDur ?? null),
        actual_distance_km: kpi(cur.km, prev?.km ?? null),
        distance_variance_km: kpi(
          round(cur.km - cur.planned),
          prev ? round(prev.km - prev.planned) : null
        ),
        counts: cur.counts,
        samples: {
          on_time: cur.done.length,
          distance_variance: cur.done.length,
          duration: cur.done.length,
        },
        late_trips: cur.late,
        planned_distance_km: cur.planned,
      },
      series: bucketList(from, to, interval).map(b => {
        const s = tripStats(
          days.filter(d => bucketOf(d, interval) === b),
          p
        );

        return { bucket: b, ...s.counts, on_time_pct: s.onTime, on_time_sample: s.done.length };
      }),
      duration_histogram: DUR.map(([key, label, f, t]) => ({
        key,
        label,
        from_minutes: f,
        to_minutes: t,
        count: cur.done.filter(
          x => x.actual_duration_minutes >= f && (t == null || x.actual_duration_minutes < t)
        ).length,
      })),
      delay_histogram: DELAY.map(([key, label, f, t]) => ({
        key,
        label,
        count: cur.done.filter(x => x._delay >= f && x._delay < t).length,
      })),
      cancellation_reasons: {
        total: cancelled,
        items: reasons.slice(0, Number(p.top_reasons) || 6).map(([reason, count]: any) => ({
          reason,
          count,
          pct: round((count / cancelled) * 100),
        })),
        other_count: 0,
      },
      table: pageOf(
        sorted(
          filtered,
          { sort_by: p.sort_by === 'period_start' ? 'period_start' : p.sort_by },
          'period_start'
        ),
        p
      ),
      previous_period: compare ? pr : null,
    },
    {
      meta: meta(from, to, {
        interval,
        compare: p.compare ?? 'none',
        definition_version: 1,
        on_time_grace_minutes: 15,
        table_counts: {
          planned: tc('planned'),
          in_progress: tc('in_progress'),
          completed: tc('completed'),
          cancelled: tc('cancelled'),
        },
        basis: {
          period: 'a trip belongs to the period of its actual start, else its planned start',
          on_time:
            'completed trips; on time = actual end within the company grace of the planned end',
        },
      }),
    }
  );
};

// ── fuel fills (generated from the telemetry model, lazily) ──────────────
let fills: Row[] | null = null;
const VENDORS = ['PSO', 'Shell Pakistan', 'Attock Petroleum', 'Total Parco', 'Hascol'];
const STATIONS = [
  'PSO Ferozepur Rd',
  'Shell M-2 Service Area',
  'Attock N-5 Sheikhupura',
  'Total Parco Port Qasim',
  'Hascol Bosan Rd',
];

export const allFills = () => {
  if (fills) return fills;

  const rng = makeRng(4242);
  const today = Math.floor(showcaseNow() / DAY);
  const out: Row[] = [];

  activeIdx.forEach(vi => {
    const v = vehicleModels[vi];
    const tank = v.raw.tank_capacity_liters ?? 80;
    let acc = 0;
    let odo = v.raw.odometer_km - 130 * 200;
    let lastFullOdo: number | null = null;
    let sinceFull = 0;

    for (let d = today - 130; d <= today; d++) {
      const x = vehDay(vi, d);

      acc += x.liters;
      odo += x.km;
      sinceFull += x.liters;

      if (acc >= tank * 0.78) {
        const liters = Math.round(Math.min(tank * 0.98, acc));
        const price = Math.round(
          fuelPrice(v.raw.fuel_type) + 7 * Math.sin(d / 9) + rng.float(-3, 3)
        );
        const full = rng.chance(0.86);
        const ven = rng.int(0, VENDORS.length - 1);
        const economy =
          full && lastFullOdo != null && sinceFull > 0
            ? round((odo - lastFullOdo) / sinceFull, 2)
            : null;

        out.push({
          fill_id: String(9000 + out.length),
          vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate, vehicle_category: v.category },
          fill_date: iso(d * DAY),
          volume: liters,
          unit: 'liters',
          liters,
          cost: liters * price,
          price_per_liter: price,
          is_full_tank: full,
          odometer_km: Math.round(odo),
          economy_km_per_l: economy,
          vendor: VENDORS[ven],
          station_name: STATIONS[ven],
          payment_method: rng.pick(['fuel card', 'fuel card', 'cash', 'company account']),
          receipt_reference: `RC-${rng.int(100000, 999999)}`,
          trip_id: null,
          anomaly_types: [] as string[],
          _day: d,
        });
        acc = 0;

        if (full) {
          lastFullOdo = odo;
          sinceFull = 0;
        }
      }
    }
  });

  // A handful of flagged fills so the "check" list is not empty.
  [40, 210, 480, 730, 1100].forEach((i, k) => {
    const f = out[i % out.length];

    f.anomaly_types = [
      ['economy_drop'],
      ['over_capacity'],
      ['odometer_backwards'],
      ['economy_drop'],
      ['over_capacity'],
    ][k];
  });

  fills = out;

  return out;
};

const fillStats = (days: number[], p: Params) => {
  const set = new Set(days);
  const rows = allFills().filter(f => set.has(f._day) && scopeOk(f.vehicle.id, p));
  const liters = rows.reduce((a, r) => a + r.liters, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  const eco = rows.filter(r => r.economy_km_per_l != null);
  const km = eco.reduce((a, r) => a + r.economy_km_per_l * r.liters, 0);
  const ecoL = eco.reduce((a, r) => a + r.liters, 0);

  return {
    rows,
    liters,
    cost,
    price: liters ? round(cost / liters, 2) : null,
    economy: ecoL ? round(km / ecoL, 2) : null,
    costPerKm: km ? round(eco.reduce((a, r) => a + r.cost, 0) / km, 2) : null,
  };
};

const fuelReport = (p: Params) => {
  const { from, to, days, compare, pr, prevDays, interval } = cmpMeta(p);
  const cur = fillStats(days, p);
  const prev = compare ? fillStats(prevDays, p) : null;
  const group = <K extends string>(rows: Row[], keyOf: (r: Row) => string) =>
    Object.entries(
      rows.reduce((m: Record<string, Row[]>, r) => ((m[keyOf(r)] ??= []).push(r), m), {})
    );
  const agg = (rows: Row[]) => {
    const l = rows.reduce((a, r) => a + r.liters, 0);
    const c = rows.reduce((a, r) => a + r.cost, 0);
    const eco = rows.filter(r => r.economy_km_per_l != null);
    const el = eco.reduce((a, r) => a + r.liters, 0);

    return {
      fills: rows.length,
      liters: l,
      total_cost: c,
      avg_price_per_liter: l ? round(c / l, 2) : null,
      fuel_economy_km_per_l: el
        ? round(eco.reduce((a, r) => a + r.economy_km_per_l * r.liters, 0) / el, 2)
        : null,
    };
  };
  const flagged = cur.rows.filter(r => r.anomaly_types.length);
  let table: Row[] = cur.rows.map(r => ({
    ...r,
    vehicle_name: r.vehicle.name,
    anomaly_types: r.anomaly_types,
  }));

  if (p.is_full_tank !== undefined && p.is_full_tank !== '')
    table = table.filter(r => r.is_full_tank === (String(p.is_full_tank) === '1'));
  if (String(p.anomaly) === '1') table = table.filter(r => r.anomaly_types.length);
  table = searchRows(
    table,
    p.search,
    r => `${r.vehicle_name} ${r.vehicle.plate} ${r.vendor} ${r.station_name}`
  );

  return ok(
    {
      summary: {
        fills: kpi(cur.rows.length, prev?.rows.length ?? null),
        liters: kpi(Math.round(cur.liters), prev ? Math.round(prev.liters) : null),
        total_cost: kpi(cur.cost, prev?.cost ?? null),
        avg_price_per_liter: kpi(cur.price, prev?.price ?? null),
        fuel_economy_km_per_l: kpi(cur.economy, prev?.economy ?? null, 3.4),
        fuel_cost_per_km: kpi(cur.costPerKm, prev?.costPerKm ?? null),
        samples: {
          priced_fills: cur.rows.length,
          economy_intervals: cur.rows.filter(r => r.economy_km_per_l != null).length,
          fills_with_odometer: cur.rows.length,
        },
      },
      series: bucketList(from, to, interval).map(b => {
        const a = agg(cur.rows.filter(r => bucketOf(r._day, interval) === b));

        return { bucket: b, ...a };
      }),
      by_vehicle_category: group(cur.rows, r => r.vehicle.vehicle_category).map(
        ([category, rows]) => ({
          category,
          vehicles: new Set(rows.map(r => r.vehicle.id)).size,
          ...agg(rows),
        })
      ),
      by_vendor: {
        items: group(cur.rows, r => r.vendor)
          .map(([vendor, rows]) => ({ vendor, ...agg(rows) }))
          .sort((a, b) => b.total_cost - a.total_cost)
          .slice(0, Number(p.top_vendors) || 6),
        other_count: 0,
      },
      anomalies: {
        total: flagged.length,
        by_type: {
          over_capacity: flagged.filter(r => r.anomaly_types.includes('over_capacity')).length,
          economy_drop: flagged.filter(r => r.anomaly_types.includes('economy_drop')).length,
          odometer_backwards: flagged.filter(r => r.anomaly_types.includes('odometer_backwards'))
            .length,
        },
        items: flagged.slice(0, Number(p.top_anomalies) || 20),
      },
      table: pageOf(sorted(table, p, 'fill_date'), p),
      previous_period: compare ? pr : null,
    },
    {
      meta: meta(from, to, {
        interval,
        compare: p.compare ?? 'none',
        definition_version: 1,
        economy_drop_pct: 30,
        basis: {
          period: 'a fill belongs to the local calendar date of its fill_date',
          liters: 'litres as recorded',
          cost: 'total cost per fill',
          fuel_economy_km_per_l: 'full-tank method',
        },
      }),
    }
  );
};

// ── maintenance ───────────────────────────────────────────────────────────
const maintStats = (days: number[], p: Params) => {
  const set = new Set(days);
  const rows = maintenanceLogModels.filter(
    m => set.has(Math.floor(Date.parse(m.serviced_at) / DAY)) && scopeOk(m.vehicle_id, p)
  );
  const cost = rows.reduce((a, m) => a + m.cost, 0);
  const km = aggregate(days).km;

  return {
    rows,
    cost,
    logs: rows.length,
    avg: rows.length ? Math.round(cost / rows.length) : null,
    vehicles: new Set(rows.map(r => r.vehicle_id)).size,
    cpk: km ? round(cost / km, 2) : null,
  };
};

const maintenanceReport = (p: Params) => {
  const { from, to, days, compare, pr, prevDays, interval } = cmpMeta(p);
  const cur = maintStats(days, p);
  const prev = compare ? maintStats(prevDays, p) : null;
  const share = (v: number) => (cur.cost ? round((v / cur.cost) * 100) : 0);
  const grp = (keyOf: (r: Row) => string) =>
    Object.entries(
      cur.rows.reduce((m: Record<string, Row[]>, r) => ((m[keyOf(r)] ??= []).push(r), m), {})
    ).map(([k, rows]) => {
      const c = rows.reduce((a, r) => a + r.cost, 0);

      return {
        k,
        rows,
        logs: rows.length,
        cost: c,
        avg_cost: Math.round(c / rows.length),
        share_pct: share(c),
      };
    });
  const sch = scheduleModels.filter(s => scopeOk(s.vehicle_id, p));
  const cnt = (s: string) => sch.filter(x => x.status === s).length;

  return ok(
    {
      summary: {
        maintenance_cost: kpi(cur.cost, prev?.cost ?? null),
        logs: kpi(cur.logs, prev?.logs ?? null),
        avg_cost_per_log: kpi(cur.avg, prev?.avg ?? null),
        cost_per_km: kpi(cur.cpk, prev?.cpk ?? null),
        vehicles_serviced: kpi(cur.vehicles, prev?.vehicles ?? null),
        samples: { logs_with_cost: cur.logs },
      },
      series: bucketList(from, to, interval).map(b => {
        const rows = cur.rows.filter(
          r => bucketOf(Math.floor(Date.parse(r.serviced_at) / DAY), interval) === b
        );

        return {
          bucket: b,
          logs: rows.length,
          cost: rows.reduce((a, r) => a + r.cost, 0),
          vehicles: new Set(rows.map(r => r.vehicle_id)).size,
        };
      }),
      by_service_type: {
        items: grp(r => r.service_type)
          .map(({ k, rows: _r, ...x }) => ({ service_type: k, ...x }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, Number(p.top_service_types) || 8),
        other_count: 0,
      },
      by_vehicle_category: grp(r => r.vehicle.vehicle_category).map(({ k, rows, ...x }) => ({
        category: k,
        vehicles: new Set(rows.map(r => r.vehicle_id)).size,
        ...x,
      })),
      top_vehicles: {
        items: grp(r => r.vehicle_id)
          .map(({ k, rows, ...x }) => ({
            vehicle: { id: k, name: rows[0].vehicle.name, plate: rows[0].vehicle.plate },
            ...x,
          }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, Number(p.top_vehicles) || 8),
        other_count: 0,
      },
      schedules: {
        total: sch.length,
        by_status: {
          overdue: cnt('overdue'),
          due_soon: cnt('due_soon'),
          ok: cnt('ok'),
          unknown: 0,
        },
        by_due_window: {
          overdue: sch.filter(s => s.days_until_due < 0).length,
          due_0_7: sch.filter(s => s.days_until_due >= 0 && s.days_until_due <= 7).length,
          due_8_30: sch.filter(s => s.days_until_due > 7 && s.days_until_due <= 30).length,
          later: sch.filter(s => s.days_until_due > 30).length,
          unknown: 0,
        },
        overdue_pct: sch.length ? round((cnt('overdue') / sch.length) * 100) : 0,
      },
      fleet: {
        vehicles_in_maintenance_now: vehicleModels.filter(v => v.status === 'in_maintenance')
          .length,
      },
      previous_period: compare ? pr : null,
    },
    {
      meta: meta(from, to, {
        interval,
        compare: p.compare ?? 'none',
        definition_version: 1,
        due_soon_days: 14,
        due_soon_km: 1000,
        basis: {
          period: 'a log belongs to the local calendar date of its service date',
          cost: 'the sum of the logs that carry a cost',
        },
      }),
    }
  );
};

// ── compliance ────────────────────────────────────────────────────────────
const BUCKETS = [
  'expired',
  'expiring_0_7',
  'expiring_8_30',
  'expiring_31_60',
  'valid_after_60',
  'no_expiry',
];
const bucketOfExpiry = (e: string | null) => {
  if (!e) return 'no_expiry';

  const d = Math.ceil((Date.parse(e) - showcaseNow()) / DAY);

  return d < 0
    ? 'expired'
    : d <= 7
      ? 'expiring_0_7'
      : d <= 30
        ? 'expiring_8_30'
        : d <= 60
          ? 'expiring_31_60'
          : 'valid_after_60';
};

const complianceRecords = () =>
  [
    ...complianceDocs.map(d => ({
      kind: 'document',
      record_id: d.id,
      owner: { type: d.documentable_type, id: d.documentable_id, name: d.owner_name },
      owner_name: d.owner_name,
      document_type: d.document_type,
      document_number: d.document_number,
      expiry_date: d.expiry_date,
    })),
    ...driverModels
      .filter(d => d.raw.status !== 'inactive')
      .map(d => ({
        kind: 'licence',
        record_id: d.id,
        owner: { type: 'driver', id: d.id, name: d.name },
        owner_name: d.name,
        document_type: 'Driver licence',
        document_number: d.raw.license_number,
        expiry_date: d.raw.license_expiry_date,
      })),
  ].map(r => ({
    ...r,
    days_until_expiry: r.expiry_date
      ? Math.ceil((Date.parse(r.expiry_date) - showcaseNow()) / DAY)
      : null,
    status: bucketOfExpiry(r.expiry_date),
  }));

const tally = (rows: Row[]) => {
  const t: Row = {
    total: rows.length,
    ...Object.fromEntries(BUCKETS.map(b => [b, rows.filter(r => r.status === b).length])),
  };
  const judged = rows.length - t.no_expiry;

  t.expiring_within_30_days = t.expiring_0_7 + t.expiring_8_30;
  t.compliance_rate_pct = judged ? round(((judged - t.expired) / judged) * 100) : null;

  return t;
};

const complianceReport = (p: Params) => {
  const recs = complianceRecords();
  const horizon = Number(p.horizon_days) || 90;
  const interval = p.interval === 'month' ? 'month' : 'week';
  const today = Math.floor(showcaseNow() / DAY);
  const upcoming = [
    ...new Set(Array.from({ length: horizon + 1 }, (_, i) => bucketOf(today + i, interval))),
  ].map(b => {
    const rows = recs.filter(
      r =>
        r.days_until_expiry != null &&
        r.days_until_expiry >= 0 &&
        r.days_until_expiry <= horizon &&
        bucketOf(today + r.days_until_expiry, interval) === b
    );

    return {
      bucket: b,
      documents: rows.filter(r => r.kind === 'document').length,
      licences: rows.filter(r => r.kind === 'licence').length,
      total: rows.length,
    };
  });
  let table: Row[] = recs;

  if (p.kind) table = table.filter(r => r.kind === p.kind);
  if (p.status) table = table.filter(r => String(p.status).split(',').includes(r.status));
  table = searchRows(
    table,
    p.search,
    r => `${r.owner_name} ${r.document_type} ${r.document_number}`
  );
  const asc = { sort_order: 'asc', ...p };

  return ok(
    {
      summary: {
        ...tally(recs),
        by_kind: {
          documents: tally(recs.filter(r => r.kind === 'document')),
          licences: tally(recs.filter(r => r.kind === 'licence')),
        },
      },
      by_owner_type: ['driver', 'vehicle'].map(t => ({
        owner_type: t,
        ...tally(recs.filter(r => r.owner.type === t)),
      })),
      by_document_type: [...new Set(recs.map(r => r.document_type))].map(t => ({
        document_type: t,
        ...tally(recs.filter(r => r.document_type === t)),
      })),
      upcoming,
      table: pageOf(sorted(table, asc, 'expiry_date', 'asc'), p),
    },
    {
      meta: {
        timezone: TZ,
        today: ymd(showcaseNow()),
        horizon_days: horizon,
        interval,
        generated_at: iso(showcaseNow()),
        definition_version: 1,
        table_counts: Object.fromEntries(
          BUCKETS.map(b => [b, table.filter(r => r.status === b).length])
        ),
        basis: {
          records:
            'every compliance document of the company plus the licence of every active driver',
          status: 'six exclusive classes against today in the company timezone',
        },
      },
    }
  );
};

export function resolveAnalytics(url: string, p: Params): any | undefined {
  switch (url) {
    case '/api/fleet/analytics/trips':
      return tripsReport(p);
    case '/api/fleet/analytics/fuel':
      return fuelReport(p);
    case '/api/fleet/analytics/maintenance':
      return maintenanceReport(p);
    case '/api/fleet/analytics/compliance':
      return complianceReport(p);
    default:
      return undefined;
  }
}

export { dayStr };
