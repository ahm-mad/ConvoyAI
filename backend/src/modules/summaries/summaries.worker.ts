import type { Worker } from 'bullmq';
import { createWorker } from '../../platform/queue/queue-factory.js';
import type { SummariesService } from './summaries.service.js';
import type { SummaryJobData } from './summaries.jobs.js';

/** The `"summaries"` queue worker (module 2.8, D-0074). Registered by `main.worker.ts`; the repeatable jobs themselves are registered by `main.scheduler.ts` via `upsertJobScheduler`. */
export function registerSummariesWorker(
  summariesService: SummariesService
): Worker<SummaryJobData> {
  return createWorker<SummaryJobData>('summaries', async job => {
    await summariesService.processSummaryJob(job.data);
  });
}
