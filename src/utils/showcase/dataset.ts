/* eslint-disable @typescript-eslint/no-explicit-any */
import { DAY, HOUR, iso, makeRng, ymd } from './rng';

/**
 * One consistent, deterministic fake fleet for the portfolio showcase ("Indus Freight Co.", Pakistan).
 * Dates are relative to load time so the data never goes stale; everything else is seeded.
 * Record shapes mirror the real API (ids are strings).
 */
const rng = makeRng(20260927);
const NOW = Date.now();
export const showcaseNow = () => NOW;
export const COMPANY_ID = '2';
const AUDIT = { id: '2', first_name: 'Junead', last_name: 'Chaminade' };

export interface Yard {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
}

const YARD_SEED: [string, string, number, number, string][] = [
  ['Karachi Port Yard', 'Karachi', 24.8465, 66.9963, 'Port Qasim Rd, Karachi'],
  ['Lahore Dry Port', 'Lahore', 31.5204, 74.3587, 'Ferozepur Rd, Lahore'],
  ['Islamabad Hub', 'Islamabad', 33.6844, 73.0479, 'I-9 Industrial Area, Islamabad'],
  ['Faisalabad Depot', 'Faisalabad', 31.4504, 73.135, 'Sargodha Rd, Faisalabad'],
  ['Multan Terminal', 'Multan', 30.1575, 71.5249, 'Bosan Rd, Multan'],
  ['Peshawar Yard', 'Peshawar', 34.0151, 71.5249, 'Ring Rd, Peshawar'],
  ['Sialkot Cargo', 'Sialkot', 32.4945, 74.5229, 'Airport Rd, Sialkot'],
  ['Hyderabad Depot', 'Hyderabad', 25.396, 68.3578, 'Latifabad, Hyderabad'],
];

const audit = { created_by: '2', updated_by: '2', created_by_user: AUDIT, updated_by_user: AUDIT };

export const yards: any[] = YARD_SEED.map(([name, city, lat, lon, address], i) => ({
  id: String(i + 1),
  company_id: COMPANY_ID,
  name,
  address,
  latitude: lat,
  longitude: lon,
  radius_m: 350 + i * 40,
  is_active: true,
  slots_count: [48, 36, 30, 24, 28, 18, 16, 20][i],
  has_layout: i < 5,
  created_at: iso(NOW - (200 - i * 9) * DAY),
  updated_at: iso(NOW - (12 - i) * DAY),
  ...audit,
  _city: city,
}));

export const geofences: any[] = [
  ...yards.map((y, i) => ({
    id: String(i + 1),
    company_id: COMPANY_ID,
    yard_id: y.id,
    name: `${y.name} perimeter`,
    center_latitude: y.latitude,
    center_longitude: y.longitude,
    radius_m: y.radius_m,
    alert_on: 'both',
    is_active: true,
    created_at: y.created_at,
    updated_at: y.updated_at,
    ...audit,
    yard: { id: y.id, name: y.name },
  })),
  ...(
    [
      ['Karachi Port Gate 2', 24.8, 66.98, 'enter', 1],
      ['M-2 Motorway toll plaza', 31.72, 73.5, 'both', null],
      ['Khyber Pass checkpoint', 34.0, 71.15, 'exit', null],
      ['Gwadar corridor no-go zone', 25.13, 62.32, 'enter', null],
    ] as const
  ).map(([name, lat, lon, alert, yardId], i) => ({
    id: String(9 + i),
    company_id: COMPANY_ID,
    yard_id: yardId ? String(yardId) : null,
    name,
    center_latitude: lat,
    center_longitude: lon,
    radius_m: 900 + i * 250,
    alert_on: alert,
    is_active: i !== 3,
    created_at: iso(NOW - (60 - i * 8) * DAY),
    updated_at: iso(NOW - (5 + i) * DAY),
    ...audit,
    yard: yardId ? { id: String(yardId), name: YARD_SEED[yardId - 1][0] } : null,
  })),
];

