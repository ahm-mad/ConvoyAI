import { getQueue } from '../../platform/queue/queue-factory.js';
import type { IngestionQueuePort } from './ingestion.service.js';
import type {
  BuildingUpdateJobData,
  DashboardUpdateJobData,
  IngestionJobData,
  InitialPacketJobData,
  RealtimeJobData,
  RuleActionsJobData,
} from './ingestion.jobs.js';

/** Thin adapter over `platform/queue/queue-factory.ts` — kept separate from `IngestionService` so the service stays testable with a fake queue port, no real BullMQ/Redis in unit tests. */
export class BullMqIngestionQueue implements IngestionQueuePort {
  async enqueueIngestion(data: IngestionJobData): Promise<void> {
    await getQueue('ingestion').add('process-packet', data);
  }

  async enqueueRuleActions(data: RuleActionsJobData): Promise<void> {
    await getQueue('rule-actions').add('evaluate-device-rules', data);
  }

  async enqueueRealtime(data: RealtimeJobData): Promise<void> {
    await getQueue('realtime').add('broadcast-packet', data);
  }

  /** Module 2.6: a distinct job name on the same `"realtime"` queue — see `ingestion.jobs.ts`'s doc comment. */
  async enqueueInitialPacket(data: InitialPacketJobData): Promise<void> {
    await getQueue('realtime').add('initial-packet', data);
  }

  /** D-0139: two more distinct job names on the same `"realtime"` queue — see `ingestion.jobs.ts`'s doc comment. */
  async enqueueDashboardUpdate(data: DashboardUpdateJobData): Promise<void> {
    await getQueue('realtime').add('dashboard-update', data);
  }

  async enqueueBuildingUpdate(data: BuildingUpdateJobData): Promise<void> {
    await getQueue('realtime').add('building-update', data);
  }
}
