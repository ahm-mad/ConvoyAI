import type { Worker } from 'bullmq';
import { logger } from '../../platform/logging/logger.js';
import { runWithContextAsync } from '../../platform/http/request-context.js';
import { createWorker } from '../../platform/queue/queue-factory.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type {
  DeviceAssignmentSpan,
  FleetTelemetryRepository,
} from './fleet-telemetry.repository.js';
import {
  GAP_CONTEXT_PACKETS,
  floorToUtcHour,
  maxGapSecondsFor,
  rollupHours,
  type HourStat,
  type RollupPoint,
} from './telemetry-rollup.js';

export const FLEET_TELEMETRY_JOB = 'fleet-telemetry-rollup';
const HOUR_MS = 3_600_000;
/** A run recomputes this many hours behind each vehicle's newest stored hour (late packets, the still-open hour). */
export const ROLLUP_OVERLAP_HOURS = 2;
/** One vehicle is rolled up in windows of this many days (bounds memory on a long backfill). */
export const ROLLUP_CHUNK_DAYS = 7;
/** A job run stops starting new work after this long; the next run continues from each vehicle's watermark. */
export const ROLLUP_TIME_BUDGET_MS = 4 * 60_000;

/**
 * The scheduled hourly telemetry rollup (D-0194, flow 07 ask D1): every 15 minutes (`main.scheduler.ts`) the worker rolls each fleet company's GPS packets
 * (`device_positions`) up into `vehicle_hourly_stats`, one row per vehicle per UTC hour, attributing every packet to the vehicle its device was assigned to
 * at that moment. Each vehicle continues from its own newest stored hour (minus a small overlap), or from its first packet on a first run — so the first run
 * IS the backfill, in 7-day windows under a time budget. Re-computing an hour replaces its row, so the job is idempotent. A vehicle whose devices have sent
 * nothing since its newest stored packet is skipped after ONE grouped query for the whole company — so a fleet of hourly trackers costs almost nothing on
 * the runs in between, and the 15-minute schedule only keeps the report fresh. One vehicle or company failing never stops the others.
 */
