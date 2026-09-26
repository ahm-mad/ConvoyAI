/* eslint-disable @typescript-eslint/no-explicit-any */
import { allFills } from './analytics';
import {
  assignmentModels,
  complianceDocs,
  driverModels,
  incidentModels,
  maintenanceLogModels,
  positionModels,
  scheduleModels,
  showcaseNow,
  tripModels,
  vehicleModels,
  yards,
  geofences,
} from './dataset';
import { ok } from './fleet';
import { DAY, HOUR, iso, makeRng } from './rng';
import { vehDay } from './metrics';
import { roadPath, simulatedPositions, tripFraction } from './simulation';

type Params = Record<string, any>;
type Row = Record<string, any>;

const AUDIT = { id: '2', first_name: 'Junead', last_name: 'Chaminade' };
const audit = { created_by: '2', updated_by: null, created_by_user: AUDIT, updated_by_user: null };
const notFound = (what: string) => ({ success: false, status: 404, message: `${what} not found.` });
const NOW = showcaseNow();

const paged = (rows: Row[], p: Params) => {
  const per = Math.min(100, Number(p.per_page) || 10);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Number(p.page) || 1, pages);

  return ok({
    items: rows.slice((page - 1) * per, page * per),
    pagination: { page, per_page: per, total, total_pages: pages },
  });
};
const laravel = (rows: Row[], p: Params) => {
  const per = Math.min(100, Number(p.per_page) || 10);
  const last = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(Number(p.page) || 1, last);

  return {
    current_page: page,
    data: rows.slice((page - 1) * per, page * per),
    first_page_url: '/?page=1',
    from: rows.length ? (page - 1) * per + 1 : null,
    last_page: last,
    last_page_url: `/?page=${last}`,
    links: [],
    next_page_url: page < last ? `/?page=${page + 1}` : null,
    path: '/',
    per_page: per,
    prev_page_url: page > 1 ? `/?page=${page - 1}` : null,
    to: rows.length ? Math.min(rows.length, page * per) : null,
    total: rows.length,
  };
};
const newest = (rows: Row[], key: string) =>
  [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));

const vehicleIdx = (id: string) => vehicleModels.findIndex(v => v.id === id);

// ── vehicle sub-resources ────────────────────────────────────────────────
const fuelLogsOf = (vid: string) =>
  newest(
    allFills()
      .filter(f => f.vehicle.id === vid)
      .map(f => ({
        id: f.fill_id,
        vehicle_id: vid,
        fill_date: f.fill_date,
        volume: f.volume,
        unit: 'liters',
        cost: f.cost,
        odometer_km: f.odometer_km,
        is_full_tank: f.is_full_tank,
        vendor: f.vendor,
        logged_by: '2',
        station_name: f.station_name,
        unit_price: f.price_per_liter,
        total_cost: f.cost,
        payment_method: f.payment_method,
        receipt_reference: f.receipt_reference,
        trip_id: null,
        created_at: f.fill_date,
        updated_at: f.fill_date,
        ...audit,
      })),
    'fill_date'
  );
const maintLogsOf = (vid: string) =>
  newest(
    maintenanceLogModels
      .filter(m => m.vehicle_id === vid)
      .map(m => ({
        id: m.id,
        vehicle_id: vid,
        maintenance_schedule_id: null,
        service_type: m.service_type,
        service_date: m.serviced_at,
        odometer_km: m.odometer_km,
        cost: m.cost,
        vendor: m.vendor,
        notes: m.notes,
        logged_by: '2',
        created_at: m.serviced_at,
        updated_at: m.serviced_at,
        ...audit,
      })),
    'service_date'
  );
const schedulesOf = (vid: string) =>
  scheduleModels
    .filter(s => s.vehicle_id === vid)
    .map(s => ({
      id: s.id,
      vehicle_id: vid,
      service_type: s.service_type,
      interval_days: s.interval_days,
      interval_km: s.interval_km,
      last_service_date: s.last_service_date,
      next_service_date: s.next_due_date,
      is_overdue_by_date: s.days_until_due < 0,
      odometer_baseline_km: null,
      odometer_baseline_date: null,
      last_service_odometer_km: null,
      created_at: s.created_at,
      updated_at: s.updated_at,
      ...audit,
    }));
