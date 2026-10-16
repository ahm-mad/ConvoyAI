import 'dotenv/config';
import { envSchema, type Env } from './env.schema.js';

function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const report = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console -- config hasn't loaded the logger yet; this is the one allowed exception.
    console.error(`Invalid environment configuration:\n${report}`);
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();
export type { Env };
