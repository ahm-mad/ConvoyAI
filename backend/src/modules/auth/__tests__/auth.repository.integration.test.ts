import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { AuthRepository } from '../auth.repository.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests" — unit tests use
 * fakes, `AuthRepository` itself needs one real-DB check). Requires
 * `docker-compose` up (`npm run db:up`) — skips itself if Postgres isn't
 * reachable, rather than failing environments that haven't brought the
 * stack up.
 *
 * `AuthRepository` gets the same tenant-scoping-extended client the real
 * app does (`prisma`) — it already wraps its `users`-table calls in
 * `runAsSystem()` internally (module 1.3 requires it, `users` is
 * `company`-ruled), so this test also proves that integration. Cleanup
 * uses the plain, unextended `rawPrisma` — test infrastructure, not
 * app code, so it never goes through the tenant-scoping interceptor at
 * all (nothing to bypass).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  await rawPrisma.password_reset_tokens.deleteMany({
    where: { email: { contains: '@integration-test.example' } },
  });
  const testUsers = await rawPrisma.users.findMany({
    where: { email: { contains: '@integration-test.example' } },
    select: { company_id: true },
  });
  await rawPrisma.users.deleteMany({ where: { email: { contains: '@integration-test.example' } } });
  const companyIds = testUsers.map(u => u.company_id).filter((id): id is bigint => id !== null);
  if (companyIds.length > 0) {
    await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
  }
});

describe.skipIf(!dbAvailable)('AuthRepository (real Postgres)', () => {
  it('creates a user and finds it by email and id', async () => {
    const repo = new AuthRepository(prisma);
    const email = 'create-find@integration-test.example';

    const created = await repo.createUser(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email,
        number: '555',
        password: 'unused',
        timezone: 'UTC',
      },
      'argon2-hash-placeholder'
    );

    expect(created.email).toBe(email);
    expect(created.emailVerifiedAt).toBeNull();

    const byEmail = await repo.findByEmail(email);
    expect(byEmail?.id).toBe(created.id);

    const byId = await repo.findById(created.id);
    expect(byId?.email).toBe(email);
  });

  it('updatePassword persists the new hash', async () => {
    const repo = new AuthRepository(prisma);
    const email = 'update-password@integration-test.example';
    const created = await repo.createUser(
      { firstName: 'A', lastName: 'B', email, number: '1', password: 'unused', timezone: 'UTC' },
      'old-hash'
    );

    await repo.updatePassword(created.id, 'new-hash');

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.passwordHash).toBe('new-hash');
  });

  it('password reset token round-trip: upsert, find, delete', async () => {
    const repo = new AuthRepository(prisma);
    const email = 'reset-token@integration-test.example';
    await repo.createUser(
      { firstName: 'A', lastName: 'B', email, number: '1', password: 'unused', timezone: 'UTC' },
      'hash'
    );

    await repo.upsertPasswordResetToken(email, 'token-hash-1');
    const found = await repo.findPasswordResetToken(email);
    expect(found?.tokenHash).toBe('token-hash-1');

    // Upsert replaces, doesn't duplicate (matches Laravel's DatabaseTokenRepository).
    await repo.upsertPasswordResetToken(email, 'token-hash-2');
    const replaced = await repo.findPasswordResetToken(email);
    expect(replaced?.tokenHash).toBe('token-hash-2');

    await repo.deletePasswordResetToken(email);
    expect(await repo.findPasswordResetToken(email)).toBeUndefined();
  });

  it("markVerifiedAndAssignCompany (module 5.3's final onboarding write) sets email_verified_at/company_id/company_domain in one update", async () => {
    const repo = new AuthRepository(prisma);
    const email = 'verify-onboard@integration-test.example';
    const created = await repo.createUser(
      { firstName: 'A', lastName: 'B', email, number: '1', password: 'unused', timezone: 'UTC' },
      'hash'
    );
    expect(created.emailVerifiedAt).toBeNull();
    const company = await rawPrisma.companies.create({
      data: { name: 'integration-test.example' },
    });

    await repo.markVerifiedAndAssignCompany(
      created.id,
      company.id.toString(),
      'integration-test.example'
    );

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.emailVerifiedAt).not.toBeNull();
    expect(reloaded?.companyId).toBe(company.id.toString());
    const raw = await rawPrisma.users.findUnique({ where: { id: BigInt(created.id) } });
    expect(raw?.company_domain).toBe('integration-test.example');
  });

  it("markVerifiedAndAssignCompany accepts a null companyDomain (the free-email-signup path, D-0086's sibling decision)", async () => {
    const repo = new AuthRepository(prisma);
    const email = 'verify-onboard-free@integration-test.example';
    const created = await repo.createUser(
      { firstName: 'A', lastName: 'B', email, number: '1', password: 'unused', timezone: 'UTC' },
      'hash'
    );
    const company = await rawPrisma.companies.create({ data: { name: email } });

    await repo.markVerifiedAndAssignCompany(created.id, company.id.toString(), null);

    const raw = await rawPrisma.users.findUnique({ where: { id: BigInt(created.id) } });
    expect(raw?.company_domain).toBeNull();
  });

  it('linkSocialAccount attaches provider/id and verifies the email', async () => {
    const repo = new AuthRepository(prisma);
    const email = 'link-social@integration-test.example';
    const created = await repo.createUser(
      { firstName: 'A', lastName: 'B', email, number: '1', password: 'unused', timezone: 'UTC' },
      'hash'
    );
    expect(created.emailVerifiedAt).toBeNull();

    await repo.linkSocialAccount(created, 'google', 'google-id-123');

    const linked = await repo.findBySocialAccount('google', 'google-id-123');
    expect(linked?.id).toBe(created.id);
    expect(linked?.emailVerifiedAt).not.toBeNull();
  });
});
