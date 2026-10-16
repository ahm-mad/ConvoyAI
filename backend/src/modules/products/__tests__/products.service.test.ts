import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { mapPayload } from '../../../shared/utils/payload-mapper.js';
import { ProductsService } from '../products.service.js';
import { fakeProductsRepository, fakeProtocolsLookup, seedTemplate } from './fakes.js';
import type {
  PreconfigureTemplate,
  Product,
  ProductAttributePreference,
} from '../products.types.js';

function contextFor(
  userId: string,
  companyId: string | undefined,
  roles: string[] = []
): RequestContext {
  return { userId, companyId, roles, perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

const PRODUCT: Product = {
  id: '1',
  name: 'Existing Product',
  status: 'active',
  companyId: '1',
  createdBy: '1',
  deviceProtocolId: null,
  preconfigureTemplateId: null,
  devicesCount: 0,
  attributePreferencesCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const DEVICE_INPUT = { deviceUniqueIdentifier: 'dev-1', name: 'Sensor', location: 'Warehouse' };

describe('ProductsService', () => {
  describe('createProduct', () => {
    it('existing_product_id mode: reuses the product, only creates the device(s)', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const result = await service.createProduct(
        {
          existingProductId: '1',
          preconfigureTemplateId: undefined,
          productName: undefined,
          deviceProtocolId: undefined,
          devices: [DEVICE_INPUT],
          csvFile: undefined,
        },
        '1',
        '1'
      );

      expect(result.product.id).toBe('1');
      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]?.deviceUniqueIdentifier).toBe('dev-1');
      expect(state.products.get('1')?.devicesCount).toBe(1);
    });

    it("existing_product_id mode 404s when the product doesn't exist/isn't in-tenant", async () => {
      const { repository } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        service.createProduct(
          {
            existingProductId: '999',
            preconfigureTemplateId: undefined,
            productName: undefined,
            deviceProtocolId: undefined,
            devices: [DEVICE_INPUT],
            csvFile: undefined,
          },
          '1',
          '1'
        )
      ).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('preconfigure_template_id mode: creates the product from the template and seeds attribute preferences with a Rule/Widget each', async () => {
      const { repository, state } = fakeProductsRepository();
      const template: PreconfigureTemplate = {
        id: '5',
        companyId: '1',
        createdBy: '1',
        name: 'Sensor Kit',
        manufacturer: 'Acme',
        description: null,
        image: null,
        configuration: { fields: [] },
        fields: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      seedTemplate(state, template, [
        { attribute_key: 'temperature', label: 'Temperature', unit: 'C' },
      ]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const result = await service.createProduct(
        {
          existingProductId: undefined,
          preconfigureTemplateId: '5',
          productName: undefined,
          deviceProtocolId: undefined,
          devices: [DEVICE_INPUT],
          csvFile: undefined,
        },
        '1',
        '1'
      );

      expect(result.product.name).toBe('Sensor Kit');
      expect(result.product.preconfigureTemplateId).toBe('5');
      const preference = [...state.preferences.values()].find(
        p => p.attributeKey === 'temperature'
      );
      expect(preference?.label).toBe('Temperature');
      expect(preference?.ruleId).toBeTruthy();
      expect(preference?.widgetId).toBeTruthy();
    });

    it("preconfigure_template_id mode 404s when the template doesn't exist/isn't visible to the caller's company", async () => {
      const { repository } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: '999',
            productName: undefined,
            deviceProtocolId: undefined,
            devices: [DEVICE_INPUT],
            csvFile: undefined,
          },
          '1',
          '1'
        )
      ).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('brand-new-by-name mode: creates a fresh product with the given name', async () => {
      const { repository, state } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const result = await service.createProduct(
        {
          existingProductId: undefined,
          preconfigureTemplateId: undefined,
          productName: 'My New Product',
          deviceProtocolId: undefined,
          devices: [DEVICE_INPUT],
          csvFile: undefined,
        },
        '1',
        '1'
      );

      expect(result.product.name).toBe('My New Product');
      expect(state.products.get(result.product.id)?.createdBy).toBe('1');
    });

    it('brand-new-by-name mode rejects when no product_name/existing_product_id/preconfigure_template_id is given', async () => {
      const { repository } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: undefined,
            deviceProtocolId: undefined,
            devices: [DEVICE_INPUT],
            csvFile: undefined,
          },
          '1',
          '1'
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('D-0106: device_protocol_id: null (client not choosing one) creates the product with no protocol, not a crash', async () => {
      const { repository, state } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const result = await service.createProduct(
        {
          existingProductId: undefined,
          preconfigureTemplateId: undefined,
          productName: 'No Protocol Product',
          deviceProtocolId: undefined, // controller already collapses a real `null` to `undefined` for create
          devices: [DEVICE_INPUT],
          csvFile: undefined,
        },
        '1',
        '1'
      );

      expect(state.products.get(result.product.id)?.deviceProtocolId).toBeNull();
    });

    it("D-0106: a real-but-nonexistent device_protocol_id 422s with Laravel's exact message, never reaches the repository", async () => {
      const { repository } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup([])); // nothing exists

      await expect(
        service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'Bad Protocol Product',
            deviceProtocolId: '999',
            devices: [DEVICE_INPUT],
            csvFile: undefined,
          },
          '1',
          '1'
        )
      ).rejects.toMatchObject({
        httpStatus: 422,
        message: 'Selected device protocol was not found.',
      });
    });

    it('D-0106: a real, existing device_protocol_id is accepted', async () => {
      const { repository, state } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup(['3']));

      const result = await service.createProduct(
        {
          existingProductId: undefined,
          preconfigureTemplateId: undefined,
          productName: 'Real Protocol Product',
          deviceProtocolId: '3',
          devices: [DEVICE_INPUT],
          csvFile: undefined,
        },
        '1',
        '1'
      );

      expect(state.products.get(result.product.id)?.deviceProtocolId).toBe('3');
    });

    describe('D-0148: CSV bulk-import merge/validate/partial-success', () => {
      const csv = (rows: string) =>
        Buffer.from(`device_unique_identifier,name,location\n${rows}\n`);

      it('a CSV-only submission (empty devices[]) creates every valid row', async () => {
        const { repository, state } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        const result = await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'CSV Only',
            deviceProtocolId: undefined,
            devices: [],
            csvFile: csv('csv-1,Sensor A,Loc A\ncsv-2,Sensor B,Loc B'),
          },
          '1',
          '1'
        );

        expect(result.devices.map(d => d.deviceUniqueIdentifier).sort()).toEqual([
          'csv-1',
          'csv-2',
        ]);
        expect(result.importSummary).toEqual({
          manualCount: 0,
          csvCount: 2,
          createdCount: 2,
          failedCount: 0,
          errors: [],
        });
        expect(state.products.get(result.product.id)?.devicesCount).toBe(2);
      });

      it('merges manual + CSV rows into one product', async () => {
        const { repository } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        const result = await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'Merged',
            deviceProtocolId: undefined,
            devices: [
              { deviceUniqueIdentifier: 'manual-1', name: 'Manual Sensor', location: 'Manual Loc' },
            ],
            csvFile: csv('csv-1,CSV Sensor,CSV Loc'),
          },
          '1',
          '1'
        );

        expect(result.devices.map(d => d.deviceUniqueIdentifier).sort()).toEqual([
          'csv-1',
          'manual-1',
        ]);
        expect(result.importSummary).toMatchObject({
          manualCount: 1,
          csvCount: 1,
          createdCount: 2,
          failedCount: 0,
        });
      });

      it('a bad row (missing field) is reported in import_summary.errors, valid rows still created', async () => {
        const { repository } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        const result = await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'Partial',
            deviceProtocolId: undefined,
            devices: [],
            csvFile: csv('csv-1,Good Sensor,Good Loc\ncsv-2,,Missing Name Loc'),
          },
          '1',
          '1'
        );

        expect(result.devices.map(d => d.deviceUniqueIdentifier)).toEqual(['csv-1']);
        expect(result.importSummary).toMatchObject({
          csvCount: 2,
          createdCount: 1,
          failedCount: 1,
        });
        expect(result.importSummary.errors).toEqual([
          {
            source: 'csv',
            index: undefined,
            row: 2,
            deviceUniqueIdentifier: 'csv-2',
            errors: ['name is required'],
          },
        ]);
        // The product itself is still created even though one row failed (D-0148's documented choice).
        expect(result.product.name).toBe('Partial');
      });

      it('rejects an in-submission duplicate identifier (manual-vs-CSV), keeps the first occurrence', async () => {
        const { repository } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        const result = await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'Dup',
            deviceProtocolId: undefined,
            devices: [
              { deviceUniqueIdentifier: 'dup-1', name: 'Manual Sensor', location: 'Manual Loc' },
            ],
            csvFile: csv('dup-1,CSV Sensor,CSV Loc'),
          },
          '1',
          '1'
        );

        expect(result.devices.map(d => d.deviceUniqueIdentifier)).toEqual(['dup-1']);
        expect(result.importSummary).toMatchObject({ createdCount: 1, failedCount: 1 });
        expect(result.importSummary.errors[0]).toMatchObject({
          source: 'csv',
          deviceUniqueIdentifier: 'dup-1',
          errors: ['duplicate device_unique_identifier within this submission'],
        });
      });

      it('D-0148: restores real Laravel parity -- rejects a device_unique_identifier already used anywhere (a different product, a different company)', async () => {
        const { repository, state } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());
        // Seed an existing device under a completely different product.
        await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'Other Product',
            deviceProtocolId: undefined,
            devices: [
              {
                deviceUniqueIdentifier: 'already-used',
                name: 'Existing',
                location: 'Existing Loc',
              },
            ],
            csvFile: undefined,
          },
          '1',
          '1'
        );

        const result = await service.createProduct(
          {
            existingProductId: undefined,
            preconfigureTemplateId: undefined,
            productName: 'New Product',
            deviceProtocolId: undefined,
            devices: [{ deviceUniqueIdentifier: 'already-used', name: 'New', location: 'New Loc' }],
            csvFile: undefined,
          },
          '1',
          '1'
        );

        expect(result.devices).toHaveLength(0);
        expect(result.importSummary).toMatchObject({ createdCount: 0, failedCount: 1 });
        expect(result.importSummary.errors[0]).toMatchObject({
          deviceUniqueIdentifier: 'already-used',
          errors: ['device_unique_identifier has already been used'],
        });
        // The product is still created even though its only device was rejected.
        expect(state.products.get(result.product.id)?.name).toBe('New Product');
      });

      it('rejects the whole request when neither devices nor a CSV file is submitted', async () => {
        const { repository } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        await expect(
          service.createProduct(
            {
              existingProductId: undefined,
              preconfigureTemplateId: undefined,
              productName: 'Nothing',
              deviceProtocolId: undefined,
              devices: [],
              csvFile: undefined,
            },
            '1',
            '1'
          )
        ).rejects.toMatchObject({ httpStatus: 422 });
      });

      it("rejects the whole request (nothing created) when the CSV can't be parsed at all", async () => {
        const { repository, state } = fakeProductsRepository();
        const service = new ProductsService(repository, fakeProtocolsLookup());

        await expect(
          service.createProduct(
            {
              existingProductId: undefined,
              preconfigureTemplateId: undefined,
              productName: 'Bad CSV',
              deviceProtocolId: undefined,
              devices: [],
              csvFile: Buffer.from(
                'device_unique_identifier,name,location\n"unterminated,Sensor,Loc\n'
              ),
            },
            '1',
            '1'
          )
        ).rejects.toMatchObject({ httpStatus: 422 });
        expect(state.products.size).toBe(0);
      });
    });
  });

  describe('updateProduct', () => {
    it("D-0106: device_protocol_id: null explicitly clears it (Laravel's own update rule allows this, unlike preconfigure_template_id)", async () => {
      const { repository, state } = fakeProductsRepository([{ ...PRODUCT, deviceProtocolId: '3' }]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const updated = await service.updateProduct('1', {
        name: undefined,
        preconfigureTemplateId: undefined,
        deviceProtocolId: null,
      });

      expect(updated.deviceProtocolId).toBeNull();
      expect(state.products.get('1')?.deviceProtocolId).toBeNull();
    });

    it('D-0106: a real-but-nonexistent device_protocol_id 422s, never reaches the repository', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup([]));

      await expect(
        service.updateProduct('1', {
          name: undefined,
          preconfigureTemplateId: undefined,
          deviceProtocolId: '999',
        })
      ).rejects.toMatchObject({
        httpStatus: 422,
        message: 'Selected device protocol was not found.',
      });
    });

    it("D-0106: a real-but-nonexistent preconfigure_template_id 404s, never reaches the repository (this check didn't exist at all before)", async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        service.updateProduct('1', {
          name: undefined,
          preconfigureTemplateId: '999',
          deviceProtocolId: undefined,
        })
      ).rejects.toMatchObject({ httpStatus: 404, message: 'Selected template was not found.' });
    });
  });

  describe('getProductSettings', () => {
    it('404s for a missing/cross-tenant product', async () => {
      const { repository } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        runWithContextAsync(contextFor('1', '1'), () => service.getProductSettings('999'))
      ).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('403s for a caller who is neither the owner nor admin/super_admin', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        runWithContextAsync(contextFor('2', '1'), () => service.getProductSettings('1'))
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('allows the owner', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const settings = await runWithContextAsync(contextFor('1', '1'), () =>
        service.getProductSettings('1')
      );

      expect(settings.productId).toBe('1');
      expect(settings.productName).toBe('Existing Product');
    });

    it('allows a caller with the admin role even when not the owner', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const settings = await runWithContextAsync(contextFor('2', '1', ['admin']), () =>
        service.getProductSettings('1')
      );

      expect(settings.productId).toBe('1');
    });

    it('allows a caller with the super_admin role even when not the owner', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const settings = await runWithContextAsync(contextFor('2', '1', ['super_admin']), () =>
        service.getProductSettings('1')
      );

      expect(settings.productId).toBe('1');
    });
  });

  describe('attribute preferences (D-0048)', () => {
    it('createAttributePreference always creates a Rule/Widget, even with no widget_type/alert_settings (11.45)', async () => {
      const { repository, state } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const preference = await service.createAttributePreference(
        {
          productId: '1',
          attributeKey: 'humidity',
          label: 'Humidity',
          widgetType: undefined,
          unit: undefined,
          alertSettings: undefined,
        },
        '1'
      );

      expect(preference.ruleId).toBeTruthy();
      expect(preference.widgetId).toBeTruthy();
      expect(state.ensureRuleAndWidgetCalls).toHaveLength(1);
      expect(state.ensureRuleAndWidgetCalls[0]).toMatchObject({
        productId: '1',
        attributeKey: 'humidity',
      });
    });

    it('updateAttributePreference re-runs ensureRuleAndWidget when label/widget_type/alert_settings change', async () => {
      const existing: ProductAttributePreference = {
        id: '10',
        productId: '1',
        userId: '1',
        attributeKey: 'humidity',
        isSelected: true,
        isUniqueIdentifier: false,
        attributeRole: null,
        label: 'Old Label',
        unit: null,
        ruleId: '100',
        widgetId: '200',
      };
      const { repository, state } = fakeProductsRepository([], [existing]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const updated = await service.updateAttributePreference(
        '10',
        {
          productId: undefined,
          attributeKey: undefined,
          unit: undefined,
          label: 'New Label',
          widgetType: undefined,
          alertSettings: undefined,
        },
        '1'
      );

      expect(updated.label).toBe('New Label');
      expect(state.ensureRuleAndWidgetCalls).toHaveLength(1);
      // Reuses the existing rule/widget ids rather than minting new ones.
      expect(updated.ruleId).toBe('100');
      expect(updated.widgetId).toBe('200');
    });

    it('updateAttributePreference leaves the Rule/Widget untouched when neither label, widget_type, nor alert_settings change', async () => {
      const existing: ProductAttributePreference = {
        id: '11',
        productId: '1',
        userId: '1',
        attributeKey: 'humidity',
        isSelected: true,
        isUniqueIdentifier: false,
        attributeRole: null,
        label: 'Label',
        unit: null,
        ruleId: '100',
        widgetId: '200',
      };
      const { repository, state } = fakeProductsRepository([], [existing]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await service.updateAttributePreference(
        '11',
        {
          productId: undefined,
          attributeKey: 'humidity_v2',
          unit: undefined,
          label: undefined,
          widgetType: undefined,
          alertSettings: undefined,
        },
        '1'
      );

      expect(state.ensureRuleAndWidgetCalls).toHaveLength(0);
    });
  });

  describe('previewMapping (D-0049)', () => {
    it("delegates to the shared mapPayload utility, filtered to the product's selected attribute keys", async () => {
      const preferences: ProductAttributePreference[] = [
        {
          id: '1',
          productId: '1',
          userId: '1',
          attributeKey: 'temperature',
          isSelected: true,
          isUniqueIdentifier: false,
          attributeRole: null,
          label: 'Temp',
          unit: 'C',
          ruleId: null,
          widgetId: null,
        },
      ];
      const { repository } = fakeProductsRepository([], preferences);
      const service = new ProductsService(repository, fakeProtocolsLookup());
      const samplePayload = { temperature: 21.5, humidity: 40, meta: { device: 'x' } };

      const result = await service.previewMapping('1', samplePayload);

      const expected = mapPayload(samplePayload, ['temperature']);
      expect(result.mappedCount).toBe(expected.matchedKeys.length);
      expect(result.availableCount).toBe(expected.availableKeys.length);
      expect(result.mapping).toEqual(
        expected.matchedKeys.map(key => ({
          sourceField: key,
          pointKey: key,
          value: expected.flattened[key],
        }))
      );
      expect(result.mapping).toEqual([
        { sourceField: 'temperature', pointKey: 'temperature', value: 21.5 },
      ]);
      expect(result.unmappedFields.sort()).toEqual(['humidity', 'meta.device']);
    });
  });

  describe('issueIngestionToken', () => {
    it('mints a new token on the first call for a product/protocol/user triple', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const token = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );

      expect(token.token).not.toBe('');
      expect(state.tokens).toHaveLength(1);
    });

    it('reuses the same still-unconsumed token instead of minting a new one on a re-call (the actual fix)', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const first = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );
      const second = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );

      expect(second.token).toBe(first.token);
      expect(state.tokens).toHaveLength(1); // no orphaned second placeholder row
    });

    it("prefers a token that's already been consumed by a real packet over an unused one", async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const consumed = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );
      const row = state.tokens.find(t => t.token === consumed.token);
      if (row) row.jsonBody = { some: 'real packet' }; // simulate a device having actually used it
      state.tokens.push({
        id: 'zombie',
        productId: '1',
        protocolId: '2',
        userId: '1',
        token: 'unused-token',
        jsonBody: null,
      });

      const reissued = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );

      expect(reissued.token).toBe(consumed.token);
    });

    it('different protocols on the same product each get their own token', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const https = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '2')
      );
      const mqtt = await runWithContextAsync(contextFor('1', '1'), () =>
        service.issueIngestionToken('1', '3')
      );

      expect(https.token).not.toBe(mqtt.token);
      expect(state.tokens).toHaveLength(2);
    });
  });

  describe('GPS attribute roles — markRole / unmarkRole (D-0154, owner decision D1)', () => {
    const owner = () => contextFor('1', '1');

    it('marks an attribute as a role without any label/unit/alert settings, creating the preference row when needed', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());

      const result = await runWithContextAsync(owner(), () =>
        service.markRole('1', 'object.latitude', 'latitude', '1')
      );

      expect(result).toEqual({
        productId: '1',
        attributeKey: 'object.latitude',
        attributeRole: 'latitude',
        replacedAttributeKey: null,
      });
      const row = [...state.preferences.values()].find(p => p.attributeKey === 'object.latitude');
      expect(row).toMatchObject({
        attributeRole: 'latitude',
        isSelected: true,
        label: null,
        ruleId: null,
      });
    });

    it('choosing a role another attribute already holds MOVES it and reports the replaced key (one attribute per role)', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());
      await runWithContextAsync(owner(), () =>
        service.markRole('1', 'object.lat_old', 'latitude', '1')
      );

      const result = await runWithContextAsync(owner(), () =>
        service.markRole('1', 'object.latitude', 'latitude', '1')
      );

      expect(result.replacedAttributeKey).toBe('object.lat_old');
      const roles = [...state.preferences.values()].filter(p => p.attributeRole === 'latitude');
      expect(roles.map(p => p.attributeKey)).toEqual(['object.latitude']);
    });

    it("404s for a product outside the caller's company, and never touches the repository's role state", async () => {
      const { repository, state } = fakeProductsRepository();
      const service = new ProductsService(repository, fakeProtocolsLookup());

      await expect(
        runWithContextAsync(owner(), () => service.markRole('999', 'x', 'latitude', '1'))
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(state.preferences.size).toBe(0);
    });

    it('422s (fixed message) when the attribute is the unique identifier — and the reverse: mark-as-unique 422s on a role attribute', async () => {
      const { repository } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());
      await runWithContextAsync(owner(), () =>
        service.markAsUniqueIdentifier('1', 'deviceInfo.devEui', '1')
      );
      await runWithContextAsync(owner(), () =>
        service.markRole('1', 'object.latitude', 'latitude', '1')
      );

      await expect(
        runWithContextAsync(owner(), () =>
          service.markRole('1', 'deviceInfo.devEui', 'longitude', '1')
        )
      ).rejects.toThrow(
        "This attribute is the unique identifier and can't also be a location attribute."
      );
      await expect(
        runWithContextAsync(owner(), () =>
          service.markAsUniqueIdentifier('1', 'object.latitude', '1')
        )
      ).rejects.toThrow(
        "This attribute is a location attribute and can't also be the unique identifier."
      );
    });

    it('unmarkRole clears the role (a role-only row disappears) and 404s when the attribute has none', async () => {
      const { repository, state } = fakeProductsRepository([PRODUCT]);
      const service = new ProductsService(repository, fakeProtocolsLookup());
      await runWithContextAsync(owner(), () =>
        service.markRole('1', 'object.latitude', 'latitude', '1')
      );

      await runWithContextAsync(owner(), () => service.unmarkRole('1', 'object.latitude'));

      expect([...state.preferences.values()].some(p => p.attributeKey === 'object.latitude')).toBe(
        false
      );
      await expect(
        runWithContextAsync(owner(), () => service.unmarkRole('1', 'object.latitude'))
      ).rejects.toMatchObject({
        httpStatus: 404,
        message: 'No location role found for this attribute.',
      });
    });
  });
});
