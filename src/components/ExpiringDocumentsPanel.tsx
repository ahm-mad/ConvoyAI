/* eslint-disable @typescript-eslint/no-explicit-any */
import { FileWarning } from 'lucide-react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import DriverDetailModal from '@components/DriverDetailModal';

const DAY = 86_400_000;

/** Whole days from today to the expiry date (negative = already expired). Dates are date-only (UTC midnight). */
const daysLeft = (iso: string) => {
  const d = new Date(iso);
  const expiry = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((expiry - today) / DAY);
};

const ownerName = (doc: any) => {
  const o = doc.documentable;

  if (!o) return `${doc.documentable_type} #${doc.documentable_id}`;
  if (doc.documentable_type === 'driver') {
    return `${o.first_name || ''} ${o.last_name || ''}`.trim() || `Driver #${doc.documentable_id}`;
  }

  return o.name || o.plate || `Vehicle #${doc.documentable_id}`;
};

/**
 * Dashboard widget: compliance documents that are expired or expire within 30 days, company-wide
 * (GET /compliance-documents/expiring-soon). Click a row → the owner's Compliance tab.
 */
export default function ExpiringDocumentsPanel() {
  const { openModal } = useModal();
  // `fleet-dashboard-` prefix: refreshed with the rest of the dashboard on fleet events / reconnects.
  const { data, isLoading, refetch } = useSimpleQuery(
    'fleet-dashboard-expiring-documents',
    '/api/compliance-documents/expiring-soon',
    {},
    { refetchInterval: 300000 }
  );

  const res: any = data;
  const failed = res && res.success === false;
  const docs: any[] = [...(res?.success ? res.data : [])].sort(
    (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
  );

  const open = (doc: any) =>
    openModal(
      doc.documentable_type === 'driver' ? (
        <DriverDetailModal driverId={doc.documentable_id} initialTab="compliance" />
      ) : (
        <VehicleDetailModal vehicleId={doc.documentable_id} initialTab="compliance" />
      )
    );

  return (
    <div className="glass-strong  p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileWarning size={14} className="text-warning" />
        <span className="text-xs font-semibold text-ink-0">Expiring Documents</span>
        <span className="text-[11px] text-ink-2">
          {isLoading || failed ? '' : `(${docs.length})`}
        </span>
        <span className="text-[10px] text-ink-2 ml-auto">Expired or within 30 days</span>
      </div>

      {isLoading && <div className="text-xs text-ink-2 py-4 text-center">Loading…</div>}

      {failed && (
        <div className="text-xs text-danger-text flex items-center justify-between">
          <span>{res.message || 'Could not load expiring documents.'}</span>
          <button type="button" onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !failed && docs.length === 0 && (
        <div className="text-xs text-ink-2 py-4 text-center border border-dashed border-line rounded-md">
          No documents are expiring. All compliance paperwork is current.
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map(doc => {
            const left = daysLeft(doc.expiry_date);
            const expired = left < 0;
            const label = expired
              ? `Expired ${-left} day${left === -1 ? '' : 's'} ago`
              : left === 0
                ? 'Expires today'
                : `Expires in ${left} day${left === 1 ? '' : 's'}`;

            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => open(doc)}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-2 transition-colors"
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    expired ? 'bg-danger/10 text-danger-text' : 'bg-warning/10 text-warning'
                  }`}
                >
                  {label}
                </span>
                <span className="text-xs text-ink-0 truncate flex-1">
                  {doc.document_type}
                  {doc.document_number ? ` · #${doc.document_number}` : ''}
                </span>
                <span className="text-[10px] text-ink-2 shrink-0 capitalize">
                  {doc.documentable_type}
                </span>
                <span className="text-[10px] text-brand-text shrink-0">{ownerName(doc)}</span>
                <span className="text-[10px] text-ink-2 shrink-0">
                  {new Date(doc.expiry_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
