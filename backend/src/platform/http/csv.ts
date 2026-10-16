import type { Response } from 'express';
import { ValidationError } from '../errors/app-error.js';
import { logger } from '../logging/logger.js';

/**
 * Shared CSV export machinery for the fleet lists (D-0168, B11 of `flows/06-fleet-enterprise-readiness.md`).
 * Owner decision Q6: streamed `GET …/export` endpoints that take the matching list's own search/filter/sort parameters,
 * cap the result at `EXPORT_LIMIT` rows (a clear 422 above it, before anything is sent) and escape spreadsheet formula
 * characters. Rows are fetched in `EXPORT_BATCH` pages with the list's own query (id tie-broken, so pages never overlap)
 * and written as they arrive — memory stays flat whatever the row count.
 */

export const EXPORT_LIMIT = 50_000;
export const EXPORT_BATCH = 500;

/** UTF-8 byte-order mark: makes Excel read non-ASCII text correctly. */
const BOM = String.fromCharCode(0xfeff);

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export interface ExportPlan<T> {
  /** File name stem, e.g. `vehicles` — the download is `vehicles-20260925-004500.csv`. */
  name: string;
  columns: CsvColumn<T>[];
  total: number;
  /** Yields the rows batch by batch (the first batch is already fetched by `planExport`). */
  batches: () => AsyncGenerator<T[]>;
}

/**
 * One CSV cell. `null`/`undefined` → empty; `Date` → ISO 8601; booleans → `true`/`false`; numbers as-is. A *string* that starts with
 * `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'` so a spreadsheet cannot run it as a formula (CSV injection);
 * a value that contains a comma, a quote or a line break is wrapped in quotes with inner quotes doubled (RFC 4180).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  else if (typeof value === 'string') text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  else text = JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(',')}\r\n`;
}

/** `20260925-004500` (UTC). */
export function exportTimestamp(now: Date = new Date()): string {
  const iso = now.toISOString(); // 2026-09-25T00:45:00.000Z
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

/**
 * Fetches page 1, refuses (422, before any byte is sent) a result larger than `EXPORT_LIMIT`, and returns the plan whose `batches()`
 * yields page 1 and then the remaining pages. `fetchPage` must apply the list's own filters and (id tie-broken) sort.
 */
export async function planExport<T>(
  name: string,
  columns: CsvColumn<T>[],
  fetchPage: (page: number, perPage: number) => Promise<{ items: T[]; total: number }>
): Promise<ExportPlan<T>> {
  const first = await fetchPage(1, EXPORT_BATCH);
  if (first.total > EXPORT_LIMIT) {
    throw new ValidationError(
      `The export matches ${String(first.total)} rows; the limit is ${String(EXPORT_LIMIT)} per export. Narrow the filter.`
    );
  }
  return {
    name,
    columns,
    total: first.total,
    batches: async function* () {
      yield first.items;
      const pages = Math.ceil(first.total / EXPORT_BATCH);
      for (let page = 2; page <= pages; page++) {
        const { items } = await fetchPage(page, EXPORT_BATCH);
        if (items.length === 0) return;
        yield items;
      }
    },
  };
}

/** Writes the plan as a download: UTF-8 BOM (so Excel reads non-ASCII text correctly), header row, then the rows batch by batch with back-pressure. */
export async function streamCsv<T>(res: Response, plan: ExportPlan<T>): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${plan.name}-${exportTimestamp()}.csv"`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Export-Row-Count', String(plan.total));
  const write = async (chunk: string): Promise<void> => {
    if (!res.write(chunk)) await new Promise<void>(resolve => res.once('drain', resolve));
  };
  try {
    await write(BOM + csvLine(plan.columns.map(column => column.header)));
    for await (const batch of plan.batches()) {
      await write(
        batch.map(row => csvLine(plan.columns.map(column => column.value(row)))).join('')
      );
    }
    res.end();
  } catch (error) {
    // headers are already sent — the only honest signal left is to abort the connection so the client sees a broken download
    logger.error({ err: error, export: plan.name }, 'csv export failed mid-stream');
    res.destroy(error instanceof Error ? error : undefined);
  }
}
