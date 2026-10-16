import type { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

/**
 * Parses `input` against `schema`, throwing a `ValidationError` (D-0026's
 * one consistent shape: `message` = first issue, `errors` = the full
 * field -> messages bag) on failure. The one place Zod parse errors
 * become the platform's error taxonomy — every module's controller uses
 * this instead of calling `schema.parse()` directly.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (errors[key] ??= []).push(issue.message);
  }

  const firstMessage = result.error.issues[0]?.message ?? 'Validation failed';
  throw new ValidationError(firstMessage, errors);
}
