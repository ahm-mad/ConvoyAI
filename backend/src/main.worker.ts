import './platform/network/tuning.js';
import { buildContainer } from './container.js';
import { disconnectPrisma } from './platform/db/prisma.js';
import { closeAllQueues } from './platform/queue/queue-factory.js';
import { registerIngestionWorker } from './modules/ingestion/ingestion.worker.js';
import { registerRuleActionsWorker } from './modules/rules/rules.worker.js';
import { registerMailWorker } from './platform/mail/mail.worker.js';
import { registerSmsWorker } from './platform/sms/sms.worker.js';
import { registerRealtimeWorker } from './platform/realtime/realtime.worker.js';
import { RedisRealtimeEmitter } from './platform/realtime/emitter.js';
import { registerFleetStatusWorker } from './modules/fleet-dashboard/fleet-status.broadcaster.js';
import { registerFleetTelemetryWorker } from './modules/fleet-dashboard/fleet-telemetry-rollup.service.js';
import { registerSummariesWorker } from './modules/summaries/summaries.worker.js';
import { registerShutdown } from './platform/lifecycle/shutdown.js';
import { logger } from './platform/logging/logger.js';

/**
 * BullMQ worker process (ARCHITECTURE.md §1, §8): rule actions, emails,
 * summary/continuous-aggregate refresh, geofence post-processing.
 *
 * Module 2.4's real "ingestion" worker does the async half of the pipeline
 * (PayloadMapper clean, DeviceValue write, position extraction) that the
 * HTTP/MQTT entrypoints enqueue rather than doing synchronously
 * (ARCHITECTURE.md §8: no sync fan-out). Module 2.5's real "rule-actions"
 * worker replaces that queue's log-only stub (D-0055); `"mail"`/`"sms"`
 * also get their first real processors here (2.5's email/SMS rule
 * actions). Module 2.6's real "realtime" worker replaces the last
 * remaining stub (D-0055/D-0066/D-0067) — see `platform/realtime/
 * realtime.worker.ts`'s doc comment for why it needs a Redis-backed
 * emitter rather than a plain in-process Socket.IO call (this process has
 * no live socket connections of its own; those live on `main.http.ts`).
 * Module 2.8's `"summaries"` worker (D-0074) recomputes the 4
 * `device_value_summaries_*` tables on the schedule `main.scheduler.ts`
 * registers.
 */
const container = buildContainer();
const {
  redis,
  ingestionService,
  rulesService,
  summariesService,
  fleetStatusBroadcaster,
  fleetTelemetryRollupService,
} = container.cradle;

const workers = [
  registerIngestionWorker(ingestionService),
  registerRuleActionsWorker(rulesService),
  registerMailWorker(),
  registerSmsWorker(),
  registerRealtimeWorker(new RedisRealtimeEmitter()),
  registerSummariesWorker(summariesService),
  registerFleetStatusWorker(fleetStatusBroadcaster), // D-0185 (A9): `fleet:status_summary`
  registerFleetTelemetryWorker(fleetTelemetryRollupService), // D-0194 (D1): hourly vehicle telemetry rollup
];

logger.info({ workers: workers.length }, 'Worker process started');

registerShutdown('worker', async () => {
  await Promise.all(workers.map(w => w.close()));
  await closeAllQueues();
  await disconnectPrisma();
  redis.disconnect();
});
