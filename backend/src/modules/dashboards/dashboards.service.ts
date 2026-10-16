import { DateTime } from 'luxon';
import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { evaluate } from '../../shared/utils/rule-condition-evaluator.js';
import { mapPayload } from '../../shared/utils/payload-mapper.js';
import { isOffline } from '../../shared/utils/offline.js';
import { fromJsDate, toRelative } from '../../shared/utils/dates.js';
import type { DashboardsRepository } from './dashboards.repository.js';
import type { DashboardsProductsLookup } from './lookups.js';
import {
  toBareRuleResponse,
  toDateTimeString,
  toPacketHistoryItemResponse,
  toWidgetSettingResponse,
  toWidgetShowResponse,
  type EnrichedWidget,
  type WidgetShowEntry,
} from './dashboards.mapper.js';
import type {
  Dashboard,
  ListDashboardsQuery,
  PacketHistoryQuery,
  RuleCondition,
  StoreWidgetSettingsInput,
  UpdateWidgetSettingsInput,
  Widget,
} from './dashboards.types.js';

function requireContext() {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  return context;
}

/**
 * D-0071 (found via live-testing, not the Open questions' original "widen
 * to match 09-rules" lean — that lean was tried first and found wrong):
 * requires `selectedAttribute` (the evaluator can never match without one —
 * `evaluateSingleCondition` returns `false` immediately if it's absent, so
 * persisting such a condition would be permanently dead) and
 * `selectedCondition`, but **not** `selectedProduct`. A widget-setting's
 * condition is naturally product-less in real usage — the widget-setting
 * already carries its own `product`/`device` context, so the frontend
 * never asks the user to redundantly pick a product again inside the
 * condition — and the canonical evaluator's own D-0059 semantics treat an
 * absent `selectedProduct` as "applies regardless of product," a valid,
 * intentional state, not an error one. Porting 09-rules' fuller filter
 * (which also requires `selectedProduct`) verbatim silently dropped every
 * such condition at save time, confirmed live against the real server
 * before this fix (a `POST /widgets/{widget}/settings` condition with
 * `selectedProduct: null` came back with the created rule's `conditions`
 * empty). Laravel's own `WidgetSettingController` filter only checks
 * `selectedCondition` — this is a small, deliberate strengthening beyond
 * that (still requiring `selectedAttribute`), not a full revert to it.
 */
function filterValidConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.filter(
    c =>
      c.selectedAttribute !== undefined &&
      c.selectedAttribute !== null &&
      c.selectedAttribute !== 'Please choose' &&
      !!c.selectedCondition &&
      c.selectedCondition !== 'Please choose'
  );
}

type SummaryInterval = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** `Carbon::parse(...)->format(...)` per interval — wrapped like Laravel's own `try { ... } catch (\Throwable $e) { continue; }`, an unparseable period is skipped, not thrown. */
function formatSummaryDuration(interval: SummaryInterval, period: string): string | undefined {
  try {
    if (interval === 'hourly' || interval === 'daily') {
      const dt = DateTime.fromSQL(period, { zone: 'utc' });
      if (!dt.isValid) return undefined;
      return interval === 'hourly' ? dt.toFormat('HH:mm') : dt.toFormat('ccc');
    }
    if (interval === 'weekly') {
      const dt = DateTime.fromISO(period, { zone: 'utc' });
      return dt.isValid ? `week_${String(dt.weekNumber)}` : undefined;
    }
    const dt = DateTime.fromISO(`${period}-01`, { zone: 'utc' });
    return dt.isValid ? dt.toFormat('LLLL') : undefined;
  } catch {
    return undefined;
  }
}

/** Business logic for module 2.7 (ARCHITECTURE.md §2). */
export class DashboardsService {
  constructor(
    private readonly repo: DashboardsRepository,
    private readonly productsLookup: DashboardsProductsLookup
  ) {}

  // ===========================================================================
  // Dashboards CRUD
  // ===========================================================================

  async listDashboards(query: ListDashboardsQuery): Promise<{ items: Dashboard[]; total: number }> {
    requireContext();
    return this.repo.listForCaller(query);
  }

  /** `GET /admin/dashboard` — the module's one deliberate cross-tenant escape hatch, gated at the route by `requireRole("admin")`. */
  async listAdminDashboards(
    query: ListDashboardsQuery
  ): Promise<{ items: Dashboard[]; total: number }> {
    requireContext();
    return this.repo.listAllAdmin(query);
  }

