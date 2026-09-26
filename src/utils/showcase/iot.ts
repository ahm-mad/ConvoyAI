/* eslint-disable @typescript-eslint/no-explicit-any */
import { positionModels, showcaseNow, vehicleModels } from './dataset';
import { ok } from './fleet';
import { DAY, iso, makeRng } from './rng';

type Params = Record<string, any>;
type Row = Record<string, any>;

const NOW = showcaseNow();
const rng = makeRng(555);

export const ME = {
  id: 2,
  first_name: 'Hassan',
  last_name: 'Raza',
  email: 'hassan.raza@indusfreight.pk',
  number: '+92 300 4412267',
  company_id: 2,
  status: 'active',
  email_verified_at: iso(NOW - 300 * DAY),
  timezone: 'Asia/Karachi',
  profile_image: null,
  company_domain: null,
  social_provider: null,
  social_provider_id: null,
  created_at: iso(NOW - 400 * DAY),
  updated_at: iso(NOW - 3 * DAY),
};

const COMPANY = {
  id: 2,
  name: 'Indus Freight Co.',
  email: 'ops@indusfreight.pk',
  address: 'Plot 14, Korangi Industrial Area',
  city: 'Karachi',
  state: 'Sindh',
  country: 'PK',
  zip_code: '74900',
  currency: 'PKR',
  created_at: iso(NOW - 400 * DAY),
  updated_at: iso(NOW - 30 * DAY),
};

// ── products & devices ───────────────────────────────────────────────────
const PRODUCTS = [
  ['Fleet GPS Tracker T3', 'active'],
  ['Reefer Temperature Probe', 'active'],
  ['Fuel Level Sensor', 'active'],
  ['Driver ID Reader', 'active'],
  ['Trailer Door Sensor', 'active'],
  ['Tyre Pressure Monitor', 'inactive'],
] as const;

const deviceValues = (pi: number, r: ReturnType<typeof makeRng>): Row =>
  [
    {
      'object.speed': r.int(0, 80),
      'object.ignition': r.chance(0.7) ? 1 : 0,
      'object.battery_voltage': +r.float(11.8, 13.9).toFixed(1),
    },
    {
      'object.temperature': +r.float(-22, 4).toFixed(1),
      'object.humidity': r.int(40, 70),
      'object.battery_voltage': +r.float(3.4, 3.9).toFixed(2),
    },
    {
      'object.fuel_level_pct': r.int(12, 96),
      'object.battery_voltage': +r.float(11.8, 13.9).toFixed(1),
    },
    { 'object.card_reads': r.int(0, 40), 'object.battery_voltage': +r.float(3.4, 3.9).toFixed(2) },
    {
      'object.door_open': r.chance(0.15) ? 1 : 0,
      'object.battery_voltage': +r.float(3.4, 3.9).toFixed(2),
    },
    {
      'object.pressure_psi': r.int(95, 118),
      'object.battery_voltage': +r.float(3.4, 3.9).toFixed(2),
    },
  ][pi];

const ago = (sec: number) =>
  sec < 3600
    ? `${Math.max(1, Math.round(sec / 60))} minutes ago`
    : sec < 86400
      ? `${Math.round(sec / 3600)} hours ago`
      : `${Math.round(sec / 86400)} days ago`;

const devices: Row[] = [];
const userStub = { ...ME, stripe_id: null, pm_type: null, pm_last_four: null, trial_ends_at: null };

