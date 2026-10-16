/**
 * D-0123: PHP's `(int)` cast, for request values Laravel casts that way
 * (e.g. `ProductController::storeProductSettings` does
 * `(int) $isSelected` on whatever the client sent in `preference_toggle`,
 * validated only as `array`). Follows PHP 8 semantics: bool → 0/1, float
 * truncates (NaN/±Infinity → 0), a string takes its leading numeric prefix
 * (`"1abc"` → 1, `"abc"` → 0, `"1e2"` → 100), null → 0, and an array is 0
 * when empty and 1 otherwise.
 */
export function phpIntCast(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === 'string') {
    const match = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(value);
    if (!match) return 0;
    const parsed = Math.trunc(Number(match[0]));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (Array.isArray(value)) return value.length > 0 ? 1 : 0;
  if (value !== null && typeof value === 'object') return Object.keys(value).length > 0 ? 1 : 0;
  return 0;
}