  async createDashboard(name: string): Promise<Dashboard> {
    const context = requireContext();
    return this.repo.create(context.userId, name);
  }

  /**
   * `DashboardController::show()` — bare model, no envelope; 404 uses the
   * frozen contract's own oddball `{error,status,code}` shape, which the
   * controller builds directly on catching `NotFoundError` from here
   * (Design notes) rather than the standard error handler's envelope.
   */
  async getDashboard(id: string) {
    const context = requireContext();
    const result = await this.repo.findByIdWithWidgets(id);
    if (!result) throw new NotFoundError('Dashboard not found');

    const enrichedWidgets: EnrichedWidget[] = await Promise.all(
      result.widgets.map(async widget => {
        const settings = await Promise.all(
          widget.settings.map(async setting => {
            const label = await this.resolveSettingLabel(
              setting.product,
              setting.attributes,
              context.userId
            );
            const productName = setting.product
              ? ((await this.repo.findProductNameById(setting.product)) ?? null)
              : null;
            return { setting, label, productName };
          })
        );

        const values = await Promise.all(
          settings.map(async ({ setting, label }) => {
            if (!setting.device || !setting.attributes) {
              return { attribute_name: label, attribute_value: null, is_alert: 0 };
            }
            const device = await this.repo.findDeviceById(setting.device);
            if (!device) return { attribute_name: label, attribute_value: null, is_alert: 0 };

            const latestValues = await this.repo.findLatestDeviceValues(
              device.id,
              device.deviceUniqueIdentifier
            );
            if (!latestValues) return { attribute_name: label, attribute_value: null, is_alert: 0 };

            const value = latestValues[setting.attributes] ?? null;
            // `WidgetSetting::widgetRule()` — active AND (is_for_widget OR
            // is_for_all); no matching rule at all means "never in alert",
            // matching `checkIfAttributeInAlertForWidget`'s own empty-loop
            // fallthrough (verified against the real method — it's a plain
            // 3-arg signature; the 4th `$userId` argument at the call site
            // is silently dropped by PHP, never used for per-user filtering).
            const conditions = await this.repo.findWidgetRuleConditions(setting.ruleId);
            const isAlert = conditions
              ? evaluate(conditions, { [setting.attributes]: value }, setting.product ?? '').matched
              : false;

            return { attribute_name: label, attribute_value: value, is_alert: isAlert ? 1 : 0 };
          })
        );

        return { widget, settings, values };
      })
    );

    return { dashboard: result.dashboard, widgets: enrichedWidgets };
  }

  /**
   * `preference?.preferenceSetting?.label` if a matching
   * `ProductAttributePreference` exists for the caller, else the last
   * dot-segment of the attribute key, else the raw key — Laravel's `show()`
   * computes this same value twice (`$label` then `$widgetSetting->label`)
   * in a way that always resolves identically; simplified to one call, not
   * a behavior change (Design notes' label-resolution block, worked
   * through by hand before writing this).
   */
  private async resolveSettingLabel(
    product: string | null,
    attributeKey: string | null,
    userId: string
  ): Promise<string> {
    if (product && attributeKey) {
      const preferenceLabel = await this.repo.findPreferenceLabel(product, userId, attributeKey);
      if (preferenceLabel !== undefined) return preferenceLabel;
    }
    if (!attributeKey) return '';
    if (attributeKey.includes('.')) {
      const segments = attributeKey.split('.');
      return segments[segments.length - 1] ?? attributeKey;
    }
    return attributeKey;
  }

  /** `{name?}` only — the mass-assignment half of the ownership-bug fix (`$dashboard->update($request->all())` not ported, Design notes). */
  async updateDashboard(id: string, name: string | undefined): Promise<Dashboard> {
    requireContext();
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Dashboard not found');
    return this.repo.update(id, name);
  }

  async deleteDashboard(id: string): Promise<void> {
    requireContext();
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Dashboard not found');
    await this.repo.delete(id);
  }

  /**
   * `GET /user/{userId}/dashboards` — the tenant-scoping extension already
   * forces `created_by = context.userId` into every `dashboards` query
   * regardless of `{userId}`, so a mismatch can never actually leak another
   * user's rows; this check turns that into a clear 403 instead of a
   * confusing empty list (same D-0062 pattern as `GET /rules/users/{user}`).
   */
  async getUserDashboards(userId: string): Promise<Dashboard[]> {
    const context = requireContext();
    if (userId !== context.userId)
      throw new ForbiddenError("Unauthorized to view other users' dashboards");
    return this.repo.listSummariesByCreatedBy();
  }

