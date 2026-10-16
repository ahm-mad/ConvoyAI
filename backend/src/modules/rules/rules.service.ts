import { DateTime } from 'luxon';
import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { logger } from '../../platform/logging/logger.js';
import { canRetrigger } from '../../shared/utils/rule-cooldown.js';
import { evaluate } from '../../shared/utils/rule-condition-evaluator.js';
import type { SendMailJobData } from '../../platform/mail/mail.worker.js';
import {
  renderRuleTriggeredEmailHtml,
  renderRuleTriggeredEmailText,
} from '../../platform/mail/templates/rule-triggered.js';
import type { SendSmsJobData } from '../../platform/sms/sms.worker.js';
import type { RuleActionsJobData } from '../ingestion/ingestion.jobs.js';
import type { RulesRepository } from './rules.repository.js';
import type {
  RulesDevicesLookup,
  RulesNotificationsLookup,
  RulesProductsLookup,
  RulesUsersLookup,
} from './lookups.js';
import type { RuleAlarmRealtimeJobData, RuleNotificationRealtimeJobData } from './rules.jobs.js';
import {
  toAlarmResponse,
  toRuleCreateResponse,
  toRuleDetailResponse,
  toRuleListItemResponse,
  toRuleUpdateResponse,
} from './rules.mapper.js';
import type { ListAlarmsQuery, Rule, RuleCondition, RuleInput } from './rules.types.js';

export interface RulesQueuePort {
  enqueueMail(data: SendMailJobData): Promise<void>;
  enqueueSms(data: SendSmsJobData): Promise<void>;
  enqueueAlarmRealtime(data: RuleAlarmRealtimeJobData): Promise<void>;
  enqueueNotificationRealtime(data: RuleNotificationRealtimeJobData): Promise<void>;
}

export interface ListRulesParams {
  targetUserId: string;
  search: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  perPage: number;
  isActive: boolean | undefined;
  hasEmailData: boolean | undefined;
  hasSmsData: boolean | undefined;
  hasNotificationData: boolean | undefined;
  canBeTriggered: boolean | undefined;
  recentlyTriggeredHours: number | undefined;
  path: string;
}

/**
 * `RuleBuilderController::store`/`update`'s exact filter: a persisted
 * rule's `conditions` only ever contains conditions that pass this check
 * (`rule-engine.md` §1.1) — `selectedProduct`/`selectedAttribute` present
 * and not the frontend's `"Please choose"` unset sentinel, and a non-empty
 * `selectedCondition`.
 */
function filterValidConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.filter(
    c =>
      c.selectedProduct !== undefined &&
      c.selectedProduct !== null &&
      c.selectedAttribute !== undefined &&
      c.selectedAttribute !== null &&
      c.selectedProduct !== 'Please choose' &&
      c.selectedAttribute !== 'Please choose' &&
      !!c.selectedCondition
  );
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Laravel's `Mail::to($to)` takes a string or an array of addresses; the frontend stores an array. Joined for the mailer's single `to` string (nodemailer parses comma-separated lists). Empty/absent → undefined so the caller falls back to the user's own email. */
function recipientList(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const addresses = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return addresses.length > 0 ? addresses.join(', ') : undefined;
  }
  return stringOrUndefined(value);
}

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

/** D-0062: owner-only everywhere in this module — no cross-user admin bypass (see DECISIONS.md). */
function assertOwner(rule: Rule, userId: string): void {
  if (rule.userId !== userId)
    throw new ForbiddenError('You are not authorized to access this rule.');
}

function buildPlaceholders(params: {
  rule: Rule;
  device: { id: string; name: string; deviceUniqueIdentifier: string };
  user: { firstName: string; lastName: string; email: string };
  cleanedPacket: Record<string, unknown>;
  now: Date;
}): Record<string, string> {
  const now = DateTime.fromJSDate(params.now).toUTC();
  const placeholders: Record<string, string> = {
    '{{rule_name}}': params.rule.name ?? 'Unnamed Rule',
    '{{rule_id}}': params.rule.id,
    '{{device_name}}': params.device.name || 'Unknown Device',
    '{{device_id}}': params.device.id,
    '{{device_eui}}': params.device.deviceUniqueIdentifier || 'Unknown',
    '{{user_name}}': `${params.user.firstName} ${params.user.lastName}`.trim(),
    '{{user_email}}': params.user.email,
    '{{timestamp}}': now.toFormat('yyyy-MM-dd HH:mm:ss'),
    '{{date}}': now.toFormat('yyyy-MM-dd'),
    '{{time}}': now.toFormat('HH:mm:ss'),
    '{{datetime_readable}}': now.toFormat('MMMM d, yyyy, h:mm a'),
  };
  for (const [key, value] of Object.entries(params.cleanedPacket)) {
    placeholders[`{{${key}}}`] =
      typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  }
  return placeholders;
}