// ── Vehicles ──────────────────────────────────────────────────────────────
const CATS: [string, [string, string][], number][] = [
  [
    'Truck',
    [
      ['Hino', '500'],
      ['Isuzu', 'NPR'],
      ['Volvo', 'FH16'],
      ['Mercedes', 'Actros'],
      ['Tata', 'LPT 1613'],
    ],
    16,
  ],
  [
    'Semi-Trailer',
    [
      ['Volvo', 'FM'],
      ['Mercedes', 'Actros 1848'],
      ['Hino', '700'],
    ],
    10,
  ],
  [
    'Van',
    [
      ['Toyota', 'HiAce'],
      ['Suzuki', 'Bolan'],
      ['Ford', 'Transit'],
    ],
    10,
  ],
  [
    'Pickup',
    [
      ['Toyota', 'Hilux'],
      ['Suzuki', 'Ravi'],
      ['Isuzu', 'D-Max'],
    ],
    8,
  ],
  [
    'Tanker',
    [
      ['Hino', 'FM'],
      ['Tata', 'LPT 2518'],
    ],
    6,
  ],
  [
    'Bus',
    [
      ['Hino', 'RK'],
      ['Yutong', 'ZK6122'],
    ],
    3,
  ],
  [
    'Trailer',
    [
      ['Tata', 'Flatbed'],
      ['Volvo', 'Reefer'],
    ],
    3,
  ],
];
const PLATE_PREFIX = ['LEB', 'LEC', 'LEA', 'KHI', 'BLA', 'RIS', 'FSD', 'MLT'];
const FUELS: Record<string, string> = {
  Truck: 'diesel',
  'Semi-Trailer': 'diesel',
  Tanker: 'diesel',
  Bus: 'diesel',
  Trailer: 'diesel',
  Van: 'petrol',
  Pickup: 'diesel',
};

export interface Veh {
  id: string;
  yardIdx: number;
  category: string;
  tracker: boolean;
  status: string;
  driverId: string | null;
  raw: any;
}

export const vehicleModels: Veh[] = [];
CATS.forEach(([cat, models, n]) => {
  for (let k = 0; k < n; k++) {
    const idx = vehicleModels.length;
    const [make, model] = models[k % models.length];
    const status =
      idx >= 52 ? (idx === 55 ? 'sold' : 'retired') : idx >= 48 ? 'in_maintenance' : 'active';
    const year = rng.int(2013, 2025);
    const heavy = ['Truck', 'Semi-Trailer', 'Tanker', 'Trailer'].includes(cat);
    const id = String(101 + idx);
    const tracker =
      status === 'active' && idx % 5 !== 4 ? true : status === 'in_maintenance' && idx % 2 === 0;
    const created = NOW - rng.int(90, 420) * DAY;

    vehicleModels.push({
      id,
      yardIdx: idx % 8,
      category: cat,
      tracker,
      status,
      driverId: null,
      raw: {
        id,
        company_id: COMPANY_ID,
        name: `${cat === 'Semi-Trailer' ? 'Prime Mover' : cat} ${String(idx + 1).padStart(2, '0')} · ${make}`,
        vehicle_category: cat,
        make,
        model,
        plate: `${PLATE_PREFIX[idx % 8]}-${rng.int(1000, 9999)}`,
        vin: `PK${make.slice(0, 3).toUpperCase()}${rng.int(10000000, 99999999)}${year % 100}`,
        year,
        fuel_type: FUELS[cat],
        tank_capacity_liters: heavy ? rng.pick([300, 400, 600, 800]) : rng.pick([55, 70, 80]),
        odometer_km: rng.int(heavy ? 60_000 : 18_000, heavy ? 480_000 : 190_000),
        ownership_type: rng.weighted([
          ['owned', 6],
          ['leased', 3],
          ['rented', 1],
        ] as const),
        cost_centre: rng.pick(['Northern Ops', 'Southern Ops', 'Port Logistics', 'Cross-border']),
        lifecycle_status: status,
        acquisition_date: ymd(created - 200 * DAY),
        acquisition_cost: heavy ? rng.int(9, 32) * 1_000_000 : rng.int(3, 9) * 1_000_000,
        length_m: heavy ? rng.float(6, 16) : rng.float(4, 5.6),
        width_m: 2.5,
        height_m: heavy ? 3.9 : 1.9,
        gross_weight_kg: heavy ? rng.int(12, 40) * 1000 : rng.int(2, 4) * 1000,
        payload_kg: heavy ? rng.int(8, 30) * 1000 : rng.int(800, 2000),
        image_path: null,
        image_url: null,
        created_at: iso(created),
        updated_at: iso(NOW - rng.int(1, 30) * DAY),
        ...audit,
        current_device_assignment: null,
        current_driver_assignment: null,
      },
    });
  }
});

