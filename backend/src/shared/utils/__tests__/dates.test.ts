import { describe, expect, it } from 'vitest';
import {
  formatDeviceCreatedAt,
  fromIso,
  fromJsDate,
  nowUtc,
  toIsoString,
  toRelative,
} from '../dates.js';

describe('dates (D-0023: Luxon, UTC end to end)', () => {
  it('nowUtc() is always in the UTC zone', () => {
    expect(nowUtc().zoneName).toBe('UTC');
  });

  it('fromIso() interprets a naive timestamp as UTC, not the system zone', () => {
    const dt = fromIso('2026-01-15T10:00:00');

    expect(dt.zoneName).toBe('UTC');
    expect(dt.hour).toBe(10);
  });

  it('fromJsDate() converts to UTC regardless of the system zone', () => {
    const dt = fromJsDate(new Date('2026-01-15T10:00:00Z'));

    expect(dt.zoneName).toBe('UTC');
    expect(dt.toISO()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('toIsoString() converts an offset input to its correct UTC instant', () => {
    const iso = toIsoString(fromIso('2026-01-15T10:00:00+05:00'));

    expect(iso).toBe('2026-01-15T05:00:00.000Z');
  });

  it('toIsoString() throws on an invalid DateTime rather than returning a bad string', () => {
    expect(() => toIsoString(fromIso('not-a-date'))).toThrow();
  });

  it("toRelative() reads like Carbon's diffForHumans() (e.g. 'X ago')", () => {
    const fiveMinutesAgo = nowUtc().minus({ minutes: 5 });

    expect(toRelative(fiveMinutesAgo)).toMatch(/ago$/);
  });
});

describe("formatDeviceCreatedAt (D-0119: Device::getCreatedAtAttribute()'s per-owner-timezone quirk)", () => {
  it("formats in the given IANA timezone as 'Y-m-d H:i:s', matching Carbon's format exactly", () => {
    // 2026-09-17T12:54:05Z -- 5 hours ahead in Asia/Karachi (UTC+5), same real case this was found from.
    const date = new Date('2026-09-17T12:54:05.000Z');

    expect(formatDeviceCreatedAt(date, 'Asia/Karachi')).toBe('2026-09-17 17:54:05');
  });

  it("falls back to UTC (Laravel's config('app.timezone') default) when the owner has no timezone set", () => {
    const date = new Date('2026-09-17T12:54:05.000Z');

    expect(formatDeviceCreatedAt(date, null)).toBe('2026-09-17 12:54:05');
  });

  it('falls back to UTC for an unrecognized zone name rather than producing an invalid string', () => {
    const date = new Date('2026-09-17T12:54:05.000Z');

    expect(formatDeviceCreatedAt(date, 'Not/ARealZone')).toBe('2026-09-17 12:54:05');
  });

  it('returns null for a null date', () => {
    expect(formatDeviceCreatedAt(null, 'Asia/Karachi')).toBeNull();
  });
});
