import { afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetMaintenanceDueRepository } from '../fleet-maintenance-due.repository.js';

/** Real-Postgres integration test: the company-wide schedule list (D-0184, flow 07 C1) — tenant isolation through `vehicles.company_id`. */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);
const MARK = '@fleet-maintenance-due-repo-test.example';
const contextFor = (companyId: string): RequestContext => ({
  userId: '1',
  companyId,
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const ids = companies.map(c => c.id);
  const vehicles = await rawPrisma.vehicles.findMany({
    where: { company_id: { in: ids } },
    select: { id: true },
  });
  await rawPrisma.vehicle_maintenance_schedules.deleteMany({
    where: { vehicle_id: { in: vehicles.map(v => v.id) } },
  });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: ids } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: ids } } });
});

describe.skipIf(!dbAvailable)('FleetMaintenanceDueRepository (real Postgres)', () => {
  it("lists the caller's schedules with their vehicle (name, plate, category, odometer); never another company's; retired / sold vehicles only when asked", async () => {
    const a = await rawPrisma.companies.create({ data: { name: 'Due Co A', email: `a${MARK}` } });
    const b = await rawPrisma.companies.create({ data: { name: 'Due Co B', email: `b${MARK}` } });
    const truck = await rawPrisma.vehicles.create({
      data: {
        company_id: a.id,
        name: `Truck${MARK}`,
        plate: 'T-1',
        vehicle_category: 'Truck',
        odometer_km: 12345.5,
      },
    });
    const retired = await rawPrisma.vehicles.create({
      data: { company_id: a.id, name: `Old${MARK}`, lifecycle_status: 'retired' },
    });
    const other = await rawPrisma.vehicles.create({
      data: { company_id: b.id, name: `Other${MARK}` },
    });
    await rawPrisma.vehicle_maintenance_schedules.create({
      data: {
        vehicle_id: truck.id,
        service_type: 'Oil change',
        interval_days: 90,
        interval_km: 10000,
        last_service_date: new Date('2026-06-01'),
        last_service_odometer_km: 8000,
      },
    });
    await rawPrisma.vehicle_maintenance_schedules.create({
      data: { vehicle_id: retired.id, service_type: 'Brakes', interval_days: 30 },
    });
    await rawPrisma.vehicle_maintenance_schedules.create({
      data: { vehicle_id: other.id, service_type: 'Foreign', interval_days: 30 },
    });
    const repo = new FleetMaintenanceDueRepository(prisma);
    const inA = <T>(fn: () => Promise<T>) => runWithContextAsync(contextFor(a.id.toString()), fn);

    const active = await inA(() => repo.listSchedulesForCompany(false));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      serviceType: 'Oil change',
      intervalDays: 90,
      intervalKm: 10000,
      lastServiceOdometerKm: 8000,
      vehicle: {
        id: truck.id.toString(),
        name: `Truck${MARK}`,
        plate: 'T-1',
        category: 'Truck',
        odometerKm: 12345.5,
      },
    });
    expect(active[0]?.lastServiceDate?.toISOString().slice(0, 10)).toBe('2026-06-01');

    const withInactive = await inA(() => repo.listSchedulesForCompany(true));
    expect(withInactive.map(s => s.serviceType).sort()).toEqual(['Brakes', 'Oil change']);
    expect(
      (
        await runWithContextAsync(contextFor(b.id.toString()), () =>
          repo.listSchedulesForCompany(false)
        )
      ).map(s => s.serviceType)
    ).toEqual(['Foreign']);
    await expect(repo.listSchedulesForCompany(false)).rejects.toThrow('no company in context'); // no request context at all
  });
});