/** `RuleTriggerService::replacePlaceholders` — single regex pass across every token, matching Laravel's single `str_replace(array, array, ...)` call (order-independent, no double-substitution). */
function replacePlaceholders(text: string, placeholders: Record<string, string>): string {
  const tokens = Object.keys(placeholders);
  if (tokens.length === 0) return text;
  const pattern = new RegExp(tokens.map(t => t.replace(/[{}]/g, '\\$&')).join('|'), 'g');
  return text.replace(pattern, match => placeholders[match] ?? match);
}

/** Business logic for module 2.5 (ARCHITECTURE.md §2). */
export class RulesService {
  constructor(
    private readonly rulesRepository: RulesRepository,
    private readonly devicesLookup: RulesDevicesLookup,
    private readonly usersLookup: RulesUsersLookup,
    private readonly productsLookup: RulesProductsLookup,
    private readonly notificationsLookup: RulesNotificationsLookup,
    private readonly queue: RulesQueuePort
  ) {}

  // -- Rules CRUD (RuleBuilderController equivalent) ------------------------

  async listRules(params: ListRulesParams) {
    const context = requireContext();
    // D-0062: owner-only, no admin bypass — the tenant-scoping extension
    // already forces `user_id = context.userId` into every `rules` query,
    // so a non-self `targetUserId` can never actually return another
    // user's rows; this check makes the 403 explicit rather than a
    // confusing empty result.
    if (params.targetUserId !== context.userId) {
      throw new ForbiddenError("Unauthorized to view other users' rules");
    }

    const now = new Date();
    const allRules = await this.rulesRepository.listForUser({
      userId: params.targetUserId,
      search: params.search,
      isActive: params.isActive,
      hasEmailData: params.hasEmailData,
      hasSmsData: params.hasSmsData,
      hasNotificationData: params.hasNotificationData,
    });

    // 11.2a: `can_be_triggered`/`recently_triggered` are post-fetch filters
    // in application code, never raw SQL — the per-row cooldown depends on
    // each rule's own `execution_interval`, which isn't expressible as a
    // single portable WHERE clause anyway.
    let filtered = allRules;
    if (params.canBeTriggered === true) {
      filtered = filtered.filter(r => r.isActive && canRetrigger(r, now));
    }
    if (params.recentlyTriggeredHours !== undefined) {
      const cutoff = now.getTime() - params.recentlyTriggeredHours * 60 * 60 * 1000;
      filtered = filtered.filter(
        r => r.lastTriggered !== null && r.lastTriggered.getTime() >= cutoff
      );
    }

    filtered = sortRules(filtered, params.sortBy, params.sortOrder);

    const total = filtered.length;
    const perPage = params.perPage;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(1, params.page), lastPage);
    const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

    const from = total === 0 ? null : (page - 1) * perPage + 1;
    const to = total === 0 ? null : Math.min(page * perPage, total);

    const contact = await this.usersLookup.findContactById(params.targetUserId);
    const timezone = contact?.timezone ?? null;

    // `$user->rules()` unfiltered — Laravel's stats block always counts
    // ALL of the user's rules, not just the rule-builder/is_for_all subset
    // the list itself returns.
    const statsRows = await this.rulesRepository.statsRowsForUser();
    const userStatsRows = statsRows.filter(r => r.userId === params.targetUserId);
    const stats = {
      total_active: userStatsRows.filter(r => r.isActive).length,
      total_inactive: userStatsRows.filter(r => !r.isActive).length,
      total_with_email: userStatsRows.filter(r => r.emailData !== null).length,
      total_with_sms: userStatsRows.filter(r => r.smsData !== null).length,
      total_with_notifications: userStatsRows.filter(r => r.notificationData !== null).length,
      total_can_be_triggered: userStatsRows.filter(r => r.isActive && canRetrigger(r, now)).length,
      total_recently_triggered_24h: userStatsRows.filter(
        r =>
          r.lastTriggered !== null &&
          r.lastTriggered.getTime() >= now.getTime() - 24 * 60 * 60 * 1000
      ).length,
      total_never_triggered: userStatsRows.filter(r => r.lastTriggered === null).length,
    };

