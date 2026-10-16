import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../tenant-scoping.js';
import { applyTimestamps } from '../timestamps.js';
import { runAsSystemAsync } from '../../http/request-context.js';

/**
 * Real-Postgres regression suite for the timestamps extension (D-0050) —
 * same skip-if-unreachable convention as `tenant-scoping.integration.test.ts`.
 * `protocols` is `none`-ruled (no request context needed) and has both
 * columns, making it a clean model to exercise this against directly.
 */
const rawPrisma = new PrismaClient();
const client = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@timestamps-test';

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  await rawPrisma.protocols.deleteMany({ where: { name: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('timestamps extension (real Postgres, D-0050)', () => {
  it("create() fills created_at/updated_at when the caller didn't supply them", async () => {
    const created = await client.protocols.create({ data: { name: `Fresh${MARK}` } });

    expect(created.created_at).not.toBeNull();
    expect(created.updated_at).not.toBeNull();
  });

  it('create() does not override an explicitly-supplied value', async () => {
    const explicit = new Date('2020-01-01T00:00:00.000Z');

    const created = await client.protocols.create({
      data: { name: `Explicit${MARK}`, created_at: explicit },
    });

    expect(created.created_at?.toISOString()).toBe(explicit.toISOString());
  });

  it('update() bumps updated_at but never touches created_at', async () => {
    const created = await runAsSystemAsync(() =>
      rawPrisma.protocols.create({ data: { name: `ToUpdate${MARK}` } })
    );
    await new Promise(resolve => setTimeout(resolve, 10));

    const updated = await client.protocols.update({
      where: { id: created.id },
      data: { name: `Updated${MARK}` },
    });

    expect(updated.created_at).toBeNull(); // seeded via rawPrisma directly, so it started null
    expect(updated.updated_at).not.toBeNull();
  });

  it('a model with neither column (e.g. model_has_roles) passes through unchanged', async () => {
    // Sanity check only — no row created, just confirms the extension doesn't throw for a columnless model.
    await expect(
      runAsSystemAsync(() => client.model_has_roles.findMany({ take: 0 }))
    ).resolves.toEqual([]);
  });
});
