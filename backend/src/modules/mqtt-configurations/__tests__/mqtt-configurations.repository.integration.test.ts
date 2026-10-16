import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { MqttConfigurationsRepository } from '../mqtt-configurations.repository.js';
import type { CreateMqttConfigurationInput } from '../mqtt-configurations.types.js';

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers module
 * 6.5's two central acceptance criteria: at-rest encryption round-trips
 * transparently through the repository (D-0117 — the raw DB column never
 * holds plaintext, but callers always get plaintext back), and
 * `company`-tenant isolation (the default scoping extension makes a
 * cross-company id lookup structurally impossible, not just checked).
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@mqtt-config-repo-test.example';

const FULL_INPUT: CreateMqttConfigurationInput = {
  name: 'Primary broker',
  host: 'broker.example.com',
  port: 8883,
  username: 'broker-user',
  password: 'broker-pass',
  useTls: true,
  clientIdPrefix: 'prefix',
  description: 'Test config',
};

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Mqtt Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);

  await rawPrisma.mqtt_configurations.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('MqttConfigurationsRepository (real Postgres)', () => {
  it("create: encrypts username/password at rest, returns plaintext, and stamps the caller's own company_id (never a client-supplied one)", async () => {
    const company = await seedCompany('a');
    const repo = new MqttConfigurationsRepository(prisma);

    const created = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.create(FULL_INPUT)
    );

    expect(created).toMatchObject({
      companyId: company.id.toString(),
      name: 'Primary broker',
      host: 'broker.example.com',
      port: 8883,
      username: 'broker-user',
      password: 'broker-pass',
      useTls: true,
      clientIdPrefix: 'prefix',
      status: 'active',
      description: 'Test config',
    });

    const raw = await rawPrisma.mqtt_configurations.findUniqueOrThrow({
      where: { id: BigInt(created.id) },
    });
    expect(raw.username).not.toBe('broker-user');
    expect(raw.password).not.toBe('broker-pass');
  });

  it("create: omitting use_tls falls back to the DB default (true), matching Laravel's validated()-omits-missing-keys behavior", async () => {
    const company = await seedCompany('b');
    const repo = new MqttConfigurationsRepository(prisma);

    const created = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.create({ ...FULL_INPUT, useTls: undefined })
    );

    expect(created.useTls).toBe(true);
  });

  it("findById: a company cannot read another company's configuration by id (tenant isolation)", async () => {
    const companyA = await seedCompany('c');
    const companyB = await seedCompany('d');
    const repo = new MqttConfigurationsRepository(prisma);

    const created = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.create(FULL_INPUT)
    );

    const foundByOwner = await runWithContextAsync(contextFor(companyA.id.toString()), () =>
      repo.findById(created.id)
    );
    const foundByOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findById(created.id)
    );

    expect(foundByOwner?.id).toBe(created.id);
    expect(foundByOther).toBeUndefined();
  });

  it('recordTestResult: persists status/last_tested_at/test_result', async () => {
    const company = await seedCompany('e');
    const repo = new MqttConfigurationsRepository(prisma);

    const created = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.create(FULL_INPUT)
    );
    const testResult = {
      success: true,
      tested_at: '2026-09-18T00:00:00.000Z',
      message: 'Connection successful',
    };

    const updated = await runWithContextAsync(contextFor(company.id.toString()), () =>
      repo.recordTestResult(created.id, 'active', testResult)
    );

    expect(updated.status).toBe('active');
    expect(updated.lastTestedAt).not.toBeNull();
    expect(updated.testResult).toEqual(testResult);
  });
});