const yardHistoryOf = (vid: string) => {
  const r = makeRng(Number(vid));

  return Array.from({ length: 6 }, (_, i) => {
    const y = yards[(vehicleIdx(vid) + i) % yards.length];
    const inAt = NOW - (i * 6 + r.int(1, 5)) * DAY;
    const out = i === 0 ? null : inAt + r.int(3, 30) * HOUR;

    return {
      id: String(6000 + Number(vid) * 10 + i),
      yard_slot_id: String(r.int(1, 20)),
      vehicle_id: vid,
      checked_in_at: iso(inAt),
      checked_out_at: out ? iso(out) : null,
      source: r.pick(['geofence', 'manual']),
      created_at: iso(inAt),
      updated_at: iso(out ?? inAt),
      slot: {
        id: String(r.int(1, 20)),
        yard_id: y.id,
        slot_number: `Slot ${r.int(1, y.slots_count)}`,
        yard: { id: y.id, name: y.name },
      },
    };
  });
};
const assignmentsOfVehicle = (vid: string) =>
  newest(
    assignmentModels.filter(a => a.vehicle_id === vid),
    'assigned_at'
  );
const assignmentsOfDriver = (did: string) =>
  newest(
    assignmentModels.filter(a => a.driver_id === did),
    'assigned_at'
  );

const vehicleDetail = (id: string) => {
  const v = vehicleModels.find(x => x.id === id);

  if (!v) return notFound('Vehicle');

  const pos = simulatedPositions().find(p => p._vehicleId === id);
  const idx = vehicleIdx(id);
  const week = Array.from({ length: 7 }, (_, i) => vehDay(idx, Math.floor(NOW / DAY) - i));
  const month = Array.from({ length: 30 }, (_, i) => vehDay(idx, Math.floor(NOW / DAY) - i));
  const km = (a: typeof week) => a.reduce((s, x) => s + x.km, 0);
  const fuel = fuelLogsOf(id);
  const ecoRows = allFills()
    .filter(f => f.vehicle.id === id && f.economy_km_per_l != null)
    .slice(-6);

  return ok({
    vehicle: v.raw,
    current_position: pos
      ? {
          id: pos.id,
          device_id: pos.device_id,
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed: pos.speed,
          heading: pos.heading,
          recorded_at: pos.recorded_at,
        }
      : null,
    stats: v.tracker
      ? {
          distance_km_7d: Math.round(km(week)),
          distance_km_30d: Math.round(km(month)),
          avg_speed_kmh_7d: 41.6,
          max_speed_kmh_7d: 87,
        }
      : { distance_km_7d: 0, distance_km_30d: 0, avg_speed_kmh_7d: null, max_speed_kmh_7d: null },
    maintenance_schedules: schedulesOf(id),
    maintenance_logs: maintLogsOf(id).slice(0, 5),
    fuel_logs: fuel.slice(0, 5),
    fuel_economy: ecoRows.length
      ? {
          economy:
            Math.round(
              (ecoRows.reduce((s, r) => s + r.economy_km_per_l, 0) / ecoRows.length) * 100
            ) / 100,
          unit: 'km/l',
          pairs_used: ecoRows.length,
        }
      : { economy: null, unit: null, pairs_used: 0 },
    yard_history: yardHistoryOf(id).slice(0, 3),
    driver_assignment_history: assignmentsOfVehicle(id)
      .slice(0, 3)
      .map(a => ({
        ...a,
        driver: {
          ...a.driver,
          license_class: driverModels.find(d => d.id === a.driver_id)?.raw.license_class,
        },
      })),
  });
};

