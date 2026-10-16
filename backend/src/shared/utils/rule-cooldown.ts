/**
 * The one `canRetrigger` (KNOWN_ISSUES 11.2a) — replaces both
 * `Rule::canBeTriggered()`/`scopeCanBeTriggered()` (the latter a raw
 * MySQL `whereRaw('last_triggered <= NOW() - INTERVAL execution_interval
 * SECOND')`, n/a-by-design here — no raw SQL interval, computed in TS)
 * and `RuleTriggerService::canBeTriggered()` (`rule-engine.md` §4 — the
 * two Laravel implementations agree on every outcome, just duplicated).
 * Pure, framework-free: takes `now` explicitly so callers/tests don't
 * need to mock the clock.
 */
export interface RetriggerableRule {
  allowRetriggering: boolean | null;
  lastTriggered: Date | null;
  executionInterval: number | null;
}

export function canRetrigger(rule: RetriggerableRule, now: Date): boolean {
  if (!rule.lastTriggered) return true;

  if (!rule.allowRetriggering) return false;

  const intervalSeconds = rule.executionInterval ?? 0;
  const nextTriggerTime = new Date(rule.lastTriggered.getTime() + intervalSeconds * 1000);
  return now.getTime() >= nextTriggerTime.getTime();
}
