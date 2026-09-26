// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React from 'react';
import { X } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

/**
 * Real UI for GET /api/devices/{id}/points, built earlier this session and
 * never given a frontend surface until now — confirmed orphaned via a
 * grep across the whole frontend before starting this.
 */
export default function DevicePointsModal({ deviceId, deviceName, onClose = null }) {
  const { closeModal } = useModal();
  // Optional onClose lets a caller render this inline (e.g. as an overlay
  // within its own already-open modal) instead of through the global
  // single-slot ModalContext — closing then returns to that caller's view
  // instead of replacing/destroying it. Defaults to the original global
  // close so every existing call site (which doesn't pass onClose) is
  // unaffected.
  const handleClose = onClose || closeModal;

  const { data, isLoading } = useSimpleQuery(
    `device-points-${deviceId}`,
    `/api/devices/${deviceId}/points`
  );

  const points = data?.data?.points || [];
  const lastReportedAt = data?.data?.last_reported_at;

  return (
    <div className="glass-strong  w-[560px] max-h-[80vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">Points — {deviceName}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {lastReportedAt
              ? `Last reported ${new Date(lastReportedAt).toLocaleString()}`
              : 'No data reported yet'}
          </p>
        </div>
        <button onClick={handleClose} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading points…</div>}

        {!isLoading && points.length === 0 && (
          <div className="text-xs text-ink-2 py-8 text-center border border-dashed border-line rounded-md">
            No points configured for this device's product yet.
          </div>
        )}

        {!isLoading && points.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-2 border-b border-line-soft">
                <th className="pb-2 font-medium">Point</th>
                <th className="pb-2 font-medium">Last value</th>
                <th className="pb-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {points.map(point => (
                <tr key={point.point_key} className="border-b border-line-soft last:border-0">
                  <td className="py-2 font-mono text-ink-1">
                    {point.label || point.point_key}
                    {point.is_unique_identifier && (
                      <span className="ml-1.5 text-[9px] text-brand-text uppercase">ID</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-ink-0">
                    {point.last_value === null || point.last_value === undefined ? (
                      <span className="text-ink-2 italic">—</span>
                    ) : (
                      String(point.last_value)
                    )}
                  </td>
                  <td className="py-2 text-ink-2">{point.unit || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