// ── Drivers ───────────────────────────────────────────────────────────────
const FIRST = [
  'Ahmed',
  'Bilal',
  'Usman',
  'Hamza',
  'Imran',
  'Kashif',
  'Tariq',
  'Zeeshan',
  'Naveed',
  'Faisal',
  'Adnan',
  'Shahid',
  'Rashid',
  'Waqas',
  'Asif',
  'Junaid',
  'Kamran',
  'Salman',
  'Irfan',
  'Nadeem',
  'Saad',
  'Farhan',
];
const LAST = [
  'Khan',
  'Malik',
  'Ali',
  'Chaudhry',
  'Butt',
  'Qureshi',
  'Siddiqui',
  'Baloch',
  'Rajput',
  'Awan',
  'Sheikh',
  'Gill',
  'Mirza',
  'Yousafzai',
  'Abbasi',
  'Niazi',
];
const LIC_CLASS = ['HTV', 'HTV', 'LTV', 'PSV', 'HTV'];

export interface Drv {
  id: string;
  name: string;
  vehicleId: string | null;
  raw: any;
}

export const driverModels: Drv[] = Array.from({ length: 44 }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[(i * 7 + 3) % LAST.length];
  const id = String(201 + i);
  const licExp =
    NOW + (i % 11 === 0 ? -rng.int(5, 60) : i % 7 === 0 ? rng.int(3, 28) : rng.int(45, 900)) * DAY;
  const status = i === 41 ? 'suspended' : i >= 42 ? 'inactive' : 'active';
  const avail =
    status !== 'active'
      ? 'off_duty'
      : rng.weighted([
          ['available', 5],
          ['on_trip', 4],
          ['off_duty', 1],
          ['on_leave', 1],
        ] as const);

  return {
    id,
    name: `${first} ${last}`,
    vehicleId: null,
    raw: {
      id,
      company_id: COMPANY_ID,
      first_name: first,
      last_name: last,
      email: `${first}.${last}${i}@indusfreight.pk`.toLowerCase(),
      phone: `+92 3${rng.int(0, 4)}${rng.int(0, 9)} ${rng.int(1000000, 9999999)}`,
      license_number: `PJB-${rng.int(100000, 999999)}-${i % 9}`,
      license_class: LIC_CLASS[i % LIC_CLASS.length],
      license_expiry_date: ymd(licExp),
      status,
      employment_status: i % 9 === 0 ? 'contractor' : i % 13 === 0 ? 'part_time' : 'full_time',
      availability_status: avail,
      certifications: rng.chance(0.4)
        ? ['Hazmat', 'Defensive driving'].slice(0, rng.int(1, 2))
        : [],
      payroll_reference: `EMP-${1000 + i}`,
      hire_date: ymd(NOW - rng.int(120, 2400) * DAY),
      photo_path: null,
      created_at: iso(NOW - rng.int(100, 900) * DAY),
      updated_at: iso(NOW - rng.int(1, 40) * DAY),
      ...audit,
      is_license_expired: licExp < NOW,
      is_license_expiring_soon: licExp >= NOW && licExp < NOW + 30 * DAY,
      current_assignment: null,
    },
  };
});

// Assign drivers to active vehicles (one each, ~85 % of active vehicles) and trackers to devices.
const activeDrivers = driverModels.filter(d => d.raw.status === 'active');
vehicleModels
  .filter(v => v.status === 'active')
  .forEach((v, i) => {
    const d = activeDrivers[i];

    if (!d || i % 7 === 6) return;
    v.driverId = d.id;
    d.vehicleId = v.id;
    const assignedAt = iso(NOW - rng.int(5, 120) * DAY);

    v.raw.current_driver_assignment = {
      id: String(500 + i),
      vehicle_id: v.id,
      driver_id: d.id,
      assigned_at: assignedAt,
      unassigned_at: null,
      driver: { id: d.id, first_name: d.raw.first_name, last_name: d.raw.last_name },
    };
    d.raw.current_assignment = {
      id: String(500 + i),
      vehicle_id: v.id,
      driver_id: d.id,
      assigned_at: assignedAt,
      vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate },
    };
  });
