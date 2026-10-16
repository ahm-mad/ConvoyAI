import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../platform/errors/app-error.js';
import { DashboardsService } from '../dashboards.service.js';
import { fakeDashboardsRepository, fakeProductsLookup } from './fakes.js';
import type { Dashboard, RuleCondition, Widget, WidgetSetting } from '../dashboards.types.js';

function contextFor(userId: string, companyId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

function dashboardRow(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: '1',
    createdBy: '1',
    name: 'My Dashboard',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function widgetRow(overrides: Partial<Widget> = {}): Widget {
  return {
    id: '1',
    dashboardId: '1',
    type: 'value',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    createdBy: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function widgetSettingRow(overrides: Partial<WidgetSetting> = {}): WidgetSetting {
  return {
    id: '1',
    widgetId: '1',
    ruleId: '1',
    widgetName: null,
    settings: null,
    attributes: 'temp',
    yAxisLabel: null,
    device: '10',
    data: null,
    unit: null,
    icon: null,
    decimal: null,
    showTimestamp: null,
    product: '20',
    label: null,
    backgroundColor: null,
    valueColor: null,
    textColor: null,
    maxValue: null,
    tankType: null,
    graphType: null,
    graphInterval: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DashboardsService — ownership checks (widgets/widget_settings are `parent`-scoped, unlike dashboards)', () => {
  it('updateWidget throws ForbiddenError when the widget belongs to a different user', async () => {
    const repo = fakeDashboardsRepository({
      findWidgetById: () => Promise.resolve(widgetRow({ createdBy: '999' })),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () =>
        service.updateWidget('1', { x: 1, y: 1, w: 1, h: 1 })
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deleteWidget throws NotFoundError when the widget doesn't exist at all", async () => {
    const repo = fakeDashboardsRepository({ findWidgetById: () => Promise.resolve(undefined) });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.deleteWidget('999'))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleteWidgetSetting throws ForbiddenError when the setting's parent widget belongs to a different user", async () => {
    const repo = fakeDashboardsRepository({
      findSettingById: () => Promise.resolve(widgetSettingRow()),
      findWidgetById: () => Promise.resolve(widgetRow({ createdBy: '999' })),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.deleteWidgetSetting('1'))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('storeWidgetSettings closes the previously-zero ownership check on {widget} (new finding, Design notes)', async () => {
    const repo = fakeDashboardsRepository({
      findWidgetById: () => Promise.resolve(widgetRow({ createdBy: '999' })),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () =>
        service.storeWidgetSettings('1', {
          widgetName: undefined,
          graphInterval: undefined,
          widgetSettings: [],
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('DashboardsService — dashboards are auto-scoped (D-0068), but getUserDashboards/analytics still need the D-0062 explicit-403 pattern', () => {
  it("getUserDashboards throws ForbiddenError when {userId} doesn't match the caller (the extension would otherwise silently return the caller's own rows)", async () => {
    const repo = fakeDashboardsRepository({});
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.getUserDashboards('2'))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getUserDashboards succeeds when {userId} matches the caller', async () => {
    const repo = fakeDashboardsRepository({
      listSummariesByCreatedBy: () => Promise.resolve([dashboardRow()]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () => service.getUserDashboards('1'));
    expect(result).toHaveLength(1);
  });

  it('getAnalytics throws ForbiddenError for a non-caller ?user_id= (closed the same way as getUserDashboards, not dropped or silently ignored)', async () => {
    const repo = fakeDashboardsRepository({});
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.getAnalytics('2'))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updateDashboard/deleteDashboard throw NotFoundError for a dashboard the extension already filtered out', async () => {
    const repo = fakeDashboardsRepository({ findById: () => Promise.resolve(undefined) });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.updateDashboard('1', 'New name'))
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContextAsync(contextFor('1'), () => service.deleteDashboard('1'))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("createWidget throws ValidationError when dashboard_id doesn't resolve (matches Rule::exists('dashboards','id'))", async () => {
    const repo = fakeDashboardsRepository({ findById: () => Promise.resolve(undefined) });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () =>
        service.createWidget({ dashboardId: '999', x: 0, y: 0, w: 1, h: 1, type: 'value' })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("DashboardsService — offline threshold unified at 30min (D-0068's sibling decision)", () => {
  it('a device last seen 29 minutes ago is online; 31 minutes ago is offline and in active_in_last_24h too', async () => {
    // `getAnalytics` computes `now` internally (`new Date()`, not injectable)
    // — fixtures are relative to the real wall clock at test-run time, not a
    // fixed ISO string, so this doesn't depend on when the suite runs.
    const online = new Date(Date.now() - 29 * 60 * 1000);
    const offline = new Date(Date.now() - 31 * 60 * 1000);

    const repo = fakeDashboardsRepository({
      listDevicesForCaller: () =>
        Promise.resolve([
          { id: '1', name: 'Online Device', deviceUniqueIdentifier: 'dev-online' },
          { id: '2', name: 'Offline Device', deviceUniqueIdentifier: 'dev-offline' },
        ]),
      findLatestValueTimestamps: () =>
        Promise.resolve(
          new Map([
            ['dev-online', online],
            ['dev-offline', offline],
          ])
        ),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.getAnalytics(undefined)
    );

    expect(result.data.online_devices).toBe(1);
    expect(result.data.offline_devices).toBe(1);
    expect(result.data.recently_active_devices.map(d => d.device_unique_identifier)).toEqual([
      'dev-online',
    ]);
    expect(result.data.offline_devices_list.map(d => d.device_unique_identifier)).toEqual([
      'dev-offline',
    ]);
    // Both are within the separate, non-unified 24h window (Design notes).
    expect(result.data.active_in_last_24h).toBe(2);
  });

  it("a device never seen at all is offline and 'Never', not in active_in_last_24h", async () => {
    const repo = fakeDashboardsRepository({
      listDevicesForCaller: () =>
        Promise.resolve([{ id: '1', name: 'Silent Device', deviceUniqueIdentifier: 'dev-silent' }]),
      findLatestValueTimestamps: () => Promise.resolve(new Map()),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.getAnalytics(undefined)
    );

    expect(result.data.offline_devices).toBe(1);
    expect(result.data.offline_devices_list[0]?.last_heard).toBe('Never');
    expect(result.data.active_in_last_24h).toBe(0);
  });
});

describe('DashboardsService.getDashboard — widget-alert via the canonical evaluator (11.30, replaces checkIfAttributeInAlertForWidget)', () => {
  it("is_alert=1 when the widget's linked rule condition matches the latest device value", async () => {
    const repo = fakeDashboardsRepository({
      findByIdWithWidgets: () =>
        Promise.resolve({
          dashboard: dashboardRow(),
          widgets: [{ ...widgetRow(), settings: [widgetSettingRow()] }],
        }),
      findPreferenceLabel: () => Promise.resolve(undefined),
      findProductNameById: () => Promise.resolve('Sensor Product'),
      findDeviceById: () => Promise.resolve({ id: '10', deviceUniqueIdentifier: 'dev-10' }),
      findLatestDeviceValues: () => Promise.resolve({ temp: 42 }),
      findWidgetRuleConditions: () =>
        Promise.resolve([
          {
            selectedProduct: null,
            selectedAttribute: 'temp',
            selectedCondition: 'greater_than',
            conditionValue: '30',
            logicalOperator: 'and',
          },
        ]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () => service.getDashboard('1'));

    const widget = result.widgets[0];
    expect(widget?.values[0]).toEqual({ attribute_name: 'temp', attribute_value: 42, is_alert: 1 });
  });

  it('is_alert=0 when no active widgetRule() matches at all (empty-loop fallthrough, not a thrown error)', async () => {
    const repo = fakeDashboardsRepository({
      findByIdWithWidgets: () =>
        Promise.resolve({
          dashboard: dashboardRow(),
          widgets: [{ ...widgetRow(), settings: [widgetSettingRow()] }],
        }),
      findPreferenceLabel: () => Promise.resolve(undefined),
      findProductNameById: () => Promise.resolve('Sensor Product'),
      findDeviceById: () => Promise.resolve({ id: '10', deviceUniqueIdentifier: 'dev-10' }),
      findLatestDeviceValues: () => Promise.resolve({ temp: 42 }),
      findWidgetRuleConditions: () => Promise.resolve(undefined),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () => service.getDashboard('1'));

    expect(result.widgets[0]?.values[0]).toEqual({
      attribute_name: 'temp',
      attribute_value: 42,
      is_alert: 0,
    });
  });

  it('getDashboard throws NotFoundError for a dashboard the extension already filtered out (controller maps this to the frozen {error,status,code} 404)', async () => {
    const repo = fakeDashboardsRepository({
      findByIdWithWidgets: () => Promise.resolve(undefined),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () => service.getDashboard('999'))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DashboardsService.storeWidgetSettings — condition filter (D-0071, corrected after a live-testing finding)', () => {
  function storeOneCondition(condition: RuleCondition): Promise<unknown[]> {
    let capturedConditions: unknown[] = [];
    const repo = fakeDashboardsRepository({
      findWidgetById: () => Promise.resolve(widgetRow()),
      createSettingWithRule: params => {
        capturedConditions = params.conditions;
        return Promise.resolve({
          setting: widgetSettingRow(),
          rule: {
            id: 1n,
            user_id: 1n,
            name: null,
            execution_interval: null,
            allow_retriggering: null,
            severity: 'warning',
            conditions: [],
            actions: [],
            email_data: null,
            sms_data: null,
            notification_data: null,
            is_active: true,
            is_for_widget: true,
            is_for_rule_builder: false,
            is_for_building: false,
            is_for_all: false,
            deleted_at: null,
            last_triggered: null,
            created_at: null,
            updated_at: null,
          },
        });
      },
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    return runWithContextAsync(contextFor('1'), () =>
      service.storeWidgetSettings('1', {
        widgetName: undefined,
        graphInterval: undefined,
        widgetSettings: [
          {
            id: undefined,
            settings: undefined,
            attributes: undefined,
            yAxisLabel: undefined,
            device: undefined,
            data: undefined,
            unit: undefined,
            icon: undefined,
            decimal: undefined,
            showTimestamp: undefined,
            product: undefined,
            label: undefined,
            backgroundColor: undefined,
            valueColor: undefined,
            textColor: undefined,
            maxValue: undefined,
            tankType: undefined,
            graphType: undefined,
            enabled: undefined,
            conditions: [condition],
          },
        ],
      })
    ).then(() => capturedConditions);
  }

  it("keeps a product-less condition (selectedProduct: null) — a widget-setting's condition is naturally product-less in real usage; confirmed dropped-in-error via live-testing before this fix, D-0071", async () => {
    const conditions = await storeOneCondition({
      selectedProduct: null,
      selectedAttribute: 'temp',
      selectedCondition: 'greater_than',
      conditionValue: '10',
      logicalOperator: 'and',
    });

    expect(conditions).toHaveLength(1);
  });

  it('drops a condition with no selectedAttribute — the evaluator can never match without one', async () => {
    const conditions = await storeOneCondition({
      selectedProduct: null,
      selectedAttribute: null,
      selectedCondition: 'greater_than',
      conditionValue: '10',
      logicalOperator: 'and',
    });

    expect(conditions).toEqual([]);
  });

  it("drops a condition with no selectedCondition (the 'Please choose' unset sentinel)", async () => {
    const conditions = await storeOneCondition({
      selectedProduct: null,
      selectedAttribute: 'temp',
      selectedCondition: 'Please choose',
      conditionValue: '10',
      logicalOperator: 'and',
    });

    expect(conditions).toEqual([]);
  });
});

describe('DashboardsService.graphData — unauthenticated (no requireAuth, matches Laravel/openapi.yaml)', () => {
  it('aggregates summary-bucket rows per widget_setting, averaged and keyed by formatted duration', async () => {
    const repo = fakeDashboardsRepository({
      findWidgetsWithSettingsByIds: () =>
        Promise.resolve([
          {
            ...widgetRow({ id: '5' }),
            settings: [
              widgetSettingRow({ id: '1', device: '10', attributes: 'temp', graphType: 'bar' }),
            ],
          },
        ]),
      querySummaryBucket: () =>
        Promise.resolve([
          { period: '2026-01-05 10:00:00', avg: 10 },
          { period: '2026-01-05 10:00:00', avg: 20 },
        ]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await service.graphData({ '5': 'hourly' });

    expect(result.data['widget_5']).toHaveLength(1);
    // Two rows for the same formatted "HH:mm" bucket average to 15.
    expect(result.data['widget_5']?.[0]?.data['10:00']).toBe(15);
    expect(result.data['widget_5']?.[0]?.graph_type).toBe('bar');
  });

  it('throws ValidationError when graph_widget is empty, NotFoundError when no widgets match', async () => {
    const repo = fakeDashboardsRepository({
      findWidgetsWithSettingsByIds: () => Promise.resolve([]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(service.graphData({})).rejects.toBeInstanceOf(ValidationError);
    await expect(service.graphData({ '1': 'daily' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DashboardsService.getPacketHistory — status is a post-fetch filter (Design notes' documented quirk, not fixed)", () => {
  it('summary.total reflects the pre-status-filter DB total even though packets[]/summary.alerts/normal are status-filtered', async () => {
    const packets = [
      {
        id: '1',
        productId: '1',
        protocolId: '1',
        productName: 'P',
        protocolName: 'Pr',
        deviceIds: [],
        jsonBody: { temp: 99 },
        token: null,
        createdAt: new Date(),
      },
      {
        id: '2',
        productId: '1',
        protocolId: '1',
        productName: 'P',
        protocolName: 'Pr',
        deviceIds: [],
        jsonBody: { temp: 1 },
        token: null,
        createdAt: new Date(),
      },
    ];
    const repo = fakeDashboardsRepository({
      queryPacketHistory: () => Promise.resolve({ items: packets, total: 2 }),
      listActiveNonWidgetRulesForUser: () =>
        Promise.resolve([
          {
            id: '1',
            conditions: [
              {
                selectedProduct: null,
                selectedAttribute: 'temp',
                selectedCondition: 'greater_than',
                conditionValue: '50',
                logicalOperator: 'and',
              },
            ],
          },
        ]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.getPacketHistory(
        {
          productId: undefined,
          protocolId: undefined,
          deviceId: undefined,
          status: 'alert',
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          perPage: 15,
          page: 1,
          sortBy: 'created_at',
          sortDir: 'desc',
        },
        'https://example.com/api/dashboard/packet-history'
      )
    );

    expect(result.data.packets).toHaveLength(1);
    expect(result.data.summary).toEqual({ total: 2, alerts: 1, normal: 0 });
    // pagination.total is unaffected by the status filter — the DB total.
    expect(result.data.pagination.total).toBe(2);
  });
});

describe('DashboardsService — global stats / monthly registrations (requireAuth only, genuinely global by design)', () => {
  it('countAll/listAllUsers pass straight through', async () => {
    const repo = fakeDashboardsRepository({
      countAll: () =>
        Promise.resolve({
          users: 1,
          user_devices: 1,
          products: 1,
          companies: 1,
          device_packets: 1,
          widgets: 1,
          device_values: 1,
          device: 1,
        }),
      listAllUsersBasic: () =>
        Promise.resolve([
          { id: '1', firstName: 'A', lastName: 'B', email: 'a@example.com', createdAt: null },
        ]),
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const counts = await runWithContextAsync(contextFor('1'), () => service.countAll());
    expect(counts.users).toBe(1);

    const users = await runWithContextAsync(contextFor('1'), () => service.listAllUsers());
    expect(users[0]).toMatchObject({ id: 1, first_name: 'A' });
  });

  it('monthlyRegistrations computes a startDate for every range value, and none for undefined', async () => {
    let capturedStart: Date | undefined;
    const repo = fakeDashboardsRepository({
      monthlyRegistrations: startDate => {
        capturedStart = startDate;
        return Promise.resolve([]);
      },
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    await runWithContextAsync(contextFor('1'), () => service.monthlyRegistrations('1w'));
    expect(capturedStart).toBeInstanceOf(Date);

    await runWithContextAsync(contextFor('1'), () => service.monthlyRegistrations(undefined));
    expect(capturedStart).toBeUndefined();

    for (const range of ['1m', '3m', '6m', '1y'] as const) {
      await runWithContextAsync(contextFor('1'), () => service.monthlyRegistrations(range));
      expect(capturedStart).toBeInstanceOf(Date);
    }
  });
});

describe("DashboardsService.updateWidgetSettings — each entry's own id drives create-vs-update (URL param genuinely unused)", () => {
  it('an entry with no id creates a new setting under widget_id; an entry with id updates and, with conditions present, also updates the rule', async () => {
    const updateRuleCalls: unknown[] = [];
    const repo = fakeDashboardsRepository({
      findWidgetById: () => Promise.resolve(widgetRow()),
      createSettingWithRule: () =>
        Promise.resolve({
          setting: widgetSettingRow({ id: '2' }),
          rule: {
            id: 2n,
            user_id: 1n,
            name: null,
            execution_interval: null,
            allow_retriggering: null,
            severity: 'warning',
            conditions: [],
            actions: [],
            email_data: null,
            sms_data: null,
            notification_data: null,
            is_active: true,
            is_for_widget: true,
            is_for_rule_builder: false,
            is_for_building: false,
            is_for_all: false,
            deleted_at: null,
            last_triggered: null,
            created_at: null,
            updated_at: null,
          },
        }),
      findSettingById: () => Promise.resolve(widgetSettingRow({ id: '1', ruleId: '9' })),
      updateSettingRow: () => Promise.resolve(widgetSettingRow({ id: '1' })),
      updateRuleForSetting: (ruleId, params) => {
        updateRuleCalls.push({ ruleId, params });
        return Promise.resolve(undefined);
      },
    });
    const service = new DashboardsService(repo, fakeProductsLookup());

    const result = await runWithContextAsync(contextFor('1'), () =>
      service.updateWidgetSettings({
        widgetId: '1',
        widgetName: 'Batch',
        graphInterval: undefined,
        widgetSettings: [
          {
            id: '1',
            settings: undefined,
            attributes: 'temp',
            yAxisLabel: undefined,
            device: undefined,
            data: undefined,
            unit: undefined,
            icon: undefined,
            decimal: undefined,
            showTimestamp: undefined,
            product: undefined,
            label: undefined,
            backgroundColor: undefined,
            valueColor: undefined,
            textColor: undefined,
            maxValue: undefined,
            tankType: undefined,
            graphType: undefined,
            enabled: undefined,
            conditions: [
              {
                selectedProduct: null,
                selectedAttribute: 'temp',
                selectedCondition: 'greater_than',
                conditionValue: '5',
                logicalOperator: 'and',
              },
            ],
          },
          {
            id: undefined,
            settings: undefined,
            attributes: 'humidity',
            yAxisLabel: undefined,
            device: undefined,
            data: undefined,
            unit: undefined,
            icon: undefined,
            decimal: undefined,
            showTimestamp: undefined,
            product: undefined,
            label: undefined,
            backgroundColor: undefined,
            valueColor: undefined,
            textColor: undefined,
            maxValue: undefined,
            tankType: undefined,
            graphType: undefined,
            enabled: undefined,
            conditions: undefined,
          },
        ],
      })
    );

    expect(result.data).toHaveLength(2);
    expect(updateRuleCalls).toHaveLength(1);
    expect(updateRuleCalls[0]).toMatchObject({ ruleId: '9' });
  });

  it('throws ValidationError when a no-id entry is submitted with no widget_id', async () => {
    const repo = fakeDashboardsRepository({});
    const service = new DashboardsService(repo, fakeProductsLookup());

    await expect(
      runWithContextAsync(contextFor('1'), () =>
        service.updateWidgetSettings({
          widgetId: undefined,
          widgetName: undefined,
          graphInterval: undefined,
          widgetSettings: [
            {
              id: undefined,
              settings: undefined,
              attributes: undefined,
              yAxisLabel: undefined,
              device: undefined,
              data: undefined,
              unit: undefined,
              icon: undefined,
              decimal: undefined,
              showTimestamp: undefined,
              product: undefined,
              label: undefined,
              backgroundColor: undefined,
              valueColor: undefined,
              textColor: undefined,
              maxValue: undefined,
              tankType: undefined,
              graphType: undefined,
              enabled: undefined,
              conditions: undefined,
            },
          ],
        })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
