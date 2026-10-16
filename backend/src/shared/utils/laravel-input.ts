import { phpIntCast } from './php-cast.js';
import { z } from 'zod';

/**
 * D-0126: request-input semantics of Laravel's `TrimStrings` +
 * `ConvertEmptyStringsToNull` middleware and its `integer` / `boolean` /
 * `numeric` validation rules — for endpoints whose real frontend relies on
 * them (it sends `""` for "not set" and `"0"` / `"1"` for flags). Use these
 * *per endpoint*, where the Laravel rule was actually read; this is not a
 * global input filter.
 */

/** Trim every top-level string and turn `""` into `null` — Laravel's two global input middlewares. */
export function normalizeLaravelInput(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (typeof entry !== 'string') return [key, entry];
      const trimmed = entry.trim();
      return [key, trimmed === '' ? null : trimmed];
    })
  );
}

/** Same as `normalizeLaravelInput`, but recursing through nested objects/arrays — the middlewares apply to the whole request body (D-0130). */
export function normalizeLaravelInputDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (Array.isArray(value)) return value.map(normalizeLaravelInputDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeLaravelInputDeep(entry),
      ])
    );
  }
  return value;
}

/** Laravel `integer`: an integer, or a string that is purely an integer (`"5"`, `"-5"`) — kept as sent. */
export const laravelInteger = z.union([
  z.number().int(),
  z.string().regex(/^[+-]?\d+$/, 'must be an integer'),
]);

/** Laravel `boolean`: `true`, `false`, `1`, `0`, `"1"`, `"0"` — normalised to a real boolean. */
export const laravelBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')])
  .transform(value => value === true || value === 1 || value === '1');

/** Laravel `numeric|between:0,1`: a number or numeric string within `[0, 1]`, as a number. */
export const laravelUnitInterval = z
  .union([
    z.number(),
    z.string().regex(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/, 'must be numeric'),
  ])
  .transform(value => Number(value))
  .pipe(z.number().min(0).max(1));

/**
 * A rule set with no type constraint (`sometimes|nullable` alone, e.g.
 * `updateComponent`'s `inventory_check`): any scalar is accepted, and the
 * column's integer cast makes it a flag via PHP `(int)` semantics.
 */
export const laravelUntypedFlag = z
  .union([z.boolean(), z.number(), z.string()])
  .transform(value => phpIntCast(value) !== 0);