vehicleModels.forEach((v, i) => {
  if (!v.tracker) return;
  v.raw.current_device_assignment = {
    id: String(700 + i),
    vehicle_id: v.id,
    device_id: String(900 + i),
    assigned_at: v.raw.created_at,
    unassigned_at: null,
    device: {
      id: String(900 + i),
      name: `GPS-${v.raw.plate}`,
      device_unique_identifier: `86${rng.int(1000000000000, 9999999999999)}`,
    },
  };
});

// ── Trips ─────────────────────────────────────────────────────────────────
const CITY_ROUTES: [number, number, number][] = [
  [0, 1, 1210],
  [1, 2, 375],
  [0, 4, 890],
  [3, 1, 130],
  [2, 5, 175],
  [4, 1, 340],
  [6, 1, 125],
  [7, 0, 165],
  [0, 3, 1150],
  [2, 6, 290],
  [4, 0, 890],
  [1, 3, 130],
  [5, 2, 175],
  [0, 7, 165],
  [3, 4, 345],
];
const PURPOSES = [
  'Container haul',
  'Retail distribution',
  'Fuel delivery',
  'Textile export run',
  'Cement delivery',
  'Cold-chain delivery',
  'Staff shuttle',
  'Spare-parts transfer',
];
const CANCEL = ['Customer postponed', 'Vehicle breakdown', 'Road closure', 'Driver unavailable'];
const CUSTOMERS = [
  'Al-Karam Textiles',
  'Fauji Cement',
  'Lucky Retail',
  'Sapphire Mills',
  'Engro Foods',
  'National Foods',
  'Hub Power Co.',
  'Gul Ahmed',
];

const eligible = vehicleModels.filter(v => v.status === 'active' || v.status === 'in_maintenance');

export const tripModels: any[] = [];
for (let i = 0; i < 160; i++) {
  const v = eligible[rng.int(0, eligible.length - 1)];
  const drv = v.driverId
    ? driverModels.find(d => d.id === v.driverId)!
    : activeDrivers[rng.int(0, activeDrivers.length - 1)];
  const [oi, di, km] = CITY_ROUTES[rng.int(0, CITY_ROUTES.length - 1)];
  const o = yards[oi];
  const d = yards[di];
  const durH = Math.max(2, km / rng.float(42, 58));
  const state =
    i < 8
      ? 'in_progress'
      : i < 18
        ? 'planned'
        : rng.weighted([
            ['completed', 80],
            ['cancelled', 13],
          ] as const);
  const startMs =
    state === 'in_progress'
      ? NOW - rng.float(0.5, durH * 0.8) * HOUR
      : state === 'planned'
        ? NOW + rng.int(2, 96) * HOUR
        : NOW - rng.int(1, 45) * DAY - rng.int(0, 12) * HOUR;
  const done = state === 'completed';
  const actualKm = done ? Math.round(km * rng.float(0.98, 1.08)) : null;
  const ageFrac = Math.min(1, Math.max(0, (NOW - startMs) / (45 * DAY)));
  // Punctuality improves over time: older trips run late more often.
  const delayMin = done
    ? Math.round(rng.chance(0.14 + 0.2 * ageFrac) ? rng.float(20, 110) : rng.float(-25, 12))
    : 0;
  const ref = `TRP-${String(2400 + i)}`;

  tripModels.push({
    id: String(300 + i),
    company_id: COMPANY_ID,
    vehicle_id: v.id,
    driver_id: drv.id,
    device_id: v.tracker ? String(900 + vehicleModels.indexOf(v)) : null,
    fleet_customer_id: null,
    trip_reference: ref,
    purpose: PURPOSES[rng.int(0, PURPOSES.length - 1)],
    status: state,
    origin_address: o.address,
    origin_latitude: o.latitude,
    origin_longitude: o.longitude,
    destination_address: d.address,
    destination_latitude: d.latitude,
    destination_longitude: d.longitude,
    planned_start_at: iso(startMs),
    planned_end_at: iso(startMs + durH * HOUR),
    actual_start_at: state === 'planned' ? null : iso(startMs + rng.int(-5, 25) * 60_000),
    actual_end_at: done ? iso(startMs + durH * HOUR + delayMin * 60_000) : null,
    planned_distance_km: km,
    actual_distance_km: actualKm,
    actual_duration_minutes: done ? Math.round(durH * 60 + delayMin) : null,
    fuel_used_liters: done
      ? Math.round(actualKm! * (FUELS[v.category] === 'petrol' ? 0.11 : 0.3))
      : null,
    odometer_start_km: v.raw.odometer_km - km,
    odometer_end_km: done ? v.raw.odometer_km : null,
    notes: state === 'in_progress' ? null : `Customer: ${CUSTOMERS[i % CUSTOMERS.length]}`,
    cancellation_reason: state === 'cancelled' ? rng.pick(CANCEL) : null,
    created_at: iso(startMs - 2 * DAY),
    updated_at: iso(Math.min(NOW, startMs + durH * HOUR)),
    ...audit,
    vehicle: { id: v.id, name: v.raw.name },
    driver: { id: drv.id, first_name: drv.raw.first_name, last_name: drv.raw.last_name },
    customer: null,
    _oi: oi,
    _di: di,
    _delay: delayMin,
  });
}

