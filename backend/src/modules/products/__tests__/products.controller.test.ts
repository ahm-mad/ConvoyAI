import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { createErrorHandler } from '../../../platform/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../../platform/http/request-context.js';
import { logger } from '../../../platform/logging/logger.js';
import { signAccessToken } from '../../../platform/auth/jwt.js';
import { ProductsController } from '../products.controller.js';
import { ProductsService } from '../products.service.js';
import { createProductsRouter } from '../products.routes.js';
import { fakeProductsRepository, fakeProtocolsLookup, seedTemplate } from './fakes.js';
import type {
  PreconfigureTemplate,
  Product,
  ProductAttributePreference,
} from '../products.types.js';

function fakeRedis(): Redis {
  return { get: () => Promise.resolve(null) } as unknown as Redis;
}

function buildApp(
  seedProducts: Product[] = [],
  seedPreferences: ProductAttributePreference[] = []
) {
  const { repository, state } = fakeProductsRepository(seedProducts, seedPreferences);
  const service = new ProductsService(repository, fakeProtocolsLookup());
  const controller = new ProductsController(service);

  const app = express();
  app.use(express.json());
  app.use(createRequestContextMiddleware(fakeRedis()));
  app.use(createProductsRouter(controller));
  app.use(createErrorHandler(logger));
  return { app, state };
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

/** Factory, not a shared constant — the fake repository mutates preference rows in place, so each test needs its own object to stay isolated. */
function preferenceFixture(
  overrides: Partial<ProductAttributePreference> = {}
): ProductAttributePreference {
  return {
    id: '1',
    productId: '1',
    userId: '1',
    attributeKey: 'temperature',
    isSelected: true,
    isUniqueIdentifier: false,
    attributeRole: null,
    label: 'Temperature',
    unit: 'C',
    ruleId: '50',
    widgetId: '60',
    ...overrides,
  };
}

const TOKEN = signAccessToken({ sub: '1', companyId: '1', roles: [] });

describe('products routes: products CRUD', () => {
  it("GET /products: 200 with Laravel's real paginator envelope + filters (D-0107)", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app).get('/products').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Products fetched successfully.',
      data: {
        current_page: 1,
        data: [{ id: 1, name: 'Existing Product' }],
        total: 1,
        per_page: 10,
      },
      filters: { user_id: null, search: null, sort_by: 'id', sort_order: 'asc' },
    });
  });

  it("GET /products?page=1&per_page=10: resolves to the first page (D-0146: plain 1-based, not Laravel's offset formula)", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .get('/products?page=1&per_page=10')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { current_page: 1, data: [{ id: 1, name: 'Existing Product' }], total: 1 },
    });
  });

  it("GET /products?page=2&per_page=10: resolves to the second real page — D-0146 deliberately deviates from Laravel's offset formula (which this same request would have resolved to page 1 under)", async () => {
    const products = Array.from({ length: 11 }, (_, i) => ({
      ...PRODUCT,
      id: String(i + 1),
      name: `Product ${String(i + 1)}`,
    }));
    const { app } = buildApp(products);

    const res = await request(app)
      .get('/products?page=2&per_page=10')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { current_page: 2, data: [{ id: 11, name: 'Product 11' }], total: 11 },
    });
  });

  it("GET /products?user_id=<id with no products>: Laravel's real success:false shape, no `data` key at all", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .get('/products?user_id=999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: false,
      message: 'No products found for the specified user.',
      filters: { user_id: 999, search: null, sort_by: 'id', sort_order: 'asc' },
    });
  });

  it('GET /products with no token: 401', async () => {
    const { app } = buildApp();

    const res = await request(app).get('/products');

    expect(res.status).toBe(401);
  });

  it('POST /products: 201, brand-new-by-name mode, creates the device(s) inline (D-0046)', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        product_name: 'New Product',
        devices: [{ device_unique_identifier: 'dev-1', name: 'Sensor', location: 'Warehouse' }],
      });

    expect(res.status).toBe(201);
    const body = res.body as {
      success: boolean;
      product: { name: string };
      devices: { device_unique_identifier: string }[];
    };
    expect(body.success).toBe(true);
    expect(body.product.name).toBe('New Product');
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]?.device_unique_identifier).toBe('dev-1');
  });

  it("GET /products/{product}: 200 with the product's devices", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app).get('/products/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { devices: [] } });
  });

  it('PUT /products/{product}: 200, returns the bare model (no envelope, matches Laravel)', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .put('/products/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Renamed' });
  });

  it('DELETE /products/{product}: 204, no body', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app).delete('/products/1').set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('POST /products/bulk/destroy: 200 with deleted_count', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/products/bulk/destroy')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_ids: [1] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { deleted_count: 1 } });
  });

  it("GET /products/company/{company_id}: 200 with the caller's own company's products (company_id path param unused for scoping)", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .get('/products/company/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [{ id: 1 }] });
  });

  it("GET /products/company/{company_id}: 404 when the caller's company has no products", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/products/company/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });
});

