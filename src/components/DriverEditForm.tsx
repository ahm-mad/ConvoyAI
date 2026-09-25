/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { put } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useEditConflict } from '@hooks/useEditConflict';
import DriverFields, { driverToPayload, driverToValues } from '@components/DriverFields';

/** Edit driver (PUT /drivers/{id}) — only the fields that changed are sent. */
export default function DriverEditForm({
  driver,
  onSaved,
  onCancel,
}: {
  driver: any;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const conflict = useEditConflict(driver, onCancel);
  const [values, setValues] = useState(() => driverToValues(driver));
  const [submitting, setSubmitting] = useState(false);
  const valid = values.first_name.trim() && values.last_name.trim();

  const save = async () => {
    if (!valid) return;

    const payload = driverToPayload(values, driver);

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSubmitting(true);
    const response: any = await put(
      `/api/drivers/${driver.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );
    setSubmitting(false);

    if (conflict.handle(response)) return;

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not update the driver.');

      return;
    }

    toast.success('Driver updated.');
    invalidateFleetQueries(qc);
    onSaved?.();
  };

  return (
    <div>
      {conflict.banner}
      <DriverFields values={values} onChange={setValues} startOpen />
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
          disabled={submitting || conflict.conflicted || !valid}
          className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
