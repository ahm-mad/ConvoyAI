import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { RbacRepository } from '../rbac.repository.js';
import type { CreateCompanyInput } from '../rbac.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"), same
 * skip-if-unreachable convention as `auth.repository.integration.test.ts`
 * and `tenant-scoping.integration.test.ts`.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@rbac-repo-test.example';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

function inputFor(label: string): CreateCompanyInput {
  return {
    name: `Rbac Test Co ${label}`,
    email: `co-${label}${MARK}`,
    address: '1 Main St',
    city: 'Springfield',
    state: 'IL',
    country: 'US',
    zipCode: '62704',
  };
}

/** Same fixture, shaped for a direct (raw, non-repository) `rawPrisma.companies.create()` call. */
function rawCompanyDataFor(label: string) {
  const input = inputFor(label);
  return {
    name: input.name,
    email: input.email,
    address: input.address,
    city: input.city,
    state: input.state,
    country: input.country,
    zip_code: input.zipCode,
  };
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  // `roles.company_id` has no declared FK/cascade in the frozen schema
  // (confirmed against schema.sql — it's an unenforced logical reference,
  // same as Laravel's own loose typing), so test companies' roles must be
  // cleaned up explicitly before the companies themselves.
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
  const testRoles = await rawPrisma.roles.findMany({
    where: { company_id: { in: testCompanyIds } },
    select: { id: true },
  });
  const testRoleIds = testRoles.map(r => r.id);
  const testModules = await rawPrisma.modules.findMany({
    where: { code: { contains: MARK } },
    select: { id: true },
  });
  const testModuleIds = testModules.map(m => m.id);

  await rawPrisma.model_has_roles.deleteMany({
    where: { model_type: 'App\\Domain\\Auth\\Models\\User', model_id: { in: testUserIds } },
  });
  await rawPrisma.role_has_permissions.deleteMany({ where: { role_id: { in: testRoleIds } } });
  await rawPrisma.module_role.deleteMany({ where: { role_id: { in: testRoleIds } } });
  await rawPrisma.permissions.deleteMany({ where: { name: { contains: MARK } } });
  await rawPrisma.roles.deleteMany({ where: { company_id: { in: testCompanyIds } } });
  await rawPrisma.modules.deleteMany({ where: { id: { in: testModuleIds } } });
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: testCompanyIds } } });
});

