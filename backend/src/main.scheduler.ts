import './platform/network/tuning.js';
import { buildContainer } from './container.js';
import { disconnectPrisma } from './platform/db/prisma.js';
import { closeAllQueues, getQueue } from './platform/queue/queue-factory.js';
import { SUMMARY_SCHEDULES, type SummaryJobData } from './modules/summaries/summaries.jobs.js';
import type { SummaryGranularity } from './modules/summaries/summaries.types.js';
import { FLEET_STATUS_JOB } from './modules/fleet-dashboard/fleet-status.broadcaster.js';
import { FLEET_TELEMETRY_JOB } from './modules/fleet-dashboard/fleet-telemetry-rollup.service.js';
import { registerShutdown } from './platform/lifecycle/shutdown.js';
import { logger } from './platform/logging/logger.js';

/**
 * BullMQ repeatable-job registration (ARCHITECTURE.md §1, §8):
 * summaries hourly/daily/weekly/monthly, maintenance/compliance expiry
 * checks.
 *
 * TODO(4.5): register maintenance/compliance expiry-check repeatable jobs
 * here once that module exists.
 *
 * Module 2.8 (D-0074): one `upsertJobScheduler` per granularity, keyed by
 * name so re-running this process (a redeploy, a restart) updates the
 * existing scheduler in place instead of accumulating duplicates —
 * `upsertJobScheduler` is BullMQ's own idempotent replacement for the
 * older `queue.add(..., { repeat })`. No `windowStartIso`/`windowEndIso`
 * in the job template: the worker's default trailing-window computation
 * (`summaries.service.ts`) is what every scheduled run should use: an
 * explicit window is only for manual backfill/reprocessing triggered by
 * hand.
 *
 * `tz: "UTC"` on every scheduler (D-0074): confirmed live that BullMQ's
 * cron evaluation otherwise uses the *host's* local timezone (this dev
 * machine is UTC+5 — `"15 0 * * *"` landed at 19:15 UTC, not 00:15),
 * which would silently retarget every schedule at deploy time and
 * contradict `CONVENTIONS.md`'s "dates in UTC end to end". `computeDefaultWindow`
 * (`summaries.service.ts`) already works in UTC internally regardless —
 * this only fixes *when* the job fires, not what window it computes.
 */
const container = buildContainer();
const { redis } = container.cradle;

const summariesQueue = getQueue('summaries');
for (const [granularity, pattern] of Object.entries(SUMMARY_SCHEDULES) as [
  SummaryGranularity,
  string,
][]) {
  await summariesQueue.upsertJobScheduler(
    `summaries-${granularity}`,
    { pattern, tz: 'UTC' },
    {
      name: `summaries-${granularity}`,
      data: { granularity } satisfies SummaryJobData,
    }
  );
}

// D-0185 (A9): once a minute, announce the fleet status counts when they changed (`fleet:status_summary`).
await getQueue('fleet-status').upsertJobScheduler(
  'fleet-status-summary',
  { pattern: '* * * * *', tz: 'UTC' },
  { name: FLEET_STATUS_JOB, data: {} }
);

// D-0194 (D1): every 15 minutes, roll the GPS packets up into the hourly vehicle telemetry table (the first run is the backfill).
await getQueue('fleet-telemetry').upsertJobScheduler(
  'fleet-telemetry-rollup',
  { pattern: '*/15 * * * *', tz: 'UTC' },
  { name: FLEET_TELEMETRY_JOB, data: {} }
);

logger.info(
  { repeatableJobs: Object.keys(SUMMARY_SCHEDULES).length + 2 },
  'Scheduler process started'
);

registerShutdown('scheduler', async () => {
  await closeAllQueues();
  await disconnectPrisma();
  redis.disconnect();
});