positionModels.forEach((p, i) => {
  const v = vehicleModels.find(x => x.id === p._vehicleId)!;

  devices.push({
    id: Number(p.device_id),
    device_unique_identifier: p.device.device_unique_identifier,
    name: p.device.name,
    type: 'tracker',
    status: 'active',
    location: `${v.raw.name}`,
    tags: v.category.toLowerCase(),
    product_id: 1,
    user_id: 2,
    created_at: v.raw.created_at,
    updated_at: p.recorded_at,
    is_assigned: true,
    _age: p.age_seconds,
    _pi: 0,
    _i: i,
  });
});
[
  [1, 9, 'Reefer probe', 'Cold-chain trailer'],
  [2, 14, 'Fuel sensor', 'Tank'],
  [3, 8, 'ID reader', 'Cab'],
  [4, 10, 'Door sensor', 'Trailer'],
  [5, 6, 'TPMS', 'Axle'],
].forEach(([pi, n, label, loc]: any) => {
  for (let k = 0; k < n; k++) {
    const v = vehicleModels[(k * 3 + pi) % 40];

    devices.push({
      id: 1200 + pi * 100 + k,
      device_unique_identifier: `${label.slice(0, 2).toUpperCase()}${rng.int(100000, 999999)}`,
      name: `${label} ${String(k + 1).padStart(2, '0')}`,
      type: label.toLowerCase(),
      status: rng.chance(0.92) ? 'active' : 'inactive',
      location: `${loc} · ${v.raw.plate}`,
      tags: '',
      product_id: pi + 1,
      user_id: 2,
      created_at: iso(NOW - rng.int(30, 300) * DAY),
      updated_at: iso(NOW - rng.int(1, 20) * DAY),
      is_assigned: true,
      _age: rng.chance(0.85) ? rng.int(20, 800) : rng.int(90000, 400000),
      _pi: pi,
      _i: k,
    });
  }
});

const withValue = (d: Row) => {
  const r = makeRng(d.id);

  return {
    ...d,
    last_updated: ago(d._age),
    latest_device_value: {
      id: 1000 + d.id,
      device_id: d.id,
      device_unique_identifier: d.device_unique_identifier,
      values: deviceValues(d._pi, r),
      created_at: iso(NOW - d._age * 1000),
      updated_at: iso(NOW - d._age * 1000),
    },
    user: userStub,
  };
};
const strip = ({ _age, _pi, _i, ...rest }: Row) => rest;

const products = PRODUCTS.map(([name, status], i) => ({
  id: i + 1,
  name,
  status,
  company_id: 2,
  created_by: 2,
  device_protocol_id: 1,
  preconfigure_template_id: null,
  devices_count: devices.filter(d => d.product_id === i + 1).length,
  attribute_preferences_count: [6, 5, 4, 3, 3, 4][i],
  created_at: iso(NOW - (300 - i * 25) * DAY),
  updated_at: iso(NOW - (20 - i) * DAY),
}));

const laravelPage = (rows: Row[], p: Params, path: string) => {
  const per = Number(p.per_page) || 10;
  const last = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(Number(p.page) || 1, last);

  return {
    current_page: page,
    data: rows.slice((page - 1) * per, page * per),
    first_page_url: `${path}?page=1`,
    from: rows.length ? (page - 1) * per + 1 : null,
    last_page: last,
    last_page_url: `${path}?page=${last}`,
    links: [],
    next_page_url: null,
    path,
    per_page: per,
    prev_page_url: null,
    to: rows.length ? Math.min(rows.length, page * per) : null,
    total: rows.length,
  };
};
const sortBy = (rows: Row[], p: Params, fallback = 'id') => {
  const key = p.sort_by ?? fallback;
  const d = (p.sort_order ?? 'asc') === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * d);
};
const searchIn = (rows: Row[], q: unknown, keys: string[]) => {
  const s = String(q ?? '')
    .trim()
    .toLowerCase();

  return s
    ? rows.filter(r =>
        keys.some(k =>
          String(r[k] ?? '')
            .toLowerCase()
            .includes(s)
        )
      )
    : rows;
};

const ATTRS: [string, string, string | null][] = [
  ['deviceInfo.devEui', 'Device EUI', null],
  ['object.speed', 'Speed', 'km/h'],
  ['object.ignition', 'Ignition', null],
  ['object.battery_voltage', 'Battery', 'V'],
  ['object.temperature', 'Temperature', '°C'],
  ['object.fuel_level_pct', 'Fuel level', '%'],
];
const attributes = () =>
  ATTRS.map(([key, label, unit], i) => ({
    id: 7 + i,
    label,
    unit,
    attribute_key: key,
    is_selected: 1,
    is_unique_identifier: i === 0,
    attribute_role: null,
  }));

