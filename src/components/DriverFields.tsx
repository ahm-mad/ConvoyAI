/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ChangeEvent } from 'react';
import { useFleetOptions, optionLabel } from '@utils/fleetOptions';

/**
 * The driver fields shared by "Add driver" and "Edit driver" (POST /drivers and PUT /drivers/{id}
 * accept the same fields, flows/05 §8). Held as strings while editing; `driverToPayload` converts to
 * the API shape and, given the original driver, returns only what changed. `status` is not editable
 * here — deactivate/reactivate own it.
 */

const TEXT_KEYS = [
  'first_name',
  'last_name',
  'license_number',
  'license_class',
  'license_expiry_date',
  'email',
  'phone',
  'hire_date',
  'payroll_reference',
  'employment_status',
  'availability_status',
] as const;

type TextKey = (typeof TEXT_KEYS)[number];

export interface Certification {
  name: string;
  issued_date: string;
  expiry_date: string;
}

export type DriverValues = Record<TextKey, string> & { certifications: Certification[] };

export const EMPTY_CERT: Certification = { name: '', issued_date: '', expiry_date: '' };

export const EMPTY_DRIVER_VALUES = {
  ...(Object.fromEntries(TEXT_KEYS.map(k => [k, ''])) as Record<TextKey, string>),
  certifications: [] as Certification[],
} as DriverValues;

const DATE_KEYS: TextKey[] = ['license_expiry_date', 'hire_date'];
const SELECT_KEYS: TextKey[] = ['employment_status', 'availability_status'];

const day = (v: unknown) => (v ? String(v).slice(0, 10) : '');

export const driverToValues = (driver: any): DriverValues => {
  const values = { ...EMPTY_DRIVER_VALUES, certifications: [] as Certification[] } as DriverValues;

  TEXT_KEYS.forEach(k => {
    const raw = driver?.[k];

    values[k] = raw === null || raw === undefined ? '' : String(raw);
  });
  DATE_KEYS.forEach(k => {
    values[k] = day(values[k]);
  });
  values.certifications = (Array.isArray(driver?.certifications) ? driver.certifications : []).map(
    (c: any) => ({
      name: c?.name ?? '',
      issued_date: day(c?.issued_date),
      expiry_date: day(c?.expiry_date),
    })
  );

  return values;
};

const fullPayload = (values: DriverValues): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
  };

  TEXT_KEYS.forEach(k => {
    if (k === 'first_name' || k === 'last_name') return;

    const v = values[k];

    out[k] = DATE_KEYS.includes(k) || SELECT_KEYS.includes(k) ? v || null : v.trim() || null;
  });

  const certs = values.certifications
    .filter(c => c.name.trim())
    .map(c => ({
      name: c.name.trim(),
      issued_date: c.issued_date || null,
      expiry_date: c.expiry_date || null,
    }));

  out.certifications = certs.length ? certs : null;

  return out;
};

/** Create: the full payload. Edit (pass `original`): only the changed fields. */
export const driverToPayload = (values: DriverValues, original?: any): Record<string, unknown> => {
  const next = fullPayload(values);

  if (!original) return next;

  const base = fullPayload(driverToValues(original));

  return Object.fromEntries(
    Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k]))
  );
};

const INPUT = 'w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function DriverFields({
  values,
  onChange,
  startOpen = false,
}: {
  values: DriverValues;
  onChange: (next: DriverValues) => void;
  startOpen?: boolean;
}) {
  const { options } = useFleetOptions();
  const [showMore, setShowMore] = useState(startOpen);

  const set = (key: TextKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const setCert = (index: number, key: keyof Certification, value: string) =>
    onChange({
      ...values,
      certifications: values.certifications.map((c, i) =>
        i === index ? { ...c, [key]: value } : c
      ),
    });

  const select = (key: TextKey, list: string[]) => (
    <select value={values[key]} onChange={set(key)} className={INPUT}>
      <option value="">Not set</option>
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
          value={values.first_name}
          onChange={set('first_name')}
          placeholder="First name"
          className={INPUT}
        />
        <input
          value={values.last_name}
          onChange={set('last_name')}
          placeholder="Last name"
          className={INPUT}
        />
        <input
          value={values.license_number}
          onChange={set('license_number')}
          placeholder="License number"
          className={INPUT}
        />
        <input
          value={values.license_class}
          onChange={set('license_class')}
          placeholder="License class (e.g. CDL-A)"
          className={INPUT}
        />
        <div className="col-span-2">
          <Field label="License expiry">
            <input
              value={values.license_expiry_date}
              onChange={set('license_expiry_date')}
              type="date"
              className={INPUT}
            />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore(v => !v)}
        className="text-[11px] text-brand-text mb-3"
      >
        {showMore ? '− Hide details' : '+ More details (email, phone, hire date…)'}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-line-soft">
          <Field label="Email">
            <input value={values.email} onChange={set('email')} type="email" className={INPUT} />
          </Field>
          <Field label="Phone">
            <input value={values.phone} onChange={set('phone')} type="tel" className={INPUT} />
          </Field>
          <Field label="Hire date">
            <input
              value={values.hire_date}
              onChange={set('hire_date')}
              type="date"
              className={INPUT}
            />
          </Field>
          <Field label="Payroll reference">
            <input
              value={values.payroll_reference}
              onChange={set('payroll_reference')}
              className={INPUT}
            />
          </Field>
          <Field label="Employment status">
            {select('employment_status', options.employment_statuses)}
          </Field>
          <Field label="Availability">
            {select('availability_status', options.availability_statuses)}
          </Field>

          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide text-ink-2">Certifications</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...values,
                    certifications: [...values.certifications, { ...EMPTY_CERT }],
                  })
                }
                className="text-[11px] text-brand-text"
              >
                + Add certification
              </button>
            </div>
            {values.certifications.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 mb-2 items-center">
                <input
                  value={c.name}
                  onChange={e => setCert(i, 'name', e.target.value)}
                  placeholder="Name (e.g. Hazmat)"
                  className={INPUT}
                />
                <input
                  value={c.issued_date}
                  onChange={e => setCert(i, 'issued_date', e.target.value)}
                  type="date"
                  title="Issued"
                  className={INPUT}
                />
                <input
                  value={c.expiry_date}
                  onChange={e => setCert(i, 'expiry_date', e.target.value)}
                  type="date"
                  title="Expires"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...values,
                      certifications: values.certifications.filter((_, idx) => idx !== i),
                    })
                  }
                  className="text-[11px] text-danger-text px-1"
                  aria-label="Remove certification"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