  // ===========================================================================
  // Global stats / admin-adjacent endpoints (requireAuth only, matching Laravel)
  // ===========================================================================

  async countAll() {
    requireContext();
    return this.repo.countAll();
  }

  async listAllUsers() {
    requireContext();
    const users = await this.repo.listAllUsersBasic();
    return users.map(u => ({
      id: Number(u.id),
      first_name: u.firstName,
      last_name: u.lastName,
      email: u.email,
      created_at: u.createdAt,
    }));
  }

  async monthlyRegistrations(range: '1w' | '1m' | '3m' | '6m' | '1y' | undefined) {
    requireContext();
    const now = DateTime.utc();
    const startDate =
      range === '1w'
        ? now.minus({ weeks: 1 })
        : range === '1m'
          ? now.minus({ months: 1 })
          : range === '3m'
            ? now.minus({ months: 3 })
            : range === '6m'
              ? now.minus({ months: 6 })
              : range === '1y'
                ? now.minus({ years: 1 })
                : undefined;
    return this.repo.monthlyRegistrations(startDate?.toJSDate());
  }

  // ===========================================================================
  // Analytics (`GET /dashboard/analytics`)
  // ===========================================================================

  /**
   * `?user_id=` accepted the caller's own request unmodified in Laravel
   * (IDOR shape, same as the dashboard bugs) — closed the same way as
   * `getUserDashboards` rather than dropped or silently ignored (Design
   * notes: "gate it like getUserDashboards").
   */
  async getAnalytics(requestedUserId: string | undefined) {
    const context = requireContext();
    if (requestedUserId !== undefined && requestedUserId !== context.userId) {
      throw new ForbiddenError("Unauthorized to view other users' analytics");
    }

    const now = new Date();
    const devices = await this.repo.listDevicesForCaller();
    const timestamps = await this.repo.findLatestValueTimestamps(
      devices.map(d => d.deviceUniqueIdentifier)
    );

    const recentlyActiveDevices: {
      id: number;
      name: string;
      device_unique_identifier: string;
      last_heard: string;
      last_heard_at: string | null;
    }[] = [];
    const offlineDevicesList: typeof recentlyActiveDevices = [];
    let activeInLast24h = 0;

    for (const device of devices) {
      const lastSeen = timestamps.get(device.deviceUniqueIdentifier) ?? null;
      const entry = {
        id: Number(device.id),
        name: device.name,
        device_unique_identifier: device.deviceUniqueIdentifier,
        last_heard: lastSeen ? toRelative(fromJsDate(lastSeen)) : 'Never',
        last_heard_at: toDateTimeString(lastSeen),
      };

      // Offline threshold unified at 30min (D-0068's sibling decision) —
      // replaces Laravel's 1hr-only "recently active" cutoff here.
      if (lastSeen && !isOffline(lastSeen, now)) {
        recentlyActiveDevices.push(entry);
      } else {
        offlineDevicesList.push(entry);
      }
      // `active_in_last_24h` stays its own, separate 24h window — not part
      // of the offline-threshold unification (Design notes).
      if (lastSeen && now.getTime() - lastSeen.getTime() <= 24 * 60 * 60 * 1000)
        activeInLast24h += 1;
    }

    recentlyActiveDevices.sort((a, b) =>
      (b.last_heard_at ?? '').localeCompare(a.last_heard_at ?? '')
    );

    return {
      success: true,
      message: 'Analytics fetched successfully.',
      data: {
        total_devices: devices.length,
        online_devices: recentlyActiveDevices.length,
        offline_devices: offlineDevicesList.length,
        active_in_last_24h: activeInLast24h,
        recently_active_devices: recentlyActiveDevices,
        offline_devices_list: offlineDevicesList,
      },
    };
  }

  // ===========================================================================
  // Packet history (`GET /dashboard/packet-history`)
  // ===========================================================================

