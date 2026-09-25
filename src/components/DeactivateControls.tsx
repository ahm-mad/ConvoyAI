/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { post } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import PermanentDeleteControl from '@components/PermanentDeleteControl';

/**
 * Deactivate / reactivate a vehicle, driver or yard (POST {basePath}/deactivate|reactivate,
 * flows/05 §8). Deactivating asks for an inline confirmation (no browser dialogs); backend's fixed 422
 * guards — e.g. "Unassign this vehicle's driver and tracker before deactivating it." — are shown
 * verbatim. Deactivated items disappear from the default lists, so this is also where they come back.
 * `allowDelete` adds the secondary "Delete permanently" (backend C14 - only for never-used records).
 */
export default function DeactivateControls({
  basePath,
  inactive,
  entityLabel,
  onChanged,
  allowDelete = false,
}: {
  basePath: string;
  inactive: boolean;
  entityLabel: string;
  onChanged?: () => void;
  allowDelete?: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const run = async (action: 'deactivate' | 'reactivate') => {
    setSubmitting(true);
    const response: any = await post(`${basePath}/${action}`, {}, {}, false);
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || `Could not ${action} this ${entityLabel}.`);
      setConfirming(false);

      return;
    }

    toast.success(response?.message || `${entityLabel} ${action}d.`);
    setConfirming(false);
    invalidateFleetQueries(qc);
    onChanged?.();
  };

  const deleteControl = allowDelete ? (
    <PermanentDeleteControl basePath={basePath} entityLabel={entityLabel} />
  ) : null;

  if (inactive) {
    return (
      <div className="flex items-center justify-between gap-3 bg-surface-3 rounded-md px-3 py-2 mb-3">
        <span className="text-[11px] text-ink-2">
          This {entityLabel} is inactive and hidden from the lists and dropdowns.
        </span>
        <span className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => run('reactivate')}
            disabled={submitting}
            className="text-[11px] text-accent-green border border-line rounded px-2.5 py-1 disabled:opacity-40"
          >
            {submitting ? 'Reactivating…' : 'Reactivate'}
          </button>
          {deleteControl}
        </span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-ink-1">Deactivate this {entityLabel}?</span>
        <button
          type="button"
          onClick={() => run('deactivate')}
          disabled={submitting}
          className="text-[11px] text-danger border border-danger/40 bg-danger/10 rounded px-2.5 py-1 disabled:opacity-40"
        >
          {submitting ? 'Deactivating…' : 'Confirm'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-soft">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[11px] text-danger border border-danger/30 rounded px-2.5 py-1 hover:bg-danger/10"
      >
        Deactivate
      </button>
      {deleteControl}
    </div>
  );
}
