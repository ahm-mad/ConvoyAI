import { useTranslation } from 'react-i18next';
import { Cpu, Info, AlertCircle } from 'lucide-react';
import Dropzone from '../FormComponents/Dropzone';
import TagInput from '../FormComponents/TagInput';
import DeviceErrorTable from '../FormComponents/DeviceErrorTable';
import { parseDeviceCsv, type DeviceCsvRow, type ImportSummary } from '@utils/csvDevices';

const CSV_PREVIEW_ROWS = 10;

interface ThirdstepFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFormData: any;
  importResults?: ImportSummary | null;
}

const ThirdstepForm = ({ formData, setFormData, importResults = null }: ThirdstepFormProps) => {
  const { t } = useTranslation();

  const handleFileSelect = async (file: File | null) => {
    if (!file) {
      setFormData((prev: any) => ({
        ...prev,
        step2: { ...prev.step2, csvFile: null, csvRows: null, csvParseError: null },
      }));
      return;
    }

    const { rows, error } = await parseDeviceCsv(file);
    setFormData((prev: any) => ({
      ...prev,
      step2: {
        ...prev.step2,
        csvFile: error ? null : file,
        csvRows: error ? null : rows,
        csvParseError: error,
      },
    }));
  };

  const csvRows: DeviceCsvRow[] | null = formData?.step2?.csvRows ?? null;
  const csvParseError: string | null = formData?.step2?.csvParseError ?? null;

  return (
    <div className="border-t border-line pt-6">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-accent-cyan" />
        <h1 className="font-semibold text-ink-0">{t('secondStepForm.title')}</h1>
      </div>

      {/* Result of the last save attempt, whenever it had any failures
          (total or partial). The form below is never replaced by this — the
          rows shown in it have already been pruned down to exactly the
          devices that still need fixing (see `pruneToUncreatedDevices` in
          AddDevices.tsx), so editing and resubmitting from here is always
          safe: whatever's created already has been removed from what gets
          sent again. */}
      {importResults && importResults.failed_count > 0 && (
        <div
          className={`mt-3 p-3 rounded-md border ${
            importResults.created_count > 0
              ? 'bg-warning/5 border-warning/20'
              : 'bg-danger/5 border-danger/20'
          }`}
        >
          <div
            className={`flex items-center gap-2 text-sm font-medium ${
              importResults.created_count > 0 ? 'text-warning' : 'text-danger-text'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            {importResults.created_count > 0 ? (
              <span>
                {importResults.created_count} of{' '}
                {importResults.created_count + importResults.failed_count} devices created,{' '}
                {importResults.failed_count} failed — fix the rows below and save again, or continue
                with what was created.
              </span>
            ) : (
              <span>No devices could be created — fix the rows below and try again.</span>
            )}
          </div>
          <div className="mt-3">
            <DeviceErrorTable errors={importResults.errors} />
          </div>
        </div>
      )}

      <div className="mt-3 rounded-md">
        <div>
          <div className="flex gap-2.5 p-3 rounded-md bg-surface-2 border border-line-soft text-xs text-ink-1 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-ink-2 shrink-0 mt-0.5" />
            <p>
              {t('secondStepForm.instruction1')} {t('secondStepForm.instruction2')}{' '}
              <a
                href="/documentation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-text hover:underline font-medium"
              >
                {t('secondStepForm.documentationLink')}
              </a>
              .
            </p>
          </div>
          <div className="mt-4" id="drop-csv">
            <Dropzone onFileSelect={handleFileSelect} />
          </div>

          {csvParseError && <p className="mt-1 text-xs text-danger-text">{csvParseError}</p>}

          {csvRows && csvRows.length > 0 && (
            <div className="mt-3 border border-line-soft rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-surface-2 text-xs font-medium text-ink-0">
                {csvRows.length} device{csvRows.length === 1 ? '' : 's'} ready to import from CSV
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-surface-1">
                    <tr>
                      <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                        Device Unique Identifier
                      </th>
                      <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                        Name
                      </th>
                      <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, CSV_PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-t border-line-soft">
                        <td className="p-2 align-top text-xs text-ink-1">
                          {row.device_unique_identifier}
                        </td>
                        <td className="p-2 align-top text-xs text-ink-1">{row.name}</td>
                        <td className="p-2 align-top text-xs text-ink-1">{row.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > CSV_PREVIEW_ROWS && (
                <div className="px-3 py-1.5 bg-surface-1 text-[10.5px] text-ink-2">
                  and {csvRows.length - CSV_PREVIEW_ROWS} more…
                </div>
              )}
            </div>
          )}

          <TagInput formData={formData} setFormData={setFormData} />
        </div>
      </div>
    </div>
  );
};

export default ThirdstepForm;
