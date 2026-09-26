/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  assignmentModels,
  driverModels,
  geofenceEvents,
  geofences,
  incidentModels,
  scheduleModels,
  showcaseNow,
  tripModels,
  vehicleModels,
  yards,
} from './dataset';
import { DAY } from './rng';

type Params = Record<string, any>;
type Row = Record<string, any>;

const ok = (data: unknown, extra: Row = {}, message = 'OK') => ({
  success: true,
  message,
  data,
  ...extra,
});

const num = (v: unknown, d: number) => {
  const n = Number(v);

  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};
const flag = (v: unknown) =>
  v === undefined || v === '' ? undefined : String(v) === '1' || v === true;
const list = (v: unknown): string[] | undefined =>
  v === undefined || v === '' ? undefined : String(v).split(',');
const text = (row: Row, keys: string[]) =>
  keys
    .map(k => k.split('.').reduce((o: any, p) => o?.[p], row))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** search + sort + page, in memory. */
const prepare = (
  rows: Row[],
  p: Params,
  searchKeys: string[],
  sortKeys: Record<string, (r: Row) => any> = {}
) => {
  let out = rows;
  const q = String(p.search ?? '')
    .trim()
    .toLowerCase();

  if (q) out = out.filter(r => q.split(/\s+/).every(w => text(r, searchKeys).includes(w)));

  const get = p.sort_by && sortKeys[p.sort_by];

  if (get) {
    const dir = p.sort_order === 'desc' ? -1 : 1;

    out = [...out].sort((a, b) => {
      const x = get(a);
      const y = get(b);

      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;

      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }

  return out;
};

const paged = (rows: Row[], p: Params, extra: Row = {}) => {
  const per = Math.min(100, num(p.per_page, 20));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(num(p.page, 1), totalPages);

  return ok(
    {
      items: rows.slice((page - 1) * per, page * per),
      pagination: { page, per_page: per, total, total_pages: totalPages },
    },
    extra
  );
};

/** Laravel paginator envelope (trips, assignment history). */
const laravel = (rows: Row[], p: Params) => {
  const per = Math.min(100, num(p.per_page, 20));
  const total = rows.length;
  const last = Math.max(1, Math.ceil(total / per));
  const page = Math.min(num(p.page, 1), last);
  const from = total ? (page - 1) * per + 1 : null;

  return ok({
    current_page: page,
    data: rows.slice((page - 1) * per, page * per),
    first_page_url: '/?page=1',
    from,
    last_page: last,
    last_page_url: `/?page=${last}`,
    links: [],
    next_page_url: page < last ? `/?page=${page + 1}` : null,
    path: '/',
    per_page: per,
    prev_page_url: page > 1 ? `/?page=${page - 1}` : null,
    to: total ? Math.min(total, page * per) : null,
    total,
  });
};

const counts = (rows: Row[], key: string, keys: string[]) => ({
  total: rows.length,
  by_status: Object.fromEntries(keys.map(k => [k, rows.filter(r => r[key] === k).length])),
});

// ── vehicles ──────────────────────────────────────────────────────────────
const vehicleRows = (p: Params, forCounts = false) => {
  let rows = vehicleModels.map(v => v.raw);
  const inactive = flag(p.include_inactive);

  if (!forCounts && p.status) rows = rows.filter(r => list(p.status)!.includes(r.lifecycle_status));
  else if (!forCounts && !inactive)
    rows = rows.filter(r => r.lifecycle_status !== 'retired' && r.lifecycle_status !== 'sold');

  if (p.vehicle_category) rows = rows.filter(r => r.vehicle_category === p.vehicle_category);
  if (p.fuel_type) rows = rows.filter(r => r.fuel_type === p.fuel_type);

  const t = flag(p.has_tracker);
  const d = flag(p.has_driver);

  if (t !== undefined) rows = rows.filter(r => !!r.current_device_assignment === t);
  if (d !== undefined) rows = rows.filter(r => !!r.current_driver_assignment === d);

  return prepare(rows, p, ['name', 'plate', 'vin', 'make', 'model'], {
    name: r => r.name.toLowerCase(),
    plate: r => r.plate,
    lifecycle_status: r => r.lifecycle_status,
    odometer_km: r => r.odometer_km,
    year: r => r.year,
    created_at: r => r.created_at,
  });
};

const activeOnly = (rows: Row[], key: string) => rows.filter(r => r[key] === 'active');

const options = (rows: Row[], p: Params, map: (r: Row) => Row) => {
  const items = prepare(rows, p, [
    'name',
    'first_name',
    'last_name',
    'plate',
    'license_number',
  ]).map(map);

  return ok(items.slice(0, 1000), { meta: { total: items.length, limit: 1000, truncated: false } });
};

// ── drivers ───────────────────────────────────────────────────────────────
const driverRows = (p: Params, forCounts = false) => {
  let rows = driverModels.map(d => d.raw);

  if (!forCounts && p.status) rows = rows.filter(r => list(p.status)!.includes(r.status));
  if (p.availability_status)
    rows = rows.filter(r => r.availability_status === p.availability_status);
  if (p.employment_status) rows = rows.filter(r => r.employment_status === p.employment_status);

  if (p.license_state) {
    const now = showcaseNow();

    rows = rows.filter(r => {
      const t = Date.parse(r.license_expiry_date);
      const s = t < now ? 'expired' : t < now + 30 * DAY ? 'expiring' : 'valid';

      return s === p.license_state;
    });
  }

  const a = flag(p.assigned);

  if (a !== undefined) rows = rows.filter(r => !!r.current_assignment === a);

  return prepare(rows, p, ['first_name', 'last_name', 'license_number', 'email', 'phone'], {
    name: r => `${r.last_name} ${r.first_name}`.toLowerCase(),
    license_expiry_date: r => r.license_expiry_date,
    hire_date: r => r.hire_date,
    status: r => r.status,
    created_at: r => r.created_at,
  });
};

// ── trips ─────────────────────────────────────────────────────────────────
const tripRows = (p: Params, forCounts = false) => {
  let rows: Row[] = tripModels;
  const st = list(p.status);

  if (!forCounts && st) rows = rows.filter(r => st.includes(r.status));
  if (p.vehicle_id) rows = rows.filter(r => r.vehicle_id === String(p.vehicle_id));
  if (p.driver_id) rows = rows.filter(r => r.driver_id === String(p.driver_id));
  if (p.date_from) rows = rows.filter(r => r.planned_start_at.slice(0, 10) >= p.date_from);
  if (p.date_to) rows = rows.filter(r => r.planned_start_at.slice(0, 10) <= p.date_to);

  return prepare(
    rows,
    { sort_by: 'planned_start_at', sort_order: 'desc', ...p },
    [
      'trip_reference',
      'purpose',
      'vehicle.name',
      'driver.first_name',
      'driver.last_name',
      'origin_address',
      'destination_address',
    ],
    {
      planned_start_at: r => r.planned_start_at,
      created_at: r => r.created_at,
      status: r => r.status,
      trip_reference: r => r.trip_reference,
    }
  );
};

// ── yards / geofences / events / incidents ───────────────────────────────
const yardRows = (p: Params) => {
  let rows: Row[] = yards;
  const act = flag(p.is_active);
  const slots = flag(p.has_slots);
  const coords = flag(p.has_coordinates);
  const layout = flag(p.has_layout);

  if (act !== undefined) rows = rows.filter(r => r.is_active === act);
  if (slots !== undefined) rows = rows.filter(r => r.slots_count > 0 === slots);
  if (coords !== undefined) rows = rows.filter(r => (r.latitude != null) === coords);
  if (layout !== undefined) rows = rows.filter(r => r.has_layout === layout);

  return prepare(rows, p, ['name', 'address'], {
    name: r => r.name.toLowerCase(),
    created_at: r => r.created_at,
    slots_count: r => r.slots_count,
    radius_m: r => r.radius_m,
  });
};

const geofenceRows = (p: Params) => {
  let rows: Row[] = geofences;
  const act = flag(p.is_active);
  const linked = flag(p.linked);

  if (act !== undefined) rows = rows.filter(r => r.is_active === act);
  if (linked !== undefined) rows = rows.filter(r => !!r.yard_id === linked);
  if (p.alert_on) rows = rows.filter(r => r.alert_on === p.alert_on);

  return prepare(rows, p, ['name', 'yard.name'], {
    name: r => r.name.toLowerCase(),
    radius_m: r => r.radius_m,
    created_at: r => r.created_at,
  });
};

const incidentRows = (p: Params) => {
  let rows: Row[] = incidentModels;

  if (p.severity) rows = rows.filter(r => r.severity === p.severity);
  if (p.driver_id) rows = rows.filter(r => r.driver_id === String(p.driver_id));
  if (p.vehicle_id) rows = rows.filter(r => r.vehicle_id === String(p.vehicle_id));
  if (p.date_from) rows = rows.filter(r => r.incident_date.slice(0, 10) >= p.date_from);
  if (p.date_to) rows = rows.filter(r => r.incident_date.slice(0, 10) <= p.date_to);

  const sev = { minor: 1, moderate: 2, severe: 3 } as Record<string, number>;

  return prepare(
    rows,
    { sort_by: 'incident_date', sort_order: 'desc', ...p },
    ['incident_type', 'description', 'driver.first_name', 'driver.last_name', 'vehicle.name'],
    {
      incident_date: r => r.incident_date,
      severity: r => sev[r.severity],
      created_at: r => r.created_at,
    }
  );
};

// ── maintenance schedules / compliance ───────────────────────────────────
const scheduleRes = (p: Params) => {
  const all = scheduleModels;
  const c = (s: string) => all.filter(r => r.status === s).length;
  let rows = all;

  if (p.status) rows = rows.filter(r => list(p.status)!.includes(r.status));
  if (p.vehicle_id) rows = rows.filter(r => r.vehicle_id === String(p.vehicle_id));

  rows = prepare(
    rows,
    { sort_by: 'due', ...p },
    ['vehicle.name', 'vehicle.plate', 'service_type'],
    {
      due: r => r.next_due_date,
      next_due_date: r => r.next_due_date,
    }
  );

  return paged(rows, p, {
    meta: {
      counts: {
        total: all.length,
        overdue: c('overdue'),
        due_soon: c('due_soon'),
        ok: c('ok'),
        unknown: 0,
      },
      due_soon_days: 14,
      due_soon_km: 1000,
      generated_at: new Date(showcaseNow()).toISOString(),
    },
  });
};

const complianceCounts = () => {
  const now = showcaseNow();
  const by: Row = {
    expired: 0,
    expiring_0_7: 0,
    expiring_8_30: 0,
    expiring_31_60: 0,
    valid_after_60: 0,
    no_expiry: 0,
  };

  driverModels.forEach(d => {
    const days = (Date.parse(d.raw.license_expiry_date) - now) / DAY;

    if (days < 0) by.expired++;
    else if (days <= 7) by.expiring_0_7++;
    else if (days <= 30) by.expiring_8_30++;
    else if (days <= 60) by.expiring_31_60++;
    else by.valid_after_60++;
  });

  return ok({
    total: driverModels.length,
    by_status: by,
    by_owner_type: { driver: driverModels.length },
    by_document_type: { driving_licence: driverModels.length },
  });
};

// ── router ────────────────────────────────────────────────────────────────
export function resolveLists(url: string, p: Params): any | undefined {
  switch (url) {
    case '/api/vehicles':
      return paged(vehicleRows(p), p);
    case '/api/vehicles/counts':
      return ok(
        counts(vehicleRows(p, true), 'lifecycle_status', [
          'active',
          'in_maintenance',
          'retired',
          'sold',
        ])
      );
    case '/api/vehicles/options':
      return options(
        activeOnly(vehicleRows({ ...p, include_inactive: 0 }), 'lifecycle_status'),
        p,
        r => ({
          id: r.id,
          name: r.name,
          plate: r.plate,
          vehicle_category: r.vehicle_category,
          lifecycle_status: r.lifecycle_status,
          assigned: !!r.current_driver_assignment,
          has_tracker: !!r.current_device_assignment,
        })
      );
    case '/api/drivers':
      return paged(driverRows(p), p);
    case '/api/drivers/counts':
      return ok(counts(driverRows(p, true), 'status', ['active', 'inactive', 'suspended']));
    case '/api/drivers/options':
      return options(activeOnly(driverRows(p), 'status'), p, r => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        first_name: r.first_name,
        last_name: r.last_name,
        license_number: r.license_number,
        license_expiry_date: r.license_expiry_date,
        status: r.status,
        availability_status: r.availability_status,
        assigned: !!r.current_assignment,
      }));
    case '/api/trips':
      return laravel(tripRows(p), p);
    case '/api/trips/counts':
      return ok(
        counts(tripRows(p, true), 'status', ['planned', 'in_progress', 'completed', 'cancelled'])
      );
    case '/api/yards':
      return paged(yardRows(p), p);
    case '/api/yards/options':
      return options(yardRows(p), p, r => ({
        id: r.id,
        name: r.name,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        radius_m: r.radius_m,
      }));
    case '/api/geofences':
      return paged(geofenceRows(p), p);
    case '/api/geofences/options':
      return options(geofenceRows(p), p, r => ({ id: r.id, name: r.name, yard_id: r.yard_id }));
    case '/api/geofences/events': {
      let rows: Row[] = geofenceEvents;

      if (p.event_type) rows = rows.filter(r => r.event_type === p.event_type);
      rows = prepare(rows, p, ['geofence.name', 'vehicle.name']);

      return paged(rows, p);
    }
    case '/api/incidents':
      return paged(incidentRows(p), p);
    case '/api/assignment-history': {
      let rows: Row[] = assignmentModels;

      if (p.driver_id) rows = rows.filter(r => r.driver_id === String(p.driver_id));
      if (p.vehicle_id) rows = rows.filter(r => r.vehicle_id === String(p.vehicle_id));
      if (p.status === 'active') rows = rows.filter(r => r.is_active);
      if (p.status === 'ended') rows = rows.filter(r => !r.is_active);
      rows = prepare(
        rows,
        { sort_by: 'assigned_at', sort_order: 'desc', ...p },
        ['driver.first_name', 'driver.last_name', 'vehicle.name', 'vehicle.plate'],
        {
          assigned_at: r => r.assigned_at,
        }
      );

      return laravel(rows, p);
    }
    case '/api/maintenance-schedules':
      return scheduleRes(p);
    case '/api/compliance-documents/counts':
      return complianceCounts();
    default:
      return undefined;
  }
}
