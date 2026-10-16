import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { DevicesService } from '../devices.service.js';
import { fakeDevicesRepository, fakeProductsLookup } from './fakes.js';
import type { Device } from '../devices.types.js';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

function deviceFixture(overrides: Partial<Device & { productCompanyId: string }> = {}) {
  return {
    id: '1',
    deviceUniqueIdentifier: 'dev-1',
    name: 'Sensor',
    type: null,
    status: 'active',
    location: '',
    tags: '',
    productId: '1',
    userId: '1',
    createdAt: null,
    updatedAt: null,
    lastReportedAt: null,
    productCompanyId: '1',
    ...overrides,
  };
}

describe('DevicesService', () => {
  describe('createDevice (D-0022 closes 11.5)', () => {
    it("422s when product_id doesn't belong to the caller's company", async () => {
      const { repository } = fakeDevicesRepository();
      const productsLookup = fakeProductsLookup([{ id: '1', companyId: '999' }]);
      const service = new DevicesService(repository, productsLookup);

      await expect(
        runWithContextAsync(contextFor('1', '1'), () =>
          service.createDevice({
            deviceUniqueIdentifier: 'dev-1',
            name: 'Sensor',
            type: undefined,
            status: undefined,
            location: undefined,
            tags: undefined,
            productId: '1',
          })
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('422s when the device_unique_identifier is already taken', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ deviceUniqueIdentifier: 'taken' }),
      ]);
      const productsLookup = fakeProductsLookup([{ id: '1', companyId: '1' }]);
      const service = new DevicesService(repository, productsLookup);

      await expect(
        runWithContextAsync(contextFor('1', '1'), () =>
          service.createDevice({
            deviceUniqueIdentifier: 'taken',
            name: 'Sensor',
            type: undefined,
            status: undefined,
            location: undefined,
            tags: undefined,
            productId: '1',
          })
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('creates the device when the product is owned and the identifier is free', async () => {
      const { repository, state } = fakeDevicesRepository();
      const productsLookup = fakeProductsLookup([{ id: '1', companyId: '1' }]);
      const service = new DevicesService(repository, productsLookup);

      const device = await runWithContextAsync(contextFor('1', '1'), () =>
        service.createDevice({
          deviceUniqueIdentifier: 'dev-new',
          name: 'Sensor',
          type: undefined,
          status: undefined,
          location: undefined,
          tags: undefined,
          productId: '1',
        })
      );

      expect(state.devices.has(device.id)).toBe(true);
    });
  });

  describe('authorized single-device access (D-0022)', () => {
    it('getDevice 404s for a cross-tenant device', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () => service.getDevice('1'))
      ).rejects.toMatchObject({
        httpStatus: 404,
      });
    });

    it("getDevice succeeds via direct user_id ownership, regardless of the product's company", async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '1', productCompanyId: '999' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const device = await runWithContextAsync(contextFor('1', '1'), () => service.getDevice('1'));

      expect(device.id).toBe('1');
    });

    it("getDevice succeeds via the product's company, even for a device a teammate created", async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '999', productCompanyId: '1' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const device = await runWithContextAsync(contextFor('1', '1'), () => service.getDevice('1'));

      expect(device.id).toBe('1');
    });

    it('updateDevice 422s when the new device_unique_identifier is already taken by another device', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ id: '1', deviceUniqueIdentifier: 'a' }),
        deviceFixture({ id: '2', deviceUniqueIdentifier: 'b' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () =>
          service.updateDevice('2', {
            deviceUniqueIdentifier: 'a',
            name: undefined,
            location: undefined,
            tags: undefined,
          })
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('updateDevice 404s for a cross-tenant device', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () =>
          service.updateDevice('1', {
            deviceUniqueIdentifier: undefined,
            name: 'x',
            location: undefined,
            tags: undefined,
          })
        )
      ).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('deleteDevice 404s for a cross-tenant device', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () => service.deleteDevice('1'))
      ).rejects.toMatchObject({
        httpStatus: 404,
      });
    });

    it('setDeviceStatus enables/disables an owned device', async () => {
      const { repository } = fakeDevicesRepository([deviceFixture({ status: 'active' })]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const disabled = await runWithContextAsync(contextFor('1', '1'), () =>
        service.setDeviceStatus('1', 'inactive')
      );

      expect(disabled.status).toBe('inactive');
    });
  });

  describe('bulk operations', () => {
    it("bulkSetStatus 422s when any id doesn't exist at all (matches Laravel's exists:devices,id rule)", async () => {
      const { repository } = fakeDevicesRepository([deviceFixture({ id: '1' })]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () =>
          service.bulkSetStatus(['1', '999'], 'inactive')
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('bulkSetStatus only updates ids the caller actually owns', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ id: '1', userId: '1', productCompanyId: '1' }),
        deviceFixture({ id: '2', userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const count = await runWithContextAsync(contextFor('1', '1'), () =>
        service.bulkSetStatus(['1', '2'], 'inactive')
      );

      expect(count).toBe(1);
    });

    it('bulkDeleteDevices only deletes ids the caller actually owns', async () => {
      const { repository, state } = fakeDevicesRepository([
        deviceFixture({ id: '1', userId: '1', productCompanyId: '1' }),
        deviceFixture({ id: '2', userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const count = await runWithContextAsync(contextFor('1', '1'), () =>
        service.bulkDeleteDevices(['1', '2'])
      );

      expect(count).toBe(1);
      expect(state.devices.has('1')).toBe(false);
      expect(state.devices.has('2')).toBe(true);
    });
  });

  describe('getDevicesByProduct (D-0022 closes 11.37)', () => {
    it("returns no devices when the product has none visible to the caller's company (the controller turns that into Laravel's literal 404)", async () => {
      const { repository } = fakeDevicesRepository();
      const service = new DevicesService(repository, fakeProductsLookup());

      const result = await runWithContextAsync(contextFor('1', '1'), () =>
        service.getDevicesByProduct('1')
      );

      expect(result.devices).toEqual([]);
    });

    it('returns devices with is_assigned computed from asset_components, plus userPreference', async () => {
      const { repository, state } = fakeDevicesRepository([
        deviceFixture({ id: '1', productId: '5' }),
      ]);
      state.assignedDeviceIds.add('1');
      const productsLookup = fakeProductsLookup([], {
        '5': [
          {
            attributeKey: 'temp',
            label: 'Temp',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      });
      const service = new DevicesService(repository, productsLookup);

      const result = await runWithContextAsync(contextFor('1', '1'), () =>
        service.getDevicesByProduct('5')
      );

      expect(result.devices[0]?.isAssigned).toBe(true);
      expect(result.userPreference).toHaveLength(1);
    });
  });

  describe('getDevicePoints', () => {
    it("assembles points from the product's attribute preferences and the device's latest values", async () => {
      const { repository, state } = fakeDevicesRepository([
        deviceFixture({ id: '1', productId: '5', deviceUniqueIdentifier: 'dev-1' }),
      ]);
      state.latestValues.set('dev-1', { temperature: 21.5 });
      const productsLookup = fakeProductsLookup([], {
        '5': [
          {
            attributeKey: 'temperature',
            label: 'Temperature',
            unit: 'C',
            isSelected: true,
            isUniqueIdentifier: false,
          },
        ],
      });
      const service = new DevicesService(repository, productsLookup);

      const points = await runWithContextAsync(contextFor('1', '1'), () =>
        service.getDevicePoints('1')
      );

      expect(points.points).toEqual([
        {
          pointKey: 'temperature',
          label: 'Temperature',
          unit: 'C',
          isUniqueIdentifier: false,
          isSelected: true,
          lastValue: 21.5,
        },
      ]);
    });
  });

  describe('sendCommand/sendBulkCommands (D-0052: publish deferred to 2.4)', () => {
    it("sendCommand 404s for a device the caller doesn't own", async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () => service.sendCommand('1', 'reboot', {}))
      ).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('sendCommand returns success:false today (no real MQTT publish wired until 2.4)', async () => {
      const { repository } = fakeDevicesRepository([deviceFixture()]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const result = await runWithContextAsync(contextFor('1', '1'), () =>
        service.sendCommand('1', 'reboot', {})
      );

      expect(result).toEqual({ success: false, source: 'platform' });
    });

    it('sendBulkCommands only targets devices the caller owns', async () => {
      const { repository } = fakeDevicesRepository([
        deviceFixture({ id: '1', userId: '1', productCompanyId: '1' }),
        deviceFixture({ id: '2', userId: '2', productCompanyId: '2' }),
      ]);
      const service = new DevicesService(repository, fakeProductsLookup());

      const results = await runWithContextAsync(contextFor('1', '1'), () =>
        service.sendBulkCommands(['1', '2'], 'reboot', {})
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.device.id).toBe('1');
    });
  });

  describe('listUserDevices (11.48: never a client-suppliable user_id)', () => {
    it("only returns the caller's own user_devices rows", async () => {
      const { repository, state } = fakeDevicesRepository();
      state.userDevices.set('1', {
        id: '1',
        userId: '1',
        deviceId: null,
        deviceName: 'A',
        deviceLocation: null,
        status: null,
        toggleStatus: true,
        notificationPhoneNumber: null,
        notificationEmail: null,
        createdAt: null,
        updatedAt: null,
      });
      state.userDevices.set('2', {
        id: '2',
        userId: '2',
        deviceId: null,
        deviceName: 'B',
        deviceLocation: null,
        status: null,
        toggleStatus: true,
        notificationPhoneNumber: null,
        notificationEmail: null,
        createdAt: null,
        updatedAt: null,
      });
      const service = new DevicesService(repository, fakeProductsLookup());

      const devices = await runWithContextAsync(contextFor('1', '1'), () =>
        service.listUserDevices()
      );

      expect(devices).toHaveLength(1);
      expect(devices[0]?.deviceName).toBe('A');
    });
  });
});
