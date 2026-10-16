import type { Worker } from 'bullmq';
import { createWorker } from '../queue/queue-factory.js';
import { sendSms } from './twilio-client.js';

/**
 * The real `"sms"` queue worker (ARCHITECTURE.md §8) — registered by
 * `main.worker.ts`. Module 2.5's `sendMessage` rule action is the first
 * producer. Async for the same reason as `platform/mail/mail.worker.ts`:
 * a slow/failing Twilio call never blocks rule evaluation, and gets
 * BullMQ's retry/backoff for free.
 */
export interface SendSmsJobData {
  to: string;
  message: string;
}

export function registerSmsWorker(): Worker<SendSmsJobData> {
  return createWorker<SendSmsJobData>('sms', async job => {
    await sendSms(job.data.to, job.data.message);
  });
}
