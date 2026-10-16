import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import {
  SummariesService,
  computeDefaultWindow,
  isoWeekLabel,
  monthLabel,
  monthLabelsFor,
  weekLabelsFor,
} from '../summaries.service.js';
import type { SummariesRepository } from '../summaries.repository.js';

describe("computeDefaultWindow (D-0074's trailing-window default)", () => {
  it('hourly: [now-2h(floored), now+1h(floored)) — last complete hour plus the in-progress one', () => {
    const now = DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' });
    const window = computeDefaultWindow('hourly', now);
    expect(window.start.toISOString()).toBe('2026-09-15T13:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('daily: [today-2d, tomorrow)', () => {
    const now = DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' });
    const window = computeDefaultWindow('daily', now);
    expect(window.start.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('weekly: [this-ISO-week-start-2w, next-ISO-week-start) — 2026-09-15 is a Tuesday, ISO week starts Monday 09-14', () => {
    const now = DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' });
    const window = computeDefaultWindow('weekly', now);
    expect(window.start.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('monthly: [2-months-ago-start, next-month-start)', () => {
    const now = DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' });
    const window = computeDefaultWindow('monthly', now);
    expect(window.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe("isoWeekLabel/monthLabel (must match Postgres to_char('IYYY-\"W\"IW')/('YYYY-MM'), D-0074)", () => {
  it('zero-pads single-digit week numbers', () => {
    expect(isoWeekLabel(DateTime.fromISO('2026-01-01T00:00:00Z', { zone: 'utc' }))).toBe(
      '2026-W01'
    );
  });

  it('handles a real double-digit week', () => {
    expect(isoWeekLabel(DateTime.fromISO('2026-09-15T00:00:00Z', { zone: 'utc' }))).toBe(
      '2026-W38'
    );
  });

  it("an ISO year-end week correctly rolls into next calendar year's week 1 label (2025-12-31 is ISO week 2026-W01)", () => {
    expect(isoWeekLabel(DateTime.fromISO('2025-12-31T00:00:00Z', { zone: 'utc' }))).toBe(
      '2026-W01'
    );
  });

  it('month label is zero-padded YYYY-MM', () => {
    expect(monthLabel(DateTime.fromISO('2026-01-05T00:00:00Z', { zone: 'utc' }))).toBe('2026-01');
  });
});

describe('weekLabelsFor/monthLabelsFor (every whole unit the half-open window touches)', () => {
  it('a 2-week window yields exactly 2 labels', () => {
    const window = computeDefaultWindow(
      'weekly',
      DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' })
    );
    expect(weekLabelsFor(window)).toEqual(['2026-W37', '2026-W38']);
  });

  it('a 2-month window yields exactly 2 labels', () => {
    const window = computeDefaultWindow(
      'monthly',
      DateTime.fromISO('2026-09-15T14:37:00Z', { zone: 'utc' })
    );
    expect(monthLabelsFor(window)).toEqual(['2026-08', '2026-09']);
  });
});

describe('SummariesService.processSummaryJob', () => {
  function fakeRepository(): SummariesRepository & { calls: unknown[] } {
    const calls: unknown[] = [];
    return {
      refreshWindow: vi.fn((params: unknown) => {
        calls.push(params);
        return Promise.resolve();
      }),
      calls,
    } as unknown as SummariesRepository & { calls: unknown[] };
  }

  it('hourly/daily: no week/month labels computed', async () => {
    const repo = fakeRepository();
    const service = new SummariesService(repo);
    await service.processSummaryJob({ granularity: 'hourly' });
    expect(repo.calls).toHaveLength(1);
    const call = repo.calls[0] as {
      granularity: string;
      weekLabels?: unknown;
      monthLabels?: unknown;
    };
    expect(call.granularity).toBe('hourly');
    expect(call.weekLabels).toBeUndefined();
    expect(call.monthLabels).toBeUndefined();
  });

  it('weekly: derives weekLabels from the resolved window, no monthLabels', async () => {
    const repo = fakeRepository();
    const service = new SummariesService(repo);
    await service.processSummaryJob({
      granularity: 'weekly',
      windowStartIso: '2026-09-14T00:00:00Z',
      windowEndIso: '2026-09-21T00:00:00Z',
    });
    const call = repo.calls[0] as { weekLabels?: string[]; monthLabels?: unknown };
    expect(call.weekLabels).toEqual(['2026-W38']);
    expect(call.monthLabels).toBeUndefined();
  });

  it('monthly: derives monthLabels from the resolved window', async () => {
    const repo = fakeRepository();
    const service = new SummariesService(repo);
    await service.processSummaryJob({
      granularity: 'monthly',
      windowStartIso: '2026-08-01T00:00:00Z',
      windowEndIso: '2026-09-01T00:00:00Z',
    });
    const call = repo.calls[0] as { monthLabels?: string[] };
    expect(call.monthLabels).toEqual(['2026-08']);
  });

  it('an explicit windowStartIso/windowEndIso override wins over the default trailing window', async () => {
    const repo = fakeRepository();
    const service = new SummariesService(repo);
    await service.processSummaryJob({
      granularity: 'hourly',
      windowStartIso: '2020-01-01T00:00:00Z',
      windowEndIso: '2020-01-01T01:00:00Z',
    });
    const call = repo.calls[0] as { window: { start: Date; end: Date } };
    expect(call.window.start.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(call.window.end.toISOString()).toBe('2020-01-01T01:00:00.000Z');
  });
});
