/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { del } from '@utils/apiHelper';
import { invalidateFleetQueries } from '@utils/fleetCache';
import RecordForm, { type FieldDef } from '@components/records/RecordForm';
import DeleteControl from '@components/records/DeleteControl';
import AuditLine from '@components/AuditLine';

/**
 * One log-type record with Edit and Delete (backend B3): the view (`children`), an inline edit form, and
 * an inline delete confirm. These records are not announced over the realtime socket, so after a change
 * the fleet queries are refetched here and `onChanged` refetches the owner's detail (derived values —
 * e.g. a schedule's last-service date, fuel economy — are recomputed by the backend).
 */
export default function RecordItem({
  resource,
  record,
  fields,
  noun,
  deleteQuestion,
  onChanged,
  children,
  className = 'bg-surface-2 rounded-md p-3 mb-2',
}: {
  resource: string;
  record: any;
  fields: FieldDef[];
  noun: string;
  deleteQuestion: string;
  onChanged?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const changed = () => {
    invalidateFleetQueries(qc);
    onChanged?.();
  };

  if (editing) {
    return (
      <RecordForm
        resource={resource}
        record={record}
        fields={fields}
        noun={noun}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          changed();
        }}
      />
    );
  }

  const remove = async () => {
    const res: any = await del(`/api/${resource}/${record.id}`, {}, false);

    if (res?.error || res?.success === false) {
      toast.error(res?.message || `Could not delete the ${noun.toLowerCase()}.`);

      return;
    }

    toast.success(`${noun} deleted.`);
    changed();
  };

  return (
    <div className={className}>
      {children}
      <AuditLine record={record} className="text-[10px] text-ink-2 mt-1.5" />
      <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-line-soft">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[10px] px-2 py-0.5 text-accent-cyan border border-line rounded hover:bg-surface-1"
        >
          Edit
        </button>
        <DeleteControl compact question={deleteQuestion} onConfirm={remove} />
      </div>
    </div>
  );
}
