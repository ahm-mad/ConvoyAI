import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { DevicesRepository } from '../devices.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). This module's
 * real risk is the D-0022 authorization boundary — a device is the
 * caller's if it's directly attributed to them (`user_id`) OR belongs to
 * a product owned by their company — so the first golden pairs written
 * here are cross-tenant/cross-user access attempts on that OR, mirroring
 * PARITY.md's guidance for 11.37-class modules.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@devices-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Devices Test Co ${label}`, email: `co-${label}${MARK}` },
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
  const testDeviceIds = testDevices.map(d => d.id);

  await rawPrisma.vehicle_device_assignments.deleteMany({
    where: { device_id: { in: testDeviceIds } },
  });
  await rawPrisma.device_positions.deleteMany({ where: { device_id: { in: testDeviceIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: testCompanyIds } } });
  await rawPrisma.asset_components.deleteMany({
    where: { device_id: { in: testDeviceIds.map(String) } },
  });
  await rawPrisma.user_devices.deleteMany({ where: { user_id: { in: testUserIds } } });
  await rawPrisma.device_values.deleteMany({
    where: { device_unique_identifier: { in: testDevices.map(d => d.device_unique_identifier) } },
  });
  await rawPrisma.devices.deleteMany({ where: { id: { in: testDeviceIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.users.deleteMany({ where: { id: { in: testUserIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('DevicesRepository (real Postgres, D-0022 authorization)', () => {
  it("create() sets user_id from the caller's context (closes 11.5)", async () => {
    const company = await seedCompany('a');
    const user = await seedUser(company.id, 'a');
    const product = await seedProduct(company.id, user.id, 'a');
    const repo = new DevicesRepository(prisma);

    const device = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () =>
        repo.create({
          deviceUniqueIdentifier: `dev-a${MARK}`,
          name: 'Sensor A',
          type: undefined,
          status: undefined,
          location: undefined,
          tags: undefined,
          productId: product.id.toString(),
        })
    );

    expect(device.userId).toBe(user.id.toString());
  });

  it('findAuthorized: a device is visible to its direct owner even when the product belongs to a different company', async () => {
    const company = await seedCompany('b');
    const user = await seedUser(company.id, 'b');
    // Device directly owned by `user`, but its product belongs to a completely different
    // company — isolates the "direct user_id ownership" half of the OR from the
    // "product's company" half.
    const otherCompany = await seedCompany('b-other');
    const otherCompanyUser = await seedUser(otherCompany.id, 'b-other');
    const foreignProduct = await seedProduct(otherCompany.id, otherCompanyUser.id, 'b-other');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-b${MARK}`,
        name: 'Sensor B',
        status: 'active',
        location: '',
        tags: '',
        product_id: foreignProduct.id,
        user_id: user.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const found = await repo.findAuthorized(
      device.id.toString(),
      user.id.toString(),
      company.id.toString()
    );

    expect(found?.id).toBe(device.id.toString());
  });

  it("findAuthorized: a device is visible to any user in the product's owning company, even if a different user created it", async () => {
    const company = await seedCompany('c');
    const creator = await seedUser(company.id, 'c1');
    const teammate = await seedUser(company.id, 'c2');
    const product = await seedProduct(company.id, creator.id, 'c');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-c${MARK}`,
        name: 'Sensor C',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: creator.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const found = await repo.findAuthorized(
      device.id.toString(),
      teammate.id.toString(),
      company.id.toString()
    );

    expect(found?.id).toBe(device.id.toString());
  });

  it("findAuthorized: a cross-tenant device (different user, different company's product) is invisible", async () => {
    const companyA = await seedCompany('d-a');
    const userA = await seedUser(companyA.id, 'd-a');
    const companyB = await seedCompany('d-b');
    const userB = await seedUser(companyB.id, 'd-b');
    const productB = await seedProduct(companyB.id, userB.id, 'd-b');
    const deviceB = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-d${MARK}`,
        name: 'Sensor D',
        status: 'active',
        location: '',
        tags: '',
        product_id: productB.id,
        user_id: userB.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const found = await repo.findAuthorized(
      deviceB.id.toString(),
      userA.id.toString(),
      companyA.id.toString()
    );

    expect(found).toBeUndefined();
  });

  it('update/delete act as not-found for a cross-tenant device (D-0022 avoids an enumeration oracle)', async () => {
    const companyA = await seedCompany('e-a');
    const userA = await seedUser(companyA.id, 'e-a');
    const companyB = await seedCompany('e-b');
    const userB = await seedUser(companyB.id, 'e-b');
    const productB = await seedProduct(companyB.id, userB.id, 'e-b');
    const deviceB = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-e${MARK}`,
        name: 'Sensor E',
        status: 'active',
        location: '',
        tags: '',
        product_id: productB.id,
        user_id: userB.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const updated = await repo.update(
      deviceB.id.toString(),
      userA.id.toString(),
      companyA.id.toString(),
      {
        deviceUniqueIdentifier: undefined,
        name: 'hacked',
        location: undefined,
        tags: undefined,
      }
    );
    expect(updated).toBeUndefined();

    const deleted = await repo.delete(
      deviceB.id.toString(),
      userA.id.toString(),
      companyA.id.toString()
    );
    expect(deleted).toBe(false);

    const stillThere = await rawPrisma.devices.findUnique({ where: { id: deviceB.id } });
    expect(stillThere?.name).not.toBe('hacked');
  });

  it('bulkSetStatus/bulkDelete only affect the ids the caller actually owns', async () => {
    const company = await seedCompany('f');
    const user = await seedUser(company.id, 'f');
    const product = await seedProduct(company.id, user.id, 'f');
    const otherCompany = await seedCompany('f-other');
    const otherUser = await seedUser(otherCompany.id, 'f-other');
    const otherProduct = await seedProduct(otherCompany.id, otherUser.id, 'f-other');

    const ownDevice = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-f-own${MARK}`,
        name: 'Own',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: user.id,
      },
    });
    const foreignDevice = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-f-foreign${MARK}`,
        name: 'Foreign',
        status: 'active',
        location: '',
        tags: '',
        product_id: otherProduct.id,
        user_id: otherUser.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const updatedCount = await repo.bulkSetStatus(
      [ownDevice.id.toString(), foreignDevice.id.toString()],
      user.id.toString(),
      company.id.toString(),
      'inactive'
    );
    expect(updatedCount).toBe(1);

    const own = await rawPrisma.devices.findUnique({ where: { id: ownDevice.id } });
    const foreign = await rawPrisma.devices.findUnique({ where: { id: foreignDevice.id } });
    expect(own?.status).toBe('inactive');
    expect(foreign?.status).toBe('active');
  });

  it('findByProductAuthorized: whereHas product.company_id (D-0022 closes 11.37 for getByProduct)', async () => {
    const companyA = await seedCompany('g-a');
    const userA = await seedUser(companyA.id, 'g-a');
    const productA = await seedProduct(companyA.id, userA.id, 'g-a');
    await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-g${MARK}`,
        name: 'Sensor G',
        status: 'active',
        location: '',
        tags: '',
        product_id: productA.id,
        user_id: userA.id,
      },
    });
    const companyB = await seedCompany('g-b');
    const repo = new DevicesRepository(prisma);

    const asOwner = await repo.findByProductAuthorized(
      productA.id.toString(),
      companyA.id.toString()
    );
    expect(asOwner).toHaveLength(1);

    const asOther = await repo.findByProductAuthorized(
      productA.id.toString(),
      companyB.id.toString()
    );
    expect(asOther).toHaveLength(0);
  });

  it("assignedDeviceIds() matches AssetComponent::whereNotNull('device_id')->pluck('device_id')->unique() exactly, with no tenant scoping", async () => {
    const company = await seedCompany('h');
    const user = await seedUser(company.id, 'h');
    const product = await seedProduct(company.id, user.id, 'h');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-h${MARK}`,
        name: 'Sensor H',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: user.id,
      },
    });
    const asset = await rawPrisma.assets.create({
      data: {
        name: `Asset${MARK}`,
        icon: 'icon',
        type: 'building',
        company_id: company.id.toString(),
      },
    });
    await rawPrisma.asset_components.create({
      data: {
        asset_id: asset.id,
        name: 'Component',
        icon: 'icon',
        device_id: device.id.toString(),
      },
    });
    const repo = new DevicesRepository(prisma);

    const assigned = await repo.assignedDeviceIds();

    expect(assigned).toContain(device.id.toString());
    await rawPrisma.asset_components.deleteMany({ where: { asset_id: asset.id } });
    await rawPrisma.assets.delete({ where: { id: asset.id } });
  });

  it("findLatestValuesForDevice returns the most recent device_values row's JSON", async () => {
    const company = await seedCompany('i');
    const user = await seedUser(company.id, 'i');
    const product = await seedProduct(company.id, user.id, 'i');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-i${MARK}`,
        name: 'Sensor I',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: user.id,
      },
    });
    // `created_at` is now NOT NULL at the DB level (the Timescale hypertable
    // migration, D-0054, requires a value on the partitioning column) —
    // `rawPrisma` bypasses the `timestamps.ts` extension that fills this in
    // for real application writes, so tests seeding via `rawPrisma` must
    // supply it explicitly.
    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 1 },
        created_at: new Date(Date.now() - 1000),
      },
    });
    await rawPrisma.device_values.create({
      data: {
        device_id: device.id,
        device_unique_identifier: device.device_unique_identifier,
        values: { temp: 2 },
        created_at: new Date(),
      },
    });
    const repo = new DevicesRepository(prisma);

    const latest = await repo.findLatestValuesForDevice(device.device_unique_identifier);

    expect(latest).toEqual({ temp: 2 });
  });

  it("deviceUniqueIdentifierExists excludes the given id (update's own-record exemption)", async () => {
    const company = await seedCompany('j');
    const user = await seedUser(company.id, 'j');
    const product = await seedProduct(company.id, user.id, 'j');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-j${MARK}`,
        name: 'Sensor J',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: user.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    expect(
      await repo.deviceUniqueIdentifierExists(device.device_unique_identifier, undefined)
    ).toBe(true);
    expect(
      await repo.deviceUniqueIdentifierExists(device.device_unique_identifier, device.id.toString())
    ).toBe(false);
  });

  it("listUserDevices only returns the given user's own rows", async () => {
    const company = await seedCompany('k');
    const userA = await seedUser(company.id, 'k-a');
    const userB = await seedUser(company.id, 'k-b');
    await rawPrisma.user_devices.create({
      data: { user_id: userA.id, device_name: `A${MARK}`, toggle_status: true },
    });
    await rawPrisma.user_devices.create({
      data: { user_id: userB.id, device_name: `B${MARK}`, toggle_status: true },
    });
    const repo = new DevicesRepository(prisma);

    const asA = await runWithContextAsync(
      contextFor(userA.id.toString(), company.id.toString()),
      () => repo.listUserDevices(userA.id.toString())
    );

    expect(asA.map(d => d.deviceName)).toEqual([`A${MARK}`]);
  });

  it("listProductsWithDevices: D-0112 -- each device's real user is resolved (no Prisma relation exists for devices->users, batched manually)", async () => {
    const company = await seedCompany('m');
    const owner = await seedUser(company.id, 'm-owner');
    const product = await seedProduct(company.id, owner.id, 'm');
    const device = await rawPrisma.devices.create({
      data: {
        device_unique_identifier: `dev-m${MARK}`,
        name: 'Sensor M',
        status: 'active',
        location: '',
        tags: '',
        product_id: product.id,
        user_id: owner.id,
      },
    });
    const repo = new DevicesRepository(prisma);

    const { items } = await runWithContextAsync(
      contextFor(owner.id.toString(), company.id.toString()),
      () =>
        repo.listProductsWithDevices({
          productId: product.id.toString(),
          search: undefined,
          sortBy: 'id',
          sortOrder: 'asc',
          page: 1,
          perPage: 10,
        })
    );

    expect(items).toHaveLength(1);
    const returnedDevice = items[0]?.devices.find(d => d.id === device.id.toString());
    expect(returnedDevice?.user.id).toBe(owner.id.toString());
    expect(returnedDevice?.user.email).toBe(owner.email);
  });

  describe('fleet completion step 1 queries (assignable trackers, position history, company check)', () => {
    async function seedDevice(productId: bigint, userId: bigint, label: string) {
      return rawPrisma.devices.create({
        data: {
          device_unique_identifier: `dev-${label}${MARK}`,
          name: `Tracker ${label}`,
          status: 'active',
          location: '',
          tags: '',
          product_id: productId,
          user_id: userId,
        },
      });
    }

    it('listAssignableTrackers: excludes devices installed in a vehicle, keeps ones whose assignment was closed, and reports has_position', async () => {
      const company = await seedCompany('f1');
      const user = await seedUser(company.id, 'f1');
      const product = await seedProduct(company.id, user.id, 'f1');
      const free = await seedDevice(product.id, user.id, 'f1-free');
      const installed = await seedDevice(product.id, user.id, 'f1-installed');
      const released = await seedDevice(product.id, user.id, 'f1-released');
      const vehicle = await rawPrisma.vehicles.create({
        data: { company_id: company.id, name: 'Truck f1' },
      });
      await rawPrisma.vehicle_device_assignments.create({
        data: { vehicle_id: vehicle.id, device_id: installed.id, assigned_at: new Date() },
      });
      await rawPrisma.vehicle_device_assignments.create({
        data: {
          vehicle_id: vehicle.id,
          device_id: released.id,
          assigned_at: new Date(),
          unassigned_at: new Date(),
        },
      });
      await rawPrisma.device_positions.create({
        data: { device_id: released.id, latitude: 1, longitude: 2, recorded_at: new Date() },
      });
      const repo = new DevicesRepository(prisma);

      const all = await repo.listAssignableTrackers(user.id.toString(), company.id.toString(), {
        search: undefined,
        onlyWithPosition: false,
      });
      const withPosition = await repo.listAssignableTrackers(
        user.id.toString(),
        company.id.toString(),
        {
          search: undefined,
          onlyWithPosition: true,
        }
      );
      const searched = await repo.listAssignableTrackers(
        user.id.toString(),
        company.id.toString(),
        {
          search: 'F1-FREE',
          onlyWithPosition: false,
        }
      );

      expect(all.map(d => d.id).sort()).toEqual(
        [free.id.toString(), released.id.toString()].sort()
      );
      expect(all.find(d => d.id === released.id.toString())).toMatchObject({
        hasPosition: true,
        product: { id: product.id.toString(), name: `Product f1${MARK}` },
      });
      expect(all.find(d => d.id === free.id.toString())?.hasPosition).toBe(false);
      expect(withPosition.map(d => d.id)).toEqual([released.id.toString()]);
      expect(searched.map(d => d.id)).toEqual([free.id.toString()]); // case-insensitive name/DevEUI match
    });

    it("listAssignableTrackers: never lists another company's devices", async () => {
      const company = await seedCompany('f2');
      const user = await seedUser(company.id, 'f2');
      const otherCompany = await seedCompany('f2-other');
      const otherUser = await seedUser(otherCompany.id, 'f2-other');
      const otherProduct = await seedProduct(otherCompany.id, otherUser.id, 'f2-other');
      await seedDevice(otherProduct.id, otherUser.id, 'f2-foreign');
      const repo = new DevicesRepository(prisma);

      const listed = await repo.listAssignableTrackers(user.id.toString(), company.id.toString(), {
        search: undefined,
        onlyWithPosition: false,
      });

      expect(listed).toEqual([]);
    });

    it('positionHistory returns the most recent `limit` points oldest → newest; deviceInCompany is company-scoped', async () => {
      const company = await seedCompany('f3');
      const user = await seedUser(company.id, 'f3');
      const product = await seedProduct(company.id, user.id, 'f3');
      const device = await seedDevice(product.id, user.id, 'f3');
      for (let i = 0; i < 5; i += 1) {
        await rawPrisma.device_positions.create({
          data: {
            device_id: device.id,
            latitude: i,
            longitude: 0,
            recorded_at: new Date(Date.UTC(2026, 8, 24, 10, i)),
          },
        });
      }
      const repo = new DevicesRepository(prisma);

      const history = await repo.positionHistory(device.id.toString(), 3);

      expect(history.map(p => p.latitude)).toEqual([2, 3, 4]); // the latest 3, chronological
      expect(await repo.deviceInCompany(company.id.toString(), device.id.toString())).toBe(true);
      expect(await repo.deviceInCompany('999999999', device.id.toString())).toBe(false);
      expect(await repo.deviceInCompany(company.id.toString(), 'not-a-number')).toBe(false);
    });
  });
});
