/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { del } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useModal } from '@contexts/ModalContext';
import DeleteControl from '@components/records/DeleteControl';

/**
 * Permanent delete of a vehicle, driver or yard (backend C14, flows/06 §25 — `DELETE {basePath}`).
 * Deactivate stays the normal way to retire a record; this only works for a record that was never used
 * (no trips, assignments, logs, incidents, documents, yard history …). Anything with history is refused
 * with a 422 whose message says why ("… has trips and fuel logs. Deactivate it instead.") — shown
 * verbatim. On success the detail modal closes (the record is gone) and the fleet lists refetch.
 */
export default function PermanentDeleteControl({
  basePath,
  entityLabel,
}: {
  basePath: string;
  entityLabel: string;
}) {
  const qc = useQueryClient();
  const { closeModal } = useModal();

  const remove = async () => {
    const res: any = await del(basePath, {}, false);

    if (res?.error || res?.success === false) {
      toast.error(res?.message || `Could not delete this ${entityLabel}.`);

      return;
    }

    toast.success(res?.message || `${entityLabel} deleted.`);
    invalidateFleetQueries(qc);
    closeModal();
  };

  return (
    <DeleteControl
      label="Delete permanently"
      question={`Delete this ${entityLabel} for good? Only a never-used ${entityLabel} can be deleted. This can't be undone.`}
      onConfirm={remove}
    />
  );
}
