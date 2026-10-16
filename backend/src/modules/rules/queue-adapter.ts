import { getQueue } from '../../platform/queue/queue-factory.js';
import type { RulesQueuePort } from './rules.service.js';
import type { SendMailJobData } from '../../platform/mail/mail.worker.js';
import type { SendSmsJobData } from '../../platform/sms/sms.worker.js';
import type { RuleAlarmRealtimeJobData, RuleNotificationRealtimeJobData } from './rules.jobs.js';

/** Thin adapter over `platform/queue/queue-factory.ts` — kept separate from `RulesService` so it stays testable with a fake queue port, no real BullMQ/Redis in unit tests (same pattern as ingestion's `BullMqIngestionQueue`). */
export class BullMqRulesQueue implements RulesQueuePort {
  async enqueueMail(data: SendMailJobData): Promise<void> {
    await getQueue('mail').add('send-mail', data);
  }

  async enqueueSms(data: SendSmsJobData): Promise<void> {
    await getQueue('sms').add('send-sms', data);
  }

  async enqueueAlarmRealtime(data: RuleAlarmRealtimeJobData): Promise<void> {
    await getQueue('realtime').add('alarm-state', data);
  }

  async enqueueNotificationRealtime(data: RuleNotificationRealtimeJobData): Promise<void> {
    await getQueue('realtime').add('notification', data);
  }
}
