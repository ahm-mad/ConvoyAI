/**
 * Per-company unit system (flows/07 U1). The API stores and returns METRIC everywhere (km, litres, metres,
 * kg, km/h, km/L); this module converts for DISPLAY and converts typed input back to metric before it is
 * sent, so the contract stays one stable metric contract. `metric` is the identity — nothing changes for a
 * company that has not chosen another system (or whose backend does not send `unit_system` yet).
 */
export type UnitSystem = 'metric' | 'us' | 'uk';

export const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'us', 'uk'];

export const isUnitSystem = (v: unknown): v is UnitSystem =>
  typeof v === 'string' && (UNIT_SYSTEMS as string[]).includes(v);

export const KM_PER_MI = 1.609344;
export const L_PER_US_GAL = 3.785411784;
export const L_PER_UK_GAL = 4.54609;
export const M_PER_FT = 0.3048;
export const KG_PER_LB = 0.45359237;

/** One measurable quantity: how to show it and how to get the metric value back from what was typed. */
export interface Quantity {
  /** Short unit label: "km", "mi", "L", "gal", "mpg"… */
  label: string;
  /** Metric API value → display value. */
  from: (metric: number) => number;
  /** Display value → metric API value (for form input). */
  to: (display: number) => number;
  /** True for the metric identity: display strings are then the raw value, never rounded. */
  identity?: boolean;
}

const q = (label: string, factor: number): Quantity => ({
  label,
  from: v => v * factor,
  to: v => v / factor,
});

export interface Units {
  system: UnitSystem;
  /** km ↔ mi */
  distance: Quantity;
  /** litres ↔ US gallons (UK keeps litres) */
  volume: Quantity;
  /** km/L ↔ mpg (US or imperial) */
  economy: Quantity;
  /** km/h ↔ mph */
  speed: Quantity;
  /** m ↔ ft — radii, dimensions */
  length: Quantity;
  /** kg ↔ lb */
  weight: Quantity;
  /** money per km ↔ money per mile ("/km" | "/mi") */
  perDistance: Quantity;
}

const IDENTITY = (label: string): Quantity => ({ label, from: v => v, to: v => v, identity: true });

const METRIC: Units = {
  system: 'metric',
  distance: IDENTITY('km'),
  volume: IDENTITY('L'),
  economy: IDENTITY('km/L'),
  speed: IDENTITY('km/h'),
  length: IDENTITY('m'),
  weight: IDENTITY('kg'),
  perDistance: IDENTITY('km'),
};

const US: Units = {
  system: 'us',
  distance: q('mi', 1 / KM_PER_MI),
  volume: q('gal', 1 / L_PER_US_GAL),
  // km/L → miles per US gallon: (km/L ÷ km per mile) × litres per gallon
  economy: q('mpg', L_PER_US_GAL / KM_PER_MI),
  speed: q('mph', 1 / KM_PER_MI),
  length: q('ft', 1 / M_PER_FT),
  weight: q('lb', 1 / KG_PER_LB),
  // cost per km → cost per mile: × km per mile
  perDistance: q('mi', KM_PER_MI),
};

const UK: Units = {
  system: 'uk',
  distance: q('mi', 1 / KM_PER_MI),
  volume: IDENTITY('L'),
  // imperial gallon (4.546 L) — UK fuel economy is quoted in imperial mpg while fuel is sold in litres
  economy: q('mpg', L_PER_UK_GAL / KM_PER_MI),
  speed: q('mph', 1 / KM_PER_MI),
  length: IDENTITY('m'),
  weight: IDENTITY('kg'),
  perDistance: q('mi', KM_PER_MI),
};

const TABLE: Record<UnitSystem, Units> = { metric: METRIC, us: US, uk: UK };

export const unitsFor = (system: unknown): Units => TABLE[isUnitSystem(system) ? system : 'metric'];

/** The typed value of a form field → the metric number to send (`''` / NaN → null). */
export const toMetric = (
  quantity: Quantity,
  typed: string | number | null | undefined
): number | null => {
  if (typed === '' || typed === null || typed === undefined) return null;

  const n = Number(typed);

  return Number.isFinite(n) ? quantity.to(n) : null;
};

/** A metric API number → what a form field should show (rounded to avoid 12.000000001 noise). */
export const toDisplayString = (
  quantity: Quantity,
  metric: number | string | null | undefined,
  digits = 2
): string => {
  if (metric === '' || metric === null || metric === undefined) return '';

  const n = Number(metric);

  if (!Number.isFinite(n)) return '';

  // Metric (identity): exactly what the API sent — a form must never round or drift a stored value.
  if (quantity.identity) return String(n);

  return String(Math.round(quantity.from(n) * 10 ** digits) / 10 ** digits);
};

/** A metric API number → "12.4 mi" (empty / non-numeric → `fallback`). */
export const formatQty = (
  quantity: Quantity,
  metric: number | string | null | undefined,
  digits = 1,
  fallback = '—'
): string => {
  const s = toDisplayString(quantity, metric, digits);

  return s === ''
    ? fallback
    : `${Number(s).toLocaleString(undefined, { maximumFractionDigits: digits })} ${quantity.label}`;
};
