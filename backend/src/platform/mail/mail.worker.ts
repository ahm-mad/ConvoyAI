import type { Worker } from 'bullmq';
import { createWorker } from '../queue/queue-factory.js';
import { sendMail, type MailMessage } from './mailer.js';

/**
 * The real `"mail"` queue worker (ARCHITECTURE.md §8) — registered by
 * `main.worker.ts`. Module 2.5's `sendEmail` rule action is the first
 * producer (`platform/db` calls stay out of the worker itself — nothing
 * here does DB access, it only sends what it's told). Async, not
 * synchronous-in-the-caller, so a slow/failing SMTP call never blocks
 * rule evaluation itself and gets BullMQ's own retry/backoff for free.
 */
export type SendMailJobData = MailMessage;

export function registerMailWorker(): Worker<SendMailJobData> {
  return createWorker<SendMailJobData>('mail', async job => {
    await sendMail(job.data);
  });
}