// ── Incidents ─────────────────────────────────────────────────────────────
const INC: [string, string][] = [
  ['Speeding', 'moderate'],
  ['Harsh braking', 'minor'],
  ['Minor collision', 'moderate'],
  ['Tyre burst', 'minor'],
  ['Route deviation', 'minor'],
  ['Cargo damage', 'severe'],
  ['Accident', 'severe'],
  ['Idle over limit', 'minor'],
];
const INC_TEXT = [
  'Recorded 92 km/h in an 80 km/h zone on the N-5.',
  'Sudden stop near a toll plaza; cargo shifted slightly.',
  'Scrape with a private car at a junction; no injuries.',
  'Rear tyre failure on the M-2, replaced roadside.',
  'Took an unapproved detour of 18 km.',
  'Pallets damaged on unloading at the destination.',
  'Rear-ended at a red light; police report filed.',
  'Engine idling for 55 minutes at a customer gate.',
];

export const incidentModels: any[] = Array.from({ length: 16 }, (_, i) => {
  const [type, sev] = INC[i % INC.length];
  const drv = driverModels[(i * 5) % 40];
  const veh = eligible[(i * 3) % eligible.length];

  return {
    id: String(400 + i),
    driver_id: drv.id,
    vehicle_id: veh.id,
    incident_type: type,
    severity: i === 6 ? 'severe' : sev,
    incident_date: iso(NOW - (2 + i * 2.6) * DAY),
    description: INC_TEXT[i % INC_TEXT.length],
    logged_by: '2',
    created_at: iso(NOW - (2 + i * 2.6) * DAY),
    updated_at: iso(NOW - (2 + i * 2.6) * DAY),
    ...audit,
    driver: { id: drv.id, first_name: drv.raw.first_name, last_name: drv.raw.last_name },
    vehicle: { id: veh.id, name: veh.raw.name },
  };
});

// ── Assignment history ────────────────────────────────────────────────────
export const assignmentModels: any[] = [];
vehicleModels.forEach(v => {
  const n = v.status === 'active' ? rng.int(1, 3) : 1;

  for (let k = 0; k < n; k++) {
    const d = driverModels[rng.int(0, 39)];
    const current = k === 0 && v.driverId;
    const drv = current ? driverModels.find(x => x.id === v.driverId)! : d;
    const assigned = NOW - (current ? rng.int(5, 120) : rng.int(130, 400) + k * 90) * DAY;
    const unassigned = current ? null : assigned + rng.int(30, 120) * DAY;

    assignmentModels.push({
      id: String(600 + assignmentModels.length),
      driver_id: drv.id,
      vehicle_id: v.id,
      assigned_at: iso(assigned),
      unassigned_at: unassigned ? iso(unassigned) : null,
      assigned_by: AUDIT,
      unassigned_by: unassigned ? AUDIT : null,
      notes: null,
      trip_count: rng.int(2, 60),
      distance_km: rng.int(600, 22000),
      created_at: iso(assigned),
      updated_at: iso(unassigned ?? assigned),
      is_active: !unassigned,
      duration_days: unassigned ? Math.round((unassigned - assigned) / DAY) : null,
      driver: {
        id: drv.id,
        first_name: drv.raw.first_name,
        last_name: drv.raw.last_name,
        license_number: drv.raw.license_number,
      },
      vehicle: { id: v.id, name: v.raw.name, vehicle_category: v.category, plate: v.raw.plate },
    });
  }
});