describe('products routes: ingestion token (D-0047)', () => {
  it('POST /get-encrypt-token: 201 with the issued token envelope', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/get-encrypt-token')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, protocol_id: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, token: { product_id: 1, protocol_id: 1 } });
  });

  it('POST /get-encrypt-token: 404 for a nonexistent product', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/get-encrypt-token')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 999, protocol_id: 1 });

    expect(res.status).toBe(404);
  });
});

describe('products routes: product settings', () => {
  it("GET /product-settings/{id}: 200 for the owner, with Laravel's literal message (no trailing period) and `is_selected` as an integer 1/0 while `is_unique_identifier` stays boolean (D-0121)", async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .get('/product-settings/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Product settings retrieved successfully',
      product_id: 1,
      product_name: 'Existing Product',
    });
    expect(res.body).toMatchObject({
      user_preference_attributes: [
        { id: 1, attribute_key: 'temperature', is_selected: 1, is_unique_identifier: false },
      ],
    });
  });

  it("GET /product-settings/{id}: 403 for a non-owner, non-admin caller, with Laravel's literal message", async () => {
    const { app } = buildApp([PRODUCT]);
    const otherToken = signAccessToken({ sub: '2', companyId: '1', roles: [] });

    const res = await request(app)
      .get('/product-settings/1')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Unauthorized to access this product' });
  });

  it("GET /product-settings/{id}: 404 for a nonexistent product, with Laravel's literal (odd) message", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .get('/product-settings/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'No products found for this company.' });
  });

  it("POST /store-product-settings: requires at least one unique-identifier attribute (422 — D-0026's consistent validation-error shape, not Laravel's ad hoc 500)", async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/store-product-settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, product_name: 'Existing Product' });

    expect(res.status).toBe(422);
  });

  it("POST /store-product-settings: accepts the frontend's integer 1/0 preference_toggle values plus its extra keys (D-0123)", async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture({ isUniqueIdentifier: true })]);

    const res = await request(app)
      .post('/store-product-settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        product_id: '1',
        product_name: 'Existing Product',
        preference_toggle: { '1': 1 },
        user_preferences: ['temperature'],
        attributes: [{ label: 'x', value: 'y' }],
        token: 'abc',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /store-product-settings: preference_toggle may be null (Laravel: nullable|array) (D-0123)', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture({ isUniqueIdentifier: true })]);

    const res = await request(app)
      .post('/store-product-settings')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, product_name: 'Existing Product', preference_toggle: null });

    expect(res.status).toBe(200);
  });

  describe("POST /store-product-settings: Laravel's user scoping and pre-write checks (D-0124)", () => {
    const post = (app: ReturnType<typeof buildApp>['app'], body: Record<string, unknown>) =>
      request(app)
        .post('/store-product-settings')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ product_id: 1, product_name: 'Renamed', ...body });

    it("only the caller's own preference rows count: another user's unique identifier does not satisfy the requirement", async () => {
      const { app } = buildApp(
        [PRODUCT],
        [preferenceFixture({ isUniqueIdentifier: true, userId: '2' })]
      );

      const res = await post(app, {});

      expect(res.status).toBe(422);
      expect((res.body as { message: string }).message).toMatch(
        /At least one attribute must be marked as unique/
      );
    });

    it("a toggle for another user's preference row is 'not found'", async () => {
      const { app } = buildApp(
        [PRODUCT],
        [
          preferenceFixture({ id: '1', isUniqueIdentifier: true }),
          preferenceFixture({ id: '2', userId: '2', isUniqueIdentifier: false }),
        ]
      );

      const res = await post(app, { preference_toggle: { '2': 1 } });

      expect(res.status).toBe(422);
      expect((res.body as { message: string }).message).toBe(
        'Preference record for attribute not found.'
      );
    });

    it("a selected non-unique attribute with no settings row is rejected with Laravel's message, and nothing is written", async () => {
      const { app, state } = buildApp(
        [PRODUCT],
        [
          preferenceFixture({ id: '1', isUniqueIdentifier: true }),
          preferenceFixture({
            id: '2',
            isUniqueIdentifier: false,
            isSelected: false,
            ruleId: null,
            widgetId: null,
          }),
        ]
      );

      const res = await post(app, { preference_toggle: { '2': 1 } });

      expect(res.status).toBe(422);
      expect((res.body as { message: string }).message).toBe(
        "The attribute '2' doesn't have its setting. Please save them for further processing."
      );
      expect(state.preferences.get('2')?.isSelected).toBe(false);
      expect(state.products.get('1')?.name).toBe('Existing Product');
    });

    it('an unselected attribute with no settings row is fine (the check only covers selected ones)', async () => {
      const { app } = buildApp(
        [PRODUCT],
        [
          preferenceFixture({ id: '1', isUniqueIdentifier: true }),
          preferenceFixture({
            id: '2',
            isUniqueIdentifier: false,
            isSelected: true,
            ruleId: null,
            widgetId: null,
          }),
        ]
      );

      const res = await post(app, { preference_toggle: { '2': 0 } });

      expect(res.status).toBe(200);
    });

    it("unknown product_id is a 422 'selected product id is invalid'", async () => {
      const { app } = buildApp([PRODUCT], [preferenceFixture({ isUniqueIdentifier: true })]);

      const res = await post(app, { product_id: 999 });

      expect(res.status).toBe(422);
      expect((res.body as { message: string }).message).toBe('The selected product id is invalid.');
    });

    it('blank / whitespace-only product_name is rejected; a padded name is stored trimmed', async () => {
      const { app, state } = buildApp([PRODUCT], [preferenceFixture({ isUniqueIdentifier: true })]);

      expect((await post(app, { product_name: '' })).status).toBe(422);
      expect((await post(app, { product_name: '   ' })).status).toBe(422);

      const ok = await post(app, { product_name: '  Padded  ' });
      expect(ok.status).toBe(200);
      expect(state.products.get('1')?.name).toBe('Padded');
    });
  });

  it('POST /store-user-preferences-attributes: 200 (11.46 — accepted values are not actually persisted anywhere)', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/store-user-preferences-attributes')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, user_id: 1, user_preference_packet_values: { foo: 'bar' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe('products routes: attribute preferences (D-0048)', () => {
  it('POST /attribute/preference/setting/store: 201, always creates a Rule/Widget even with no widget_type/alert_settings (11.45)', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/attribute/preference/setting/store')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, attribute_key: 'humidity', label: 'Humidity' });

    expect(res.status).toBe(201);
    const body = res.body as { data: { rule_id: number | null; widget_id: number | null } };
    expect(body.data.rule_id).not.toBeNull();
    expect(body.data.widget_id).not.toBeNull();
  });

  it('GET /attribute/preference/{id}: 200', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .get('/attribute/preference/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: 1, attribute_key: 'temperature' } });
  });

  it('GET /attribute/preference/{id}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/attribute/preference/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('GET /attribute/preference/setting/{id}: 200', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .get('/attribute/preference/setting/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      productAttributeData: {
        id: 1,
        is_unique_identifier: 0,
        is_selected: 1,
        created_at: '2026-08-19 13:36:02',
      },
      productAttributeSetting: null,
      productAttributeSettingUnit: null,
      enabled: null,
    });
  });

  it('GET /attribute/preference/setting/{id}: 404 body carries success:true like Laravel (D-0122)', async () => {
    const { app } = buildApp([PRODUCT], []);

    const res = await request(app)
      .get('/attribute/preference/setting/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: true, message: 'Attribute preference not found' });
  });

  it('PUT /attribute/preference/setting/{id}: 200', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .put('/attribute/preference/setting/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ label: 'New Label' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { label: 'New Label' } });
  });

  it('DELETE /attribute/preference/setting/{id}: 200', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .delete('/attribute/preference/setting/1')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /attribute/preference/marked-as-unique: 200', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .post('/attribute/preference/marked-as-unique')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, attribute_key: 'temperature' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /attribute/preference/unmark-unique: 404 when no matching unique identifier exists', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .post('/attribute/preference/unmark-unique')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, attribute_key: 'temperature' });

    expect(res.status).toBe(404);
  });

  it('POST /attribute/preference/mapping-preview: 200, uses the shared PayloadMapper (D-0049)', async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .post('/attribute/preference/mapping-preview')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ product_id: 1, sample_payload: { temperature: 21.5, humidity: 40 } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { mapped_count: 1, mapping: [{ source_field: 'temperature', value: 21.5 }] },
    });
  });

  it('POST /attribute/preference/select and /unselect: 404 (11.18 — routed in Laravel but never implemented, x-known-broken)', async () => {
    const { app } = buildApp();

    const selectRes = await request(app)
      .post('/attribute/preference/select')
      .set('Authorization', `Bearer ${TOKEN}`);
    const unselectRes = await request(app)
      .post('/attribute/preference/unselect')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(selectRes.status).toBe(404);
    expect(unselectRes.status).toBe(404);
  });
});

