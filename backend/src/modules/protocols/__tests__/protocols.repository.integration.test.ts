import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import { ProtocolsRepository } from '../protocols.repository.js';

/** Real-Postgres integration test (CONVENTIONS.md "Tests"), same skip-if-unreachable convention as this project's other integration suites. */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@protocols-repo-test';

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  await rawPrisma.protocols.deleteMany({ where: { name: { contains: MARK } } });
});

describe.skipIf(!dbAvailable)('ProtocolsRepository (real Postgres)', () => {
  it('creates and finds a protocol, defaulting to the transport category (schema default)', async () => {
    const repo = new ProtocolsRepository(prisma);

    const created = await repo.create({ name: `MQTTS${MARK}` });
    expect(created.category).toBe('transport');

    const found = await repo.findById(created.id);
    expect(found?.name).toBe(`MQTTS${MARK}`);
  });

  it('list filters by search and category', async () => {
    const repo = new ProtocolsRepository(prisma);
    await rawPrisma.protocols.create({
      data: { name: `LoRaWAN${MARK}`, category: 'device_protocol' },
    });
    await rawPrisma.protocols.create({ data: { name: `HTTPS${MARK}`, category: 'transport' } });

    const deviceProtocols = await repo.list({
      search: undefined,
      category: 'device_protocol',
      page: 1,
      perPage: 10,
    });
    expect(deviceProtocols.items.map(p => p.name)).toContain(`LoRaWAN${MARK}`);
    expect(deviceProtocols.items.map(p => p.name)).not.toContain(`HTTPS${MARK}`);

    const bySearch = await repo.list({
      search: 'LoRaWAN',
      category: undefined,
      page: 1,
      perPage: 10,
    });
    expect(bySearch.items.map(p => p.name)).toContain(`LoRaWAN${MARK}`);
  });

  it('update changes the name; delete removes the row', async () => {
    const repo = new ProtocolsRepository(prisma);
    const created = await repo.create({ name: `Original${MARK}` });

    const updated = await repo.update(created.id, { name: `Renamed${MARK}` });
    expect(updated.name).toBe(`Renamed${MARK}`);

    await repo.delete(created.id);
    expect(await repo.findById(created.id)).toBeUndefined();
  });
});
