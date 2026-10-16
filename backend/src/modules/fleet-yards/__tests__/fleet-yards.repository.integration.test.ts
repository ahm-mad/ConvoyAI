import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyTenantScoping } from '../../../platform/db/tenant-scoping.js';
import { applyTimestamps } from '../../../platform/db/timestamps.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetGeofencesRepository } from '../../fleet-geofences/fleet-geofences.repository.js';
import { NoopFleetRealtime } from '../../../platform/realtime/fleet-realtime.js';
import { FleetYardsRepository } from '../fleet-yards.repository.js';
import { FleetYardsService } from '../fleet-yards.service.js';
import { FleetVehiclesDriversRepository } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.repository.js';
import type { CreateVehicleInput } from '../../fleet-vehicles-drivers/fleet-vehicles-drivers.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

/**
 * Real-Postgres integration test (CONVENTIONS.md "Tests"). Covers tenant
 * isolation for `yards` (company-ruled), the `parent`-ruled `yard_layouts`/
 * `yard_slots` reads/writes, the two-level `yard_slot_events` company
 * join (`findSlotById`, matching Laravel's `whereHas('yard', ...)`
 * exactly), and an end-to-end check-in/check-out cycle wired to the real
 * `FleetVehiclesDriversRepository` for the vehicle-length validation.
 */
const rawPrisma = new PrismaClient();
const prisma = applyTimestamps(applyTenantScoping(rawPrisma));
const dbAvailable = await rawPrisma.$queryRaw`SELECT 1`.then(
  () => true,
  () => false
);

const MARK = '@fleet-yards-repo-test.example';

function contextFor(companyId: string, userId = '1'): RequestContext {
  return { userId, companyId, roles: [], perms: [], jti: 'test', exp: Number.MAX_SAFE_INTEGER };
}

async function seedCompany(label: string) {
  return rawPrisma.companies.create({
    data: { name: `Yards Test Co ${label}`, email: `co-${label}${MARK}` },
  });
}