const driverDetail = (id: string) => {
  const d = driverModels.find(x => x.id === id);

  if (!d) return notFound('Driver');

  const cur = d.raw.current_assignment;
  const veh = cur ? vehicleModels.find(v => v.id === cur.vehicle_id) : null;

  return ok({
    ...d.raw,
    current_assignment: cur
      ? {
          ...cur,
          unassigned_at: null,
          vehicle: {
            id: veh!.id,
            name: veh!.raw.name,
            vehicle_category: veh!.category,
            lifecycle_status: veh!.status,
            current_device_assignment: veh!.raw.current_device_assignment
              ? {
                  ...veh!.raw.current_device_assignment,
                  device: {
                    id: veh!.raw.current_device_assignment.device_id,
                    name: veh!.raw.current_device_assignment.device.name,
                  },
                }
              : null,
          },
        }
      : null,
    incidents: newest(
      incidentModels.filter(i => i.driver_id === id),
      'incident_date'
    ).slice(0, 5),
    recent_assignments: assignmentsOfDriver(id)
      .slice(0, 3)
      .map(a => ({ ...a, vehicle: { ...a.vehicle, plate: a.vehicle.plate } })),
  });
};

// ── trips ─────────────────────────────────────────────────────────────────
const stopsOf = (t: Row) => {
  if (t.id.charCodeAt(t.id.length - 1) % 3 !== 0) return [];

  // The yard closest to the middle of the route (other than the two endpoints).
  const mx = (t.origin_latitude + t.destination_latitude) / 2;
  const my = (t.origin_longitude + t.destination_longitude) / 2;
  const mid = yards
    .filter((_, i) => i !== t._oi && i !== t._di)
    .sort(
      (a, b) =>
        (a.latitude - mx) ** 2 +
        (a.longitude - my) ** 2 -
        ((b.latitude - mx) ** 2 + (b.longitude - my) ** 2)
    )[0];

  return [
    {
      id: String(7000 + Number(t.id)),
      trip_id: t.id,
      yard_id: mid.id,
      sequence: 1,
      stop_purpose: 'Cross-dock / driver rest',
      status:
        t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'arrived' : 'planned',
      planned_arrival_at: iso(Date.parse(t.planned_start_at) + 4 * HOUR),
      planned_departure_at: iso(Date.parse(t.planned_start_at) + 5 * HOUR),
      notes: null,
      yard: { id: mid.id, name: mid.name, latitude: mid.latitude, longitude: mid.longitude },
    },
  ];
};

const tripDetail = (id: string) => {
  const t = tripModels.find(x => x.id === id);

  if (!t) return notFound('Trip');

  const v = vehicleModels.find(x => x.id === t.vehicle_id)!;
  const { _oi, _di, _delay, ...rest } = t;

  return ok({
    ...rest,
    vehicle: {
      id: v.id,
      name: v.raw.name,
      vehicle_category: v.category,
      make: v.raw.make,
      model: v.raw.model,
    },
    driver: {
      ...t.driver,
      license_number: driverModels.find(d => d.id === t.driver_id)?.raw.license_number,
    },
    device: v.raw.current_device_assignment
      ? {
          id: v.raw.current_device_assignment.device_id,
          name: v.raw.current_device_assignment.device.name,
        }
      : null,
    destination_reached_at: t.status === 'completed' ? t.actual_end_at : null,
    awaiting_completion: false,
    planned_yards: stopsOf(t),
  });
};