export class FleetTelemetryRollupService {
  constructor(
    private readonly dashboardRepo: FleetDashboardRepository,
    private readonly repo: FleetTelemetryRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  async runAll(
    now = new Date(),
    budgetMs = ROLLUP_TIME_BUDGET_MS
  ): Promise<{ companies: number; vehicles: number; hours: number }> {
    const deadline = Date.now() + budgetMs;
    const companyIds = await this.dashboardRepo.companyIdsWithVehicles();
    let vehicles = 0;
    let hours = 0;
    for (const companyId of companyIds) {
      if (Date.now() > deadline) break;
      try {
        const result = await runWithContextAsync(
          {
            userId: 'fleet-telemetry',
            companyId,
            roles: [],
            perms: [],
            jti: 'fleet-telemetry',
            exp: Number.MAX_SAFE_INTEGER,
          },
          () => this.runCompany(now, deadline)
        );
        vehicles += result.vehicles;
        hours += result.hours;
      } catch (err) {
        logger.warn({ err, companyId }, 'fleet telemetry rollup failed for one company — skipped');
      }
    }
    return { companies: companyIds.length, vehicles, hours };
  }

  /** Rolls up every vehicle of the calling company (needs the request context) up to the end of the current hour. */
  async runCompany(
    now: Date,
    deadline = Number.MAX_SAFE_INTEGER
  ): Promise<{ vehicles: number; hours: number }> {
    const settings = await this.settingsLookup.effectiveSettings();
    const fallbackGapSeconds = maxGapSecondsFor(settings.positionFreshnessMinutes);
    const end = new Date(floorToUtcHour(now).getTime() + HOUR_MS);
    const [assignments, watermarks] = await Promise.all([
      this.repo.allAssignments(),
      this.repo.rolledWatermarks(),
    ]);
    const newest = await this.repo.newestPositionAt([...new Set(assignments.map(a => a.deviceId))]);
    const byVehicle = new Map<string, DeviceAssignmentSpan[]>();
    for (const a of assignments) {
      const list = byVehicle.get(a.vehicleId);
      if (list) list.push(a);
      else byVehicle.set(a.vehicleId, [a]);
    }
    let vehicles = 0;
    let hours = 0;
    for (const [vehicleId, spans] of byVehicle) {
      if (Date.now() > deadline) break;
      const watermark = watermarks.get(vehicleId);
      if (watermark && !this.hasNews(spans, watermark, newest)) continue;
      try {
        const written = await this.rollVehicle(
          vehicleId,
          spans,
          watermark?.hourStart,
          end,
          fallbackGapSeconds,
          deadline
        );
        if (written > 0) vehicles += 1;
        hours += written;
      } catch (err) {
        logger.warn({ err, vehicleId }, 'fleet telemetry rollup failed for one vehicle — skipped');
      }
    }
    return { vehicles, hours };
  }

  /**
   * Whether a vehicle that has stored rows needs recomputing: one of its open assignments' devices has a packet newer than the newest packet already
   * stored, or an assignment ended recently enough that its tail may still be unsettled.
   */
  private hasNews(
    spans: DeviceAssignmentSpan[],
    watermark: { hourStart: Date; lastPacketAt: Date | null },
    newest: Map<string, Date>
  ): boolean {
    const settledBefore = watermark.hourStart.getTime() - ROLLUP_OVERLAP_HOURS * HOUR_MS;
    for (const span of spans) {
      if (span.unassignedAt === null) {
        const latest = newest.get(span.deviceId);
        if (latest && (watermark.lastPacketAt === null || latest > watermark.lastPacketAt))
          return true;
      } else if (span.unassignedAt.getTime() > settledBefore) return true;
    }
    return false;
  }

  private async firstPacketAt(spans: DeviceAssignmentSpan[]): Promise<Date | null> {
    let first: Date | null = null;
    for (const span of spans) {
      const p = await this.repo.positionAtOrAfter(span.deviceId, span.assignedAt);
      if (
        p &&
        (span.unassignedAt === null || p.at < span.unassignedAt) &&
        (first === null || p.at < first)
      )
        first = p.at;
    }
    return first;
  }

  /** One vehicle: from its watermark (or first packet) to `end`, window by window. Returns how many hour rows were written. */
  private async rollVehicle(
    vehicleId: string,
    spans: DeviceAssignmentSpan[],
    watermark: Date | undefined,
    end: Date,
    fallbackGapSeconds: number,
    deadline: number
  ): Promise<number> {
    let start: Date;
    if (watermark) start = new Date(watermark.getTime() - ROLLUP_OVERLAP_HOURS * HOUR_MS);
    else {
      const first = await this.firstPacketAt(spans);
      if (!first) return 0; // a device that never reported: nothing to roll up
      start = floorToUtcHour(first);
    }
    let written = 0;
    for (let from = start; from < end;) {
      if (Date.now() > deadline) break;
      const to = new Date(
        Math.min(end.getTime(), from.getTime() + ROLLUP_CHUNK_DAYS * 24 * HOUR_MS)
      );
      const rows = await this.windowRows(spans, from, to, fallbackGapSeconds);
      await this.repo.replaceHours(vehicleId, from, to, rows);
      written += rows.length;
      from = to;
    }
    return written;
  }

  /** The hour rows of one vehicle for `[from, to)`: each assignment separately (its device's packets inside its span), overlapping devices resolved by the better-covered hour. */
  async windowRows(
    spans: DeviceAssignmentSpan[],
    from: Date,
    to: Date,
    fallbackGapSeconds: number
  ): Promise<HourStat[]> {
    const merged = new Map<number, HourStat>();
    for (const span of spans) {
      const spanFrom = new Date(Math.max(from.getTime(), span.assignedAt.getTime()));
      const spanTo = new Date(
        Math.min(to.getTime(), span.unassignedAt ? span.unassignedAt.getTime() : to.getTime())
      );
      if (spanFrom >= spanTo) continue;
      const points: RollupPoint[] = [];
      // context before the window: it closes an interval that crosses the window start and tells that interval's neighbours' cadence — but only packets of this assignment
      if (spanFrom.getTime() > span.assignedAt.getTime()) {
        const before = await this.repo.positionsBefore(
          span.deviceId,
          spanFrom,
          GAP_CONTEXT_PACKETS
        );
        points.push(...before.filter(p => p.at >= span.assignedAt));
      }
      points.push(...(await this.repo.positionsBetween(span.deviceId, spanFrom, spanTo)));
      // context after the window (only when the assignment continues past it)
      if (span.unassignedAt === null || span.unassignedAt > to) {
        const after = await this.repo.positionsAtOrAfter(span.deviceId, to, GAP_CONTEXT_PACKETS);
        points.push(...after.filter(p => span.unassignedAt === null || p.at < span.unassignedAt));
      }
      for (const stat of rollupHours(points, { from, to, fallbackGapSeconds })) {
        const key = stat.hourStart.getTime();
        const current = merged.get(key);
        const coverage = (s: HourStat) => s.movingSeconds + s.stoppedSeconds;
        if (
          !current ||
          coverage(stat) > coverage(current) ||
          (coverage(stat) === coverage(current) && stat.packets > current.packets)
        )
          merged.set(key, stat);
      }
    }
    return [...merged.values()].sort((a, b) => a.hourStart.getTime() - b.hourStart.getTime());
  }
}

/** The `"fleet-telemetry"` queue worker; the repeatable job is registered by `main.scheduler.ts`. */
export function registerFleetTelemetryWorker(service: FleetTelemetryRollupService): Worker {
  return createWorker('fleet-telemetry', async () => {
    const result = await service.runAll();
    logger.info(result, 'fleet telemetry rollup finished');
  });
}
