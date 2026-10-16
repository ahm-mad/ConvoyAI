import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { AssetsService } from '../assets.service.js';
import {
  fakeAssetsRepository,
  fakeCompanyLookup,
  fakeDevicesLookup,
  fakeProductsLookup,
  fakeRulesLookup,
} from './fakes.js';
import type { Asset, AssetComponent, FloorPlan } from '../assets.types.js';

vi.mock('../../../platform/storage/r2-storage.js', () => ({
  uploadObject: vi.fn().mockResolvedValue({
    key: 'floor-plans/new.png',
    url: 'https://images.example.com/floor-plans/new.png',
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  keyFromUrl: (url: string) =>
    url.startsWith('https://images.example.com/')
      ? url.slice('https://images.example.com/'.length)
      : undefined,
}));

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function ctx(companyId = '1'): RequestContext {
  return { userId: '1', companyId, roles: [], perms: [], jti: 't', exp: Number.MAX_SAFE_INTEGER };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: '1',
    companyId: '1',
    name: 'Asset',
    type: 'building',
    icon: null,
    description: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeComponent(overrides: Partial<AssetComponent> = {}): AssetComponent {
  return {
    id: '1',
    assetId: '1',
    name: 'Component',
    icon: null,
    componentType: null,
    deviceId: null,
    productId: null,
    inventoryCheck: false,
    inventoryCheckValue: 0,
    parentId: null,
    floorPlanId: null,
    positionX: null,
    positionY: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeFloorPlan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: '1',
    assetComponentId: '1',
    floorLevel: 0,
    filePath: 'floor-plans/x.png',
    widthPx: 100,
    heightPx: 100,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('AssetsService', () => {
  describe('listAssets / getAsset: tree building from a flat component list', () => {
    it("nests components by parent_id to arbitrary depth, matching Eloquent's self-eager-loaded children()", async () => {
      const components = [
        makeComponent({ id: '1', parentId: null, name: 'Floor' }),
        makeComponent({ id: '2', parentId: '1', name: 'Room' }),
        makeComponent({ id: '3', parentId: '2', name: 'Sensor' }),
      ];
      const repo = fakeAssetsRepository({
        listForCaller: () => Promise.resolve([makeAsset()]),
        listAllComponentsForAsset: () => Promise.resolve(components),
        findLatestDeviceValue: () => Promise.resolve(undefined),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );

      const result = await service.listAssets();
      const asset = result.assets[0] as {
        id: number;
        asset_id: number;
        children: { id: number; children: { id: number; children: unknown[] }[] }[];
      };
      // D-0129: Laravel's `formatAsset`/`formatComponent` emit integer ids
      expect(asset).toMatchObject({ id: 1, asset_id: 1 });
      expect(asset.children).toHaveLength(1);
      expect(asset.children[0]?.id).toBe(1);
      expect(asset.children[0]?.children[0]?.id).toBe(2);
      expect(asset.children[0]?.children[0]?.children[0]).toMatchObject({
        id: 3,
        asset_id: 1,
        parent_id: 2,
        device_id: null,
        inventory_check: 0,
      });
    });

    it("getAsset: throws NotFoundError when the asset isn't found (cross-tenant or nonexistent — repo already scopes)", async () => {
      const repo = fakeAssetsRepository({ findById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(service.getAsset('999')).rejects.toThrow(NotFoundError);
    });

    it('getAsset: only evaluates alerts when inventory_check && device_id && product_id are all set, summing matched attributes into alerts_count', async () => {
      const component = makeComponent({
        id: '1',
        parentId: null,
        deviceId: '10',
        productId: '20',
        inventoryCheck: true,
      });
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        listAllComponentsForAsset: () => Promise.resolve([component]),
        findLatestDeviceValue: () =>
          Promise.resolve({ createdAt: new Date(), values: { temp: 99 } }),
      });
      const rules = fakeRulesLookup({
        listActiveNonWidgetRulesForUser: () =>
          Promise.resolve([
            {
              id: 'r1',
              conditions: [
                {
                  selectedAttribute: 'temp',
                  selectedCondition: 'greater than',
                  conditionValue: '50',
                },
              ],
            },
          ]),
      });
      const service = new AssetsService(
        repo,
        rules,
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );

      const result = await service.getAsset('1');
      const asset = result.asset as {
        alerts_count: number;
        children: { is_alert: boolean; alert_attributes: string[] }[];
      };
      expect(asset.children[0]?.is_alert).toBe(true);
      expect(asset.children[0]?.alert_attributes).toEqual(['temp']);
      expect(asset.alerts_count).toBe(1);
    });

    it('getAsset: does not evaluate alerts when inventory_check is false, even with a device+product+matching rule', async () => {
      const component = makeComponent({
        id: '1',
        parentId: null,
        deviceId: '10',
        productId: '20',
        inventoryCheck: false,
      });
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        listAllComponentsForAsset: () => Promise.resolve([component]),
        findLatestDeviceValue: () =>
          Promise.resolve({ createdAt: new Date(), values: { temp: 99 } }),
      });
      const rules = fakeRulesLookup({
        listActiveNonWidgetRulesForUser: () =>
          Promise.resolve([
            {
              id: 'r1',
              conditions: [
                {
                  selectedAttribute: 'temp',
                  selectedCondition: 'greater than',
                  conditionValue: '50',
                },
              ],
            },
          ]),
      });
      const service = new AssetsService(
        repo,
        rules,
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );

      const result = await service.getAsset('1');
      const asset = result.asset as { alerts_count: number };
      expect(asset.alerts_count).toBe(0);
    });
  });

  describe('updateAsset / deleteAsset / bulkDeleteAssets', () => {
    it('updateAsset: throws NotFoundError when the repository update returns undefined (not owned)', async () => {
      const repo = fakeAssetsRepository({ update: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(service.updateAsset('1', { name: 'New' })).rejects.toThrow(NotFoundError);
    });

    it('deleteAsset: throws NotFoundError when the repository reports nothing was deleted', async () => {
      const repo = fakeAssetsRepository({ deleteCascade: () => Promise.resolve(false) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(service.deleteAsset('1')).rejects.toThrow(NotFoundError);
    });

    it("bulkDeleteAssets: always reports success (matches the old app's own silent-skip-unowned bulk semantics)", async () => {
      const repo = fakeAssetsRepository({ bulkDeleteCascade: () => Promise.resolve(1) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await service.bulkDeleteAssets(['1', '2']);
      expect(result.success).toBe(true);
    });
  });

  describe('getCompanyAssetsTree', () => {
    it("throws NotFoundError when the requested companyId doesn't match the caller's own (D-0075's structural equivalent)", async () => {
      const repo = fakeAssetsRepository({});
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx('1'), () =>
          service.getCompanyAssetsTree('2', { page: 1, limit: 10, search: undefined })
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError when the company itself can't be found", async () => {
      const repo = fakeAssetsRepository({});
      const company = fakeCompanyLookup({ findById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        company
      );
      await expect(
        runWithContextAsync(ctx('1'), () =>
          service.getCompanyAssetsTree('1', { page: 1, limit: 10, search: undefined })
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('returns the company name and per-asset hierarchy stats (total_children/total_layers/total_devices_assigned)', async () => {
      const components = [
        makeComponent({ id: '1', parentId: null, deviceId: '10' }),
        makeComponent({ id: '2', parentId: '1', deviceId: null }),
        makeComponent({ id: '3', parentId: '2', deviceId: '11' }),
      ];
      const repo = fakeAssetsRepository({
        findAssetTreeForCompany: () => Promise.resolve({ items: [makeAsset()], total: 1 }),
        listAllComponentsForAsset: () => Promise.resolve(components),
        findLatestDeviceValue: () => Promise.resolve(undefined),
      });
      const company = fakeCompanyLookup({
        findById: () => Promise.resolve({ id: '1', name: 'Acme Co' }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        company
      );

      const result = await runWithContextAsync(ctx('1'), () =>
        service.getCompanyAssetsTree('1', { page: 1, limit: 10, search: undefined })
      );
      expect(result.company_name).toBe('Acme Co');
      const entry = result.assets[0] as {
        total_children: number;
        total_layers: number;
        total_devices_assigned: number;
      };
      expect(entry.total_children).toBe(2);
      expect(entry.total_layers).toBe(3);
      expect(entry.total_devices_assigned).toBe(2);
    });
  });

  describe('addComponents', () => {
    it("throws NotFoundError when the asset isn't owned by the caller", async () => {
      const repo = fakeAssetsRepository({ findById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        service.addComponents('1', [
          {
            name: 'X',
            componentType: null,
            icon: null,
            deviceId: null,
            productId: null,
            inventoryCheck: null,
            parentId: null,
            floorPlanId: null,
            positionX: null,
            positionY: null,
          },
        ])
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when the chosen parent belongs to a different asset', async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        validateParent: () => Promise.resolve({ ok: false, reason: 'invalid' }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        service.addComponents('1', [
          {
            name: 'X',
            componentType: null,
            icon: null,
            deviceId: null,
            productId: null,
            inventoryCheck: null,
            parentId: '99',
            floorPlanId: null,
            positionX: null,
            positionY: null,
          },
        ])
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when the chosen parent is locked (device + inventory_check)', async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        validateParent: () => Promise.resolve({ ok: false, reason: 'locked' }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        service.addComponents('1', [
          {
            name: 'X',
            componentType: null,
            icon: null,
            deviceId: null,
            productId: null,
            inventoryCheck: null,
            parentId: '5',
            floorPlanId: null,
            positionX: null,
            positionY: null,
          },
        ])
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when device_id doesn't resolve via the (company-scoped, tightened) devices lookup", async () => {
      const repo = fakeAssetsRepository({ findById: () => Promise.resolve(makeAsset()) });
      const devices = fakeDevicesLookup({ findAuthorized: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        devices,
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx('1'), () =>
          service.addComponents('1', [
            {
              name: 'X',
              componentType: null,
              icon: null,
              deviceId: '999',
              productId: null,
              inventoryCheck: null,
              parentId: null,
              floorPlanId: null,
              positionX: null,
              positionY: null,
            },
          ])
        )
      ).rejects.toThrow(ValidationError);
    });

    it('creates components once every parent/device/product check passes', async () => {
      const created = makeComponent({ id: '5' });
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        createComponents: () => Promise.resolve([created]),
        findLatestDeviceValue: () => Promise.resolve(undefined),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await service.addComponents('1', [
        {
          name: 'X',
          componentType: null,
          icon: null,
          deviceId: null,
          productId: null,
          inventoryCheck: null,
          parentId: null,
          floorPlanId: null,
          positionX: null,
          positionY: null,
        },
      ]);
      expect(result.success).toBe(true);
      expect((result.components[0] as { id: number }).id).toBe(5);
    });
  });

  describe('updateComponent', () => {
    it("throws NotFoundError when the component isn't owned by the caller", async () => {
      const repo = fakeAssetsRepository({ findComponentById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.updateComponent('1', { name: 'X' }))
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError for a self-parent move', async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.updateComponent('1', { parentId: '1' }))
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when the move would create a circular reference', async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        wouldCreateCircularReference: () => Promise.resolve(true),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.updateComponent('1', { parentId: '2' }))
      ).rejects.toThrow(ValidationError);
    });

    it('succeeds and returns DevicelatestPacket (typo preserved for parity) alongside the updated component', async () => {
      const updated = makeComponent({ id: '1', deviceId: '10' });
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        updateComponent: () => Promise.resolve(updated),
        findLatestDeviceValue: () =>
          Promise.resolve({ createdAt: new Date(), values: { temp: 5 } }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () =>
        service.updateComponent('1', { name: 'New name' })
      );
      expect(result.DevicelatestPacket).toEqual({ temp: 5 });
    });
  });

  describe('deleteComponent / bulkUpdateComponents', () => {
    it('deleteComponent: throws NotFoundError when not owned', async () => {
      const repo = fakeAssetsRepository({ findComponentById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(runWithContextAsync(ctx(), () => service.deleteComponent('1'))).rejects.toThrow(
        NotFoundError
      );
    });

    it('bulkUpdateComponents: throws ValidationError on a circular move within the batch', async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        componentExists: () => Promise.resolve(true),
        wouldCreateCircularReference: () => Promise.resolve(true),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.bulkUpdateComponents([{ id: '1', parentId: '2' }]))
      ).rejects.toThrow(ValidationError);
    });

    it("bulkUpdateComponents: a nonexistent parent_id is a 422 (Laravel's exists:asset_components,id)", async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        componentExists: () => Promise.resolve(false),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () =>
          service.bulkUpdateComponents([{ id: '1', parentId: '999' }])
        )
      ).rejects.toThrow(ValidationError);
    });

    it('updateComponent / addComponents: a nonexistent floor_plan_id is a 422 (exists:floor_plans,id)', async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        findById: () => Promise.resolve(makeAsset()),
        floorPlanExists: () => Promise.resolve(false),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.updateComponent('1', { floorPlanId: '999' }))
      ).rejects.toThrow(ValidationError);
      await expect(
        service.addComponents('1', [
          {
            name: 'X',
            componentType: null,
            icon: null,
            deviceId: null,
            productId: null,
            inventoryCheck: null,
            parentId: null,
            floorPlanId: '999',
            positionX: null,
            positionY: null,
          },
        ])
      ).rejects.toThrow(ValidationError);
    });

    it("bulkUpdateComponents: throws NotFoundError as soon as one id in the batch isn't owned", async () => {
      const repo = fakeAssetsRepository({ findComponentById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.bulkUpdateComponents([{ id: '999' }]))
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getStatusSummary', () => {
    it('throws NotFoundError when neither an asset nor a component resolves for the given id', async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(undefined),
        findComponentById: () => Promise.resolve(undefined),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () => service.getStatusSummary('999'))
      ).rejects.toThrow(NotFoundError);
    });

    it('uses the unified 30min isOffline() threshold, not a 24h cutoff (11.15/§9)', async () => {
      const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000);
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        lastChildDevicesForAsset: () =>
          Promise.resolve([{ componentId: '1', deviceId: '10', productId: '20' }]),
        findLatestDeviceValue: () => Promise.resolve({ createdAt: fortyMinutesAgo, values: {} }),
        countLastDayValues: () => Promise.resolve([]),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getStatusSummary('1'));
      // 40 minutes old is offline under the 30min unified threshold, even
      // though it would have been "online" under the old 24h-only check.
      expect(result.offline_devices).toBe(1);
      expect(result.online_devices).toBe(0);
    });

    it('counts alerts_last_24h as distinct alert-triggering packets within a real 24h window, separate from the offline threshold', async () => {
      const now = new Date();
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        lastChildDevicesForAsset: () =>
          Promise.resolve([{ componentId: '1', deviceId: '10', productId: '20' }]),
        findLatestDeviceValue: () => Promise.resolve({ createdAt: now, values: { temp: 99 } }),
        countLastDayValues: () =>
          Promise.resolve([
            { createdAt: now, values: { temp: 99 } },
            { createdAt: now, values: { temp: 1 } },
          ]),
      });
      const rules = fakeRulesLookup({
        listActiveNonWidgetRulesForUser: () =>
          Promise.resolve([
            {
              id: 'r1',
              conditions: [
                {
                  selectedAttribute: 'temp',
                  selectedCondition: 'greater than',
                  conditionValue: '50',
                },
              ],
            },
          ]),
      });
      const service = new AssetsService(
        repo,
        rules,
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getStatusSummary('1'));
      expect(result.alerts_last_24h).toBe(1);
      expect(result.online_devices).toBe(1);
    });
  });

  describe('componentsDevices', () => {
    it("filters out devices whose name/uuid don't match the search term", async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        lastChildDevicesForAsset: () =>
          Promise.resolve([{ componentId: '1', deviceId: '10', productId: null }]),
        listAllComponentsForAsset: () =>
          Promise.resolve([makeComponent({ id: '1', parentId: null })]),
        findLatestDeviceValue: () => Promise.resolve(undefined),
        listSelectedAttributeKeys: () => Promise.resolve([]),
      });
      const devices = fakeDevicesLookup({
        findByIdUnscoped: () =>
          Promise.resolve({
            id: '10',
            deviceUniqueIdentifier: 'dev-10',
            name: 'Front Door Sensor',
            status: 'active',
            createdAt: null,
          }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        devices,
        fakeProductsLookup(),
        fakeCompanyLookup()
      );

      const noMatch = await runWithContextAsync(ctx(), () =>
        service.componentsDevices('1', { type: 'asset', search: 'backdoor', perPage: 25, page: 1 })
      );
      expect(noMatch.devices).toHaveLength(0);

      const match = await runWithContextAsync(ctx(), () =>
        service.componentsDevices('1', { type: 'asset', search: 'front', perPage: 25, page: 1 })
      );
      expect(match.devices).toHaveLength(1);
    });

    it('builds asset_id + child_id_N from the top-down ancestor chain of the device-bearing component', async () => {
      const components = [
        makeComponent({ id: '1', parentId: null, assetId: '7' }),
        makeComponent({ id: '2', parentId: '1', assetId: '7' }),
        makeComponent({ id: '3', parentId: '2', assetId: '7', deviceId: '10' }),
      ];
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset({ id: '7' })),
        lastChildDevicesForAsset: () =>
          Promise.resolve([{ componentId: '3', deviceId: '10', productId: null }]),
        listAllComponentsForAsset: () => Promise.resolve(components),
        findLatestDeviceValue: () => Promise.resolve(undefined),
        listSelectedAttributeKeys: () => Promise.resolve([]),
      });
      const devices = fakeDevicesLookup({
        findByIdUnscoped: () =>
          Promise.resolve({
            id: '10',
            deviceUniqueIdentifier: 'dev-10',
            name: 'Sensor',
            status: 'active',
            createdAt: null,
          }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        devices,
        fakeProductsLookup(),
        fakeCompanyLookup()
      );

      const result = await runWithContextAsync(ctx(), () =>
        service.componentsDevices('7', { type: 'asset', search: undefined, perPage: 25, page: 1 })
      );
      const entry = result.devices[0] as Record<string, unknown>;
      expect(entry['asset_id']).toBe('7');
      expect(entry['child_id_1']).toBe('1');
      expect(entry['child_id_2']).toBe('2');
      expect(entry['child_id_3']).toBe('3');
    });
  });

  describe('getStatusSummary: component-root path and never-reported devices', () => {
    it("falls back to a component root when the id isn't an asset", async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(undefined),
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        lastChildDevicesForComponent: () =>
          Promise.resolve([{ componentId: '1', deviceId: '10', productId: '20' }]),
        findLatestDeviceValue: () => Promise.resolve(undefined),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getStatusSummary('1'));
      // A device that has never reported counts offline but isn't double-counted into any alert loop.
      expect(result.offline_devices).toBe(1);
      expect(result.alerts_count).toBe(0);
    });

    it('skips the alert/last-24h computation entirely when the device-bearing component has no product_id', async () => {
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset()),
        lastChildDevicesForAsset: () =>
          Promise.resolve([{ componentId: '1', deviceId: '10', productId: null }]),
        findLatestDeviceValue: () => Promise.resolve({ createdAt: new Date(), values: {} }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getStatusSummary('1'));
      expect(result.alerts_count).toBe(0);
      expect(result.alerts_last_24h).toBe(0);
      expect(result.online_devices).toBe(1);
    });
  });

  describe('Floor plans', () => {
    it("uploadFloorPlan: throws NotFoundError when the component isn't owned", async () => {
      const repo = fakeAssetsRepository({ findComponentById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () =>
          service.uploadFloorPlan({
            assetComponentId: '1',
            floorLevel: undefined,
            image: {
              buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
              contentType: 'image/png',
              extension: 'png',
            },
          })
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("uploadFloorPlan: throws ValidationError for bytes that aren't a real image (real content check, not just the MIME header)", async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(
        runWithContextAsync(ctx(), () =>
          service.uploadFloorPlan({
            assetComponentId: '1',
            floorLevel: undefined,
            image: {
              buffer: Buffer.from('not an image'),
              contentType: 'image/png',
              extension: 'png',
            },
          })
        )
      ).rejects.toThrow(ValidationError);
    });

    it('uploadFloorPlan: 201 on first upload, 200 on replace, reading real width/height from the image bytes', async () => {
      let upserted: unknown;
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        findFloorPlanByComponentId: () => Promise.resolve(undefined),
        upsertFloorPlan: (id, input) => {
          upserted = { id, input };
          return Promise.resolve({
            floorPlan: makeFloorPlan({ widthPx: input.widthPx, heightPx: input.heightPx }),
            replaced: false,
          });
        },
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () =>
        service.uploadFloorPlan({
          assetComponentId: '1',
          floorLevel: 2,
          image: {
            buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
            contentType: 'image/png',
            extension: 'png',
          },
        })
      );
      expect(result.status).toBe(201);
      expect(
        (upserted as { input: { widthPx: number; heightPx: number; floorLevel: number } }).input
      ).toMatchObject({
        widthPx: 1,
        heightPx: 1,
        floorLevel: 2,
      });
    });

    it('getFloorPlan: throws NotFoundError when the component is owned but has no floor plan uploaded yet', async () => {
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        findFloorPlanByComponentId: () => Promise.resolve(undefined),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      await expect(runWithContextAsync(ctx(), () => service.getFloorPlan('1'))).rejects.toThrow(
        NotFoundError
      );
    });

    it('getFloorPlan: returns the serialized shape (positioned_components/device_count/online_count/active_alarm_count) on success', async () => {
      const positioned = makeComponent({ id: '2', deviceId: '10', positionX: 0.2, positionY: 0.3 });
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        findFloorPlanByComponentId: () => Promise.resolve(makeFloorPlan()),
        listPositionedComponentsOnFloorPlan: () => Promise.resolve([positioned]),
        listActiveAlarmsForDevices: () => Promise.resolve([]),
      });
      const devices = fakeDevicesLookup({
        findByIdUnscoped: () =>
          Promise.resolve({
            id: '10',
            deviceUniqueIdentifier: 'dev-10',
            name: 'Sensor',
            status: 'active',
            createdAt: new Date(),
          }),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        devices,
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getFloorPlan('1'));
      const data = result.data as {
        device_count: number;
        online_count: number;
        active_alarm_count: number;
        positioned_components: unknown[];
      };
      expect(data.device_count).toBe(1);
      expect(data.online_count).toBe(1);
      expect(data.active_alarm_count).toBe(0);
      expect(data.positioned_components).toHaveLength(1);
    });

    it('getFloorPlan: attaches the truly most-recent active alarm per device (not the oldest, per Design notes)', async () => {
      const positioned = makeComponent({ id: '2', deviceId: '10', positionX: 0.2, positionY: 0.3 });
      const older = {
        deviceId: '10',
        conditionSnapshot: { a: 1 },
        triggeredValue: {},
        triggeredAt: new Date('2026-01-01'),
      };
      const newer = {
        deviceId: '10',
        conditionSnapshot: { a: 2 },
        triggeredValue: {},
        triggeredAt: new Date('2026-06-01'),
      };
      const repo = fakeAssetsRepository({
        findComponentById: () => Promise.resolve(makeComponent({ id: '1' })),
        findFloorPlanByComponentId: () => Promise.resolve(makeFloorPlan()),
        listPositionedComponentsOnFloorPlan: () => Promise.resolve([positioned]),
        listActiveAlarmsForDevices: () => Promise.resolve([older, newer]),
      });
      const devices = fakeDevicesLookup({ findByIdUnscoped: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        devices,
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getFloorPlan('1'));
      const data = result.data as {
        positioned_components: { active_alarm: { condition_snapshot: { a: number } } }[];
      };
      expect(data.positioned_components[0]?.active_alarm.condition_snapshot).toEqual({ a: 2 });
    });

    it("getBuildingFloorPlans: returns an empty result (not a 404) for an asset the caller doesn't own — matches the D-0075 hotfix", async () => {
      const repo = fakeAssetsRepository({ findById: () => Promise.resolve(undefined) });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getBuildingFloorPlans('1'));
      expect(result).toEqual({
        success: true,
        message: 'Building floor plans retrieved.',
        data: [],
      });
    });

    it('getBuildingFloorPlans: orders every floor under the asset by floor_level', async () => {
      const compA = makeComponent({ id: '1' });
      const compB = makeComponent({ id: '2' });
      const planHigh = makeFloorPlan({ id: '10', assetComponentId: '1', floorLevel: 5 });
      const planLow = makeFloorPlan({ id: '11', assetComponentId: '2', floorLevel: 0 });
      const repo = fakeAssetsRepository({
        findById: () => Promise.resolve(makeAsset({ companyId: '1' })),
        listAllComponentsForAsset: () => Promise.resolve([compA, compB]),
        findFloorPlanByComponentId: (componentId: string) =>
          Promise.resolve(
            componentId === '1' ? planHigh : componentId === '2' ? planLow : undefined
          ),
        listPositionedComponentsOnFloorPlan: () => Promise.resolve([]),
        listActiveAlarmsForDevices: () => Promise.resolve([]),
      });
      const service = new AssetsService(
        repo,
        fakeRulesLookup(),
        fakeDevicesLookup(),
        fakeProductsLookup(),
        fakeCompanyLookup()
      );
      const result = await runWithContextAsync(ctx(), () => service.getBuildingFloorPlans('1'));
      const data = result.data as { id: string }[];
      expect(data.map(d => d.id)).toEqual(['11', '10']);
    });
  });
});
