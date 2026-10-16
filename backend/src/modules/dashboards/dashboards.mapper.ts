import type {
  dashboards as DashboardRow,
  rules as RuleRow,
  raw_packet_values as RawPacketRow,
  widget_settings as WidgetSettingRow,
  widgets as WidgetRow,
} from '@prisma/client';
// Pure mapper reuse, not a repository import (CONVENTIONS.md "Modules" is
// about not importing another module's repository *class* — `toRule` is a
// stateless row->DTO transform, same reasoning as reusing
// `shared/utils/rule-condition-evaluator.ts`'s `evaluate()` everywhere).
// `WidgetSettingController::store`/`update` return the bare Eloquent `Rule`
// model (all columns), so this reuses 09-rules' own row->domain mapping
// rather than re-deriving it.
import { toRule } from '../rules/rules.mapper.js';
import type {
  Dashboard,
  RawPacketRow as RawPacket,
  Widget,
  WidgetSetting,
} from './dashboards.types.js';

/** `YYYY-MM-DD HH:MM:SS` — same inline conversion `rules.mapper.ts`'s `toRuleCreateResponse` already uses for a Laravel `toDateTimeString()`-shaped field. */
export function toDateTimeString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
}

export function toDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id.toString(),
    createdBy: row.created_by.toString(),
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWidget(row: WidgetRow): Widget {
  return {
    id: row.id.toString(),
    dashboardId: row.dashboard_id === null ? null : row.dashboard_id.toString(),
    type: row.type,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    createdBy: row.created_by.toString(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** JSON columns round-trip through Prisma as `unknown` — already validated shape at write time (Zod, `dashboards.schemas.ts`), same pattern as every other module's JSON columns. */
export function toWidgetSetting(row: WidgetSettingRow): WidgetSetting {
  return {
    id: row.id.toString(),
    widgetId: row.widget_id.toString(),
    ruleId: row.rule_id.toString(),
    widgetName: row.widget_name,
    settings: row.settings,
    attributes: row.attributes,
    yAxisLabel: row.y_axis_label,
    device: row.device,
    data: row.data,
    unit: row.unit,
    icon: row.icon,
    decimal: row.decimal,
    showTimestamp: row.show_timestamp,
    product: row.product,
    label: row.label,
    backgroundColor: row.background_color,
    valueColor: row.value_color,
    textColor: row.text_color,
    maxValue: row.max_value,
    tankType: row.tank_type,
    graphType: row.graph_type,
    graphInterval: row.graph_interval,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRawPacketRow(
  row: RawPacketRow & {
    products?: { id: bigint; name: string } | null;
    protocols_raw_packet_values_protocol_idToprotocols?: { id: bigint; name: string } | null;
  }
): RawPacket {
  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    protocolId: row.protocol_id.toString(),
    productName: row.products?.name ?? null,
    protocolName: row.protocols_raw_packet_values_protocol_idToprotocols?.name ?? null,
    deviceIds: Array.isArray(row.device_ids) ? (row.device_ids as unknown[]).map(String) : [],
    jsonBody:
      typeof row.json_body === 'object' && row.json_body !== null
        ? (row.json_body as Record<string, unknown>)
        : {},
    token: row.token,
    createdAt: row.created_at,
  };
}

// -- Response shaping (DashboardController/WidgetController's exact shapes) --

/** `DashboardController::store`/`update`'s bare-dashboard response slice (`api-catalog.md`: `{success,message,data}` with the raw model, snake_case timestamps). */
export function toDashboardResponse(dashboard: Dashboard) {
  return {
    id: Number(dashboard.id),
    name: dashboard.name,
    created_by: Number(dashboard.createdBy),
    created_at: dashboard.createdAt,
    updated_at: dashboard.updatedAt,
  };
}

export function toDashboardListItemResponse(dashboard: Dashboard) {
  return toDashboardResponse(dashboard);
}

/** `GET /user/{userId}/dashboards` — `{id,name}` only (`api-catalog.md`). */
export function toDashboardSummaryResponse(dashboard: Dashboard) {
  return { id: Number(dashboard.id), name: dashboard.name };
}

export function toWidgetResponse(widget: Widget) {
  return {
    id: Number(widget.id),
    dashboard_id: widget.dashboardId === null ? null : Number(widget.dashboardId),
    type: widget.type,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    created_by: Number(widget.createdBy),
    created_at: widget.createdAt,
    updated_at: widget.updatedAt,
  };
}

/** `WidgetSetting::toArray()`'s full column set — the frozen contract exposes every column verbatim, snake_case. */
export function toWidgetSettingResponse(setting: WidgetSetting) {
  return {
    id: Number(setting.id),
    widget_id: Number(setting.widgetId),
    rule_id: Number(setting.ruleId),
    widget_name: setting.widgetName,
    settings: setting.settings,
    attributes: setting.attributes,
    y_axis_label: setting.yAxisLabel,
    device: setting.device,
    data: setting.data,
    unit: setting.unit,
    icon: setting.icon,
    decimal: setting.decimal,
    show_timestamp: setting.showTimestamp,
    product: setting.product,
    label: setting.label,
    background_color: setting.backgroundColor,
    value_color: setting.valueColor,
    text_color: setting.textColor,
    max_value: setting.maxValue,
    tank_type: setting.tankType,
    graph_type: setting.graphType,
    graph_interval: setting.graphInterval,
    created_at: setting.createdAt,
    updated_at: setting.updatedAt,
  };
}

// -- Composite responses needing enrichment computed in the service layer --

export interface EnrichedWidgetValue {
  attribute_name: string;
  attribute_value: unknown;
  is_alert: number;
}

export interface EnrichedWidgetSetting {
  setting: WidgetSetting;
  label: string;
  productName: string | null;
}

export interface EnrichedWidget {
  widget: Widget;
  settings: EnrichedWidgetSetting[];
  values: EnrichedWidgetValue[];
}

/** `DashboardController::show()` — bare model (no envelope), each widget carrying its eager-loaded `widget_settings` (each with a computed `label`/`product_name`) plus a synthetic `values[]` summary array. */
export function toDashboardDetailResponse(dashboard: Dashboard, widgets: EnrichedWidget[]) {
  return {
    ...toDashboardResponse(dashboard),
    widgets: widgets.map(({ widget, settings, values }) => ({
      ...toWidgetResponse(widget),
      widget_settings: settings.map(({ setting, label, productName }) => ({
        ...toWidgetSettingResponse(setting),
        product_name: productName,
        label,
      })),
      values,
    })),
  };
}

export interface WidgetShowEntry {
  setting: WidgetSetting;
  /** Only present when the caller has a matching `ProductAttributePreference` for this setting's product/attribute — otherwise the setting's own stored `label` column passes through unchanged. */
  overrideLabel: string | null | undefined;
  deviceName: string | null;
  productName: string | null;
  /** `WidgetController::show()` overwrites `device`/`product` in the response with the *resolved* relation's own id (may be `null` if the stored varchar didn't resolve to a real row) — not simply the raw stored string. */
  resolvedDeviceId: number | null;
  resolvedProductId: number | null;
}

/** `WidgetController::show()`'s odd "spread the first setting's fields at top level, then nest all settings" shape — ported exactly, it's the frozen contract even though it's unusual (Design notes). */
export function toWidgetShowResponse(entries: WidgetShowEntry[]) {
  const shaped = entries.map(e => ({
    ...toWidgetSettingResponse(e.setting),
    ...(e.overrideLabel !== undefined ? { label: e.overrideLabel } : {}),
    device_name: e.deviceName,
    product_name: e.productName,
    device: e.resolvedDeviceId,
    product: e.resolvedProductId,
  }));
  const [first] = shaped;
  if (!first) {
    throw new Error(
      'toWidgetShowResponse requires at least one widget_settings entry (caller must 404 first)'
    );
  }
  return { ...first, widget_settings: shaped };
}

/** `DashboardController::packetHistory()`'s per-packet response slice. */
export function toPacketHistoryItemResponse(packet: RawPacket, isAlert: boolean) {
  return {
    id: Number(packet.id),
    product: { id: Number(packet.productId), name: packet.productName },
    protocol: { id: Number(packet.protocolId), name: packet.protocolName },
    device_ids: packet.deviceIds,
    // PHP's json_encode always serializes an empty associative array as `[]`, never `{}` —
    // `DashboardController.php:435`'s `$jsonBody` is empty whenever the packet body is empty,
    // regardless of whether the original JSON was `{}` or `[]`. Matched here, not a design choice.
    json_body: Object.keys(packet.jsonBody).length === 0 ? [] : packet.jsonBody,
    token: packet.token,
    status: isAlert ? 'alert' : 'normal',
    is_alert: isAlert,
    received_at: toDateTimeString(packet.createdAt),
  };
}

/** `WidgetSettingController::store`/`update`'s `rules` response entry — the bare Eloquent `Rule` model, every column, snake_case (matches `api-catalog.md`, not a shaped subset like `rules.mapper.ts`'s own endpoint responses). */
export function toBareRuleResponse(row: RuleRow) {
  const rule = toRule(row);
  return {
    id: Number(rule.id),
    user_id: Number(rule.userId),
    name: rule.name,
    execution_interval: rule.executionInterval,
    allow_retriggering: rule.allowRetriggering,
    severity: rule.severity,
    conditions: rule.conditions,
    actions: rule.actions,
    email_data: rule.emailData,
    sms_data: rule.smsData,
    notification_data: rule.notificationData,
    is_active: rule.isActive,
    is_for_widget: rule.isForWidget,
    is_for_rule_builder: rule.isForRuleBuilder,
    is_for_all: rule.isForAll,
    last_triggered: rule.lastTriggered,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}
