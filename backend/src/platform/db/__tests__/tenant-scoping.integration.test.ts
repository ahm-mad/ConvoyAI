import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../tenant-scoping.js';
import {
  runAsSystemAsync,
  runWithContextAsync,
  type RequestContext,
} from '../../http/request-context.js';

/**
 * Real-Postgres regression suite for the tenant-scoping extension —
 * PARITY.md calls for "11.37's two controllers as the first golden pairs
 * written: cross-tenant read/write attempts that must fail." Skips
 * itself if Postgres isn't reachable (`npm run db:up`), same convention
 * as `auth.repository.integration.test.ts`.
 */
const rawPrisma = new PrismaClient();
const scoped = applyTenantScoping(rawPrisma);
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@tenant-scoping-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompanyWithUserProductDevice(label: 'a' | 'b') {
  const company = await rawPrisma.companies.create({
    data: { name: `Tenant Test Co ${label}`, email: `co-${label}${MARK}` },
  });
  const user = await rawPrisma.users.create({
    data: {
      first_name: 'T',
      last_name: label,
      email: `user-${label}${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: company.id,
    },
  });
  const product = await rawPrisma.products.create({
    data: {
      name: `Product ${label}`,
      status: 'active',
      company_id: company.id,
      created_by: user.id,
    },
  });
  const device = await rawPrisma.devices.create({
    data: {
      device_unique_identifier: `dev-${label}${MARK}`,
      name: `Device ${label}`,
      location: 'loc',
      tags: 'tag',
      product_id: product.id,
      user_id: user.id,
    },
  });
  const role = await rawPrisma.roles.create({
    data: { company_id: company.id, name: `role-${label}`, guard_name: 'api' },
  });
  return { company, user, product, device, role };
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  // Scoped by this file's own companies (via MARK), not a generic
  // `name: { contains: "Product " }` match — that generic filter was a
  // real, live bug: every other products/devices/ingestion integration
  // test also names its seed products "Product <label><their own mark>",
  // which *contains* "Product " too, so this cleanup was deleting other
  // test files' in-flight rows whenever it happened to run concurrently
  // with them (cascading to their devices/device_values via FK constraints
  // — the intermittent "no record found"/"foreign key violated" failures
  // this session's module 2.4 work surfaced). Found and fixed 2026-09-14.
  const testCompanies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map(c => c.id);
  const testProducts = await rawPrisma.products.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testProductIds = testProducts.map(p => p.id);

  await rawPrisma.devices.deleteMany({ where: { product_id: { in: testProductIds } } });
  await rawPrisma.products.deleteMany({ where: { id: { in: testProductIds } } });
  await rawPrisma.roles.deleteMany({
    where: { name: { in: ['role-a', 'role-b'] }, company_id: { in: testCompanyIds } },
  });
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
  await rawPrisma.companies.deleteMany({ where: { email: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)(
  'tenant-scoping extension (real Postgres, 11.20/11.37 regression)',
  () => {
    it("a company-ruled model (roles): findMany only returns the caller's own company's rows", async () => {
      const { company: companyA, role: roleA } = await seedCompanyWithUserProductDevice('a');
      const { role: roleB } = await seedCompanyWithUserProductDevice('b');

      const seenAsA = await runWithContextAsync(contextFor('0', companyA.id.toString()), () =>
        scoped.roles.findMany({ where: { name: { in: ['role-a', 'role-b'] } } })
      );

      expect(seenAsA.map(r => r.id)).toEqual([roleA.id]);
      expect(seenAsA.map(r => r.id)).not.toContain(roleB.id);
    });

    it("11.20 regression: findUnique/update/delete on another company's role by id acts as not-found", async () => {
      const { company: companyA } = await seedCompanyWithUserProductDevice('a');
      const { role: roleB } = await seedCompanyWithUserProductDevice('b');
      const contextA = contextFor('0', companyA.id.toString());

      const found = await runWithContextAsync(contextA, () =>
        scoped.roles.findUnique({ where: { id: roleB.id } })
      );
      expect(found).toBeNull();

      await expect(
        runWithContextAsync(contextA, () =>
          scoped.roles.update({ where: { id: roleB.id }, data: { description: 'hacked' } })
        )
      ).rejects.toThrow();

      await expect(
        runWithContextAsync(contextA, () => scoped.roles.delete({ where: { id: roleB.id } }))
      ).rejects.toThrow();

      // Company B's role is untouched.
      const stillThere = await runAsSystemAsync(() =>
        rawPrisma.roles.findUnique({ where: { id: roleB.id } })
      );
      expect(stillThere?.description).not.toBe('hacked');
    });

    it("11.37 regression: a device/product owned by company B is invisible to company A's context", async () => {
      const { company: companyA } = await seedCompanyWithUserProductDevice('a');
      const { product: productB, device: deviceB } = await seedCompanyWithUserProductDevice('b');
      const contextA = contextFor('999999', companyA.id.toString());

      // products is company-ruled.
      const productAsA = await runWithContextAsync(contextA, () =>
        scoped.products.findUnique({ where: { id: productB.id } })
      );
      expect(productAsA).toBeNull();

      // devices is user-ruled — company A's own user id will never match userB's, proving the same closure independent of the tenant kind.
      const deviceAsA = await runWithContextAsync(contextA, () =>
        scoped.devices.findUnique({ where: { id: deviceB.id } })
      );
      expect(deviceAsA).toBeNull();

      await expect(
        runWithContextAsync(contextA, () => scoped.devices.delete({ where: { id: deviceB.id } }))
      ).rejects.toThrow();

      const stillThere = await runAsSystemAsync(() =>
        rawPrisma.devices.findUnique({ where: { id: deviceB.id } })
      );
      expect(stillThere).not.toBeNull();
    });

    it('create() forces the tenant key from context, ignoring whatever the caller supplies', async () => {
      const { company: companyA, user: userA } = await seedCompanyWithUserProductDevice('a');
      const { company: companyB } = await seedCompanyWithUserProductDevice('b');
      const contextA = contextFor(userA.id.toString(), companyA.id.toString());

      const created = await runWithContextAsync(contextA, () =>
        // Caller tries to sneak company_id: companyB into a company-scoped create.
        scoped.products.create({
          data: {
            name: `Product spoof${MARK}`,
            status: 'active',
            company_id: companyB.id,
            created_by: userA.id,
          },
        })
      );

      expect(created.company_id.toString()).toBe(companyA.id.toString());
      await rawPrisma.products.deleteMany({ where: { name: `Product spoof${MARK}` } });
    });

    it('runAsSystemAsync() bypasses scoping entirely', async () => {
      const { role: roleA } = await seedCompanyWithUserProductDevice('a');
      const { role: roleB } = await seedCompanyWithUserProductDevice('b');

      const both = await runAsSystemAsync(() =>
        scoped.roles.findMany({ where: { name: { in: ['role-a', 'role-b'] } } })
      );

      expect(both.map(r => r.id).sort()).toEqual([roleA.id, roleB.id].sort());
    });

    it('throws when there is no request context at all for a tenant-owned model', async () => {
      await expect(scoped.roles.findMany({})).rejects.toThrow(/no request context/);
    });

    it('throws for a model with no registered tenant rule', async () => {
      // `customer_locations` (module 4.7 fleet-crm-billing deliberately left
      // it unregistered — user-deferred, zero Laravel code references it) —
      // module 4.2 registered `trips`/`trip_planned_yards`/`yards`/
      // `fleet_customers` here previously, module 4.5 registered
      // `compliance_documents`, and 4.7 itself registered `vendors` (kept for
      // a future pass even though its own CRUD wasn't built this session);
      // this test now needs a table nothing has claimed yet.
      await expect(runAsSystemAsync(() => scoped.customer_locations.findMany({}))).rejects.toThrow(
        /No tenant rule registered/
      );
    });
  }
);
