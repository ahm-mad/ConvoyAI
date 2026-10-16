import type { RulesRepository } from '../rules.repository.js';
import type { RulesQueuePort } from '../rules.service.js';
import type {
  RulesDevicesLookup,
  RulesNotificationsLookup,
  RulesProductsLookup,
  RulesUsersLookup,
} from '../lookups.js';
import type { RuleAlarmRealtimeJobData, RuleNotificationRealtimeJobData } from '../rules.jobs.js';
import type { SendMailJobData } from '../../../platform/mail/mail.worker.js';
import type { SendSmsJobData } from '../../../platform/sms/sms.worker.js';
import type {
  Alarm,
  ListAlarmsQuery,
  ListRulesQuery,
  Rule,
  RuleInput,
  RuleSeverity,
} from '../rules.types.js';

let nextId = 1;
const newId = () => String(nextId++);

interface FakeState {
  rules: Map<string, Rule>;
  alarms: Map<string, Alarm>;
}

function defaultRule(
  id: string,
  userId: string,
  input: Partial<RuleInput> & { userId?: string }
): Rule {
  return {
    id,
    userId,
    name: input.ruleName ?? null,
    executionInterval: input.executionInterval ?? null,
    allowRetriggering: input.allowRetriggering ?? null,
    severity: input.severity ?? 'warning',
    conditions: input.conditions ?? [],
    actions: input.actions ?? null,
    emailData: input.emailData ?? null,
    smsData: input.smsData ?? null,
    notificationData: input.notificationData ?? null,
    isActive: input.isActive ?? true,
    isForWidget: false,
    isForRuleBuilder: true,
    isForAll: false,
    lastTriggered: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** In-memory stand-in for `RulesRepository` — module 2.5's unit tests, no Prisma/DB touched (CONVENTIONS.md "Tests"). */
export function fakeRulesRepository(
  seedRules: Rule[] = [],
  seedAlarms: Alarm[] = []
): { repository: RulesRepository; state: FakeState } {
  const state: FakeState = {
    rules: new Map(seedRules.map(r => [r.id, r])),
    alarms: new Map(seedAlarms.map(a => [a.id, a])),
  };

  const repo = {
    listForUser: (query: ListRulesQuery) => {
      let rows = [...state.rules.values()].filter(
        r => r.userId === query.userId && (r.isForRuleBuilder || r.isForAll)
      );
      const search = query.search;
      if (search)
        rows = rows.filter(r => (r.name ?? '').toLowerCase().includes(search.toLowerCase()));
      if (query.isActive !== undefined) rows = rows.filter(r => r.isActive === query.isActive);
      if (query.hasEmailData !== undefined)
        rows = rows.filter(r => (r.emailData !== null) === query.hasEmailData);
      if (query.hasSmsData !== undefined)
        rows = rows.filter(r => (r.smsData !== null) === query.hasSmsData);
      if (query.hasNotificationData !== undefined)
        rows = rows.filter(r => (r.notificationData !== null) === query.hasNotificationData);
      return Promise.resolve(rows);
    },

    statsRowsForUser: () => Promise.resolve([...state.rules.values()]),

    findById: (id: string) => Promise.resolve(state.rules.get(id)),

    findManyByIds: (ids: string[]) =>
      Promise.resolve(ids.map(id => state.rules.get(id)).filter((r): r is Rule => !!r)),

    create: (userId: string, input: RuleInput) => {
      const rule = defaultRule(newId(), userId, input);
      state.rules.set(rule.id, rule);
      return Promise.resolve(rule);
    },

    update: (id: string, input: RuleInput) => {
      const existing = state.rules.get(id);
      if (!existing) throw new Error('not found');
      const updated: Rule = {
        ...existing,
        name: input.ruleName ?? null,
        executionInterval: input.executionInterval,
        allowRetriggering: input.allowRetriggering,
        severity: input.severity ?? 'warning',
        conditions: input.conditions,
        actions: input.actions,
        emailData: input.emailData ?? null,
        smsData: input.smsData ?? null,
        notificationData: input.notificationData ?? null,
        isActive: input.isActive,
        updatedAt: new Date(),
      };
      state.rules.set(id, updated);
      return Promise.resolve(updated);
    },

    delete: (id: string) => {
      state.rules.delete(id);
      return Promise.resolve();
    },

    bulkSetActive: (ids: string[], isActive: boolean) => {
      const updated: string[] = [];
      for (const id of ids) {
        const rule = state.rules.get(id);
        if (rule) {
          state.rules.set(id, { ...rule, isActive });
          updated.push(id);
        }
      }
      return Promise.resolve(updated);
    },

    bulkDelete: (ids: string[]) => {
      let count = 0;
      for (const id of ids) {
        if (state.rules.delete(id)) count += 1;
      }
      return Promise.resolve(count);
    },

    listAlarms: (query: ListAlarmsQuery) => {
      let rows = [...state.alarms.values()].filter(a => a.companyId === query.companyId);
      if (query.state) rows = rows.filter(a => a.state === query.state);
      if (query.deviceId) rows = rows.filter(a => a.deviceId === query.deviceId);
      const total = rows.length;
      const items = rows.slice((query.page - 1) * query.perPage, query.page * query.perPage);
      return Promise.resolve({ items, total });
    },

    findAlarmById: (id: string) => Promise.resolve(state.alarms.get(id)),

    acknowledgeAlarm: (id: string, acknowledgedByUserId: string) => {
      const existing = state.alarms.get(id);
      if (!existing) return Promise.resolve(undefined);
      const updated: Alarm = {
        ...existing,
        state: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedByUserId,
      };
      state.alarms.set(id, updated);
      return Promise.resolve(updated);
    },

    listActiveRuleBuilderRulesForUser: (userId: string) =>
      Promise.resolve(
        [...state.rules.values()]
          .filter(r => r.userId === userId && r.isActive && r.isForRuleBuilder)
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      ),

    updateLastTriggered: (ruleId: string, when: Date) => {
      const rule = state.rules.get(ruleId);
      if (rule) state.rules.set(ruleId, { ...rule, lastTriggered: when });
      return Promise.resolve();
    },

    findActiveOrAcknowledgedAlarm: (ruleId: string, deviceId: string) =>
      Promise.resolve(
        [...state.alarms.values()].find(
          a =>
            a.ruleId === ruleId &&
            a.deviceId === deviceId &&
            (a.state === 'active' || a.state === 'acknowledged')
        )
      ),

    createAlarm: (input: {
      ruleId: string;
      deviceId: string;
      productId: string | null;
      companyId: string | null;
      severity: RuleSeverity;
      conditionSnapshot: unknown;
      triggeredValue: unknown;
    }) => {
      const alarm: Alarm = {
        id: newId(),
        ruleId: input.ruleId,
        deviceId: input.deviceId,
        productId: input.productId,
        companyId: input.companyId,
        state: 'active',
        severity: input.severity,
        conditionSnapshot: input.conditionSnapshot,
        triggeredValue: input.triggeredValue,
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
      state.alarms.set(alarm.id, alarm);
      return Promise.resolve(alarm);
    },

    clearAlarms: (ruleId: string, deviceId: string) => {
      let count = 0;
      for (const [id, alarm] of state.alarms) {
        if (
          alarm.ruleId === ruleId &&
          alarm.deviceId === deviceId &&
          (alarm.state === 'active' || alarm.state === 'acknowledged')
        ) {
          state.alarms.set(id, { ...alarm, state: 'cleared', clearedAt: new Date() });
          count += 1;
        }
      }
      return Promise.resolve(count);
    },
  };

  return { repository: repo as unknown as RulesRepository, state };
}

export function fakeDevicesLookup(
  devices: { id: string; name: string; deviceUniqueIdentifier: string; userId: string }[] = []
): RulesDevicesLookup {
  return {
    findByIdUnscoped: (id: string) => Promise.resolve(devices.find(d => d.id === id)),
  };
}

export function fakeProductsLookup(
  products: { id: string; companyId: string }[] = []
): RulesProductsLookup {
  return {
    findByIdUnscoped: (id: string) => Promise.resolve(products.find(p => p.id === id)),
  };
}

export function fakeUsersLookup(
  contacts: {
    id: string;
    email: string;
    number: string;
    firstName: string;
    lastName: string;
    timezone: string | null;
  }[] = []
): RulesUsersLookup {
  return {
    findContactById: (userId: string) => Promise.resolve(contacts.find(c => c.id === userId)),
  };
}

export function fakeQueuePort(): RulesQueuePort & {
  mailJobs: SendMailJobData[];
  smsJobs: SendSmsJobData[];
  alarmRealtimeJobs: RuleAlarmRealtimeJobData[];
  notificationRealtimeJobs: RuleNotificationRealtimeJobData[];
} {
  const mailJobs: SendMailJobData[] = [];
  const smsJobs: SendSmsJobData[] = [];
  const alarmRealtimeJobs: RuleAlarmRealtimeJobData[] = [];
  const notificationRealtimeJobs: RuleNotificationRealtimeJobData[] = [];
  return {
    enqueueMail: data => {
      mailJobs.push(data);
      return Promise.resolve();
    },
    enqueueSms: data => {
      smsJobs.push(data);
      return Promise.resolve();
    },
    enqueueAlarmRealtime: data => {
      alarmRealtimeJobs.push(data);
      return Promise.resolve();
    },
    enqueueNotificationRealtime: data => {
      notificationRealtimeJobs.push(data);
      return Promise.resolve();
    },
    mailJobs,
    smsJobs,
    alarmRealtimeJobs,
    notificationRealtimeJobs,
  };
}

/** D-0089: module 6.1's `NotificationsRepository` doubles as this interface in the real container — the fake here is a plain in-memory stand-in for the rule-actions worker's unit tests. */
export function fakeNotificationsLookup(): RulesNotificationsLookup & {
  created: { userId: string; title: string; message: string }[];
} {
  const created: { userId: string; title: string; message: string }[] = [];
  return {
    createForTarget: (userId, title, message) => {
      created.push({ userId, title, message });
      return Promise.resolve({ id: String(created.length) });
    },
    created,
  };
}
