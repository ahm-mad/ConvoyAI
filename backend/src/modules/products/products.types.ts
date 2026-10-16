import type { Profile } from '../users/users.types.js';

/**
 * Domain types for module 2.1 (products). Scope per `tasks/05-products.md`
 * plus D-0046 (minimal device creation)/D-0048 (attribute-preference
 * settings) — see those for why this module also touches `devices`/
 * `rules`/`widgets` rows.
 */
export interface Product {
  id: string;
  name: string;
  status: string;
  companyId: string;
  createdBy: string;
  deviceProtocolId: string | null;
  preconfigureTemplateId: string | null;
  devicesCount: number;
  attributePreferencesCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ProductDevice {
  id: string;
  deviceUniqueIdentifier: string;
  name: string;
  type: string | null;
  status: string;
  location: string;
  tags: string;
  productId: string;
  userId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `ProductController::show()`'s raw `DeviceValue` model, eager-loaded as `latestDeviceValue` (D-0118) — no accessors/hidden fields on the real Laravel model, so this is a direct column-for-column match. */
export interface RawDeviceValue {
  id: string;
  deviceId: string;
  deviceUniqueIdentifier: string;
  values: Record<string, unknown>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * `ProductController::show()`'s real per-device shape (D-0118) — the
 * base `ProductDevice` plus the two things a real Laravel `Device`
 * serialization always carries: the owner `user` (a side effect of
 * `Device::getCreatedAtAttribute()` lazily touching `$this->user`, see
 * `formatDeviceCreatedAt`) and `latestDeviceValue`, explicitly
 * eager-loaded by this one endpoint's own query (`$product->devices()
 * ->with('latestDeviceValue')`) — `null` if the device has never
 * reported a value.
 */
export interface ProductDeviceDetail extends ProductDevice {
  user: Profile;
  latestDeviceValue: RawDeviceValue | null;
}

export interface CreateDeviceInput {
  deviceUniqueIdentifier: string;
  name: string;
  location: string;
}

/** D-0148: a device-import row before validation — any field may be missing. */
export interface DeviceImportRowInput {
  deviceUniqueIdentifier: string | undefined;
  name: string | undefined;
  location: string | undefined;
}

export interface CreateProductInput {
  existingProductId: string | undefined;
  preconfigureTemplateId: string | undefined;
  productName: string | undefined;
  deviceProtocolId: string | undefined;
  /** D-0148: a row may be missing a field — `resolveDeviceImport` validates per-row and reports
   *  failures in `import_summary` instead of the whole request being rejected. */
  devices: DeviceImportRowInput[];
  /** D-0148: the CSV bulk-import file, if the client attached one. */
  csvFile: Buffer | undefined;
}

/** D-0148: one row of the merged manual+CSV device-import submission, before validation. */
export interface DeviceImportRow {
  source: 'manual' | 'csv';
  /** 0-based, set only for `source: "manual"` (position in the `devices[]` array). */
  index: number | undefined;
  /** 1-based, set only for `source: "csv"` (data row, header excluded). */
  row: number | undefined;
  deviceUniqueIdentifier: string | undefined;
  name: string | undefined;
  location: string | undefined;
}

/** D-0148: one rejected row in a device-import submission, with every reason it failed. */
export interface DeviceImportError {
  source: 'manual' | 'csv';
  index: number | undefined;
  row: number | undefined;
  deviceUniqueIdentifier: string | null;
  errors: string[];
}

export interface DeviceImportSummary {
  manualCount: number;
  csvCount: number;
  createdCount: number;
  failedCount: number;
  errors: DeviceImportError[];
}

export interface UpdateProductInput {
  name: string | undefined;
  preconfigureTemplateId: string | undefined;
  /** D-0106: real 3-state — `undefined` (not in the request, don't touch), `null` (explicitly clear it, Laravel's own `nullable` rule allows this only for this field), or a real id (validated before write). */
  deviceProtocolId: string | null | undefined;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface ListProductsQuery {
  search?: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  /** 1-based, already converted from the raw query param by the controller (D-0146). */
  page: number;
  perPage: number;
  userId?: string | undefined;
}

// -- Attribute preferences (D-0048: rule_id/widget_id are NOT NULL on settings) --

export interface AlertSettings {
  enabled: boolean;
  conditions: unknown[];
}

/** Raw `product_attribute_preferences` row, as `showSettings` returns it via `getAttributes()` (D-0122). */
export interface RawAttributePreference {
  id: string;
  productId: string;
  userId: string;
  isUniqueIdentifier: boolean;
  attributeKey: string | null;
  isSelected: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Raw `product_attribute_preference_settings` row (D-0122). */
export interface RawAttributePreferenceSetting {
  id: string;
  label: string | null;
  unit: string | null;
  productAttributePreferenceId: string;
  ruleId: string;
  widgetId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AttributePreferenceSettingsDetail {
  preference: RawAttributePreference;
  setting: RawAttributePreferenceSetting | null;
  ruleConditions: unknown;
  ruleIsForAll: boolean | null;
  widgetType: string | null;
}

/** D-0151/D-0154 — GPS role of a product attribute ("Mark as location"). */
export const ATTRIBUTE_ROLES = ['latitude', 'longitude', 'speed', 'heading'] as const;
export type AttributeRole = (typeof ATTRIBUTE_ROLES)[number];

export interface ProductAttributePreference {
  id: string;
  productId: string;
  userId: string;
  attributeKey: string | null;
  isSelected: boolean;
  isUniqueIdentifier: boolean;
  attributeRole: AttributeRole | null;
  label: string | null;
  unit: string | null;
  ruleId: string | null;
  widgetId: string | null;
}

export interface CreateAttributePreferenceInput {
  productId: string;
  attributeKey: string;
  label: string;
  widgetType: string | undefined;
  unit: string | undefined;
  alertSettings: AlertSettings | undefined;
}

export interface UpdateAttributePreferenceInput {
  productId: string | undefined;
  attributeKey: string | undefined;
  unit: string | undefined;
  label: string | undefined;
  widgetType: string | undefined;
  alertSettings: AlertSettings | undefined;
}

// -- Preconfigure templates --

export interface TemplateField {
  attributeKey: string;
  label: string | undefined;
  unit: string | undefined;
}

export interface PreconfigureTemplate {
  id: string;
  companyId: string | null;
  createdBy: string | null;
  name: string;
  manufacturer: string | null;
  description: string | null;
  image: string | null;
  configuration: unknown;
  fields: TemplateField[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateTemplateInput {
  name: string;
  manufacturer: string | undefined;
  description: string | undefined;
  image: string | undefined;
  fields: TemplateField[];
}

export interface CreateTemplateFromProductInput {
  name: string;
  manufacturer: string | undefined;
  description: string | undefined;
}

// -- Ingestion token / product settings --

export interface IngestionToken {
  id: string;
  productId: string;
  protocolId: string;
  userId: string;
  token: string;
}

export interface ProductSettings {
  productId: string;
  productName: string;
  rawPacket: unknown;
  userPreferenceAttributes: ProductAttributePreferenceSummary[];
  token: string | null;
}

export interface ProductAttributePreferenceSummary {
  id: string;
  label: string | null;
  unit: string | null;
  attributeKey: string | null;
  isSelected: boolean;
  isUniqueIdentifier: boolean;
  attributeRole: AttributeRole | null;
}

/** One of the caller's own preference rows, plus whether a settings row exists — what `storeProductSettings` validates against (D-0124). */
export interface OwnPreferenceForSettingsCheck {
  id: string;
  attributeKey: string | null;
  isSelected: boolean;
  isUniqueIdentifier: boolean;
  hasSettings: boolean;
}

export interface StoreProductSettingsInput {
  productId: string;
  productName: string;
  preferenceToggle: Record<string, boolean> | undefined;
}