const tripRoute = (id: string) => {
  const t = tripModels.find(x => x.id === id);

  if (!t) return notFound('Trip');

  const v = vehicleModels.find(x => x.id === t.vehicle_id)!;
  const r = makeRng(Number(id));
  // In-progress trips follow the live simulation, so the driven part always ends at the moving vehicle.
  const progress =
    t.status === 'completed'
      ? 1
      : t.status === 'in_progress'
        ? (tripFraction(t.vehicle_id) ?? 0.4)
        : 0;
  const path = roadPath(t._oi, t._di);
  const n = Math.round(progress * 60);
  const positions = Array.from({ length: n }, (_, i) => {
    const f = (i / 60) * (progress > 0 ? 1 : 0);
    const idx = path ? Math.min(path.length - 1, Math.round(f * (path.length - 1))) : 0;
    const pt = path
      ? path[idx]
      : ([
          t.origin_latitude + (t.destination_latitude - t.origin_latitude) * f,
          t.origin_longitude + (t.destination_longitude - t.origin_longitude) * f,
        ] as [number, number]);

    return {
      id: String(i),
      latitude: pt[0],
      longitude: pt[1],
      speed: r.int(40, 82),
      recorded_at: iso(Date.parse(t.actual_start_at ?? t.planned_start_at) + i * 10 * 60_000),
    };
  });
  const last = positions[positions.length - 1];

  return ok({
    trip: {
      id,
      trip_reference: t.trip_reference,
      status: t.status,
      purpose: t.purpose,
      planned_start_at: t.planned_start_at,
      planned_end_at: t.planned_end_at,
      actual_start_at: t.actual_start_at,
      actual_end_at: t.actual_end_at,
      planned_distance_km: t.planned_distance_km,
      actual_distance_km: t.actual_distance_km,
      destination_reached_at: t.status === 'completed' ? t.actual_end_at : null,
      awaiting_completion: false,
    },
    vehicle: { id: v.id, name: v.raw.name, vehicle_category: v.category, plate: v.raw.plate },
    driver: { id: t.driver_id, first_name: t.driver.first_name, last_name: t.driver.last_name },
    origin: {
      address: t.origin_address,
      latitude: t.origin_latitude,
      longitude: t.origin_longitude,
    },
    destination: {
      address: t.destination_address,
      latitude: t.destination_latitude,
      longitude: t.destination_longitude,
    },
    stops: stopsOf(t),
    // Showcase extra (ignored by the real API consumers): the road the trip follows, origin → destination.
    path: path ? path.map(([la, lo]) => ({ latitude: la, longitude: lo })) : null,
    trail: positions.length
      ? {
          positions,
          total_points: positions.length,
          computed_distance_km: Math.round(t.planned_distance_km * progress),
        }
      : null,
    current_position:
      t.status === 'in_progress' && last
        ? {
            latitude: last.latitude,
            longitude: last.longitude,
            speed: last.speed,
            recorded_at: last.recorded_at,
          }
        : null,
  });
};

