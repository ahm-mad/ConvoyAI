import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetFuelMaintenanceComplianceRepository } from '../fleet-fuel-maintenance-compliance.repository.js';
import { FleetVehiclesDriversRepository } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.repository.js';
import type {
  CreateVehicleInput,
  CreateDriverInput,
} from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers the
 * `parent`-ruled `vehicle_maintenance_schedules`/`vehicle_maintenance_logs`/
 * `fuel_logs` writes (including the 6 `extend_fuel_logs` columns, 11.3) and
 * tenant isolation for the newly `company`-ruled `compliance_documents`.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-fuel-maint-compliance-repo-test.example';

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Fuel/Maint Test Co ${label}`, email: `co-${label}${MARK}` },
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

function vehicleInput(): CreateVehicleInput {
  return {
    name: `Truck${MARK}`,
    vehicleCategory: null,
    make: null,
    model: null,
    lengthM: null,
    widthM: null,
    heightM: null,
    acquisitionDate: null,
    acquisitionCost: null,
    plate: null,
    vin: null,
    year: null,
    fuelType: null,
    tankCapacityLiters: null,
    odometerKm: null,
    ownershipType: null,
    costCentre: null,
    grossWeightKg: null,
    payloadKg: null,
  };
}

function driverInput(): CreateDriverInput {
  return {
    firstName: `Jane${MARK}`,
    lastName: 'Doe',
    email: null,
    phone: null,
    licenseNumber: null,
    licenseClass: null,
    licenseExpiryDate: null,
    hireDate: null,
    employmentStatus: null,
    availabilityStatus: null,
    certifications: null,
    payrollReference: null,
  };
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
  const vehicles = await rawPrisma.vehicles.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map(v => v.id);

  await rawPrisma.fuel_logs.deleteMany({ where: { vehicle_id: { in: vehicleIds } } });
  await rawPrisma.vehicle_maintenance_logs.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.vehicle_maintenance_schedules.deleteMany({
    where: { vehicle_id: { in: vehicleIds } },
  });
  await rawPrisma.compliance_documents.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.drivers.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.users.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetFuelMaintenanceComplianceRepository (real Postgres)', () => {
  it('createMaintenanceSchedule/findMaintenanceScheduleById/updateMaintenanceScheduleLastService: real read-modify-write against Postgres', async () => {
    const company = await seedCompany('a');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput())
    );

    const schedule = await repo.createMaintenanceSchedule(vehicle.id, {
      serviceType: 'Oil change',
      intervalDays: 90,
      intervalKm: null,
      lastServiceDate: null,
      odometerBaselineKm: null,
      odometerBaselineDate: null,
      lastServiceOdometerKm: 1000,
    });
    expect(schedule.vehicleId).toBe(vehicle.id);

    const found = await repo.findMaintenanceScheduleById(schedule.id);
    expect(found?.id).toBe(schedule.id);

    // Falls back to the existing odometer reading when the log didn't record one (Laravel's `?? schedule.last_service_odometer_km`).
    await repo.updateMaintenanceScheduleLastService(schedule.id, new Date('2026-09-10'), null);
    const afterFallback = await repo.findMaintenanceScheduleById(schedule.id);
    expect(afterFallback?.lastServiceDate).toEqual(new Date('2026-09-10'));
    expect(afterFallback?.lastServiceOdometerKm).toBe(1000);

    await repo.updateMaintenanceScheduleLastService(schedule.id, new Date('2026-09-20'), 1500);
    const afterRealReading = await repo.findMaintenanceScheduleById(schedule.id);
    expect(afterRealReading?.lastServiceOdometerKm).toBe(1500);
  });

  it('createMaintenanceLog: real write against Postgres, linked to a schedule', async () => {
    const company = await seedCompany('b');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
    const user = await seedUser(company.id, 'mgr');
    const context = contextFor(company.id.toString(), user.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput())
    );
    const schedule = await repo.createMaintenanceSchedule(vehicle.id, {
      serviceType: 'Oil change',
      intervalDays: 90,
      intervalKm: null,
      lastServiceDate: null,
      odometerBaselineKm: null,
      odometerBaselineDate: null,
      lastServiceOdometerKm: null,
    });

    const log = await repo.createMaintenanceLog(vehicle.id, user.id.toString(), {
      maintenanceScheduleId: schedule.id,
      serviceType: 'Oil change',
      serviceDate: new Date('2026-09-01'),
      odometerKm: 1200,
      cost: 50,
      vendor: 'Jiffy Lube',
      notes: null,
    });

    expect(log).toMatchObject({
      vehicleId: vehicle.id,
      maintenanceScheduleId: schedule.id,
      loggedBy: user.id.toString(),
      cost: 50,
    });
  });

  it('createFuelLog: every extend_fuel_logs column (11.3) round-trips through real Postgres', async () => {
    const company = await seedCompany('c');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
    const user = await seedUser(company.id, 'logger');
    const context = contextFor(company.id.toString(), user.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput())
    );

    const log = await repo.createFuelLog(vehicle.id, user.id.toString(), {
      fillDate: new Date('2026-09-01'),
      volume: 40,
      unit: 'liters',
      cost: 74,
      odometerKm: 1000,
      isFullTank: true,
      vendor: 'Shell',
      stationName: 'Shell Main St',
      unitPrice: 1.85,
      totalCost: 74,
      paymentMethod: 'fleet_card',
      receiptReference: 'RCPT-001',
      tripId: null,
    });

    expect(log).toMatchObject({
      vehicleId: vehicle.id,
      loggedBy: user.id.toString(),
      stationName: 'Shell Main St',
      unitPrice: 1.85,
      totalCost: 74,
      paymentMethod: 'fleet_card',
      receiptReference: 'RCPT-001',
      tripId: null,
    });
  });

  it("compliance_documents: tenant-scoped (company-ruled) — only visible under its own company's context", async () => {
    const companyA = await seedCompany('d1');
    const companyB = await seedCompany('d2');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
    const contextA = contextFor(companyA.id.toString());
    const vehicle = await runWithContextAsync(contextA, () =>
      vehiclesRepo.createVehicle(vehicleInput())
    );

    const document = await runWithContextAsync(contextA, () =>
      repo.createComplianceDocument('vehicle', vehicle.id, {
        documentableType: 'vehicle',
        documentableId: vehicle.id,
        documentType: 'Registration',
        documentNumber: 'REG-1',
        issueDate: null,
        expiryDate: new Date('2026-10-01'),
        notes: null,
      })
    );
    expect(document.companyId).toBe(companyA.id.toString());

    const foundOwn = (
      await runWithContextAsync(contextA, () => repo.listComplianceDocuments('vehicle', vehicle.id))
    ).items;
    expect(foundOwn).toHaveLength(1);

    const foundOther = (
      await runWithContextAsync(contextFor(companyB.id.toString()), () =>
        repo.listComplianceDocuments('vehicle', vehicle.id)
      )
    ).items;
    expect(foundOther).toHaveLength(0);
  });

  it('listExpiringSoonComplianceDocuments: within 30 days OR already expired, excludes a document expiring further out', async () => {
    const company = await seedCompany('e');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const driversRepo = new FleetVehiclesDriversRepository(prisma);
    const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
    const context = contextFor(company.id.toString());
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput())
    );
    const driver = await runWithContextAsync(context, () =>
      driversRepo.createDriver(driverInput())
    );

    const now = new Date();
    const alreadyExpired = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const within30Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const farOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    await runWithContextAsync(context, () =>
      repo.createComplianceDocument('vehicle', vehicle.id, {
        documentableType: 'vehicle',
        documentableId: vehicle.id,
        documentType: 'Insurance',
        documentNumber: null,
        issueDate: null,
        expiryDate: alreadyExpired,
        notes: null,
      })
    );
    await runWithContextAsync(context, () =>
      repo.createComplianceDocument('driver', driver.id, {
        documentableType: 'driver',
        documentableId: driver.id,
        documentType: 'License',
        documentNumber: null,
        issueDate: null,
        expiryDate: within30Days,
        notes: null,
      })
    );
    await runWithContextAsync(context, () =>
      repo.createComplianceDocument('vehicle', vehicle.id, {
        documentableType: 'vehicle',
        documentableId: vehicle.id,
        documentType: 'Inspection',
        documentNumber: null,
        issueDate: null,
        expiryDate: farOut,
        notes: null,
      })
    );

    const expiringSoon = await runWithContextAsync(context, () =>
      repo.listExpiringSoonComplianceDocuments(30)
    );

    expect(expiringSoon).toHaveLength(2);
    expect(expiringSoon.map(d => d.documentType).sort()).toEqual(['Insurance', 'License']);
  });
});

describe.skipIf(!dbAvailable)(
  'FleetFuelMaintenanceComplianceRepository.listComplianceDocuments filters/sort/paging (D-0164, B1, real Postgres)',
  () => {
    it('document_type / expiring_within_days / expired / search filters, sort and paging', async () => {
      const company = await seedCompany('l1');
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
      const ctx = contextFor(company.id.toString());
      const vehicle = await runWithContextAsync(ctx, () =>
        vehiclesRepo.createVehicle(vehicleInput())
      );
      const day = 86_400_000;
      const at = (days: number) => new Date(Date.now() + days * day);
      const add = (
        documentType: string,
        documentNumber: string,
        expiryDate: Date | null,
        notes: string | null = null
      ) =>
        runWithContextAsync(ctx, () =>
          repo.createComplianceDocument('vehicle', vehicle.id, {
            documentableType: 'vehicle',
            documentableId: vehicle.id,
            documentType,
            documentNumber,
            issueDate: null,
            expiryDate,
            notes,
          })
        );
      await add('insurance', 'INS-1', at(10));
      await add('insurance', 'INS-2', at(-10), 'renewal pending');
      await add('fitness', 'FIT-1', at(90));
      await add('permit', 'PER-1', null);

      const list = (
        q: Partial<
          import('../fleet-fuel-maintenance-compliance.types.js').ComplianceDocumentListQuery
        > = {}
      ) => runWithContextAsync(ctx, () => repo.listComplianceDocuments('vehicle', vehicle.id, q));
      const numbers = (items: { documentNumber: string | null }[]) =>
        items.map(d => d.documentNumber);

      expect(numbers((await list()).items)).toEqual(
        expect.arrayContaining(['INS-1', 'INS-2', 'FIT-1', 'PER-1'])
      );
      expect((await list()).total).toBe(4);
      expect(
        numbers(
          (await list({ documentType: 'insurance', sortBy: 'expiry_date', sortOrder: 'asc' })).items
        )
      ).toEqual(['INS-2', 'INS-1']);
      expect(numbers((await list({ expiringWithinDays: 30 })).items)).toEqual(['INS-1']); // already-expired INS-2 is NOT "expiring"
      expect(numbers((await list({ expired: true })).items)).toEqual(['INS-2']);
      // D-0167 (R1): an explicit sort_by puts NULLs last in both directions (Postgres alone would lead with the no-expiry document on DESC)
      expect(
        numbers((await list({ expired: false, sortBy: 'expiry_date', sortOrder: 'desc' })).items)
      ).toEqual(['FIT-1', 'INS-1', 'PER-1']);
      expect(
        numbers((await list({ expired: false, sortBy: 'expiry_date', sortOrder: 'asc' })).items)
      ).toEqual(['INS-1', 'FIT-1', 'PER-1']);
      // the default order (no sort_by) is unchanged: expiry desc as Postgres orders it
      expect(numbers((await list({ expired: false })).items)[0]).toBe('PER-1');
      expect((await list({ expired: false })).total).toBe(3); // a document with no expiry date is not expired
      expect(numbers((await list({ search: 'renewal' })).items)).toEqual(['INS-2']);
      expect(numbers((await list({ search: 'FIT' })).items)).toEqual(['FIT-1']);
      expect(
        numbers((await list({ search: 'insurance', sortBy: 'created_at', sortOrder: 'asc' })).items)
      ).toEqual(['INS-1', 'INS-2']);

      const p1 = await list({
        sortBy: 'created_at',
        sortOrder: 'asc',
        window: { page: 1, perPage: 3 },
      });
      const p2 = await list({
        sortBy: 'created_at',
        sortOrder: 'asc',
        window: { page: 2, perPage: 3 },
      });
      expect(p1.total).toBe(4);
      expect([...numbers(p1.items), ...numbers(p2.items)]).toEqual([
        'INS-1',
        'INS-2',
        'FIT-1',
        'PER-1',
      ]);
    });
  }
);

describe.skipIf(!dbAvailable)(
  'D-0169 (B3) edit / delete of log-type records — real Postgres, service + repository together',
  () => {
    async function setup(label: string) {
      const company = await seedCompany(label);
      const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
      const repo = new FleetFuelMaintenanceComplianceRepository(prisma);
      const { FleetFuelMaintenanceComplianceService } =
        await import('../fleet-fuel-maintenance-compliance.service.js');
      const service = new FleetFuelMaintenanceComplianceService(
        repo,
        vehiclesRepo, // the real company-scoped vehicle lookup, as wired in container.ts
        vehiclesRepo,
        { findTripById: () => Promise.resolve(undefined) },
        NO_ACTORS
      );
      const ctx = contextFor(
        company.id.toString(),
        (await seedUser(company.id, label)).id.toString()
      );
      const vehicle = await runWithContextAsync(ctx, () =>
        vehiclesRepo.createVehicle(vehicleInput())
      );
      return { company, vehiclesRepo, repo, service, ctx, vehicle };
    }
    const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

    it('deleting / editing / re-linking a maintenance log recomputes the schedule from its newest remaining log (Q8 a)', async () => {
      const { repo, service, ctx, vehicle } = await setup('b3a');
      const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx, fn);
      const schedule = await run(() =>
        repo.createMaintenanceSchedule(vehicle.id, {
          serviceType: 'Oil',
          intervalDays: 90,
          intervalKm: null,
          lastServiceDate: day('2026-01-01'),
          odometerBaselineKm: null,
          odometerBaselineDate: null,
          lastServiceOdometerKm: 1000,
        })
      );
      const other = await run(() =>
        repo.createMaintenanceSchedule(vehicle.id, {
          serviceType: 'Brakes',
          intervalDays: 30,
          intervalKm: null,
          lastServiceDate: day('2026-02-02'),
          odometerBaselineKm: null,
          odometerBaselineDate: null,
          lastServiceOdometerKm: 2000,
        })
      );
      const log = (date: string, odo: number | null, scheduleId: string | null) =>
        run(() =>
          service.storeMaintenanceLog(vehicle.id, {
            maintenanceScheduleId: scheduleId,
            serviceType: 'Oil',
            serviceDate: day(date),
            odometerKm: odo,
            cost: null,
            vendor: null,
            notes: null,
          })
        );
      const l1 = (await log('2026-03-01', 5000, schedule.id)).data as { id: string };
      const l2 = (await log('2026-06-01', 9000, schedule.id)).data as { id: string };
      const l3 = (await log('2026-09-01', null, schedule.id)).data as { id: string }; // newest, but no odometer reading
      const current = async (id: string) => {
        const found = await run(() => repo.findMaintenanceScheduleById(id));
        if (!found) throw new Error(`schedule ${id} not found`);
        return found;
      };

      // creation behaviour is unchanged: the schedule follows the last log written (odometer falls back to the previous value)
      expect(day('2026-09-01').getTime()).toBe(
        (await current(schedule.id)).lastServiceDate?.getTime()
      );
      expect((await current(schedule.id)).lastServiceOdometerKm).toBe(9000);

      // delete the newest log -> newest remaining (June, 9000 km)
      await run(() => service.deleteMaintenanceLog(l3.id));
      expect((await current(schedule.id)).lastServiceDate?.getTime()).toBe(
        day('2026-06-01').getTime()
      );
      expect((await current(schedule.id)).lastServiceOdometerKm).toBe(9000);

      // move the June log back to February: March is now the newest remaining log
      await run(() =>
        service.updateMaintenanceLog(l2.id, { serviceDate: day('2026-02-01'), odometerKm: 8000 })
      );
      expect((await current(schedule.id)).lastServiceDate?.getTime()).toBe(
        day('2026-03-01').getTime()
      );
      expect((await current(schedule.id)).lastServiceOdometerKm).toBe(5000); // newest log WITH an odometer reading is March's

      // re-link March's log to the other schedule: the old schedule falls back to the (Feb) log, the new one adopts March
      await run(() => service.updateMaintenanceLog(l1.id, { maintenanceScheduleId: other.id }));
      expect((await current(schedule.id)).lastServiceDate?.getTime()).toBe(
        day('2026-02-01').getTime()
      );
      expect((await current(schedule.id)).lastServiceOdometerKm).toBe(8000);
      expect((await current(other.id)).lastServiceDate?.getTime()).toBe(
        day('2026-03-01').getTime()
      );
      expect((await current(other.id)).lastServiceOdometerKm).toBe(5000);

      // delete the only log of a schedule -> it keeps its current values (the baseline can't be recovered)
      await run(() => service.deleteMaintenanceLog(l1.id));
      expect((await current(other.id)).lastServiceDate?.getTime()).toBe(
        day('2026-03-01').getTime()
      );
    });

    it('deleting a schedule keeps its logs (unlinked) — the FK would otherwise refuse', async () => {
      const { repo, service, ctx, vehicle } = await setup('b3b');
      const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx, fn);
      const schedule = await run(() =>
        repo.createMaintenanceSchedule(vehicle.id, {
          serviceType: 'Oil',
          intervalDays: 90,
          intervalKm: null,
          lastServiceDate: null,
          odometerBaselineKm: null,
          odometerBaselineDate: null,
          lastServiceOdometerKm: null,
        })
      );
      const log = (
        await run(() =>
          service.storeMaintenanceLog(vehicle.id, {
            maintenanceScheduleId: schedule.id,
            serviceType: 'Oil',
            serviceDate: day('2026-05-05'),
            odometerKm: null,
            cost: null,
            vendor: null,
            notes: null,
          })
        )
      ).data as { id: string };

      await run(() => service.deleteMaintenanceSchedule(schedule.id));

      expect(await run(() => repo.findMaintenanceScheduleById(schedule.id))).toBeUndefined();
      expect(await run(() => repo.findMaintenanceLogById(log.id))).toMatchObject({
        maintenanceScheduleId: null,
      });
    });

    it("fuel log and compliance document update / delete; another company's records are plain 404s", async () => {
      const mine = await setup('b3c');
      const theirs = await setup('b3d');
      const runMine = <T>(fn: () => Promise<T>) => runWithContextAsync(mine.ctx, fn);
      const runTheirs = <T>(fn: () => Promise<T>) => runWithContextAsync(theirs.ctx, fn);

      const fuel = (
        await runMine(() =>
          mine.service.storeFuelLog(mine.vehicle.id, {
            fillDate: day('2026-04-04'),
            volume: 40,
            unit: 'liters',
            cost: 50,
            odometerKm: 100,
            isFullTank: true,
            vendor: null,
            stationName: null,
            unitPrice: null,
            totalCost: null,
            paymentMethod: null,
            receiptReference: null,
            tripId: null,
          })
        )
      ).data as { id: string };
      const updated = await runMine(() =>
        mine.service.updateFuelLog(fuel.id, { volume: 45.5, vendor: 'Shell', cost: null })
      );
      expect(updated.data).toMatchObject({
        volume: 45.5,
        vendor: 'Shell',
        cost: null,
        odometer_km: 100,
      }); // only the sent fields changed
      await expect(
        runTheirs(() => theirs.service.updateFuelLog(fuel.id, { volume: 1 }))
      ).rejects.toThrow('Fuel log not found.');
      await expect(runTheirs(() => theirs.service.deleteFuelLog(fuel.id))).rejects.toThrow(
        'Fuel log not found.'
      );
      await runMine(() => mine.service.deleteFuelLog(fuel.id));
      expect(await runMine(() => mine.repo.findFuelLogById(fuel.id))).toBeUndefined();

      const doc = (
        await runMine(() =>
          mine.service.storeComplianceDocument({
            documentableType: 'vehicle',
            documentableId: mine.vehicle.id,
            documentType: 'insurance',
            documentNumber: 'X-1',
            issueDate: null,
            expiryDate: day('2026-12-31'),
            notes: 'n',
          })
        )
      ).data as { id: string };
      const patched = await runMine(() =>
        mine.service.updateComplianceDocument(doc.id, { documentNumber: 'X-2', expiryDate: null })
      );
      expect(patched.data).toMatchObject({
        document_number: 'X-2',
        expiry_date: null,
        document_type: 'insurance',
        notes: 'n',
      });
      await expect(
        runTheirs(() => theirs.service.updateComplianceDocument(doc.id, {}))
      ).rejects.toThrow('Document not found.');
      await expect(
        runTheirs(() => theirs.service.deleteComplianceDocument(doc.id))
      ).rejects.toThrow('Document not found.');
      await runMine(() => mine.service.deleteComplianceDocument(doc.id));
      expect(await runMine(() => mine.repo.findComplianceDocumentById(doc.id))).toBeUndefined();
    });
  }
);
