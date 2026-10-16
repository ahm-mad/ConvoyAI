import type {
  devices as DeviceRow,
  device_positions as DevicePositionRow,
  products as ProductRow,
  user_devices as UserDeviceRow,
} from '@prisma/client';
import { formatDeviceCreatedAt, fromJsDate, toRelative } from '../../shared/utils/dates.js';
import { toCompanyEmbeddedUserResponse } from '../rbac/rbac.mapper.js';
import type { Profile } from '../users/users.types.js';
import type {
  Device,
  DevicePosition,
  DeviceWithAssignment,
  DeviceWithUser,
  ProductWithDevices,
  UserDevice,
} from './devices.types.js';

export function toDevice(row: DeviceRow, lastReportedAt: Date | null = null): Device {
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
    lastReportedAt,
  };
}

export function toDevicePosition(row: DevicePositionRow): DevicePosition {
  return {
    id: row.id.toString(),
    deviceId: row.device_id.toString(),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speed: row.speed !== null ? Number(row.speed) : null,
    heading: row.heading !== null ? Number(row.heading) : null,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Matches Laravel's `Device` model exactly: fillable fields + timestamps + the `last_updated` appended attribute ("never" if no device value has ever been reported). */
export function toDeviceResponse(device: Device) {
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
    created_at: device.createdAt,
    updated_at: device.updatedAt,
    last_updated: device.lastReportedAt ? toRelative(fromJsDate(device.lastReportedAt)) : 'never',
  };
}

/**
 * `DeviceController::getByProduct`'s per-device shape (D-0128): the raw model attributes with `created_at`
 * in the owner's timezone (D-0119's accessor quirk), then `is_assigned`, `last_updated`, the eager-loaded
 * `latest_device_value` and the owner `user` (loaded as a side effect of that same accessor).
 */
export function toDeviceWithAssignmentResponse(device: DeviceWithAssignment) {
  const { last_updated: lastUpdated, ...base } = toDeviceResponse(device);
  return {
    ...base,
    created_at: formatDeviceCreatedAt(device.createdAt, device.user.timezone),
    is_assigned: device.isAssigned,
    last_updated: lastUpdated,
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

/**
 * `ProductAttributePreferenceService::getProductAttributePreferences` (D-0128): snake_case keys, integer `id`,
 * `is_selected` raw `1`/`0` (only `is_unique_identifier` is boolean-cast on the model), in id order.
 */
export function toUserPreferenceResponse(
  preferences: readonly {
    id: string;
    label: string | null;
    unit: string | null;
    attributeKey: string | null;
    isSelected: boolean;
    isUniqueIdentifier: boolean;
  }[]
) {
  return [...preferences]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(p => ({
      id: Number(p.id),
      label: p.label,
      unit: p.unit,
      attribute_key: p.attributeKey,
      is_selected: p.isSelected ? 1 : 0,
      is_unique_identifier: p.isUniqueIdentifier,
    }));
}

/**
 * `DeviceController::index()` — despite the name, returns Products with nested devices (11.29),
 * each device's real eager-loaded `user` (D-0112 — the device owner's full raw `users` row; no
 * Prisma relation exists from `devices` to `users`, only a scalar `user_id`, so callers must
 * resolve `usersById` themselves, e.g. a batched second query — see `devices.repository.ts`), plus
 * a `plan` field that's always null (dead `Product::plan()` relation — no `plan_id` column exists in
 * the frozen schema, matched exactly, not invented).
 */
export function toProductWithDevices(
  row: ProductRow & { devices: DeviceRow[] },
  usersById: Map<string, Profile>
): ProductWithDevices {
  return {
    id: row.id.toString(),
    name: row.name,
    status: row.status,
    companyId: row.company_id.toString(),
    createdBy: row.created_by.toString(),
    deviceProtocolId: row.device_protocol_id === null ? null : row.device_protocol_id.toString(),
    preconfigureTemplateId:
      row.preconfigure_template_id === null ? null : row.preconfigure_template_id.toString(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    devices: row.devices.map((d): DeviceWithUser => {
      const user = usersById.get(d.user_id.toString());
      if (!user)
        throw new Error(`devices.user_id ${d.user_id.toString()} not found in usersById map`);
      return { ...toDevice(d), user };
    }),
  };
}

/**
 * D-0119: `created_at` overridden to the device owner's own timezone
 * (`formatDeviceCreatedAt`) — a real, previously-undetected gap in
 * D-0112's own fix (the `user` relation was added, but `created_at`'s
 * format quirk, a side effect of the same real Laravel accessor, wasn't
 * caught: the harness's structural diffing is type-only, so a
 * differently-*formatted* string never showed as a mismatch). `updated_at`
 * is untouched by Laravel's own accessor, so it stays as-is here too.
 */
function toDeviceWithUserResponse(device: DeviceWithUser) {
  return {
    ...toDeviceResponse(device),
    created_at: formatDeviceCreatedAt(device.createdAt, device.user.timezone),
    user: toCompanyEmbeddedUserResponse(device.user),
  };
}

export function toProductWithDevicesResponse(product: ProductWithDevices) {
  return {
    id: Number(product.id),
    name: product.name,
    status: product.status,
    company_id: Number(product.companyId),
    created_by: Number(product.createdBy),
    device_protocol_id: product.deviceProtocolId === null ? null : Number(product.deviceProtocolId),
    preconfigure_template_id:
      product.preconfigureTemplateId === null ? null : Number(product.preconfigureTemplateId),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    devices: product.devices.map(toDeviceWithUserResponse),
    plan: null,
  };
}

export function toUserDevice(row: UserDeviceRow): UserDevice {
  return {
    id: row.id.toString(),
    userId: row.user_id.toString(),
    deviceId: row.device_id === null ? null : row.device_id.toString(),
    deviceName: row.device_name,
    deviceLocation: row.device_location,
    status: row.status,
    toggleStatus: row.toggle_status,
    notificationPhoneNumber: row.notification_phone_number,
    notificationEmail: row.notification_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toUserDeviceResponse(userDevice: UserDevice) {
  return {
    id: Number(userDevice.id),
    user_id: Number(userDevice.userId),
    device_id: userDevice.deviceId === null ? null : Number(userDevice.deviceId),
    device_name: userDevice.deviceName,
    device_location: userDevice.deviceLocation,
    status: userDevice.status,
    toggle_status: userDevice.toggleStatus,
    notification_phone_number: userDevice.notificationPhoneNumber,
    notification_email: userDevice.notificationEmail,
    created_at: userDevice.createdAt,
    updated_at: userDevice.updatedAt,
  };
}
