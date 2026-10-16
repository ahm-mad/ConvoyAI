import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';
import {
  FleetTelemetryRollupService,
  ROLLUP_CHUNK_DAYS,
  ROLLUP_OVERLAP_HOURS,
} from '../fleet-telemetry-rollup.service.js';
import type {
  DeviceAssignmentSpan,
  FleetTelemetryRepository,
} from '../fleet-telemetry.repository.js';
import type { HourStat, RollupPoint } from '../telemetry-rollup.js';

const ctx = (companyId = '1'): RequestContext => ({
  userId: '1',
  companyId,
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});
const run = <T>(fn: () => Promise<T>, companyId = '1') => runWithContextAsync(ctx(companyId), fn);
const NOW = new Date('2026-09-25T12:30:00.000Z'); // the current hour is 12:00–13:00
const at = (iso: string) =>
  new Date(iso.length === 5 ? `2026-09-25T${iso}:00Z` : iso.endsWith('Z') ? iso : `${iso}Z`);
const pt = (time: string, lng: number, speed: number | null): RollupPoint => ({
  at: at(time),
  latitude: 0,
  longitude: lng,
  speed,
});
const span = (
  vehicleId: string,
  deviceId: string,
  assignedAt: string,
  unassignedAt: string | null = null
): DeviceAssignmentSpan => ({
  vehicleId,
  deviceId,
  assignedAt: at(assignedAt),
  unassignedAt: unassignedAt ? at(unassignedAt) : null,
});

interface Replace {
  vehicleId: string;
  from: Date;
  to: Date;
  rows: HourStat[];
}
function fakeTelemetry(opts: {
  assignments: DeviceAssignmentSpan[];
  positions: Record<string, RollupPoint[]>;
  watermarks?: Record<string, string>;
  lastPacket?: Record<string, string>;
  failVehicle?: string;
}) {
  const replaced: Replace[] = [];
  const repo = {
    allAssignments: () => Promise.resolve(opts.assignments),
    rolledWatermarks: () =>
      Promise.resolve(
        new Map(
          Object.entries(opts.watermarks ?? {}).map(([k, v]) => [
            k,
            {
              hourStart: at(v),
              lastPacketAt: opts.lastPacket?.[k]
                ? at(opts.lastPacket[k])
                : new Date(at(v).getTime() - 600_000),
            },
          ])
        )
      ),
    newestPositionAt: (deviceIds: string[]) =>
      Promise.resolve(
        new Map(
          deviceIds.flatMap(d => {
            const list = opts.positions[d] ?? [];
            const last = list[list.length - 1];
            return last ? [[d, last.at] as [string, Date]] : [];
          })
        )
      ),
    positionsBetween: (deviceId: string, from: Date, to: Date) =>
      Promise.resolve((opts.positions[deviceId] ?? []).filter(p => p.at >= from && p.at < to)),
    positionsBefore: (deviceId: string, before: Date, limit: number) =>
      Promise.resolve((opts.positions[deviceId] ?? []).filter(p => p.at < before).slice(-limit)),
    positionsAtOrAfter: (deviceId: string, when: Date, limit: number) =>
      Promise.resolve((opts.positions[deviceId] ?? []).filter(p => p.at >= when).slice(0, limit)),
    positionAtOrAfter: (deviceId: string, when: Date) =>
      Promise.resolve((opts.positions[deviceId] ?? []).find(p => p.at >= when) ?? null),
    replaceHours: (vehicleId: string, from: Date, to: Date, rows: HourStat[]) => {
      if (vehicleId === opts.failVehicle) return Promise.reject(new Error('db hiccup'));
      replaced.push({ vehicleId, from, to, rows });
      return Promise.resolve();
    },
  } as unknown as FleetTelemetryRepository;
  return { repo, replaced };
}
const service = (
  repo: FleetTelemetryRepository,
  companies = ['1'],
  settings: Parameters<typeof fakeSettingsLookup>[0] = {}
) =>
  new FleetTelemetryRollupService(
    fakeFleetDashboardRepository({ companyIdsWithVehicles: () => Promise.resolve(companies) }),
    repo,
    fakeSettingsLookup(settings)
  );
