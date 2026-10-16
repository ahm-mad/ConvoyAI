import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../platform/errors/app-error.js';
import { FleetPositionsService } from '../fleet-positions.service.js';
import { fakeAssignmentsLookup, fakeDevicesLookup, fakeSettingsLookup } from './fakes.js';

function position(
  id: string,
  deviceId: string,
  latitude: number,
  longitude: number,
  recordedAt: string
) {
  const at = new Date(recordedAt);
  return {
    id,
    deviceId,
    latitude,
    longitude,
    speed: null,
    heading: null,
    recordedAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

/** D-0180 (B8): three assigned trackers — two in Lahore, one in Karachi. */
function viewportService() {
  const at = new Date('2026-09-01T00:00:00.000Z');
  const asked: string[][] = [];
  const service = new FleetPositionsService(
    fakeDevicesLookup({
      deviceIdsForCompany: () => Promise.resolve(['1', '2', '3']),
      findBriefByIds: ids => {
        asked.push(ids);
        return Promise.resolve(
          ids.map(id => ({ id, name: `T${id}`, deviceUniqueIdentifier: `E${id}`, productId: '9' }))
        );
      },
      latestPositionsForDeviceIds: () =>
        Promise.resolve([
          position('10', '1', 31.5, 74.3, '2026-09-24T10:00:00.000Z'),
          position('11', '2', 31.55, 74.35, '2026-09-24T12:00:00.000Z'),
          position('12', '3', 24.86, 67.0, '2026-09-24T11:00:00.000Z'),
        ]),
    }),
    fakeAssignmentsLookup({
      currentAssignmentsForDeviceIds: ids =>
        Promise.resolve(
          ids.map(id => ({
            id: `a${id}`,
            vehicleId: `v${id}`,
            deviceId: id,
            assignedAt: at,
            unassignedAt: null,
            createdAt: at,
            updatedAt: at,
          }))
        ),
      findVehicleById: id =>
        Promise.resolve({ id: id.replace('v', ''), name: `V${id}`, vehicleCategory: null }),
    }),
    fakeSettingsLookup()
  );
  return { service, asked };
}

const LAHORE_BOX = { minLng: 74, minLat: 31, maxLng: 75, maxLat: 32 };
const deviceIds = (result: unknown) =>
  (result as { data: { device_id: number }[] }).data.map(row => row.device_id);

describe('FleetPositionsService.positions freshness (D-0183, A4)', () => {
  it("adds age_seconds and `fresh` under the company's position-freshness threshold (the one the dashboard's offline uses)", async () => {
    const now = Date.now();
    const build = (freshnessMinutes: number) => {
      const at = new Date('2026-09-01T00:00:00.000Z');
      return new FleetPositionsService(
        fakeDevicesLookup({
          deviceIdsForCompany: () => Promise.resolve(['1', '2']),
          findBriefByIds: ids =>
            Promise.resolve(
              ids.map(id => ({
                id,
                name: `T${id}`,
                deviceUniqueIdentifier: `E${id}`,
                productId: '9',
              }))
            ),
          latestPositionsForDeviceIds: () =>
            Promise.resolve([
              {
                id: '10',
                deviceId: '1',
                latitude: 1,
                longitude: 2,
                speed: null,
                heading: null,
                recordedAt: new Date(now - 5 * 60_000),
                createdAt: at,
                updatedAt: at,
              },
              {
                id: '11',
                deviceId: '2',
                latitude: 1,
                longitude: 2,
                speed: null,
                heading: null,
                recordedAt: new Date(now - 20 * 60_000),
                createdAt: at,
                updatedAt: at,
              },
            ]),
        }),
        fakeAssignmentsLookup({
          currentAssignmentsForDeviceIds: ids =>
            Promise.resolve(
              ids.map(id => ({
                id: `a${id}`,
                vehicleId: `v${id}`,
                deviceId: id,
                assignedAt: at,
                unassignedAt: null,
                createdAt: at,
                updatedAt: at,
              }))
            ),
          findVehicleById: id =>
            Promise.resolve({ id: id.replace('v', ''), name: id, vehicleCategory: null }),
        }),
        fakeSettingsLookup({ positionFreshnessMinutes: freshnessMinutes })
      );
    };
    const rows = async (minutes: number) =>
      (
        (await build(minutes).positions('1')) as {
          data: { device_id: number; age_seconds: number; fresh: boolean }[];
        }
      ).data;

    const at15 = await rows(15);
    expect(at15.map(r => [r.device_id, r.fresh])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(at15[0]?.age_seconds).toBeGreaterThanOrEqual(299);
    expect(at15[0]?.age_seconds).toBeLessThan(310);
    expect((await rows(30)).map(r => r.fresh)).toEqual([true, true]);
  });
});

describe('FleetPositionsService.positions viewport (D-0180, B8)', () => {
  it('without bbox / limit the body is unchanged: every tracker, no meta', async () => {
    const { service } = viewportService();
    const result = await service.positions('1');
    expect(deviceIds(result)).toEqual([1, 2, 3]);
    expect(result).not.toHaveProperty('meta');
  });

  it('bbox keeps only the trackers whose latest position is inside, and reports the total', async () => {
    const { service, asked } = viewportService();
    const result = await service.positions('1', false, { bbox: LAHORE_BOX });
    expect(deviceIds(result)).toEqual([1, 2]);
    expect(result).toMatchObject({ meta: { total: 2, limit: null, truncated: false } });
    expect(asked).toEqual([['1', '2']]); // briefs are only fetched for the trackers shown
  });

  it('limit keeps the most recently reported trackers, newest first, and says it truncated', async () => {
    const { service } = viewportService();
    const result = await service.positions('1', false, { limit: 2 });
    expect(deviceIds(result)).toEqual([2, 3]);
    expect(result).toMatchObject({ meta: { total: 3, limit: 2, truncated: true } });
  });

  it('bbox + limit: the total counts what is in view, not what is returned', async () => {
    const { service } = viewportService();
    const result = await service.positions('1', false, { bbox: LAHORE_BOX, limit: 1 });
    expect(deviceIds(result)).toEqual([2]);
    expect(result).toMatchObject({ meta: { total: 2, limit: 1, truncated: true } });
  });

  it('a limit larger than the result does not truncate or reorder', async () => {
    const { service } = viewportService();
    const result = await service.positions('1', false, { limit: 50 });
    expect(deviceIds(result)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ meta: { total: 3, limit: 50, truncated: false } });
  });

  it('an empty view is an empty array with meta', async () => {
    const { service } = viewportService();
    const result = await service.positions('1', false, {
      bbox: { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
    });
    expect(result).toMatchObject({ data: [], meta: { total: 0, limit: null, truncated: false } });
  });

  it('a company without devices also carries meta when a viewport was asked for', async () => {
    const service = new FleetPositionsService(
      fakeDevicesLookup(),
      fakeAssignmentsLookup(),
      fakeSettingsLookup()
    );
    await expect(service.positions('1', false, { limit: 5 })).resolves.toMatchObject({
      data: [],
      meta: { total: 0, limit: 5, truncated: false },
    });
  });
});

describe('FleetPositionsService.positions', () => {
  it("returns the 'no devices found' shape when the company has no devices at all", async () => {
    const service = new FleetPositionsService(
      fakeDevicesLookup({ deviceIdsForCompany: () => Promise.resolve([]) }),
      fakeAssignmentsLookup(),
      fakeSettingsLookup()
    );

    await expect(service.positions('23595')).resolves.toEqual({
      success: true,
      message: 'No devices found.',
      data: [],
    });
  });

  it("nests device and current_vehicle_assignment.vehicle under each position, matching Laravel's eager-load shape", async () => {
    const recordedAt = new Date('2026-09-18T10:00:00.000Z');
    const assignedAt = new Date('2026-09-01T00:00:00.000Z');

    const service = new FleetPositionsService(
      fakeDevicesLookup({
        deviceIdsForCompany: () => Promise.resolve(['1', '2']),
        findBriefByIds: () =>
          Promise.resolve([
            { id: '1', name: 'Tracker A', deviceUniqueIdentifier: 'TRK-A', productId: '9' },
          ]),
        latestPositionsForDeviceIds: () =>
          Promise.resolve([
            {
              id: '100',
              deviceId: '1',
              latitude: 24.7,
              longitude: 46.6,
              speed: 12.5,
              heading: 90,
              recordedAt,
              createdAt: recordedAt,
              updatedAt: recordedAt,
            },
          ]),
      }),
      fakeAssignmentsLookup({
        currentAssignmentsForDeviceIds: () =>
          Promise.resolve([
            {
              id: '5',
              vehicleId: '50',
              deviceId: '1',
              assignedAt,
              unassignedAt: null,
              createdAt: assignedAt,
              updatedAt: assignedAt,
            },
          ]),
        findVehicleById: id =>
          id === '50'
            ? Promise.resolve({ id: '50', name: 'Truck 5', vehicleCategory: 'truck' })
            : Promise.resolve(undefined),
      }),
      fakeSettingsLookup()
    );

    const result = await service.positions('23595');

    expect(result).toEqual({
      success: true,
      message: 'Fleet positions retrieved successfully.',
      data: [
        {
          id: 100,
          device_id: 1,
          latitude: 24.7,
          longitude: 46.6,
          speed: 12.5,
          heading: 90,
          recorded_at: recordedAt,
          age_seconds: expect.any(Number) as number,
          fresh: false, // the fixture position is from 2026-09-18 — far older than the 15-minute default
          created_at: recordedAt,
          updated_at: recordedAt,
          device: {
            id: 1,
            name: 'Tracker A',
            device_unique_identifier: 'TRK-A',
            product_id: 9,
            current_vehicle_assignment: {
              id: 5,
              vehicle_id: 50,
              device_id: 1,
              assigned_at: assignedAt,
              unassigned_at: null,
              created_at: assignedAt,
              updated_at: assignedAt,
              vehicle: { id: 50, name: 'Truck 5', vehicle_category: 'truck' },
            },
          },
        },
      ],
    });
  });

  it('leaves current_vehicle_assignment null when the device has no active assignment', async () => {
    const recordedAt = new Date('2026-09-18T10:00:00.000Z');

    const service = new FleetPositionsService(
      fakeDevicesLookup({
        deviceIdsForCompany: () => Promise.resolve(['1']),
        findBriefByIds: () =>
          Promise.resolve([
            { id: '1', name: 'Tracker A', deviceUniqueIdentifier: 'TRK-A', productId: '9' },
          ]),
        latestPositionsForDeviceIds: () =>
          Promise.resolve([
            {
              id: '100',
              deviceId: '1',
              latitude: 24.7,
              longitude: 46.6,
              speed: null,
              heading: null,
              recordedAt,
              createdAt: recordedAt,
              updatedAt: recordedAt,
            },
          ]),
      }),
      fakeAssignmentsLookup({ currentAssignmentsForDeviceIds: () => Promise.resolve([]) }),
      fakeSettingsLookup()
    );

    const result = await service.positions('23595', true); // unassigned devices are only returned with include_unassigned (D9)
    const data = result['data'] as Array<{ device: { current_vehicle_assignment: unknown } }>;
    expect(data[0]?.device.current_vehicle_assignment).toBeNull();
  });
});

describe('FleetPositionsService.positions — assigned-only default (D9, B6)', () => {
  const at = new Date('2026-09-24T10:00:00.000Z');
  const position = (deviceId: string) => ({
    id: `p${deviceId}`,
    deviceId,
    latitude: 1,
    longitude: 2,
    speed: null,
    heading: null,
    recordedAt: at,
    createdAt: at,
    updatedAt: at,
  });

  function build() {
    const requestedIds: string[][] = [];
    const service = new FleetPositionsService(
      fakeDevicesLookup({
        deviceIdsForCompany: () => Promise.resolve(['1', '2']),
        findBriefByIds: ids =>
          Promise.resolve(
            ids.map(id => ({
              id,
              name: `D${id}`,
              deviceUniqueIdentifier: `E${id}`,
              productId: '9',
            }))
          ),
        latestPositionsForDeviceIds: ids => {
          requestedIds.push(ids);
          return Promise.resolve(ids.map(position));
        },
      }),
      fakeAssignmentsLookup({
        currentAssignmentsForDeviceIds: () =>
          Promise.resolve([
            {
              id: '5',
              vehicleId: '50',
              deviceId: '1',
              assignedAt: at,
              unassignedAt: null,
              createdAt: at,
              updatedAt: at,
            },
          ]),
        findVehicleById: () =>
          Promise.resolve({ id: '50', name: 'Truck 5', vehicleCategory: null }),
      }),
      fakeSettingsLookup()
    );
    return { service, requestedIds };
  }

  it('by default only trackers installed in a vehicle are returned (and only those are queried)', async () => {
    const { service, requestedIds } = build();

    const result = (await service.positions('1')) as { data: { device_id: number }[] };

    expect(result.data.map(p => p.device_id)).toEqual([1]);
    expect(requestedIds).toEqual([['1']]);
  });

  it("include_unassigned restores every device that has reported (Laravel's original behaviour)", async () => {
    const { service } = build();

    const result = (await service.positions('1', true)) as { data: { device_id: number }[] };

    expect(result.data.map(p => p.device_id).sort()).toEqual([1, 2]);
  });

  it('returns an empty list (not an error) when no tracker is installed anywhere', async () => {
    const service = new FleetPositionsService(
      fakeDevicesLookup({ deviceIdsForCompany: () => Promise.resolve(['1']) }),
      fakeAssignmentsLookup(),
      fakeSettingsLookup()
    );

    await expect(service.positions('1')).resolves.toMatchObject({ success: true, data: [] });
  });
});

describe('FleetPositionsService.history (FleetController::history, KNOWN_ISSUES 11.72)', () => {
  it("404s when the device is not in the caller's company", async () => {
    const service = new FleetPositionsService(
      fakeDevicesLookup({ deviceInCompany: () => Promise.resolve(false) }),
      fakeAssignmentsLookup(),
      fakeSettingsLookup()
    );

    await expect(service.history('1', '77', 500)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the positions in the order the repository gives (oldest to newest) with the requested limit', async () => {
    const at = new Date('2026-09-24T10:00:00.000Z');
    let seenLimit = 0;
    const service = new FleetPositionsService(
      fakeDevicesLookup({
        deviceInCompany: () => Promise.resolve(true),
        positionHistory: (_id, limit) => {
          seenLimit = limit;
          return Promise.resolve([
            {
              id: '1',
              deviceId: '9',
              latitude: 1,
              longitude: 2,
              speed: 3,
              heading: 4,
              recordedAt: at,
              createdAt: at,
              updatedAt: at,
            },
          ]);
        },
      }),
      fakeAssignmentsLookup(),
      fakeSettingsLookup()
    );

    const result = (await service.history('1', '9', 25)) as {
      message: string;
      data: Record<string, unknown>[];
    };

    expect(seenLimit).toBe(25);
    expect(result.message).toBe('Position history retrieved successfully.');
    expect(result.data[0]).toMatchObject({
      id: 1,
      device_id: 9,
      latitude: 1,
      longitude: 2,
      speed: 3,
      heading: 4,
    });
  });
});
