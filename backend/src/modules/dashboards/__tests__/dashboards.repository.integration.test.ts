import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { DashboardsRepository } from '../dashboards.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers D-0068's
 * `dashboards` tenant scoping, the two-level cascade-delete behavior
 * (widget -> widget_settings -> rule, verified against the real FK
 * `onDelete` clauses per `11-dashboards.md`'s acceptance criteria), the
 * `widgets`/`widget_settings` `index()` unscoped-listing fixes, and the
 * `packet-history` `device_id` JSONB-containment filter (the specific
 * 11.31 regression this module's task file calls out as needing a golden
 * pair, not an assumption).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@dashboards-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Dashboards Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: companyId,
    },
  });
}

async function seedProduct(companyId: bigint, createdBy: bigint, label: string) {
  return rawPrisma.products.create({
    data: {
      name: `Product ${label}${MARK}`,
      status: 'active',
      company_id: companyId,
      created_by: createdBy,
    },
  });
}

async function seedProtocol(label: string) {
  return rawPrisma.protocols.create({
    data: { name: `Protocol ${label}${MARK}`, category: 'transport' },
  });
}

async function seedDevice(productId: bigint, userId: bigint, label: string) {
  return rawPrisma.devices.create({
    data: {
      device_unique_identifier: `dev-${label}${MARK}`,
      name: `Device ${label}`,
      status: 'active',
      location: '',
      tags: '',
      product_id: productId,
      user_id: userId,
    },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const testUsers = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testUserIds = testUsers.map(u => u.id);
  const testCompanies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map(c => c.id);
  const testProducts = await rawPrisma.products.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);
  const testProtocols = await rawPrisma.protocols.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const testProtocolIds = testProtocols.map(p => p.id);
  const testDashboards = await rawPrisma.dashboards.findMany({
    where: { created_by: { in: testUserIds } },
    select: { id: true },
  });
  const testDashboardIds = testDashboards.map(d => d.id);
  const testWidgets = await rawPrisma.widgets.findMany({
    where: { created_by: { in: testUserIds } },
    select: { id: true },
  });
  const testWidgetIds = testWidgets.map(w => w.id);
  const testSettings = await rawPrisma.widget_settings.findMany({
    where: { widget_id: { in: testWidgetIds } },
    select: { id: true, rule_id: true },
  });
  const testSettingIds = testSettings.map(s => s.id);
  const testRuleIds = testSettings.map(s => s.rule_id);
  const testDevices = await rawPrisma.devices.findMany({
    where: { device_unique_identifier: { contains: MARK } },
    select: { id: true, device_unique_identifier: true },
  });
  const testDeviceIds = testDevices.map(d => d.id);

  await rawPrisma.widget_settings.deleteMany({ where: { id: { in: testSettingIds } } });
  await rawPrisma.rules.deleteMany({
    where: { OR: [{ id: { in: testRuleIds } }, { user_id: { in: testUserIds } }] },
  });
  await rawPrisma.widgets.deleteMany({ where: { id: { in: testWidgetIds } } });
  await rawPrisma.dashboards.deleteMany({ where: { id: { in: testDashboardIds } } });
  await rawPrisma.raw_packet_values.deleteMany({ where: { user_id: { in: testUserIds } } });
  await rawPrisma.device_values.deleteMany({
    where: { device_unique_identifier: { contains: MARK } },
  });
  await rawPrisma.device_value_summaries_daily.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  // `devices` cascades on `product_id -> products.id` (ON DELETE CASCADE) — no explicit devices.deleteMany needed.
  await rawPrisma.protocols.deleteMany({ where: { id: { in: testProtocolIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('DashboardsRepository (real Postgres)', () => {
  it("dashboards is user-scoped via created_by (D-0068): create() sets it from the caller's context, findById for another user returns undefined", async () => {
    const company = await seedCompany('a');
    const owner = await seedUser(company.id, 'a-owner');
    const other = await seedUser(company.id, 'a-other');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(owner.id.toString(), company.id.toString()),
      () => repo.create(owner.id.toString(), "Owner's Dashboard")
    );
    expect(dashboard.createdBy).toBe(owner.id.toString());

    const asOther = await runWithContextAsync(
      contextFor(other.id.toString(), company.id.toString()),
      () => repo.findById(dashboard.id)
    );
    expect(asOther).toBeUndefined();

    const asOwner = await runWithContextAsync(
      contextFor(owner.id.toString(), company.id.toString()),
      () => repo.findById(dashboard.id)
    );
    expect(asOwner?.id).toBe(dashboard.id);
  });

  it('GET /admin/dashboard equivalent (listAllAdmin): sees dashboards across users, unlike listForCaller', async () => {
    const company = await seedCompany('b');
    const userA = await seedUser(company.id, 'b-a');
    const userB = await seedUser(company.id, 'b-b');
    const repo = new DashboardsRepository(prisma);

    await runWithContextAsync(contextFor(userA.id.toString(), company.id.toString()), () =>
      repo.create(userA.id.toString(), `A's Dashboard${MARK}`)
    );
    await runWithContextAsync(contextFor(userB.id.toString(), company.id.toString()), () =>
      repo.create(userB.id.toString(), `B's Dashboard${MARK}`)
    );

    const asUserA = await runWithContextAsync(
      contextFor(userA.id.toString(), company.id.toString()),
      () =>
        repo.listForCaller({ search: MARK, sortBy: 'id', sortOrder: 'asc', page: 1, perPage: 50 })
    );
    expect(asUserA.total).toBe(1);

    const adminView = await runWithContextAsync(
      contextFor(userA.id.toString(), company.id.toString()),
      () =>
        repo.listAllAdmin({ search: MARK, sortBy: 'id', sortOrder: 'asc', page: 1, perPage: 50 })
    );
    expect(adminView.total).toBe(2);
  });

  it('dashboard delete: widgets.dashboard_id is SET NULL, not cascade-deleted (verified FK, not app-level cascade)', async () => {
    const company = await seedCompany('c');
    const user = await seedUser(company.id, 'c');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'To be deleted')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });

    await runWithContextAsync(contextFor(user.id.toString(), company.id.toString()), () =>
      repo.delete(dashboard.id)
    );

    const survivingWidget = await repo.findWidgetById(widget.id);
    expect(survivingWidget).toBeDefined();
    expect(survivingWidget?.dashboardId).toBeNull();
  });

  it("listWidgetsForCaller/listSettingsForCaller are scoped by created_by (closes WidgetController/WidgetSettingController's unscoped index() bugs)", async () => {
    const company = await seedCompany('d');
    const userA = await seedUser(company.id, 'd-a');
    const userB = await seedUser(company.id, 'd-b');
    const repo = new DashboardsRepository(prisma);

    const dashboardA = await runWithContextAsync(
      contextFor(userA.id.toString(), company.id.toString()),
      () => repo.create(userA.id.toString(), 'A')
    );
    const widgetA = await repo.createWidget(userA.id.toString(), {
      dashboardId: dashboardA.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const settingA = await runWithContextAsync(
      contextFor(userA.id.toString(), company.id.toString()),
      () =>
        repo.createSettingWithRule({
          userId: userA.id.toString(),
          widgetId: widgetA.id,
          ruleName: 'A rule',
          graphInterval: null,
          conditions: [],
          isForBoth: false,
          entry: {
            id: undefined,
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
            conditions: undefined,
          },
        })
    );

    const dashboardB = await runWithContextAsync(
      contextFor(userB.id.toString(), company.id.toString()),
      () => repo.create(userB.id.toString(), 'B')
    );
    await repo.createWidget(userB.id.toString(), {
      dashboardId: dashboardB.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });

    const widgetsForA = await repo.listWidgetsForCaller(userA.id.toString());
    expect(widgetsForA.map(w => w.id)).toEqual([widgetA.id]);

    const settingsForA = await repo.listSettingsForCaller(userA.id.toString());
    expect(settingsForA.map(s => s.id)).toEqual([settingA.setting.id]);
  });

  it('two-level cascade delete: deleteWidgetCascade removes the widget_settings row AND its rule (RESTRICT prevents a naive widget delete first, CASCADE from rule->widget_settings does the rest)', async () => {
    const company = await seedCompany('e');
    const user = await seedUser(company.id, 'e');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Cascade test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());
    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Cascade rule',
        graphInterval: null,
        conditions: [],
        isForBoth: false,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );

    // Verify the RESTRICT FK really is enforced — a naive widget delete
    // while a widget_settings row still references it must fail.
    await expect(rawPrisma.widgets.delete({ where: { id: BigInt(widget.id) } })).rejects.toThrow();

    await runWithContextAsync(ctx, () => repo.deleteWidgetCascade(widget.id));

    expect(await repo.findWidgetById(widget.id)).toBeUndefined();
    expect(await repo.findSettingById(created.setting.id)).toBeUndefined();
    const rule = await rawPrisma.rules.findUnique({ where: { id: created.rule.id } });
    expect(rule).toBeNull();
  });

  it("deleteSettingCascade: deleting a widget_setting's linked rule also removes the widget_setting row (ON DELETE CASCADE), matching WidgetSetting::booted()'s deleting hook", async () => {
    const company = await seedCompany('f');
    const user = await seedUser(company.id, 'f');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Setting cascade test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());
    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Setting rule',
        graphInterval: null,
        conditions: [],
        isForBoth: false,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );

    await runWithContextAsync(ctx, () => repo.deleteSettingCascade(created.setting.id));

    expect(await repo.findSettingById(created.setting.id)).toBeUndefined();
    const rule = await rawPrisma.rules.findUnique({ where: { id: created.rule.id } });
    expect(rule).toBeNull();
    // The widget itself must survive (only its one setting+rule were removed).
    expect(await repo.findWidgetById(widget.id)).toBeDefined();
  });

  it('D-0136: packet-history hides empty placeholder rows (json_body NULL / [] / {}) and keeps total/pagination consistent', async () => {
    const company = await seedCompany('ph');
    const user = await seedUser(company.id, 'ph');
    const product = await seedProduct(company.id, user.id, 'ph');
    const protocol = await seedProtocol('ph');
    const repo = new DashboardsRepository(prisma);
    const base = { product_id: product.id, protocol_id: protocol.id, user_id: user.id };

    await rawPrisma.raw_packet_values.create({ data: { ...base } }); // json_body NULL — a fresh placeholder
    await rawPrisma.raw_packet_values.create({ data: { ...base, json_body: [] } });
    await rawPrisma.raw_packet_values.create({ data: { ...base, json_body: {} } });
    await rawPrisma.raw_packet_values.create({ data: { ...base, json_body: { temp: 10 } } });
    await rawPrisma.raw_packet_values.create({ data: { ...base, json_body: { temp: 20 } } });

    const result = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.queryPacketHistory(user.id.toString(), {
          productId: undefined,
          protocolId: undefined,
          deviceId: undefined,
          status: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          perPage: 1,
          page: 1,
          sortBy: 'id',
          sortDir: 'asc',
        })
    );

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.jsonBody).toEqual({ temp: 10 });
  });

  it('packet-history device_id filter (11.31 regression): matches only packets whose device_ids JSONB array contains the requested id', async () => {
    const company = await seedCompany('g');
    const user = await seedUser(company.id, 'g');
    const product = await seedProduct(company.id, user.id, 'g');
    const protocol = await seedProtocol('g');
    const repo = new DashboardsRepository(prisma);

    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: product.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: ['dev-1', 'dev-2'],
        json_body: { temp: 10 },
      },
    });
    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: product.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: ['dev-3'],
        json_body: { temp: 20 },
      },
    });

    const filtered = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.queryPacketHistory(user.id.toString(), {
          productId: undefined,
          protocolId: undefined,
          deviceId: 'dev-1',
          status: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          perPage: 10,
          page: 1,
          sortBy: 'created_at',
          sortDir: 'desc',
        })
    );
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.deviceIds).toEqual(['dev-1', 'dev-2']);

    const unfiltered = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.queryPacketHistory(user.id.toString(), {
          productId: undefined,
          protocolId: undefined,
          deviceId: undefined,
          status: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          perPage: 10,
          page: 1,
          sortBy: 'created_at',
          sortDir: 'desc',
        })
    );
    expect(unfiltered.total).toBe(2);
  });

  it("packet-history search filter: matches free text inside json_body via ::text cast (Postgres, not MySQL's raw LIKE-on-JSON)", async () => {
    const company = await seedCompany('h');
    const user = await seedUser(company.id, 'h');
    const product = await seedProduct(company.id, user.id, 'h');
    const protocol = await seedProtocol('h');
    const repo = new DashboardsRepository(prisma);

    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: product.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: [],
        json_body: { sensor: 'needle-in-haystack' },
      },
    });
    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: product.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: [],
        json_body: { sensor: 'other' },
      },
    });

    const found = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.queryPacketHistory(user.id.toString(), {
          productId: undefined,
          protocolId: undefined,
          deviceId: undefined,
          status: undefined,
          search: 'needle-in-haystack',
          dateFrom: undefined,
          dateTo: undefined,
          perPage: 10,
          page: 1,
          sortBy: 'created_at',
          sortDir: 'desc',
        })
    );
    expect(found.total).toBe(1);
  });

  it("updateWidget/findWidgetWithSettings: widget position updates and the widget's settings round-trip", async () => {
    const company = await seedCompany('i');
    const user = await seedUser(company.id, 'i');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Widget update test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });

    const updated = await repo.updateWidget(widget.id, { x: 9, y: 9, w: 2, h: 2 });
    expect(updated).toMatchObject({ x: 9, y: 9, w: 2, h: 2 });

    const ctx = contextFor(user.id.toString(), company.id.toString());
    await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Setting',
        graphInterval: 'hourly',
        conditions: [],
        isForBoth: false,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );

    const withSettings = await repo.findWidgetWithSettings(widget.id);
    expect(withSettings?.settings).toHaveLength(1);
    expect(withSettings?.settings[0]?.graphInterval).toBe('hourly');
  });

  it("findDeviceById/findProductNameById/findPreferenceLabel: show()'s cross-cutting lookups", async () => {
    const company = await seedCompany('j');
    const user = await seedUser(company.id, 'j');
    const product = await seedProduct(company.id, user.id, 'j');
    const device = await seedDevice(product.id, user.id, 'j');
    const repo = new DashboardsRepository(prisma);

    const ctx = contextFor(user.id.toString(), company.id.toString());
    const foundDevice = await runWithContextAsync(ctx, () =>
      repo.findDeviceById(device.id.toString())
    );
    expect(foundDevice?.deviceUniqueIdentifier).toBe(device.device_unique_identifier);

    const productName = await repo.findProductNameById(product.id.toString());
    expect(productName).toBe(product.name);

    // Non-numeric varchar values (widget_settings.device/.product aren't real FKs) must not throw.
    expect(await repo.findDeviceById('not-a-number')).toBeUndefined();
    expect(await repo.findProductNameById('not-a-number')).toBeUndefined();

    await rawPrisma.product_attribute_preferences.create({
      data: { product_id: product.id, user_id: user.id, attribute_key: 'temp', is_selected: true },
    });
    const noSettingLabel = await runWithContextAsync(ctx, () =>
      repo.findPreferenceLabel(product.id.toString(), user.id.toString(), 'temp')
    );
    // A preference row exists but has no linked preference_settings row -> undefined (falls through to the attribute-key fallback in the service).
    expect(noSettingLabel).toBeUndefined();
  });

  it('findWidgetRuleConditions (widgetRule()): only an active, is_for_widget|is_for_all rule counts', async () => {
    const company = await seedCompany('k');
    const user = await seedUser(company.id, 'k');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Widget rule test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());
    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Widget rule',
        graphInterval: null,
        conditions: [
          {
            selectedProduct: null,
            selectedAttribute: 'temp',
            selectedCondition: 'greater_than',
            conditionValue: '10',
            logicalOperator: 'and',
          },
        ],
        isForBoth: false,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );

    const conditions = await runWithContextAsync(ctx, () =>
      repo.findWidgetRuleConditions(created.setting.ruleId)
    );
    expect(conditions).toHaveLength(1);

    await rawPrisma.rules.update({ where: { id: created.rule.id }, data: { is_active: false } });
    expect(
      await runWithContextAsync(ctx, () => repo.findWidgetRuleConditions(created.setting.ruleId))
    ).toBeUndefined();
  });

  it("listDevicesForCaller/findLatestValueTimestamps: analytics' device + latest-value batch read", async () => {
    const company = await seedCompany('l');
    const user = await seedUser(company.id, 'l');
    const product = await seedProduct(company.id, user.id, 'l');
    const device = await seedDevice(product.id, user.id, 'l');
    const repo = new DashboardsRepository(prisma);

    // `created_at` is the Timescale hypertable's partition column (D-0057) —
    // the DB enforces NOT NULL on it even though `schema.prisma` (frozen
    // separately from the additive raw-SQL migration) still shows it nullable.
    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 1 },
        created_at: new Date(),
      },
    });

    const devices = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.listDevicesForCaller()
    );
    expect(devices.map(d => d.id)).toContain(device.id.toString());

    const timestamps = await repo.findLatestValueTimestamps([device.device_unique_identifier]);
    expect(timestamps.has(device.device_unique_identifier)).toBe(true);
  });

  it('countAll/listAllUsersBasic/monthlyRegistrations: genuinely global, not company-scoped (matches Laravel, not a bug)', async () => {
    const companyA = await seedCompany('m-a');
    const userA = await seedUser(companyA.id, 'm-a');
    const companyB = await seedCompany('m-b');
    await seedUser(companyB.id, 'm-b');
    const repo = new DashboardsRepository(prisma);

    const counts = await runWithContextAsync(
      contextFor(userA.id.toString(), companyA.id.toString()),
      () => repo.countAll()
    );
    expect(counts.users).toBeGreaterThanOrEqual(2);

    const allUsers = await repo.listAllUsersBasic();
    expect(allUsers.length).toBeGreaterThanOrEqual(2);

    const registrations = await repo.monthlyRegistrations(undefined);
    expect(Array.isArray(registrations)).toBe(true);
  });

  it("findWidgetsWithSettingsByIds/querySummaryBucket: graph-data's system-context reads", async () => {
    const company = await seedCompany('n');
    const user = await seedUser(company.id, 'n');
    const product = await seedProduct(company.id, user.id, 'n');
    const device = await seedDevice(product.id, user.id, 'n');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Graph data test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());
    await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Graph setting',
        graphInterval: null,
        conditions: [],
        isForBoth: false,
        entry: {
          id: undefined,
          settings: undefined,
          attributes: 'temp',
          yAxisLabel: undefined,
          device: device.id.toString(),
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
      })
    );

    // No request context at all — graph-data is unauthenticated (Scope's resolved judgment call).
    const found = await repo.findWidgetsWithSettingsByIds([widget.id]);
    expect(found).toHaveLength(1);
    expect(found[0]?.settings).toHaveLength(1);

    const today = new Date();
    await rawPrisma.device_value_summaries_daily.create({
      data: { device_id: device.id, attribute_type: 'temp', avg: 21.5, day: today, data_points: 3 },
    });

    const bucket = await repo.querySummaryBucket({
      interval: 'daily',
      deviceId: device.id.toString(),
      attribute: 'temp',
      rangeStart: new Date(today.getTime() - 24 * 60 * 60 * 1000),
      rangeEnd: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      formattedStart: '',
      formattedEnd: '',
    });
    expect(bucket).toHaveLength(1);
    expect(bucket[0]?.avg).toBe(21.5);

    // A non-numeric widget_settings.device value must not throw.
    expect(
      await repo.querySummaryBucket({
        interval: 'daily',
        deviceId: 'not-a-number',
        attribute: 'temp',
        rangeStart: today,
        rangeEnd: today,
        formattedStart: '',
        formattedEnd: '',
      })
    ).toEqual([]);
  });

  it("updateSettingRow/updateRuleForSetting: the update() batch's existing-entry branch (widget_name/graph_interval always written, conditions only touched when present)", async () => {
    const company = await seedCompany('o');
    const user = await seedUser(company.id, 'o');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Update settings test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());
    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Original',
        graphInterval: null,
        conditions: [],
        isForBoth: false,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );

    const updatedSetting = await repo.updateSettingRow(
      created.setting.id,
      'Renamed batch',
      'hourly',
      {
        id: created.setting.id,
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
      }
    );
    expect(updatedSetting).toMatchObject({
      widgetName: 'Renamed batch',
      graphInterval: 'hourly',
      attributes: 'humidity',
    });

    await runWithContextAsync(ctx, () =>
      repo.updateRuleForSetting(created.setting.ruleId, {
        conditions: [
          {
            selectedProduct: null,
            selectedAttribute: 'humidity',
            selectedCondition: 'less_than',
            conditionValue: '20',
            logicalOperator: 'and',
          },
        ],
        isForBoth: true,
        ruleName: 'Renamed rule',
      })
    );
    const rule = await rawPrisma.rules.findUnique({ where: { id: created.rule.id } });
    expect(rule).toMatchObject({ name: 'Renamed rule', is_for_widget: false, is_for_all: true });
    expect(rule?.conditions).toHaveLength(1);
  });

  it("findLatestDeviceValues: show()'s per-widget-setting latest value lookup, both hit and miss", async () => {
    const company = await seedCompany('p');
    const user = await seedUser(company.id, 'p');
    const product = await seedProduct(company.id, user.id, 'p');
    const device = await seedDevice(product.id, user.id, 'p');
    const repo = new DashboardsRepository(prisma);

    const miss = await repo.findLatestDeviceValues(
      device.id.toString(),
      device.device_unique_identifier
    );
    expect(miss).toBeUndefined();

    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 77 },
        created_at: new Date(),
      },
    });

    const hit = await repo.findLatestDeviceValues(
      device.id.toString(),
      device.device_unique_identifier
    );
    expect(hit).toEqual({ temp: 77 });
  });

  it("entryToWriteData: every one of widget_settings' ~16 free-form optional fields round-trips when present (not just the omitted-field branches every other test exercises)", async () => {
    const company = await seedCompany('q');
    const user = await seedUser(company.id, 'q');
    const repo = new DashboardsRepository(prisma);

    const dashboard = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.create(user.id.toString(), 'Full entry test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });
    const ctx = contextFor(user.id.toString(), company.id.toString());

    const fullEntry = {
      id: undefined,
      settings: { foo: 'bar' },
      attributes: 'temp',
      yAxisLabel: 'Temperature',
      device: '10',
      data: 'raw',
      unit: 'C',
      icon: 'thermometer',
      decimal: '2',
      showTimestamp: true,
      product: '20',
      label: 'Temp',
      backgroundColor: '#fff',
      valueColor: '#000',
      textColor: '#111',
      maxValue: '100',
      tankType: 'round',
      graphType: 'bar',
      enabled: undefined,
      conditions: undefined,
    };

    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: 'Full entry rule',
        graphInterval: 'hourly',
        conditions: [],
        isForBoth: false,
        entry: fullEntry,
      })
    );

    expect(created.setting).toMatchObject({
      settings: { foo: 'bar' },
      attributes: 'temp',
      yAxisLabel: 'Temperature',
      device: '10',
      data: 'raw',
      unit: 'C',
      icon: 'thermometer',
      decimal: '2',
      showTimestamp: true,
      product: '20',
      backgroundColor: '#fff',
      valueColor: '#000',
      textColor: '#111',
      maxValue: '100',
      tankType: 'round',
      graphType: 'bar',
    });

    // updateSettingRow goes through the same entryToWriteData helper — exercise it there too.
    const updated = await repo.updateSettingRow(created.setting.id, 'Updated batch name', 'daily', {
      ...fullEntry,
      attributes: 'humidity',
    });
    expect(updated.attributes).toBe('humidity');
    expect(updated.graphInterval).toBe('daily');
  });

  it('not-found branches: findByIdWithWidgets/findWidgetWithSettings/findSettingById/findDeviceById/deleteSettingCascade all handle a nonexistent-but-well-formed numeric id', async () => {
    const company = await seedCompany('u');
    const user = await seedUser(company.id, 'u');
    const repo = new DashboardsRepository(prisma);
    const ctx = contextFor(user.id.toString(), company.id.toString());

    expect(
      await runWithContextAsync(ctx, () => repo.findByIdWithWidgets('999999999'))
    ).toBeUndefined();
    expect(await repo.findWidgetWithSettings('999999999')).toBeUndefined();
    expect(await repo.findSettingById('999999999')).toBeUndefined();
    expect(await runWithContextAsync(ctx, () => repo.findDeviceById('999999999'))).toBeUndefined();
    // A no-op, not a throw, when the setting doesn't exist.
    await expect(
      runWithContextAsync(ctx, () => repo.deleteSettingCascade('999999999'))
    ).resolves.toBeUndefined();
  });

  it("listDashboards without a search term (the unfiltered branch) — plus update()'s name-omitted branch", async () => {
    const company = await seedCompany('r');
    const user = await seedUser(company.id, 'r');
    const repo = new DashboardsRepository(prisma);
    const ctx = contextFor(user.id.toString(), company.id.toString());

    const dashboard = await runWithContextAsync(ctx, () =>
      repo.create(user.id.toString(), `Unfiltered${MARK}`)
    );

    const unfiltered = await runWithContextAsync(ctx, () =>
      repo.listForCaller({
        search: undefined,
        sortBy: 'id',
        sortOrder: 'asc',
        page: 1,
        perPage: 50,
      })
    );
    expect(unfiltered.total).toBeGreaterThanOrEqual(1);

    // update() with name omitted — the `data: {}` branch, not `{name}`.
    const untouched = await runWithContextAsync(ctx, () => repo.update(dashboard.id, undefined));
    expect(untouched.name).toBe(`Unfiltered${MARK}`);
  });

  it('createSettingWithRule/updateRuleForSetting with ruleName omitted and isForBoth=true — the is_for_widget=false/is_for_all=true branch, and the ?? null fallback for name/widget_name', async () => {
    const company = await seedCompany('s');
    const user = await seedUser(company.id, 's');
    const repo = new DashboardsRepository(prisma);
    const ctx = contextFor(user.id.toString(), company.id.toString());

    const dashboard = await runWithContextAsync(ctx, () =>
      repo.create(user.id.toString(), 'isForBoth test')
    );
    const widget = await repo.createWidget(user.id.toString(), {
      dashboardId: dashboard.id,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      type: 'value',
    });

    const created = await runWithContextAsync(ctx, () =>
      repo.createSettingWithRule({
        userId: user.id.toString(),
        widgetId: widget.id,
        ruleName: undefined,
        graphInterval: null,
        conditions: [],
        isForBoth: true,
        entry: {
          id: undefined,
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
          conditions: undefined,
        },
      })
    );
    expect(created.rule.name).toBeNull();
    expect(created.rule.is_for_widget).toBe(false);
    expect(created.rule.is_for_all).toBe(true);
    expect(created.setting.widgetName).toBeNull();

    await runWithContextAsync(ctx, () =>
      repo.updateRuleForSetting(created.setting.ruleId, {
        conditions: [],
        isForBoth: true,
        ruleName: undefined,
      })
    );
    const ruleAfter = await rawPrisma.rules.findUnique({ where: { id: created.rule.id } });
    // ruleName omitted -> name left unchanged (still null), not overwritten.
    expect(ruleAfter?.name).toBeNull();
    expect(ruleAfter?.is_for_widget).toBe(false);
    expect(ruleAfter?.is_for_all).toBe(true);
  });

  it("queryPacketHistory's productId/protocolId/dateFrom/dateTo filters", async () => {
    const company = await seedCompany('t');
    const user = await seedUser(company.id, 't');
    const productA = await seedProduct(company.id, user.id, 't-a');
    const productB = await seedProduct(company.id, user.id, 't-b');
    const protocol = await seedProtocol('t');
    const repo = new DashboardsRepository(prisma);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: productA.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: [],
        json_body: { temp: 1 }, // a real body — empty ones are hidden placeholders (D-0136)
        created_at: new Date(),
      },
    });
    await rawPrisma.raw_packet_values.create({
      data: {
        product_id: productB.id,
        protocol_id: protocol.id,
        user_id: user.id,
        device_ids: [],
        json_body: { temp: 2 },
        created_at: new Date(),
      },
    });

    const byProduct = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.queryPacketHistory(user.id.toString(), {
          productId: productA.id.toString(),
          protocolId: protocol.id.toString(),
          deviceId: undefined,
          status: undefined,
          search: undefined,
          dateFrom: yesterday.toISOString(),
          dateTo: tomorrow.toISOString(),
          perPage: 10,
          page: 1,
          sortBy: 'created_at',
          sortDir: 'desc',
        })
    );
    expect(byProduct.total).toBe(1);
    expect(byProduct.items[0]?.productId).toBe(productA.id.toString());
  });

  it('findLatestValueTimestamps with an empty array short-circuits without a query; monthlyRegistrations with a real startDate', async () => {
    const repo = new DashboardsRepository(prisma);

    expect(await repo.findLatestValueTimestamps([])).toEqual(new Map());

    const rows = await repo.monthlyRegistrations(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    expect(Array.isArray(rows)).toBe(true);
  });
});