// ── yard detail (layout + slots) ─────────────────────────────────────────
const layoutSvg = (name: string) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='480' viewBox='0 0 800 480'><rect width='800' height='480' rx='18' fill='#FFF6EC'/><rect x='24' y='24' width='752' height='432' rx='12' fill='#FBEBD9' stroke='#F2B98A' stroke-width='3' stroke-dasharray='10 8'/><rect x='24' y='214' width='752' height='52' fill='#EFD9C2'/><text x='400' y='247' font-family='sans-serif' font-size='18' fill='#B77A4A' text-anchor='middle'>${name.replace(/[<>&']/g, '')} · access lane</text><rect x='330' y='440' width='140' height='16' rx='6' fill='#F5A15F'/></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const yardDetail = (id: string) => {
  const y = yards.find(x => x.id === id);

  if (!y) return notFound('Yard');

  const r = makeRng(Number(id) * 31);
  const inYard = vehicleModels.filter(v => v.yardIdx === Number(id) - 1 && v.status === 'active');
  const cols = Math.min(12, Math.ceil(y.slots_count / 2));
  const rowsN = Math.ceil(y.slots_count / cols);
  const half = Math.ceil(rowsN / 2);
  const rowY = (row: number) =>
    row < half ? 0.36 - (half - 1 - row) * 0.11 : 0.64 + (row - half) * 0.11;
  const slots = Array.from({ length: y.slots_count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const occ = i < Math.round(y.slots_count * 0.6) && inYard[i % Math.max(1, inYard.length)];
    const veh = occ ? inYard[i % inYard.length] : null;

    return {
      id: String(8000 + Number(id) * 100 + i),
      yard_id: id,
      slot_number: `Slot ${i + 1}`,
      position_x: Math.round(((col + 0.5) / cols) * 900) / 1000 + 0.05,
      position_y: Math.round(rowY(row) * 1000) / 1000,
      max_length_m: r.pick([12, 16, 18, 20]),
      created_at: y.created_at,
      updated_at: y.updated_at,
      ...audit,
      current_event: veh
        ? {
            id: String(8500 + i),
            yard_slot_id: String(8000 + Number(id) * 100 + i),
            vehicle_id: veh.id,
            checked_in_at: iso(NOW - r.int(2, 60) * HOUR),
            checked_out_at: null,
            source: 'geofence',
            vehicle: {
              id: veh.id,
              name: veh.raw.name,
              vehicle_category: veh.category,
              make: veh.raw.make,
              model: veh.raw.model,
            },
          }
        : null,
    };
  });

  return ok({
    id,
    company_id: y.company_id,
    name: y.name,
    address: y.address,
    latitude: y.latitude,
    longitude: y.longitude,
    radius_m: y.radius_m,
    is_active: true,
    created_at: y.created_at,
    updated_at: y.updated_at,
    ...audit,
    layout: y.has_layout
      ? {
          id: String(700 + Number(id)),
          yard_id: id,
          url: layoutSvg(y.name),
          width_px: 800,
          height_px: 480,
        }
      : null,
    slots,
  });
};

// ── documents / trackers / history ───────────────────────────────────────
const docsOf = (p: Params) =>
  complianceDocs
    .filter(
      d =>
        (!p.documentable_type || d.documentable_type === p.documentable_type) &&
        (!p.documentable_id || d.documentable_id === String(p.documentable_id))
    )
    .map(d => ({
      id: d.id,
      company_id: '2',
      documentable_type: d.documentable_type,
      documentable_id: d.documentable_id,
      document_type: d.document_type,
      document_number: d.document_number,
      issue_date: d.issue_date,
      expiry_date: d.expiry_date,
      file_path: null,
      notes: null,
      created_at: d.created_at,
      updated_at: d.updated_at,
      ...audit,
    }));

const deviceHistory = (deviceId: string) => {
  const p = positionModels.find(x => String(x.device_id) === deviceId);

  if (!p) return ok([]);

  const r = makeRng(Number(deviceId));

  return ok(
    Array.from({ length: 48 }, (_, i) => ({
      id: 20000 + i,
      device_id: Number(deviceId),
      latitude: p.latitude - (47 - i) * 0.006 + Math.sin(i / 4) * 0.01,
      longitude: p.longitude - (47 - i) * 0.005 + Math.cos(i / 5) * 0.01,
      speed: r.int(0, 80),
      heading: r.int(0, 359),
      recorded_at: iso(NOW - (47 - i) * 15 * 60_000),
      created_at: iso(NOW - (47 - i) * 15 * 60_000),
      updated_at: iso(NOW - (47 - i) * 15 * 60_000),
    }))
  );
};

export function resolveDetails(url: string, p: Params): any | undefined {
  let m: RegExpMatchArray | null;

  if (url === '/api/vehicles/assignable-trackers')
    return ok(
      vehicleModels
        .filter(v => !v.tracker && v.status === 'active')
        .slice(0, 6)
        .map((v, i) => ({
          id: 950 + i,
          name: `GPS-SPARE-${i + 1}`,
          device_unique_identifier: `8600${1000 + i}`,
          status: 'active',
          has_position: false,
          product: { id: 1, name: 'Fleet tracker T3' },
        }))
    );
  if (url === '/api/compliance-documents') return ok(docsOf(p));
  if (url === '/api/compliance-documents/expiring-soon')
    return ok(
      docsOf(p)
        .filter(d => Date.parse(d.expiry_date) < NOW + 30 * DAY)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
        .slice(0, 20)
        .map(d => {
          const dr = driverModels.find(x => x.id === d.documentable_id);
          const ve = vehicleModels.find(x => x.id === d.documentable_id);

          return {
            ...d,
            documentable:
              d.documentable_type === 'driver'
                ? {
                    id: d.documentable_id,
                    first_name: dr?.raw.first_name,
                    last_name: dr?.raw.last_name,
                  }
                : { id: d.documentable_id, name: ve?.raw.name },
          };
        })
    );
  if (url === '/api/maintenance-logs')
    return paged(
      maintenanceLogModels.flatMap(m => maintLogsOf(m.vehicle_id).filter(x => x.id === m.id)),
      p
    );
  if (url === '/api/fuel-logs')
    return paged(
      vehicleModels.slice(0, 6).flatMap(v => fuelLogsOf(v.id).slice(0, 10)),
      p
    );

  if ((m = url.match(/^\/api\/fleet\/devices\/(\d+)\/history$/))) return deviceHistory(m[1]);
  if ((m = url.match(/^\/api\/vehicles\/(\d+)$/))) return vehicleDetail(m[1]);
  if ((m = url.match(/^\/api\/vehicles\/(\d+)\/maintenance-logs$/)))
    return paged(maintLogsOf(m[1]), p);
  if ((m = url.match(/^\/api\/vehicles\/(\d+)\/fuel-logs$/))) return paged(fuelLogsOf(m[1]), p);
  if ((m = url.match(/^\/api\/vehicles\/(\d+)\/yard-history$/)))
    return paged(yardHistoryOf(m[1]), p);
  if ((m = url.match(/^\/api\/vehicles\/(\d+)\/incidents$/)))
    return paged(
      newest(
        incidentModels.filter(i => i.vehicle_id === m![1]),
        'incident_date'
      ),
      p
    );
  if ((m = url.match(/^\/api\/vehicles\/(\d+)\/assignment-history$/))) {
    const v = vehicleModels.find(x => x.id === m![1]);
    const rows = assignmentsOfVehicle(m[1]);

    return ok({
      vehicle: { id: m[1], name: v?.raw.name, plate: v?.raw.plate },
      summary: {
        total_assignments: rows.length,
        active_assignment: rows.some(a => a.is_active),
        total_days_in_service: rows.reduce((s, a) => s + (a.duration_days ?? 0), 0),
        unique_drivers: new Set(rows.map(a => a.driver_id)).size,
        total_trips: rows.reduce((s, a) => s + a.trip_count, 0),
        total_distance_km: rows.reduce((s, a) => s + a.distance_km, 0),
      },
      history: laravel(rows, p),
    });
  }
  if ((m = url.match(/^\/api\/drivers\/(\d+)$/))) return driverDetail(m[1]);
  if ((m = url.match(/^\/api\/drivers\/(\d+)\/incidents$/)))
    return paged(
      newest(
        incidentModels.filter(i => i.driver_id === m![1]),
        'incident_date'
      ),
      p
    );
  if ((m = url.match(/^\/api\/drivers\/(\d+)\/assignment-history$/))) {
    const d = driverModels.find(x => x.id === m![1]);
    const rows = assignmentsOfDriver(m[1]);

    return ok({
      driver: { id: m[1], name: d?.name },
      summary: {
        total_assignments: rows.length,
        active_assignment: rows.some(a => a.is_active),
        total_days_assigned: rows.reduce((s, a) => s + (a.duration_days ?? 0), 0),
        unique_vehicles_driven: new Set(rows.map(a => a.vehicle_id)).size,
        total_trips: rows.reduce((s, a) => s + a.trip_count, 0),
        total_distance_km: rows.reduce((s, a) => s + a.distance_km, 0),
      },
      history: laravel(rows, p),
    });
  }
  if ((m = url.match(/^\/api\/trips\/(\d+)$/))) return tripDetail(m[1]);
  if ((m = url.match(/^\/api\/trips\/(\d+)\/route$/))) return tripRoute(m[1]);
  if ((m = url.match(/^\/api\/yards\/(\d+)$/))) return yardDetail(m[1]);
  if ((m = url.match(/^\/api\/geofences\/(\d+)$/))) {
    const g = geofences.find(x => x.id === m![1]);

    return g ? ok(g) : notFound('Geofence');
  }

  return undefined;
}
