import { parse } from 'csv-parse/sync';

/**
 * D-0148: CSV parsing for the device bulk-import feature
 * (`communication/flows/03-device-bulk-csv-import.md` in the sync bridge — greenfield, no Laravel
 * precedent, the frozen contract never had this capability). Q4's answer: header-name matching
 * (any column order), extra/unrecognized columns ignored, case-sensitive header names matching the
 * sample file (`device_unique_identifier`, `name`, `location`). Q2's answer: 500-row ceiling,
 * rejected upfront (the whole file, not partial) so the client always knows why nothing happened.
 */
export const MAX_CSV_ROWS = 500;

export class CsvParseError extends Error {}

export interface CsvDeviceRow {
  /** 1-based, data row only — the header row is never counted, matching what a user sees counting
   *  rows in a spreadsheet or in the frontend's own CSV preview table. */
  row: number;
  deviceUniqueIdentifier: string | undefined;
  name: string | undefined;
  location: string | undefined;
}

export function parseDeviceCsv(buffer: Buffer): CsvDeviceRow[] {
  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CsvParseError(`The CSV file could not be parsed: ${message}`);
  }

  if (records.length > MAX_CSV_ROWS) {
    throw new CsvParseError(
      `The CSV file has ${String(records.length)} rows, which exceeds the ${String(MAX_CSV_ROWS)}-row limit.`
    );
  }

  return records.map((record, i) => ({
    row: i + 1,
    deviceUniqueIdentifier: record['device_unique_identifier'] || undefined,
    name: record['name'] || undefined,
    location: record['location'] || undefined,
  }));
}