describe('products routes: preconfigure templates', () => {
  it('GET /preconfigure-templates: 200', async () => {
    const { app, state } = buildApp();
    const template: PreconfigureTemplate = {
      id: '9',
      companyId: null,
      createdBy: null,
      name: 'Global Template',
      manufacturer: 'Acme',
      description: null,
      image: null,
      configuration: { fields: [] },
      fields: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    seedTemplate(state, template, []);

    const res = await request(app)
      .get('/preconfigure-templates')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { current_page: 1, data: [{ id: 9, name: 'Global Template' }], total: 1 },
    });
  });

  it('POST /preconfigure-templates: 201, company-scoped to the caller', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/preconfigure-templates')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        name: 'My Template',
        fields: [{ attribute_key: 'temperature', label: 'Temperature' }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { name: 'My Template', company_id: 1 } });
  });

  it('GET /preconfigure-templates/manufacturers: 200', async () => {
    const { app, state } = buildApp();
    seedTemplate(
      state,
      {
        id: '9',
        companyId: null,
        createdBy: null,
        name: 'Global Template',
        manufacturer: 'Acme',
        description: null,
        image: null,
        configuration: { fields: [] },
        fields: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      []
    );

    const res = await request(app)
      .get('/preconfigure-templates/manufacturers')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: ['Acme'] });
  });

  it("POST /preconfigure-templates/from-product/{productId}: 201, built from the product's real attribute preferences", async () => {
    const { app } = buildApp([PRODUCT], [preferenceFixture()]);

    const res = await request(app)
      .post('/preconfigure-templates/from-product/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'From Product' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { name: 'From Product' } });
  });

  it('POST /preconfigure-templates/from-product/{productId}: 422 when the product has no configured fields', async () => {
    const { app } = buildApp([PRODUCT]);

    const res = await request(app)
      .post('/preconfigure-templates/from-product/1')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'From Product' });

    expect(res.status).toBe(422);
  });

  it('GET /preconfigure-templates/{id}: 200', async () => {
    const { app, state } = buildApp();
    seedTemplate(
      state,
      {
        id: '9',
        companyId: null,
        createdBy: null,
        name: 'Global Template',
        manufacturer: 'Acme',
        description: null,
        image: null,
        configuration: { fields: [] },
        fields: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      []
    );

    const res = await request(app)
      .get('/preconfigure-templates/9')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { id: 9 } });
  });

  it('GET /preconfigure-templates/{id}: 404 for a missing id', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/preconfigure-templates/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });
});
