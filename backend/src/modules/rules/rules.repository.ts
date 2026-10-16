import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toAlarm, toRule } from './rules.mapper.js';
import type {
  Alarm,
  ListAlarmsQuery,
  ListRulesQuery,
  Rule,
  RuleInput,
  RuleSeverity,
} from './rules.types.js';

const ALARM_INCLUDE = {
  rules: { select: { id: true, name: true } },
  devices: { select: { id: true, name: true, device_unique_identifier: true } },
  users: { select: { id: true, first_name: true, last_name: true } },
} as const;

/**
 * All Prisma access for module 2.5. `rules` is `user`-ruled and `alarms`
 * is `company`-ruled (`tenant-rules.ts`) — every HTTP-facing method below
 * runs under the caller's own real request context, so the tenant-scoping
 * extension injects `user_id`/`company_id` automatically; no method here
 * adds its own explicit tenant filter (D-0062: no cross-user admin
 * bypass anywhere in this module, so there is nothing the ambient context
 * can't already express — unlike module 2.3 devices' OR-boundary).
 *
 * The rule-actions worker (`rules.worker.ts`) has no HTTP request — its
 * methods (bottom of the class) use `runAsSystemAsync` with an explicit
 * `where` clause instead, same reasoning as `ingestion.repository.ts`'s
 * cross-module lookups: this is a machine-triggered background job, not
 * a bypass of a check that should exist.
 */