describe.skipIf(!dbAvailable)('RbacRepository (real Postgres)', () => {
  it('creates a company, finds it by id, and updates it', async () => {
    const repo = new RbacRepository(prisma);
    const created = await repo.create(inputFor('a'));

    expect(created.name).toBe('Rbac Test Co a');

    const found = await repo.findById(created.id);
    expect(found?.email).toBe(inputFor('a').email);

    const updated = await repo.update(created.id, { ...inputFor('a'), city: 'Shelbyville' });
    expect(updated.city).toBe('Shelbyville');
  });

  it("findByName/findByEmail exclude the given id (for update's own-row check)", async () => {
    const repo = new RbacRepository(prisma);
    const created = await repo.create(inputFor('b'));

    const email = created.email;
    expect(email).not.toBeNull();
    expect(await repo.findByName(created.name)).toBeDefined();
    expect(await repo.findByName(created.name, created.id)).toBeUndefined();
    expect(await repo.findByEmail(email ?? '')).toBeDefined();
    expect(await repo.findByEmail(email ?? '', created.id)).toBeUndefined();
  });

  it('bootstrapCompany creates the admin/manager/user role skeleton, idempotently (D-0038)', async () => {
    const repo = new RbacRepository(prisma);
    const created = await repo.create(inputFor('c'));

    await repo.bootstrapCompany(created.id);
    await repo.bootstrapCompany(created.id); // idempotent, matches Laravel's firstOrCreate

    const roles = await rawPrisma.roles.findMany({ where: { company_id: BigInt(created.id) } });
    expect(roles.map(r => r.name).sort()).toEqual(['admin', 'manager', 'user']);
  });

  it('bulkDelete removes exactly the given ids', async () => {
    const repo = new RbacRepository(prisma);
    const a = await repo.create(inputFor('d'));
    const b = await repo.create(inputFor('e'));

    await repo.bulkDelete([a.id]);

    expect(await repo.findById(a.id)).toBeUndefined();
    expect(await repo.findById(b.id)).toBeDefined();

    await repo.bulkDelete([b.id]);
  });

  it('resolveClaims (D-0040) returns companyId + real roles/perms from model_has_roles/role_has_permissions', async () => {
    const company = await rawPrisma.companies.create({ data: rawCompanyDataFor('f') });
    const user = await rawPrisma.users.create({
      data: {
        first_name: 'T',
        last_name: 'Claims',
        email: `user-f${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: company.id,
      },
    });
    const role = await rawPrisma.roles.create({
      data: { company_id: company.id, name: 'admin', guard_name: 'api' },
    });
    const permission = await rawPrisma.permissions.create({
      data: { name: 'all-devices', guard_name: 'api' },
    });
    await rawPrisma.role_has_permissions.create({
      data: { role_id: role.id, permission_id: permission.id },
    });
    await rawPrisma.model_has_roles.create({
      data: { role_id: role.id, model_type: 'App\\Domain\\Auth\\Models\\User', model_id: user.id },
    });

    const repo = new RbacRepository(prisma);
    const claims = await runWithContextAsync(
      contextFor(user.id.toString(), company.id.toString()),
      () => repo.resolveClaims(user.id.toString())
    );

    expect(claims.companyId).toBe(company.id.toString());
    expect(claims.roles).toEqual(['admin']);
    expect(claims.perms).toEqual(['all-devices']);

    await rawPrisma.role_has_permissions.deleteMany({ where: { role_id: role.id } });
    await rawPrisma.permissions.deleteMany({ where: { id: permission.id } });
  });

  it('resolveClaims for a user with no roles returns empty arrays, not a throw', async () => {
    const company = await rawPrisma.companies.create({ data: rawCompanyDataFor('g') });
    const user = await rawPrisma.users.create({
      data: {
        first_name: 'T',
        last_name: 'NoRoles',
        email: `user-g${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: company.id,
      },
    });

    const repo = new RbacRepository(prisma);
    const claims = await repo.resolveClaims(user.id.toString());

    expect(claims.companyId).toBe(company.id.toString());
    expect(claims.roles).toEqual([]);
    expect(claims.perms).toEqual([]);
  });

  it("createRole scopes the new row to the caller's own company (never trusts a supplied company_id)", async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('h'));
    const module = await rawPrisma.modules.create({
      data: { code: `fleet${MARK}`, slug: `fleet${MARK}` },
    });

    const role = await runWithContextAsync(contextFor('1', companyA.id), () =>
      repo.createRole({
        name: 'Hr',
        description: 'Human Resources',
        moduleIds: [module.id.toString()],
      })
    );

    expect(role.companyId).toBe(companyA.id);
    expect(role.modules).toEqual([
      { id: module.id.toString(), code: module.code, slug: module.slug },
    ]);
    expect(role.permissions).toHaveLength(1);
    expect(role.permissions[0]?.name).toBe(`all-fleet${MARK}`);
  });

  it('updateRole replaces the module/permission set (full sync, matching syncModulesAndPermissions)', async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('i'));
    const moduleA = await rawPrisma.modules.create({
      data: { code: `mod-a${MARK}`, slug: `mod-a${MARK}` },
    });
    const moduleB = await rawPrisma.modules.create({
      data: { code: `mod-b${MARK}`, slug: `mod-b${MARK}` },
    });
    const context = contextFor('1', companyA.id);

    const role = await runWithContextAsync(context, () =>
      repo.createRole({ name: 'Hr', description: undefined, moduleIds: [moduleA.id.toString()] })
    );
    const updated = await runWithContextAsync(context, () =>
      repo.updateRole(role.id, {
        name: 'Hr Updated',
        description: 'kept',
        moduleIds: [moduleB.id.toString()],
      })
    );

    expect(updated.name).toBe('Hr Updated');
    expect(updated.modules.map(m => m.id)).toEqual([moduleB.id.toString()]);
    expect(updated.permissions.map(p => p.name)).toEqual([`all-mod-b${MARK}`]);
  });

  it('findRoleById is scoped: a cross-tenant role id returns undefined (closes 11.20)', async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('j'));
    const companyB = await repo.create(inputFor('k'));
    const roleB = await runWithContextAsync(contextFor('1', companyB.id), () =>
      repo.createRole({ name: 'Ops', description: undefined, moduleIds: [] })
    );

    const seenAsA = await runWithContextAsync(contextFor('2', companyA.id), () =>
      repo.findRoleById(roleB.id)
    );

    expect(seenAsA).toBeUndefined();
  });

  it("findRolesForCompany returns only the caller's own company's roles", async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('l'));
    const companyB = await repo.create(inputFor('m'));
    await runWithContextAsync(contextFor('1', companyA.id), () =>
      repo.createRole({ name: 'A-role', description: undefined, moduleIds: [] })
    );
    await runWithContextAsync(contextFor('2', companyB.id), () =>
      repo.createRole({ name: 'B-role', description: undefined, moduleIds: [] })
    );

    const seenAsA = await runWithContextAsync(contextFor('1', companyA.id), () =>
      repo.findRolesForCompany()
    );

    expect(seenAsA.map(r => r.name)).toEqual(['A-role']);
  });

  it('findRolesForCompany: D-0114 -- real users assigned to a role via model_has_roles appear in its users array (no Prisma relation exists for that, batched manually)', async () => {
    const repo = new RbacRepository(prisma);
    const company = await repo.create(inputFor('role-users'));
    const context = contextFor('1', company.id);
    const role = await runWithContextAsync(context, () =>
      repo.createRole({ name: 'Staffed', description: undefined, moduleIds: [] })
    );
    const user = await rawPrisma.users.create({
      data: {
        first_name: 'Role',
        last_name: 'Member',
        email: `role-member${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: BigInt(company.id),
      },
    });
    await repo.assignRoleToUser(user.id.toString(), role.id);

    const roles = await runWithContextAsync(context, () => repo.findRolesForCompany());

    const staffed = roles.find(r => r.id === role.id);
    expect(staffed?.users).toHaveLength(1);
    expect(staffed?.users[0]?.id).toBe(user.id.toString());
    expect(staffed?.users[0]?.email).toBe(user.email);
  });

  it('deleteRole removes the role and its module/permission pivot rows', async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('n'));
    const module = await rawPrisma.modules.create({
      data: { code: `del-mod${MARK}`, slug: `del-mod${MARK}` },
    });
    const context = contextFor('1', companyA.id);
    const role = await runWithContextAsync(context, () =>
      repo.createRole({ name: 'Temp', description: undefined, moduleIds: [module.id.toString()] })
    );

    await runWithContextAsync(context, () => repo.deleteRole(role.id));

    expect(await runWithContextAsync(context, () => repo.findRoleById(role.id))).toBeUndefined();
    expect(await rawPrisma.module_role.findMany({ where: { role_id: BigInt(role.id) } })).toEqual(
      []
    );
  });

  it('roleHasAssignedUsers reflects model_has_roles', async () => {
    const repo = new RbacRepository(prisma);
    const companyA = await repo.create(inputFor('o'));
    const context = contextFor('1', companyA.id);
    const role = await runWithContextAsync(context, () =>
      repo.createRole({ name: 'Assigned', description: undefined, moduleIds: [] })
    );

    expect(await repo.roleHasAssignedUsers(role.id)).toBe(false);

    const user = await rawPrisma.users.create({
      data: {
        first_name: 'T',
        last_name: 'Assigned',
        email: `assigned${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: BigInt(companyA.id),
      },
    });
    await rawPrisma.model_has_roles.create({
      data: {
        role_id: BigInt(role.id),
        model_type: 'App\\Domain\\Auth\\Models\\User',
        model_id: user.id,
      },
    });

    expect(await repo.roleHasAssignedUsers(role.id)).toBe(true);
  });

  it('modules: listModulesForAdmin / moduleCodeExists / createModule (RolePremissionController/ModuleController parity)', async () => {
    const repo = new RbacRepository(prisma);
    const code = `smoke-mod${MARK}`;

    expect(await repo.moduleCodeExists(code)).toBe(false);
    await repo.createModule(code);
    expect(await repo.moduleCodeExists(code)).toBe(true);

    const modules = await repo.listModulesForAdmin();
    expect(modules.some(m => m.code === code)).toBe(true);

    const permissions = await rawPrisma.permissions.findMany({
      where: { name: { in: [`${code}_all`, `${code}_none`] } },
    });
    expect(permissions.map(p => p.name).sort()).toEqual([`${code}_all`, `${code}_none`]);
  });

  it("createMinimal creates a lean company (no address/city/etc) — module 5.3's onboarding path", async () => {
    const repo = new RbacRepository(prisma);

    const company = await repo.createMinimal(
      `acme-onboarding${MARK}`,
      `acme-onboarding${MARK}@example.com`
    );

    expect(company.name).toBe(`acme-onboarding${MARK}`);
    expect(company.address).toBeNull();
  });

  it("findRoleIdByCompanyAndName resolves a bootstrap role's id under system context, scoped by an explicit companyId", async () => {
    const repo = new RbacRepository(prisma);
    const company = await repo.createMinimal(
      `role-lookup${MARK}`,
      `role-lookup${MARK}@example.com`
    );
    await repo.bootstrapCompany(company.id);

    const adminId = await repo.findRoleIdByCompanyAndName(company.id, 'admin');
    expect(adminId).toBeDefined();
    expect(await repo.findRoleIdByCompanyAndName(company.id, 'nonexistent-role')).toBeUndefined();
  });

  it('grantModulePermissionsToBootstrapRoles: admin/manager get all-{slug}, user gets none-{slug}, idempotently', async () => {
    const repo = new RbacRepository(prisma);
    const company = await repo.createMinimal(
      `grant-perms${MARK}`,
      `grant-perms${MARK}@example.com`
    );
    await repo.bootstrapCompany(company.id);

    await repo.grantModulePermissionsToBootstrapRoles(company.id, [`fleet-mgmt${MARK}`]);
    await repo.grantModulePermissionsToBootstrapRoles(company.id, [`fleet-mgmt${MARK}`]); // idempotent re-run

    const adminId = await repo.findRoleIdByCompanyAndName(company.id, 'admin');
    const managerId = await repo.findRoleIdByCompanyAndName(company.id, 'manager');
    const userId = await repo.findRoleIdByCompanyAndName(company.id, 'user');

    const adminPerms = await rawPrisma.role_has_permissions.findMany({
      where: { role_id: BigInt(adminId ?? '0') },
      include: { permissions: true },
    });
    const managerPerms = await rawPrisma.role_has_permissions.findMany({
      where: { role_id: BigInt(managerId ?? '0') },
      include: { permissions: true },
    });
    const userPerms = await rawPrisma.role_has_permissions.findMany({
      where: { role_id: BigInt(userId ?? '0') },
      include: { permissions: true },
    });

    expect(adminPerms.map(p => p.permissions.name)).toEqual([`all-fleet-mgmt${MARK}`]);
    expect(managerPerms.map(p => p.permissions.name)).toEqual([`all-fleet-mgmt${MARK}`]);
    expect(userPerms.map(p => p.permissions.name)).toEqual([`none-fleet-mgmt${MARK}`]);
  });

  it("assignRoleToUser is idempotent — re-running it never throws on model_has_roles' composite primary key", async () => {
    const repo = new RbacRepository(prisma);
    const company = await repo.createMinimal(
      `assign-role${MARK}`,
      `assign-role${MARK}@example.com`
    );
    await repo.bootstrapCompany(company.id);
    const adminId = await repo.findRoleIdByCompanyAndName(company.id, 'admin');
    const user = await rawPrisma.users.create({
      data: {
        first_name: 'T',
        last_name: 'Onboard',
        email: `onboard-user${MARK}`,
        number: '1',
        password: 'unused',
        status: 'active',
        company_id: BigInt(company.id),
      },
    });

    await repo.assignRoleToUser(user.id.toString(), adminId ?? '0');
    await repo.assignRoleToUser(user.id.toString(), adminId ?? '0'); // idempotent re-run, must not throw

    const links = await rawPrisma.model_has_roles.findMany({
      where: { model_type: 'App\\Domain\\Auth\\Models\\User', model_id: user.id },
    });
    expect(links).toHaveLength(1);
  });

  it('deletePermission removes the permission and its role_has_permissions/model_has_permissions rows', async () => {
    const repo = new RbacRepository(prisma);
    const permission = await rawPrisma.permissions.create({
      data: { name: `del-perm${MARK}`, guard_name: 'api' },
    });

    expect(await repo.findPermissionById(permission.id.toString())).toEqual({
      id: permission.id.toString(),
      name: permission.name,
    });

    await repo.deletePermission(permission.id.toString());

    expect(await repo.findPermissionById(permission.id.toString())).toBeUndefined();
  });
});
