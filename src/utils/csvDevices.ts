import Papa from 'papaparse';

export const REQUIRED_CSV_COLUMNS = ['device_unique_identifier', 'name', 'location'] as const;
export const MAX_CSV_ROWS = 500;

export interface DeviceCsvRow {
  device_unique_identifier: string;
  name: string;
  location: string;
}

export interface ImportError {
  source: 'csv' | 'manual';
  row?: number;
  index?: number;
  device_unique_identifier: string;
  errors: string[];
}

export interface ImportSummary {
  manual_count: number;
  csv_count: number;
  created_count: number;
  failed_count: number;
  errors: ImportError[];
}

export interface ParsedCsvResult {
  rows: DeviceCsvRow[];
  error: string | null;
}

export function parseDeviceCsv(file: File): Promise<ParsedCsvResult> {
  return new Promise(resolve => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        if (results.errors.length > 0) {
          resolve({
            rows: [],
            error: `The CSV file could not be parsed: ${results.errors[0].message}`,
          });
          return;
        }

        const fields = results.meta.fields || [];
        const missing = REQUIRED_CSV_COLUMNS.filter(col => !fields.includes(col));
        if (missing.length > 0) {
          resolve({
            rows: [],
            error: `CSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
          });
          return;
        }

        const rows: DeviceCsvRow[] = results.data.map(row => ({
          device_unique_identifier: (row.device_unique_identifier || '').trim(),
          name: (row.name || '').trim(),
          location: (row.location || '').trim(),
        }));

        if (rows.length === 0) {
          resolve({ rows: [], error: 'CSV has no device rows.' });
          return;
        }

        if (rows.length > MAX_CSV_ROWS) {
          resolve({
            rows: [],
            error: `CSV has ${rows.length} rows, which exceeds the ${MAX_CSV_ROWS}-row limit.`,
          });
          return;
        }

        resolve({ rows, error: null });
      },
      error: (error: Error) => {
        resolve({ rows: [], error: `The CSV file could not be parsed: ${error.message}` });
      },
    });
  });
}

export function buildErrorReportCsv(errors: ImportError[]): string {
  const rows = errors.map(e => ({
    source: e.source,
    row_or_index: e.source === 'csv' ? (e.row ?? '') : (e.index ?? 0) + 1,
    device_unique_identifier: e.device_unique_identifier,
    errors: e.errors.join('; '),
  }));
  return Papa.unparse(rows);
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
