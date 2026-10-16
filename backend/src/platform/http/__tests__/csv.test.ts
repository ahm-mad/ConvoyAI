import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { ValidationError } from '../../errors/app-error.js';
import {
  EXPORT_BATCH,
  EXPORT_LIMIT,
  csvCell,
  csvLine,
  exportTimestamp,
  planExport,
  streamCsv,
  type CsvColumn,
} from '../csv.js';

describe('csvCell (RFC 4180 + spreadsheet-formula guard)', () => {
  it('renders null/undefined empty, dates as ISO, booleans and numbers plainly', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date('2026-09-25T00:45:00Z'))).toBe('2026-09-25T00:45:00.000Z');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(false)).toBe('false');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3'); // a real number is not a formula
    expect(csvCell(0)).toBe('0');
  });

  it('quotes cells with commas, quotes or line breaks and doubles inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Zürich – 北京')).toBe('Zürich – 北京');
  });

  it('neutralises formula injection in text cells with a leading apostrophe', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\tTAB')).toBe("'\tTAB");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`); // prefixed AND quoted
    expect(csvCell('not=formula')).toBe('not=formula'); // only a leading character matters
  });

  it('serialises other values as JSON', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('csvLine joins cells with commas and ends with CRLF', () => {
    expect(csvLine(['a', null, 3, 'x,y'])).toBe('a,,3,"x,y"\r\n');
  });

  it('exportTimestamp is UTC YYYYMMDD-HHMMSS', () => {
    expect(exportTimestamp(new Date('2026-09-25T00:45:07Z'))).toBe('20260925-004507');
  });
});

const columns: CsvColumn<{ id: number; name: string }>[] = [
  { header: 'id', value: r => r.id },
  { header: 'name', value: r => r.name },
];

describe('planExport', () => {
  it('fetches page 1 first, then the remaining pages in EXPORT_BATCH steps', async () => {
    const total = EXPORT_BATCH * 2 + 1;
    const fetchPage = vi.fn((page: number, perPage: number) => {
      const start = (page - 1) * perPage;
      const items = Array.from(
        { length: Math.max(0, Math.min(perPage, total - start)) },
        (_, i) => ({ id: start + i + 1, name: `n${String(start + i + 1)}` })
      );
      return Promise.resolve({ items, total });
    });
    const plan = await planExport('things', columns, fetchPage);

    expect(plan.total).toBe(total);
    expect(fetchPage).toHaveBeenCalledTimes(1); // only the probe so far
    const seen: number[] = [];
    for await (const batch of plan.batches()) seen.push(...batch.map(row => row.id));
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(fetchPage.mock.calls.map(call => call)).toEqual([
      [1, EXPORT_BATCH],
      [2, EXPORT_BATCH],
      [3, EXPORT_BATCH],
    ]);
  });

  it('refuses a result larger than the limit with a 422 naming the count, before returning a plan', async () => {
    const error = await planExport('things', columns, () =>
      Promise.resolve({ items: [], total: EXPORT_LIMIT + 1 })
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toBe(
      'The export matches 50001 rows; the limit is 50000 per export. Narrow the filter.'
    );
    await expect(
      planExport('things', columns, () => Promise.resolve({ items: [], total: EXPORT_LIMIT }))
    ).resolves.toBeDefined();
  });

  it('an empty result is header-only (one empty batch)', async () => {
    const plan = await planExport('things', columns, () =>
      Promise.resolve({ items: [], total: 0 })
    );
    const batches: unknown[][] = [];
    for await (const batch of plan.batches()) batches.push(batch);
    expect(batches).toEqual([[]]);
  });
});

function fakeRes() {
  const emitter = new EventEmitter();
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const res = Object.assign(emitter, {
    statusCode: 0,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
    end: vi.fn(),
    destroy: vi.fn(),
  });
  return { res: res as unknown as Response, raw: res, headers, chunks };
}

describe('streamCsv', () => {
  it('sends download headers, a BOM + header row, then every row', async () => {
    const plan = await planExport('vehicles', columns, () =>
      Promise.resolve({
        items: [
          { id: 1, name: 'Truck, A' },
          { id: 2, name: '=evil()' },
        ],
        total: 2,
      })
    );
    const { res, raw, headers, chunks } = fakeRes();

    await streamCsv(res, plan);

    expect(raw.statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="vehicles-\d{8}-\d{6}\.csv"$/
    );
    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['X-Export-Row-Count']).toBe('2');
    const body = chunks.join('');
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.slice(1)).toBe('id,name\r\n1,"Truck, A"\r\n2,\'=evil()\r\n');
    expect(raw.end).toHaveBeenCalledTimes(1);
  });

  it('waits for drain when the socket buffer is full (back-pressure)', async () => {
    const plan = await planExport('x', columns, () =>
      Promise.resolve({ items: [{ id: 1, name: 'a' }], total: 1 })
    );
    const { res, raw } = fakeRes();
    let call = 0;
    raw.write.mockImplementation(() => {
      call += 1;
      if (call === 1) setTimeout(() => raw.emit('drain'), 5); // the header write reports a full buffer
      return call !== 1;
    });

    await streamCsv(res, plan);

    expect(raw.write).toHaveBeenCalledTimes(2);
    expect(raw.end).toHaveBeenCalledTimes(1);
  });

  it('a failure after the headers were sent aborts the connection instead of pretending success', async () => {
    let pages = 0;
    const plan = await planExport('x', columns, () => {
      pages += 1;
      if (pages > 1) return Promise.reject(new Error('db went away'));
      return Promise.resolve({ items: [{ id: 1, name: 'a' }], total: EXPORT_BATCH + 1 });
    });
    const { res, raw } = fakeRes();

    await streamCsv(res, plan);

    expect(raw.destroy).toHaveBeenCalledTimes(1);
    expect(raw.end).not.toHaveBeenCalled();
  });
});
