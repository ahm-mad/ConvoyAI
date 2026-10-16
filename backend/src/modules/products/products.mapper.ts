import type {
  devices as DeviceRow,
  device_values as DeviceValueRow,
  preconfigure_templates as PreconfigureTemplateRow,
  product_attribute_preference_settings as PreferenceSettingRow,
  product_attribute_preferences as PreferenceRow,
  products as ProductRow,
  raw_packet_values as RawPacketValueRow,
} from '@prisma/client';
import {
  formatDeviceCreatedAt,
  formatRawDbTimestamp,
  fromJsDate,
  toRelative,
} from '../../shared/utils/dates.js';
import { toCompanyEmbeddedUserResponse } from '../rbac/rbac.mapper.js';
import type {
  AttributePreferenceSettingsDetail,
  DeviceImportSummary,
  IngestionToken,
  PreconfigureTemplate,
  Product,
  ProductAttributePreference,
  ProductAttributePreferenceSummary,
  ProductDevice,
  ProductDeviceDetail,
  RawDeviceValue,
  TemplateField,
} from './products.types.js';

export function toProduct(
  row: ProductRow & { _count?: { devices: number; product_attribute_preferences: number } }
): Product {
  return {
    id: row.id.toString(),
    name: row.name,
    status: row.status,
    companyId: row.company_id.toString(),
    createdBy: row.created_by.toString(),
    deviceProtocolId: row.device_protocol_id === null ? null : row.device_protocol_id.toString(),
    preconfigureTemplateId:
      row.preconfigure_template_id === null ? null : row.preconfigure_template_id.toString(),
    devicesCount: row._count?.devices ?? 0,
    attributePreferencesCount: row._count?.product_attribute_preferences ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProductResponse(product: Product) {
  return {
    id: Number(product.id),
    name: product.name,
    status: product.status,
    company_id: Number(product.companyId),
    created_by: Number(product.createdBy),
    device_protocol_id: product.deviceProtocolId === null ? null : Number(product.deviceProtocolId),
    preconfigure_template_id:
      product.preconfigureTemplateId === null ? null : Number(product.preconfigureTemplateId),
    devices_count: product.devicesCount,
    attribute_preferences_count: product.attributePreferencesCount,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}

export function toProductDevice(row: DeviceRow): ProductDevice {
  return {
    id: row.id.toString(),
    deviceUniqueIdentifier: row.device_unique_identifier,
    name: row.name,
    type: row.type,
    status: row.status,
    location: row.location,
    tags: row.tags,
    productId: row.product_id.toString(),
    userId: row.user_id.toString(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRawDeviceValue(row: DeviceValueRow): RawDeviceValue {
  return {
    id: row.id.toString(),
    deviceId: row.device_id.toString(),
    deviceUniqueIdentifier: row.device_unique_identifier,
    values: (row.values ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** D-0144: `tags` deliberately not in this response — see `CreateDeviceResponseSchema`'s doc comment (`products.schemas.ts`). */
export function toProductDeviceResponse(device: ProductDevice) {
  return {
    id: Number(device.id),
    device_unique_identifier: device.deviceUniqueIdentifier,
    name: device.name,
    status: device.status,
    location: device.location,
    product_id: Number(device.productId),
    user_id: Number(device.userId),
  };
}

/** D-0148: `POST /products`'s additive `import_summary` field, see `products.schemas.ts`'s `DeviceImportSummarySchema`. */
export function toDeviceImportSummaryResponse(summary: DeviceImportSummary) {
  return {
    manual_count: summary.manualCount,
    csv_count: summary.csvCount,
    created_count: summary.createdCount,
    failed_count: summary.failedCount,
    errors: summary.errors.map(e => ({
      source: e.source,
      ...(e.index !== undefined ? { index: e.index } : {}),
      ...(e.row !== undefined ? { row: e.row } : {}),
      device_unique_identifier: e.deviceUniqueIdentifier,
      errors: e.errors,
    })),
  };
}

/**
 * `ProductController::show()`'s real per-device shape (D-0118) — matches
 * Laravel's raw `Device` model JSON exactly: `type`/timestamps/
 * `last_updated` (all real columns/appends this endpoint's leaner sibling
 * `POST /products` response, `toProductDeviceResponse` above, does not
 * include — deliberately NOT shared, so fixing this one can never change
 * that one), the owner `user` (real Laravel side effect, see
 * `formatDeviceCreatedAt`'s doc comment), and `latest_device_value` (this
 * endpoint's own explicit eager load, `null` if never reported).
 */
export function toProductDeviceDetailResponse(device: ProductDeviceDetail) {
  return {
    id: Number(device.id),
    device_unique_identifier: device.deviceUniqueIdentifier,
    name: device.name,
    type: device.type,
    status: device.status,
    location: device.location,
    tags: device.tags,
    product_id: Number(device.productId),
    user_id: Number(device.userId),
    created_at: formatDeviceCreatedAt(device.createdAt, device.user.timezone),
    updated_at: device.updatedAt,
    last_updated: device.latestDeviceValue?.createdAt
      ? toRelative(fromJsDate(device.latestDeviceValue.createdAt))
      : 'never',
    latest_device_value: device.latestDeviceValue
      ? {
          id: Number(device.latestDeviceValue.id),
          device_id: Number(device.latestDeviceValue.deviceId),
          device_unique_identifier: device.latestDeviceValue.deviceUniqueIdentifier,
          values: device.latestDeviceValue.values,
          created_at: device.latestDeviceValue.createdAt,
          updated_at: device.latestDeviceValue.updatedAt,
        }
      : null,
    user: toCompanyEmbeddedUserResponse(device.user),
  };
}

export function toAttributePreference(
  row: PreferenceRow & { product_attribute_preference_settings: PreferenceSettingRow[] }
): ProductAttributePreference {
  const setting = row.product_attribute_preference_settings[0];
  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    userId: row.user_id.toString(),
    attributeKey: row.attribute_key,
    isSelected: row.is_selected,
    isUniqueIdentifier: row.is_unique_identifier,
    attributeRole: row.attribute_role,
    label: setting?.label ?? null,
    unit: setting?.unit ?? null,
    ruleId: setting ? setting.rule_id.toString() : null,
    widgetId: setting ? setting.widget_id.toString() : null,
  };
}

export function toAttributePreferenceResponse(preference: ProductAttributePreference) {
  return {
    id: Number(preference.id),
    product_id: Number(preference.productId),
    user_id: Number(preference.userId),
    attribute_key: preference.attributeKey,
    is_selected: preference.isSelected,
    is_unique_identifier: preference.isUniqueIdentifier,
    label: preference.label,
    unit: preference.unit,
    rule_id: preference.ruleId === null ? null : Number(preference.ruleId),
    widget_id: preference.widgetId === null ? null : Number(preference.widgetId),
  };
}

/**
 * D-0122: `GET /attribute/preference/setting/{id}` — Laravel returns the raw
 * `getAttributes()` of the preference and its setting (integer 0/1 flags,
 * `Y-m-d H:i:s` timestamps, no merged label/unit/rule_id/widget_id on the
 * preference), and `Rule::is_for_all` uncast (integer). Separate from
 * `toAttributePreferenceResponse`, which the other endpoints share.
 */
export function toAttributePreferenceSettingsResponse(detail: AttributePreferenceSettingsDetail) {
  const { preference, setting } = detail;
  return {
    productAttributeData: {
      id: Number(preference.id),
      product_id: Number(preference.productId),
      user_id: Number(preference.userId),
      is_unique_identifier: preference.isUniqueIdentifier ? 1 : 0,
      attribute_key: preference.attributeKey,
      is_selected: preference.isSelected ? 1 : 0,
      created_at: formatRawDbTimestamp(preference.createdAt),
      updated_at: formatRawDbTimestamp(preference.updatedAt),
    },
    productAttributeSetting: setting
      ? {
          id: Number(setting.id),
          label: setting.label,
          unit: setting.unit,
          product_attribute_preference_id: Number(setting.productAttributePreferenceId),
          rule_id: Number(setting.ruleId),
          widget_id: Number(setting.widgetId),
          created_at: formatRawDbTimestamp(setting.createdAt),
          updated_at: formatRawDbTimestamp(setting.updatedAt),
        }
      : null,
    productAttributeSettingUnit: setting?.unit ?? null,
    ruleConditions: detail.ruleConditions,
    enabled: detail.ruleIsForAll === null ? null : detail.ruleIsForAll ? 1 : 0,
    widgetType: detail.widgetType,
  };
}

export function toAttributePreferenceSummary(
  row: PreferenceRow & { product_attribute_preference_settings: PreferenceSettingRow[] }
): ProductAttributePreferenceSummary {
  const setting = row.product_attribute_preference_settings[0];
  return {
    id: row.id.toString(),
    label: setting?.label ?? null,
    unit: setting?.unit ?? null,
    attributeKey: row.attribute_key,
    isSelected: row.is_selected,
    isUniqueIdentifier: row.is_unique_identifier,
    attributeRole: row.attribute_role,
  };
}

export function toAttributePreferenceSummaryResponse(summary: ProductAttributePreferenceSummary) {
  return {
    id: Number(summary.id),
    label: summary.label,
    unit: summary.unit,
    attribute_key: summary.attributeKey,
    is_selected: summary.isSelected,
    is_unique_identifier: summary.isUniqueIdentifier,
    attribute_role: summary.attributeRole,
  };
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toTemplateFields(configuration: unknown): TemplateField[] {
  if (!configuration || typeof configuration !== 'object' || !('fields' in configuration))
    return [];
  const fields = configuration.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter(
      (field): field is Record<string, unknown> => typeof field === 'object' && field !== null
    )
    .map(field => ({
      attributeKey: toStringOrUndefined(field['attribute_key']) ?? '',
      label: toStringOrUndefined(field['label']),
      unit: toStringOrUndefined(field['unit']),
    }));
}

export function toPreconfigureTemplate(row: PreconfigureTemplateRow): PreconfigureTemplate {
  return {
    id: row.id.toString(),
    companyId: row.company_id === null ? null : row.company_id.toString(),
    createdBy: row.created_by === null ? null : row.created_by.toString(),
    name: row.name,
    manufacturer: row.manufacturer,
    description: row.description,
    image: row.image,
    configuration: row.configuration,
    fields: toTemplateFields(row.configuration),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Bare-model response — matches Laravel's raw Eloquent serialization exactly, including the raw
 * `configuration` JSON blob (`PreconfigureTemplateController.php`'s `response()->json($template)`).
 * `fields` (this app's own parsed/flattened view of `configuration.fields`) does NOT exist on
 * Laravel's real response — deliberately not included here to match word-for-word; still exposed on
 * the domain `PreconfigureTemplate` type for internal use (e.g. `createProductFromTemplate`).
 */
export function toPreconfigureTemplateResponse(template: PreconfigureTemplate) {
  return {
    id: Number(template.id),
    company_id: template.companyId === null ? null : Number(template.companyId),
    created_by: template.createdBy === null ? null : Number(template.createdBy),
    name: template.name,
    manufacturer: template.manufacturer,
    description: template.description,
    image: template.image,
    configuration: template.configuration,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

export function toIngestionToken(row: RawPacketValueRow): IngestionToken {
  return {
    id: row.id.toString(),
    productId: row.product_id.toString(),
    protocolId: row.protocol_id.toString(),
    userId: row.user_id.toString(),
    token: row.token ?? '',
  };
}

export function toIngestionTokenResponse(token: IngestionToken) {
  return {
    id: Number(token.id),
    product_id: Number(token.productId),
    protocol_id: Number(token.protocolId),
    user_id: Number(token.userId),
    token: token.token,
  };
}
