/**
 * Unified offline-detection threshold (KNOWN_ISSUES §9, D-0068's sibling
 * decision logged with module 2.7's own DECISIONS.md entry). The old app
 * had 3 distinct thresholds across Fleet (30min), Dashboard (1hr), and
 * Assets (24h) — confirmed via full research 2026-09-15 (the originally-
 * presumed 4th site, `WidgetController`/`WidgetSettingController`, has no
 * online/offline logic at all). User-approved: unify on 30 minutes,
 * matching Fleet's existing constant and `fleet-kpi-formulas.md`'s own
 * recommendation. This module (2.7 dashboards) is the first to build the
 * shared helper; modules 3.1 (assets) and 4.6 (fleet-dashboard) should
 * import `OFFLINE_THRESHOLD_MINUTES`/`isOffline` from here rather than
 * re-hardcoding `30`.
 */
export const OFFLINE_THRESHOLD_MINUTES = 30;

/** A device with no last-seen timestamp at all is offline by definition. */
export function isOffline(
  lastSeenAt: Date | null,
  now: Date,
  thresholdMinutes: number = OFFLINE_THRESHOLD_MINUTES
): boolean {
  if (!lastSeenAt) return true;
  return now.getTime() - lastSeenAt.getTime() > thresholdMinutes * 60 * 1000;
}
