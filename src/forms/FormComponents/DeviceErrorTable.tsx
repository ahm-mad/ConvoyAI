import { Download } from 'lucide-react';
import type { ImportError } from '@utils/csvDevices';
import { buildErrorReportCsv, downloadTextFile } from '@utils/csvDevices';

interface DeviceErrorTableProps {
  errors: ImportError[];
}

export default function DeviceErrorTable({ errors }: DeviceErrorTableProps) {
  const handleDownloadErrors = () => {
    downloadTextFile('device-import-errors.csv', buildErrorReportCsv(errors));
  };

  return (
    <>
      <div className="border border-line-soft rounded-md overflow-hidden overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-2 sticky top-0">
            <tr>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Source
              </th>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Device ID
              </th>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, i) => (
              <tr key={i} className="border-t border-line-soft">
                <td className="p-2 align-top text-xs text-ink-2 whitespace-nowrap">
                  {err.source === 'csv'
                    ? `CSV row ${err.row}`
                    : `Manual row ${(err.index ?? 0) + 1}`}
                </td>
                <td className="p-2 align-top text-xs text-ink-1">
                  {err.device_unique_identifier || '—'}
                </td>
                <td className="p-2 align-top text-xs text-danger">{err.errors.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleDownloadErrors}
        className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border border-line-soft text-xs text-ink-1 hover:bg-surface-2 transition-colors"
      >
        <Download size={13} />
        Download error report (CSV)
      </button>
    </>
  );
}
