import { getRequestContext } from '../../platform/http/request-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../platform/errors/app-error.js';
import { publishDeviceCommand } from '../../platform/mqtt/command-publisher.js';
import type { DevicesRepository } from './devices.repository.js';
import type { ProductsLookup } from './products-lookup.js';
import type {
  CommandResult,
  CreateDeviceInput,
  Device,
  DevicePoints,
  DeviceWithAssignment,
  ListProductsWithDevicesQuery,
  ProductWithDevices,
  UpdateDeviceInput,
  UserDevice,
} from './devices.types.js';

interface AuthContext {
  userId: string;
  companyId: string;
}

function requireContext(): AuthContext {
  const context = getRequestContext();
  if (!context) throw new ForbiddenError();
  if (!context.companyId) throw new ForbiddenError();
  return { userId: context.userId, companyId: context.companyId };
}

/** Business logic for module 2.3 (ARCHITECTURE.md §2). See `tasks/07-devices.md` and D-0050-D-0052 for design decisions. */
export class DevicesService {
  constructor(
    private readonly devicesRepository: DevicesRepository,
    private readonly productsLookup: ProductsLookup
  ) {}

  // -- index() (11.29) -------------------------------------------------------

  async listProductsWithDevices(
    query: ListProductsWithDevicesQuery
  ): Promise<{ items: ProductWithDevices[]; total: number }> {
    return this.devicesRepository.listProductsWithDevices(query);
  }

  // -- create (closes 11.5 via D-0022's pattern) ------------------------------

  async createDevice(input: CreateDeviceInput): Promise<Device> {
    const { companyId } = requireContext();

    const product = await this.productsLookup.findById(input.productId);
    if (!product || product.companyId !== companyId) {
      throw new ValidationError('The selected product id is invalid.', {
        product_id: ['The selected product id is invalid.'],
      });
    }

    if (
      await this.devicesRepository.deviceUniqueIdentifierExists(
        input.deviceUniqueIdentifier,
        undefined
      )
    ) {
      throw new ValidationError('The device unique identifier has already been taken.', {
        device_unique_identifier: ['The device unique identifier has already been taken.'],
      });
    }

    return this.devicesRepository.create(input);
  }

  // -- authorized single-device access ----------------------------------------

  async getDevice(id: string): Promise<Device> {
    const { userId, companyId } = requireContext();
    const device = await this.devicesRepository.findAuthorized(id, userId, companyId);
    if (!device) throw new NotFoundError('Device not found');
    return device;
  }

  async updateDevice(id: string, input: UpdateDeviceInput): Promise<Device> {
    const { userId, companyId } = requireContext();

    if (input.deviceUniqueIdentifier !== undefined) {
      if (
        await this.devicesRepository.deviceUniqueIdentifierExists(input.deviceUniqueIdentifier, id)
      ) {
        throw new ValidationError('The device unique identifier has already been taken.', {
          device_unique_identifier: ['The device unique identifier has already been taken.'],
        });
      }
    }

    const updated = await this.devicesRepository.update(id, userId, companyId, input);
    if (!updated) throw new NotFoundError('Device not found');
    return updated;
  }

  async deleteDevice(id: string): Promise<void> {
    const { userId, companyId } = requireContext();
    const deleted = await this.devicesRepository.delete(id, userId, companyId);
    if (!deleted) throw new NotFoundError('Device not found');
  }

  async setDeviceStatus(id: string, status: 'active' | 'inactive'): Promise<Device> {
    const { userId, companyId } = requireContext();
    const updated = await this.devicesRepository.setStatus(id, userId, companyId, status);
    if (!updated) throw new NotFoundError('Device not found');
    return updated;
  }

  async bulkSetStatus(ids: string[], status: 'active' | 'inactive'): Promise<number> {
    const { userId, companyId } = requireContext();
    await this.assertDeviceIdsExist(ids);
    return this.devicesRepository.bulkSetStatus(ids, userId, companyId, status);
  }

  async bulkDeleteDevices(ids: string[]): Promise<number> {
    const { userId, companyId } = requireContext();
    await this.assertDeviceIdsExist(ids);
    return this.devicesRepository.bulkDelete(ids, userId, companyId);
  }

  private async assertDeviceIdsExist(ids: string[]): Promise<void> {
    const existing = await this.devicesRepository.existingDeviceIdCount(ids);
    if (existing !== ids.length) {
      throw new ValidationError('The selected device_ids is invalid.', {
        device_ids: ['The selected device_ids is invalid.'],
      });
    }
  }

  // -- getByProduct (D-0022 closes 11.37 for this method) ----------------------

  /** `devices` empty ⇒ Laravel's literal 404 (`No devices found for this product.`, D-0128) — the controller shapes it. */
  async getDevicesByProduct(productId: string): Promise<{
    devices: DeviceWithAssignment[];
    userPreference: Awaited<ReturnType<ProductsLookup['listPreferencesForProduct']>>;
    assignedDeviceIds: string[];
  }> {
    const { companyId } = requireContext();

    const [devices, assignedDeviceIds] = await Promise.all([
      this.devicesRepository.findByProductAuthorized(productId, companyId),
      this.devicesRepository.assignedDeviceIds(),
    ]);

    if (devices.length === 0) return { devices: [], userPreference: [], assignedDeviceIds };

    const assigned = new Set(assignedDeviceIds);
    const userPreference = await this.productsLookup.listPreferencesForProduct(productId);

    return {
      devices: devices.map(device => ({ ...device, isAssigned: assigned.has(device.id) })),
      userPreference,
      assignedDeviceIds,
    };
  }

  // -- points() ----------------------------------------------------------------

  async getDevicePoints(id: string): Promise<DevicePoints> {
    const device = await this.getDevice(id);

    const preferences = await this.productsLookup.listPreferencesForProduct(device.productId);
    const latestValues = await this.devicesRepository.findLatestValuesForDevice(
      device.deviceUniqueIdentifier
    );

    return {
      deviceId: device.id,
      deviceUniqueIdentifier: device.deviceUniqueIdentifier,
      lastReportedAt: device.lastReportedAt,
      points: preferences.map(p => ({
        pointKey: p.attributeKey ?? '',
        label: p.label,
        unit: p.unit,
        isUniqueIdentifier: p.isUniqueIdentifier,
        isSelected: p.isSelected,
        lastValue: p.attributeKey ? (latestValues[p.attributeKey] ?? null) : null,
      })),
    };
  }

  // -- Device command / MQTT downlink (D-0052: publish itself deferred to 2.4) --

  async sendCommand(
    id: string,
    command: string,
    parameters: Record<string, unknown>
  ): Promise<CommandResult> {
    const device = await this.getDevice(id);
    return publishDeviceCommand(device.deviceUniqueIdentifier, { command, parameters });
  }

  async sendBulkCommands(
    ids: string[],
    command: string,
    parameters: Record<string, unknown>
  ): Promise<{ device: Device; result: CommandResult }[]> {
    const { userId, companyId } = requireContext();
    const devices = await this.devicesRepository.findManyAuthorized(ids, userId, companyId);

    const results = await Promise.all(
      devices.map(async device => ({
        device,
        result: await publishDeviceCommand(device.deviceUniqueIdentifier, { command, parameters }),
      }))
    );
    return results;
  }

  // -- userDevices (11.48: never a client-suppliable user_id) -------------------

  async listUserDevices(): Promise<UserDevice[]> {
    const { userId } = requireContext();
    return this.devicesRepository.listUserDevices(userId);
  }
}
