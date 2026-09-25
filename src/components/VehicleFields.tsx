/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ChangeEvent } from 'react';
import { useFleetOptions, optionLabel } from '@utils/fleetOptions';
import { useFleetCurrency } from '@utils/fleetCurrency';
import { useUnits } from '@hooks/useUnits';
import { toDisplayString, toMetric, unitsFor, type Units } from '@utils/units';

/**
 * The vehicle fields shared by "Add vehicle" and "Edit vehicle" so the two can never drift apart
 * (POST /vehicles and PUT /vehicles/{id} accept the same fields, flows/05 §8). Everything is held as
 * strings while editing; `vehicleToPayload` converts to the API types. For an edit, pass the original
 * vehicle and only the fields that actually changed are returned (PUT semantics: send what changed,
 * `null` clears a nullable field).
 */

const KEYS = [
  'name',
  'vehicle_category',
  'make',
  'model',
  'length_m',
  'fuel_type',
  'ownership_type',
  'plate',
  'vin',
  'year',
  'odometer_km',
  'tank_capacity_liters',
  'cost_centre',
  'width_m',
  'height_m',
  'gross_weight_kg',
  'payload_kg',
  'acquisition_date',
  'acquisition_cost',
] as const;

export type VehicleKey = (typeof KEYS)[number];
export type VehicleValues = Record<VehicleKey, string>;

export const EMPTY_VEHICLE_VALUES = Object.fromEntries(KEYS.map(k => [k, ''])) as VehicleValues;

const NUMBER_KEYS: VehicleKey[] = [
  'length_m',
  'odometer_km',
  'tank_capacity_liters',
  'width_m',
  'height_m',
  'gross_weight_kg',
  'payload_kg',
  'acquisition_cost',
];
const DATE_KEYS: VehicleKey[] = ['acquisition_date'];
const SELECT_KEYS: VehicleKey[] = ['fuel_type', 'ownership_type'];

/** Which quantity each stored-in-metric field measures (shown / typed in the company's unit system). */
const QTY: Partial<Record<VehicleKey, 'distance' | 'volume' | 'length' | 'weight'>> = {
  odometer_km: 'distance',
  tank_capacity_liters: 'volume',
  length_m: 'length',
  width_m: 'length',
  height_m: 'length',
  gross_weight_kg: 'weight',
  payload_kg: 'weight',
};

export const vehicleToValues = (vehicle: any, u: Units = unitsFor('metric')): VehicleValues => {
  const values = { ...EMPTY_VEHICLE_VALUES };

  KEYS.forEach(k => {
    const raw = vehicle?.[k];

    const qty = QTY[k];

    values[k] =
      raw === null || raw === undefined
        ? ''
        : qty
          ? toDisplayString(u[qty], raw, 2) // metric: exactly the stored value
          : String(raw);
  });
  DATE_KEYS.forEach(k => {
    values[k] = values[k].slice(0, 10); // ISO timestamp -> yyyy-mm-dd for <input type=date>
  });

  return values;
};

const fullPayload = (
  values: VehicleValues,
  u: Units = unitsFor('metric')
): Record<string, unknown> => {
  const out: Record<string, unknown> = { name: values.name.trim() };

  KEYS.forEach(k => {
    if (k === 'name') return;

    const v = values[k];

    const qty = QTY[k];

    if (qty) out[k] = v.trim() === '' ? null : toMetric(u[qty], v);
    else if (NUMBER_KEYS.includes(k)) out[k] = v.trim() === '' ? null : Number(v);
    else if (k === 'year') out[k] = v.trim() === '' ? null : parseInt(v, 10);
    else if (DATE_KEYS.includes(k) || SELECT_KEYS.includes(k)) out[k] = v || null;
    else out[k] = v.trim() || null;
  });

  return out;
};

