import type { Worker } from 'bullmq';
import { createWorker } from '../../platform/queue/queue-factory.js';
import type { RulesService } from './rules.service.js';
import type { RuleActionsJobData } from '../ingestion/ingestion.jobs.js';

/** The real `"rule-actions"` queue worker (ARCHITECTURE.md §8) — replaces the old log-only stub (D-0055, `platform/queue/stub-processors.ts`, fully retired by module 2.6 once `"realtime"` also got a real processor). Registered by `main.worker.ts`. */
export function registerRuleActionsWorker(rulesService: RulesService): Worker<RuleActionsJobData> {
  return createWorker<RuleActionsJobData>('rule-actions', async job => {
    await rulesService.processRuleActionsJob(job.data);
  });
}
