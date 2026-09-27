/* eslint-disable @typescript-eslint/no-explicit-any */
import RequiredHint from '@components/RequiredHint';
import { useState } from 'react';
import { FileText, AlertTriangle, Plus } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { post } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import RecordItem from '@components/records/RecordItem';
import { DOCUMENT_FIELDS } from '@components/records/fields';

/**
 * Regulatory Compliance pillar. Deliberately its own file, not defined
 * inline inside VehicleDetailModal or DriverDetailModal — this is
 * genuinely the same UI for both (documentableType differs, everything
 * else is identical), so building it twice would mean two copies that
 * could quietly drift apart.
 */
export default function ComplianceTab({
  documentableType,
  documentableId,
}: {
  documentableType: string;
  documentableId: string | number;
}) {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, refetch } = useSimpleQuery(
    `compliance-docs-${documentableType}-${documentableId}`,
    '/api/compliance-documents',
    { documentable_type: documentableType, documentable_id: documentableId }
  );
  const documents: any[] = data?.success ? data.data : [];

  return (
    <div>
      {isLoading && <div className="text-xs text-ink-2 text-center py-4">Loading…</div>}

      {!isLoading && documents.length === 0 && !showForm && (
        <div className="text-[11px] text-ink-2 italic mb-3">No compliance documents on file.</div>
      )}

      {documents.map((d: any) => {
        // The document endpoints carry no is_expired flag (backend confirmed) — derive it from the date.
        const days = d.expiry_date
          ? Math.round((new Date(d.expiry_date).getTime() - Date.now()) / 86_400_000)
          : null;
        const expired = days !== null && days < 0;
        const soon = days !== null && days >= 0 && days <= 30;

        return (
          <RecordItem
            key={d.id}
            resource="compliance-documents"
            record={d}
            fields={DOCUMENT_FIELDS}
            noun="Document"
            deleteQuestion="Delete this document?"
            onChanged={refetch}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-0">
              <FileText size={12} /> {d.document_type}
            </div>
            {d.document_number && (
              <div className="text-[11px] text-ink-2 mt-1">#{d.document_number}</div>
            )}
            {d.expiry_date && (
              <div
                className={`text-[11px] mt-1 flex items-center gap-1 ${expired ? 'text-danger-text' : soon ? 'text-warning' : 'text-ink-2'}`}
              >
                {(expired || soon) && <AlertTriangle size={10} />}
                {expired ? 'Expired' : 'Expires'} {new Date(d.expiry_date).toLocaleDateString()}
              </div>
            )}
            {d.notes && <div className="text-[11px] text-ink-1 mt-1">{d.notes}</div>}
          </RecordItem>
        );
      })}

      {showForm ? (
        <NewDocumentForm
          documentableType={documentableType}
          documentableId={documentableId}
          onClose={() => setShowForm(false)}
          onCreated={refetch}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs btn-brand border border-transparent rounded-full px-2.5 py-1.5 mt-2"
        >
          <Plus size={12} /> Add Document
        </button>
      )}
    </div>
  );
}

function NewDocumentForm({
  documentableType,
  documentableId,
  onClose,
  onCreated,
}: {
  documentableType: string;
  documentableId: string | number;
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const [type, setType] = useState('');
  const [number, setNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!type.trim()) return;

    setSubmitting(true);
    const response = await post(
      '/api/compliance-documents',
      {
        documentable_type: documentableType,
        documentable_id: documentableId,
        document_type: type.trim(),
        document_number: number.trim() || null,
        expiry_date: expiryDate || null,
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not add document.');

      return;
    }

    toast.success('Document added.');
    onCreated?.();
    onClose?.();
  };

  return (
    <div className="bg-surface-2 rounded-md p-3 mt-2">
      <input
        value={type}
        onChange={e => setType(e.target.value)}
        placeholder="Document type (e.g. Registration, Insurance)"
        className="w-full field mb-2"
      />
      <input
        value={number}
        onChange={e => setNumber(e.target.value)}
        placeholder="Document number (optional)"
        className="w-full field mb-2"
      />
      <input
        value={expiryDate}
        onChange={e => setExpiryDate(e.target.value)}
        type="date"
        className="w-full field mb-2"
      />
      <RequiredHint missing={type.trim() ? [] : ['document type']} />
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={submitting || !type.trim()}
          className="flex-1 text-xs btn-brand border border-transparent rounded-full py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