const summary = (r: Replace) =>
  r.rows.map(h => [
    h.hourStart.toISOString().slice(11, 13),
    h.packets,
    h.movingSeconds,
    h.stoppedSeconds,
  ]);

describe('FleetTelemetryRollupService', () => {
  it("first run = backfill: starts at the hour of the vehicle's first packet and rolls up to the end of the current hour", async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: [pt('10:20', 0, 30), pt('10:40', 0.01, 0), pt('11:10', 0.01, 0)] },
    });
    const result = await run(() => service(repo).runAll(NOW));
    expect(result).toEqual({ companies: 1, vehicles: 1, hours: 2 });
    expect(replaced.length).toBe(1);
    expect(replaced[0]?.from).toEqual(at('10:00')); // the hour of the first packet
    expect(replaced[0]?.to).toEqual(at('13:00')); // the end of the current hour (12:30 → 13:00)
    expect(summary(replaced[0] as Replace)).toEqual([
      ['10', 2, 1200, 1200],
      ['11', 1, 0, 600],
    ]); // 10:20→10:40 moving 1200 s; 10:40→11:10 stopped 1800 s split 1200 / 600
  });

  it("later runs continue from each vehicle's own watermark minus the overlap", async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [
        span('7', 'd1', '2026-09-20T00:00:00Z'),
        span('8', 'd2', '2026-09-20T00:00:00Z'),
      ],
      positions: { d1: [pt('11:05', 0, 0)], d2: [pt('09:05', 0, 0)] },
      watermarks: { '7': '2026-09-25T11:00:00Z', '8': '2026-09-25T06:00:00Z' },
    });
    await run(() => service(repo).runAll(NOW));
    expect(replaced.map(r => [r.vehicleId, r.from.toISOString()])).toEqual([
      ['7', new Date(at('11:00').getTime() - ROLLUP_OVERLAP_HOURS * 3_600_000).toISOString()],
      ['8', new Date(at('06:00').getTime() - ROLLUP_OVERLAP_HOURS * 3_600_000).toISOString()],
    ]);
  });

  it('a long backfill is done in windows of ROLLUP_CHUNK_DAYS', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-01T00:00:00Z')],
      positions: { d1: [pt('2026-09-10T03:15:00Z', 0, 0), pt('2026-09-10T03:25:00Z', 0, 0)] },
    });
    await run(() => service(repo).runAll(NOW));
    // from 2026-09-10 03:00 to 2026-09-25 13:00 = 15 days 10 h → 7 + 7 + 1 days 10 h
    expect(replaced.map(r => (r.to.getTime() - r.from.getTime()) / 3_600_000)).toEqual([
      ROLLUP_CHUNK_DAYS * 24,
      ROLLUP_CHUNK_DAYS * 24,
      34,
    ]);
    expect(replaced[0]?.rows.length).toBe(1);
    expect(replaced[1]?.rows).toEqual([]); // an empty window still replaces (clears) its hours
  });

  it('packets belong to the vehicle only while its device is assigned: nothing before the assignment or after the unassignment, and no interval reaches across', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T10:30:00Z', '2026-09-25T11:30:00Z')],
      positions: {
        d1: [
          pt('10:20', 0, 30),
          pt('10:40', 0, 30),
          pt('10:50', 0, 30),
          pt('11:10', 0, 30),
          pt('11:50', 0, 30),
        ],
      },
    });
    await run(() => service(repo).runAll(NOW));
    // 10:20 is before the assignment (a different vehicle's packet); 11:50 is after it ended. 10:40→10:50 (600 s) and 10:50→11:10 (600 s in hour 10, 600 s in hour 11) are the vehicle's own intervals
    expect(summary(replaced[0] as Replace)).toEqual([
      ['10', 2, 1200, 0],
      ['11', 1, 600, 0],
    ]);
    // the interval 11:10 → 11:50 would cross the unassignment (11:30): the successor packet (11:50) is not the vehicle's, so it adds nothing
    expect(replaced[0]?.rows.reduce((n, h) => n + h.movingSeconds, 0)).toBe(1800);
  });

  it('two devices on one vehicle at the same time: each hour keeps the better-covered device, never the sum', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [
        span('7', 'd1', '2026-09-25T00:00:00Z'),
        span('7', 'd2', '2026-09-25T00:00:00Z'),
      ],
      positions: {
        d1: [pt('10:00', 0, 30), pt('10:20', 0, 30)], // 1200 s
        d2: [pt('10:00', 0, 30), pt('10:10', 0, 30), pt('10:30', 0, 30)], // 1800 s
      },
    });
    await run(() => service(repo).runAll(NOW));
    expect(summary(replaced[0] as Replace)).toEqual([['10', 3, 1800, 0]]);
  });

  it('a device that never reported: nothing to roll up, nothing written', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: {},
    });
    expect(await run(() => service(repo).runAll(NOW))).toEqual({
      companies: 1,
      vehicles: 0,
      hours: 0,
    });
    expect(replaced).toEqual([]);
  });

  it("the gap limit follows the device's own report interval; the freshness window is only the fallback (too few neighbours to tell)", async () => {
    // a 75-minute gap between two packets of a device with only 2 packets: unknown interval -> the 30-minute fallback -> no-data
    const two = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: [pt('10:00', 0, 30), pt('11:15', 0, 30)] },
    });
    await run(() => service(two.repo).runAll(NOW));
    expect(summary(two.replaced[0] as Replace)).toEqual([
      ['10', 1, 0, 0],
      ['11', 1, 0, 0],
    ]);
    // a wider freshness window widens the fallback: 40 min -> 80 min, the 75-minute gap is bridged
    const wider = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: [pt('10:00', 0, 30), pt('11:15', 0, 30)] },
    });
    await run(() => service(wider.repo, ['1'], { positionFreshnessMinutes: 40 }).runAll(NOW));
    expect(summary(wider.replaced[0] as Replace)).toEqual([
      ['10', 1, 3600, 0],
      ['11', 1, 900, 0],
    ]);
    // an hourly tracker with history: its own interval (60 min -> limit 150 min) bridges every hour, whatever the freshness setting
    const hourlyPoints = Array.from({ length: 8 }, (_, i) =>
      pt(`${String(2 + i).padStart(2, '0')}:05`, 0, i % 2 === 0 ? 30 : 0)
    );
    const hourly = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: hourlyPoints },
    });
    await run(() => service(hourly.repo).runAll(NOW));
    const hours = summary(hourly.replaced[0] as Replace);
    expect(hours.map(h => h[0])).toEqual(['02', '03', '04', '05', '06', '07', '08', '09']);
    // packets at 02:05 .. 09:05, moving (30 km/h) at the even ones: 02:05 → 03:05 moving 3600 s across hours 02 (3300 s) and 03 (300 s); ...
    expect(
      hourly.replaced[0]?.rows.reduce((n, h) => n + h.movingSeconds + h.stoppedSeconds, 0)
    ).toBe(7 * 3600);
    expect(hourly.replaced[0]?.rows.reduce((n, h) => n + h.movingSeconds, 0)).toBe(4 * 3600); // packets 1, 3, 5, 7 of 8 are moving and each covers the following hour
    // a fast tracker: 1-minute reports, then a 10-minute silence: its limit is the 5-minute floor -> the silence is no-data even though the fallback (30 min) would bridge it
    const fastPoints = [
      ...Array.from({ length: 12 }, (_, i) => pt(`10:${String(i).padStart(2, '0')}`, 0, 30)),
      pt('10:21', 0, 30),
      pt('10:22', 0, 30),
      pt('10:23', 0, 30),
      pt('10:24', 0, 30),
    ];
    const fast = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: fastPoints },
    });
    await run(() => service(fast.repo).runAll(NOW));
    expect(fast.replaced[0]?.rows.reduce((n, h) => n + h.movingSeconds, 0)).toBe(11 * 60 + 3 * 60); // 10:00 → 10:11 and 10:21 → 10:24; 10:11 → 10:21 is no-data
  });

  it('idle runs are cheap: a vehicle whose open devices sent nothing newer than its newest stored packet is skipped', async () => {
    const assignments = [
      span('7', 'd1', '2026-09-20T00:00:00Z'),
      span('8', 'd2', '2026-09-20T00:00:00Z'),
    ];
    const positions = { d1: [pt('10:05', 0, 0)], d2: [pt('10:05', 0, 0), pt('12:10', 0, 0)] };
    const { repo, replaced } = fakeTelemetry({
      assignments,
      positions,
      watermarks: { '7': '2026-09-25T10:00:00Z', '8': '2026-09-25T10:00:00Z' },
      lastPacket: { '7': '2026-09-25T10:05:00Z', '8': '2026-09-25T10:05:00Z' }, // vehicle 7 is up to date; vehicle 8's device has a newer packet (12:10)
    });
    const result = await run(() => service(repo).runAll(NOW));
    expect(replaced.map(r => r.vehicleId)).toEqual(['8']);
    expect(result.companies).toBe(1);
  });

  it('an assignment that ended recently is settled once more; a long-closed one is left alone; a device that never reported is not news', async () => {
    const mk = (unassigned: string) =>
      fakeTelemetry({
        assignments: [span('7', 'd1', '2026-09-20T00:00:00Z', unassigned)],
        positions: { d1: [pt('10:05', 0, 0)] },
        watermarks: { '7': '2026-09-25T10:00:00Z' },
        lastPacket: { '7': '2026-09-25T10:05:00Z' },
      });
    const recent = mk('2026-09-25T10:30:00Z');
    await run(() => service(recent.repo).runAll(NOW));
    expect(recent.replaced.length).toBe(1);
    const old = mk('2026-09-21T00:00:00Z');
    await run(() => service(old.repo).runAll(NOW));
    expect(old.replaced.length).toBe(0);
    const silent = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-20T00:00:00Z')],
      positions: {},
      watermarks: { '7': '2026-09-25T10:00:00Z' },
    });
    await run(() => service(silent.repo).runAll(NOW));
    expect(silent.replaced.length).toBe(0);
  });

  it('one vehicle failing never stops the others, one company failing never stops the others', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [
        span('7', 'd1', '2026-09-25T00:00:00Z'),
        span('8', 'd2', '2026-09-25T00:00:00Z'),
      ],
      positions: {
        d1: [pt('10:00', 0, 30), pt('10:10', 0, 30)],
        d2: [pt('10:00', 0, 30), pt('10:10', 0, 30)],
      },
      failVehicle: '7',
    });
    const result = await run(() => service(repo).runAll(NOW));
    expect(result.vehicles).toBe(1);
    expect(replaced.map(r => r.vehicleId)).toEqual(['8']);
    const failing = {
      allAssignments: () => Promise.reject(new Error('boom')),
      rolledWatermarks: () => Promise.resolve(new Map()),
      newestPositionAt: () => Promise.resolve(new Map()),
    } as unknown as FleetTelemetryRepository;
    expect(await run(() => service(failing, ['1', '2']).runAll(NOW))).toEqual({
      companies: 2,
      vehicles: 0,
      hours: 0,
    });
  });

  it('a spent time budget stops before the next vehicle; the next run continues from the watermarks', async () => {
    const { repo, replaced } = fakeTelemetry({
      assignments: [span('7', 'd1', '2026-09-25T00:00:00Z')],
      positions: { d1: [pt('10:00', 0, 30), pt('10:10', 0, 30)] },
    });
    const result = await run(() => service(repo).runAll(NOW, -1));
    expect(result).toEqual({ companies: 1, vehicles: 0, hours: 0 });
    expect(replaced).toEqual([]);
  });
});
