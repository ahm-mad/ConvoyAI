import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetTelemetryRollupService } from '../fleet-telemetry-rollup.service.js';
import type {
  DeviceAssignmentSpan,
  FleetTelemetryRepository,
} from '../fleet-telemetry.repository.js';
import type { HourStat, RollupPoint } from '../telemetry-rollup.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';
import {
  HOUR,
  makeTruth,
  must,
  rng,
  rollThroughService,
  samplePackets,
  type SampleOptions,
} from './telemetry-cadence.sim.js';

const ctx = (): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});
const START = Date.parse('2026-03-02T00:00:00Z');
const DAY = 24 * HOUR;

/** A whole in-memory database for one vehicle: packets become visible as `now` advances; the job's rows are stored and re-read as watermarks, exactly like the real table. */
function liveWorld(all: RollupPoint[]) {
  let now = 0;
  const stored = new Map<number, HourStat>();
  const visible = () => all.filter(p => p.at.getTime() <= now);
  const span: DeviceAssignmentSpan = {
    vehicleId: '1',
    deviceId: 'd',
    assignedAt: new Date(START - 30 * DAY),
    unassignedAt: null,
  };
  const repo = {
    allAssignments: () => Promise.resolve([span]),
    rolledWatermarks: () => {
      const rows = [...stored.values()];
      if (rows.length === 0) return Promise.resolve(new Map());
      const hourStart = new Date(Math.max(...rows.map(r => r.hourStart.getTime())));
      const lasts = rows.flatMap(r => (r.lastPacketAt ? [r.lastPacketAt.getTime()] : []));
      return Promise.resolve(
        new Map([
          ['1', { hourStart, lastPacketAt: lasts.length ? new Date(Math.max(...lasts)) : null }],
        ])
      );
    },
    newestPositionAt: () => {
      const v = visible();
      return Promise.resolve(v.length ? new Map([['d', must(v[v.length - 1]).at]]) : new Map());
    },
    positionsBetween: (_d: string, from: Date, to: Date) =>
      Promise.resolve(visible().filter(p => p.at >= from && p.at < to)),
    positionsBefore: (_d: string, before: Date, limit: number) =>
      Promise.resolve(
        visible()
          .filter(p => p.at < before)
          .slice(-limit)
      ),
    positionsAtOrAfter: (_d: string, at: Date, limit: number) =>
      Promise.resolve(
        visible()
          .filter(p => p.at >= at)
          .slice(0, limit)
      ),
    positionAtOrAfter: (_d: string, at: Date) =>
      Promise.resolve(visible().find(p => p.at >= at) ?? null),
    replaceHours: (_v: string, from: Date, to: Date, rows: HourStat[]) => {
      for (const k of [...stored.keys()])
        if (k >= from.getTime() && k < to.getTime()) stored.delete(k);
      for (const r of rows) stored.set(r.hourStart.getTime(), r);
      return Promise.resolve();
    },
  } as unknown as FleetTelemetryRepository;
  const service = new FleetTelemetryRollupService(
    fakeFleetDashboardRepository({ companyIdsWithVehicles: () => Promise.resolve(['1']) }),
    repo,
    fakeSettingsLookup({})
  );
  return {
    stored,
    /** Advances the clock and runs the job once. */
    async tick(to: number): Promise<{ hours: number }> {
      now = to;
      return runWithContextAsync(ctx(), () => service.runAll(new Date(to)));
    },
  };
}

const covered = (rows: Iterable<HourStat>) =>
  [...rows].reduce((n, r) => n + r.movingSeconds + r.stoppedSeconds, 0);
const movingOf = (rows: Iterable<HourStat>) => [...rows].reduce((n, r) => n + r.movingSeconds, 0);

