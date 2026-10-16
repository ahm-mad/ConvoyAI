import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../tenant-scoping.js';
import { applyTimestamps } from '../timestamps.js';
import { applyAuditActors } from '../audit-actors.js';
import {
  runAsSystemAsync,
  runWithContextAsync,
  type RequestContext,
} from '../../http/request-context.js';

/** Real-Postgres suite for the audit-actors extension (D-0172); skips itself when Postgres is unreachable. */
const rawPrisma = new PrismaClient();
const client = applyAuditActors(applyTimestamps(applyTenantScoping(rawPrisma)));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@audit-actors-test.example';
const NAME = 'ZZ audit-actors test vehicle';

function contextFor(userId: string, companyId: string): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

afterEach(async () => {
  await rawPrisma.vehicles.deleteMany({ where: { name: NAME } });
  await rawPrisma.users.deleteMany({ where: { email: { contains: MARK } } });
  await rawPrisma.companies.deleteMany({ where: { email: { contains: MARK } } });
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

async function seed() {
  const company = await rawPrisma.companies.create({
    data: { name: 'Audit Test Co', email: `co${MARK}` },
  });
  const user = await rawPrisma.users.create({
    data: {
      first_name: 'A',
      last_name: 'B',
      email: `u${MARK}`,
      number: '1',
      password: 'unused',
      status: 'active',
      company_id: company.id,
    },
  });
  return { company, user };
}

describe.skipIf(!dbAvailable)('audit-actors extension (real Postgres, D-0172)', () => {
  it("a user's create/update is recorded in created_by/updated_by; a system update clears updated_by", async () => {
    const { company, user } = await seed();
    const ctx = contextFor(user.id.toString(), company.id.toString());

    const created = await runWithContextAsync(ctx, () =>
      client.vehicles.create({
        data: { name: NAME, vehicle_category: 'van', company_id: company.id },
      })
    );
    expect(created.created_by).toBe(user.id);
    expect(created.updated_by).toBe(user.id);

    const edited = await runWithContextAsync(ctx, () =>
      client.vehicles.update({ where: { id: created.id }, data: { make: 'Ford' } })
    );
    expect(edited.created_by).toBe(user.id);
    expect(edited.updated_by).toBe(user.id);

    const automatic = await runAsSystemAsync(() =>
      client.vehicles.update({ where: { id: created.id }, data: { odometer_km: 5 } })
    );
    expect(automatic.created_by).toBe(user.id);
    expect(automatic.updated_by).toBeNull();
  });

  it('a create by the system leaves both columns NULL', async () => {
    const { company } = await seed();
    const row = await runAsSystemAsync(() =>
      client.vehicles.create({
        data: { name: NAME, vehicle_category: 'van', company_id: company.id },
      })
    );
    expect(row.created_by).toBeNull();
    expect(row.updated_by).toBeNull();
  });
});
