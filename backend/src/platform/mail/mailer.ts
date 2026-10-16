import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Minimal mailer abstraction (ARCHITECTURE.md §2 `platform/mail/`).
 * Built ahead of module 6.1 because 1.2's `register` needs to send a
 * verification email — this is deliberately just "send one email over
 * SMTP", not a templating system; 6.1 builds that out for the rest of
 * the app's mail types.
 *
 * SMTP_* are optional in `env.schema.ts` (STACK_MAPPING §13) — a dev
 * environment without them configured logs the email instead of
 * throwing, so register/forgot-password still work end-to-end locally.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text alternative part (multipart email) — most callers only send `html`. */
  text?: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  if (!config.SMTP_HOST) {
    return undefined;
  }
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT ?? 587,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const client = getTransporter();
  if (!client) {
    logger.warn(
      { to: message.to, subject: message.subject },
      'SMTP not configured — logging email instead of sending'
    );
    return;
  }

  await client.sendMail({
    from: config.MAIL_FROM ?? 'ConvoyAI <no-reply@example.com>',
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}