describe('live operation: the job running every 15 minutes converges to the answer of one batch over the whole history', () => {
  for (const minutes of [1, 5, 15, 30, 45, 60, 90, 120]) {
    it(`a tracker reporting every ${String(minutes)} min (jitter, 3% lost reports), 2 days replayed in 15-minute job ticks`, async () => {
      const end = START + 2 * DAY;
      const truth = makeTruth(21, START, end);
      const all = samplePackets(truth, START, end, {
        cadenceMs: minutes * 60_000,
        jitter: 0.1,
        drop: 0.03,
        seed: 21,
      });
      const world = liveWorld(all);
      let idleTicks = 0;
      let firstRun = true;
      for (let t = START; t <= end + 2 * HOUR; t += 15 * 60_000) {
        const before = world.stored.size;
        const { hours } = await world.tick(t);
        if (!firstRun && hours === 0) idleTicks += 1;
        if (world.stored.size > 0) firstRun = false;
        expect(world.stored.size).toBeGreaterThanOrEqual(before - 0); // rows are never lost by a later run
      }
      const batch = await rollThroughService(all, START, end);
      // an hour is judged with whatever neighbours had arrived: after the warm-up the live rows equal the batch rows
      const live = [...world.stored.values()].sort(
        (a, b) => a.hourStart.getTime() - b.hourStart.getTime()
      );
      const settledFrom = START + 8 * HOUR;
      const liveSettled = live.filter(r => r.hourStart.getTime() >= settledFrom);
      const batchSettled = batch.filter(r => r.hourStart.getTime() >= settledFrom);
      expect(liveSettled.length).toBe(batchSettled.length);
      expect(
        Math.abs(covered(liveSettled) - covered(batchSettled)) / covered(batchSettled)
      ).toBeLessThan(0.02);
      expect(
        Math.abs(movingOf(liveSettled) - movingOf(batchSettled)) /
          Math.max(1, movingOf(batchSettled))
      ).toBeLessThan(0.05);
      expect(liveSettled.reduce((n, r) => n + r.packets, 0)).toBe(
        batchSettled.reduce((n, r) => n + r.packets, 0)
      ); // every packet is in exactly one row
      // and the whole history is covered; only the warm-up (a new device needs ~5 packets before its own interval is known) may differ, so at most ~6 report intervals are lost
      expect(covered(batch) - covered(live)).toBeLessThanOrEqual(6 * minutes * 60 + 3600);
      expect(covered(live)).toBeLessThanOrEqual(covered(batch) + 1); // a live run never invents time the batch would not count
      // the ticks between two reports of a slow tracker do (almost) nothing
      if (minutes >= 45) expect(idleTicks).toBeGreaterThan(20);
    }, 120_000);
  }

  it('a tracker that goes silent for a day and comes back: the job stays idle while silent, then picks up where it left off', async () => {
    const end = START + 3 * DAY;
    const truth = makeTruth(4, START, end);
    const all = samplePackets(truth, START, end, {
      cadenceMs: 30 * 60_000,
      jitter: 0.1,
      outages: [[START + 20 * HOUR, START + 44 * HOUR]],
      seed: 4,
    });
    const world = liveWorld(all);
    let silentWrites = 0;
    for (let t = START; t <= end + HOUR; t += 15 * 60_000) {
      const { hours } = await world.tick(t);
      if (t > START + 24 * HOUR && t < START + 43 * HOUR) silentWrites += hours;
    }
    expect(silentWrites).toBe(0); // 19 hours of ticks with nothing new: not one row written
    const batch = await rollThroughService(all, START, end);
    expect(Math.abs(covered(world.stored.values()) - covered(batch)) / covered(batch)).toBeLessThan(
      0.03
    );
  });
});

describe('fuzz: random trackers, random misbehaviour — the invariants hold and the window never matters', () => {
  it('60 random scenarios', async () => {
    const rand = rng(2026);
    for (let n = 0; n < 60; n++) {
      const cadenceMin = Math.exp(Math.log(0.5) + rand() * (Math.log(300) - Math.log(0.5))); // 30 s .. 5 h, log-uniform
      const days = cadenceMin < 3 ? 1 : cadenceMin < 30 ? 2 : 4;
      const end = START + days * DAY;
      const truth = makeTruth(100 + n, START, end);
      const o: SampleOptions = {
        cadenceMs: cadenceMin * 60_000,
        jitter: rand() * 0.3,
        drop: rand() * 0.2,
        seed: n,
        speedNull: rand() < 0.2,
        duplicateAfterSeconds: rand() < 0.2 ? 1 + Math.floor(rand() * 8) : 0,
      };
      if (rand() < 0.3)
        o.outages = [
          [
            START + Math.floor(rand() * days * 12) * HOUR,
            START + Math.floor(rand() * days * 12) * HOUR + Math.floor(1 + rand() * 6) * HOUR,
          ],
        ];
      if (rand() < 0.25)
        o.changeCadenceAt = {
          at: START + (days * DAY) / 2,
          cadenceMs: cadenceMin * (0.2 + rand() * 4) * 60_000,
        };
      if (rand() < 0.2) o.irregularMinutes = [0.5 + rand(), 2 + rand() * 20];
      const pts = samplePackets(truth, START, end, o);
      if (pts.length === 0) continue;
      const whole = await rollThroughService(pts, START, end, 0);
      let packets = 0;
      for (const r of whole) {
        expect(r.hourStart.getTime() % HOUR).toBe(0);
        expect(r.movingSeconds).toBeGreaterThanOrEqual(0);
        expect(r.stoppedSeconds).toBeGreaterThanOrEqual(0);
        expect(r.movingSeconds + r.stoppedSeconds).toBeLessThanOrEqual(3601);
        expect(r.distanceKm).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.distanceKm)).toBe(true);
        packets += r.packets;
      }
      expect(packets, `scenario ${String(n)} ${JSON.stringify(o)}`).toBe(pts.length);
      const elapsed = (must(pts[pts.length - 1]).at.getTime() - must(pts[0]).at.getTime()) / 1000;
      expect(covered(whole)).toBeLessThanOrEqual(elapsed + 2);
      const [first, last] = [must(pts[0]).at.getTime(), must(pts[pts.length - 1]).at.getTime()];
      if (!o.glitchAtIndices)
        expect(whole.reduce((a, r) => a + r.distanceKm, 0)).toBeLessThanOrEqual(
          truth.distanceKm(first, last) * 1.001 + 0.01
        );
      const chunk = must([1, 3, 7, 24, 100][Math.floor(rand() * 5)]);
      expect(
        await rollThroughService(pts, START, end, chunk),
        `scenario ${String(n)} chunk ${String(chunk)}`
      ).toEqual(whole);
    }
  }, 300_000);
});
