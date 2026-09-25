/**
 * `datetime-local` inputs hold a naive "2026-09-24T10:00" in the browser's timezone. The backend reads
 * naive strings as UTC (flows/04 §10.3 C7), which shifted times by the user's UTC offset — so convert
 * to a real ISO instant before sending.
 */
export const toIsoInstant = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Now (or the given time) formatted for a `datetime-local` input, in the browser's local timezone.
 * With `withSeconds` the value carries seconds (pair it with `step={1}` on the input) — needed when
 * "now" is validated against another recent time, e.g. a stop's arrival, where rounding down to the
 * minute would land BEFORE it and be rejected.
 */
export const toDatetimeLocal = (
  value: Date | string | null | undefined = new Date(),
  withSeconds = false
): string => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());

  if (Number.isNaN(date.getTime())) return '';

  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base;
};