const rawPacket = (name: string, eui: string) => ({
  dr: 3,
  adr: true,
  fCnt: 1482,
  fPort: 10,
  time: iso(NOW - 4 * 60_000),
  object: { speed: 54, ignition: 1, battery_voltage: 12.6, temperature: null },
  rxInfo: [{ snr: 9.4, rssi: -61, gatewayId: 'a1b2c3fffe005960', channel: 3, crcStatus: 'CRC_OK' }],
  devAddr: '01cd9e9c',
  confirmed: false,
  deviceInfo: {
    devEui: eui,
    deviceName: name,
    tenantName: 'Indus Freight Telemetry',
    applicationName: 'Fleet trackers',
    deviceProfileName: 'GPS-T3',
    deviceClassEnabled: 'CLASS_A',
  },
});

const productDetail = (id: number, p: Params) => {
  const rows = sortBy(
    searchIn(
      devices.filter(d => d.product_id === id),
      p.search,
      ['name', 'device_unique_identifier', 'location']
    ),
    { sort_by: 'created_at', sort_order: 'desc', ...p },
    'created_at'
  ).map(d => withValue(strip2(d)));
  const per = Number(p.per_page) || 10;
  const page = Number(p.page) || 1;
  const last = Math.max(1, Math.ceil(rows.length / per));

  return ok(
    {
      devices: rows.slice((page - 1) * per, page * per).map(strip),
      pagination: {
        current_page: page,
        per_page: per,
        total: rows.length,
        last_page: last,
        from: rows.length ? (page - 1) * per + 1 : null,
        to: Math.min(rows.length, page * per),
        has_more_pages: page < last,
        path: `/api/products/${id}`,
        links: { first: null, last: null, prev: null, next: null },
      },
      filters: {
        type: null,
        search: p.search ?? null,
        sort_by: p.sort_by ?? 'created_at',
        sort_order: p.sort_order ?? 'desc',
      },
    },
    {},
    undefined as any
  );
};
const strip2 = (d: Row) => d;

// ── RBAC ─────────────────────────────────────────────────────────────────
const PERMS = [
  'all-product',
  'all-dashboard',
  'all-connect',
  'all-building',
  'all-fleet',
  'all-alarms',
  'all-role-permission',
  'all-rule-builder',
];
const ROLE_DEFS: [string, string, string[]][] = [
  ['admin', 'Full access to every module', PERMS],
  [
    'fleet-manager',
    'Runs day-to-day fleet operations',
    ['all-product', 'all-dashboard', 'all-connect', 'all-fleet'],
  ],
  ['dispatcher', 'Plans trips and monitors the live map', ['all-dashboard', 'all-fleet']],
  [
    'maintenance-lead',
    'Owns service schedules and compliance',
    ['all-fleet', 'all-alarms', 'all-dashboard'],
  ],
  ['viewer', 'Read-only analytics for finance and management', ['all-dashboard']],
];
const MEMBER_DEFS: [string, string, string, string][] = [
  ['Hassan', 'Raza', 'hassan.raza@indusfreight.pk', 'admin'],
  ['Ayesha', 'Siddiqui', 'ayesha.siddiqui@indusfreight.pk', 'fleet-manager'],
  ['Omar', 'Farooq', 'omar.farooq@indusfreight.pk', 'fleet-manager'],
  ['Sana', 'Malik', 'sana.malik@indusfreight.pk', 'dispatcher'],
  ['Bilal', 'Ahmed', 'bilal.ahmed@indusfreight.pk', 'dispatcher'],
  ['Zainab', 'Qureshi', 'zainab.qureshi@indusfreight.pk', 'maintenance-lead'],
  ['Hamza', 'Iqbal', 'hamza.iqbal@indusfreight.pk', 'maintenance-lead'],
  ['Mariam', 'Chaudhry', 'mariam.chaudhry@indusfreight.pk', 'viewer'],
];
const roleRows = ROLE_DEFS.map(([name, description], i) => ({
  id: 2 + i,
  company_id: 2,
  name,
  guard_name: 'api',
  display_name: null,
  description,
  created_by: null,
  created_at: iso(NOW - 300 * DAY),
  updated_at: iso(NOW - 20 * DAY),
}));
const memberUser = (i: number) => {
  const [f, l, e, role] = MEMBER_DEFS[i];
  const r = roleRows.find(x => x.name === role)!;

  return {
    id: 2 + i,
    first_name: f,
    last_name: l,
    email: e,
    number: `+92 30${i} ${1000000 + i * 137911}`,
    timezone: 'Asia/Karachi',
    profile_image: null,
    company_id: 2,
    company_domain: null,
    status: 'active',
    email_verified_at: iso(NOW - 200 * DAY),
    created_at: iso(NOW - (300 - i * 20) * DAY),
    updated_at: iso(NOW - i * DAY),
    stripe_id: null,
    pm_type: null,
    pm_last_four: null,
    trial_ends_at: null,
    roles: [
      {
        ...r,
        pivot: { role_id: r.id, model_id: 2 + i, model_type: 'App\\Domain\\Auth\\Models\\User' },
      },
    ],
  };
};

