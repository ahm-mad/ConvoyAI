import { describe, expect, it } from 'vitest';
import { localDateOf } from '../../../platform/time/zoned.js';
import { EXPIRY_STATUSES, daysUntilExpiry, expiryStatusOf } from '../expiry-buckets.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('expiry buckets (D-0188 C4, shared with D-0191)', () => {
  const today = { y: 2026, m: 9, d: 25 };
  it('boundaries: yesterday, today, +7, +8, +30, +31, +60, +61, no date', () => {
    const at = (iso: string | null) => expiryStatusOf(iso ? day(iso) : null, today);
    expect([
      at('2026-09-24'),
      at('2026-09-25'),
      at('2026-10-02'),
      at('2026-10-03'),
      at('2026-10-25'),
      at('2026-10-26'),
      at('2026-11-24'),
      at('2026-11-25'),
      at(null),
    ]).toEqual([
      'expired',
      'expiring_0_7',
      'expiring_0_7',
      'expiring_8_30',
      'expiring_8_30',
      'expiring_31_60',
      'expiring_31_60',
      'valid_after_60',
      'no_expiry',
    ]);
    expect(new Set(EXPIRY_STATUSES).size).toBe(6);
  });
  it('daysUntilExpiry: negative once expired, null without a date', () => {
    expect(daysUntilExpiry(day('2026-09-20'), today)).toBe(-5);
    expect(daysUntilExpiry(day('2026-10-25'), today)).toBe(30);
    expect(daysUntilExpiry(null, today)).toBeNull();
  });
  it("today is the company's local date: 2026-09-24T20:00Z is already 25 Sept in Karachi", () => {
    const karachi = localDateOf(new Date('2026-09-24T20:00:00Z'), 'Asia/Karachi');
    expect(expiryStatusOf(day('2026-09-24'), karachi)).toBe('expired');
    expect(expiryStatusOf(day('2026-09-25'), karachi)).toBe('expiring_0_7');
  });
});
