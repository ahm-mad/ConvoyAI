import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { ProductsRepository } from '../products.repository.js';
import type { CreateDeviceInput } from '../products.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"), same
 * skip-if-unreachable convention as this project's other integration
 * suites. This module's real risk is schema/query correctness (cross-
 * table joins, cascade deletes, NOT NULL columns) rather than business
 * logic — this suite, plus the manual live verification recorded in
 * `tasks/05-products.md`'s Progress log, is where that risk was actually
 * caught (11.46-adjacent `device_values` tenant-rule registration gap,
 * found live, not by a unit test).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@products-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Products Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string, timezone?: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: companyId,
      ...(timezone !== undefined ? { timezone } : {}),
    },
  });
}

const DEVICE: CreateDeviceInput = {
  deviceUniqueIdentifier: `dev-${MARK}`,
  name: 'Sensor A',
  location: 'Warehouse',
};

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const testCompanies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map(c => c.id);
  const testUsers = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testUserIds = testUsers.map(u => u.id);
  const testProducts = await rawPrisma.products.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);
  const testDevices = await rawPrisma.devices.findMany({
    where: { product_id: { in: testProductIds } },
    select: { id: true, device_unique_identifier: true },
  });
  const testWidgets = await rawPrisma.widgets.findMany({
    where: { created_by: { in: testUserIds } },
    select: { id: true },
  });
  const testRules = await rawPrisma.rules.findMany({
    where: { user_id: { in: testUserIds } },
    select: { id: true },
  });

  await rawPrisma.widget_settings.deleteMany({
    where: { widget_id: { in: testWidgets.map(w => w.id) } },
  });
  await rawPrisma.product_attribute_preference_settings.deleteMany({
    where: { rule_id: { in: testRules.map(r => r.id) } },
  });
  await rawPrisma.product_attribute_preferences.deleteMany({
    where: { product_id: { in: testProductIds } },
  });
  await rawPrisma.widgets.deleteMany({ where: { id: { in: testWidgets.map(w => w.id) } } });
  await rawPrisma.rules.deleteMany({ where: { id: { in: testRules.map(r => r.id) } } });
  await rawPrisma.device_values.deleteMany({
    where: { device_unique_identifier: { in: testDevices.map(d => d.device_unique_identifier) } },
  });
  await rawPrisma.devices.deleteMany({ where: { id: { in: testDevices.map(d => d.id) } } });
  await rawPrisma.raw_packet_values.deleteMany({ where: { product_id: { in: testProductIds } } });
  await rawPrisma.preconfigure_templates.deleteMany({
    where: { company_id: { in: testCompanyIds } },
  });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.protocols.deleteMany({ where: { name: { contains: MARK } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('ProductsRepository (real Postgres)', () => {
  it("creates a product + devices, scoped to the caller's own company", async () => {
    const company = await seedCompany('a');
    const user = await seedUser(company.id, 'a');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Test Product',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    expect(product.companyId).toBe(company.id.toString());

    const devices = await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [DEVICE])
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]?.userId).toBe(user.id.toString());

    const found = await runWithContextAsync(context, () => repo.findById(product.id));
    expect(found?.devicesCount).toBe(1);
  });

  it('findById is scoped: a cross-tenant product id returns undefined', async () => {
    const companyA = await seedCompany('b');
    const companyB = await seedCompany('c');
    const userB = await seedUser(companyB.id, 'b');
    const repo = new ProductsRepository(prisma);
    const contextB = contextFor(userB.id.toString(), companyB.id.toString());

    const productB = await runWithContextAsync(contextB, () =>
      repo.create({
        name: "B's Product",
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: userB.id.toString(),
      })
    );

    const seenAsA = await runWithContextAsync(contextFor('0', companyA.id.toString()), () =>
      repo.findById(productB.id)
    );
    expect(seenAsA).toBeUndefined();
  });

  it('bulkDelete cascades devices/device_values/attribute preferences/raw_packet_values (the device_values tenant-rule gap this session found live)', async () => {
    const company = await seedCompany('d');
    const user = await seedUser(company.id, 'd');
    const protocol = await rawPrisma.protocols.create({
      data: { name: `Protocol${MARK}`, category: 'transport' },
    });
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'To Delete',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    const [device] = await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [DEVICE])
    );
    if (!device) throw new Error('expected createDevices to return a device');
    // `created_at` is now NOT NULL at the DB level (the Timescale hypertable
    // migration, D-0054) — `rawPrisma` bypasses the `timestamps.ts` extension
    // that fills this in for real application writes.
    await rawPrisma.device_values.create({
      data: {
        device_id: BigInt(device.id),
        device_unique_identifier: device.deviceUniqueIdentifier,
        values: {},
        created_at: new Date(),
      },
    });
    await runWithContextAsync(context, () =>
      repo.createIngestionToken(product.id, protocol.id.toString(), 'unused-token')
    );

    const deletedCount = await runWithContextAsync(context, () => repo.bulkDelete([product.id]));

    expect(deletedCount).toBe(1);
    expect(await rawPrisma.products.findUnique({ where: { id: BigInt(product.id) } })).toBeNull();
    expect(await rawPrisma.devices.findUnique({ where: { id: BigInt(device.id) } })).toBeNull();
    expect(
      await rawPrisma.device_values.findMany({
        where: { device_unique_identifier: device.deviceUniqueIdentifier },
      })
    ).toEqual([]);
    expect(
      await rawPrisma.raw_packet_values.findMany({ where: { product_id: BigInt(product.id) } })
    ).toEqual([]);
  });

  it('D-0048/11.45: ensureRuleAndWidget always creates both a Rule and a Widget+WidgetSetting per device, even with neither alert_settings nor widget_type (the exact NOT-NULL bug case)', async () => {
    const company = await seedCompany('e');
    const user = await seedUser(company.id, 'e');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Rule/Widget Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    const [device] = await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [DEVICE])
    );
    if (!device) throw new Error('expected createDevices to return a device');

    const { ruleId, widgetId } = await runWithContextAsync(context, () =>
      repo.ensureRuleAndWidget({
        userId: user.id.toString(),
        productId: product.id,
        attributeKey: 'temperature',
        label: 'Temperature',
        unit: undefined,
        widgetType: undefined,
        alertSettings: undefined,
        existingRuleId: undefined,
        existingWidgetId: undefined,
      })
    );

    expect(ruleId).toBeTruthy();
    expect(widgetId).toBeTruthy();
    const widgetSetting = await rawPrisma.widget_settings.findFirst({
      where: { widget_id: BigInt(widgetId), device: device.id },
    });
    expect(widgetSetting).not.toBeNull();
    expect(widgetSetting?.rule_id.toString()).toBe(ruleId);
  });

  it("D-0124: listOwnPreferencesForSettingsCheck returns only the caller's own rows, flagging which have a settings row", async () => {
    const company = await seedCompany('f');
    const userA = await seedUser(company.id, 'fa');
    const userB = await seedUser(company.id, 'fb');
    const repo = new ProductsRepository(prisma);
    const ctxA = contextFor(userA.id.toString(), company.id.toString());
    const ctxB = contextFor(userB.id.toString(), company.id.toString());

    const product = await runWithContextAsync(ctxA, () =>
      repo.create({
        name: 'Settings Check',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: userA.id.toString(),
      })
    );
    const withoutSettings = await runWithContextAsync(ctxA, () =>
      repo.upsertPreference(product.id, userA.id.toString(), 'object.a')
    );
    const withSettings = await runWithContextAsync(ctxA, () =>
      repo.upsertPreference(product.id, userA.id.toString(), 'object.b')
    );
    const { ruleId, widgetId } = await runWithContextAsync(ctxA, () =>
      repo.ensureRuleAndWidget({
        userId: userA.id.toString(),
        productId: product.id,
        attributeKey: 'object.b',
        label: 'B',
        unit: undefined,
        widgetType: undefined,
        alertSettings: undefined,
        existingRuleId: undefined,
        existingWidgetId: undefined,
      })
    );
    await runWithContextAsync(ctxA, () =>
      repo.upsertPreferenceSetting(withSettings.id, { label: 'B', ruleId, widgetId })
    );
    await runWithContextAsync(ctxB, () =>
      repo.upsertPreference(product.id, userB.id.toString(), 'object.c')
    );

    const own = await runWithContextAsync(ctxA, () =>
      repo.listOwnPreferencesForSettingsCheck(product.id, userA.id.toString())
    );

    expect(own.map(p => [p.id, p.attributeKey, p.hasSettings])).toEqual([
      [withoutSettings.id, 'object.a', false],
      [withSettings.id, 'object.b', true],
    ]);
  });

  it('preconfigure templates: global (company_id null) visible to every company; a private one is not', async () => {
    const companyA = await seedCompany('f');
    const companyB = await seedCompany('g');
    await seedUser(companyA.id, 'f');
    const repo = new ProductsRepository(prisma);

    await rawPrisma.preconfigure_templates.create({
      data: { name: `Global${MARK}`, company_id: null, configuration: { fields: [] } },
    });
    await repo.createTemplate(
      companyB.id.toString(),
      (await seedUser(companyB.id, 'g')).id.toString(),
      {
        name: 'Private To B',
        manufacturer: undefined,
        description: undefined,
        image: undefined,
        fields: [{ attributeKey: 'x', label: undefined, unit: undefined }],
      }
    );

    const asA = await repo.listTemplates({
      companyId: companyA.id.toString(),
      manufacturer: undefined,
      search: undefined,
      perPage: 50,
      page: 1,
    });
    const names = asA.items.map(t => t.name);
    expect(names).toContain(`Global${MARK}`);
    expect(names).not.toContain('Private To B');
  });

  it("issues and finds an ingestion token (raw_packet_values), scoped to the caller's own company via the product", async () => {
    const company = await seedCompany('h');
    const user = await seedUser(company.id, 'h');
    const protocol = await rawPrisma.protocols.create({
      data: { name: `Protocol2${MARK}`, category: 'transport' },
    });
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Token Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );

    expect(await repo.protocolExists(protocol.id.toString())).toBe(true);
    const token = await runWithContextAsync(context, () =>
      repo.createIngestionToken(product.id, protocol.id.toString(), 'abc123')
    );
    expect(token.productId).toBe(product.id);

    const latest = await repo.findLatestTokenForProduct(product.id);
    expect(latest).toBe('abc123');
  });

  it("findIngestionToken: reuses the existing row instead of `issueIngestionToken` minting a new one on re-call, against the real DB's json_body-null semantics", async () => {
    const company = await seedCompany('h2');
    const user = await seedUser(company.id, 'h2');
    const protocol = await rawPrisma.protocols.create({
      data: { name: `Protocol3${MARK}`, category: 'transport' },
    });
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Token Reuse Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );

    // Nothing issued yet.
    expect(
      await repo.findIngestionToken(product.id, protocol.id.toString(), user.id.toString())
    ).toBeUndefined();

    const first = await runWithContextAsync(context, () =>
      repo.createIngestionToken(product.id, protocol.id.toString(), 'first-token')
    );

    // Still unconsumed (json_body genuinely NULL, D-0047's placeholder-row shape) — found and reused.
    const stillUnconsumed = await repo.findIngestionToken(
      product.id,
      protocol.id.toString(),
      user.id.toString()
    );
    expect(stillUnconsumed?.token).toBe('first-token');
    expect(stillUnconsumed?.id).toBe(first.id);

    // A real packet consumes it (same update ingestion.repository.ts's `updatePlaceholder` does).
    await rawPrisma.raw_packet_values.update({
      where: { id: BigInt(first.id) },
      data: { json_body: { real: 'packet' } },
    });

    // A second, never-used placeholder appears later (simulating a stray re-call before this fix shipped).
    await runWithContextAsync(context, () =>
      repo.createIngestionToken(product.id, protocol.id.toString(), 'zombie-token')
    );

    // The consumed row wins over the unused zombie — the token a real device is demonstrably using.
    const afterConsumption = await repo.findIngestionToken(
      product.id,
      protocol.id.toString(),
      user.id.toString()
    );
    expect(afterConsumption?.token).toBe('first-token');
  });

  it("findDevicesForProduct: page=1 (Laravel's real default/first page) returns the device, not an empty array (D-0118)", async () => {
    const company = await seedCompany('i');
    const user = await seedUser(company.id, 'i');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Pagination Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [
        { ...DEVICE, deviceUniqueIdentifier: `dev-page${MARK}` },
      ])
    );

    const params = {
      type: undefined,
      search: undefined,
      sortBy: 'id',
      sortOrder: 'asc' as const,
      perPage: 10,
    };
    const page1 = await repo.findDevicesForProduct(product.id, { ...params, page: 1 });
    const page0 = await repo.findDevicesForProduct(product.id, { ...params, page: 0 });

    expect(page1.total).toBe(1);
    expect(page1.items).toHaveLength(1);
    // Real Laravel's LengthAwarePaginator clamps page<1 to page 1 -- page=0 (the schema's own
    // default, matching Laravel's raw `input('page', 0)`) must resolve identically to page=1.
    expect(page0.items).toEqual(page1.items);
  });

  it('findDevicesForProduct: page=2 skips the first perPage devices (D-0118)', async () => {
    const company = await seedCompany('j');
    const user = await seedUser(company.id, 'j');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Pagination Test 2',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    await runWithContextAsync(context, () =>
      repo.createDevices(
        product.id,
        user.id.toString(),
        [1, 2, 3].map(n => ({
          ...DEVICE,
          deviceUniqueIdentifier: `dev-page2-${String(n)}${MARK}`,
          name: `Sensor ${String(n)}`,
        }))
      )
    );

    const page1 = await repo.findDevicesForProduct(product.id, {
      type: undefined,
      search: undefined,
      sortBy: 'id',
      sortOrder: 'asc',
      perPage: 2,
      page: 1,
    });
    const page2 = await repo.findDevicesForProduct(product.id, {
      type: undefined,
      search: undefined,
      sortBy: 'id',
      sortOrder: 'asc',
      perPage: 2,
      page: 2,
    });

    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    expect(page1.items.map(d => d.id)).not.toEqual(page2.items.map(d => d.id));
  });

  it("findDevicesForProduct: search matches device_unique_identifier and location, not just name (D-0146, deliberate deviation from Laravel's name-only search)", async () => {
    const company = await seedCompany('k');
    const user = await seedUser(company.id, 'k');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Search Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [
        { deviceUniqueIdentifier: `f7c4-${MARK}`, name: 'Named Sensor', location: 'Warehouse A' },
        { deviceUniqueIdentifier: `unrelated-${MARK}`, name: 'Other Sensor', location: 'Loc 5' },
        {
          deviceUniqueIdentifier: `unrelated2-${MARK}`,
          name: 'Third Sensor',
          location: 'Elsewhere',
        },
      ])
    );

    const params = {
      type: undefined,
      sortBy: 'id',
      sortOrder: 'asc' as const,
      perPage: 10,
      page: 1,
    };
    const byName = await repo.findDevicesForProduct(product.id, { ...params, search: 'Named' });
    const byIdentifier = await repo.findDevicesForProduct(product.id, {
      ...params,
      search: `f7c4-${MARK}`,
    });
    const byLocation = await repo.findDevicesForProduct(product.id, { ...params, search: 'Loc 5' });

    expect(byName.items.map(d => d.name)).toEqual(['Named Sensor']);
    expect(byIdentifier.items.map(d => d.name)).toEqual(['Named Sensor']);
    expect(byLocation.items.map(d => d.name)).toEqual(['Other Sensor']);
  });

  it('list: sorting by a column every row ties on (status) still returns every product exactly once across pages, no duplicates or gaps (D-0147)', async () => {
    // `status` is always "active" on create (`repo.create`) -- a guaranteed, non-timing-dependent
    // tie on every row, reproducing the frontend's real repro (many products sharing one
    // `created_at` to the second) without depending on how fast these inserts happen to run.
    const company = await seedCompany('m');
    const user = await seedUser(company.id, 'm');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const products = await runWithContextAsync(context, () =>
      Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          repo.create({
            name: `Tie Product ${String(i + 1)}${MARK}`,
            deviceProtocolId: undefined,
            preconfigureTemplateId: undefined,
            createdBy: user.id.toString(),
          })
        )
      )
    );
    const ids = new Set(products.map(p => p.id));

    const params = {
      search: undefined,
      sortBy: 'status',
      sortOrder: 'asc' as const,
      perPage: 2,
      userId: undefined,
    };
    const page1 = await runWithContextAsync(context, () => repo.list({ ...params, page: 1 }));
    const page2 = await runWithContextAsync(context, () => repo.list({ ...params, page: 2 }));
    const page3 = await runWithContextAsync(context, () => repo.list({ ...params, page: 3 }));
    const seenIds = [...page1.items, ...page2.items, ...page3.items]
      .map(p => p.id)
      .filter(id => ids.has(id));

    expect(new Set(seenIds).size).toBe(seenIds.length); // no duplicates across pages
    expect(new Set(seenIds)).toEqual(ids); // every created product surfaced exactly once
  });

  it('findDevicesForProduct: sorting by a column every row ties on (type, always null) still returns every device exactly once across pages (D-0147)', async () => {
    const company = await seedCompany('n');
    const user = await seedUser(company.id, 'n');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Tie Devices Product',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    const devices = await runWithContextAsync(context, () =>
      repo.createDevices(
        product.id,
        user.id.toString(),
        Array.from({ length: 6 }, (_, i) => ({
          deviceUniqueIdentifier: `tie-dev-${String(i + 1)}${MARK}`,
          name: `Tie Sensor ${String(i + 1)}`,
          location: 'Same Warehouse',
        }))
      )
    );
    const ids = new Set(devices.map(d => d.id));

    const params = {
      type: undefined,
      search: undefined,
      sortBy: 'location',
      sortOrder: 'asc' as const,
      perPage: 2,
    };
    const page1 = await repo.findDevicesForProduct(product.id, { ...params, page: 1 });
    const page2 = await repo.findDevicesForProduct(product.id, { ...params, page: 2 });
    const page3 = await repo.findDevicesForProduct(product.id, { ...params, page: 3 });
    const seenIds = [...page1.items, ...page2.items, ...page3.items]
      .map(d => d.id)
      .filter(id => ids.has(id));

    expect(new Set(seenIds).size).toBe(seenIds.length);
    expect(new Set(seenIds)).toEqual(ids);
  });

  it("findDevicesForProduct: each device carries its real owner (user) and latestDeviceValue, matching real Laravel's side-effect eager load (D-0118)", async () => {
    const company = await seedCompany('k');
    const user = await seedUser(company.id, 'k', 'Asia/Karachi');
    const repo = new ProductsRepository(prisma);
    const context = contextFor(user.id.toString(), company.id.toString());

    const product = await runWithContextAsync(context, () =>
      repo.create({
        name: 'Detail Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );
    const [device] = await runWithContextAsync(context, () =>
      repo.createDevices(product.id, user.id.toString(), [
        { ...DEVICE, deviceUniqueIdentifier: `dev-detail${MARK}` },
      ])
    );
    if (!device) throw new Error('device was not created');

    const beforeValue = await repo.findDevicesForProduct(product.id, {
      type: undefined,
      search: undefined,
      sortBy: 'id',
      sortOrder: 'asc',
      perPage: 10,
      page: 1,
    });
    expect(beforeValue.items[0]?.user.id).toBe(user.id.toString());
    expect(beforeValue.items[0]?.user.timezone).toBe('Asia/Karachi');
    expect(beforeValue.items[0]?.latestDeviceValue).toBeNull();

    const deviceValue = await prisma.device_values.create({
      data: {
        device_id: BigInt(device.id),
        device_unique_identifier: device.deviceUniqueIdentifier,
        values: { temperature: 21.5 },
      },
    });

    const afterValue = await repo.findDevicesForProduct(product.id, {
      type: undefined,
      search: undefined,
      sortBy: 'id',
      sortOrder: 'asc',
      perPage: 10,
      page: 1,
    });
    expect(afterValue.items[0]?.latestDeviceValue).toMatchObject({
      id: deviceValue.id.toString(),
      deviceUniqueIdentifier: device.deviceUniqueIdentifier,
      values: { temperature: 21.5 },
    });
  });

  it("D-0154 GPS roles: markRole creates a role-only row, MOVES a role another attribute (even another user's) holds, and the partial unique index guards the invariant", async () => {
    const company = await seedCompany('role1');
    const userA = await seedUser(company.id, 'role1a');
    const userB = await seedUser(company.id, 'role1b');
    const repo = new ProductsRepository(prisma);
    const ctxA = contextFor(userA.id.toString(), company.id.toString());
    const product = await runWithContextAsync(ctxA, () =>
      repo.create({
        name: 'Role Test',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: userA.id.toString(),
      })
    );

    // User B's colleague-row holds `latitude` on another key.
    await rawPrisma.product_attribute_preferences.create({
      data: {
        product_id: BigInt(product.id),
        user_id: userB.id,
        attribute_key: 'object.old_lat',
        is_selected: true,
        attribute_role: 'latitude',
      },
    });

    const first = await runWithContextAsync(ctxA, () =>
      repo.markRole(product.id, userA.id.toString(), 'object.latitude', 'latitude')
    );
    expect(first.replacedAttributeKey).toBe('object.old_lat');

    const rows = await rawPrisma.product_attribute_preferences.findMany({
      where: { product_id: BigInt(product.id), attribute_role: 'latitude' },
    });
    expect(rows.map(r => r.attribute_key)).toEqual(['object.latitude']); // exactly one holder

    // Re-marking the same key with another role changes it in place (single column), no second row.
    await runWithContextAsync(ctxA, () =>
      repo.markRole(product.id, userA.id.toString(), 'object.latitude', 'longitude')
    );
    const own = await rawPrisma.product_attribute_preferences.findMany({
      where: {
        product_id: BigInt(product.id),
        user_id: userA.id,
        attribute_key: 'object.latitude',
      },
    });
    expect(own).toHaveLength(1);
    expect(own[0]?.attribute_role).toBe('longitude');

    // The DB itself refuses a second holder of the same role for the product.
    await expect(
      rawPrisma.product_attribute_preferences.create({
        data: {
          product_id: BigInt(product.id),
          user_id: userB.id,
          attribute_key: 'object.dup',
          is_selected: true,
          attribute_role: 'longitude',
        },
      })
    ).rejects.toThrow();
  });

  it('D-0154 GPS roles: unmarkRole removes a role-only row but keeps an attribute that also has settings; flags reflect the unique identifier', async () => {
    const company = await seedCompany('role2');
    const user = await seedUser(company.id, 'role2');
    const repo = new ProductsRepository(prisma);
    const ctx = contextFor(user.id.toString(), company.id.toString());
    const product = await runWithContextAsync(ctx, () =>
      repo.create({
        name: 'Role Test 2',
        deviceProtocolId: undefined,
        preconfigureTemplateId: undefined,
        createdBy: user.id.toString(),
      })
    );

    await runWithContextAsync(ctx, () =>
      repo.markRole(product.id, user.id.toString(), 'object.roleonly', 'speed')
    );
    const configured = await runWithContextAsync(ctx, () =>
      repo.upsertPreference(product.id, user.id.toString(), 'object.configured')
    );
    const { ruleId, widgetId } = await runWithContextAsync(ctx, () =>
      repo.ensureRuleAndWidget({
        userId: user.id.toString(),
        productId: product.id,
        attributeKey: 'object.configured',
        label: 'Heading',
        unit: undefined,
        widgetType: undefined,
        alertSettings: undefined,
        existingRuleId: undefined,
        existingWidgetId: undefined,
      })
    );
    await runWithContextAsync(ctx, () =>
      repo.upsertPreferenceSetting(configured.id, { label: 'Heading', ruleId, widgetId })
    );
    await runWithContextAsync(ctx, () =>
      repo.markRole(product.id, user.id.toString(), 'object.configured', 'heading')
    );

    expect(await repo.unmarkRole(product.id, 'object.roleonly')).toBe(true);
    expect(await repo.unmarkRole(product.id, 'object.configured')).toBe(true);
    expect(await repo.unmarkRole(product.id, 'object.never')).toBe(false);

    const remaining = await rawPrisma.product_attribute_preferences.findMany({
      where: { product_id: BigInt(product.id) },
    });
    expect(remaining.map(r => [r.attribute_key, r.attribute_role])).toEqual([
      ['object.configured', null],
    ]); // role-only row gone, configured row kept

    await runWithContextAsync(ctx, () =>
      repo.markAsUniqueIdentifier(product.id, user.id.toString(), 'deviceInfo.devEui')
    );
    expect(await repo.findPreferenceFlagsForKey(product.id, 'deviceInfo.devEui')).toEqual([
      { isUniqueIdentifier: true, attributeRole: null },
    ]);
  });
});
