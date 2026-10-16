import { describe, expect, it, vi } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/app-error.js';
import { FleetYardsService } from '../fleet-yards.service.js';
import { RecordingFleetRealtime } from '../../../platform/realtime/__tests__/recording-fleet-realtime.js';
import { fakeFleetYardsRepository, fakeVehiclesLookup, fakeYardsGeofencesLookup } from './fakes.js';
import type { Yard, YardSlot, YardSlotEvent } from '../fleet-yards.types.js';

/** D-0172 (B6): a users directory that knows nobody — these tests do not exercise the "who" names. */
const NO_ACTORS = {
  findContactsByIds: () =>
    Promise.resolve(new Map<string, { id: string; firstName: string; lastName: string }>()),
};

vi.mock('../../../platform/storage/r2-storage.js', () => ({
  uploadObject: vi.fn().mockResolvedValue({
    key: 'yard-layouts/new.png',
    url: 'https://images.example.com/yard-layouts/new.png',
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  keyFromUrl: (url: string) =>
    url.startsWith('https://images.example.com/')
      ? url.slice('https://images.example.com/'.length)
      : undefined,
}));

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function ctx(companyId = '1'): RequestContext {
  return { userId: '1', companyId, roles: [], perms: [], jti: 't', exp: Number.MAX_SAFE_INTEGER };
}

function makeYard(overrides: Partial<Yard> = {}): Yard {
  return {
    id: '1',
    companyId: '1',
    name: 'Main Depot',
    address: null,
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeSlot(overrides: Partial<YardSlot> = {}): YardSlot {
  return {
    id: '1',
    yardId: '1',
    slotNumber: 'A1',
    positionX: null,
    positionY: null,
    maxLengthM: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<YardSlotEvent> = {}): YardSlotEvent {
  return {
    id: '1',
    yardSlotId: '1',
    vehicleId: '1',
    checkedInAt: new Date('2026-01-01T00:00:00Z'),
    checkedOutAt: null,
    source: 'manual',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function buildService(
  overrides: {
    repo?: Partial<ReturnType<typeof fakeFleetYardsRepository>>;
    vehiclesLookup?: Parameters<typeof fakeVehiclesLookup>[0];
  } = {}
) {
  const repo = fakeFleetYardsRepository(overrides.repo ?? {});
  const vehiclesLookup = fakeVehiclesLookup(overrides.vehiclesLookup ?? {});
  return new FleetYardsService(
    repo,
    vehiclesLookup,
    fakeYardsGeofencesLookup(),
    new RecordingFleetRealtime(),
    NO_ACTORS
  );
}

describe('FleetYardsService.listYards / createYard (YardController::index/store equivalents)', () => {
  it("includes slots_count from withCount('slots')", async () => {
    const service = buildService({
      repo: {
        listYardsForCompany: () =>
          Promise.resolve({ items: [{ yard: makeYard(), slotsCount: 3 }], total: 1 }),
      },
    });
    const result = await service.listYards({ includeInactive: false });
    expect(result.data).toEqual([expect.objectContaining({ id: '1', slots_count: 3 })]);
  });

  it('creates a yard', async () => {
    let created: unknown;
    const service = buildService({
      repo: {
        createYard: input => {
          created = input;
          return Promise.resolve(makeYard({ name: 'New Yard' }));
        },
      },
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.createYard({
        name: 'New Yard',
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      })
    );
    expect(created).toMatchObject({ name: 'New Yard' });
    expect(result).toMatchObject({ success: true, data: { name: 'New Yard' } });
  });
});

describe('FleetYardsService.getYard (YardController::show equivalent — layout + slots.currentEvent.vehicle)', () => {
  it("404s when the yard doesn't exist (or belongs to another company)", async () => {
    const service = buildService({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(service.getYard('999')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("includes layout, and each slot's current occupant with a vehicle brief", async () => {
    const service = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard()),
        findLayoutByYardId: () =>
          Promise.resolve({
            id: '5',
            yardId: '1',
            filePath: 'https://r2.example/yard-layouts/x.png',
            widthPx: 800,
            heightPx: 600,
            createdAt: null,
            updatedAt: null,
          }),
        listSlotsForYard: () => Promise.resolve([makeSlot({ id: '1' }), makeSlot({ id: '2' })]),
        currentEventsForSlots: () =>
          Promise.resolve(
            new Map([['1', makeEvent({ id: '10', yardSlotId: '1', vehicleId: '7' })]])
          ),
      },
      vehiclesLookup: {
        findVehicleById: id =>
          Promise.resolve(
            id === '7'
              ? {
                  id: '7',
                  name: 'Truck 7',
                  vehicleCategory: null,
                  make: null,
                  model: null,
                  lengthM: null,
                }
              : undefined
          ),
      },
    });

    const result = await service.getYard('1');

    expect(result.data).toMatchObject({
      id: '1',
      layout: { url: 'https://r2.example/yard-layouts/x.png', width_px: 800, height_px: 600 },
    });
    const slots = (result.data as { slots: Record<string, unknown>[] }).slots;
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({
      id: '1',
      current_event: { vehicle_id: '7', vehicle: { id: '7', name: 'Truck 7' } },
    });
    expect(slots[1]).toMatchObject({ id: '2', current_event: null });
  });
});

describe('FleetYardsService.createSlot (YardController::storeSlot equivalent)', () => {
  it("404s when the yard doesn't exist", async () => {
    const service = buildService({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(
      service.createSlot('999', {
        slotNumber: 'A1',
        positionX: null,
        positionY: null,
        maxLengthM: null,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates a slot on the yard', async () => {
    let created: unknown;
    const service = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard()),
        createSlot: (yardId, input) => {
          created = { yardId, input };
          return Promise.resolve(
            makeSlot({ slotNumber: input.slotNumber, maxLengthM: input.maxLengthM })
          );
        },
      },
    });
    const result = await service.createSlot('1', {
      slotNumber: 'B2',
      positionX: 0.5,
      positionY: 0.5,
      maxLengthM: 12,
    });
    expect(created).toMatchObject({ yardId: '1', input: { slotNumber: 'B2', maxLengthM: 12 } });
    expect(result).toMatchObject({ success: true, data: { slot_number: 'B2', max_length_m: 12 } });
  });
});

describe('FleetYardsService.uploadLayout (replace-on-reupload, D-0044 R2 pattern)', () => {
  it("404s when the yard doesn't exist", async () => {
    const service = buildService({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(
      service.uploadLayout('999', {
        buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
        contentType: 'image/png',
        extension: 'png',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("422s for bytes that aren't a real image (real-content check, not just the MIME header)", async () => {
    const service = buildService({ repo: { findYardById: () => Promise.resolve(makeYard()) } });
    await expect(
      service.uploadLayout('1', {
        buffer: Buffer.from('not an image'),
        contentType: 'image/png',
        extension: 'png',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('201 on first upload, 200 on replace', async () => {
    const serviceFirst = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard()),
        findLayoutByYardId: () => Promise.resolve(undefined),
        upsertLayout: (yardId, data) =>
          Promise.resolve({
            id: '1',
            yardId,
            filePath: data.filePath,
            widthPx: data.widthPx,
            heightPx: data.heightPx,
            createdAt: null,
            updatedAt: null,
          }),
      },
    });
    const first = await serviceFirst.uploadLayout('1', {
      buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
      contentType: 'image/png',
      extension: 'png',
    });
    expect(first.status).toBe(201);

    const serviceReplace = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard()),
        findLayoutByYardId: () =>
          Promise.resolve({
            id: '1',
            yardId: '1',
            filePath: 'https://images.example.com/yard-layouts/old.png',
            widthPx: 1,
            heightPx: 1,
            createdAt: null,
            updatedAt: null,
          }),
        upsertLayout: (yardId, data) =>
          Promise.resolve({
            id: '1',
            yardId,
            filePath: data.filePath,
            widthPx: data.widthPx,
            heightPx: data.heightPx,
            createdAt: null,
            updatedAt: null,
          }),
      },
    });
    const replaced = await serviceReplace.uploadLayout('1', {
      buffer: Buffer.from(VALID_PNG_BASE64, 'base64'),
      contentType: 'image/png',
      extension: 'png',
    });
    expect(replaced.status).toBe(200);
  });
});

describe('FleetYardsService.checkIn / checkOut ("the slip concept")', () => {
  it("checkIn: 404s when the slot doesn't exist (or belongs to another company)", async () => {
    const service = buildService({ repo: { findSlotById: () => Promise.resolve(undefined) } });
    await expect(
      runWithContextAsync(ctx(), () => service.checkIn('999', '1'))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('checkIn: 422s when the slot already has an open stay', async () => {
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot()),
        findOpenEventForSlot: () => Promise.resolve(makeEvent()),
      },
    });
    await expect(
      runWithContextAsync(ctx(), () => service.checkIn('1', '1'))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('D-0151: checkIn 422s when the vehicle is already checked in at another slot (one open slot per vehicle), naming the slot and yard', async () => {
    let created = false;
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot()),
        findOpenEventForSlot: () => Promise.resolve(undefined),
        findOpenEventForVehicle: () =>
          Promise.resolve({
            event: makeEvent({ vehicleId: '7' }),
            slotNumber: 'A1',
            yardName: 'Main Yard',
          }),
        createCheckInEvent: () => {
          created = true;
          return Promise.resolve(makeEvent());
        },
      },
    });

    const error = await runWithContextAsync(ctx(), () => service.checkIn('1', '7')).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(
      'This vehicle is already checked in at slot A1 of Main Yard. Check it out first.'
    );
    expect(created).toBe(false);
  });

  it("checkIn: 422s when the vehicle's real length exceeds the slot's max_length_m", async () => {
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot({ maxLengthM: 10 })),
        findOpenEventForSlot: () => Promise.resolve(undefined),
        findOpenEventForVehicle: () => Promise.resolve(undefined),
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({
            id: '7',
            name: 'Big Truck',
            vehicleCategory: null,
            make: null,
            model: null,
            lengthM: 15,
          }),
      },
    });
    await expect(
      runWithContextAsync(ctx(), () => service.checkIn('1', '7'))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('checkIn: succeeds when the vehicle fits (or has no length recorded)', async () => {
    let checkedIn: unknown;
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot({ maxLengthM: 10 })),
        findOpenEventForSlot: () => Promise.resolve(undefined),
        findOpenEventForVehicle: () => Promise.resolve(undefined),
        createCheckInEvent: (slotId, vehicleId) => {
          checkedIn = { slotId, vehicleId };
          return Promise.resolve(makeEvent({ vehicleId }));
        },
      },
      vehiclesLookup: {
        findVehicleById: () =>
          Promise.resolve({
            id: '7',
            name: 'Small Van',
            vehicleCategory: null,
            make: null,
            model: null,
            lengthM: 5,
          }),
      },
    });
    const result = await runWithContextAsync(ctx(), () => service.checkIn('1', '7'));
    expect(checkedIn).toEqual({ slotId: '1', vehicleId: '7' });
    expect(result).toMatchObject({ success: true, message: 'Checked in.' });
  });

  it('checkOut: 422s when nothing is checked in', async () => {
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot()),
        findOpenEventForSlot: () => Promise.resolve(undefined),
      },
    });
    await expect(runWithContextAsync(ctx(), () => service.checkOut('1'))).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('checkOut: closes the open stay', async () => {
    let closedId: string | undefined;
    const service = buildService({
      repo: {
        findSlotById: () => Promise.resolve(makeSlot()),
        findOpenEventForSlot: () => Promise.resolve(makeEvent({ id: '10' })),
        closeEvent: id => {
          closedId = id;
          return Promise.resolve(makeEvent({ id: '10', checkedOutAt: new Date() }));
        },
      },
    });
    const result = await runWithContextAsync(ctx(), () => service.checkOut('1'));
    expect(closedId).toBe('10');
    expect(result).toMatchObject({ success: true, message: 'Checked out.' });
  });
});

// ===========================================================================
// D-0162 — yard radius / linked geofence / edit / deactivate / slot edit
// ===========================================================================

describe('FleetYardsService — step 7 (D-0162)', () => {
  function build(
    over: {
      repo?: Parameters<typeof fakeFleetYardsRepository>[0];
      geofences?: Parameters<typeof fakeYardsGeofencesLookup>[0];
    } = {}
  ) {
    const geofences = fakeYardsGeofencesLookup(over.geofences);
    const realtime = new RecordingFleetRealtime();
    const service = new FleetYardsService(
      fakeFleetYardsRepository(over.repo ?? {}),
      fakeVehiclesLookup(),
      geofences,
      realtime,
      NO_ACTORS
    );
    return { service, geofences, realtime };
  }

  it('createYard with coordinates auto-creates the LINKED geofence (default 100 m) and reports it; an explicit radius_m wins', async () => {
    const yard = makeYard({ id: '5', name: 'North Depot', latitude: 31.5, longitude: 74.3 });
    const { service, geofences } = build({ repo: { createYard: () => Promise.resolve(yard) } });

    const result = await runWithContextAsync(ctx(), () =>
      service.createYard({
        name: 'North Depot',
        address: null,
        latitude: 31.5,
        longitude: 74.3,
        radiusM: null,
      })
    );
    expect(geofences.created).toEqual([
      { yardId: '5', name: 'North Depot', latitude: 31.5, longitude: 74.3, radiusM: 100 },
    ]);
    expect(result.data).toMatchObject({
      radius_m: 100,
      is_active: true,
      geofence: { id: '900', radius_m: 100 },
    });

    const explicit = build({ repo: { createYard: () => Promise.resolve(yard) } });
    const r2 = await runWithContextAsync(ctx(), () =>
      explicit.service.createYard({
        name: 'North Depot',
        address: null,
        latitude: 31.5,
        longitude: 74.3,
        radiusM: 250,
      })
    );
    expect(explicit.geofences.created[0]?.radiusM).toBe(250);
    expect(r2.data).toMatchObject({ radius_m: 250, geofence: { radius_m: 250 } });
  });

  it('createYard WITHOUT coordinates creates no geofence (radius_m is ignored, geofence null)', async () => {
    const { service, geofences } = build({
      repo: { createYard: () => Promise.resolve(makeYard()) },
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.createYard({
        name: 'No coords',
        address: null,
        latitude: null,
        longitude: null,
        radiusM: 500,
      })
    );
    expect(geofences.created).toEqual([]);
    expect(result.data).toMatchObject({ radius_m: null, geofence: null });
  });

  it("listYards: radius_m comes from each yard's linked geofence (null when none) and include_inactive is passed through", async () => {
    let includeInactive: boolean | undefined;
    const { service } = build({
      repo: {
        listYardsForCompany: query => {
          includeInactive = query.includeInactive;
          return Promise.resolve({
            items: [
              { yard: makeYard({ id: '1' }), slotsCount: 2 },
              { yard: makeYard({ id: '2', isActive: false }), slotsCount: 0 },
            ],
            total: 2,
          });
        },
      },
      geofences: {
        linkedGeofencesForYards: () =>
          Promise.resolve(new Map([['1', { id: '10', radiusM: 150 }]])),
      },
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.listYards({ includeInactive: true })
    );

    expect(includeInactive).toBe(true);
    expect(
      (result.data as Record<string, unknown>[]).map(y => [y['id'], y['radius_m'], y['is_active']])
    ).toEqual([
      ['1', 150, true],
      ['2', null, false],
    ]);
  });

  it('updateYard: moving/resizing the yard moves/resizes its linked geofence in the same call', async () => {
    const yard = makeYard({ id: '1', latitude: 31.6, longitude: 74.4 });
    const { service, geofences } = build({
      repo: { findYardById: () => Promise.resolve(yard), updateYard: () => Promise.resolve(yard) },
      geofences: {
        linkedGeofencesForYards: () =>
          Promise.resolve(new Map([['1', { id: '10', radiusM: 100 }]])),
      },
    });

    const result = await runWithContextAsync(ctx(), () =>
      service.updateYard('1', { latitude: 31.6, longitude: 74.4, radiusM: 300 })
    );

    expect(geofences.updated).toEqual([
      { id: '10', latitude: 31.6, longitude: 74.4, radiusM: 300 },
    ]);
    expect(geofences.created).toEqual([]);
    expect(result).toMatchObject({ message: 'Yard updated.', data: { radius_m: 300 } });
  });

  it('updateYard: a rename alone touches no geofence; a radius alone resizes without moving', async () => {
    const yard = makeYard({ id: '1', latitude: 31.6, longitude: 74.4 });
    const build1 = () =>
      build({
        repo: {
          findYardById: () => Promise.resolve(yard),
          updateYard: () => Promise.resolve(yard),
        },
        geofences: {
          linkedGeofencesForYards: () =>
            Promise.resolve(new Map([['1', { id: '10', radiusM: 100 }]])),
        },
      });
    const rename = build1();
    await runWithContextAsync(ctx(), () => rename.service.updateYard('1', { name: 'Renamed' }));
    expect(rename.geofences.updated).toEqual([]);

    const resize = build1();
    await runWithContextAsync(ctx(), () => resize.service.updateYard('1', { radiusM: 50 }));
    expect(resize.geofences.updated).toEqual([{ id: '10', radiusM: 50 }]);
  });

  it('updateYard: a yard that GAINS coordinates and has no geofence yet gets one (default 100 m or the given radius)', async () => {
    const yard = makeYard({ id: '1', name: 'Late coords', latitude: 31.6, longitude: 74.4 });
    const { service, geofences } = build({
      repo: { findYardById: () => Promise.resolve(yard), updateYard: () => Promise.resolve(yard) },
    });
    const result = await runWithContextAsync(ctx(), () =>
      service.updateYard('1', { latitude: 31.6, longitude: 74.4 })
    );
    expect(geofences.created).toEqual([
      { yardId: '1', name: 'Late coords', latitude: 31.6, longitude: 74.4, radiusM: 100 },
    ]);
    expect(result.data).toMatchObject({ radius_m: 100 });
  });

  it('updateYard: 404 for an unknown yard', async () => {
    const { service } = build({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(
      runWithContextAsync(ctx(), () => service.updateYard('9', { name: 'x' }))
    ).rejects.toThrow(NotFoundError);
  });

  it('deactivateYard: refused while vehicles are checked in (fixed message); otherwise is_active=false; reactivate → true', async () => {
    const yard = makeYard({ id: '1' });
    const busy = build({
      repo: {
        findYardById: () => Promise.resolve(yard),
        countOpenStaysInYard: () => Promise.resolve(2),
      },
    });
    await expect(
      runWithContextAsync(ctx(), () => busy.service.deactivateYard('1'))
    ).rejects.toThrow('Check out all vehicles from this yard before deactivating it.');

    const free = build({
      repo: {
        findYardById: () => Promise.resolve(yard),
        countOpenStaysInYard: () => Promise.resolve(0),
        setYardActive: (_id, isActive) => Promise.resolve(makeYard({ id: '1', isActive })),
      },
    });
    expect(await runWithContextAsync(ctx(), () => free.service.deactivateYard('1'))).toMatchObject({
      message: 'Yard deactivated.',
      data: { is_active: false },
    });
    expect(await runWithContextAsync(ctx(), () => free.service.reactivateYard('1'))).toMatchObject({
      message: 'Yard reactivated.',
      data: { is_active: true },
    });
    const unknown = build({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(
      runWithContextAsync(ctx(), () => unknown.service.deactivateYard('9'))
    ).rejects.toThrow('Yard not found.');
  });

  it("updateSlot: only for a slot of the caller's company (404 otherwise), returns the slot", async () => {
    let received: unknown;
    const { service } = build({
      repo: {
        findSlotById: (_slotId, companyId) =>
          Promise.resolve(companyId === '1' ? makeSlot({ id: '3' }) : undefined),
        updateSlot: (_id, input) => {
          received = input;
          return Promise.resolve(makeSlot({ id: '3', slotNumber: input.slotNumber ?? 'A1' }));
        },
      },
    });
    const result = await runWithContextAsync(ctx('1'), () =>
      service.updateSlot('3', { slotNumber: 'B2', maxLengthM: null })
    );
    expect(received).toEqual({ slotNumber: 'B2', maxLengthM: null });
    expect(result).toMatchObject({
      message: 'Slot updated.',
      data: { id: '3', slot_number: 'B2' },
    });
    await expect(runWithContextAsync(ctx('2'), () => service.updateSlot('3', {}))).rejects.toThrow(
      'Slot not found.'
    );
  });
});

describe('FleetYardsService publishes fleet:changed (D-0163)', () => {
  const changes = (r: RecordingFleetRealtime) =>
    r.fleetChanges.map(c => `${c.payload.entity}:${c.payload.id}:${c.payload.action}`);

  it('create yard with coordinates announces the yard AND its auto-created geofence; update announces both; deactivate/reactivate the yard', async () => {
    const yard = makeYard({ id: '5', latitude: 31.5, longitude: 74.3 });
    const realtime = new RecordingFleetRealtime();
    const service = new FleetYardsService(
      fakeFleetYardsRepository({
        createYard: () => Promise.resolve(yard),
        findYardById: () => Promise.resolve(yard),
        updateYard: () => Promise.resolve(yard),
        countOpenStaysInYard: () => Promise.resolve(0),
        setYardActive: (_id, isActive) => Promise.resolve(makeYard({ id: '5', isActive })),
      }),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup({
        linkedGeofencesForYards: () =>
          Promise.resolve(new Map([['5', { id: '900', radiusM: 100 }]])),
      }),
      realtime,
      NO_ACTORS
    );

    await runWithContextAsync(ctx(), async () => {
      await service.createYard({
        name: 'N',
        address: null,
        latitude: 31.5,
        longitude: 74.3,
        radiusM: null,
      });
      await service.updateYard('5', { name: 'N2' });
      await service.deactivateYard('5');
      await service.reactivateYard('5');
    });

    expect(changes(realtime)).toEqual([
      'yard:5:created',
      'geofence:900:created',
      'yard:5:updated',
      'geofence:900:updated',
      'yard:5:deactivated',
      'yard:5:reactivated',
    ]);
  });

  it('D-0182 (L3): checkIn / checkOut announce `yard_slot` `checked_in` / `checked_out` (id = the slot); a refused check-in announces nothing', async () => {
    const realtime = new RecordingFleetRealtime();
    const service = new FleetYardsService(
      fakeFleetYardsRepository({
        findSlotById: () => Promise.resolve(makeSlot({ id: '3' })),
        findOpenEventForSlot: (slotId: string) =>
          Promise.resolve(
            slotId === 'occupied'
              ? makeEvent({ id: '9' })
              : slotId === '3-open'
                ? makeEvent({ id: '10' })
                : undefined
          ),
        findOpenEventForVehicle: () => Promise.resolve(undefined),
        createCheckInEvent: (_slotId: string, vehicleId: string) =>
          Promise.resolve(makeEvent({ vehicleId })),
        closeEvent: () => Promise.resolve(makeEvent({ id: '10', checkedOutAt: new Date() })),
      }),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup(),
      realtime,
      NO_ACTORS
    );
    await runWithContextAsync(ctx(), async () => {
      await service.checkIn('3', '7');
      await expect(service.checkIn('occupied', '7')).rejects.toThrow(
        'This slot already has a vehicle checked in.'
      );
      await service.checkOut('3-open');
    });
    expect(changes(realtime)).toEqual(['yard_slot:3:checked_in', 'yard_slot:3-open:checked_out']);
  });

  it('D-0182 (L5): deactivating / reactivating a yard switches its linked geofence(s) and announces each as `geofence` `updated`; nothing flipped = nothing announced', async () => {
    const realtime = new RecordingFleetRealtime();
    const calls: string[] = [];
    const yard = makeYard({ id: '5' });
    const service = new FleetYardsService(
      fakeFleetYardsRepository({
        findYardById: () => Promise.resolve(yard),
        countOpenStaysInYard: () => Promise.resolve(0),
        setYardActive: (_id, isActive) => Promise.resolve(makeYard({ id: '5', isActive })),
      }),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup({
        setYardGeofencesActive: (yardId, isActive) => {
          calls.push(`${yardId}:${String(isActive)}`);
          return Promise.resolve(isActive ? [] : ['900', '901']);
        },
      }),
      realtime,
      NO_ACTORS
    );
    await runWithContextAsync(ctx(), async () => {
      await service.deactivateYard('5');
      await service.reactivateYard('5');
    });
    expect(calls).toEqual(['5:false', '5:true']);
    expect(changes(realtime)).toEqual([
      'yard:5:deactivated',
      'geofence:900:updated',
      'geofence:901:updated',
      'yard:5:reactivated',
    ]);
  });

  it('slot create/update announce `yard_slot`; a yard created without coordinates announces no geofence; a refused deactivate announces nothing', async () => {
    const realtime = new RecordingFleetRealtime();
    const service = new FleetYardsService(
      fakeFleetYardsRepository({
        createYard: () => Promise.resolve(makeYard({ id: '6' })),
        findYardById: () => Promise.resolve(makeYard({ id: '6' })),
        createSlot: () => Promise.resolve(makeSlot({ id: '3' })),
        findSlotById: () => Promise.resolve(makeSlot({ id: '3' })),
        updateSlot: () => Promise.resolve(makeSlot({ id: '3' })),
        countOpenStaysInYard: () => Promise.resolve(1),
      }),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup(),
      realtime,
      NO_ACTORS
    );

    await runWithContextAsync(ctx(), async () => {
      await service.createYard({
        name: 'Bare',
        address: null,
        latitude: null,
        longitude: null,
        radiusM: null,
      });
      await service.createSlot('6', {
        slotNumber: 'A1',
        positionX: null,
        positionY: null,
        maxLengthM: null,
      });
      await service.updateSlot('3', { slotNumber: 'A2' });
    });
    await expect(runWithContextAsync(ctx(), () => service.deactivateYard('6'))).rejects.toThrow(
      ValidationError
    );

    expect(changes(realtime)).toEqual([
      'yard:6:created',
      'yard_slot:3:created',
      'yard_slot:3:updated',
    ]);
  });
});

describe('FleetYardsService.listYards paging (D-0164, B1)', () => {
  it('wraps rows in { items, pagination } only when a window is requested; the flat array otherwise', async () => {
    const service = buildService({
      repo: {
        listYardsForCompany: () =>
          Promise.resolve({ items: [{ yard: makeYard({ id: '1' }), slotsCount: 1 }], total: 45 }),
      },
    });

    const paged = await service.listYards({
      includeInactive: false,
      window: { page: 3, perPage: 20 },
    });
    expect(paged.data).toMatchObject({
      pagination: { page: 3, per_page: 20, total: 45, total_pages: 3 },
    });
    expect((paged.data as { items: unknown[] }).items).toHaveLength(1);

    const flat = await service.listYards({ includeInactive: false });
    expect(Array.isArray(flat.data)).toBe(true);
  });
});

describe('FleetYardsService.yardOptions (D-0165, B2)', () => {
  it('asks for active yards by name, capped at limit, and returns lean rows + meta', async () => {
    let seen: unknown;
    const service = buildService({
      repo: {
        listYardsForCompany: query => {
          seen = query;
          return Promise.resolve({
            items: [{ yard: makeYard({ id: '3', name: 'Depot' }), slotsCount: 4 }],
            total: 9,
          });
        },
      },
    });

    const result = await service.yardOptions({ search: 'dep', hasCoordinates: true, limit: 1 });

    expect(seen).toMatchObject({
      includeInactive: false,
      search: 'dep',
      hasCoordinates: true,
      sortBy: 'name',
      window: { page: 1, perPage: 1 },
    });
    expect(result.meta).toEqual({ total: 9, limit: 1, truncated: true });
    expect(result.data).toEqual([
      expect.objectContaining({ id: '3', name: 'Depot', slots_count: 4 }),
    ]);
  });
});

describe('FleetYardsService.bulkYards (D-0166, B10)', () => {
  it("runs each yard through the single-yard action, reports guard refusals per record with the yard's name, and leaves one already in the target state alone", async () => {
    const service = buildService({
      repo: {
        findYardById: id =>
          Promise.resolve(makeYard({ id, name: `Yard ${id}`, isActive: id !== '3' })),
      },
    });
    const deactivate = vi
      .spyOn(service, 'deactivateYard')
      .mockImplementation((id: string) =>
        id === '2'
          ? Promise.reject(
              new ValidationError('Check out all vehicles from this yard before deactivating it.')
            )
          : Promise.resolve({ success: true, message: 'Yard deactivated.', data: {} } as never)
      );

    const result = await service.bulkYards('deactivate', { ids: ['1', '2', '3'] });

    expect(deactivate.mock.calls.map(call => call[0])).toEqual(['1', '2']);
    expect(result.data.results).toEqual([
      { id: '1', ok: true, changed: true, label: 'Yard 1', message: 'Yard deactivated.' },
      {
        id: '2',
        ok: false,
        changed: false,
        label: 'Yard 2',
        message: 'Check out all vehicles from this yard before deactivating it.',
      },
      {
        id: '3',
        ok: true,
        changed: false,
        label: 'Yard 3',
        message: 'Yard is already deactivated.',
      },
    ]);
  });

  it('filter mode reads the yard list with the right include_inactive default', async () => {
    let seen: unknown;
    const service = buildService({
      repo: {
        listYardsForCompany: query => {
          seen = query;
          return Promise.resolve({ items: [], total: 0 });
        },
      },
    });
    const result = await service.bulkYards('reactivate', { filter: undefined });
    expect(seen).toMatchObject({ includeInactive: true, window: { page: 1, perPage: 500 } });
    expect(result.data.summary).toMatchObject({ mode: 'filter', matched: 0, processed: 0 });
  });
});

describe('FleetYardsService.exportYards (D-0168, B11)', () => {
  it("adds each yard's radius from its linked geofence and the slot count", async () => {
    const service = buildService({
      repo: {
        listYardsForCompany: () =>
          Promise.resolve({
            items: [
              { yard: makeYard({ id: '3', name: 'Depot' }), slotsCount: 4 },
              { yard: makeYard({ id: '4' }), slotsCount: 0 },
            ],
            total: 2,
          }),
      },
    });
    const plan = await service.exportYards({ includeInactive: false });
    const [batch] = await collect(plan.batches());
    const rows = (batch as never[]).map(r =>
      Object.fromEntries(plan.columns.map(c => [c.header, c.value(r)]))
    );
    expect(plan.columns.map(c => c.header)).toEqual([
      'id',
      'name',
      'address',
      'latitude',
      'longitude',
      'radius_m',
      'slots_count',
      'is_active',
      'created_at',
    ]);
    expect(rows[0]).toMatchObject({ id: '3', name: 'Depot', slots_count: 4 });
  });
});

async function collect<T>(batches: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = [];
  for await (const batch of batches) out.push(batch);
  return out;
}

describe('FleetYardsService.deleteSlot / deleteLayout (D-0169, B4)', () => {
  const slot = {
    id: '4',
    yardId: '1',
    slotNumber: 'A1',
    positionX: null,
    positionY: null,
    maxLengthM: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };

  it('refuses an occupied slot, then a slot with any history, otherwise deletes it and announces yard_slot deleted', async () => {
    const del = vi.fn(() => Promise.resolve());
    const realtime = new RecordingFleetRealtime();
    const make = (overrides: Record<string, unknown>) =>
      new FleetYardsService(
        fakeFleetYardsRepository({
          findSlotById: () => Promise.resolve(slot),
          deleteSlot: del,
          ...overrides,
        }),
        fakeVehiclesLookup({}),
        fakeYardsGeofencesLookup(),
        realtime,
        NO_ACTORS
      );

    await expect(
      runWithContextAsync(ctx(), () =>
        make({ findOpenEventForSlot: () => Promise.resolve({ id: '1' }) }).deleteSlot('4')
      )
    ).rejects.toThrow('This slot has a vehicle checked in. Check it out first.');
    await expect(
      runWithContextAsync(ctx(), () =>
        make({
          findOpenEventForSlot: () => Promise.resolve(undefined),
          slotHasHistory: () => Promise.resolve(true),
        }).deleteSlot('4')
      )
    ).rejects.toThrow("This slot has check-in history and can't be deleted.");
    expect(del).not.toHaveBeenCalled();

    const result = await runWithContextAsync(ctx(), () =>
      make({
        findOpenEventForSlot: () => Promise.resolve(undefined),
        slotHasHistory: () => Promise.resolve(false),
      }).deleteSlot('4')
    );
    expect(result).toEqual({ success: true, message: 'Slot deleted.' });
    expect(del).toHaveBeenCalledWith('4');
  });

  it("a slot outside the caller's company is a plain 404", async () => {
    const service = new FleetYardsService(
      fakeFleetYardsRepository({ findSlotById: () => Promise.resolve(undefined) }),
      fakeVehiclesLookup({}),
      fakeYardsGeofencesLookup(),
      new RecordingFleetRealtime(),
      NO_ACTORS
    );
    await expect(runWithContextAsync(ctx(), () => service.deleteSlot('4'))).rejects.toThrow(
      'Slot not found.'
    );
  });

  it('layout removal deletes the stored file and the row, is idempotent, and 404s for an unknown yard', async () => {
    const r2 = await import('../../../platform/storage/r2-storage.js');
    const removeRow = vi.fn(() => Promise.resolve());
    const withLayout = new FleetYardsService(
      fakeFleetYardsRepository({
        findYardById: () => Promise.resolve(makeYard()),
        findLayoutByYardId: () =>
          Promise.resolve({
            id: '1',
            yardId: '1',
            filePath: 'https://images.example.com/yard-layouts/x.png',
            widthPx: 1,
            heightPx: 1,
            createdAt: null,
            updatedAt: null,
          }),
        deleteLayoutByYardId: removeRow,
      }),
      fakeVehiclesLookup({}),
      fakeYardsGeofencesLookup(),
      new RecordingFleetRealtime(),
      NO_ACTORS
    );
    vi.mocked(r2.deleteObject).mockClear();
    expect(await runWithContextAsync(ctx(), () => withLayout.deleteLayout('1'))).toEqual({
      success: true,
      message: 'Layout removed.',
    });
    expect(removeRow).toHaveBeenCalledWith('1');
    expect(r2.deleteObject).toHaveBeenCalledTimes(1);

    const noLayout = new FleetYardsService(
      fakeFleetYardsRepository({
        findYardById: () => Promise.resolve(makeYard()),
        findLayoutByYardId: () => Promise.resolve(undefined),
      }),
      fakeVehiclesLookup({}),
      fakeYardsGeofencesLookup(),
      new RecordingFleetRealtime(),
      NO_ACTORS
    );
    vi.mocked(r2.deleteObject).mockClear();
    expect((await runWithContextAsync(ctx(), () => noLayout.deleteLayout('1'))).message).toBe(
      'Layout removed.'
    );
    expect(r2.deleteObject).not.toHaveBeenCalled();

    const unknown = new FleetYardsService(
      fakeFleetYardsRepository({ findYardById: () => Promise.resolve(undefined) }),
      fakeVehiclesLookup({}),
      fakeYardsGeofencesLookup(),
      new RecordingFleetRealtime(),
      NO_ACTORS
    );
    await expect(runWithContextAsync(ctx(), () => unknown.deleteLayout('1'))).rejects.toThrow(
      'Yard not found.'
    );
  });
});

describe('FleetYardsService.yardOptions include_inactive (D-0171)', () => {
  it('offers deactivated yards only when asked, and each option carries is_active', async () => {
    let seen: { includeInactive?: boolean } | undefined;
    const service = buildService({
      repo: {
        listYardsForCompany: query => {
          seen = query;
          return Promise.resolve({
            items: [{ yard: makeYard({ id: '3', isActive: false }), slotsCount: 0 }],
            total: 1,
          });
        },
      },
    });
    const off = await service.yardOptions({ limit: 1000 });
    expect(seen?.includeInactive).toBe(false);
    expect(off.data).toEqual([expect.objectContaining({ id: '3', is_active: false })]);
    await service.yardOptions({ includeInactive: true, limit: 1000 });
    expect(seen?.includeInactive).toBe(true);
  });
});

describe('FleetYardsService audit fields (D-0172, B6)', () => {
  const actors = {
    findContactsByIds: (ids: string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter(id => id === '3')
            .map(id => [id, { id, firstName: 'Amina', lastName: 'Khan' }] as const)
        )
      ),
  };
  const build = (repo: Partial<ReturnType<typeof fakeFleetYardsRepository>>) =>
    new FleetYardsService(
      fakeFleetYardsRepository(repo),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup(),
      new RecordingFleetRealtime(),
      actors
    );

  it('a new slot reports who created it and its timestamps', async () => {
    const service = build({
      findYardById: () => Promise.resolve(makeYard()),
      createSlot: () =>
        Promise.resolve(
          makeSlot({ createdBy: '3', updatedBy: '3', createdAt: new Date('2026-09-25T10:00:00Z') })
        ),
    });
    const result = await service.createSlot('1', {
      slotNumber: 'B2',
      positionX: null,
      positionY: null,
      maxLengthM: null,
    });
    expect(result.data).toMatchObject({
      created_by: '3',
      created_by_user: { id: '3', first_name: 'Amina', last_name: 'Khan' },
      updated_by_user: { id: '3', first_name: 'Amina' },
      created_at: new Date('2026-09-25T10:00:00Z'),
    });
  });

  it('a listed yard with an unknown creator has null names, never an error', async () => {
    const service = build({
      listYardsForCompany: () =>
        Promise.resolve({
          items: [{ yard: makeYard({ createdBy: '77', updatedBy: null }), slotsCount: 0 }],
          total: 1,
        }),
    });
    const result = await service.listYards({ includeInactive: false });
    expect(result.data).toEqual([
      expect.objectContaining({
        created_by: '77',
        created_by_user: null,
        updated_by: null,
        updated_by_user: null,
      }),
    ]);
  });
});

describe('FleetYardsService — optimistic concurrency (D-0176, B13)', () => {
  const seen = new Date('2026-09-25T10:00:00Z');
  const newer = new Date('2026-09-25T10:07:00Z');

  it('a stale yard or slot edit answers 409 and writes nothing', async () => {
    const updateYard = vi.fn(() => Promise.resolve(makeYard()));
    const updateSlot = vi.fn(() => Promise.resolve(makeSlot()));
    const service = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard({ updatedAt: newer })),
        updateYard,
        findSlotById: () => Promise.resolve(makeSlot({ updatedAt: newer })),
        updateSlot,
      },
    });
    await expect(
      runWithContextAsync(ctx(), () => service.updateYard('1', { name: 'N' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      runWithContextAsync(ctx(), () => service.updateSlot('1', { slotNumber: 'Z9' }, seen))
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(updateYard).not.toHaveBeenCalled();
    expect(updateSlot).not.toHaveBeenCalled();
  });
});

describe('FleetYardsService guarded hard delete (D-0178, C14)', () => {
  it('deletes a never-used yard: layout image, empty slots and linked geofence go with it, each announced', async () => {
    const realtime = new RecordingFleetRealtime();
    const del = vi.fn(() => Promise.resolve(true));
    const service = new FleetYardsService(
      fakeFleetYardsRepository({
        findYardById: () => Promise.resolve(makeYard()),
        yardUsage: () => Promise.resolve([]),
        findLayoutByYardId: () => Promise.resolve(undefined),
        listSlotsForYard: () => Promise.resolve([makeSlot({ id: '5' }), makeSlot({ id: '6' })]),
        deleteYard: del,
      }),
      fakeVehiclesLookup(),
      fakeYardsGeofencesLookup({
        linkedGeofencesForYards: () => Promise.resolve(new Map([['1', { id: '9', radiusM: 100 }]])),
      }),
      realtime,
      NO_ACTORS
    );
    const result = await runWithContextAsync(ctx(), () => service.deleteYard('1'));
    expect(result).toEqual({ success: true, message: 'Yard deleted.' });
    expect(del).toHaveBeenCalledWith('1');
    expect(
      realtime.fleetChanges.map(c => `${c.payload.entity}:${c.payload.id}:${c.payload.action}`)
    ).toEqual([
      'yard:1:deleted',
      'yard_slot:5:deleted',
      'yard_slot:6:deleted',
      'geofence:9:deleted',
    ]);
  });

  it('a yard with trip stops / check-in history / geofence events is refused (422) and nothing is touched; an unknown yard is 404', async () => {
    const del = vi.fn(() => Promise.resolve(true));
    const service = buildService({
      repo: {
        findYardById: () => Promise.resolve(makeYard()),
        yardUsage: () => Promise.resolve(['trip stops', 'check-in history']),
        deleteYard: del,
      },
    });
    await expect(runWithContextAsync(ctx(), () => service.deleteYard('1'))).rejects.toThrow(
      "This yard can't be deleted because it has trip stops and check-in history. Deactivate it instead."
    );
    expect(del).not.toHaveBeenCalled();
    const missing = buildService({ repo: { findYardById: () => Promise.resolve(undefined) } });
    await expect(runWithContextAsync(ctx(), () => missing.deleteYard('9'))).rejects.toThrow(
      'Yard not found.'
    );
  });
});
