import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { HourStat, RollupPoint } from './telemetry-rollup.js';

/** A device's stint on a vehicle: the packets of `deviceId` inside `[assignedAt, unassignedAt)` belong to `vehicleId`. */
export interface DeviceAssignmentSpan {
  vehicleId: string;
  deviceId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
}

/** One stored hour of one vehicle (numbers, not Decimals). */
export interface HourlyStatRow {
  vehicleId: string;
  hourStart: Date;
  packets: number;
  distanceKm: number;
  movingSeconds: number;
  stoppedSeconds: number;
  maxSpeedKmh: number | null;
  firstPacketAt: Date | null;
  lastPacketAt: Date | null;
}

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

function requireCompanyId(): string {
  const context = getRequestContext();
  if (!context?.companyId)
    throw new Error('fleet-telemetry repository called with no company in context.');
  return context.companyId;
}

/**
 * All Prisma access for the hourly telemetry rollup (D-0194, flow 07 D1) and its reports. `vehicle_hourly_stats` is `company`-ruled (scoped by the tenant
 * extension, which also fills `company_id` on create); `vehicle_device_assignments` and `device_positions` are `parent`-ruled — assignments are joined
 * through `vehicles.company_id` by hand, and positions are only ever read for device ids that came out of those company-scoped assignments.
 */