export class RulesRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // -- Rules CRUD (RuleBuilderController equivalent) -----------------------

  /** `RuleBuilderController::index`'s base query: rule-builder-created or widget-setting-shared ("both") rules only — excludes pure widget-only rules, matches Laravel exactly. */
  async listForUser(query: ListRulesQuery): Promise<Rule[]> {
    const and: Record<string, unknown>[] = [
      { OR: [{ is_for_rule_builder: true }, { is_for_all: true }] },
    ];

    if (query.search) {
      const searchAsId = Number(query.search);
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          ...(Number.isInteger(searchAsId) ? [{ id: BigInt(searchAsId) }] : []),
        ],
      });
    }
    if (query.isActive !== undefined) and.push({ is_active: query.isActive });
    if (query.hasEmailData !== undefined)
      and.push({ email_data: query.hasEmailData ? { not: null } : null });
    if (query.hasSmsData !== undefined)
      and.push({ sms_data: query.hasSmsData ? { not: null } : null });
    if (query.hasNotificationData !== undefined)
      and.push({ notification_data: query.hasNotificationData ? { not: null } : null });

    const rows = await this.prisma.rules.findMany({ where: { AND: and } });
    return rows.map(toRule);
  }

  /** `$user->rules()` unfiltered — Laravel's stats block deliberately counts ALL of the user's rules, not just the rule-builder/is_for_all subset `listForUser` returns. */
  async statsRowsForUser(): Promise<Rule[]> {
    const rows = await this.prisma.rules.findMany({});
    return rows.map(toRule);
  }

  async findById(id: string): Promise<Rule | undefined> {
    const row = await this.prisma.rules.findUnique({ where: { id: BigInt(id) } });
    return row ? toRule(row) : undefined;
  }

  async findManyByIds(ids: string[]): Promise<Rule[]> {
    const rows = await this.prisma.rules.findMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
    });
    return rows.map(toRule);
  }

  async create(userId: string, input: RuleInput): Promise<Rule> {
    const row = await this.prisma.rules.create({
      data: {
        user_id: BigInt(userId),
        name: input.ruleName ?? null,
        execution_interval: input.executionInterval,
        allow_retriggering: input.allowRetriggering,
        severity: input.severity ?? 'warning',
        conditions: input.conditions as unknown as object,
        actions: input.actions as unknown as object,
        email_data: (input.emailData ?? null) as unknown as object,
        sms_data: (input.smsData ?? null) as unknown as object,
        notification_data: (input.notificationData ?? null) as unknown as object,
        is_active: input.isActive,
        is_for_rule_builder: true,
      },
    });
    return toRule(row);
  }

  async update(id: string, input: RuleInput): Promise<Rule> {
    const row = await this.prisma.rules.update({
      where: { id: BigInt(id) },
      data: {
        name: input.ruleName ?? null,
        execution_interval: input.executionInterval,
        allow_retriggering: input.allowRetriggering,
        severity: input.severity ?? 'warning',
        conditions: input.conditions as unknown as object,
        actions: input.actions as unknown as object,
        email_data: (input.emailData ?? null) as unknown as object,
        sms_data: (input.smsData ?? null) as unknown as object,
        notification_data: (input.notificationData ?? null) as unknown as object,
        is_active: input.isActive,
      },
    });
    return toRule(row);
  }

  /** Laravel's `forceDelete()` — a real hard delete, not a soft-delete flip (D-0062's scope note: `rules` is the one soft-deleting model in the schema, but this endpoint bypasses that entirely, matching Laravel exactly). */
  async delete(id: string): Promise<void> {
    await this.prisma.rules.delete({ where: { id: BigInt(id) } });
  }

  async bulkSetActive(ids: string[], isActive: boolean): Promise<string[]> {
    const idsBigInt = ids.map(id => BigInt(id));
    const rows = await this.prisma.rules.findMany({
      where: { id: { in: idsBigInt } },
      select: { id: true },
    });
    await this.prisma.rules.updateMany({
      where: { id: { in: idsBigInt } },
      data: { is_active: isActive },
    });
    return rows.map(r => r.id.toString());
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const result = await this.prisma.rules.deleteMany({
      where: { id: { in: ids.map(id => BigInt(id)) } },
    });
    return result.count;
  }

  // -- Alarms CRUD (AlarmController equivalent) -----------------------------

  async listAlarms(query: ListAlarmsQuery): Promise<{ items: Alarm[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (query.state) where['state'] = query.state;
    if (query.deviceId) where['device_id'] = BigInt(query.deviceId);

    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await Promise.all([
      this.prisma.alarms.findMany({
        where,
        include: ALARM_INCLUDE,
        orderBy: { triggered_at: 'desc' },
        skip,
        take: query.perPage,
      }),
      this.prisma.alarms.count({ where }),
    ]);
    return { items: rows.map(toAlarm), total };
  }

  async findAlarmById(id: string): Promise<Alarm | undefined> {
    const row = await this.prisma.alarms.findUnique({
      where: { id: BigInt(id) },
      include: ALARM_INCLUDE,
    });
    return row ? toAlarm(row) : undefined;
  }

  async acknowledgeAlarm(id: string, acknowledgedByUserId: string): Promise<Alarm | undefined> {
    const row = await this.prisma.alarms.update({
      where: { id: BigInt(id) },
      data: {
        state: 'acknowledged',
        acknowledged_at: new Date(),
        acknowledged_by: BigInt(acknowledgedByUserId),
      },
      include: ALARM_INCLUDE,
    });
    return toAlarm(row);
  }

  // -- Rule-actions worker (system context — no HTTP request, see class doc) --

  /**
   * `RuleTriggerService::getActiveRulesForDevice` equivalent —
   * `is_for_rule_builder = true` only (device/rule-builder rules), not the
   * incidental `is_for_building` sweep-in `rule-engine.md` §1.2 documents
   * as dead/accidental in the old query (`is_for_widget = 0` alone). A
   * fresh port of the intended semantics, not a bug-for-bug copy of an
   * accidental inclusion the old code never relied on.
   */
  async listActiveRuleBuilderRulesForUser(userId: string): Promise<Rule[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.rules.findMany({
        where: { user_id: BigInt(userId), is_active: true, is_for_rule_builder: true },
        orderBy: { created_at: 'asc' },
      })
    );
    return rows.map(toRule);
  }

  async updateLastTriggered(ruleId: string, when: Date): Promise<void> {
    await runAsSystemAsync(() =>
      this.prisma.rules.update({ where: { id: BigInt(ruleId) }, data: { last_triggered: when } })
    );
  }

  async findActiveOrAcknowledgedAlarm(
    ruleId: string,
    deviceId: string
  ): Promise<Alarm | undefined> {
    const row = await runAsSystemAsync(() =>
      this.prisma.alarms.findFirst({
        where: {
          rule_id: BigInt(ruleId),
          device_id: BigInt(deviceId),
          state: { in: ['active', 'acknowledged'] },
        },
        include: ALARM_INCLUDE,
      })
    );
    return row ? toAlarm(row) : undefined;
  }

  async createAlarm(input: {
    ruleId: string;
    deviceId: string;
    productId: string | null;
    companyId: string | null;
    severity: RuleSeverity;
    conditionSnapshot: unknown;
    triggeredValue: unknown;
  }): Promise<Alarm> {
    const row = await runAsSystemAsync(() =>
      this.prisma.alarms.create({
        data: {
          rule_id: BigInt(input.ruleId),
          device_id: BigInt(input.deviceId),
          product_id: input.productId === null ? null : BigInt(input.productId),
          company_id: input.companyId === null ? null : BigInt(input.companyId),
          state: 'active',
          severity: input.severity,
          condition_snapshot: input.conditionSnapshot as object,
          triggered_value: input.triggeredValue as object,
          triggered_at: new Date(),
        },
        include: ALARM_INCLUDE,
      })
    );
    return toAlarm(row);
  }

  async clearAlarms(ruleId: string, deviceId: string): Promise<number> {
    const result = await runAsSystemAsync(() =>
      this.prisma.alarms.updateMany({
        where: {
          rule_id: BigInt(ruleId),
          device_id: BigInt(deviceId),
          state: { in: ['active', 'acknowledged'] },
        },
        data: { state: 'cleared', cleared_at: new Date() },
      })
    );
    return result.count;
  }
}
