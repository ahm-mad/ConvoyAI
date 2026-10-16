/**
 * D-0063: module 2.5 owns alarm persistence + actions but not broadcasting
 * (`10-realtime` owns that, per `tasks/09-rules.md`'s scope split). To hand
 * off "this alarm's state just changed" to module 2.6 without building it
 * now, this job is enqueued onto the **existing** `"realtime"` BullMQ queue
 * (already created in 2.4, currently stub-only) under a distinct job name
 * (`"alarm-state"`, vs. ingestion's `"broadcast-packet"`) so the eventual
 * 2.6 processor can branch on job name to know which event to build.
 *
 * No `dashboardId` field: Laravel's equivalent broadcast
 * (`RuleTriggerService::processRule`'s `DashboardEvent`, `rule-engine.md`
 * §5) gates on `$device->dashboard_id` — confirmed by reading
 * `Device.php` and `schema.prisma`'s `devices` model that no such column,
 * relation, or accessor exists anywhere; Eloquent's magic `__get` silently
 * returns `null` for it, so that gate is always false and **this broadcast
 * never actually fires in the live Laravel app** (new finding, see
 * KNOWN_ISSUES 11.51). Not perpetuating a dead gate here — this job is
 * always enqueued on every alarm state change, no dashboard rendered. The
 * real device->dashboard(s) relationship runs through `widgets`/
 * `widget_settings`/`product_attribute_preference_settings`, which is
 * 2.7 dashboards' territory to resolve when it consumes this job.
 */
export interface RuleAlarmRealtimeJobData {
  ruleId: string;
  deviceId: string;
  userId: string;
  state: 'alert' | 'normal';
  message: string;
}

/**
 * D-0089: the `systemNotification` action's realtime-push half, mirroring
 * `RuleAlarmRealtimeJobData` exactly — enqueued onto the same existing
 * `"realtime"` queue under a third distinct job name (`"notification"`).
 * The durable half (the actual `notifications` row) is already written
 * synchronously by the rule-actions worker itself, via module 6.1's
 * `RulesNotificationsLookup`, before this job is enqueued — this job only
 * carries what a connected client's live push needs, not the source of
 * truth (same division of labor as `createAlarm` + `enqueueAlarmRealtime`).
 */
export interface RuleNotificationRealtimeJobData {
  notificationId: string;
  userId: string;
  title: string;
  message: string;
}