  async getPacketHistory(query: PacketHistoryQuery, path: string) {
    const context = requireContext();
    const { items: rawItems, total } = await this.repo.queryPacketHistory(context.userId, query);
    const activeRules = await this.repo.listActiveNonWidgetRulesForUser();

    // D-0059's per-condition product scoping (already inside `evaluate()`)
    // replaces Laravel's own "group active rules by first condition's
    // selectedProduct" heuristic — every rule is just evaluated against
    // every packet, and a condition scoped to a different product
    // self-excludes via `evaluate()`'s own logic (Design notes).
    const computed = rawItems.map(packet => {
      const flattened = mapPayload(packet.jsonBody, []).flattened;
      const isAlert = activeRules.some(
        rule => evaluate(rule.conditions, flattened, packet.productId).matched
      );
      return { packet, isAlert };
    });

    // `status` is a post-fetch filter, same "compute then filter" ordering
    // as Laravel — `summary.total`/`pagination` still reflect the pre-
    // status-filter DB total (status was never pushed into SQL); only the
    // returned `packets[]` and `summary.alerts`/`normal` shrink (Design
    // notes) — a real, deliberately-preserved quirk, not a bug to fix here.
    const filtered = query.status
      ? computed.filter(c => (c.isAlert ? 'alert' : 'normal') === query.status)
      : computed;

    const perPage = query.perPage;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(1, query.page), lastPage);
    const from = total === 0 ? null : (page - 1) * perPage + 1;
    const to = total === 0 ? null : Math.min(page * perPage, total);
    const pageUrl = (p: number) => `${path}?page=${String(p)}`;

