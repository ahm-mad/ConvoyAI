import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { runAsSystemAsync } from '../../platform/http/request-context.js';
import { toDashboard, toRawPacketRow, toWidget, toWidgetSetting } from './dashboards.mapper.js';
import type {
  Dashboard,
  ListDashboardsQuery,
  PacketHistoryQuery,
  RawPacketRow,
  RuleCondition,
  Widget,
  WidgetSetting,
  WidgetSettingEntryInput,
} from './dashboards.types.js';

const RAW_PACKET_INCLUDE = {
  products: { select: { id: true, name: true } },
  protocols_raw_packet_values_protocol_idToprotocols: { select: { id: true, name: true } },
} as const;

/**
 * All Prisma access for module 2.7 — `dashboards`/`widgets`/`widget_settings`,
 * plus the narrow cross-cutting reads `show()`/`packetHistory()`/`analytics()`/
 * `graph-data` need (`rules`, `device_values`, `devices`,
 * `product_attribute_preferences`, `products`, `protocols`). Directly
 * touching another module's table (not its repository class) matches
 * `products.repository.ts`'s own `ensureRuleAndWidget` precedent (D-0048) —
 * ARCHITECTURE.md §2's "modules do not import each other's repositories"
 * is about not importing another module's TS class, not about which
 * Prisma models a repository may query.
 *
 * `dashboards` is `user`-ruled (D-0068, `created_by`) — auto-scoped.
 * `widgets`/`widget_settings` are `parent`-ruled (`tenant-rules.ts`) — this
 * class's own methods below do the manual ownership scoping/verification
 * the service layer needs, following the exact discipline `tenant-rules.ts`'s
 * doc comment requires for `parent` tables.
 */
