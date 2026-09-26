import { useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

interface CsvColumn {
  name: string;
  required: boolean;
  description: string;
  example: string;
}

const DEVICE_CSV_COLUMNS: CsvColumn[] = [
  {
    name: 'device_unique_identifier',
    required: true,
    description: "The device's unique identifier (e.g. its Dev EUI). Must be unique per device.",
    example: 'A1B2C3D4E5F6',
  },
  {
    name: 'name',
    required: true,
    description: 'A human-readable name for the device, shown throughout the dashboard.',
    example: 'Temperature Sensor - Floor 1',
  },
  {
    name: 'location',
    required: true,
    description: "The device's physical location or install site.",
    example: 'Building A - Floor 1',
  },
];

const SAMPLE_CSV_PATH = '/samples/devices-bulk-upload-sample.csv';

interface DocSection {
  id: string;
  title: string;
  render: () => React.ReactNode;
}

function DeviceBulkUploadSection() {
  return (
    <div>
      <h1 className="page-title">Device Bulk Upload — CSV Format</h1>
      <p className="text-xs text-ink-2 mt-1 max-w-2xl">
        Use this format when bulk-uploading devices via CSV in the product onboarding flow (Device
        Details step). The first row must be the header row with exactly these column names.
      </p>

      <a
        href={SAMPLE_CSV_PATH}
        download
        className="inline-flex items-center gap-2 mt-4 px-3 py-2 rounded-control bg-primary text-surface-0 text-xs font-medium hover:opacity-90 transition-opacity"
      >
        <Download size={14} />
        Download sample CSV
      </a>

      <div className="mt-6 border border-line-soft rounded-control overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-2">
            <tr>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Column
              </th>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Required
              </th>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Description
              </th>
              <th className="p-2 font-medium text-[10.5px] uppercase tracking-wider text-ink-2">
                Example
              </th>
            </tr>
          </thead>
          <tbody>
            {DEVICE_CSV_COLUMNS.map(col => (
              <tr key={col.name} className="border-t border-line-soft">
                <td className="p-2 align-top">
                  <code className="text-xs text-accent-cyan">{col.name}</code>
                </td>
                <td className="p-2 align-top">
                  {col.required && (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 size={12} /> Required
                    </span>
                  )}
                </td>
                <td className="p-2 align-top text-xs text-ink-1">{col.description}</td>
                <td className="p-2 align-top text-xs text-ink-2">{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 border border-line-soft rounded-control p-4 bg-surface-1">
        <p className="text-xs font-medium text-ink-0 mb-2">Notes</p>
        <ul className="list-disc list-inside text-xs text-ink-2 space-y-1">
          <li>One row per device — no header-row duplicates, no blank rows in between.</li>
          <li>
            <code className="text-accent-cyan">device_unique_identifier</code> must be unique across
            your devices; duplicates will be rejected.
          </li>
          <li>File must be a .csv, up to 5 MB per upload.</li>
        </ul>
      </div>
    </div>
  );
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'device-bulk-upload',
    title: 'Device Bulk Upload (CSV)',
    render: DeviceBulkUploadSection,
  },
];

export default function Documentation() {
  const [activeId, setActiveId] = useState(DOC_SECTIONS[0].id);
  const active = DOC_SECTIONS.find(s => s.id === activeId) ?? DOC_SECTIONS[0];

  return (
    <div className="flex flex-col md:flex-row gap-6 p-5 h-full">
      <nav className="md:w-56 shrink-0">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-ink-2 mb-2 px-2">
          Documentation
        </p>
        <ul className="space-y-1">
          {DOC_SECTIONS.map(section => (
            <li key={section.id}>
              <button
                onClick={() => setActiveId(section.id)}
                className={`w-full text-left px-2 py-1.5 rounded-control text-xs transition-colors ${
                  activeId === section.id
                    ? 'bg-surface-2 text-ink-0 font-medium'
                    : 'text-ink-1 hover:bg-surface-1'
                }`}
              >
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-1 min-w-0">
        <active.render />
      </div>
    </div>
  );
}
