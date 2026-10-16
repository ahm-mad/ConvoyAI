import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors/app-error.js';
import { z } from 'zod';
import {
  BULK_LIMIT,
  bodyFlag,
  bulkBodySchema,
  bulkResponse,
  resolveBulkTargets,
  runBulk,
} from '../bulk.js';

const schema = bulkBodySchema(z.object({ search: z.string().optional() }));

describe('bulkBodySchema (ids XOR filter, ≤ 500)', () => {
  it('accepts ids (numbers or strings) or a filter', () => {
    expect(schema.safeParse({ ids: [1, '2'] }).success).toBe(true);
    expect(schema.safeParse({ filter: { search: 'x' } }).success).toBe(true);
    expect(schema.safeParse({ filter: {} }).success).toBe(true);
  });

  it('rejects neither, both, empty ids and non-integer ids', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ ids: [1], filter: {} }).success).toBe(false);
    expect(schema.safeParse({ ids: [] }).success).toBe(false);
    expect(schema.safeParse({ ids: [1.5] }).success).toBe(false);
    const bad = schema.safeParse({});
    expect(bad.error?.issues[0]?.message).toBe('Provide either ids or filter (exactly one).');
  });

  it('caps ids at 500 with a fixed message', () => {
    expect(
      schema.safeParse({ ids: Array.from({ length: BULK_LIMIT }, (_, i) => i + 1) }).success
    ).toBe(true);
    const tooMany = schema.safeParse({
      ids: Array.from({ length: BULK_LIMIT + 1 }, (_, i) => i + 1),
    });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.message).toBe(
      'You can act on at most 500 records per request.'
    );
  });

  it('bodyFlag understands JSON booleans, 0/1 and their string spellings', () => {
    expect([
      bodyFlag(true),
      bodyFlag(1),
      bodyFlag('1'),
      bodyFlag('true'),
      bodyFlag(false),
      bodyFlag(0),
      bodyFlag('0'),
      bodyFlag('false'),
      bodyFlag(undefined),
    ]).toEqual([true, true, true, true, false, false, false, false, undefined]);
  });
});

describe('resolveBulkTargets', () => {
  it('uses the given ids (deduplicated, as strings) without touching the database', async () => {
    const fetch = vi.fn();
    const targets = await resolveBulkTargets({ ids: [3, '3', '4'] }, fetch);
    expect(targets).toEqual({ ids: ['3', '4'], mode: 'ids', matched: 2 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves a filter to its ids and reports how many matched', async () => {
    const targets = await resolveBulkTargets({}, () =>
      Promise.resolve({ ids: ['1', '2'], total: 2 })
    );
    expect(targets).toEqual({ ids: ['1', '2'], mode: 'filter', matched: 2 });
  });

  it('refuses a filter that matches more than the limit, naming the count', async () => {
    await expect(
      resolveBulkTargets({}, () => Promise.resolve({ ids: [], total: 501 }))
    ).rejects.toThrow(
      'The filter matches 501 records; the limit is 500 per request. Narrow the filter.'
    );
    await expect(
      resolveBulkTargets({}, () => Promise.resolve({ ids: [], total: 501 }))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('runBulk / bulkResponse', () => {
  it("runs every id in order; an AppError becomes that record's message, a success keeps the action's message; every result carries changed + label", async () => {
    const results = await runBulk(
      ['1', '2', '3'],
      id => {
        if (id === '2')
          return Promise.reject(
            new ValidationError('Unassign this driver from their vehicle before deactivating them.')
          );
        if (id === '3') return Promise.reject(new NotFoundError('Driver not found.'));
        return Promise.resolve({ message: 'Done.' });
      },
      'fallback',
      id => Promise.resolve(id === '3' ? undefined : `Name ${id}`)
    );
    expect(results).toEqual([
      { id: '1', ok: true, changed: true, label: 'Name 1', message: 'Done.' },
      {
        id: '2',
        ok: false,
        changed: false,
        label: 'Name 2',
        message: 'Unassign this driver from their vehicle before deactivating them.',
      },
      { id: '3', ok: false, changed: false, label: null, message: 'Driver not found.' },
    ]);
  });

  it('an action can report changed: false (already in the target state); the label defaults to null without a resolver', async () => {
    const results = await runBulk(
      ['1', '2'],
      id =>
        Promise.resolve(
          id === '1' ? { changed: false, message: 'Vehicle is already active.' } : {}
        ),
      'Vehicle reactivated successfully.'
    );
    expect(results).toEqual([
      { id: '1', ok: true, changed: false, label: null, message: 'Vehicle is already active.' },
      {
        id: '2',
        ok: true,
        changed: true,
        label: null,
        message: 'Vehicle reactivated successfully.',
      },
    ]);
  });

  it('a failing label lookup leaves the label null instead of failing the record', async () => {
    const results = await runBulk(
      ['1'],
      () => Promise.resolve({}),
      'ok',
      () => Promise.reject(new Error('lookup failed'))
    );
    expect(results[0]).toMatchObject({ ok: true, label: null });
  });

  it('falls back to the default ok message and maps an unexpected error to a generic one (the loop continues)', async () => {
    const results = await runBulk(
      ['1', '2', '3'],
      id => (id === '2' ? Promise.reject(new Error('boom')) : Promise.resolve({})),
      'Trip deleted successfully.'
    );
    expect(results.map(r => [r.id, r.ok, r.message])).toEqual([
      ['1', true, 'Trip deleted successfully.'],
      ['2', false, 'Unexpected error.'],
      ['3', true, 'Trip deleted successfully.'],
    ]);
  });

  it('bulkResponse summarises succeeded / changed / failed and stays a success envelope', () => {
    const body = bulkResponse({ ids: ['1', '2', '3'], mode: 'filter', matched: 3 }, [
      { id: '1', ok: true, changed: true, label: 'A', message: 'ok' },
      { id: '2', ok: true, changed: false, label: 'B', message: 'already' },
      { id: '3', ok: false, changed: false, label: null, message: 'no' },
    ]);
    expect(body).toMatchObject({
      success: true,
      message: '2 of 3 succeeded.',
      data: {
        summary: { mode: 'filter', matched: 3, processed: 3, succeeded: 2, changed: 1, failed: 1 },
      },
    });
  });
});