export class DashboardsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // Dashboards CRUD (DashboardController equivalent)
  // ===========================================================================

  private async queryDashboards(
    query: ListDashboardsQuery,
    unscoped: boolean
  ): Promise<{ items: Dashboard[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (query.search) where['name'] = { contains: query.search, mode: 'insensitive' };
    const skip = (query.page - 1) * query.perPage;

    const run = () =>
      Promise.all([
        this.prisma.dashboards.findMany({
          where,
          orderBy: { [query.sortBy]: query.sortOrder },
          skip,
          take: query.perPage,
        }),
        this.prisma.dashboards.count({ where }),
      ]);
    const [rows, total] = unscoped ? await runAsSystemAsync(run) : await run();
    return { items: rows.map(toDashboard), total };
  }

  /** `GET /dashboards` — real context, tenant-scoping extension auto-filters to the caller's own rows. */
  async listForCaller(query: ListDashboardsQuery): Promise<{ items: Dashboard[]; total: number }> {
    return this.queryDashboards(query, false);
  }

  /** `GET /admin/dashboard` — the one deliberate cross-tenant escape hatch this module owns (Design notes: separate service method, not a boolean flag). */
  async listAllAdmin(query: ListDashboardsQuery): Promise<{ items: Dashboard[]; total: number }> {
    return this.queryDashboards(query, true);
  }

  async findById(id: string): Promise<Dashboard | undefined> {
    const row = await this.prisma.dashboards.findUnique({ where: { id: BigInt(id) } });
    return row ? toDashboard(row) : undefined;
  }

  /** `user_id` placeholder in `data` — overwritten by the extension with the caller's real id (D-0068), matching every other module's create() convention. */
  async create(userId: string, name: string): Promise<Dashboard> {
    const row = await this.prisma.dashboards.create({ data: { name, created_by: BigInt(userId) } });
    return toDashboard(row);
  }

  /** `{name?}` only — closes the mass-assignment half of the ownership bug (Design notes: `$dashboard->update($request->all())` is not ported). */
  async update(id: string, name: string | undefined): Promise<Dashboard> {
    const row = await this.prisma.dashboards.update({
      where: { id: BigInt(id) },
      data: name !== undefined ? { name } : {},
    });
    return toDashboard(row);
  }

  /**
   * `widgets.dashboard_id -> dashboards.id` is `ON DELETE SET NULL`
   * (`reference/schema.sql` line 2180, verified before writing this — not
   * assumed) — Postgres automatically orphans this dashboard's widgets
   * (`dashboard_id = NULL`) rather than deleting them, and `Dashboard.php`
   * has no `booted()` hook of its own (verified — no app-level cascade
   * either). A dashboard-less widget is already a normal state in this
   * schema (D-0048's stub widgets), so a plain row delete replicates
   * Laravel exactly; no explicit widget cleanup belongs here.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.dashboards.delete({ where: { id: BigInt(id) } });
  }

  /** `GET /user/{userId}/dashboards` — `{id,name}` only. Real context; the extension forces `created_by = context.userId` regardless of what's passed, so the service's own `{userId} === context.userId` check (D-0062 pattern) is what turns a mismatch into a clear 403 rather than a confusing empty list. */
  async listSummariesByCreatedBy(): Promise<Dashboard[]> {
    const rows = await this.prisma.dashboards.findMany({
      select: { id: true, name: true, created_by: true, created_at: true, updated_at: true },
    });
    return rows.map(toDashboard);
  }

  async findByIdWithWidgets(
    id: string
  ): Promise<
    { dashboard: Dashboard; widgets: (Widget & { settings: WidgetSetting[] })[] } | undefined
  > {
    const row = await this.prisma.dashboards.findUnique({
      where: { id: BigInt(id) },
      include: { widgets: { include: { widget_settings: true } } },
    });
    if (!row) return undefined;
    const { widgets, ...dashboardRow } = row;
    return {
      dashboard: toDashboard(dashboardRow),
      widgets: widgets.map(w => {
        const { widget_settings, ...widgetRow } = w;
        return { ...toWidget(widgetRow), settings: widget_settings.map(toWidgetSetting) };
      }),
    };
  }

  // ===========================================================================
  // Widgets (WidgetController equivalent) — `parent:dashboards`, manual scoping
  // ===========================================================================

  async findWidgetById(id: string): Promise<Widget | undefined> {
    const row = await this.prisma.widgets.findUnique({ where: { id: BigInt(id) } });
    return row ? toWidget(row) : undefined;
  }

  /** Closes `WidgetController::index()`'s unscoped-listing bug (Design notes) — `widgets.created_by` is NOT NULL and always the real owner (D-0048's stub-widget convention), so scoping by it directly is simpler than joining through `dashboards`. */
  async listWidgetsForCaller(userId: string): Promise<Widget[]> {
    const rows = await this.prisma.widgets.findMany({ where: { created_by: BigInt(userId) } });
    return rows.map(toWidget);
  }

  async createWidget(
    userId: string,
    input: { dashboardId: string; x: number; y: number; w: number; h: number; type: string }
  ): Promise<Widget> {
    const row = await this.prisma.widgets.create({
      data: {
        dashboard_id: BigInt(input.dashboardId),
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        type: input.type,
        created_by: BigInt(userId),
      },
    });
    return toWidget(row);
  }

  async updateWidget(
    id: string,
    input: { x: number; y: number; w: number; h: number }
  ): Promise<Widget> {
    const row = await this.prisma.widgets.update({
      where: { id: BigInt(id) },
      data: { x: input.x, y: input.y, w: input.w, h: input.h },
    });
    return toWidget(row);
  }

  /**
   * Two-level cascade, verified against the real FK `onDelete` clauses
   * before writing this (`reference/schema.sql`), not assumed:
   * `widget_settings.widget_id -> widgets.id` is `ON DELETE RESTRICT` —
   * Postgres actively **rejects** deleting a widget while any
   * `widget_settings` row still references it, so deleting those first is
   * mandatory, not optional (matches `Widget::booted()`'s deleting hook's
   * intent, stronger than it since Laravel's MySQL apparently allows the
   * unsafe order). `widget_settings.rule_id -> rules.id` is `ON DELETE
   * CASCADE` — deleting the linked rule auto-deletes its `widget_settings`
   * row, so one delete per setting (its rule) does the full two-level job
   * without a second explicit `widget_settings` delete call.
   */
  async deleteWidgetCascade(id: string): Promise<void> {
    const settings = await this.prisma.widget_settings.findMany({
      where: { widget_id: BigInt(id) },
      select: { rule_id: true },
    });
    for (const setting of settings) {
      await this.prisma.rules.delete({ where: { id: setting.rule_id } });
    }
    await this.prisma.widgets.delete({ where: { id: BigInt(id) } });
  }

  async findWidgetWithSettings(
    id: string
  ): Promise<{ widget: Widget; settings: WidgetSetting[] } | undefined> {
    const widget = await this.findWidgetById(id);
    if (!widget) return undefined;
    const rows = await this.prisma.widget_settings.findMany({ where: { widget_id: BigInt(id) } });
    return { widget, settings: rows.map(toWidgetSetting) };
  }

  // ===========================================================================
  // Widget settings (WidgetSettingController equivalent) — `parent:widgets`
  // ===========================================================================

  async findSettingById(id: string): Promise<WidgetSetting | undefined> {
    const row = await this.prisma.widget_settings.findUnique({ where: { id: BigInt(id) } });
    return row ? toWidgetSetting(row) : undefined;
  }

  /** Closes `WidgetSettingController::index()`'s unscoped-listing bug — joins through the owning `widgets` row's `created_by` (the `parent` table's own tenant column), the discipline `tenant-rules.ts`'s doc comment describes for every `parent`-ruled table. */
  async listSettingsForCaller(userId: string): Promise<WidgetSetting[]> {
    const rows = await this.prisma.widget_settings.findMany({
      where: { widgets: { created_by: BigInt(userId) } },
    });
    return rows.map(toWidgetSetting);
  }

  /** `RuleBuilderController`-style condition/actions/is_for_widget|is_for_all creation — `WidgetSettingController::store`'s per-entry `Rule::create` + `WidgetSetting::save()`, one rule per entry (not one per widget). Returns the raw created `rules` row too — the response includes the bare Eloquent `Rule` model (`api-catalog.md`), not a shaped subset. */
  async createSettingWithRule(params: {
    userId: string;
    widgetId: string;
    ruleName: string | undefined;
    graphInterval: string | null;
    conditions: RuleCondition[];
    isForBoth: boolean;
    entry: WidgetSettingEntryInput;
  }): Promise<{
    setting: WidgetSetting;
    rule: Awaited<ReturnType<AppPrismaClient['rules']['create']>>;
  }> {
    const rule = await this.prisma.rules.create({
      data: {
        user_id: BigInt(params.userId),
        name: params.ruleName ?? null,
        conditions: params.conditions as unknown as object,
        // Laravel: `'actions' => $settingData['actions'] ?? []` — a PHP
        // empty array serializes as JSON `[]`, not `{}`; matched exactly,
        // though never read back (this rule's `is_for_rule_builder` stays
        // false, so the rule-actions worker's own query never selects it).
        actions: [] as unknown as object,
        is_active: true,
        is_for_widget: params.isForBoth ? false : true,
        is_for_all: params.isForBoth,
      },
    });
    const row = await this.prisma.widget_settings.create({
      data: {
        widget_id: BigInt(params.widgetId),
        rule_id: rule.id,
        widget_name: params.ruleName ?? null,
        graph_interval: params.graphInterval,
        ...entryToWriteData(params.entry),
      },
    });
    return { setting: toWidgetSetting(row), rule };
  }

  /**
   * `WidgetSettingController::update`'s `WidgetSetting::find($id)->update($entry)`
   * branch — a real 404 here instead of Laravel's null-method-call error on a
   * missing id (Design notes). `widgetName`/`graphInterval` are always written
   * (Laravel: `$entry['widget_name'] = $validated['widget_name'] ??
   * $entry['widget_name'] ?? null` — but `widget_settings.*.widget_name` isn't
   * itself a validated per-entry field, so this always resolves to just the
   * top-level `$validated['widget_name'] ?? null`; same reasoning for
   * `graph_interval`), unlike the rest of `entry`'s fields.
   */
  async updateSettingRow(
    id: string,
    widgetName: string | null,
    graphInterval: string | null,
    entry: WidgetSettingEntryInput
  ): Promise<WidgetSetting> {
    const row = await this.prisma.widget_settings.update({
      where: { id: BigInt(id) },
      data: { widget_name: widgetName, graph_interval: graphInterval, ...entryToWriteData(entry) },
    });
    return toWidgetSetting(row);
  }

  /** `WidgetSettingController::updateOrCreateRule` — only called when `conditions` is present on the entry. */
  async updateRuleForSetting(
    ruleId: string,
    params: { conditions: RuleCondition[]; isForBoth: boolean; ruleName: string | undefined }
  ): Promise<void> {
    await this.prisma.rules.update({
      where: { id: BigInt(ruleId) },
      data: {
        conditions: params.conditions as unknown as object,
        // Laravel: `'actions' => $entry['actions'] ?? []` — `actions` is
        // never a validated `widget_settings.*` field, so this is always `[]`.
        actions: [] as unknown as object,
        is_active: true,
        is_for_widget: params.isForBoth ? false : true,
        is_for_all: params.isForBoth,
        ...(params.ruleName !== undefined ? { name: params.ruleName } : {}),
      },
    });
  }

  /** `WidgetSetting::booted()`'s deleting hook: delete the linked `Rule` — `ON DELETE CASCADE` (`widget_settings.rule_id -> rules.id`) removes this `widget_settings` row automatically, same reasoning as `deleteWidgetCascade`. */
  async deleteSettingCascade(id: string): Promise<void> {
    const setting = await this.prisma.widget_settings.findUnique({
      where: { id: BigInt(id) },
      select: { rule_id: true },
    });
    if (!setting) return;
    await this.prisma.rules.delete({ where: { id: setting.rule_id } });
  }

  // ===========================================================================
  // Cross-cutting reads for show()/packetHistory()/analytics()
  // ===========================================================================

  /** `WidgetSetting::widgetRule()` — the linked Rule, only if active and for-widget-or-all. */
  /**
   * `Device::widgetsettings()` (`hasMany(WidgetSetting::class, 'device', 'id')`) filtered to
   * `whereNotNull('attributes')`, `with('widget')` — module 2.4's per-packet widget-alert loop
   * (D-0139). `widget_settings`/`widgets` are `parent`-ruled (tenant-rules.ts): no request context
   * required, matches `runAsSystemAsync`'s reasoning elsewhere in this file even though it isn't
   * strictly needed for a parent-ruled model — kept for consistency with the rest of the module.
   */
  async listWidgetSettingsForDevice(deviceId: string): Promise<
    {
      widgetId: string;
      dashboardId: string | null;
      ruleId: string;
      attributeKey: string;
      product: string | null;
    }[]
  > {
    if (!/^\d+$/.test(deviceId)) return [];
    const rows = await runAsSystemAsync(() =>
      this.prisma.widget_settings.findMany({
        where: { device: deviceId, attributes: { not: null } },
        select: {
          widget_id: true,
          rule_id: true,
          attributes: true,
          product: true,
          widgets: { select: { dashboard_id: true } },
        },
      })
    );
    return rows
      .filter((r): r is typeof r & { attributes: string } => r.attributes !== null)
      .map(r => ({
        widgetId: r.widget_id.toString(),
        dashboardId: r.widgets.dashboard_id?.toString() ?? null,
        ruleId: r.rule_id.toString(),
        attributeKey: r.attributes,
        product: r.product,
      }));
  }

  async findWidgetRuleConditions(ruleId: string): Promise<RuleCondition[] | undefined> {
    const row = await this.prisma.rules.findFirst({
      where: {
        id: BigInt(ruleId),
        is_active: true,
        OR: [{ is_for_widget: true }, { is_for_all: true }],
      },
      select: { conditions: true },
    });
    return row ? ((row.conditions as unknown as RuleCondition[] | null) ?? []) : undefined;
  }

  /** `DeviceValue::where('device_id')->where('device_unique_identifier')->latest('created_at')->first()` — `device_values` is `parent`-ruled (unscoped by the extension), matched by hand exactly as Laravel filters it. Tie-break by `id desc` too (same reasoning as `devices.repository.ts`'s `latestDeviceValueTimestamp` — `created_at` truncates to whole seconds). */
  async findLatestDeviceValues(
    deviceId: string,
    deviceUniqueIdentifier: string
  ): Promise<Record<string, unknown> | undefined> {
    const row = await this.prisma.device_values.findFirst({
      where: { device_id: BigInt(deviceId), device_unique_identifier: deviceUniqueIdentifier },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { values: true },
    });
    if (!row) return undefined;
    return typeof row.values === 'object' && row.values !== null && !Array.isArray(row.values)
      ? row.values
      : {};
  }

  /**
   * Real context — `devices` is `user`-ruled, so this naturally returns
   * `undefined` for a device the caller doesn't own (a stricter, safer
   * read than Laravel's unscoped `Device::find()`, same reasoning as
   * every other tightened read in this project). `widget_settings.device`/
   * `.product` are plain free-form varchars, not real FKs (Design notes) —
   * not guaranteed numeric, so a non-numeric value returns "not found"
   * instead of throwing on `BigInt()`.
   */
  async findDeviceById(
    id: string
  ): Promise<{ id: string; deviceUniqueIdentifier: string } | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await this.prisma.devices.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, device_unique_identifier: true },
    });
    return row
      ? { id: row.id.toString(), deviceUniqueIdentifier: row.device_unique_identifier }
      : undefined;
  }

  /** `product` on `widget_settings` is a plain varchar id, not a real FK (Design notes) — a manual lookup, not a Prisma relation. */
  async findProductNameById(id: string): Promise<string | undefined> {
    if (!/^\d+$/.test(id)) return undefined;
    const row = await runAsSystemAsync(() =>
      this.prisma.products.findUnique({ where: { id: BigInt(id) }, select: { name: true } })
    );
    return row?.name;
  }

  /** `ProductAttributePreference::with('preferenceSetting')->where(product_id,user_id,attribute_key)->first()` — the caller's own label override, if set. */
  async findPreferenceLabel(
    productId: string,
    userId: string,
    attributeKey: string
  ): Promise<string | undefined> {
    if (!/^\d+$/.test(productId)) return undefined;
    const row = await this.prisma.product_attribute_preferences.findFirst({
      where: {
        product_id: BigInt(productId),
        user_id: BigInt(userId),
        attribute_key: attributeKey,
      },
      include: { product_attribute_preference_settings: { select: { label: true }, take: 1 } },
    });
    return row?.product_attribute_preference_settings[0]?.label ?? undefined;
  }

  // ===========================================================================
  // Packet history (`GET /dashboard/packet-history`)
  // ===========================================================================

  /**
   * `whereJsonContains('device_ids', $deviceId)` and the free-text `json_body`
   * search both need raw SQL against Postgres (JSONB containment / an explicit
   * `::text` cast — Design notes flag both as needing verification, not
   * assumed to behave like MySQL). Run as one combined id-filter query so the
   * two predicates AND correctly, then intersect via `id: {in: [...]}` in the
   * main type-safe query below — this is the module's first runtime raw-SQL
   * use in this codebase, kept narrowly scoped to just these two predicates.
   */
  private async rawFilterIds(
    userId: string,
    deviceId: string | undefined,
    search: string | undefined
  ): Promise<bigint[] | undefined> {
    if (!deviceId && !search) return undefined;
    const conditions: Prisma.Sql[] = [Prisma.sql`user_id = ${BigInt(userId)}`];
    if (deviceId) conditions.push(Prisma.sql`device_ids @> ${JSON.stringify([deviceId])}::jsonb`);
    if (search) conditions.push(Prisma.sql`json_body::text ILIKE ${`%${search}%`}`);
    const rows = await this.prisma.$queryRaw<{ id: bigint }[]>(
      Prisma.sql`SELECT id FROM raw_packet_values WHERE ${Prisma.join(conditions, ' AND ')}`
    );
    return rows.map(r => r.id);
  }

  async queryPacketHistory(
    userId: string,
    query: PacketHistoryQuery
  ): Promise<{ items: RawPacketRow[]; total: number }> {
    const filterIds = await this.rawFilterIds(userId, query.deviceId, query.search);

    // D-0136 (user-directed deviation from Laravel): rows with no packet body are not packets — they are the empty placeholders
    // created when an ingestion token is generated and not yet filled by a first packet (`json_body` NULL, `{}` or `[]`).
    // Hidden here, in the query, so `total`, pagination and the summary counts stay consistent.
    const where: Record<string, unknown> = {
      AND: [
        { NOT: { json_body: { equals: Prisma.DbNull } } },
        { NOT: { json_body: { equals: Prisma.JsonNull } } },
        { NOT: { json_body: { equals: [] } } },
        { NOT: { json_body: { equals: {} } } },
      ],
    };
    if (query.productId) where['product_id'] = BigInt(query.productId);
    if (query.protocolId) where['protocol_id'] = BigInt(query.protocolId);
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);
    if (Object.keys(createdAt).length > 0) where['created_at'] = createdAt;
    if (filterIds !== undefined) where['id'] = { in: filterIds };

    const skip = (query.page - 1) * query.perPage;
    const [rows, total] = await Promise.all([
      this.prisma.raw_packet_values.findMany({
        where,
        include: RAW_PACKET_INCLUDE,
        orderBy: { [query.sortBy]: query.sortDir },
        skip,
        take: query.perPage,
      }),
      this.prisma.raw_packet_values.count({ where }),
    ]);
    return { items: rows.map(toRawPacketRow), total };
  }

  /** `Rule::where('user_id')->where('is_active',true)->where('is_for_widget',0)->get()` — `rules` is `user`-ruled, so the extension already forces `user_id = context.userId` here; the packet-history alert-state pool (Design notes: canonical evaluator's own per-condition product scoping replaces the group-by-first-condition heuristic). */
  async listActiveNonWidgetRulesForUser(): Promise<{ id: string; conditions: RuleCondition[] }[]> {
    const rows = await this.prisma.rules.findMany({
      where: { is_active: true, is_for_widget: false },
      select: { id: true, conditions: true },
    });
    return rows.map(r => ({
      id: r.id.toString(),
      conditions: (r.conditions as unknown as RuleCondition[] | null) ?? [],
    }));
  }

  // ===========================================================================
  // Analytics (`GET /dashboard/analytics`)
  // ===========================================================================

  async listDevicesForCaller(): Promise<
    { id: string; name: string; deviceUniqueIdentifier: string }[]
  > {
    const rows = await this.prisma.devices.findMany({
      select: { id: true, name: true, device_unique_identifier: true },
    });
    return rows.map(d => ({
      id: d.id.toString(),
      name: d.name,
      deviceUniqueIdentifier: d.device_unique_identifier,
    }));
  }

  /** Latest `device_values` row per device, batched in one query via `DISTINCT ON` rather than one query per device. */
  async findLatestValueTimestamps(deviceUniqueIdentifiers: string[]): Promise<Map<string, Date>> {
    if (deviceUniqueIdentifiers.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { device_unique_identifier: string; created_at: Date | null }[]
    >(
      Prisma.sql`
        SELECT DISTINCT ON (device_unique_identifier) device_unique_identifier, created_at
        FROM device_values
        WHERE device_unique_identifier IN (${Prisma.join(deviceUniqueIdentifiers)})
        ORDER BY device_unique_identifier, created_at DESC, id DESC
      `
    );
    const map = new Map<string, Date>();
    for (const row of rows) {
      if (row.created_at) map.set(row.device_unique_identifier, row.created_at);
    }
    return map;
  }

  // ===========================================================================
  // Global stats (`/stats/count-all`, `/users/all`, `/users/monthly-registrations`)
  // — genuinely global by design (api-catalog.md), not a bug: runAsSystemAsync
  // is the "explicit and named" escape hatch ARCHITECTURE.md §6 calls for.
  // ===========================================================================

  async countAll(): Promise<{
    users: number;
    user_devices: number;
    products: number;
    companies: number;
    device_packets: number;
    widgets: number;
    device_values: number;
    device: number;
  }> {
    return runAsSystemAsync(async () => {
      const [
        users,
        userDevices,
        products,
        companies,
        devicePackets,
        widgets,
        deviceValues,
        device,
      ] = await Promise.all([
        this.prisma.users.count(),
        this.prisma.user_devices.count(),
        this.prisma.products.count(),
        this.prisma.companies.count(),
        this.prisma.device_packets.count(),
        this.prisma.widgets.count(),
        this.prisma.device_values.count(),
        this.prisma.devices.count(),
      ]);
      return {
        users,
        user_devices: userDevices,
        products,
        companies,
        device_packets: devicePackets,
        widgets,
        device_values: deviceValues,
        device,
      };
    });
  }

  async listAllUsersBasic(): Promise<
    { id: string; firstName: string; lastName: string; email: string; createdAt: Date | null }[]
  > {
    const rows = await runAsSystemAsync(() =>
      this.prisma.users.findMany({
        select: { id: true, first_name: true, last_name: true, email: true, created_at: true },
        orderBy: { created_at: 'desc' },
      })
    );
    return rows.map(u => ({
      id: u.id.toString(),
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      createdAt: u.created_at,
    }));
  }

  async monthlyRegistrations(
    startDate: Date | undefined
  ): Promise<{ month: string; total: number }[]> {
    const rows = await runAsSystemAsync(() =>
      startDate
        ? this.prisma.$queryRaw<{ year: number; month: number; total: bigint }[]>(
            Prisma.sql`SELECT EXTRACT(YEAR FROM created_at)::int AS year, EXTRACT(MONTH FROM created_at)::int AS month, COUNT(*) AS total FROM users WHERE created_at >= ${startDate} GROUP BY year, month ORDER BY year, month`
          )
        : this.prisma.$queryRaw<{ year: number; month: number; total: bigint }[]>(
            Prisma.sql`SELECT EXTRACT(YEAR FROM created_at)::int AS year, EXTRACT(MONTH FROM created_at)::int AS month, COUNT(*) AS total FROM users GROUP BY year, month ORDER BY year, month`
          )
    );
    return rows.map(r => ({
      month: `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`,
      total: Number(r.total),
    }));
  }

  // ===========================================================================
  // `POST /widgets/graph-data` (`HomeController::getAssetDeviceDataByWidget`)
  // ===========================================================================

  async findWidgetsWithSettingsByIds(
    ids: string[]
  ): Promise<(Widget & { settings: WidgetSetting[] })[]> {
    const rows = await runAsSystemAsync(() =>
      this.prisma.widgets.findMany({
        where: { id: { in: ids.map(id => BigInt(id)) } },
        include: { widget_settings: true },
      })
    );
    return rows.map(w => {
      const { widget_settings, ...widgetRow } = w;
      return { ...toWidget(widgetRow), settings: widget_settings.map(toWidgetSetting) };
    });
  }

  /**
   * One of the 4 `device_value_summaries_{hourly,daily,weekly,monthly}`
   * tables (D-0020 — plain tables today, become continuous aggregates in
   * 2.8; reading them as plain tables is not blocked on that). Each
   * interval gets its own literal `Prisma.sql` (no dynamic identifier
   * interpolation — table name is never derived from request input).
   * `hour`/`day` are real `timestamp`/`date` columns (compared against real
   * `Date` params); `week`/`month` are plain `varchar` (schema.prisma,
   * verified before writing this) — Laravel's own `whereBetween` compares
   * them against `Y-m-d`-formatted strings regardless of the column's real
   * semantics (`HomeController::getAssetDeviceDataByWidget`), so `weekStart`/
   * `weekEnd`/`monthStart`/`monthEnd` are pre-formatted strings, matched
   * byte-for-byte rather than "fixed" — these tables' actual population is
   *2.8's job (KNOWN_ISSUES 11.8), out of scope here. `widget_settings.device`
   * is a plain varchar (Design notes) that may not be numeric; a non-numeric
   * value can never match the summary tables' real `BigInt` `device_id`
   * column, so it returns no rows rather than throwing.
   */
  async querySummaryBucket(params: {
    interval: 'hourly' | 'daily' | 'weekly' | 'monthly';
    deviceId: string;
    attribute: string;
    rangeStart: Date;
    rangeEnd: Date;
    formattedStart: string;
    formattedEnd: string;
  }): Promise<{ period: string; avg: number | null }[]> {
    if (!/^\d+$/.test(params.deviceId)) return [];
    const deviceId = BigInt(params.deviceId);

    const query = {
      hourly: Prisma.sql`SELECT hour::text AS period, avg FROM device_value_summaries_hourly WHERE device_id = ${deviceId} AND attribute_type = ${params.attribute} AND hour BETWEEN ${params.rangeStart} AND ${params.rangeEnd} ORDER BY hour`,
      daily: Prisma.sql`SELECT day::text AS period, avg FROM device_value_summaries_daily WHERE device_id = ${deviceId} AND attribute_type = ${params.attribute} AND day BETWEEN ${params.rangeStart} AND ${params.rangeEnd} ORDER BY day`,
      weekly: Prisma.sql`SELECT week AS period, avg FROM device_value_summaries_weekly WHERE device_id = ${deviceId} AND attribute_type = ${params.attribute} AND week BETWEEN ${params.formattedStart} AND ${params.formattedEnd} ORDER BY week`,
      monthly: Prisma.sql`SELECT month AS period, avg FROM device_value_summaries_monthly WHERE device_id = ${deviceId} AND attribute_type = ${params.attribute} AND month BETWEEN ${params.formattedStart} AND ${params.formattedEnd} ORDER BY month`,
    }[params.interval];
    const rows = await runAsSystemAsync(() =>
      this.prisma.$queryRaw<{ period: string; avg: number | null }[]>(query)
    );
    return rows;
  }
}

