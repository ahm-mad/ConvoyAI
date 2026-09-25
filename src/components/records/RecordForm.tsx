/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { put } from '@utils/apiHelper';
import { useEditConflict } from '@hooks/useEditConflict';
import { useUnits } from '@hooks/useUnits';
import { toDisplayString, toMetric, type Units } from '@utils/units';

/**
 * Schema-driven edit form for the log-type records (maintenance schedules / logs, fuel logs, compliance
 * documents, incidents — backend B3, flows/06 §15.5). `PUT` takes the same fields as the matching `POST`,
 * ALL optional: only the fields the operator changed are sent, an emptied optional field goes as `null`
 * (clears it), an unchanged form sends nothing. Business-rule 422 messages are shown verbatim.
 */
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  options?: { value: string; label: string }[];
  /** Cannot be emptied (a `null` on a required field is a 422). */
  required?: boolean;
  step?: string;
  /** Wide field (spans both columns). */
  wide?: boolean;
  /** Stored in metric: shown / typed in the company's unit system, sent back in metric. */
  qty?: 'distance';
}

const input = 'w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0';

const toInitial = (record: any, f: FieldDef, u: Units) => {
  const v = record[f.key];

  if (f.qty && v !== null && v !== undefined) return toDisplayString(u[f.qty], v, 2);

  if (f.type === 'checkbox') return v ? '1' : '';
  if (v === null || v === undefined) return '';
  if (f.type === 'date') return String(v).slice(0, 10); // ISO instant → YYYY-MM-DD for <input type=date>

  return String(v);
};

export default function RecordForm({
  resource,
  record,
  fields,
  noun,
  onSaved,
  onCancel,
}: {
  /** API collection, e.g. `fuel-logs` → PUT /api/fuel-logs/{id}. */
  resource: string;
  record: any;
  fields: FieldDef[];
  /** For the toast, e.g. "Fuel log". */
  noun: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const u = useUnits();
  const [initial] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, toInitial(record, f, u)]))
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const conflict = useEditConflict(record, onCancel);

  const missing = fields.some(f => f.required && !values[f.key].trim());

  const save = async () => {
    const payload: Record<string, unknown> = {};

    fields.forEach(f => {
      if (values[f.key] === initial[f.key]) return;

      const v = values[f.key];

      if (f.type === 'checkbox') payload[f.key] = v === '1';
      else if (f.type === 'number' && f.qty) {
        const metric = v === '' ? null : toMetric(u[f.qty], v);

        // Whole-number fields (step 1, e.g. the service interval) stay whole in km.
        payload[f.key] = metric !== null && f.step === '1' ? Math.round(metric) : metric;
      } else if (f.type === 'number') payload[f.key] = v === '' ? null : Number(v);
      else if (f.type === 'select' && f.options?.some(o => /^\d+$/.test(o.value)))
        payload[f.key] = v === '' ? null : Number(v);
      else payload[f.key] = v.trim() === '' ? null : v.trim();
    });

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSaving(true);
    const res: any = await put(
      `/api/${resource}/${record.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );

    setSaving(false);

    if (conflict.handle(res)) return;

    if (res?.error || res?.success === false) {
      const detail = res?.errors ? Object.values(res.errors).flat().join(' ') : '';

      toast.error(detail || res?.message || `Could not update the ${noun.toLowerCase()}.`);

      return;
    }

    toast.success(`${noun} updated.`);
    onSaved();
  };

  return (
    <div className="bg-surface-2 rounded-md p-3 mb-2">
      {conflict.banner}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {fields.map(f => (
          <label
            key={f.key}
            className={`flex flex-col ${f.wide || f.type === 'textarea' ? 'col-span-2' : ''} ${
              f.type === 'checkbox' ? 'justify-end' : ''
            }`}
          >
            {f.type !== 'checkbox' && (
              <span className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
                {f.qty ? f.label.replace('(km)', `(${u.distance.label})`) : f.label}
                {f.required ? ' *' : ''}
              </span>
            )}
            {f.type === 'select' ? (
              <select
                value={values[f.key]}
                onChange={e => setValues(p => ({ ...p, [f.key]: e.target.value }))}
                className={input}
              >
                {!f.required && <option value="">—</option>}
                {(f.options ?? []).map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                value={values[f.key]}
                onChange={e => setValues(p => ({ ...p, [f.key]: e.target.value }))}
                rows={2}
                className={`${input} resize-none`}
              />
            ) : f.type === 'checkbox' ? (
              <span className="flex items-center gap-2 text-xs text-ink-1">
                <input
                  type="checkbox"
                  checked={values[f.key] === '1'}
                  onChange={e => setValues(p => ({ ...p, [f.key]: e.target.checked ? '1' : '' }))}
                />
                {f.label}
              </span>
            ) : (
              <input
                type={f.type}
                step={f.type === 'number' ? (f.step ?? 'any') : undefined}
                value={values[f.key]}
                onChange={e => setValues(p => ({ ...p, [f.key]: e.target.value }))}
                className={input}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs text-ink-2 border border-line rounded-md py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || missing || conflict.conflicted}
          className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