    return {
      success: true,
      message: 'Packet history fetched successfully.',
      data: {
        packets: filtered.map(({ packet, isAlert }) =>
          toPacketHistoryItemResponse(packet, isAlert)
        ),
        summary: {
          total,
          alerts: filtered.filter(c => c.isAlert).length,
          normal: filtered.filter(c => !c.isAlert).length,
        },
        pagination: {
          current_page: page,
          per_page: perPage,
          total,
          last_page: lastPage,
          from,
          to,
          next_page_url: page < lastPage ? pageUrl(page + 1) : null,
          prev_page_url: page > 1 ? pageUrl(page - 1) : null,
        },
      },
    };
  }

  // ===========================================================================
  // Widgets (WidgetController equivalent) — `parent:dashboards`
  // ===========================================================================

  private async requireOwnedWidget(id: string, userId: string): Promise<Widget> {
    const widget = await this.repo.findWidgetById(id);
    if (!widget) throw new NotFoundError('Widget not found');
    if (widget.createdBy !== userId)
      throw new ForbiddenError('You are not authorized to access this widget.');
    return widget;
  }

  async listWidgets(): Promise<Widget[]> {
    const context = requireContext();
    return this.repo.listWidgetsForCaller(context.userId);
  }

  async createWidget(input: {
    dashboardId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type: string;
  }): Promise<Widget> {
    const context = requireContext();
    const dashboard = await this.repo.findById(input.dashboardId);
    if (!dashboard) {
      throw new ValidationError('Validation failed', {
        dashboard_id: ['The selected dashboard id is invalid.'],
      });
    }
    return this.repo.createWidget(context.userId, input);
  }

  async updateWidget(
    id: string,
    input: { x: number; y: number; w: number; h: number }
  ): Promise<Widget> {
    const context = requireContext();
    await this.requireOwnedWidget(id, context.userId);
    return this.repo.updateWidget(id, input);
  }

  async deleteWidget(id: string): Promise<void> {
    const context = requireContext();
    await this.requireOwnedWidget(id, context.userId);
    await this.repo.deleteWidgetCascade(id);
  }

  /** `WidgetController::show()` — 404 if the widget doesn't exist OR has zero settings yet (same shape for both, Design notes' documented ambiguity, ported as-is). */
  async getWidget(id: string) {
    const context = requireContext();
    await this.requireOwnedWidget(id, context.userId);
    const result = await this.repo.findWidgetWithSettings(id);
    if (!result || result.settings.length === 0) {
      throw new NotFoundError('No widget settings found for this widget.');
    }

    const firstProduct = result.settings[0]?.product ?? null;
    const preferencesByKey = new Map<string, string | null>();
    if (firstProduct) {
      const preferences = await this.productsLookup.listPreferencesForProduct(firstProduct);
      for (const p of preferences) {
        if (p.attributeKey) preferencesByKey.set(p.attributeKey, p.label);
      }
    }

    const entries: WidgetShowEntry[] = await Promise.all(
      result.settings.map(async setting => {
        const device = setting.device ? await this.repo.findDeviceById(setting.device) : undefined;
        const productName = setting.product
          ? await this.repo.findProductNameById(setting.product)
          : undefined;
        const overrideLabel =
          setting.attributes && preferencesByKey.has(setting.attributes)
            ? preferencesByKey.get(setting.attributes)
            : undefined;

        return {
          setting,
          overrideLabel,
          deviceName: device?.deviceUniqueIdentifier ?? null,
          productName: productName ?? null,
          resolvedDeviceId: device ? Number(device.id) : null,
          resolvedProductId:
            productName !== undefined && setting.product ? Number(setting.product) : null,
        };
      })
    );

    return {
      success: true,
      message: 'Widget settings retrieved.',
      data: toWidgetShowResponse(entries),
    };
  }

  // ===========================================================================
  // Widget settings (WidgetSettingController equivalent) — `parent:widgets`
  // ===========================================================================

  async listWidgetSettings() {
    const context = requireContext();
    return this.repo.listSettingsForCaller(context.userId);
  }

  async getWidgetSetting(id: string) {
    const context = requireContext();
    const setting = await this.repo.findSettingById(id);
    if (!setting) throw new NotFoundError('Widget setting not found');
    const widget = await this.repo.findWidgetById(setting.widgetId);
    if (!widget || widget.createdBy !== context.userId) {
      throw new ForbiddenError('You are not authorized to access this widget setting.');
    }
    return setting;
  }

  /**
   * `WidgetSettingController::store` had zero ownership check on `$widget`
   * (Design notes: same bug family as the dashboards-level findings) —
   * closed structurally here the same way as every other cross-tenant gap
   * this project has closed, not carried forward.
   */
  async storeWidgetSettings(widgetId: string, input: StoreWidgetSettingsInput) {
    const context = requireContext();
    await this.requireOwnedWidget(widgetId, context.userId);

    const createdSettings: {
      setting: Awaited<ReturnType<DashboardsRepository['createSettingWithRule']>>['setting'];
    }[] = [];
    const createdRules: Parameters<typeof toBareRuleResponse>[0][] = [];

    for (const entry of input.widgetSettings) {
      const validConditions = filterValidConditions(entry.conditions ?? []);
      const isForBoth = entry.enabled === true;
      const created = await this.repo.createSettingWithRule({
        userId: context.userId,
        widgetId,
        ruleName: input.widgetName,
        graphInterval: input.graphInterval ?? null,
        conditions: validConditions,
        isForBoth,
        entry,
      });
      createdSettings.push({ setting: created.setting });
      createdRules.push(created.rule);
    }

    return {
      success: true,
      message: 'Widget settings saved.',
      data: {
        widget_settings: createdSettings.map(c => toWidgetSettingResponse(c.setting)),
        rules: createdRules.map(toBareRuleResponse),
      },
    };
  }

  /**
   * `WidgetSettingController::update(Request $request)` — genuinely takes
   * no route-model-bound `$widgetSetting` at all (the method signature has
   * no such parameter, so Laravel's route-model binding never resolves the
   * URL's `{widgetSetting}` segment); every entry's own `id` (or lack of
   * one) is what drives create-vs-update, matching Laravel byte-for-byte —
   * not a mistake to "fix" by threading the path param through.
   */
  async updateWidgetSettings(input: UpdateWidgetSettingsInput) {
    const context = requireContext();
    const widgetName = input.widgetName ?? null;
    const graphInterval = input.graphInterval ?? null;
    const updated: Awaited<ReturnType<DashboardsRepository['createSettingWithRule']>>['setting'][] =
      [];

    for (const entry of input.widgetSettings) {
      const conditions = entry.conditions ?? [];
      const validConditions = filterValidConditions(conditions);
      const isForBoth = entry.enabled === true;

      if (entry.id) {
        const existing = await this.repo.findSettingById(entry.id);
        if (!existing) throw new NotFoundError(`Widget setting ${entry.id} not found.`);
        const widget = await this.repo.findWidgetById(existing.widgetId);
        if (!widget || widget.createdBy !== context.userId) {
          throw new ForbiddenError('You are not authorized to access this widget setting.');
        }

        const updatedRow = await this.repo.updateSettingRow(
          entry.id,
          widgetName,
          graphInterval,
          entry
        );
        if (conditions.length > 0) {
          await this.repo.updateRuleForSetting(existing.ruleId, {
            conditions: validConditions,
            isForBoth,
            ruleName: input.widgetName,
          });
        }
        updated.push(updatedRow);
      } else {
        if (!input.widgetId) {
          throw new ValidationError('Validation failed', {
            widget_id: ['The widget id field is required when creating a new widget setting.'],
          });
        }
        await this.requireOwnedWidget(input.widgetId, context.userId);
        const created = await this.repo.createSettingWithRule({
          userId: context.userId,
          widgetId: input.widgetId,
          ruleName: input.widgetName,
          graphInterval,
          conditions: validConditions,
          isForBoth,
          entry,
        });
        updated.push(created.setting);
      }
    }

    return {
      success: true,
      message: 'Widget settings updated.',
      data: updated.map(toWidgetSettingResponse),
    };
  }

  async deleteWidgetSetting(id: string): Promise<void> {
    const context = requireContext();
    const setting = await this.repo.findSettingById(id);
    if (!setting) throw new NotFoundError('Widget setting not found');
    const widget = await this.repo.findWidgetById(setting.widgetId);
    if (!widget || widget.createdBy !== context.userId) {
      throw new ForbiddenError('You are not authorized to access this widget setting.');
    }
    await this.repo.deleteSettingCascade(id);
  }

  // ===========================================================================
  // `POST /widgets/graph-data` — unauthenticated (Scope's own resolved
  // judgment call: real, working, matches `openapi.yaml`'s `security: []`)
  // ===========================================================================

  async graphData(widgetIntervals: Record<string, SummaryInterval>) {
    const widgetIds = Object.keys(widgetIntervals);
    if (widgetIds.length === 0) throw new ValidationError('Widget IDs are required.');

    const widgets = await this.repo.findWidgetsWithSettingsByIds(widgetIds);
    if (widgets.length === 0) throw new NotFoundError('Widget not found');

    const now = DateTime.utc();
    const ranges: Record<SummaryInterval, { start: DateTime; end: DateTime }> = {
      hourly: { start: now.minus({ hours: 23 }).startOf('hour'), end: now.endOf('hour') },
      daily: { start: now.minus({ days: 6 }).startOf('day'), end: now.endOf('day') },
      weekly: { start: now.minus({ weeks: 5 }).startOf('week'), end: now.endOf('week') },
      monthly: { start: now.minus({ months: 11 }).startOf('month'), end: now.endOf('month') },
    };

    const aggregated = new Map<
      string,
      {
        widgetId: string;
        deviceId: string;
        attribute: string;
        sum: number;
        count: number;
        duration: string;
      }
    >();

    for (const widget of widgets) {
      const interval = widgetIntervals[widget.id] ?? 'daily';
      const range = ranges[interval];

      for (const setting of widget.settings) {
        const deviceId = setting.device;
        const attribute = setting.attributes;
        if (!deviceId || !attribute) continue;

        const rows = await this.repo.querySummaryBucket({
          interval,
          deviceId,
          attribute,
          rangeStart: range.start.toJSDate(),
          rangeEnd: range.end.toJSDate(),
          formattedStart: range.start.toFormat('yyyy-MM-dd'),
          formattedEnd: range.end.toFormat('yyyy-MM-dd'),
        });

        for (const row of rows) {
          if (row.avg === null) continue;
          const duration = formatSummaryDuration(interval, row.period);
          if (duration === undefined) continue;

          const key = `${widget.id}|${deviceId}|${attribute}|${duration}`;
          const existing = aggregated.get(key) ?? {
            widgetId: widget.id,
            deviceId,
            attribute,
            sum: 0,
            count: 0,
            duration,
          };
          existing.sum += row.avg;
          existing.count += 1;
          aggregated.set(key, existing);
        }
      }
    }

    const finalResults: Record<
      string,
      {
        graph_type: string;
        text_color: string;
        yAxisTitle: string;
        widget_setting: number | null;
        unit: string;
        attribute: string;
        device_id: string;
        data: Record<string, number>;
      }[]
    > = {};
    for (const widget of widgets) {
      finalResults[`widget_${widget.id}`] = widget.settings.map(setting => ({
        graph_type: setting.graphType ?? 'line',
        text_color: setting.textColor ?? '#000000',
        yAxisTitle: setting.yAxisLabel ?? '',
        widget_setting: setting.id ? Number(setting.id) : null,
        unit: setting.unit ?? '',
        attribute: setting.attributes ?? '',
        device_id: setting.device ?? '',
        data: {},
      }));
    }
    for (const item of aggregated.values()) {
      const entries = finalResults[`widget_${item.widgetId}`];
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.attribute === item.attribute && entry.device_id === item.deviceId) {
          entry.data[item.duration] = Math.round((item.sum / item.count) * 100) / 100;
        }
      }
    }

    return { success: true, data: finalResults };
  }
}
