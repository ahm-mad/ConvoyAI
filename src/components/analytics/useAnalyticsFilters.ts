import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFleetSettings, todayIn } from '@hooks/useFleetSettings';
import { addDays, daysBetween, minusYear, monthYear, parseYmd, shortDate } from './format';

export type RangePreset = 'today' | '7d' | '30d' | 'mtd' | 'custom';
/** What "compare" measures against: the window just before, or the same dates one year earlier. */
export type CompareMode = 'period' | 'year';
export type Interval = 'day' | 'week' | 'month';

/** The server refuses more than this many buckets in one report (backend B0). */
export const MAX_BUCKETS = 92;

/** How many buckets a range has at an interval (weeks start on Monday, months are calendar months). */
export const bucketCount = (interval: Interval, from: string, to: string): number => {
  if (interval === 'day') return daysBetween(from, to);

  if (interval === 'month') {
    const a = parseYmd(from);
    const b = parseYmd(to);

    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  }

  const monday = (s: string) => {
    const d = parseYmd(s);

    return d.getTime() - ((d.getDay() + 6) % 7) * 86400000;
  };

  return Math.round((monday(to) - monday(from)) / (7 * 86400000)) + 1;
};

const PRESETS: RangePreset[] = ['today', '7d', '30d', 'mtd', 'custom'];

/**
 * The one filter row above the Overview / every Analytics page (FLEET_ANALYTICS_DESIGN.md §2): date range +
 * "compare with the previous period", kept in the URL (`?range=30d&compare=0`, custom = `&from=&to=`) so a
 * view can be bookmarked / shared and survives reload. Dates are calendar dates in the COMPANY timezone
 * (backend F1); the previous period is the same number of days immediately before the range.
 */
export function useAnalyticsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { settings } = useFleetSettings();
  const timezone = settings?.timezone ?? 'UTC';
  const today = todayIn(timezone);

  const raw = params.get('range');
  const preset: RangePreset = PRESETS.includes(raw as RangePreset) ? (raw as RangePreset) : '7d';
  const compare = params.get('compare') !== '0';
  const compareMode: CompareMode = params.get('cmp') === 'year' ? 'year' : 'period';

  const { from, to } = useMemo(() => {
    if (preset === 'today') return { from: today, to: today };
    if (preset === '30d') return { from: addDays(today, -29), to: today };
    if (preset === 'mtd') return { from: `${today.slice(0, 8)}01`, to: today };
    if (preset === 'custom') {
      const f = params.get('from');
      const t = params.get('to');

      if (f && t && /^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t) && f <= t) {
        return { from: f, to: t };
      }
    }

    return { from: addDays(today, -6), to: today };
  }, [preset, params, today]);

  const days = daysBetween(from, to);
  const prev =
    compareMode === 'year'
      ? { from: minusYear(from), to: minusYear(to) }
      : { from: addDays(from, -days), to: addDays(from, -1) };

  // Group-by interval: automatic (day ≤ 92 days, then week, then month) unless the operator picked one the
  // server can serve (≤ 92 buckets).
  const auto: Interval = days <= 92 ? 'day' : days <= 644 ? 'week' : 'month';
  const intervalOptions = (['day', 'week', 'month'] as Interval[]).filter(
    i => bucketCount(i, from, to) <= MAX_BUCKETS
  );
  const rawInterval = params.get('interval') as Interval | null;
  const chosen = rawInterval && intervalOptions.includes(rawInterval) ? rawInterval : null;
  const interval: Interval = chosen ?? auto;

  const push = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());

      Object.entries(next).forEach(([k, v]) => (v === null ? sp.delete(k) : sp.set(k, v)));
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const setPreset = (p: RangePreset) =>
    push({
      range: p === '7d' ? null : p,
      from: p === 'custom' ? from : null,
      to: p === 'custom' ? to : null,
    });
  const setCustom = (f: string, t: string) => push({ range: 'custom', from: f, to: t });
  const setCompare = (on: boolean) => push({ compare: on ? null : '0' });
  const setCompareMode = (m: CompareMode) => push({ cmp: m === 'year' ? 'year' : null });
  const setInterval = (i: Interval | null) => push({ interval: i });

  // A range that crosses a year (or is not in the current year) needs the year on every date, otherwise
  // "Jan 1 – Sep 10" and the axis ticks "Jan 20 … Jan 26" are ambiguous.
  const withYear = from.slice(0, 4) !== to.slice(0, 4) || to.slice(0, 4) !== today.slice(0, 4);
  const fmt = (ymd: string) =>
    withYear
      ? parseYmd(ymd).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : shortDate(parseYmd(ymd));
  /** Chart tick / table label for a bucket's local date. */
  const axisLabel = fmt;
  const label =
    preset === 'today'
      ? 'Today'
      : preset === 'mtd'
        ? monthYear(parseYmd(from)) + ' to date'
        : `${fmt(from)} – ${fmt(to)}`;
  const prevLabel =
    compareMode === 'year'
      ? 'vs same dates last year'
      : days === 1
        ? 'vs yesterday'
        : `vs previous ${days} days`;

  return {
    preset,
    from,
    to,
    days,
    compare,
    compareMode,
    prev,
    interval,
    intervalChoice: chosen,
    intervalOptions,
    timezone,
    today,
    label,
    axisLabel,
    prevLabel,
    setPreset,
    setCustom,
    setCompare,
    setCompareMode,
    setInterval,
    /** The `compare` request parameter for the chosen mode. */
    compareParam: (compare
      ? compareMode === 'year'
        ? 'previous_year'
        : 'previous_period'
      : 'none') as 'none' | 'previous_period' | 'previous_year',
  };
}
