/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { put } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useEditConflict } from '@hooks/useEditConflict';
import { useUnits } from '@hooks/useUnits';
import VehicleFields, { vehicleToPayload, vehicleToValues } from '@components/VehicleFields';

/** Edit vehicle (PUT /vehicles/{id}) — only the fields that changed are sent. */
export default function VehicleEditForm({
  vehicle,
  onSaved,
  onCancel,
}: {
  vehicle: any;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const conflict = useEditConflict(vehicle, onCancel);
  const u = useUnits();
  const [values, setValues] = useState(() => vehicleToValues(vehicle, u));
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    if (!values.name.trim()) return;

    const payload = vehicleToPayload(values, vehicle, u);

    if (Object.keys(payload).length === 0) {
      toast('Nothing to save — no changes made.');

      return;
    }

    setSubmitting(true);
    const response: any = await put(
      `/api/vehicles/${vehicle.id}`,
      { ...payload, ...conflict.expected },
      {},
      false
    );
    setSubmitting(false);

    if (conflict.handle(response)) return;

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not update the vehicle.');

      return;
    }

    toast.success('Vehicle updated.');
    invalidateFleetQueries(qc);
    onSaved?.();
  };

  return (
    <div>
      {conflict.banner}
      <VehicleFields values={values} onChange={setValues} startOpen />
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
          disabled={submitting || conflict.conflicted || !values.name.trim()}
          className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
