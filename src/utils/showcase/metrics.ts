/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FUEL_PRICE,
  fuelLogModels,
  incidentModels,
  maintenanceLogModels,
  positionModels,
  scheduleModels,
  showcaseNow,
  tripModels,
  vehicleModels,
  yards,
  driverModels,
  geofenceEvents,
} from './dataset';
import { DAY, ymd } from './rng';

/** Stateless hash → [0,1) so per-vehicle-per-day telemetry is deterministic without a stored table. */
const h = (a: number, b: number) => {
  let x = Math.imul((a * 73856093) ^ (b * 19349663), 0x9e3779b1);

  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;

  return (x >>> 0) / 4294967296;
};

export const SCHEDULED_HOURS = 12;
const TODAY_NO = Math.floor(showcaseNow() / DAY);
const HEAVY = ['Truck', 'Semi-Trailer', 'Tanker', 'Bus', 'Trailer'];
const LPK: Record<string, number> = {
  Truck: 0.32,
  'Semi-Trailer': 0.38,
  Tanker: 0.36,
  Bus: 0.28,
  Trailer: 0.3,
  Van: 0.11,
  Pickup: 0.13,
};

export interface VehDay {
  drive: number;
  idle: number;
  km: number;
  liters: number;
}

/** Modelled telemetry for one active vehicle on one calendar day (dayNo = days since epoch). */
export const vehDay = (vi: number, dayNo: number): VehDay => {
  const v = vehicleModels[vi];
  const dow = (dayNo + 4) % 7; // 0 = Sunday
  const factor = dow === 0 ? 0.45 : dow === 5 ? 0.75 : 1;
  const base = HEAVY.includes(v.category) ? 7.4 : 5.6;
  // Gentle improvement trend over the last months (older days run less efficiently), so deltas are non-zero.
  const trend = Math.min(1.06, Math.max(0.82, 1 + 0.0032 * (dayNo - TODAY_NO)));
  const drive = Math.min(
    11,
    Math.max(0, base * (0.55 + 0.9 * h(vi, 999)) * factor * trend * (0.55 + 0.9 * h(vi + 1, dayNo)))
  );
  const km = drive * (34 + 16 * h(vi + 7, dayNo));

  return {
    drive,
    idle: drive * (0.12 + 0.2 * h(vi + 13, dayNo)),
    km,
    liters: km * (LPK[v.category] ?? 0.2) * (1 + 2.6 * (1 - trend)),
  };
};

const dayNoOf = (isoDate: string) =>
  Math.floor(Date.parse(isoDate.slice(0, 10) + 'T00:00:00Z') / DAY);

export const activeIdx = vehicleModels
  .map((v, i) => (v.status === 'active' ? i : -1))
  .filter(i => i >= 0);

const cache = new Map<number, VehDay>();
const dayTotal = (dayNo: number): VehDay => {
  const hit = cache.get(dayNo);

  if (hit) return hit;

  const t = { drive: 0, idle: 0, km: 0, liters: 0 };

  activeIdx.forEach(i => {
    const d = vehDay(i, dayNo);

    t.drive += d.drive;
    t.idle += d.idle;
    t.km += d.km;
    t.liters += d.liters;
  });
  cache.set(dayNo, t);

  return t;
};

export const daysBetween = (from: string, to: string) => {
  const a = dayNoOf(from);
  const b = dayNoOf(to);

  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
};
export const dayStr = (dayNo: number) => ymd(dayNo * DAY);

export const bucketOf = (dayNo: number, interval: string): string => {
  if (interval === 'week') return dayStr(dayNo - ((dayNo + 3) % 7)); // Monday
  if (interval === 'month') return dayStr(dayNo).slice(0, 8) + '01';

  return dayStr(dayNo);
};

export const bucketList = (from: string, to: string, interval: string) => [
  ...new Set(daysBetween(from, to).map(d => bucketOf(d, interval))),
];

