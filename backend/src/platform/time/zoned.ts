/**
 * Company-timezone calendar helpers (D-0183, fleet analytics ask A5). Everything the dashboards bucket by day / week / month is a *local calendar
 * date* in the company's IANA time zone (`fleet_settings.timezone`, default `UTC`); these helpers turn a local date into the exact UTC instants at
 * its edges (DST-aware, via `Intl` — no extra dependency) and back. With `UTC` every function reduces to the previous UTC-only behaviour.
 */

export interface LocalDate {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(
  at: Date,
  timeZone: string
): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const value: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type !== 'literal') value[part.type] = Number(part.value);
  }
  return {
    y: value['year'] ?? 1970,
    m: value['month'] ?? 1,
    d: value['day'] ?? 1,
    h: value['hour'] ?? 0,
    mi: value['minute'] ?? 0,
    s: value['second'] ?? 0,
  };
}

/** Milliseconds the zone's wall clock is ahead of UTC at the instant `at` (negative west of Greenwich). */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const w = wallClock(at, timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` reads the given local date and time (a time inside a DST gap resolves to the first instant after it; an ambiguous one to the earlier). */
export function zonedTimeToUtc(
  date: LocalDate,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string
): Date {
  const guess = Date.UTC(date.y, date.m - 1, date.d, hour, minute, second, ms);
  const before = guess - tzOffsetMs(new Date(guess - 86_400_000), timeZone); // with the offset in force a day earlier
  const after = guess - tzOffsetMs(new Date(guess + 86_400_000), timeZone); // and a day later
  const matches = (t: number) => tzOffsetMs(new Date(t), timeZone) === guess - t;
  if (matches(before)) return new Date(before);
  if (matches(after)) return new Date(after);
  return new Date(Math.max(before, after)); // inside a gap
}

/** The local calendar date the instant falls on in `timeZone`. */
export function localDateOf(at: Date, timeZone: string): LocalDate {
  const w = wallClock(at, timeZone);
  return { y: w.y, m: w.m, d: w.d };
}

/** The calendar date written in a UTC instant's own date parts (`2026-09-01` → 1 Sept) — how a `from` / `to` query value is read. */
export function utcDatePartsOf(at: Date): LocalDate {
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate() };
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function startOfLocalMonth(date: LocalDate): LocalDate {
  return { y: date.y, m: date.m, d: 1 };
}

export function addLocalMonths(date: LocalDate, months: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1 + months, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: 1 };
}

export function endOfLocalMonthDate(date: LocalDate): LocalDate {
  return addLocalDays(addLocalMonths(date, 1), -1);
}

/** 0 = Sunday … 6 = Saturday. */
export function localDayOfWeek(date: LocalDate): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** Whole calendar days from `a` to `b` (0 when the same day). */
export function localDaysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return zonedTimeToUtc(date, 0, 0, 0, 0, timeZone);
}

/** The last millisecond of the local day (the instant before the next local midnight — so a 23- or 25-hour DST day is exact). */
export function endOfLocalDay(date: LocalDate, timeZone: string): Date {
  return new Date(startOfLocalDay(addLocalDays(date, 1), timeZone).getTime() - 1);
}

export function localDateString(date: LocalDate): string {
  return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

/** `YYYY-MM-DDTHH:00` — the local wall-clock hour an instant falls in (hour-bucket labels). */
export function localHourLabel(at: Date, timeZone: string): string {
  const w = wallClock(at, timeZone);
  return `${localDateString({ y: w.y, m: w.m, d: w.d })}T${String(w.h).padStart(2, '0')}:00`;
}
