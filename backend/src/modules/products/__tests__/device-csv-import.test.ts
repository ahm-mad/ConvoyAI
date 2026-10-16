import { describe, expect, it } from 'vitest';
import { CsvParseError, MAX_CSV_ROWS, parseDeviceCsv } from '../device-csv-import.js';

describe('parseDeviceCsv (D-0148)', () => {
  it('parses the sample header shape into 1-based data rows', () => {
    const csv =
      'device_unique_identifier,name,location\nA1B2,Sensor A,Warehouse 1\nC3D4,Sensor B,Warehouse 2\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows).toEqual([
      { row: 1, deviceUniqueIdentifier: 'A1B2', name: 'Sensor A', location: 'Warehouse 1' },
      { row: 2, deviceUniqueIdentifier: 'C3D4', name: 'Sensor B', location: 'Warehouse 2' },
    ]);
  });

  it('Q4: matches columns by header name regardless of order', () => {
    const csv = 'location,name,device_unique_identifier\nWarehouse 1,Sensor A,A1B2\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows).toEqual([
      { row: 1, deviceUniqueIdentifier: 'A1B2', name: 'Sensor A', location: 'Warehouse 1' },
    ]);
  });

  it('Q4: ignores extra/unrecognized columns', () => {
    const csv =
      'device_unique_identifier,name,location,extra_column\nA1B2,Sensor A,Warehouse 1,whatever\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows).toEqual([
      { row: 1, deviceUniqueIdentifier: 'A1B2', name: 'Sensor A', location: 'Warehouse 1' },
    ]);
  });

  it("leaves a missing column's value undefined for that row, rather than throwing", () => {
    const csv = 'device_unique_identifier,name,location\nA1B2,,Warehouse 1\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows).toEqual([
      { row: 1, deviceUniqueIdentifier: 'A1B2', name: undefined, location: 'Warehouse 1' },
    ]);
  });

  it('skips blank lines without counting them as data rows', () => {
    const csv =
      'device_unique_identifier,name,location\nA1B2,Sensor A,Warehouse 1\n\nC3D4,Sensor B,Warehouse 2\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows.map(r => r.row)).toEqual([1, 2]);
  });

  it('Q2: rejects the whole file when it exceeds the 500-row ceiling', () => {
    const rows = Array.from(
      { length: MAX_CSV_ROWS + 1 },
      (_, i) => `dev-${String(i)},Sensor,Loc`
    ).join('\n');
    const csv = `device_unique_identifier,name,location\n${rows}\n`;

    expect(() => parseDeviceCsv(Buffer.from(csv))).toThrow(CsvParseError);
  });

  it('accepts exactly the row-limit ceiling', () => {
    const rows = Array.from({ length: MAX_CSV_ROWS }, (_, i) => `dev-${String(i)},Sensor,Loc`).join(
      '\n'
    );
    const csv = `device_unique_identifier,name,location\n${rows}\n`;

    expect(() => parseDeviceCsv(Buffer.from(csv))).not.toThrow();
  });

  it('throws CsvParseError (not a raw csv-parse error) for genuinely malformed CSV', () => {
    // An unterminated quoted field -- csv-parse's sync parser throws on this.
    const csv = 'device_unique_identifier,name,location\n"unterminated,Sensor,Loc\n';

    expect(() => parseDeviceCsv(Buffer.from(csv))).toThrow(CsvParseError);
  });

  it('handles a UTF-8 BOM without it leaking into the first header name', () => {
    const csv = '﻿device_unique_identifier,name,location\nA1B2,Sensor A,Warehouse 1\n';

    const rows = parseDeviceCsv(Buffer.from(csv));

    expect(rows).toEqual([
      { row: 1, deviceUniqueIdentifier: 'A1B2', name: 'Sensor A', location: 'Warehouse 1' },
    ]);
  });
});