/** Shared write-data mapper for `widget_settings`'s ~18 free-form optional fields (create + update, `entry.conditions` handled separately by the caller). */
function entryToWriteData(entry: WidgetSettingEntryInput): Record<string, unknown> {
  return {
    ...(entry.settings !== undefined ? { settings: entry.settings } : {}),
    ...(entry.attributes !== undefined ? { attributes: entry.attributes } : {}),
    ...(entry.yAxisLabel !== undefined ? { y_axis_label: entry.yAxisLabel } : {}),
    ...(entry.device !== undefined ? { device: entry.device } : {}),
    ...(entry.data !== undefined ? { data: entry.data } : {}),
    ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
    ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
    ...(entry.decimal !== undefined ? { decimal: entry.decimal } : {}),
    ...(entry.showTimestamp !== undefined ? { show_timestamp: entry.showTimestamp } : {}),
    ...(entry.product !== undefined ? { product: entry.product } : {}),
    ...(entry.label !== undefined ? { label: entry.label } : {}),
    ...(entry.backgroundColor !== undefined ? { background_color: entry.backgroundColor } : {}),
    ...(entry.valueColor !== undefined ? { value_color: entry.valueColor } : {}),
    ...(entry.textColor !== undefined ? { text_color: entry.textColor } : {}),
    ...(entry.maxValue !== undefined ? { max_value: entry.maxValue } : {}),
    ...(entry.tankType !== undefined ? { tank_type: entry.tankType } : {}),
    ...(entry.graphType !== undefined ? { graph_type: entry.graphType } : {}),
  };
}
