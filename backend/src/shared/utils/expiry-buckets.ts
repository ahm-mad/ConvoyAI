import { localDaysBetween, utcDatePartsOf, type LocalDate } from '../../platform/time/zoned.js';

/**
 * The six exclusive expiry classes of a compliance record (a document or a driver licence), judged against TODAY in the company timezone
 * (D-0188 C4, shared with the compliance report D-0191): `expired` (before today), `expiring_0_7` (today … +7 days), `expiring_8_30`,
 * `expiring_31_60`, `valid_after_60`, and `no_expiry` (no expiry date at all).
 */
export const EXPIRY_STATUSES = [
  'expired',
  'expiring_0_7',
  'expiring_8_30',
  'expiring_31_60',
  'valid_after_60',
  'no_expiry',
] as const;
export type ExpiryStatus = (typeof EXPIRY_STATUSES)[number];

/** `expiry` is a DATE column (a UTC-midnight `Date` carrying the calendar date); `today` is the company's local calendar date. */
export function expiryStatusOf(expiry: Date | null, today: LocalDate): ExpiryStatus {
  if (expiry === null) return 'no_expiry';
  const days = localDaysBetween(today, utcDatePartsOf(expiry));
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_0_7';
  if (days <= 30) return 'expiring_8_30';
  if (days <= 60) return 'expiring_31_60';
  return 'valid_after_60';
}

/** Whole calendar days from today to the expiry date (negative once expired); `null` without an expiry date. */
export function daysUntilExpiry(expiry: Date | null, today: LocalDate): number | null {
  return expiry === null ? null : localDaysBetween(today, utcDatePartsOf(expiry));
}
