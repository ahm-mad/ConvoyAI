import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../../errors/app-error.js';
import { assertFresh, assertNotStale, isStale, STALE_RECORD_MESSAGE } from '../concurrency.js';

const people = new Map([['3', { id: '3', firstName: 'Amina', lastName: 'Khan' }]]);
const directory = {
  findContactsByIds: vi.fn((ids: string[]) =>
    Promise.resolve(new Map([...people].filter(([id]) => ids.includes(id))))
  ),
};
const at = (iso: string) => new Date(iso);
const current = (updatedAt: Date | null, updatedBy: string | null = '3') => ({
  id: '12',
  updatedAt,
  updatedBy,
});

describe('isStale (D-0176, B13)', () => {
  it("no field = no check; null means 'I saw no updated_at'; dates compare at whole seconds", () => {
    expect(isStale(undefined, at('2026-09-25T10:00:00Z'))).toBe(false);
    expect(isStale(undefined, null)).toBe(false);
    expect(isStale(null, null)).toBe(false);
    expect(isStale(null, at('2026-09-25T10:00:00Z'))).toBe(true);
    expect(isStale(at('2026-09-25T10:00:00Z'), null)).toBe(true);
    expect(isStale(at('2026-09-25T10:00:00.000Z'), at('2026-09-25T10:00:00.900Z'))).toBe(false); // same second
    expect(isStale(at('2026-09-25T10:00:00Z'), at('2026-09-25T10:00:01Z'))).toBe(true);
  });
});

describe('assertNotStale', () => {
  it('does nothing when the record is unchanged or the field was not sent', async () => {
    await expect(
      assertNotStale(at('2026-09-25T10:00:00Z'), current(at('2026-09-25T10:00:00Z')), directory)
    ).resolves.toBeUndefined();
    await expect(
      assertNotStale(undefined, current(at('2026-09-25T10:00:00Z')), directory)
    ).resolves.toBeUndefined();
  });

  it('throws 409 with the fixed message and a lean `current` block (who + when)', async () => {
    const error = await assertNotStale(
      at('2026-09-25T10:00:00Z'),
      current(at('2026-09-25T10:05:00Z')),
      directory
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    const conflict = error as ConflictError;
    expect(conflict.httpStatus).toBe(409);
    expect(conflict.message).toBe(STALE_RECORD_MESSAGE);
    expect(conflict.details).toEqual({
      current: {
        id: '12',
        updated_at: at('2026-09-25T10:05:00Z'),
        updated_by: '3',
        updated_by_user: { id: '3', first_name: 'Amina', last_name: 'Khan' },
      },
    });
  });

  it('an automatic change (no user) reports updated_by null; a failing lookup degrades to null names, still 409', async () => {
    const auto = (await assertNotStale(
      at('2026-09-25T10:00:00Z'),
      current(at('2026-09-25T10:05:00Z'), null),
      directory
    ).catch((e: unknown) => e)) as ConflictError;
    expect(auto.details).toMatchObject({ current: { updated_by: null, updated_by_user: null } });
    const broken = { findContactsByIds: () => Promise.reject(new Error('db down')) };
    const degraded = (await assertNotStale(
      at('2026-09-25T10:00:00Z'),
      current(at('2026-09-25T10:05:00Z')),
      broken
    ).catch((e: unknown) => e)) as ConflictError;
    expect(degraded.httpStatus).toBe(409);
    expect(degraded.details).toMatchObject({ current: { updated_by: '3', updated_by_user: null } });
  });
});

describe('assertFresh', () => {
  it('loads nothing when the field was not sent; 404s a missing record; 409s a stale one', async () => {
    const load = vi.fn(() => Promise.resolve(current(at('2026-09-25T10:05:00Z'))));
    await assertFresh(undefined, load, 'Vehicle not found.', directory);
    expect(load).not.toHaveBeenCalled();
    await expect(
      assertFresh(
        at('2026-09-25T10:00:00Z'),
        () => Promise.resolve(undefined),
        'Vehicle not found.',
        directory
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      assertFresh(at('2026-09-25T10:00:00Z'), load, 'Vehicle not found.', directory)
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      assertFresh(at('2026-09-25T10:05:00Z'), load, 'Vehicle not found.', directory)
    ).resolves.toBeUndefined();
  });
});
