/** Vehicle kinds drawn on the map and the motion state derived from a position report. */
export type VehicleKind = 'truck' | 'semi' | 'van' | 'pickup' | 'tanker' | 'bus' | 'car';
export type VehicleState = 'moving' | 'idle' | 'parked' | 'offline';

export const kindOf = (category?: string | null): VehicleKind => {
  const c = String(category ?? '').toLowerCase();

  if (/semi|prime|trailer|reefer|articulated/.test(c)) return 'semi';
  if (/tank/.test(c)) return 'tanker';
  if (/bus|coach/.test(c)) return 'bus';
  if (/pick/.test(c)) return 'pickup';
  if (/van|bolan|hiace|transit/.test(c)) return 'van';
  if (/truck|lorry|hino|volvo|isuzu/.test(c)) return 'truck';

  return 'car';
};

/** moving > 5 km/h, idle (engine on, crawling), parked (fresh, still), offline (no recent fix). */
export const stateOf = (p: { fresh?: boolean; speed?: number | null }): VehicleState => {
  if (!p.fresh) return 'offline';

  const s = Number(p.speed ?? 0);

  return s > 5 ? 'moving' : s > 0.5 ? 'idle' : 'parked';
};

/** One vehicle as the map layer needs it. */
export interface LiveVehicle {
  id: string;
  name: string;
  plate?: string | null;
  category?: string | null;
  lat: number;
  lon: number;
  /** Degrees clockwise from north. */
  heading: number;
  /** false when the tracker reported no heading (0 is then a placeholder). */
  hasHeading?: boolean;
  /** km/h */
  speed: number;
  state: VehicleState;
  recordedAt?: string | null;
  driver?: string | null;
  raw?: any;
}

/** Map a `/fleet/positions` item to a LiveVehicle (null when it has no usable coordinates). */
export function vehicleFromPosition(p: any): LiveVehicle | null {
  const lat = Number(p?.latitude);
  const lon = Number(p?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const veh = p?.device?.current_vehicle_assignment?.vehicle;

  return {
    id: String(veh?.id ?? p.device_id),
    name: veh?.name || p?.device?.name || `Tracker ${p.device_id}`,
    plate: veh?.plate ?? null,
    category: veh?.vehicle_category ?? null,
    lat,
    lon,
    heading:
      p.heading !== null && p.heading !== undefined && Number.isFinite(Number(p.heading))
        ? Number(p.heading)
        : 0,
    hasHeading: p.heading !== null && p.heading !== undefined && Number.isFinite(Number(p.heading)),
    speed: Number(p.speed ?? 0),
    state: stateOf(p),
    recordedAt: p.recorded_at ?? null,
    raw: p,
  };
}
