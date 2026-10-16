import { DateTime } from 'luxon';
import { nowUtc } from '../../shared/utils/dates.js';
import type { SummariesRepository } from './summaries.repository.js';
import type { SummaryJobData } from './summaries.jobs.js';
import type { SummaryGranularity, SummaryWindow } from './summaries.types.js';

/**
 * The trailing window each granularity recomputes by default: two full
 * periods ending at the current (incomplete) one, e.g. hourly at 03:05
 * rebuilds the 02:00-04:00 window — last complete hour plus the
 * in-progress one. The 1-period buffer absorbs late-arriving `device_values`
 * rows (network
 * retry, MQTT redelivery) without rescanning the whole hypertable every
 * run; a wider backfill goes through `SummaryJobData`'s explicit-window
 * override instead of widening this default (D-0074).
 */
function computeDefaultWindow(granularity: SummaryGranularity, now: DateTime): SummaryWindow {
  switch (granularity) {
    case 'hourly': {
      const end = now.startOf('hour').plus({ hours: 1 });
      return { start: end.minus({ hours: 2 }).toJSDate(), end: end.toJSDate() };
    }
    case 'daily': {
      const end = now.startOf('day').plus({ days: 1 });
      return { start: end.minus({ days: 2 }).toJSDate(), end: end.toJSDate() };
    }
    case 'weekly': {
      const end = now.startOf('week').plus({ weeks: 1 });
      return { start: end.minus({ weeks: 2 }).toJSDate(), end: end.toJSDate() };
    }
    case 'monthly': {
      const end = now.startOf('month').plus({ months: 1 });
      return { start: end.minus({ months: 2 }).toJSDate(), end: end.toJSDate() };
    }
  }
}

/** ISO year-week label (`IYYY-"W"IW`, e.g. `2026-W38`) matching `to_char(..., 'IYYY-"W"IW')` — Luxon's `weekNumber`/`weekYear` are ISO 8601 by definition, same edge case (year-end weeks) Postgres's `IYYY`/`IW` format handles. */
function isoWeekLabel(dt: DateTime): string {
  return `${String(dt.weekYear)}-W${String(dt.weekNumber).padStart(2, '0')}`;
}

/** `YYYY-MM` label matching `to_char(..., 'YYYY-MM')`. */
function monthLabel(dt: DateTime): string {
  return dt.toFormat('yyyy-MM');
}

/** Every whole ISO week label the half-open `[start, end)` window touches. */
function weekLabelsFor(window: SummaryWindow): string[] {
  const labels = new Set<string>();
  let cursor = DateTime.fromJSDate(window.start, { zone: 'utc' }).startOf('week');
  const end = DateTime.fromJSDate(window.end, { zone: 'utc' });
  while (cursor < end) {
    labels.add(isoWeekLabel(cursor));
    cursor = cursor.plus({ weeks: 1 });
  }
  return [...labels];
}

/** Every whole calendar month label the half-open `[start, end)` window touches. */
function monthLabelsFor(window: SummaryWindow): string[] {
  const labels = new Set<string>();
  let cursor = DateTime.fromJSDate(window.start, { zone: 'utc' }).startOf('month');
  const end = DateTime.fromJSDate(window.end, { zone: 'utc' });
  while (cursor < end) {
    labels.add(monthLabel(cursor));
    cursor = cursor.plus({ months: 1 });
  }
  return [...labels];
}

export class SummariesService {
  constructor(private readonly repository: SummariesRepository) {}

  /** The `"summaries"` queue's one job handler (`summaries.worker.ts`) — resolves the window (explicit override or default), derives week/month labels when needed, and delegates the actual recompute to the repository. */
  async processSummaryJob(data: SummaryJobData): Promise<void> {
    const window = this.resolveWindow(data);
    await this.repository.refreshWindow({
      granularity: data.granularity,
      window,
      weekLabels: data.granularity === 'weekly' ? weekLabelsFor(window) : undefined,
      monthLabels: data.granularity === 'monthly' ? monthLabelsFor(window) : undefined,
    });
  }

  private resolveWindow(data: SummaryJobData): SummaryWindow {
    if (data.windowStartIso && data.windowEndIso) {
      return {
        start: DateTime.fromISO(data.windowStartIso, { zone: 'utc' }).toJSDate(),
        end: DateTime.fromISO(data.windowEndIso, { zone: 'utc' }).toJSDate(),
      };
    }
    return computeDefaultWindow(data.granularity, nowUtc());
  }
}

export { computeDefaultWindow, weekLabelsFor, monthLabelsFor, isoWeekLabel, monthLabel };
