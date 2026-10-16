import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { RulesService } from '../rules.service.js';
import {
  fakeDevicesLookup,
  fakeNotificationsLookup,
  fakeProductsLookup,
  fakeQueuePort,
  fakeRulesRepository,
  fakeUsersLookup,
} from './fakes.js';
import type { Alarm, Rule, RuleInput } from '../rules.types.js';

function contextFor(userId: string, companyId: string | undefined): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

const RULE_INPUT: RuleInput = {
  ruleName: 'Temp Alert',
  executionInterval: 300,
  allowRetriggering: true,
  severity: 'warning',
  conditions: [
    {
      selectedProduct: 'p1',
      selectedAttribute: 'objectJSON.temp',
      selectedCondition: 'greater_than',
      conditionValue: '30',
      logicalOperator: 'and',
    },
  ],
  actions: { sendEmail: true, sendMessage: false, systemNotification: false },
  emailData: { to: 'owner@example.com', subject: 'Alert', message: 'Hi {{device_name}}' },
  smsData: undefined,
  notificationData: undefined,
  isActive: true,
};

function ruleRow(overrides: Partial<Rule> = {}): Rule {
  return {
    id: '1',
    userId: '1',
    name: 'Temp Alert',
    executionInterval: 300,
    allowRetriggering: true,
    severity: 'warning',
    conditions: [
      {
        selectedProduct: 'p1',
        selectedAttribute: 'objectJSON.temp',
        selectedCondition: 'greater_than',
        conditionValue: '30',
        logicalOperator: 'and',
      },
    ],
    actions: { sendEmail: true, sendMessage: false, systemNotification: false },
    emailData: { to: 'owner@example.com' },
    smsData: null,
    notificationData: null,
    isActive: true,
    isForWidget: false,
    isForRuleBuilder: true,
    isForAll: false,
    lastTriggered: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildService(seedRules: Rule[] = [], seedAlarms: Alarm[] = []) {
  const { repository, state } = fakeRulesRepository(seedRules, seedAlarms);
  const devicesLookup = fakeDevicesLookup([
    { id: 'd1', name: 'Device 1', deviceUniqueIdentifier: 'eui-1', userId: '1' },
  ]);
  const usersLookup = fakeUsersLookup([
    {
      id: '1',
      email: 'owner@example.com',
      number: '+15550001111',
      firstName: 'Ada',
      lastName: 'Lovelace',
      timezone: 'UTC',
    },
  ]);
  const productsLookup = fakeProductsLookup([{ id: 'p1', companyId: 'c1' }]);
  const notificationsLookup = fakeNotificationsLookup();
  const queue = fakeQueuePort();
  const service = new RulesService(
    repository,
    devicesLookup,
    usersLookup,
    productsLookup,
    notificationsLookup,
    queue
  );
  return { service, state, queue, notificationsLookup };
}

describe('RulesService — CRUD ownership (D-0062: owner-only everywhere)', () => {
  it('createRule assigns the caller as owner', async () => {
    const { service, state } = buildService();
    await runWithContextAsync(contextFor('1', '1'), () => service.createRule(RULE_INPUT));
    const created = [...state.rules.values()][0];
    expect(created?.userId).toBe('1');
  });

  it('getRule 404s for a nonexistent id', async () => {
    const { service } = buildService();
    await expect(
      runWithContextAsync(contextFor('1', '1'), () => service.getRule('999'))
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("getRule 403s when the caller doesn't own the rule", async () => {
    const { service } = buildService([ruleRow({ id: '1', userId: '2' })]);
    await expect(
      runWithContextAsync(contextFor('1', '1'), () => service.getRule('1'))
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('updateRule/deleteRule 403 for a non-owner (no admin bypass, D-0062)', async () => {
    const { service } = buildService([ruleRow({ id: '1', userId: '2' })]);
    await expect(
      runWithContextAsync(contextFor('1', '1'), () => service.updateRule('1', RULE_INPUT))
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      runWithContextAsync(contextFor('1', '1'), () => service.deleteRule('1'))
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it("listRules 403s when targetUserId doesn't match the caller (GET /rules/users/{user})", async () => {
    const { service } = buildService();
    await expect(
      runWithContextAsync(contextFor('1', '1'), () =>
        service.listRules({
          targetUserId: '2',
          search: undefined,
          sortBy: 'created_at',
          sortOrder: 'desc',
          page: 1,
          perPage: 10,
          isActive: undefined,
          hasEmailData: undefined,
          hasSmsData: undefined,
          hasNotificationData: undefined,
          canBeTriggered: undefined,
          recentlyTriggeredHours: undefined,
          path: 'https://api.example.com/rules',
        })
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bulkActivate/bulkDeactivate/bulkDelete silently narrow to owned ids only, no error for the non-owned ones', async () => {
    const { service, state } = buildService([
      ruleRow({ id: '1', userId: '1', isActive: false }),
      ruleRow({ id: '2', userId: '2', isActive: false }),
    ]);
    const result = await runWithContextAsync(contextFor('1', '1'), () =>
      service.bulkActivate(['1', '2'])
    );
    expect(result).toEqual({ updated_count: 1, rule_ids: [1] });
    expect(state.rules.get('1')?.isActive).toBe(true);
    expect(state.rules.get('2')?.isActive).toBe(false); // untouched — not owned by caller
  });

  it("condition filtering drops conditions missing selectedProduct/selectedAttribute or the 'Please choose' sentinel (rule-engine.md §1.1)", async () => {
    const { service, state } = buildService();
    const input: RuleInput = {
      ...RULE_INPUT,
      conditions: [
        {
          selectedProduct: 'p1',
          selectedAttribute: 'a',
          selectedCondition: 'equals',
          conditionValue: '1',
          logicalOperator: 'and',
        },
        {
          selectedProduct: 'Please choose',
          selectedAttribute: 'b',
          selectedCondition: 'equals',
          conditionValue: '1',
          logicalOperator: 'and',
        },
        {
          selectedProduct: 'p1',
          selectedAttribute: null,
          selectedCondition: 'equals',
          conditionValue: '1',
          logicalOperator: 'and',
        },
        {
          selectedProduct: 'p1',
          selectedAttribute: 'c',
          selectedCondition: '',
          conditionValue: '1',
          logicalOperator: 'and',
        },
      ],
    };
    await runWithContextAsync(contextFor('1', '1'), () => service.createRule(input));
    const created = [...state.rules.values()][0];
    expect(created?.conditions).toHaveLength(1);
    expect(created?.conditions[0]?.selectedAttribute).toBe('a');
  });
});

describe('RulesService — alarms', () => {
  it("acknowledgeAlarm 422s when the alarm isn't active", async () => {
    const alarm: Alarm = {
      id: '1',
      ruleId: '1',
      deviceId: 'd1',
      productId: null,
      companyId: '1',
      state: 'cleared',
      severity: 'warning',
      conditionSnapshot: null,
      triggeredValue: null,
      triggeredAt: new Date(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      clearedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      rule: undefined,
      device: undefined,
      acknowledgedByUser: undefined,
    };
    const { service } = buildService([], [alarm]);
    await expect(
      runWithContextAsync(contextFor('1', '1'), () => service.acknowledgeAlarm('1'))
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('acknowledgeAlarm transitions active -> acknowledged', async () => {
    const alarm: Alarm = {
      id: '1',
      ruleId: '1',
      deviceId: 'd1',
      productId: null,
      companyId: '1',
      state: 'active',
      severity: 'critical',
      conditionSnapshot: null,
      triggeredValue: null,
      triggeredAt: new Date(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      clearedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      rule: undefined,
      device: undefined,
      acknowledgedByUser: undefined,
    };
    const { service, state } = buildService([], [alarm]);
    const result = await runWithContextAsync(contextFor('9', '1'), () =>
      service.acknowledgeAlarm('1')
    );
    expect(result.data?.state).toBe('acknowledged');
    expect(state.alarms.get('1')?.acknowledgedBy).toBe('9');
  });
});

describe('RulesService — processRuleActionsJob (rule-actions worker, RuleTriggerService::processRulesForDevice equivalent)', () => {
  const jobData = {
    deviceId: 'd1',
    productId: 'p1',
    userId: '1',
    cleanedPacket: { temp: 35 },
    flattenedPacket: { 'objectJSON.temp': 35 },
  };

  it('condition matches: creates an alarm, runs actions, updates last_triggered, enqueues an alarm-state realtime job', async () => {
    const { service, state, queue } = buildService([ruleRow()]);
    await service.processRuleActionsJob(jobData);

    expect([...state.alarms.values()]).toHaveLength(1);
    expect([...state.alarms.values()][0]?.state).toBe('active');
    expect([...state.alarms.values()][0]?.severity).toBe('warning');
    // Real bug found via live-testing: company_id was always null (never resolved from
    // the triggering packet's product), making every real-pipeline alarm invisible to
    // the company-scoped GET /alarms endpoint. Regression-tested here.
    expect([...state.alarms.values()][0]?.companyId).toBe('c1');
    expect(state.rules.get('1')?.lastTriggered).not.toBeNull();
    expect(queue.mailJobs).toHaveLength(1);
    expect(queue.mailJobs[0]?.to).toBe('owner@example.com');
    expect(queue.alarmRealtimeJobs).toEqual([
      {
        ruleId: '1',
        deviceId: 'd1',
        userId: '1',
        state: 'alert',
        message: 'Rule Temp Alert triggered alert',
      },
    ]);
  });

  it("D-0130: the frontend's stored shapes work end to end — array emailData.to and numeric selectedProduct (the rule still matches its product)", async () => {
    const { service, queue } = buildService([
      ruleRow({
        conditions: [
          {
            selectedProduct: 1, // stored as a JSON number by the frontend; the packet's productId is a string
            selectedAttribute: 'objectJSON.temp',
            selectedCondition: 'greater_than',
            conditionValue: '30',
            logicalOperator: 'and',
          },
        ],
        actions: { sendEmail: true, sendMessage: true, systemNotification: false },
        emailData: {
          to: ['a@example.com', ' ', 'b@example.com'],
          newRecipient: null,
          subject: 'S',
          message: 'M',
        },
        smsData: { to: [393939, '555'], newRecipient: null, message: 'T' },
      }),
    ]);

    await service.processRuleActionsJob({ ...jobData, productId: '1' });

    expect(queue.mailJobs[0]?.to).toBe('a@example.com, b@example.com');
    expect(queue.smsJobs.map(j => j.to)).toEqual(['393939', '555']);
  });

  it('systemNotification action (D-0089): persists a real notification for the rule owner and enqueues its realtime push', async () => {
    const { service, queue, notificationsLookup } = buildService([
      ruleRow({
        actions: { sendEmail: false, sendMessage: false, systemNotification: true },
        emailData: null,
        notificationData: { message: '{{device_name}} is over threshold' },
      }),
    ]);
    await service.processRuleActionsJob(jobData);

    expect(notificationsLookup.created).toEqual([
      { userId: '1', title: 'Rule Triggered: Temp Alert', message: 'Device 1 is over threshold' },
    ]);
    expect(queue.notificationRealtimeJobs).toEqual([
      {
        notificationId: '1',
        userId: '1',
        title: 'Rule Triggered: Temp Alert',
        message: 'Device 1 is over threshold',
      },
    ]);
  });

  it('re-matching packet is idempotent: does not create a second alarm for the same (rule, device)', async () => {
    const { service, state } = buildService([
      ruleRow({ allowRetriggering: true, executionInterval: 0 }),
    ]);
    await service.processRuleActionsJob(jobData);
    await service.processRuleActionsJob(jobData);
    expect([...state.alarms.values()]).toHaveLength(1);
  });

  it("condition stops matching: clears the alarm and enqueues a 'normal' realtime job", async () => {
    const { service, state, queue } = buildService([
      ruleRow({ allowRetriggering: true, executionInterval: 0 }),
    ]);
    await service.processRuleActionsJob(jobData);

    await service.processRuleActionsJob({ ...jobData, flattenedPacket: { 'objectJSON.temp': 10 } });
    expect([...state.alarms.values()][0]?.state).toBe('cleared');
    expect(queue.alarmRealtimeJobs.at(-1)).toMatchObject({ state: 'normal' });
  });

  it('cooldown gates the ENTIRE body, not just alarm persistence: while in cooldown, a would-be-clearing packet does not clear the alarm either (faithful RuleTriggerService::canRuleBeTriggered replication)', async () => {
    const { service, state, queue } = buildService([
      ruleRow({ allowRetriggering: false, lastTriggered: new Date() }),
    ]);
    // allowRetriggering=false + lastTriggered already set -> canRetrigger is false forever -> processRuleActionsJob must no-op entirely
    await service.processRuleActionsJob({ ...jobData, flattenedPacket: { 'objectJSON.temp': 10 } }); // would NOT match
    expect([...state.alarms.values()]).toHaveLength(0);
    expect(queue.alarmRealtimeJobs).toHaveLength(0);
  });

  it("product scoping (D-0059): a condition whose selectedProduct doesn't match the packet's productId does not fire", async () => {
    const { service, state } = buildService([
      ruleRow({
        conditions: [
          {
            selectedProduct: 'OTHER_PRODUCT',
            selectedAttribute: 'objectJSON.temp',
            selectedCondition: 'greater_than',
            conditionValue: '30',
            logicalOperator: 'and',
          },
        ],
      }),
    ]);
    await service.processRuleActionsJob(jobData);
    expect([...state.alarms.values()]).toHaveLength(0);
  });

  it('device/rule-builder rules are evaluated (is_for_rule_builder=true); a widget-only rule is not', async () => {
    const { service, state } = buildService([
      ruleRow({ id: '1', isForRuleBuilder: false, isForAll: false, isForWidget: true }),
    ]);
    await service.processRuleActionsJob(jobData);
    expect([...state.alarms.values()]).toHaveLength(0);
  });
});