function vehicleInput(lengthM: number | null): CreateVehicleInput {
  return {
    name: `Truck${MARK}`,
    vehicleCategory: null,
    make: null,
    model: null,
    lengthM,
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

afterAll(async () => {
  await rawPrisma.$disconnect();
});

afterEach(async () => {
  const companies = await rawPrisma.companies.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const companyIds = companies.map(c => c.id);
  const yards = await rawPrisma.yards.findMany({
    where: { company_id: { in: companyIds } },
    select: { id: true },
  });
  const yardIds = yards.map(y => y.id);
  const slots = await rawPrisma.yard_slots.findMany({
    where: { yard_id: { in: yardIds } },
    select: { id: true },
  });
  const slotIds = slots.map(s => s.id);

  await rawPrisma.yard_slot_events.deleteMany({ where: { yard_slot_id: { in: slotIds } } });
  await rawPrisma.yard_slots.deleteMany({ where: { yard_id: { in: yardIds } } });
  await rawPrisma.yard_layouts.deleteMany({ where: { yard_id: { in: yardIds } } });
  await rawPrisma.yards.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.vehicles.deleteMany({ where: { company_id: { in: companyIds } } });
  await rawPrisma.companies.deleteMany({ where: { id: { in: companyIds } } });
});

describe.skipIf(!dbAvailable)('FleetYardsRepository (real Postgres)', () => {
  it("createYard/findYardById: a yard is only visible under its own company's context (tenant scoping)", async () => {
    const companyA = await seedCompany('a');
    const companyB = await seedCompany('b');
    const repo = new FleetYardsRepository(prisma);
    const contextA = contextFor(companyA.id.toString());

    const yard = await runWithContextAsync(contextA, () =>
      repo.createYard({
        name: `Main Depot${MARK}`,
        address: '1 Depot Rd',
        latitude: 31.5,
        longitude: 74.3,
        radiusM: null,
      })
    );
    expect(yard.companyId).toBe(companyA.id.toString());

    const foundOwn = await runWithContextAsync(contextA, () => repo.findYardById(yard.id));
    expect(foundOwn?.id).toBe(yard.id);

    const foundOther = await runWithContextAsync(contextFor(companyB.id.toString()), () =>
      repo.findYardById(yard.id)
    );
    expect(foundOther).toBeUndefined();
  });

  it("listYardsForCompany: real slots_count via withCount('slots')", async () => {
    const company = await seedCompany('b2');
    const repo = new FleetYardsRepository(prisma);
    const context = contextFor(company.id.toString());

    const yard = await runWithContextAsync(context, () =>
      repo.createYard({
        name: `Depot${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    await repo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    await repo.createSlot(yard.id, {
      slotNumber: 'A2',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });

    const list = await runWithContextAsync(context, () =>
      repo.listYardsForCompany({ includeInactive: false })
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ slotsCount: 2 });
  });

  it('upsertLayout: real create-then-replace against Postgres', async () => {
    const company = await seedCompany('c');
    const repo = new FleetYardsRepository(prisma);
    const context = contextFor(company.id.toString());
    const yard = await runWithContextAsync(context, () =>
      repo.createYard({
        name: `Depot${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );

    const created = await repo.upsertLayout(yard.id, {
      filePath: 'https://r2.example/a.png',
      widthPx: 800,
      heightPx: 600,
    });
    expect(created.filePath).toBe('https://r2.example/a.png');

    const replaced = await repo.upsertLayout(yard.id, {
      filePath: 'https://r2.example/b.png',
      widthPx: 900,
      heightPx: 700,
    });
    expect(replaced.filePath).toBe('https://r2.example/b.png');

    const found = await repo.findLayoutByYardId(yard.id);
    expect(found).toMatchObject({
      filePath: 'https://r2.example/b.png',
      widthPx: 900,
      heightPx: 700,
    });
  });

  it("findSlotById: company-scoped via the two-level yard_slots -> yards join (Laravel's whereHas('yard', ...) equivalent)", async () => {
    const companyA = await seedCompany('d1');
    const companyB = await seedCompany('d2');
    const repo = new FleetYardsRepository(prisma);
    const contextA = contextFor(companyA.id.toString());
    const yard = await runWithContextAsync(contextA, () =>
      repo.createYard({
        name: `Depot${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    const slot = await repo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });

    const foundOwn = await repo.findSlotById(slot.id, companyA.id.toString());
    expect(foundOwn?.id).toBe(slot.id);

    const foundOther = await repo.findSlotById(slot.id, companyB.id.toString());
    expect(foundOther).toBeUndefined();
  });

  it('11.35-adjacent end-to-end: FleetYardsService.checkIn/checkOut against real Postgres, wired to the real FleetVehiclesDriversRepository for the vehicle-length guard', async () => {
    const company = await seedCompany('e');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const yardsRepo = new FleetYardsRepository(prisma);
    const service = new FleetYardsService(
      yardsRepo,
      vehiclesRepo,
      new FleetGeofencesRepository(prisma),
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const context = contextFor(company.id.toString());

    const yard = await runWithContextAsync(context, () =>
      yardsRepo.createYard({
        name: `Depot${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    const slot = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: 10,
    });

    const tooLong = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput(15))
    );
    await expect(
      runWithContextAsync(context, () => service.checkIn(slot.id, tooLong.id))
    ).rejects.toThrow(/exceeds the slot's maximum length/);

    const fits = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput(5))
    );
    const checkedIn = await runWithContextAsync(context, () => service.checkIn(slot.id, fits.id));
    expect(checkedIn).toMatchObject({ success: true, message: 'Checked in.' });

    // A second check-in on the same slot must be rejected while one is open.
    await expect(
      runWithContextAsync(context, () => service.checkIn(slot.id, fits.id))
    ).rejects.toThrow(/already has a vehicle checked in/);

    const checkedOut = await runWithContextAsync(context, () => service.checkOut(slot.id));
    expect(checkedOut).toMatchObject({ success: true, message: 'Checked out.' });

    // Real row confirmation: exactly one event, closed.
    const rows = await rawPrisma.yard_slot_events.findMany({
      where: { yard_slot_id: BigInt(slot.id) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checked_out_at).not.toBeNull();
    expect(rows[0]?.source).toBe('manual');
  });

  it('getYard: real end-to-end show() — layout + multiple slots, only the currently-checked-in one carries a vehicle brief', async () => {
    const company = await seedCompany('f');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const yardsRepo = new FleetYardsRepository(prisma);
    const service = new FleetYardsService(
      yardsRepo,
      vehiclesRepo,
      new FleetGeofencesRepository(prisma),
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const context = contextFor(company.id.toString());

    const yard = await runWithContextAsync(context, () =>
      yardsRepo.createYard({
        name: `Depot${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    await yardsRepo.upsertLayout(yard.id, {
      filePath: 'https://r2.example/layout.png',
      widthPx: 800,
      heightPx: 600,
    });
    const occupiedSlot = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const emptySlot = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'A2',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput(5))
    );
    await runWithContextAsync(context, () => service.checkIn(occupiedSlot.id, vehicle.id));

    const result = await runWithContextAsync(context, () => service.getYard(yard.id));

    expect(result.data).toMatchObject({ layout: { width_px: 800, height_px: 600 } });
    const slots = (result.data as { slots: Record<string, unknown>[] }).slots;
    const occupied = slots.find(s => s['id'] === occupiedSlot.id);
    const empty = slots.find(s => s['id'] === emptySlot.id);
    expect(occupied).toMatchObject({ current_event: { vehicle: { id: vehicle.id } } });
    expect(empty).toMatchObject({ current_event: null });
  });

  it("recentEventsForVehicle: a vehicle's yard history newest first with slot + yard, open stays have no checkout (KNOWN_ISSUES 11.82)", async () => {
    const company = await seedCompany('hist');
    const context = contextFor(company.id.toString());
    const yardsRepo = new FleetYardsRepository(prisma);
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);

    const yard = await runWithContextAsync(context, () =>
      yardsRepo.createYard({
        name: `Hist Yard${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    const slotA = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const slotB = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'B1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput(null))
    );
    const first = await yardsRepo.createCheckInEvent(slotA.id, vehicle.id);
    await yardsRepo.closeEvent(first.id);
    await rawPrisma.yard_slot_events.update({
      where: { id: BigInt(first.id) },
      data: { checked_in_at: new Date(Date.now() - 3_600_000) },
    });
    const second = await yardsRepo.createCheckInEvent(slotB.id, vehicle.id);

    const history = await yardsRepo.recentEventsForVehicle(vehicle.id, 20);

    expect(history.map(h => h.event.id)).toEqual([second.id, first.id]); // newest check-in first
    expect(history[0]).toMatchObject({
      event: { checkedOutAt: null, source: 'manual' },
      slot: { id: slotB.id, slotNumber: 'B1', yard: { id: yard.id, name: `Hist Yard${MARK}` } },
    });
    expect(history[1]?.event.checkedOutAt).not.toBeNull();
    expect(await yardsRepo.recentEventsForVehicle(vehicle.id, 1)).toHaveLength(1);
  });

  it('findOpenEventForVehicle + service: one open slot per vehicle — a second check-in anywhere 422s naming the first slot/yard; checking out frees the vehicle (D-0151)', async () => {
    const company = await seedCompany('onepervehicle');
    const context = contextFor(company.id.toString());
    const yardsRepo = new FleetYardsRepository(prisma);
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const service = new FleetYardsService(
      yardsRepo,
      vehiclesRepo,
      new FleetGeofencesRepository(prisma),
      new NoopFleetRealtime(),
      NO_ACTORS
    );

    const yard = await runWithContextAsync(context, () =>
      yardsRepo.createYard({
        name: `One Yard${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    const slotA = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const slotB = await yardsRepo.createSlot(yard.id, {
      slotNumber: 'B1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const vehicle = await runWithContextAsync(context, () =>
      vehiclesRepo.createVehicle(vehicleInput(null))
    );

    expect(await yardsRepo.findOpenEventForVehicle(vehicle.id)).toBeUndefined();
    await runWithContextAsync(context, () => service.checkIn(slotA.id, vehicle.id));
    expect(await yardsRepo.findOpenEventForVehicle(vehicle.id)).toMatchObject({
      slotNumber: 'A1',
      yardName: `One Yard${MARK}`,
    });

    await expect(
      runWithContextAsync(context, () => service.checkIn(slotB.id, vehicle.id))
    ).rejects.toThrow(
      `This vehicle is already checked in at slot A1 of One Yard${MARK}. Check it out first.`
    );

    await runWithContextAsync(context, () => service.checkOut(slotA.id));
    expect(await yardsRepo.findOpenEventForVehicle(vehicle.id)).toBeUndefined();
    await expect(
      runWithContextAsync(context, () => service.checkIn(slotB.id, vehicle.id))
    ).resolves.toMatchObject({ success: true });
  });

  it('D-0162 end to end (real Postgres): create with coordinates -> linked geofence; PUT moves/resizes it; gaining coordinates creates one; deactivate guard; lists; slot edit', async () => {
    const company = await seedCompany('step7');
    const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
    const yardsRepo = new FleetYardsRepository(prisma);
    const geofencesRepo = new FleetGeofencesRepository(prisma);
    const service = new FleetYardsService(
      yardsRepo,
      vehiclesRepo,
      geofencesRepo,
      new NoopFleetRealtime(),
      NO_ACTORS
    );
    const context = contextFor(company.id.toString());
    const run = <T>(fn: () => Promise<T>) => runWithContextAsync(context, fn);

    // create WITH coordinates: the linked geofence exists with the default radius; an explicit radius wins on the second yard
    const created = await run(() =>
      service.createYard({
        name: `North${MARK}`,
        address: null,
        latitude: 31.5,
        longitude: 74.3,
        radiusM: null,
      })
    );
    const yardId = String((created.data as Record<string, unknown>)['id']);
    expect(created.data).toMatchObject({ radius_m: 100, is_active: true });
    const linked = await rawPrisma.geofences.findMany({ where: { yard_id: BigInt(yardId) } });
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ radius_m: 100, alert_on: 'both', is_active: true });
    expect(Number(linked[0]?.center_latitude)).toBe(31.5);

    const wide = await run(() =>
      service.createYard({
        name: `Wide${MARK}`,
        address: null,
        latitude: 1,
        longitude: 2,
        radiusM: 400,
      })
    );
    expect(wide.data).toMatchObject({ radius_m: 400 });

    // no coordinates -> no geofence; gaining them later creates it
    const bare = await run(() =>
      service.createYard({
        name: `Bare${MARK}`,
        address: null,
        latitude: null,
        longitude: null,
        radiusM: 500,
      })
    );
    const bareId = String((bare.data as Record<string, unknown>)['id']);
    expect(await rawPrisma.geofences.count({ where: { yard_id: BigInt(bareId) } })).toBe(0);
    const gained = await run(() => service.updateYard(bareId, { latitude: 5, longitude: 6 }));
    expect(gained.data).toMatchObject({ radius_m: 100 });
    expect(await rawPrisma.geofences.count({ where: { yard_id: BigInt(bareId) } })).toBe(1);

    // PUT moves and resizes the linked geofence in the same call
    await run(() => service.updateYard(yardId, { latitude: 32, longitude: 75, radiusM: 250 }));
    const moved = await rawPrisma.geofences.findFirstOrThrow({
      where: { yard_id: BigInt(yardId) },
    });
    expect(moved.radius_m).toBe(250);
    expect([Number(moved.center_latitude), Number(moved.center_longitude)]).toEqual([32, 75]);
    expect((await run(() => yardsRepo.findYardById(yardId)))?.latitude).toBe(32);

    // a yard can have several geofences: `radius_m` reports the EARLIEST
    await rawPrisma.geofences.create({
      data: {
        company_id: company.id,
        yard_id: BigInt(yardId),
        name: 'extra',
        center_latitude: 1,
        center_longitude: 1,
        radius_m: 999,
        alert_on: 'both',
      },
    });
    const map = await run(() => geofencesRepo.linkedGeofencesForYards([yardId, bareId, 'abc']));
    expect(map.get(yardId)?.radiusM).toBe(250);
    expect([...map.keys()].sort()).toEqual([yardId, bareId].sort());

    // deactivate guard: refused while a vehicle is checked in, allowed after check-out; lists hide/show it
    const slot = await yardsRepo.createSlot(yardId, {
      slotNumber: 'A1',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    const vehicle = await run(() =>
      vehiclesRepo.createVehicle({ ...vehicleInput(null), name: `V${MARK}` })
    );
    await run(() => service.checkIn(slot.id, vehicle.id));
    expect(await run(() => yardsRepo.vehicleHasOpenStay(vehicle.id))).toBe(true); // D-0182 (L4): the deactivate-vehicle guard's lookup
    await expect(run(() => service.deactivateYard(yardId))).rejects.toThrow(
      'Check out all vehicles from this yard before deactivating it.'
    );
    await run(() => service.checkOut(slot.id));
    expect(await run(() => yardsRepo.vehicleHasOpenStay(vehicle.id))).toBe(false);
    expect((await run(() => service.deactivateYard(yardId))).data).toMatchObject({
      is_active: false,
    });
    // D-0182 (L5): EVERY geofence linked to the yard (the auto one and the extra) is switched off with it — and only that yard's
    expect(
      (await rawPrisma.geofences.findMany({ where: { yard_id: BigInt(yardId) } })).map(
        g => g.is_active
      )
    ).toEqual([false, false]);
    expect(
      (await rawPrisma.geofences.findFirstOrThrow({ where: { yard_id: BigInt(bareId) } })).is_active
    ).toBe(true);
    const defaults = (await run(() => service.listYards({ includeInactive: false })))
      .data as Record<string, unknown>[];
    expect(defaults.map(y => y['id'])).not.toContain(yardId);
    const all = (await run(() => service.listYards({ includeInactive: true }))).data as Record<
      string,
      unknown
    >[];
    expect(all.map(y => y['id'])).toContain(yardId);
    expect((await run(() => service.getYard(yardId))).data).toMatchObject({
      is_active: false,
      radius_m: 250,
    }); // GET by id still works
    expect((await run(() => service.reactivateYard(yardId))).data).toMatchObject({
      is_active: true,
    });
    expect(
      (await rawPrisma.geofences.findMany({ where: { yard_id: BigInt(yardId) } })).map(
        g => g.is_active
      )
    ).toEqual([true, true]);

    // slot edit (company-checked through the yard)
    const edited = await run(() =>
      service.updateSlot(slot.id, { slotNumber: 'B7', maxLengthM: 12 })
    );
    expect(edited.data).toMatchObject({ slot_number: 'B7', max_length_m: 12 });
    const otherCompany = await seedCompany('step7-other');
    await expect(
      runWithContextAsync(contextFor(otherCompany.id.toString()), () =>
        service.updateSlot(slot.id, { slotNumber: 'X' })
      )
    ).rejects.toThrow('Slot not found.');
  });
});

describe.skipIf(!dbAvailable)(
  'FleetYardsRepository list search/filters/sort/paging (D-0164, B1, real Postgres)',
  () => {
    it('search, has_coordinates, has_layout, slots_count sort, include_inactive and stable paging', async () => {
      const company = await seedCompany('l1');
      const other = await seedCompany('l2');
      const repo = new FleetYardsRepository(prisma);
      const context = contextFor(company.id.toString());
      const make = (
        name: string,
        extra: { address?: string | null; latitude?: number | null; longitude?: number | null } = {}
      ) =>
        runWithContextAsync(context, () =>
          repo.createYard({
            name: `${name}${MARK}`,
            address: extra.address ?? null,
            latitude: extra.latitude ?? null,
            longitude: extra.longitude ?? null,
            radiusM: null,
          })
        );
      const north = await make('North Depot', {
        address: '1 Canal Road, Lahore',
        latitude: 31.5,
        longitude: 74.3,
      });
      const south = await make('South Depot');
      const east = await make('East Yard', {
        address: 'Canal Bank',
        latitude: 31.6,
        longitude: 74.4,
      });
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.createYard({
          name: `North Depot${MARK}`,
          address: null,
          latitude: null,
          longitude: null,
          radiusM: null,
        })
      );
      for (const slot of ['A1', 'A2', 'A3'])
        await repo.createSlot(south.id, {
          slotNumber: slot,
          positionX: null,
          positionY: null,
          maxLengthM: null,
        });
      await repo.createSlot(north.id, {
        slotNumber: 'A1',
        positionX: null,
        positionY: null,
        maxLengthM: null,
      });
      await rawPrisma.yard_layouts.create({
        data: { yard_id: BigInt(north.id), file_path: 'x.png', width_px: 10, height_px: 10 },
      });
      await runWithContextAsync(context, () => repo.setYardActive(east.id, false));

      const names = (items: { yard: { name: string } }[]) =>
        items.map(row => row.yard.name.replace(MARK, ''));
      const list = (q: Partial<import('../fleet-yards.types.js').YardListQuery> = {}) =>
        runWithContextAsync(context, () =>
          repo.listYardsForCompany({ includeInactive: false, ...q })
        );

      expect(names((await list()).items).sort()).toEqual(['North Depot', 'South Depot']);
      expect(names((await list({ includeInactive: true })).items).sort()).toEqual([
        'East Yard',
        'North Depot',
        'South Depot',
      ]);
      expect(names((await list({ search: 'canal' })).items)).toEqual(['North Depot']); // address match; East Yard is inactive
      expect(
        names((await list({ search: 'DEPOT', sortBy: 'name', sortOrder: 'desc' })).items)
      ).toEqual(['South Depot', 'North Depot']);
      expect(names((await list({ hasCoordinates: true })).items)).toEqual(['North Depot']);
      expect(names((await list({ hasCoordinates: false })).items)).toEqual(['South Depot']);
      expect(names((await list({ hasLayout: true })).items)).toEqual(['North Depot']);
      expect(names((await list({ hasLayout: false })).items)).toEqual(['South Depot']);
      expect(names((await list({ sortBy: 'slots_count', sortOrder: 'desc' })).items)).toEqual([
        'South Depot',
        'North Depot',
      ]);

      const page1 = await list({
        sortBy: 'name',
        sortOrder: 'asc',
        window: { page: 1, perPage: 1 },
      });
      const page2 = await list({
        sortBy: 'name',
        sortOrder: 'asc',
        window: { page: 2, perPage: 1 },
      });
      expect(page1.total).toBe(2);
      expect([...names(page1.items), ...names(page2.items)]).toEqual([
        'North Depot',
        'South Depot',
      ]);
    });
  }
);

describe.skipIf(!dbAvailable)(
  'FleetYardsRepository D-0167 refinements: is_active, has_slots / min_slots, sort_by=radius_m (real Postgres)',
  () => {
    it('is_active (wins over include_inactive), has_slots, min_slots, and radius_m sort with yards without a geofence last in both directions', async () => {
      const company = await seedCompany('r3');
      const repo = new FleetYardsRepository(prisma);
      const context = contextFor(company.id.toString());
      const make = (name: string) =>
        runWithContextAsync(context, () =>
          repo.createYard({
            name: `${name}${MARK}`,
            address: null,
            latitude: null,
            longitude: null,
            radiusM: null,
          })
        );
      const wide = await make('Wide');
      const narrow = await make('Narrow');
      await make('Bare');
      const closed = await make('Closed');
      const slots = async (yardId: string, count: number) => {
        for (let i = 1; i <= count; i++)
          await repo.createSlot(yardId, {
            slotNumber: `S${String(i)}`,
            positionX: null,
            positionY: null,
            maxLengthM: null,
          });
      };
      await slots(wide.id, 3);
      await slots(narrow.id, 1);
      await slots(closed.id, 2);
      const fence = (yardId: string, radius: number) =>
        rawPrisma.geofences.create({
          data: {
            company_id: company.id,
            yard_id: BigInt(yardId),
            name: `fence${MARK}`,
            center_latitude: 1,
            center_longitude: 2,
            radius_m: radius,
          },
        });
      await fence(wide.id, 500);
      await fence(wide.id, 50); // a later geofence on the same yard is ignored — the earliest one defines the radius
      await fence(narrow.id, 100);
      await runWithContextAsync(context, () => repo.setYardActive(closed.id, false));

      const names = (items: { yard: { name: string } }[]) =>
        items.map(row => row.yard.name.replace(MARK, ''));
      const list = (q: Partial<import('../fleet-yards.types.js').YardListQuery> = {}) =>
        runWithContextAsync(context, () =>
          repo.listYardsForCompany({ includeInactive: false, ...q })
        );

      // is_active
      expect(names((await list({ isActive: false })).items)).toEqual(['Closed']);
      expect(names((await list({ isActive: false, includeInactive: false })).items)).toEqual([
        'Closed',
      ]); // wins over include_inactive
      expect(
        names(
          (await list({ isActive: true, includeInactive: true, sortBy: 'name', sortOrder: 'asc' }))
            .items
        )
      ).toEqual(['Bare', 'Narrow', 'Wide']);
      // has_slots / min_slots
      expect(names((await list({ hasSlots: false })).items)).toEqual(['Bare']);
      expect(
        names((await list({ hasSlots: true, sortBy: 'name', sortOrder: 'asc' })).items)
      ).toEqual(['Narrow', 'Wide']);
      expect(names((await list({ minSlots: 1, sortBy: 'name', sortOrder: 'asc' })).items)).toEqual([
        'Narrow',
        'Wide',
      ]);
      expect(
        names(
          (await list({ minSlots: 2, includeInactive: true, sortBy: 'name', sortOrder: 'asc' }))
            .items
        )
      ).toEqual(['Closed', 'Wide']);
      expect(names((await list({ minSlots: 3 })).items)).toEqual(['Wide']);
      expect(names((await list({ minSlots: 4 })).items)).toEqual([]);
      expect((await list({ minSlots: 0 })).total).toBe(3);
      // radius_m sort: earliest geofence's radius; no geofence = last, in both directions
      expect(names((await list({ sortBy: 'radius_m', sortOrder: 'asc' })).items)).toEqual([
        'Narrow',
        'Wide',
        'Bare',
      ]);
      expect(names((await list({ sortBy: 'radius_m', sortOrder: 'desc' })).items)).toEqual([
        'Wide',
        'Narrow',
        'Bare',
      ]);
      const p1 = await list({
        sortBy: 'radius_m',
        sortOrder: 'desc',
        window: { page: 1, perPage: 2 },
      });
      const p2 = await list({
        sortBy: 'radius_m',
        sortOrder: 'desc',
        window: { page: 2, perPage: 2 },
      });
      expect(p1.total).toBe(3);
      expect([...names(p1.items), ...names(p2.items)]).toEqual(['Wide', 'Narrow', 'Bare']);
      expect(p1.items[0]?.slotsCount).toBe(3); // the slot count still comes with each row
    });
    it('yardUsage / deleteYard (D-0178, C14): empty slots, layout and linked geofence go with a never-used yard; trip stops, slot history and geofence events block it', async () => {
      const company = await seedCompany('c14y');
      try {
        const repo = new FleetYardsRepository(prisma);
        const vehiclesRepo = new FleetVehiclesDriversRepository(prisma);
        const context = contextFor(company.id.toString());
        const vehicle = await runWithContextAsync(context, () =>
          vehiclesRepo.createVehicle(vehicleInput(10))
        );

        // a never-used yard with an empty slot, a layout row and a linked geofence
        const yard = await rawPrisma.yards.create({
          data: { company_id: company.id, name: `Yard c14${MARK}` },
        });
        const slot = await rawPrisma.yard_slots.create({
          data: { yard_id: yard.id, slot_number: 'A1' },
        });
        await rawPrisma.yard_layouts.create({
          data: { yard_id: yard.id, file_path: 'layouts/x.png', width_px: 10, height_px: 10 },
        });
        const geofence = await rawPrisma.geofences.create({
          data: {
            company_id: company.id,
            yard_id: yard.id,
            name: 'linked',
            center_latitude: 1,
            center_longitude: 1,
            radius_m: 100,
            alert_on: 'both',
          },
        });
        expect(
          await runWithContextAsync(context, () => repo.yardUsage(yard.id.toString()))
        ).toEqual([]);
        expect(
          await runWithContextAsync(contextFor((await seedCompany('c14z')).id.toString()), () =>
            repo.deleteYard(yard.id.toString())
          )
        ).toBe(false); // another company: nothing
        expect(await runWithContextAsync(context, () => repo.deleteYard(yard.id.toString()))).toBe(
          true
        );
        expect(await rawPrisma.yards.count({ where: { id: yard.id } })).toBe(0);
        expect(await rawPrisma.yard_slots.count({ where: { id: slot.id } })).toBe(0);
        expect(await rawPrisma.geofences.count({ where: { id: geofence.id } })).toBe(0);
        expect(await rawPrisma.yard_layouts.count({ where: { yard_id: yard.id } })).toBe(0);

        // a used yard: slot history, geofence events and trip stops each block it
        const used = await rawPrisma.yards.create({
          data: { company_id: company.id, name: `Used c14${MARK}` },
        });
        const usedSlot = await rawPrisma.yard_slots.create({
          data: { yard_id: used.id, slot_number: 'B1' },
        });
        const usedFence = await rawPrisma.geofences.create({
          data: {
            company_id: company.id,
            yard_id: used.id,
            name: 'used',
            center_latitude: 1,
            center_longitude: 1,
            radius_m: 100,
            alert_on: 'both',
          },
        });
        const usage = () => runWithContextAsync(context, () => repo.yardUsage(used.id.toString()));
        await rawPrisma.yard_slot_events.create({
          data: {
            yard_slot_id: usedSlot.id,
            vehicle_id: BigInt(vehicle.id),
            checked_in_at: new Date(),
          },
        });
        expect(await usage()).toEqual(['check-in history']);
        await rawPrisma.geofence_events.create({
          data: {
            geofence_id: usedFence.id,
            vehicle_id: BigInt(vehicle.id),
            event_type: 'enter',
            occurred_at: new Date(),
          },
        });
        expect(await usage()).toEqual(['check-in history', 'geofence events']);
        const driver = await runWithContextAsync(context, () =>
          vehiclesRepo.createDriver({
            firstName: 'D',
            lastName: `Y${MARK}`,
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
          })
        );
        const trip = await rawPrisma.trips.create({
          data: {
            company_id: company.id,
            vehicle_id: BigInt(vehicle.id),
            driver_id: BigInt(driver.id),
            status: 'planned',
          },
        });
        await rawPrisma.trip_planned_yards.create({
          data: { trip_id: trip.id, yard_id: used.id, sequence: 1 },
        });
        expect(await usage()).toEqual(['trip stops', 'check-in history', 'geofence events']);
      } finally {
        await rawPrisma.trips.deleteMany({ where: { company_id: company.id } });
      }
    });
  }
);

describe.skipIf(!dbAvailable)(
  'FleetYardsRepository D-0180 (B8): bbox — yards whose circle overlaps the map box (real Postgres)',
  () => {
    it('a point yard needs its centre inside; a yard with a linked geofence overlaps by its radius; no coordinates never match; other companies never appear', async () => {
      const company = await seedCompany('b8');
      const other = await seedCompany('b8o');
      const repo = new FleetYardsRepository(prisma);
      const context = contextFor(company.id.toString());
      const make = (name: string, latitude: number | null, longitude: number | null) =>
        runWithContextAsync(context, () =>
          repo.createYard({
            name: `${name}${MARK}`,
            address: null,
            latitude,
            longitude,
            radiusM: null,
          })
        );
      await make('Inside', 31.5, 74.3);
      const nearBig = await make('Near Big', 31.62, 74.3); // ~2.2 km above the box, with a 3 km geofence
      await make('Near Point', 31.62, 74.3); // same spot, no geofence — a point outside
      const nearSmall = await make('Near Small', 31.62, 74.3); // 1 km geofence — does not reach
      await make('Far', 24.86, 67.0);
      await make('Bare', null, null);
      await runWithContextAsync(contextFor(other.id.toString()), () =>
        repo.createYard({
          name: `Inside${MARK}`,
          address: null,
          latitude: 31.5,
          longitude: 74.3,
          radiusM: null,
        })
      );
      const fence = (yardId: string, radius: number) =>
        rawPrisma.geofences.create({
          data: {
            company_id: company.id,
            yard_id: BigInt(yardId),
            name: `fence${MARK}`,
            center_latitude: 31.62,
            center_longitude: 74.3,
            radius_m: radius,
          },
        });
      await fence(nearBig.id, 3000);
      await fence(nearBig.id, 10); // a later geofence on the same yard is ignored — the earliest one defines the radius
      await fence(nearSmall.id, 1000);

      const box = { minLng: 74.2, minLat: 31.4, maxLng: 74.5, maxLat: 31.6 };
      const names = (items: { yard: { name: string } }[]) =>
        items.map(row => row.yard.name.replace(MARK, '')).sort();
      const list = (q: Partial<import('../fleet-yards.types.js').YardListQuery> = {}) =>
        runWithContextAsync(context, () =>
          repo.listYardsForCompany({ includeInactive: false, ...q })
        );

      expect(names((await list({ bbox: box })).items)).toEqual(['Inside', 'Near Big']);
      expect((await list({ bbox: box })).total).toBe(2);
      expect(
        names((await list({ bbox: { minLng: 60, minLat: 20, maxLng: 80, maxLat: 40 } })).items)
      ).toEqual(['Far', 'Inside', 'Near Big', 'Near Point', 'Near Small']);
      expect(
        names((await list({ bbox: { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 } })).items)
      ).toEqual([]);
      // combines with the other filters, sort and paging
      expect(names((await list({ bbox: box, search: 'big' })).items)).toEqual(['Near Big']);
      const paged = await list({
        bbox: box,
        sortBy: 'name',
        sortOrder: 'asc',
        window: { page: 2, perPage: 1 },
      });
      expect(paged.total).toBe(2);
      expect(names(paged.items)).toEqual(['Near Big']);
    });
  }
);
