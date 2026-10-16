import type { RuleCondition } from '../../shared/utils/rule-condition-evaluator.js';

export type { RuleCondition };

/** D-0060 — neither table had a severity concept before this module. */
export type RuleSeverity = 'info' | 'warning' | 'critical';

export interface RuleActions {
  sendEmail: boolean;
  sendMessage: boolean;
  systemNotification: boolean;
}

/**
 * `emailData`/`smsData`/`notificationData` are free-form JSON in Laravel (`nullable|array` only, D-0130) — the frontend
 * stores `to` as an array and adds UI-only keys (`newRecipient`), so no field is typed narrower than `unknown`. The
 * rule-actions worker reads them defensively (`rules.service.ts`).
 */
export type EmailData = Record<string, unknown>;
export type SmsData = Record<string, unknown>;
export type NotificationData = Record<string, unknown>;

export interface Rule {
  id: string;
  userId: string;
  name: string | null;
  executionInterval: number | null;
  allowRetriggering: boolean | null;
  severity: RuleSeverity;
  conditions: RuleCondition[];
  actions: RuleActions | null;
  emailData: EmailData | null;
  smsData: SmsData | null;
  notificationData: NotificationData | null;
  isActive: boolean;
  isForWidget: boolean;
  isForRuleBuilder: boolean;
  isForAll: boolean;
  lastTriggered: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface RuleInput {
  ruleName: string | undefined;
  executionInterval: number;
  allowRetriggering: boolean;
  severity: RuleSeverity | undefined;
  conditions: RuleCondition[];
  actions: RuleActions;
  emailData: EmailData | undefined;
  smsData: SmsData | undefined;
  notificationData: NotificationData | undefined;
  isActive: boolean;
}

/**
 * Repository-level query — the base DB filters only. `can_be_triggered`/
 * `recently_triggered` (11.2a) and pagination/sorting are applied by
 * `RulesService` in application code, not pushed down to SQL — see
 * `rules.service.ts`'s `listRules`.
 */
export interface ListRulesQuery {
  userId: string;
  search: string | undefined;
  isActive: boolean | undefined;
  hasEmailData: boolean | undefined;
  hasSmsData: boolean | undefined;
  hasNotificationData: boolean | undefined;
}

export interface RuleStats {
  totalActive: number;
  totalInactive: number;
  totalWithEmail: number;
  totalWithSms: number;
  totalWithNotifications: number;
  totalCanBeTriggered: number;
  totalRecentlyTriggered24h: number;
  totalNeverTriggered: number;
}

// -- Alarms (AlarmController equivalent) ------------------------------------

export type AlarmState = 'active' | 'acknowledged' | 'cleared';

export interface AlarmRuleRef {
  id: string;
  name: string | null;
}

export interface AlarmDeviceRef {
  id: string;
  name: string;
  deviceUniqueIdentifier: string;
}

export interface AlarmAcknowledgedByRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Alarm {
  id: string;
  ruleId: string;
  deviceId: string;
  productId: string | null;
  companyId: string | null;
  state: AlarmState;
  severity: RuleSeverity;
  conditionSnapshot: unknown;
  triggeredValue: unknown;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  clearedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  rule: AlarmRuleRef | undefined;
  device: AlarmDeviceRef | undefined;
  acknowledgedByUser: AlarmAcknowledgedByRef | undefined;
}

export interface ListAlarmsQuery {
  companyId: string;
  state: AlarmState | undefined;
  deviceId: string | undefined;
  page: number;
  perPage: number;
}