const inDays = (dayNos: number[]) => {
  const set = new Set(dayNos);

  return (isoDate: string | null | undefined) => !!isoDate && set.has(dayNoOf(isoDate));
};

export const tripDate = (t: any) => t.actual_start_at ?? t.planned_start_at;

export const tripsInDays = (dayNos: number[]) => {
  const inR = inDays(dayNos);

  return tripModels.filter(t => inR(tripDate(t)));
};

export const fuelPrice = (fuel: string) => FUEL_PRICE[fuel] ?? 270;

/** Everything a KPI page needs for a set of calendar days. */
export function aggregate(dayNos: number[]) {
  const tot = dayNos.reduce(
    (a, d) => {
      const t = dayTotal(d);

      return {
        drive: a.drive + t.drive,
        idle: a.idle + t.idle,
        km: a.km + t.km,
        liters: a.liters + t.liters,
      };
    },
    { drive: 0, idle: 0, km: 0, liters: 0 }
  );
  const trips = tripsInDays(dayNos);
  const done = trips.filter(t => t.status === 'completed');
  const onTime = done.filter(t => t._delay <= 15).length;
  const inR = inDays(dayNos);
  const maint = maintenanceLogModels
    .filter(m => inR(m.serviced_at))
    .reduce((a, m) => a + m.cost, 0);
  const fuelCost = tot.liters * 271;
  const available = activeIdx.length * dayNos.length * SCHEDULED_HOURS;
  const other = tot.km * 4;
  const driver = tot.km * 22;
  const tolls = tot.km * 6;
  const totalCost = fuelCost + maint + driver + tolls + other;
  const revenue = tot.km * 168;

  return {
    ...tot,
    days: dayNos.length,
    trips,
    completed: done,
    onTimePct: done.length ? (onTime / done.length) * 100 : null,
    onTimeSample: done.length,
    utilisation: available ? (tot.drive / available) * 100 : 0,
    available,
    fuelCost,
    maint,
    driver,
    tolls,
    other,
    totalCost,
    revenue,
    costPerKm: tot.km ? totalCost / tot.km : null,
    economy: tot.liters ? tot.km / tot.liters : null,
  };
}

export const round = (n: number | null, d = 1) =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

// ── live fleet state ─────────────────────────────────────────────────────
export const posState = (p: any) =>
  p.age_seconds > 900
    ? 'offline'
    : p.speed > 5
      ? 'moving'
      : p._vehicleId && Number(p.id) % 3 === 0
        ? 'idle'
        : 'parked';

export const liveVehicles = vehicleModels.filter(
  v => v.status === 'active' || v.status === 'in_maintenance'
);

export const fleetStatus = () => {
  const by = { moving: 0, idle: 0, parked: 0, offline: 0, no_tracker: 0 } as Record<string, number>;
  const stateOf = new Map(positionModels.map(p => [p._vehicleId, posState(p)]));

  liveVehicles.forEach(v => {
    if (!v.tracker) by.no_tracker++;
    else by[stateOf.get(v.id) ?? 'parked']++;
  });

  return { total: liveVehicles.length, by, stateOf };
};