const rolesRes = () => ({
  success: true,
  message: 'Roles fetched successfully.',
  roles: roleRows.map((r, i) => ({
    ...r,
    permissions: ROLE_DEFS[i][2].map((n, k) => ({
      id: PERMS.indexOf(n) + 1,
      name: n,
      guard_name: 'api',
      created_at: r.created_at,
      updated_at: r.updated_at,
      pivot: { role_id: r.id, permission_id: PERMS.indexOf(n) + 1 },
    })),
    users: MEMBER_DEFS.map((m, mi) => (m[3] === r.name ? mi : -1))
      .filter(x => x >= 0)
      .map(mi => {
        const { roles, ...u } = memberUser(mi);
        return {
          ...u,
          pivot: { model_type: 'App\\Domain\\Auth\\Models\\User', role_id: r.id, model_id: u.id },
        };
      }),
  })),
});

const members = (p: Params) => {
  const rows = searchIn(
    MEMBER_DEFS.map((m, i) => ({
      id: i + 1,
      user_id: 2 + i,
      name: `${m[0]} ${m[1]}`,
      address: 'Karachi',
      city: 'Karachi',
      state: 'Sindh',
      country: 'Pakistan',
      company_id: 2,
      created_by: '2',
      created_at: iso(NOW - (300 - i * 20) * DAY),
      updated_at: iso(NOW - i * DAY),
      user: memberUser(i),
    })),
    p.search,
    ['name']
  );

  return {
    success: true,
    message: 'Members list fetched successfully.',
    data: laravelPage(rows, p, '/api/members'),
  };
};

// ── dashboard bits ───────────────────────────────────────────────────────
const analytics = () => {
  const online = devices.filter(d => d._age < 900);
  const offline = devices.filter(d => d._age >= 900);
  const item = (d: Row) => ({
    id: d.id,
    name: d.name,
    device_unique_identifier: d.device_unique_identifier,
    last_heard: ago(d._age),
    last_heard_at: iso(NOW - d._age * 1000)
      .replace('T', ' ')
      .slice(0, 19),
  });

  return ok({
    total_devices: devices.length,
    online_devices: online.length,
    offline_devices: offline.length,
    active_in_last_24h: devices.filter(d => d._age < 86400).length,
    recently_active_devices: online.slice(0, 6).map(item),
    offline_devices_list: offline.slice(0, 6).map(item),
  });
};

const connector = (id: string, connected: boolean, received: number, caps: Row) => ({
  connector_id: id,
  runtime_id: 'central',
  state: connected ? 'running' : 'stopped',
  connected,
  last_message_at: iso(NOW - 40_000),
  messages_received_total: received,
  messages_sent_total: connected ? 128 : 0,
  errors_total: 0,
  reconnects_total: 2,
  queue_depth: 0,
  reported_at: iso(NOW - 5000),
  capabilities: caps,
});

