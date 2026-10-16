import { config } from '../config/index.js';
import { logger } from '../logging/logger.js';

/**
 * Minimal Groq chat-completions client (ARCHITECTURE.md §2 `platform/ai/`)
 * — a raw HTTP call, no SDK, matching `GroqAI.php` exactly (STACK_MAPPING.md
 * §11: one of only 4 files in the whole Laravel app, and the model string
 * is the only thing it hardcodes). `GROQ_API_KEY`/`GROQ_MODEL` are optional/
 * defaulted in `env.schema.ts` — a dev environment without a real key
 * configured logs instead of calling out, same graceful-degradation
 * pattern as `platform/mail/mailer.ts`/`platform/sms/twilio-client.ts`.
 * `GROQ_MODEL` is a config value, not hardcoded here or in the caller —
 * swappable with an env var edit and a process restart, no code change.
 */
export async function completeChat(prompt: string): Promise<string | undefined> {
  if (!config.GROQ_API_KEY) {
    logger.warn('Groq not configured — no AI suggestion made');
    return undefined;
  }

  const response = await fetch(`${config.GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    logger.error({ status: response.status }, 'Groq API request failed');
    return undefined;
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content;
}
