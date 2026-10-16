import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  addLocalMonths,
  endOfLocalDay,
  endOfLocalMonthDate,
  isValidTimeZone,
  localDateOf,
  localDateString,
  localDayOfWeek,
  localDaysBetween,
  startOfLocalDay,
  tzOffsetMs,
  utcDatePartsOf,
  zonedTimeToUtc,
} from '../zoned.js';

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Karachi')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('offsets and local days', () => {
  it('UTC is the identity', () => {
    expect(tzOffsetMs(new Date('2026-09-25T10:00:00Z'), 'UTC')).toBe(0);
    expect(startOfLocalDay({ y: 2026, m: 9, d: 25 }, 'UTC').toISOString()).toBe(
      '2026-09-25T00:00:00.000Z'
    );
    expect(endOfLocalDay({ y: 2026, m: 9, d: 25 }, 'UTC').toISOString()).toBe(
      '2026-09-25T23:59:59.999Z'
    );
  });

  it('Asia/Karachi is UTC+5 all year: the local day starts at 19:00Z the day before', () => {
    expect(tzOffsetMs(new Date('2026-09-25T10:00:00Z'), 'Asia/Karachi')).toBe(5 * 3_600_000);
    expect(startOfLocalDay({ y: 2026, m: 9, d: 25 }, 'Asia/Karachi').toISOString()).toBe(
      '2026-09-24T19:00:00.000Z'
    );
    expect(endOfLocalDay({ y: 2026, m: 9, d: 25 }, 'Asia/Karachi').toISOString()).toBe(
      '2026-09-25T18:59:59.999Z'
    );
  });

  it('localDateOf reads the wall-clock date: 22:00Z on 24 Sept is already 25 Sept in Karachi and still 24 Sept in New York', () => {
    const at = new Date('2026-09-24T22:00:00Z');
    expect(localDateString(localDateOf(at, 'Asia/Karachi'))).toBe('2026-09-25');
    expect(localDateString(localDateOf(at, 'America/New_York'))).toBe('2026-09-24');
    expect(localDateString(localDateOf(at, 'UTC'))).toBe('2026-09-24');
  });

  it('DST: New York spring-forward day (2026-03-08) is 23 hours, fall-back day (2026-11-01) is 25', () => {
    const hours = (d: { y: number; m: number; d: number }) =>
      (endOfLocalDay(d, 'America/New_York').getTime() +
        1 -
        startOfLocalDay(d, 'America/New_York').getTime()) /
      3_600_000;
    expect(hours({ y: 2026, m: 3, d: 8 })).toBe(23);
    expect(hours({ y: 2026, m: 11, d: 1 })).toBe(25);
    expect(hours({ y: 2026, m: 6, d: 15 })).toBe(24);
    // midnight in summer (EDT, UTC-4) and winter (EST, UTC-5)
    expect(startOfLocalDay({ y: 2026, m: 7, d: 1 }, 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z'
    );
    expect(startOfLocalDay({ y: 2026, m: 12, d: 1 }, 'America/New_York').toISOString()).toBe(
      '2026-12-01T05:00:00.000Z'
    );
  });

  it('a wall-clock time inside the spring-forward gap resolves to just after it', () => {
    // 02:30 on 2026-03-08 does not exist in New York (01:59:59 EST → 03:00:00 EDT)
    const t = zonedTimeToUtc({ y: 2026, m: 3, d: 8 }, 2, 30, 0, 0, 'America/New_York');
    expect(t.toISOString()).toBe('2026-03-08T07:30:00.000Z'); // = 03:30 EDT
  });
});

describe('calendar arithmetic on local dates', () => {
  it('adds days and months across boundaries', () => {
    expect(localDateString(addLocalDays({ y: 2026, m: 12, d: 31 }, 1))).toBe('2027-01-01');
    expect(localDateString(addLocalDays({ y: 2026, m: 3, d: 1 }, -1))).toBe('2026-02-28');
    expect(localDateString(addLocalMonths({ y: 2026, m: 11, d: 15 }, 3))).toBe('2027-02-01');
    expect(localDateString(endOfLocalMonthDate({ y: 2028, m: 2, d: 10 }))).toBe('2028-02-29');
  });

  it("day of week, days between, and a query value's own UTC date parts", () => {
    expect(localDayOfWeek({ y: 2026, m: 9, d: 25 })).toBe(5); // Friday
    expect(localDaysBetween({ y: 2026, m: 9, d: 19 }, { y: 2026, m: 9, d: 25 })).toBe(6);
    expect(utcDatePartsOf(new Date('2026-09-01T00:00:00Z'))).toEqual({ y: 2026, m: 9, d: 1 });
  });
});
