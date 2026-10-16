import type { Profile } from '../users/users.types.js';

/** Domain types for module 2.3 (devices). See `tasks/07-devices.md` for scope/design notes. */
export interface Device {
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
  /** `latestDeviceValue.created_at`, if any — backs the `last_updated` appended attribute. */
  lastReportedAt: Date | null;
}

export interface CreateDeviceInput {
  deviceUniqueIdentifier: string;
  name: string;
  type: string | undefined;
  status: 'active' | 'inactive' | undefined;
  location: string | undefined;
  tags: string | undefined;
  productId: string;
}

export interface UpdateDeviceInput {
  deviceUniqueIdentifier: string | undefined;
  name: string | undefined;
  location: string | undefined;
  tags: string | undefined;
}

/** `DeviceController::index()`'s real `devices.user` eager load (D-0112) — the device owner's full raw `users` row. */
export interface DeviceWithUser extends Device {
  user: Profile;
}

export interface ProductWithDevices {
  id: string;
  name: string;
  status: string;
  companyId: string;
  createdBy: string;
  deviceProtocolId: string | null;
  preconfigureTemplateId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  devices: DeviceWithUser[];
}

export interface ListProductsWithDevicesQuery {
  productId: string | undefined;
  search: string | undefined;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface DevicePoint {
  pointKey: string;
  label: string | null;
  unit: string | null;
  isUniqueIdentifier: boolean;
  isSelected: boolean;
  lastValue: unknown;
}

export interface DevicePoints {
  deviceId: string;
  deviceUniqueIdentifier: string;
  lastReportedAt: Date | null;
  points: DevicePoint[];
}

/** `device_values` row as Laravel's `Device::latestDeviceValue` relation serializes it (D-0128). */
export interface LatestDeviceValue {
  id: string;
  deviceId: string;
  deviceUniqueIdentifier: string;
  values: Record<string, unknown>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `DeviceController::getByProduct`'s per-device data before `is_assigned` is applied (D-0128): the device's owner and latest value row, both eager-loaded in Laravel. */
export interface DeviceWithOwnerAndLatestValue extends Device {
  user: Profile;
  latestDeviceValue: LatestDeviceValue | null;
}

export interface DeviceWithAssignment extends DeviceWithOwnerAndLatestValue {
  isAssigned: boolean;
}

export interface CommandResult {
  success: boolean;
  source: 'platform' | 'customer';
}

export interface UserDevice {
  id: string;
  userId: string;
  deviceId: string | null;
  deviceName: string | null;
  deviceLocation: string | null;
  status: string | null;
  toggleStatus: boolean;
  notificationPhoneNumber: string | null;
  notificationEmail: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** `FleetController::positions()`'s `device:id,name,device_unique_identifier,product_id` eager-load brief (module 4.8). */
export interface DeviceBrief {
  id: string;
  name: string;
  deviceUniqueIdentifier: string;
  productId: string;
}

/** `FleetController::positions()`'s raw `DevicePosition` row (module 4.8). */
export interface DevicePosition {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recordedAt: Date;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** A device the caller may install in a vehicle and that isn't installed anywhere right now (`GET /vehicles/assignable-trackers`). */
export interface AssignableTracker {
  id: string;
  name: string;
  deviceUniqueIdentifier: string;
  status: string;
  hasPosition: boolean;
  product: { id: string; name: string };
}
