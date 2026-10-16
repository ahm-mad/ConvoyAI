import type { Request, Response } from 'express';
import type { z } from 'zod';
import { parseOrThrow } from '../../platform/http/validate.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { buildLaravelPaginator } from '../../shared/utils/laravel-paginator.js';
import { toAlarmResponse } from './rules.mapper.js';
import type { RulesService } from './rules.service.js';
import {
  AlarmIdParamSchema,
  BulkRuleIdsRequestSchema,
  ListAlarmsRequestSchema,
  ListRulesRequestSchema,
  RuleIdParamSchema,
  RuleRequestSchema,
  RuleUpdateRequestSchema,
  UserIdParamSchema,
} from './rules.schemas.js';
import type { EmailData, NotificationData, RuleInput, SmsData } from './rules.types.js';

function toRuleInput(body: z.infer<typeof RuleRequestSchema>): RuleInput {
  return {
    ruleName: body.ruleName ?? undefined,
    executionInterval: body.executionInterval,
    allowRetriggering: body.allowRetriggering,
    severity: body.severity,
    conditions: body.conditions,
    actions: body.actions,
    // a JSON list passes Laravel's `array` rule too; it is stored as sent (D-0130)
    emailData: (body.emailData ?? undefined) as EmailData | undefined,
    smsData: (body.smsData ?? undefined) as SmsData | undefined,
    notificationData: (body.notificationData ?? undefined) as NotificationData | undefined,
    isActive: body.is_active,
  };
}

function requestPath(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`;
}

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. No business logic, no Prisma. */
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  listRules = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListRulesRequestSchema, req.query);
    const targetUserId = req.params['user']
      ? String(parseOrThrow(UserIdParamSchema, req.params).user)
      : callerUserId();

    const result = await this.rulesService.listRules({
      targetUserId,
      search: query.search,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      page: query.page,
      perPage: query.per_page,
      isActive: query.is_active,
      hasEmailData: query.has_email_data,
      hasSmsData: query.has_sms_data,
      hasNotificationData: query.has_notification_data,
      canBeTriggered: query.can_be_triggered,
      recentlyTriggeredHours: query.recently_triggered,
      path: requestPath(req),
    });
    res.status(200).json(result);
  };

  getRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RuleIdParamSchema, req.params);
    const result = await this.rulesService.getRule(String(id));
    res.status(200).json(result);
  };

  createRule = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(RuleRequestSchema, req.body);
    const result = await this.rulesService.createRule(toRuleInput(body));
    res.status(201).json(result);
  };

  updateRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RuleIdParamSchema, req.params);
    const body = parseOrThrow(RuleUpdateRequestSchema, req.body);
    const result = await this.rulesService.updateRule(String(id), toRuleInput(body));
    res.status(200).json(result);
  };

  deleteRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(RuleIdParamSchema, req.params);
    await this.rulesService.deleteRule(String(id));
    res.status(200).json({ success: true, message: 'Rule deleted.' });
  };

  bulkActivate = async (req: Request, res: Response): Promise<void> => {
    const { rule_ids } = parseOrThrow(BulkRuleIdsRequestSchema, req.body);
    const result = await this.rulesService.bulkActivate(rule_ids.map(String));
    res.status(200).json({ success: true, message: 'Rules activated successfully.', data: result });
  };

  bulkDeactivate = async (req: Request, res: Response): Promise<void> => {
    const { rule_ids } = parseOrThrow(BulkRuleIdsRequestSchema, req.body);
    const result = await this.rulesService.bulkDeactivate(rule_ids.map(String));
    res
      .status(200)
      .json({ success: true, message: 'Rules deactivated successfully.', data: result });
  };

  bulkForceDelete = async (req: Request, res: Response): Promise<void> => {
    const { rule_ids } = parseOrThrow(BulkRuleIdsRequestSchema, req.body);
    const result = await this.rulesService.bulkDelete(rule_ids.map(String));
    res.status(200).json({ success: true, message: 'Rules deleted successfully.', ...result });
  };

  listAlarms = async (req: Request, res: Response): Promise<void> => {
    const query = parseOrThrow(ListAlarmsRequestSchema, req.query);
    const { items, total } = await this.rulesService.listAlarms({
      state: query.state,
      deviceId: query.device_id !== undefined ? String(query.device_id) : undefined,
      page: query.page,
      perPage: query.per_page,
    });
    // AlarmController.php:46-50 — Laravel's real paginator envelope, not a bare array + sibling meta.
    res.status(200).json({
      success: true,
      message: 'Alarms retrieved.',
      data: buildLaravelPaginator({
        items: items.map(toAlarmResponse),
        page: query.page,
        perPage: query.per_page,
        total,
        path: `${req.protocol}://${req.get('host') ?? ''}${req.baseUrl}${req.path}`,
      }),
    });
  };

  acknowledgeAlarm = async (req: Request, res: Response): Promise<void> => {
    const { id } = parseOrThrow(AlarmIdParamSchema, req.params);
    const result = await this.rulesService.acknowledgeAlarm(String(id));
    res.status(200).json(result);
  };
}

function callerUserId(): string {
  // `GET /rules` (no `{user}` param) defaults to the caller — the
  // service still re-checks `targetUserId === context.userId` (D-0062),
  // this is just resolving the default before that check runs.
  const context = getRequestContext();
  return context?.userId ?? '';
}