export class FleetTelemetryRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  // ===========================================================================
  // The rollup job
  // ===========================================================================

  /** Every device ↔ vehicle assignment of the company (open-ended ones have `unassignedAt: null`). */
  async allAssignments(): Promise<DeviceAssignmentSpan[]> {
    const rows = await this.prisma.vehicle_device_assignments.findMany({
      where: { vehicles: { company_id: BigInt(requireCompanyId()) } },
      select: { vehicle_id: true, device_id: true, assigned_at: true, unassigned_at: true },
      orderBy: { id: 'asc' },
    });
    return rows.map(r => ({
      vehicleId: r.vehicle_id.toString(),
      deviceId: r.device_id.toString(),
      assignedAt: r.assigned_at,
      unassignedAt: r.unassigned_at,
    }));
  }

  /** Per vehicle: its newest rolled-up hour (the watermark the job continues from) and the newest packet time already stored in its rows. */
  async rolledWatermarks(): Promise<Map<string, { hourStart: Date; lastPacketAt: Date | null }>> {
    const rows = await this.prisma.vehicle_hourly_stats.groupBy({
      by: ['vehicle_id'],
      _max: { hour_start: true, last_packet_at: true },
    });
    const out = new Map<string, { hourStart: Date; lastPacketAt: Date | null }>();
    for (const row of rows)
      if (row._max.hour_start)
        out.set(row.vehicle_id.toString(), {
          hourStart: row._max.hour_start,
          lastPacketAt: row._max.last_packet_at,
        });
    return out;
  }

  /** The newest packet time of each of these devices (one grouped query) — how the job tells that nothing new arrived. Only for device ids that came out of company-scoped assignments. */
  async newestPositionAt(deviceIds: string[]): Promise<Map<string, Date>> {
    if (deviceIds.length === 0) return new Map();
    const rows = await this.prisma.device_positions.groupBy({
      by: ['device_id'],
      where: { device_id: { in: deviceIds.map(d => BigInt(d)) } },
      _max: { recorded_at: true },
    });
    const out = new Map<string, Date>();
    for (const row of rows)
      if (row._max.recorded_at) out.set(row.device_id.toString(), row._max.recorded_at);
    return out;
  }

  /** The newest hour already rolled up for the company. */
  async latestRolledHour(): Promise<Date | null> {
    const agg = await this.prisma.vehicle_hourly_stats.aggregate({ _max: { hour_start: true } });
    return agg._max.hour_start;
  }

  private toPoint(r: {
    latitude: unknown;
    longitude: unknown;
    speed: unknown;
    recorded_at: Date;
  }): RollupPoint {
    return {
      at: r.recorded_at,
      latitude: num(r.latitude),
      longitude: num(r.longitude),
      speed: r.speed === null ? null : num(r.speed),
    };
  }

  /** A device's packets with `from <= recorded_at < to`, oldest first. */
  async positionsBetween(deviceId: string, from: Date, to: Date): Promise<RollupPoint[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId), recorded_at: { gte: from, lt: to } },
      select: { latitude: true, longitude: true, speed: true, recorded_at: true },
      orderBy: [{ recorded_at: 'asc' }, { id: 'asc' }],
    });
    return rows.map(r => this.toPoint(r));
  }

  /** The last `limit` packets of a device strictly before `before`, oldest first (the context that closes an interval starting before a window and tells its neighbours' cadence). */
  async positionsBefore(deviceId: string, before: Date, limit: number): Promise<RollupPoint[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId), recorded_at: { lt: before } },
      select: { latitude: true, longitude: true, speed: true, recorded_at: true },
      orderBy: [{ recorded_at: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.reverse().map(r => this.toPoint(r));
  }

  /** The first `limit` packets of a device at or after `at`, oldest first (the context after a window). */
  async positionsAtOrAfter(deviceId: string, at: Date, limit: number): Promise<RollupPoint[]> {
    const rows = await this.prisma.device_positions.findMany({
      where: { device_id: BigInt(deviceId), recorded_at: { gte: at } },
      select: { latitude: true, longitude: true, speed: true, recorded_at: true },
      orderBy: [{ recorded_at: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(r => this.toPoint(r));
  }

  /** The first packet of a device at or after `at` (closes an interval that ends after a window). */
  async positionAtOrAfter(deviceId: string, at: Date): Promise<RollupPoint | null> {
    const row = await this.prisma.device_positions.findFirst({
      where: { device_id: BigInt(deviceId), recorded_at: { gte: at } },
      select: { latitude: true, longitude: true, speed: true, recorded_at: true },
      orderBy: [{ recorded_at: 'asc' }, { id: 'asc' }],
    });
    return row ? this.toPoint(row) : null;
  }

  /** Replaces one vehicle's rows for the hours `[from, to)` with `rows` (idempotent: re-running with the same input leaves the same table). */
  async replaceHours(vehicleId: string, from: Date, to: Date, rows: HourStat[]): Promise<void> {
    const id = BigInt(vehicleId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.vehicle_hourly_stats.deleteMany({
        where: { vehicle_id: id, hour_start: { gte: from, lt: to } },
      }),
      ...(rows.length === 0
        ? []
        : [
            this.prisma.vehicle_hourly_stats.createMany({
              data: rows.map((r): Prisma.vehicle_hourly_statsCreateManyInput => ({
                vehicle_id: id,
                // filled by the tenant extension (forced to the caller's company); typed as required by the generated input
                company_id: BigInt(requireCompanyId()),
                hour_start: r.hourStart,
                packets: r.packets,
                distance_km: r.distanceKm,
                moving_seconds: r.movingSeconds,
                stopped_seconds: r.stoppedSeconds,
                max_speed_kmh: r.maxSpeedKmh,
                first_packet_at: r.firstPacketAt,
                last_packet_at: r.lastPacketAt,
                created_at: now,
                updated_at: now,
              })),
            }),
          ]),
    ]);
  }

  // ===========================================================================
  // Reads for the reports
  // ===========================================================================

  private hoursWhere(
    from: Date,
    to: Date,
    vehicleIds: string[] | undefined
  ): Prisma.vehicle_hourly_statsWhereInput {
    return {
      hour_start: { gte: from, lt: to },
      ...(vehicleIds ? { vehicle_id: { in: vehicleIds.map(v => BigInt(v)) } } : {}),
    };
  }

  async countHourStats(from: Date, to: Date, vehicleIds?: string[]): Promise<number> {
    return this.prisma.vehicle_hourly_stats.count({ where: this.hoursWhere(from, to, vehicleIds) });
  }

  /** The stored hours with `from <= hour_start < to`, oldest first. */
  async hourStats(from: Date, to: Date, vehicleIds?: string[]): Promise<HourlyStatRow[]> {
    const rows = await this.prisma.vehicle_hourly_stats.findMany({
      where: this.hoursWhere(from, to, vehicleIds),
      orderBy: [{ hour_start: 'asc' }, { vehicle_id: 'asc' }],
    });
    return rows.map(r => ({
      vehicleId: r.vehicle_id.toString(),
      hourStart: r.hour_start,
      packets: r.packets,
      distanceKm: num(r.distance_km),
      movingSeconds: r.moving_seconds,
      stoppedSeconds: r.stopped_seconds,
      maxSpeedKmh: r.max_speed_kmh === null ? null : num(r.max_speed_kmh),
      firstPacketAt: r.first_packet_at,
      lastPacketAt: r.last_packet_at,
    }));
  }
}
