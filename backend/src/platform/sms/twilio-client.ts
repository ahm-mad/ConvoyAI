import twilio, { type Twilio } from 'twilio';
import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Minimal SMS abstraction (ARCHITECTURE.md §2 `platform/sms/`) — the
 * Twilio counterpart to `platform/mail/mailer.ts`. Ported from
 * `SmsService.php` (module 2.5's rule SMS action is the first caller).
 * `TWILIO_*` are optional in `env.schema.ts` — a dev environment without
 * them configured logs the message instead of throwing, same
 * graceful-degradation pattern as `mailer.ts`'s unconfigured-SMTP path.
 */
let client: Twilio | undefined;

function getClient(): Twilio | undefined {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
    return undefined;
  }
  client ??= twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  return client;
}

export async function sendSms(to: string, message: string): Promise<void> {
  const twilioClient = getClient();
  if (!twilioClient || !config.TWILIO_FROM) {
    logger.warn({ to }, 'Twilio not configured — logging SMS instead of sending');
    return;
  }

  await twilioClient.messages.create({ to, from: config.TWILIO_FROM, body: message });
}
