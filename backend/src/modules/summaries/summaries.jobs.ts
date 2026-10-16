import type { SummaryGranularity } from './summaries.types.js';

/**
 * `"summaries"` queue job payload (module 2.8). `windowStartIso`/
 * `windowEndIso` are an explicit-window override for manual backfill/
 * reprocessing (e.g. after fixing an attribute mapping) — the scheduled
 * repeatable jobs `main.scheduler.ts` registers never set them, and
 * `summaries.service.ts` falls back to `computeDefaultWindow` when absent.
 */
export interface SummaryJobData {
  granularity: SummaryGranularity;
  windowStartIso?: string;
  windowEndIso?: string;
}

/**
 * Cron patterns for `main.scheduler.ts`'s repeatable jobs. Each fires
 * shortly after its own boundary (`:05` past the hour, `:15`/`:30`/`:45`
 * past midnight for daily/weekly/monthly) so the full preceding period's
 * `device_values` rows have landed before the recompute runs; the small
 * staggering avoids all four jobs' DB load landing in the same second.
 */
export const SUMMARY_SCHEDULES: Record<SummaryGranularity, string> = {
  hourly: '5 * * * *',
  daily: '15 0 * * *',
  weekly: '30 0 * * 1',
  monthly: '45 0 1 * *',
};