// ── Geofence events (~220 over 21 days, from real trips' yards) ──────────
export const geofenceEvents: any[] = [];
for (let i = 0; i < 220; i++) {
  const v = eligible[rng.int(0, eligible.length - 1)];
  const g = geofences[rng.int(0, 7)];
  const t = tripModels.find(x => x.vehicle_id === v.id);

  geofenceEvents.push({
    id: String(800 + i),
    geofence_id: g.id,
    geofence: { id: g.id, name: g.name, yard_id: g.yard_id },
    vehicle_id: v.id,
    trip_id: t?.id ?? null,
    event_type: i % 2 === 0 ? 'enter' : 'exit',
    occurred_at: iso(NOW - rng.float(0.1, 21) * DAY),
    vehicle: { id: v.id, name: v.raw.name },
  });
}
geofenceEvents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

// ── Maintenance schedules ─────────────────────────────────────────────────
const SERVICES: [string, number, number][] = [
  ['Oil & filter change', 90, 15000],
  ['Brake inspection', 180, 30000],
  ['Tyre rotation', 120, 20000],
  ['Full service', 365, 60000],
  ['Coolant flush', 240, 40000],
];

export const scheduleModels: any[] = [];
vehicleModels
  .filter(v => v.status !== 'sold' && v.status !== 'retired')
  .forEach(v => {
    for (let k = 0; k < 2; k++) {
      const [svc, days, km] = SERVICES[(vehicleModels.indexOf(v) + k * 2) % SERVICES.length];
      const daysLeft = rng.weighted([
        [rng.int(-25, -1), 1],
        [rng.int(0, 14), 1],
        [rng.int(15, 160), 14],
      ] as const);
      const kmLeft = Math.round(daysLeft * rng.float(60, 140));
      const status =
        daysLeft < 0 || kmLeft < 0
          ? 'overdue'
          : daysLeft <= 14 || kmLeft <= 1000
            ? 'due_soon'
            : 'ok';

      scheduleModels.push({
        id: String(1000 + scheduleModels.length),
        vehicle_id: v.id,
        vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate },
        service_type: svc,
        interval_days: days,
        interval_km: km,
        last_service_date: ymd(NOW + (daysLeft - days) * DAY),
        next_due_date: ymd(NOW + daysLeft * DAY),
        days_until_due: daysLeft,
        km_until_due: kmLeft,
        status,
        due_by: status === 'ok' ? null : daysLeft < 0 ? 'date' : 'km',
        created_at: iso(NOW - 200 * DAY),
        updated_at: iso(NOW - 10 * DAY),
        ...audit,
      });
    }
  });

// ── Live positions (one per tracked active vehicle, along its route) ─────
export const positionModels: any[] = [];
vehicleModels
  .filter(v => v.tracker && v.status === 'active')
  .forEach((v, i) => {
    const trip = tripModels.find(t => t.vehicle_id === v.id && t.status === 'in_progress');
    const home = yards[v.yardIdx];
    let lat = home.latitude + rng.float(-0.03, 0.03);
    let lon = home.longitude + rng.float(-0.03, 0.03);
    let speed = 0;
    let age = rng.int(4, 90);

    if (trip) {
      const f = Math.min(
        0.95,
        Math.max(
          0.05,
          (NOW - Date.parse(trip.actual_start_at)) /
            (Date.parse(trip.planned_end_at) - Date.parse(trip.actual_start_at))
        )
      );

      lat = trip.origin_latitude + (trip.destination_latitude - trip.origin_latitude) * f;
      lon = trip.origin_longitude + (trip.destination_longitude - trip.origin_longitude) * f;
      speed = rng.int(48, 86);
    } else if (i % 5 === 0) {
      age = rng.int(3600, 40_000); // offline
    } else if (i % 4 === 0) {
      speed = rng.int(0, 4); // idling
    } else if (i % 3 === 0) {
      // Local delivery run near the home yard.
      lat = home.latitude + rng.float(-0.12, 0.12);
      lon = home.longitude + rng.float(-0.12, 0.12);
      speed = rng.int(28, 64);
    }

    positionModels.push({
      id: String(5000 + i),
      device_id: v.raw.current_device_assignment.device_id,
      latitude: lat,
      longitude: lon,
      speed,
      heading: rng.int(0, 359),
      recorded_at: iso(NOW - age * 1000),
      age_seconds: age,
      fresh: age < 900,
      device: {
        id: v.raw.current_device_assignment.device_id,
        name: v.raw.current_device_assignment.device.name,
        device_unique_identifier: v.raw.current_device_assignment.device.device_unique_identifier,
        product_id: '1',
        current_vehicle_assignment: {
          vehicle_id: v.id,
          vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate },
        },
      },
      _vehicleId: v.id,
    });
  });

