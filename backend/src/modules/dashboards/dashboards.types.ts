import type { RuleCondition } from '../../shared/utils/rule-condition-evaluator.js';

export type { RuleCondition };

export interface Dashboard {
  id: string;
  createdBy: string;
  name: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Widget {
  id: string;
  dashboardId: string | null;
  type: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Field names/types match `widget_settings` 1:1 (CONVENTIONS.md "DB" — keep the frozen schema's names even where unidiomatic, e.g. `device`/`product` storing an id as a plain string, not a real FK). */
export interface WidgetSetting {
  id: string;
  widgetId: string;
  ruleId: string;
  widgetName: string | null;
  settings: unknown;
  attributes: string | null;
  yAxisLabel: string | null;
  device: string | null;
  data: string | null;
  unit: string | null;
  icon: string | null;
  decimal: string | null;
  showTimestamp: boolean | null;
  product: string | null;
  label: string | null;
  backgroundColor: string | null;
  valueColor: string | null;
  textColor: string | null;
  maxValue: string | null;
  tankType: string | null;
  graphType: string | null;
  graphInterval: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListDashboardsQuery {
  search: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface CreateWidgetInput {
  dashboardId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
}

export interface UpdateWidgetInput {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One entry of `widget_settings[]` in `POST /widgets/{widget}/settings` / `PUT /widget-settings/{id}` — the raw, mostly-optional request shape (`WidgetSettingController::store`/`update`'s validation rules ported as-is). */
export interface WidgetSettingEntryInput {
  id: string | undefined;
  settings: unknown;
  attributes: string | undefined;
  yAxisLabel: string | undefined;
  device: string | undefined;
  data: string | undefined;
  unit: string | undefined;
  icon: string | undefined;
  decimal: string | undefined;
  showTimestamp: boolean | undefined;
  product: string | undefined;
  label: string | undefined;
  backgroundColor: string | undefined;
  valueColor: string | undefined;
  textColor: string | undefined;
  maxValue: string | undefined;
  tankType: string | undefined;
  graphType: string | undefined;
  enabled: boolean | undefined;
  conditions: RuleCondition[] | undefined;
}

export interface StoreWidgetSettingsInput {
  widgetName: string | undefined;
  graphInterval: string | undefined;
  widgetSettings: WidgetSettingEntryInput[];
}

export interface UpdateWidgetSettingsInput {
  widgetId: string | undefined;
  widgetName: string | undefined;
  graphInterval: string | undefined;
  widgetSettings: WidgetSettingEntryInput[];
}

export interface PacketHistoryQuery {
  productId: string | undefined;
  protocolId: string | undefined;
  deviceId: string | undefined;
  status: 'alert' | 'normal' | undefined;
  search: string | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  perPage: number;
  page: number;
  sortBy: 'created_at' | 'id' | 'product_id' | 'protocol_id';
  sortDir: 'asc' | 'desc';
}

export interface RawPacketRow {
  id: string;
  /** `raw_packet_values.product_id`/`.protocol_id` are both NOT NULL (schema.prisma). */
  productId: string;
  protocolId: string;
  productName: string | null;
  protocolName: string | null;
  deviceIds: string[];
  jsonBody: Record<string, unknown>;
  token: string | null;
  createdAt: Date | null;
}
