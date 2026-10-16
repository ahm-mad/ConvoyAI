import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { AssetsRepository } from '../assets.repository.js';
import type { AssetComponent, CreateComponentInput } from '../assets.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers D-0075's
 * structural half (`assets` company-scoping via the tenant-scoping
 * extension, `asset_components`/`floor_plans` explicit ownership joins),
 * the real FK `ON DELETE CASCADE` chain verified live before this module
 * relied on it (D-0073's own discipline), and the "last child component
 * with a device" recursive CTE's per-branch stop rule.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@assets-repo-test.example';

const COMPONENT_DEFAULTS: CreateComponentInput = {
  name: 'Component',
  componentType: null,
  icon: null,
  deviceId: null,
  productId: null,
  inventoryCheck: null,
  parentId: null,
  floorPlanId: null,
  positionX: null,
  positionY: null,
};

/** Creates exactly one component and returns it directly (not an array) — avoids `!`-asserting a destructured `[component]` at every call site (ESLint `no-non-null-assertion`). */
async function createComponent(
  repo: AssetsRepository,
  assetId: string,
  overrides: Partial<CreateComponentInput>
): Promise<AssetComponent> {
  const [component] = await repo.createComponents(assetId, [
    { ...COMPONENT_DEFAULTS, ...overrides },
  ]);
  if (!component) throw new Error('expected createComponents to return exactly one component');
  return component;
}

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Assets Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

async function seedUser(companyId: bigint, label: string) {
  return rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: companyId,
    },
  });
}

async function seedProduct(companyId: bigint, createdBy: bigint, label: string) {
  return rawPrisma.products.create({
    data: {
      name: `Product ${label}${MARK}`,
      status: 'active',
      company_id: companyId,
      created_by: createdBy,
    },
  });
}

async function seedDevice(productId: bigint, userId: bigint, label: string) {
  return rawPrisma.devices.create({
    data: {
      device_unique_identifier: `dev-${label}${MARK}`,
      name: `Device ${label}`,
      status: 'active',
      location: '',
      tags: '',
      product_id: productId,
      user_id: userId,
    },
  });
}