// ── Fuel + maintenance logs (feed cost and analytics) ────────────────────
const VENDORS = ['PSO', 'Shell Pakistan', 'Attock Petroleum', 'Total Parco', 'Hascol'];
export const FUEL_PRICE = { diesel: 272, petrol: 268 } as Record<string, number>;

export const fuelLogModels: any[] = [];
tripModels
  .filter(t => t.status === 'completed')
  .forEach((t, i) => {
    if (i % 5 === 4) return;
    const v = vehicleModels.find(x => x.id === t.vehicle_id)!;
    const liters = Math.round(t.fuel_used_liters * rng.float(0.9, 1.2)) || 40;
    const price = Math.round(FUEL_PRICE[v.raw.fuel_type] + rng.float(-6, 6));

    fuelLogModels.push({
      id: String(2000 + fuelLogModels.length),
      vehicle_id: v.id,
      vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate, vehicle_category: v.category },
      filled_at: t.actual_end_at,
      liters,
      price_per_liter: price,
      total_cost: liters * price,
      vendor: rng.pick(VENDORS),
      odometer_km: t.odometer_end_km,
      full_tank: rng.chance(0.75),
    });
  });

const MAINT_TYPES = [
  'Oil & filter change',
  'Brake pad replacement',
  'Tyre replacement',
  'Full service',
  'Battery replacement',
  'AC repair',
  'Suspension repair',
];

export const maintenanceLogModels: any[] = Array.from({ length: 46 }, (_, i) => {
  const v = eligible[(i * 7) % eligible.length];
  const service = MAINT_TYPES[i % MAINT_TYPES.length];
  const date = NOW - rng.float(0.5, 88) * DAY;

  return {
    id: String(3000 + i),
    vehicle_id: v.id,
    vehicle: { id: v.id, name: v.raw.name, plate: v.raw.plate, vehicle_category: v.category },
    service_type: service,
    serviced_at: iso(date),
    cost: Math.round(rng.float(6, 140)) * 1000,
    vendor: rng.pick([
      'Al-Fatah Motors',
      'Hino Service Centre',
      'Karachi Auto Works',
      'Lahore Fleet Care',
    ]),
    odometer_km: v.raw.odometer_km - rng.int(500, 9000),
    notes: null,
  };
});

// ── Compliance documents (vehicle papers + driver medicals) ──────────────
const docRng = makeRng(77);

const docExpiry = () =>
  NOW +
  docRng.weighted([
    [docRng.int(-40, -1), 1],
    [docRng.int(0, 30), 2],
    [docRng.int(31, 60), 2],
    [docRng.int(61, 400), 12],
  ] as const) *
    DAY;

export const complianceDocs: any[] = [
  ...vehicleModels
    .filter(v => v.status !== 'sold')
    .flatMap(v =>
      ['Insurance', 'Fitness certificate', 'Route permit'].map(t => ({
        owner: 'vehicle',
        ownerId: v.id,
        ownerName: v.raw.name,
        type: t,
      }))
    ),
  ...driverModels.map(d => ({
    owner: 'driver',
    ownerId: d.id,
    ownerName: d.name,
    type: 'Medical certificate',
  })),
].map((d, i) => {
  const exp = docExpiry();

  return {
    id: String(4000 + i),
    documentable_type: d.owner,
    documentable_id: d.ownerId,
    owner_name: d.ownerName,
    document_type: d.type,
    document_number: `DOC-${10000 + i}`,
    issue_date: ymd(exp - 365 * DAY),
    expiry_date: ymd(exp),
    created_at: iso(NOW - 200 * DAY),
    updated_at: iso(NOW - 20 * DAY),
  };
});

// The map centres on the newest report: make it a Lahore-based vehicle so the default view is central Pakistan.
const lead = positionModels.find(p => {
  const v = vehicleModels.find(x => x.id === p._vehicleId)!;

  return v.yardIdx === 1 && p.age_seconds < 900;
});

if (lead) {
  lead.age_seconds = 2;
  lead.recorded_at = iso(NOW - 2000);
  lead.fresh = true;
}
