import type { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../platform/db/tenant-scoping.js';
import {
  UNIT_SYSTEMS,
  type StoredFleetSettings,
  type UnitSystem,
  type UpdateFleetSettingsInput,
} from './fleet-settings.types.js';

type Row = Prisma.fleet_settingsGetPayload<Record<string, never>>;

const num = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : Number(value);

/** The column is CHECK-constrained to the three presets (manual migration 010); anything else can only come from a hand edit, so it reads as the default. */
function toUnitSystem(value: string): UnitSystem {
  return (UNIT_SYSTEMS as readonly string[]).includes(value) ? (value as UnitSystem) : 'metric';
}

function toStored(row: Row): StoredFleetSettings {
  return {
    id: row.id.toString(),
    timezone: row.timezone,
    positionFreshnessMinutes: row.position_freshness_minutes,
    idleThresholdMinutes: row.idle_threshold_minutes,
    scheduledHoursPerVehiclePerDay: Number(row.scheduled_hours_per_vehicle_per_day),
    onTimeGraceMinutes: row.on_time_grace_minutes,
    maintenanceDueSoonDays: row.maintenance_due_soon_days,
    maintenanceDueSoonKm: row.maintenance_due_soon_km,
    utilisationTargetPct: num(row.utilisation_target_pct),
    onTimeTargetPct: num(row.on_time_target_pct),
    costPerKmTarget: num(row.cost_per_km_target),
    idleLimitPct: num(row.idle_limit_pct),
    fuelEconomyTarget: num(row.fuel_economy_target),
    unitSystem: toUnitSystem(row.unit_system),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by === null ? null : row.updated_by.toString(),
  };
}

function toData(input: UpdateFleetSettingsInput): Prisma.fleet_settingsUpdateInput {
  return {
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.positionFreshnessMinutes !== undefined
      ? { position_freshness_minutes: input.positionFreshnessMinutes }
      : {}),
    ...(input.idleThresholdMinutes !== undefined
      ? { idle_threshold_minutes: input.idleThresholdMinutes }
      : {}),
    ...(input.scheduledHoursPerVehiclePerDay !== undefined
      ? { scheduled_hours_per_vehicle_per_day: input.scheduledHoursPerVehiclePerDay }
      : {}),
    ...(input.onTimeGraceMinutes !== undefined
      ? { on_time_grace_minutes: input.onTimeGraceMinutes }
      : {}),
    ...(input.maintenanceDueSoonDays !== undefined
      ? { maintenance_due_soon_days: input.maintenanceDueSoonDays }
      : {}),
    ...(input.maintenanceDueSoonKm !== undefined
      ? { maintenance_due_soon_km: input.maintenanceDueSoonKm }
      : {}),
    ...(input.utilisationTargetPct !== undefined
      ? { utilisation_target_pct: input.utilisationTargetPct }
      : {}),
    ...(input.onTimeTargetPct !== undefined ? { on_time_target_pct: input.onTimeTargetPct } : {}),
    ...(input.costPerKmTarget !== undefined ? { cost_per_km_target: input.costPerKmTarget } : {}),
    ...(input.idleLimitPct !== undefined ? { idle_limit_pct: input.idleLimitPct } : {}),
    ...(input.fuelEconomyTarget !== undefined
      ? { fuel_economy_target: input.fuelEconomyTarget }
      : {}),
    ...(input.unitSystem !== undefined ? { unit_system: input.unitSystem } : {}),
  };
}

/** All Prisma access for module 4.9. `fleet_settings` is `company`-ruled (tenant-rules.ts) — the row is found / created for the caller's company by the scoping extension. */
export class FleetSettingsRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async find(): Promise<StoredFleetSettings | undefined> {
    const row = await this.prisma.fleet_settings.findFirst({});
    return row ? toStored(row) : undefined;
  }

  /** Update the company's row, or create it (`company_id` is overwritten by the tenant-scoping extension — D-0077 precedent). */
  async upsert(input: UpdateFleetSettingsInput): Promise<StoredFleetSettings> {
    const existing = await this.prisma.fleet_settings.findFirst({ select: { id: true } });
    if (existing) {
      const row = await this.prisma.fleet_settings.update({
        where: { id: existing.id },
        data: toData(input),
      });
      return toStored(row);
    }
    const row = await this.prisma.fleet_settings.create({
      data: { ...(toData(input) as Prisma.fleet_settingsUncheckedCreateInput), company_id: 0n },
    });
    return toStored(row);
  }
}
