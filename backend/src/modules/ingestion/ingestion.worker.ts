import type { Worker } from 'bullmq';
import { createWorker } from '../../platform/queue/queue-factory.js';
import type { IngestionService } from './ingestion.service.js';
import type { IngestionJobData } from './ingestion.jobs.js';

/** The real `"ingestion"` queue worker (ARCHITECTURE.md §8) — registered by `main.worker.ts`. */
export function registerIngestionWorker(
  ingestionService: IngestionService
): Worker<IngestionJobData> {
  return createWorker<IngestionJobData>('ingestion', async job => {
    await ingestionService.processIngestionJob(job.data);
  });
}
