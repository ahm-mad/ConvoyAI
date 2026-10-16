import { Queue, Worker, type Processor, type WorkerOptions } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Named queues (ARCHITECTURE.md §8). The registry is a plain const union
 * so every queue reference is typo-checked at compile time; module owners
 * add their queue name here rather than passing free-text strings around.
 */
export const QUEUE_NAMES = [
  'ingestion',
  'rule-actions',
  'realtime',
  'mail',
  'sms',
  'summaries',
  'geofence',
  'maintenance-checks',
  'fleet-status',
  'fleet-telemetry',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

const connection = { url: config.REDIS_URL };

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Creates a worker for the given queue. Each `main.worker.ts` job handler
 * registers itself here; retries/backoff/dead-letter policy are per-job,
 * set by the caller via `options` (ARCHITECTURE.md §8: "Retries with
 * backoff; dead-letter handling; failed jobs observable").
 */
export function createWorker<T = unknown>(
  name: QueueName,
  processor: Processor<T>,
  options?: Omit<WorkerOptions, 'connection'>
): Worker<T> {
  const worker = new Worker<T>(name, processor, { connection, ...options });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, queue: name }, 'Job failed');
  });
  worker.on('completed', job => {
    logger.debug({ jobId: job.id, queue: name }, 'Job completed');
  });

  return worker;
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map(q => q.close()));
}