async function seedAsset(repo: AssetsRepository, companyId: bigint, name: string) {
  return runWithContextAsync(contextFor(companyId.toString()), () =>
    repo.create(companyId.toString(), {
      name: `${name}${MARK}`,
      type: 'building',
      icon: null,
      description: null,
    })
  );
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const users = await rawPrisma.users.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);
  const products = await rawPrisma.products.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const productIds = products.map(p => p.id);
  const devices = await rawPrisma.devices.findMany({
    where: { product_id: { in: productIds } },
    select: { id: true },
  });
  const deviceIds = devices.map(d => d.id);

  await rawPrisma.device_values.deleteMany({ where: { device_id: { in: deviceIds } } });
  await rawPrisma.product_attribute_preferences.deleteMany({
    where: { product_id: { in: productIds } },
  });
  await rawPrisma.devices.deleteMany({ where: { id: { in: deviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: productIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: userIds } } });

  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id.toString());
  if (companyIds.length > 0) {
    await rawPrisma.assets.deleteMany({ where: { company_id: { in: companyIds } } });
  }
  await rawPrisma.companies.deleteMany({ where: { email: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('AssetsRepository (real Postgres, D-0075)', () => {
  it("create/findById: an asset is only visible under its own company's context", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const repo = new AssetsRepository(prisma);

    const asset = await seedAsset(repo, companyA.id, 'Asset');

    const foundOwn = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findById(asset.id)
    );
    expect(foundOwn?.id).toBe(asset.id);

    const foundOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findById(asset.id)
    );
    expect(foundOther).toBeUndefined();
  });

  it("update/deleteCascade: only reachable under the owning company's context, no-op (undefined/false) otherwise", async () => {
    const companyA = await seedCompany('c');
    const companyB = await seedCompany('d');
    const repo = new AssetsRepository(prisma);

    const asset = await seedAsset(repo, companyA.id, 'Asset');

    const updatedByOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.update(asset.id, { name: 'Hijacked' })
    );
    expect(updatedByOther).toBeUndefined();

    const deletedByOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.deleteCascade(asset.id)
    );
    expect(deletedByOther).toBe(false);

    const stillThere = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findById(asset.id)
    );
    expect(stillThere?.name).toBe(`Asset${MARK}`);
  });

  it('deleteCascade: real FK ON DELETE CASCADE removes every descendant component (any depth) and their floor_plans, no manual recursion needed', async () => {
    const company = await seedCompany('e');
    const repo = new AssetsRepository(prisma);
    const ctx = contextFor(company.id.toString());

    const asset = await seedAsset(repo, company.id, 'Asset');
    const root = await createComponent(repo, asset.id, { name: 'Floor 1' });
    const child = await createComponent(repo, asset.id, { name: 'Room A', parentId: root.id });
    const grandchild = await createComponent(repo, asset.id, {
      name: 'Sensor',
      parentId: child.id,
    });
    await repo.upsertFloorPlan(grandchild.id, {
      filePath: 'floor-plans/x.png',
      widthPx: 100,
      heightPx: 100,
      floorLevel: 0,
    });

    const ok = await runWithContextAsync(ctx, () => repo.deleteCascade(asset.id));
    expect(ok).toBe(true);

    const remaining = await rawPrisma.asset_components.findMany({
      where: { id: { in: [root.id, child.id, grandchild.id].map(BigInt) } },
    });
    expect(remaining).toHaveLength(0);
    const remainingPlans = await rawPrisma.floor_plans.findMany({
      where: { asset_component_id: BigInt(grandchild.id) },
    });
    expect(remainingPlans).toHaveLength(0);
  });

  it('deleteComponentCascade: deletes a component and every descendant (real FK CASCADE on parent_id), leaving siblings untouched', async () => {
    const company = await seedCompany('f');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');
    const floor1 = await createComponent(repo, asset.id, { name: 'Floor 1' });
    const floor2 = await createComponent(repo, asset.id, { name: 'Floor 2' });
    const room = await createComponent(repo, asset.id, { name: 'Room', parentId: floor1.id });

    const ok = await repo.deleteComponentCascade(floor1.id);
    expect(ok).toBe(true);

    const all = await repo.listAllComponentsForAsset(asset.id);
    expect(all.map(c => c.id).sort()).toEqual([floor2.id].sort());
    const roomGone = await rawPrisma.asset_components.findUnique({
      where: { id: BigInt(room.id) },
    });
    expect(roomGone).toBeNull();
  });

  it('wouldCreateCircularReference: detects a cycle through the parent chain, and clears a non-cyclic move', async () => {
    const company = await seedCompany('g');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');
    const a = await createComponent(repo, asset.id, { name: 'A' });
    const b = await createComponent(repo, asset.id, { name: 'B', parentId: a.id });
    const c = await createComponent(repo, asset.id, { name: 'C' });

    // Moving A under B (its own descendant) would create a cycle.
    expect(await repo.wouldCreateCircularReference(a.id, b.id)).toBe(true);
    // Moving C under B is perfectly fine — no relation between them.
    expect(await repo.wouldCreateCircularReference(c.id, b.id)).toBe(false);
  });

  it('validateParent: rejects a parent from a different asset, and a locked (device + inventory_check) parent', async () => {
    const company = await seedCompany('h');
    const repo = new AssetsRepository(prisma);
    const assetA = await seedAsset(repo, company.id, 'AssetA');
    const assetB = await seedAsset(repo, company.id, 'AssetB');
    const otherAssetParent = await createComponent(repo, assetB.id, { name: 'Other' });
    const lockedParent = await createComponent(repo, assetA.id, {
      name: 'Locked',
      deviceId: '1',
      inventoryCheck: true,
    });
    const openParent = await createComponent(repo, assetA.id, { name: 'Open' });

    expect(await repo.validateParent(assetA.id, otherAssetParent.id)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await repo.validateParent(assetA.id, lockedParent.id)).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(await repo.validateParent(assetA.id, openParent.id)).toEqual({ ok: true });
  });

  it('lastChildDevicesForAsset: stops recursing per-branch at the first device-bearing component, matching getLastChildComponentsWithDevices', async () => {
    const company = await seedCompany('i');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');

    // Branch 1: root has a device -> stop there, even though it also has a child with a device.
    const branch1Root = await createComponent(repo, asset.id, {
      name: 'B1',
      deviceId: '101',
      productId: '1',
    });
    await createComponent(repo, asset.id, {
      name: 'B1-child',
      deviceId: '102',
      productId: '1',
      parentId: branch1Root.id,
    });
    // Branch 2: root has no device -> recurse into its child, which does.
    const branch2Root = await createComponent(repo, asset.id, { name: 'B2' });
    const branch2Child = await createComponent(repo, asset.id, {
      name: 'B2-child',
      deviceId: '103',
      productId: '1',
      parentId: branch2Root.id,
    });
    // Branch 3: no device anywhere in the branch -> nothing returned for it.
    await createComponent(repo, asset.id, { name: 'B3' });

    const devices = await repo.lastChildDevicesForAsset(asset.id);
    expect(devices.map(d => d.deviceId).sort()).toEqual(['101', '103'].sort());
    expect(devices.find(d => d.deviceId === '101')?.componentId).toBe(branch1Root.id);
    expect(devices.find(d => d.deviceId === '103')?.componentId).toBe(branch2Child.id);
  });

  it('findAssetTreeForCompany: paginates and filters by search, scoped to the given company only', async () => {
    const company = await seedCompany('j');
    const repo = new AssetsRepository(prisma);
    await seedAsset(repo, company.id, 'Alpha');
    await seedAsset(repo, company.id, 'Beta');

    const all = await repo.findAssetTreeForCompany(company.id.toString(), {
      page: 1,
      limit: 10,
      search: undefined,
    });
    expect(all.total).toBe(2);

    const filtered = await repo.findAssetTreeForCompany(company.id.toString(), {
      page: 1,
      limit: 10,
      search: 'Alpha',
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.name).toBe(`Alpha${MARK}`);
  });

  it('findLatestDeviceValue/countLastDayValues: reads real device_values rows, scoped by device_id and time window', async () => {
    const company = await seedCompany('k');
    const user = await seedUser(company.id, 'k');
    const product = await seedProduct(company.id, user.id, 'k');
    const device = await seedDevice(product.id, user.id, 'k');
    const repo = new AssetsRepository(prisma);

    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 20 },
        created_at: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 30 },
        created_at: new Date(),
      },
    });

    const latest = await repo.findLatestDeviceValue(device.id.toString());
    expect(latest?.values).toEqual({ temp: 30 });

    const sinceHalfHourAgo = new Date(Date.now() - 30 * 60 * 1000);
    const lastHalfHour = await repo.countLastDayValues(device.id.toString(), sinceHalfHourAgo);
    expect(lastHalfHour).toHaveLength(1);

    expect(await repo.findLatestDeviceValue('not-a-number')).toBeUndefined();
  });

  it("listSelectedAttributeKeys: the caller's own selected, non-unique-identifier preferences only (user-ruled auto-scoping)", async () => {
    const company = await seedCompany('l');
    const user = await seedUser(company.id, 'l');
    const otherUser = await seedUser(company.id, 'l2');
    const product = await seedProduct(company.id, user.id, 'l');
    const repo = new AssetsRepository(prisma);

    await rawPrisma.product_attribute_preferences.create({
      data: {
        product_id: product.id,
        user_id: user.id,
        attribute_key: 'temp',
        is_selected: true,
        is_unique_identifier: false,
      },
    });
    await rawPrisma.product_attribute_preferences.create({
      data: {
        product_id: product.id,
        user_id: user.id,
        attribute_key: 'id',
        is_selected: true,
        is_unique_identifier: true,
      },
    });
    await rawPrisma.product_attribute_preferences.create({
      data: {
        product_id: product.id,
        user_id: user.id,
        attribute_key: 'humidity',
        is_selected: false,
        is_unique_identifier: false,
      },
    });
    await rawPrisma.product_attribute_preferences.create({
      data: {
        product_id: product.id,
        user_id: otherUser.id,
        attribute_key: 'pressure',
        is_selected: true,
        is_unique_identifier: false,
      },
    });

    const keys = await runWithContextAsync(
      contextFor(company.id.toString(), user.id.toString()),
      () => repo.listSelectedAttributeKeys(product.id.toString())
    );
    expect(keys).toEqual(['temp']);
  });

  it('findWidgetSettingForDeviceAttribute: undefined when nothing matches (no widget_settings row for this device+attribute)', async () => {
    const repo = new AssetsRepository(prisma);
    expect(
      await repo.findWidgetSettingForDeviceAttribute('999999', 'objectJSON.temp')
    ).toBeUndefined();
  });

  it('upsertFloorPlan/findFloorPlanByComponentId: create then replace, one row per asset_component_id (schema @unique)', async () => {
    const company = await seedCompany('m');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');
    const component = await createComponent(repo, asset.id, { name: 'Floor' });

    const first = await repo.upsertFloorPlan(component.id, {
      filePath: 'floor-plans/a.png',
      widthPx: 100,
      heightPx: 200,
      floorLevel: 0,
    });
    expect(first.replaced).toBe(false);

    const second = await repo.upsertFloorPlan(component.id, {
      filePath: 'floor-plans/b.png',
      widthPx: 150,
      heightPx: 250,
      floorLevel: 1,
    });
    expect(second.replaced).toBe(true);
    expect(second.floorPlan.id).toBe(first.floorPlan.id);

    const found = await repo.findFloorPlanByComponentId(component.id);
    expect(found).toMatchObject({
      filePath: 'floor-plans/b.png',
      widthPx: 150,
      heightPx: 250,
      floorLevel: 1,
    });
  });

  it('listPositionedComponentsOnFloorPlan: only components with both position_x and position_y set', async () => {
    const company = await seedCompany('n');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');
    const floor = await createComponent(repo, asset.id, { name: 'Floor' });
    const { floorPlan } = await repo.upsertFloorPlan(floor.id, {
      filePath: 'floor-plans/c.png',
      widthPx: 100,
      heightPx: 100,
      floorLevel: 0,
    });
    await createComponent(repo, asset.id, {
      name: 'Positioned',
      floorPlanId: floorPlan.id,
      positionX: 0.5,
      positionY: 0.5,
    });
    await createComponent(repo, asset.id, { name: 'Unpositioned', floorPlanId: floorPlan.id });

    const positioned = await repo.listPositionedComponentsOnFloorPlan(floorPlan.id);
    expect(positioned.map(c => c.name)).toEqual(['Positioned']);
  });

  it('listActiveAlarmsForDevices: empty input short-circuits to an empty array without querying', async () => {
    const repo = new AssetsRepository(prisma);
    expect(await repo.listActiveAlarmsForDevices([])).toEqual([]);
  });

  it('listTopLevelComponents: only parent_id IS NULL rows for the given asset', async () => {
    const company = await seedCompany('o');
    const repo = new AssetsRepository(prisma);
    const asset = await seedAsset(repo, company.id, 'Asset');
    const top = await createComponent(repo, asset.id, { name: 'Top' });
    await createComponent(repo, asset.id, { name: 'Child', parentId: top.id });

    const topLevel = await repo.listTopLevelComponents(asset.id);
    expect(topLevel.map(c => c.id)).toEqual([top.id]);
  });
});