/** Create: the full payload. Edit (pass `original`): only the changed fields. */
export const vehicleToPayload = (
  values: VehicleValues,
  original?: any,
  u: Units = unitsFor('metric')
): Record<string, unknown> => {
  const next = fullPayload(values, u);

  if (!original) return next;

  const baseValues = vehicleToValues(original, u);
  const base = fullPayload(baseValues, u);
  const num = (v: string) => (v.trim() === '' ? '' : String(Number(v)));

  return Object.fromEntries(
    Object.entries(next).filter(([k, v]) =>
      // Converted fields are compared as TYPED numbers: an untouched field is never re-sent, so a
      // unit round trip (mi ↔ km) can not drift a stored value.
      QTY[k as VehicleKey]
        ? num(values[k as VehicleKey]) !== num(baseValues[k as VehicleKey])
        : v !== base[k]
    )
  );
};

const INPUT = 'w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-xs text-ink-0';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] uppercase tracking-wide text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function VehicleFields({
  values,
  onChange,
  existingNames = [],
  startOpen = false,
}: {
  values: VehicleValues;
  onChange: (next: VehicleValues) => void;
  existingNames?: string[];
  startOpen?: boolean;
}) {
  const { options } = useFleetOptions();
  const currency = useFleetCurrency();
  const u = useUnits();
  const [showMore, setShowMore] = useState(startOpen);

  const set = (key: VehicleKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const input = (key: VehicleKey, type = 'text', step?: string) => (
    <input value={values[key]} onChange={set(key)} type={type} step={step} className={INPUT} />
  );

  const select = (key: VehicleKey, list: string[]) => (
    <select value={values[key]} onChange={set(key)} className={INPUT}>
      <option value="">Not set</option>
      {/* Keep a value that is no longer in the canonical list selectable instead of silently dropping it. */}
      {values[key] && !list.includes(values[key]) && (
        <option value={values[key]}>{values[key]}</option>
      )}
      {list.map(v => (
        <option key={v} value={v}>
          {optionLabel(v)}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          value={values.name}
          onChange={set('name')}
          placeholder="Vehicle name (e.g. Truck 5, Sea Breeze)"
          list="existing-vehicle-names"
          className={`${INPUT} col-span-2`}
        />
        <datalist id="existing-vehicle-names">
          {existingNames.map(n => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <input
          value={values.vehicle_category}
          onChange={set('vehicle_category')}
          placeholder="Category (e.g. Semi-Trailer, Yacht)"
          className={`${INPUT} col-span-2`}
        />
        <input value={values.make} onChange={set('make')} placeholder="Make" className={INPUT} />
        <input value={values.model} onChange={set('model')} placeholder="Model" className={INPUT} />
        <input
          value={values.length_m}
          onChange={set('length_m')}
          type="number"
          placeholder={`Length (${u.length.label}, optional)`}
          className={`${INPUT} col-span-2`}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore(v => !v)}
        className="text-[11px] text-accent-cyan mb-3"
      >
        {showMore ? '− Hide details' : '+ More details (plate, VIN, dimensions, acquisition…)'}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-line-soft">
          <Field label="Fuel type">{select('fuel_type', options.fuel_types)}</Field>
          <Field label="Ownership">{select('ownership_type', options.ownership_types)}</Field>
          <Field label="Plate number">{input('plate')}</Field>
          <Field label="VIN">{input('vin')}</Field>
          <Field label="Year">{input('year', 'number')}</Field>
          <Field label={`Odometer (${u.distance.label})`}>
            {input('odometer_km', 'number', 'any')}
          </Field>
          <Field label={`Fuel tank (${u.volume.label === 'L' ? 'litres' : 'gallons'})`}>
            {input('tank_capacity_liters', 'number', 'any')}
          </Field>
          <Field label="Cost centre">{input('cost_centre')}</Field>
          <Field label={`Width (${u.length.label})`}>{input('width_m', 'number', 'any')}</Field>
          <Field label={`Height (${u.length.label})`}>{input('height_m', 'number', 'any')}</Field>
          <Field label={`Gross weight (${u.weight.label})`}>
            {input('gross_weight_kg', 'number', 'any')}
          </Field>
          <Field label={`Payload (${u.weight.label})`}>
            {input('payload_kg', 'number', 'any')}
          </Field>
          <Field label="Acquisition date">{input('acquisition_date', 'date')}</Field>
          <Field label={`Acquisition cost (${currency})`}>
            {input('acquisition_cost', 'number', 'any')}
          </Field>
        </div>
      )}
    </div>
  );
}
