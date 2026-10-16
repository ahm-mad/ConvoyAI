import type { alarms as AlarmRow, rules as RuleRow } from '@prisma/client';
import { DateTime } from 'luxon';
import { canRetrigger } from '../../shared/utils/rule-cooldown.js';
import { fromJsDate, toRelative } from '../../shared/utils/dates.js';
import type {
  Alarm,
  AlarmAcknowledgedByRef,
  AlarmDeviceRef,
  AlarmRuleRef,
  EmailData,
  NotificationData,
  Rule,
  RuleActions,
  RuleCondition,
  SmsData,
} from './rules.types.js';

/** JSON columns round-trip through Prisma as `unknown` — already validated shape at write time (Zod, `rules.schemas.ts`), so a direct cast is safe here, same pattern as every other module's JSON columns. */
export function toRule(row: RuleRow): Rule {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    name: row.name,
    executionInterval: row.execution_interval,
    allowRetriggering: row.allow_retriggering,
    severity: row.severity,
    conditions: (row.conditions as unknown as RuleCondition[] | null) ?? [],
    actions: row.actions as unknown as RuleActions | null,
    emailData: row.email_data as unknown as EmailData | null,
    smsData: row.sms_data as unknown as SmsData | null,
    notificationData: row.notification_data as unknown as NotificationData | null,
    isActive: row.is_active,
    isForWidget: row.is_for_widget,
    isForRuleBuilder: row.is_for_rule_builder,
    isForAll: row.is_for_all,
    lastTriggered: row.last_triggered,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAlarm(
  row: AlarmRow & {
    rules?: { id: bigint; name: string | null } | null;
    devices?: { id: bigint; name: string; device_unique_identifier: string } | null;
    users?: { id: bigint; first_name: string; last_name: string } | null;
  }
): Alarm {
  const rule: AlarmRuleRef | undefined = row.rules
    ? { id: row.rules.id.toString(), name: row.rules.name }
    : undefined;
  const device: AlarmDeviceRef | undefined = row.devices
    ? {
        id: row.devices.id.toString(),
        name: row.devices.name,
        deviceUniqueIdentifier: row.devices.device_unique_identifier,
      }
    : undefined;
  const acknowledgedByUser: AlarmAcknowledgedByRef | undefined = row.users
    ? {
        id: row.users.id.toString(),
        firstName: row.users.first_name,
        lastName: row.users.last_name,
      }
    : undefined;

  return {
    id: row.id.toString(),
    ruleId: row.rule_id.toString(),
    deviceId: row.device_id.toString(),
    productId: row.product_id === null ? null : row.product_id.toString(),
    companyId: row.company_id === null ? null : row.company_id.toString(),
    state: row.state,
    severity: row.severity,
    conditionSnapshot: row.condition_snapshot,
    triggeredValue: row.triggered_value,
    triggeredAt: row.triggered_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by === null ? null : row.acknowledged_by.toString(),
    clearedAt: row.cleared_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rule,
    device,
    acknowledgedByUser,
  };
}

// -- Response shaping (RuleBuilderController's computed/formatted fields) --

/** `RuleBuilderController::formatExecutionInterval` ported as-is. */
export function formatExecutionInterval(interval: number): string {
  if (interval < 60) return `${String(interval)} seconds`;
  if (interval < 3600) return `${String(Math.round((interval / 60) * 10) / 10)} minutes`;
  if (interval < 86400) return `${String(Math.round((interval / 3600) * 10) / 10)} hours`;
  return `${String(Math.round((interval / 86400) * 10) / 10)} days`;
}

function formatInTimezone(date: Date | null, timezone: string | null): string | null {
  if (!date) return null;
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timezone ?? 'UTC')
    .toFormat('yyyy-MM-dd HH:mm:ss');
}

/** `Rule::getNextTriggerTimeAttribute` ported as-is. */
function nextTriggerTime(rule: Rule): Date | null {
  if (!rule.lastTriggered || !rule.allowRetriggering || rule.executionInterval === null)
    return null;
  return new Date(rule.lastTriggered.getTime() + rule.executionInterval * 1000);
}

/** `Rule::getTimeUntilNextTriggerAttribute` ported as-is. */
function timeUntilNextTrigger(rule: Rule, now: Date): string | null {
  if (!rule.allowRetriggering)
    return rule.lastTriggered ? 'No retriggering allowed' : 'Ready to trigger';
  if (!rule.lastTriggered) return 'Ready to trigger';

  const next = nextTriggerTime(rule);
  if (!next) return null;
  if (now.getTime() >= next.getTime()) return 'Ready to trigger';

  return `Next trigger in ${toRelative(fromJsDate(next))}`;
}

/** `RuleBuilderController::index`'s `$transformedRules` map, one rule. */
export function toRuleListItemResponse(rule: Rule, timezone: string | null, now: Date) {
  return {
    id: Number(rule.id),
    user_id: Number(rule.userId),
    name: rule.name,
    execution_interval: rule.executionInterval,
    execution_interval_formatted:
      rule.executionInterval !== null ? formatExecutionInterval(rule.executionInterval) : null,
    allow_retriggering: rule.allowRetriggering,
    conditions: rule.conditions,
    conditions_count: rule.conditions.length,
    actions: rule.actions,
    actions_count: rule.actions ? Object.keys(rule.actions).length : 0,
    email_data: rule.emailData,
    has_email_data: rule.emailData !== null,
    sms_data: rule.smsData,
    has_sms_data: rule.smsData !== null,
    notification_data: rule.notificationData,
    has_notification_data: rule.notificationData !== null,
    is_active: rule.isActive,
    last_triggered: formatInTimezone(rule.lastTriggered, timezone),
    last_triggered_human: rule.lastTriggered ? toRelative(fromJsDate(rule.lastTriggered)) : null,
    can_be_triggered: rule.isActive && canRetrigger(rule, now),
    next_trigger_time: formatInTimezone(nextTriggerTime(rule), timezone),
    time_until_next_trigger: timeUntilNextTrigger(rule, now),
    created_at: formatInTimezone(rule.createdAt, timezone),
    updated_at: formatInTimezone(rule.updatedAt, timezone),
  };
}

