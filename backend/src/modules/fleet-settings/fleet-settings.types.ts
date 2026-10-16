/**
 * Module 4.9 (fleet-settings, D-0183, flow 07 ask F1) — one row per company of the thresholds the fleet analytics read: the company timezone,
 * how long a position stays "fresh", the idle threshold, the scheduled hours per vehicle per day, the on-time grace, the maintenance
 * "due soon" window and the KPI targets. A company without a row uses `DEFAULT_FLEET_SETTINGS` (nothing changes until it is edited).
 */
/**
 * D-0192 (frontend ask U1): the company's unit preset — `metric` (km, L, km/L), `us` (mi, US gal, MPG) or `uk` (mi, litres, imperial MPG). It changes NOTHING in
 * what the API stores or returns (always metric); the frontend reads it to convert for display and for typed input.
 */
export const UNIT_SYSTEMS = ['metric', 'us', 'uk'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export interface FleetSettings {
  /** IANA name, e.g. `Asia/Karachi`; day / week / month buckets and `from` / `to` are calendar dates in this zone. */
  timezone: string;
  /** A tracker whose latest position is older than this is `offline` (dashboard status) / not `fresh` (positions). */
  positionFreshnessMinutes: number;
  idleThresholdMinutes: number;
  /** Hours a vehicle is scheduled to be available per day — the denominator of utilisation (default 24). */
  scheduledHoursPerVehiclePerDay: number;
  /** A completed trip is on time when it ended within this many minutes of its planned end. */
  onTimeGraceMinutes: number;
  maintenanceDueSoonDays: number;
  maintenanceDueSoonKm: number;
  utilisationTargetPct: number | null;
  onTimeTargetPct: number | null;
  costPerKmTarget: number | null;
  idleLimitPct: number | null;
  fuelEconomyTarget: number | null;
  /** Display preference only (see `UNIT_SYSTEMS`); default `metric` = today's behaviour. */
  unitSystem: UnitSystem;
}

export const DEFAULT_FLEET_SETTINGS: Readonly<FleetSettings> = {
  timezone: 'UTC',
  positionFreshnessMinutes: 15,
  idleThresholdMinutes: 5,
  scheduledHoursPerVehiclePerDay: 24,
  onTimeGraceMinutes: 0,
  maintenanceDueSoonDays: 7,
  maintenanceDueSoonKm: 500,
  utilisationTargetPct: null,
  onTimeTargetPct: null,
  costPerKmTarget: null,
  idleLimitPct: null,
  fuelEconomyTarget: null,
  unitSystem: 'metric',
};

export interface StoredFleetSettings extends FleetSettings {
  id: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** Only what the caller sent; a target may be set back to `null`. */
export type UpdateFleetSettingsInput = {
  [K in keyof FleetSettings]?: FleetSettings[K] | undefined;
};

/** What the dashboards, positions and analytics read (interface-typed — CONVENTIONS.md "Modules"); implemented by `FleetSettingsService`. */
export interface FleetSettingsLookup {
  /** The caller's company settings, or the defaults when it has none yet. Needs the request context (company-scoped). */
  effectiveSettings(): Promise<FleetSettings>;
}