    return {
      success: true,
      message: 'Rules fetched successfully.',
      data: {
        rules: pageItems.map(r => toRuleListItemResponse(r, timezone, now)),
        pagination: {
          current_page: page,
          per_page: perPage,
          total,
          last_page: lastPage,
          from,
          to,
          has_more_pages: page < lastPage,
          path: params.path,
          links: {
            first: `${params.path}?page=1`,
            last: `${params.path}?page=${String(lastPage)}`,
            prev: page > 1 ? `${params.path}?page=${String(page - 1)}` : null,
            next: page < lastPage ? `${params.path}?page=${String(page + 1)}` : null,
          },
        },
        filters: {
          search: params.search ?? null,
          is_active: params.isActive ?? null,
          has_email_data: params.hasEmailData ?? null,
          has_sms_data: params.hasSmsData ?? null,
          has_notification_data: params.hasNotificationData ?? null,
          can_be_triggered: params.canBeTriggered ?? null,
          recently_triggered: params.recentlyTriggeredHours ?? null,
          sort_by: params.sortBy,
          sort_order: params.sortOrder,
        },
        meta: {
          ...stats,
          user: contact
            ? {
                id: Number(contact.id),
                name: `${contact.firstName} ${contact.lastName}`.trim(),
                email: contact.email,
              }
            : null,
        },
      },
    };
  }

  async getRule(id: string) {
    const context = requireContext();
    const rule = await this.rulesRepository.findById(id);
    if (!rule) throw new NotFoundError('Rule not found');
    assertOwner(rule, context.userId);

    const contact = await this.usersLookup.findContactById(rule.userId);
    if (!contact) throw new NotFoundError('Rule owner not found');

    return {
      success: true,
      message: 'Rule fetched successfully.',
      data: { rule: toRuleDetailResponse(rule, contact, contact.timezone, new Date()) },
    };
  }

  async createRule(input: RuleInput) {
    const context = requireContext();
    const rule = await this.rulesRepository.create(context.userId, {
      ...input,
      conditions: filterValidConditions(input.conditions),
    });
    return {
      success: true,
      message: 'Rule created.',
      data: { rule: toRuleCreateResponse(rule, new Date()) },
    };
  }

  async updateRule(id: string, input: RuleInput) {
    const context = requireContext();
    const existing = await this.rulesRepository.findById(id);
    if (!existing) throw new NotFoundError('Rule not found');
    assertOwner(existing, context.userId);

    const rule = await this.rulesRepository.update(id, {
      ...input,
      conditions: filterValidConditions(input.conditions),
    });
    return {
      success: true,
      message: 'Rule updated.',
      data: { rule: toRuleUpdateResponse(rule, new Date()) },
    };
  }

  async deleteRule(id: string): Promise<void> {
    const context = requireContext();
    const existing = await this.rulesRepository.findById(id);
    if (!existing) throw new NotFoundError('Rule not found');
    assertOwner(existing, context.userId);

    await this.rulesRepository.delete(id);
  }

  /** D-0062: owner-only for every bulk op — Laravel's `hasRole('admin')` cross-user bypass is dropped. */
  private async ownedIds(ids: string[], userId: string): Promise<string[]> {
    const rules = await this.rulesRepository.findManyByIds(ids);
    return rules.filter(r => r.userId === userId).map(r => r.id);
  }

  async bulkActivate(ids: string[]): Promise<{ updated_count: number; rule_ids: number[] }> {
    const context = requireContext();
    const owned = await this.ownedIds(ids, context.userId);
    const updated = await this.rulesRepository.bulkSetActive(owned, true);
    return { updated_count: updated.length, rule_ids: updated.map(Number) };
  }

  async bulkDeactivate(ids: string[]): Promise<{ updated_count: number; rule_ids: number[] }> {
    const context = requireContext();
    const owned = await this.ownedIds(ids, context.userId);
    const updated = await this.rulesRepository.bulkSetActive(owned, false);
    return { updated_count: updated.length, rule_ids: updated.map(Number) };
  }

  async bulkDelete(ids: string[]): Promise<{ deleted_count: number }> {
    const context = requireContext();
    const owned = await this.ownedIds(ids, context.userId);
    const deletedCount = await this.rulesRepository.bulkDelete(owned);
    return { deleted_count: deletedCount };
  }

  // -- Alarms (AlarmController equivalent) -----------------------------------

  async listAlarms(query: Omit<ListAlarmsQuery, 'companyId'>) {
    const context = requireContext();
    if (!context.companyId) throw new ForbiddenError();
    return this.rulesRepository.listAlarms({ ...query, companyId: context.companyId });
  }

  async acknowledgeAlarm(id: string) {
    const context = requireContext();
    const alarm = await this.rulesRepository.findAlarmById(id);
    if (!alarm) throw new NotFoundError('Alarm not found.');
    if (alarm.state !== 'active') {
      throw new ValidationError(
        `Only an active alarm can be acknowledged (this one is ${alarm.state}).`
      );
    }

    const updated = await this.rulesRepository.acknowledgeAlarm(id, context.userId);
    return {
      success: true,
      message: 'Alarm acknowledged.',
      data: updated ? toAlarmResponse(updated) : null,
    };
  }

  // -- Rule-actions worker (RuleTriggerService::processRulesForDevice equivalent) --

  /**
   * Consumes the `"rule-actions"` queue (ingestion's unconditional
   * per-packet enqueue, `ingestion.service.ts`). Faithfully replicates a
   * real Laravel nuance: `canRuleBeTriggered` gates the **entire** body,
   * not just alarm persistence — while a rule is in cooldown, an incoming
   * packet that would have cleared its alarm does *not* clear it either;
   * evaluation, alarm creation/clearing, actions, and the last_triggered
   * update are ALL skipped until cooldown lifts.
   */
  async processRuleActionsJob(data: RuleActionsJobData): Promise<void> {
    const now = new Date();
    const rules = await this.rulesRepository.listActiveRuleBuilderRulesForUser(data.userId);

    for (const rule of rules) {
      if (!canRetrigger(rule, now)) continue;

      const { matched } = evaluate(rule.conditions, data.flattenedPacket, data.productId);

      if (matched) {
        const existing = await this.rulesRepository.findActiveOrAcknowledgedAlarm(
          rule.id,
          data.deviceId
        );
        if (!existing) {
          // `RuleTriggerService::recordAlarmTriggered`'s `$device->product?->company_id` —
          // `alarms` is company-ruled (`tenant-rules.ts`), so this must be resolved from
          // the triggering packet's product, not left null (a real bug caught via live
          // testing: an always-null company_id made every real-pipeline alarm invisible
          // to the company-scoped `GET /alarms` endpoint).
          const product = await this.productsLookup.findByIdUnscoped(data.productId);
          await this.rulesRepository.createAlarm({
            ruleId: rule.id,
            deviceId: data.deviceId,
            productId: data.productId,
            companyId: product?.companyId ?? null,
            severity: rule.severity,
            conditionSnapshot: rule.conditions,
            triggeredValue: data.flattenedPacket,
          });
        }

        await this.executeRuleActions(rule, data);
        await this.rulesRepository.updateLastTriggered(rule.id, now);
        await this.queue.enqueueAlarmRealtime({
          ruleId: rule.id,
          deviceId: data.deviceId,
          userId: data.userId,
          state: 'alert',
          message: `Rule ${rule.name ?? 'Unnamed Rule'} triggered alert`,
        });
      } else {
        await this.rulesRepository.clearAlarms(rule.id, data.deviceId);
        await this.queue.enqueueAlarmRealtime({
          ruleId: rule.id,
          deviceId: data.deviceId,
          userId: data.userId,
          state: 'normal',
          message: `Rule ${rule.name ?? 'Unnamed Rule'} is normal`,
        });
      }
    }
  }

  private async executeRuleActions(rule: Rule, data: RuleActionsJobData): Promise<void> {
    const actions = rule.actions;
    if (!actions) return;

    const device = await this.devicesLookup.findByIdUnscoped(data.deviceId);
    const contact = await this.usersLookup.findContactById(data.userId);
    if (!device || !contact) {
      logger.error(
        { ruleId: rule.id, deviceId: data.deviceId, userId: data.userId },
        'Rule action: device or user not found'
      );
      return;
    }

    const placeholders = buildPlaceholders({
      rule,
      device,
      user: contact,
      cleanedPacket: data.cleanedPacket,
      now: new Date(),
    });

    if (actions.sendEmail && rule.emailData) {
      const to = recipientList(rule.emailData['to']) ?? contact.email;
      const subject = replacePlaceholders(
        stringOrUndefined(rule.emailData['subject']) ??
          `Rule Triggered: ${rule.name ?? 'Unnamed Rule'}`,
        placeholders
      );
      const message = replacePlaceholders(
        stringOrUndefined(rule.emailData['message']) ??
          'A rule has been triggered for your device.',
        placeholders
      );
      const emailParams = {
        ruleName: rule.name ?? 'Unnamed Rule',
        ruleId: rule.id,
        conditionsCount: rule.conditions.length,
        executionInterval: rule.executionInterval ?? 0,
        allowRetriggering: rule.allowRetriggering ?? false,
        deviceId: device.id,
        deviceName: device.name,
        deviceEui: device.deviceUniqueIdentifier,
        userFirstName: contact.firstName,
        customMessage: message,
        cleanedPacket: data.cleanedPacket,
        triggeredAt: new Date(),
        timezone: contact.timezone,
      };
      await this.queue.enqueueMail({
        to,
        subject,
        html: renderRuleTriggeredEmailHtml(emailParams),
        text: renderRuleTriggeredEmailText(emailParams),
      });
    }

    if (actions.sendMessage && rule.smsData) {
      // D-0065: Laravel's `$smsData['to'] ?? $user->phone` falls back to a
      // magic-null Eloquent attribute (`User` has no `phone` column — only
      // `number`) — silently sends nothing when `to` is omitted. Falls back
      // to the contact's real `number` field instead (a safer deviation,
      // README prime directive #4 — no existing behavior to preserve, the
      // old fallback path never actually worked).
      const smsTo = rule.smsData['to'];
      const phoneNumbers =
        Array.isArray(smsTo) && smsTo.length > 0
          ? smsTo.map(n => String(n))
          : typeof smsTo === 'string' && smsTo !== ''
            ? [smsTo]
            : [contact.number];
      const message = replacePlaceholders(
        stringOrUndefined(rule.smsData['message']) ?? 'A rule has been triggered for your device.',
        placeholders
      );
      for (const to of phoneNumbers) {
        await this.queue.enqueueSms({ to, message });
      }
    }

    if (actions.systemNotification && rule.notificationData) {
      // D-0089/D-0014: module 6.1's real in-app delivery, replacing the
      // log-only placeholder module 2.5 shipped. Title has no Laravel
      // precedent to match (`sendSystemNotification` was never actually
      // invoked live) — reused verbatim from the dormant
      // `RuleTriggeredNotification::toMail`'s own subject line, the one
      // piece of this feature that was ever a real, considered string.
      const message = replacePlaceholders(
        stringOrUndefined(rule.notificationData['message']) ??
          'A rule has been triggered for your device.',
        placeholders
      );
      const title = `Rule Triggered: ${rule.name ?? 'Unnamed Rule'}`;
      const notification = await this.notificationsLookup.createForTarget(
        data.userId,
        title,
        message
      );
      await this.queue.enqueueNotificationRealtime({
        notificationId: notification.id,
        userId: data.userId,
        title,
        message,
      });
    }
  }
}

function compareBySortField(a: Rule, b: Rule, sortBy: string): number {
  switch (sortBy) {
    case 'name':
      return (a.name ?? '').localeCompare(b.name ?? '');
    case 'execution_interval':
      return (a.executionInterval ?? 0) - (b.executionInterval ?? 0);
    case 'is_active':
      return Number(a.isActive) - Number(b.isActive);
    case 'last_triggered':
      return (a.lastTriggered?.getTime() ?? 0) - (b.lastTriggered?.getTime() ?? 0);
    case 'id':
      return Number(a.id) - Number(b.id);
    case 'created_at':
    default:
      return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  }
}

/** Laravel: `$query->orderBy($sortField, $sortDirection)` then `if ($sortField !== 'id') $query->orderBy('id', 'desc')` as a stable tie-break. */
function sortRules(rules: Rule[], sortBy: string, sortOrder: 'asc' | 'desc'): Rule[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...rules].sort((a, b) => {
    const primary = compareBySortField(a, b, sortBy) * dir;
    if (primary !== 0 || sortBy === 'id') return primary;
    return Number(b.id) - Number(a.id);
  });
}