/** `RuleBuilderController::show`'s response — duplicate camelCase/snake_case keys ported exactly (the frozen contract, however redundant it looks). */
export function toRuleDetailResponse(
  rule: Rule,
  user: { id: string; firstName: string; lastName: string; email: string },
  timezone: string | null,
  now: Date
) {
  return {
    id: Number(rule.id),
    user_id: Number(rule.userId),
    name: rule.name,
    ruleName: rule.name,
    execution_interval: rule.executionInterval,
    executionInterval: rule.executionInterval,
    execution_interval_formatted:
      rule.executionInterval !== null ? formatExecutionInterval(rule.executionInterval) : null,
    allow_retriggering: rule.allowRetriggering,
    allowRetriggering: rule.allowRetriggering,
    severity: rule.severity,
    conditions: rule.conditions,
    conditions_count: rule.conditions.length,
    actions: rule.actions,
    actions_count: rule.actions ? Object.keys(rule.actions).length : 0,
    email_data: rule.emailData,
    has_email_data: rule.emailData !== null,
    sms_data: rule.smsData,
    smsData: rule.smsData,
    has_sms_data: rule.smsData !== null,
    notification_data: rule.notificationData,
    notificationData: rule.notificationData,
    has_notification_data: rule.notificationData !== null,
    is_active: rule.isActive,
    last_triggered: formatInTimezone(rule.lastTriggered, timezone),
    last_triggered_human: rule.lastTriggered ? toRelative(fromJsDate(rule.lastTriggered)) : null,
    can_be_triggered: rule.isActive && canRetrigger(rule, now),
    next_trigger_time: formatInTimezone(nextTriggerTime(rule), timezone),
    time_until_next_trigger: timeUntilNextTrigger(rule, now),
    created_at: formatInTimezone(rule.createdAt, timezone),
    updated_at: formatInTimezone(rule.updatedAt, timezone),
    deleted_at: null,
    user: {
      id: Number(user.id),
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
    },
  };
}

/** `RuleBuilderController::store`'s created-rule response slice. */
export function toRuleCreateResponse(rule: Rule, now: Date) {
  return {
    id: Number(rule.id),
    name: rule.name,
    execution_interval: rule.executionInterval,
    execution_interval_formatted:
      rule.executionInterval !== null ? formatExecutionInterval(rule.executionInterval) : null,
    allow_retriggering: rule.allowRetriggering,
    severity: rule.severity,
    is_active: rule.isActive,
    can_be_triggered: rule.isActive && canRetrigger(rule, now),
    created_at: rule.createdAt ? rule.createdAt.toISOString().slice(0, 19).replace('T', ' ') : null,
  };
}

/** `RuleBuilderController::update`'s updated-rule response slice. */
export function toRuleUpdateResponse(rule: Rule, now: Date) {
  return {
    id: Number(rule.id),
    name: rule.name,
    execution_interval_formatted:
      rule.executionInterval !== null ? formatExecutionInterval(rule.executionInterval) : null,
    severity: rule.severity,
    can_be_triggered: rule.isActive && canRetrigger(rule, now),
    updated_at: rule.updatedAt ? rule.updatedAt.toISOString().slice(0, 19).replace('T', ' ') : null,
  };
}

/** `AlarmController::index`/`acknowledge`'s eager-loaded shape — `acknowledged_by` intentionally becomes the loaded user object, matching the Laravel controller's own documented quirk. */
export function toAlarmResponse(alarm: Alarm) {
  return {
    id: Number(alarm.id),
    rule_id: Number(alarm.ruleId),
    device_id: Number(alarm.deviceId),
    product_id: alarm.productId === null ? null : Number(alarm.productId),
    company_id: alarm.companyId === null ? null : Number(alarm.companyId),
    state: alarm.state,
    severity: alarm.severity,
    condition_snapshot: alarm.conditionSnapshot,
    triggered_value: alarm.triggeredValue,
    triggered_at: alarm.triggeredAt,
    acknowledged_at: alarm.acknowledgedAt,
    acknowledged_by: alarm.acknowledgedByUser
      ? {
          id: Number(alarm.acknowledgedByUser.id),
          first_name: alarm.acknowledgedByUser.firstName,
          last_name: alarm.acknowledgedByUser.lastName,
        }
      : alarm.acknowledgedBy === null
        ? null
        : Number(alarm.acknowledgedBy),
    cleared_at: alarm.clearedAt,
    created_at: alarm.createdAt,
    updated_at: alarm.updatedAt,
    rule: alarm.rule ? { id: Number(alarm.rule.id), name: alarm.rule.name } : null,
    device: alarm.device
      ? {
          id: Number(alarm.device.id),
          name: alarm.device.name,
          device_unique_identifier: alarm.device.deviceUniqueIdentifier,
        }
      : null,
  };
}