const packets = (id: number, p: Params) => {
  const devs = devices.filter(d => d.product_id === id).slice(0, 8);
  const rows = Array.from({ length: 24 }, (_, i) => {
    const d = devs[i % Math.max(1, devs.length)];
    const alert = i % 6 === 0;

    return {
      id: 500 + i,
      product: { id, name: products[id - 1]?.name },
      protocol: { id: 1, name: 'HTTPS' },
      device_ids: [d?.device_unique_identifier],
      json_body: rawPacket(d?.name ?? 'device', d?.device_unique_identifier ?? ''),
      token: 'showcase',
      status: alert ? 'alert' : 'normal',
      is_alert: alert,
      received_at: iso(NOW - i * 11 * 60_000)
        .replace('T', ' ')
        .slice(0, 19),
    };
  });
  const per = Number(p.per_page) || 10;
  const page = Number(p.page) || 1;

  return ok({
    packets: rows.slice((page - 1) * per, page * per),
    summary: {
      total: rows.length,
      alerts: rows.filter(r => r.is_alert).length,
      normal: rows.filter(r => !r.is_alert).length,
    },
    pagination: {
      current_page: page,
      per_page: per,
      total: rows.length,
      last_page: Math.ceil(rows.length / per),
      from: (page - 1) * per + 1,
      to: Math.min(rows.length, page * per),
      next_page_url: null,
      prev_page_url: null,
    },
  });
};

export function resolveIot(url: string, p: Params): any | undefined {
  let m: RegExpMatchArray | null;

  if (url === '/api/profile')
    return {
      success: true,
      message: 'Fetch user profile details successfully.',
      data: { user: { ...ME, company: COMPANY }, user_image: null },
    };
  if (url === '/api/companies')
    return {
      success: true,
      message: 'Companies fetched successfully.',
      data: laravelPage(
        [{ ...COMPANY, users_count: MEMBER_DEFS.length, products_count: products.length }],
        p,
        '/api/companies'
      ),
    };
  if (url === '/api/products')
    return {
      success: true,
      message: 'Products fetched successfully.',
      data: laravelPage(sortBy(searchIn(products, p.search, ['name']), p), p, '/api/products'),
      filters: {
        user_id: null,
        search: p.search ?? null,
        sort_by: p.sort_by ?? 'id',
        sort_order: p.sort_order ?? 'asc',
      },
    };
  if ((m = url.match(/^\/api\/products\/(\d+)$/)))
    return { ...productDetail(Number(m[1]), p), message: 'Product retrieved successfully.' };
  if ((m = url.match(/^\/api\/devices\/product\/(\d+)$/))) {
    const rows = devices.filter(d => d.product_id === Number(m![1])).map(d => strip(withValue(d)));

    return {
      success: true,
      message: 'Devices retrieved successfully.',
      data: rows,
      userPreference: attributes(),
      assigned_device_ids: rows.map(r => r.id),
    };
  }
  if ((m = url.match(/^\/api\/product-settings\/(\d+)$/))) {
    const pr = products[Number(m[1]) - 1];
    const d = devices.find(x => x.product_id === Number(m![1]));

    return {
      success: true,
      message: 'Product settings retrieved successfully',
      product_id: Number(m[1]),
      product_name: pr?.name,
      raw_packet: rawPacket(d?.name ?? 'device', d?.device_unique_identifier ?? ''),
      user_preference_attributes: attributes(),
      token: 'showcase',
    };
  }
  if (url === '/api/dashboard/packet-history') return packets(Number(p.product_id) || 1, p);
  if (url === '/api/dashboard/analytics') return analytics();
  if (url === '/api/connectors/health')
    return ok({
      mqtt: connector('mqtt-central', true, 18432, {
        supports_discovery: true,
        supports_read: true,
        supports_write: true,
        is_push_based: true,
      }),
      webhook: connector('webhook-central', true, 96210, {
        supports_discovery: false,
        supports_read: true,
        supports_write: false,
        is_push_based: true,
      }),
    });
  if (url === '/api/roles/company') return rolesRes();
  if ((m = url.match(/^\/api\/roles\/(\d+)$/))) {
    const r = rolesRes().roles.find(x => x.id === Number(m![1]));

    return r
      ? { success: true, message: 'Role fetched successfully.', role: r, data: r }
      : undefined;
  }
  if (url === '/api/members') return members(p);

  return undefined;
}