// ── attention feed ───────────────────────────────────────────────────────
export function attentionItems() {
  const now = showcaseNow();
  const items: any[] = [];

  driverModels.forEach(d => {
    const days = (Date.parse(d.raw.license_expiry_date) - now) / DAY;
    const ent = { type: 'driver', id: d.id, name: d.name };

    if (days < 0)
      items.push({
        id: `licence:${d.id}`,
        type: 'licence_expired',
        severity: 'critical',
        title: `${d.name}: licence expired`,
        entity: ent,
        since: d.raw.license_expiry_date,
        action: 'renew_licence',
      });
    else if (days <= 30)
      items.push({
        id: `licence:${d.id}`,
        type: 'licence_expiring',
        severity: 'warning',
        title: `${d.name}: licence expires in ${Math.ceil(days)} days`,
        entity: ent,
        since: new Date(now).toISOString(),
        action: 'renew_licence',
      });
  });
  scheduleModels
    .filter(s => s.status !== 'ok')
    .forEach(s => {
      const ent = { type: 'vehicle', id: s.vehicle_id, name: s.vehicle.name };

      items.push({
        id: `maintenance:${s.id}`,
        type: s.status === 'overdue' ? 'maintenance_overdue' : 'maintenance_due_soon',
        severity: s.status === 'overdue' ? 'critical' : 'warning',
        title: `${s.vehicle.name}: ${s.service_type} ${s.status === 'overdue' ? 'overdue' : 'due soon'}`,
        entity: ent,
        since: new Date(s.next_due_date).toISOString(),
        action: 'schedule_service',
      });
    });
  positionModels
    .filter(p => posState(p) === 'offline')
    .forEach(p => {
      items.push({
        id: `offline:${p._vehicleId}`,
        type: 'vehicle_offline',
        severity: 'warning',
        title: `${p.device.current_vehicle_assignment.vehicle.name}: no signal for ${Math.round(p.age_seconds / 3600)} h`,
        entity: {
          type: 'vehicle',
          id: p._vehicleId,
          name: p.device.current_vehicle_assignment.vehicle.name,
        },
        since: p.recorded_at,
        action: 'check_tracker',
      });
    });
  incidentModels
    .filter(i => i.severity === 'severe' && now - Date.parse(i.incident_date) < 30 * DAY)
    .forEach(i => {
      items.push({
        id: `incident:${i.id}`,
        type: 'incident_severe',
        severity: 'critical',
        title: `${i.incident_type}: ${i.vehicle.name}`,
        entity: { type: 'vehicle', id: i.vehicle_id, name: i.vehicle.name },
        since: i.incident_date,
        action: 'review_incident',
      });
    });

  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };

  return items.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || Date.parse(a.since) - Date.parse(b.since)
  );
}

// ── per-vehicle performance ──────────────────────────────────────────────
export function performance(dayNos: number[]) {
  const inR = inDays(dayNos);

  return activeIdx.map(i => {
    const v = vehicleModels[i];
    const s = dayNos.reduce(
      (a, d) => {
        const x = vehDay(i, d);

        return {
          drive: a.drive + x.drive,
          idle: a.idle + x.idle,
          km: a.km + x.km,
          l: a.l + x.liters,
        };
      },
      { drive: 0, idle: 0, km: 0, l: 0 }
    );
    const fuelCost = s.l * fuelPrice(v.raw.fuel_type);
    const maint = maintenanceLogModels
      .filter(m => m.vehicle_id === v.id && inR(m.serviced_at))
      .reduce((a, m) => a + m.cost, 0);

    return {
      vehicle_id: v.id,
      vehicle_name: v.raw.name,
      plate: v.raw.plate,
      vehicle_category: v.category,
      has_tracker: v.tracker,
      distance_km: round(s.km)!,
      distance_source: v.tracker ? 'telemetry' : 'trips',
      driving_hours: round(s.drive)!,
      idle_hours: round(s.idle)!,
      utilisation_rate: round((s.drive / (dayNos.length * SCHEDULED_HOURS)) * 100, 2)!,
      utilisation_basis: v.tracker ? 'telemetry' : 'trips',
      trip_count: tripsInDays(dayNos).filter(t => t.vehicle_id === v.id).length,
      fuel_used_liters: Math.round(s.l),
      fuel_efficiency: s.l ? round(s.km / s.l, 2) : null,
      fuel_cost: Math.round(fuelCost),
      maintenance_cost: maint,
      cost_per_km: s.km ? round((fuelCost + maint + s.km * 28) / s.km, 2) : null,
      incident_count: incidentModels.filter(x => x.vehicle_id === v.id && inR(x.incident_date))
        .length,
    };
  });
}

export { yards, fuelLogModels, geofenceEvents };
