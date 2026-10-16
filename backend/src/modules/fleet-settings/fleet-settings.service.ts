import { ForbiddenError } from '../../platform/errors/app-error.js';
import { auditFields, loadActors, type ActorDirectory } from '../../platform/http/actors.js';
import { assertNotStale } from '../../platform/http/concurrency.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { FleetSettingsRepository } from './fleet-settings.repository.js';
import {
  DEFAULT_FLEET_SETTINGS,
  type FleetSettings,
  type FleetSettingsLookup,
  type StoredFleetSettings,
  type UpdateFleetSettingsInput,
} from './fleet-settings.types.js';

type Json = Record<string, unknown>;

function requireCompany(): void {
  const context = getRequestContext();
  if (!context?.companyId) throw new ForbiddenError('Unauthorized action.');
}

function settingsJson(settings: FleetSettings): Json {
  return {
    timezone: settings.timezone,
    position_freshness_minutes: settings.positionFreshnessMinutes,
    idle_threshold_minutes: settings.idleThresholdMinutes,
    scheduled_hours_per_vehicle_per_day: settings.scheduledHoursPerVehiclePerDay,
    on_time_grace_minutes: settings.onTimeGraceMinutes,
    maintenance_due_soon_days: settings.maintenanceDueSoonDays,
    maintenance_due_soon_km: settings.maintenanceDueSoonKm,
    utilisation_target_pct: settings.utilisationTargetPct,
    on_time_target_pct: settings.onTimeTargetPct,
    cost_per_km_target: settings.costPerKmTarget,
    idle_limit_pct: settings.idleLimitPct,
    fuel_economy_target: settings.fuelEconomyTarget,
    unit_system: settings.unitSystem,
  };
}

/** Business logic for module 4.9 (D-0183, flow 07 ask F1). Also the `FleetSettingsLookup` the dashboards / positions read. */
export class FleetSettingsService implements FleetSettingsLookup {
  constructor(
    private readonly repo: FleetSettingsRepository,
    private readonly usersLookup: ActorDirectory
  ) {}

  async effectiveSettings(): Promise<FleetSettings> {
    return (await this.repo.find()) ?? { ...DEFAULT_FLEET_SETTINGS };
  }

  private async response(stored: StoredFleetSettings | undefined, message: string): Promise<Json> {
    if (!stored) {
      return {
        success: true,
        message,
        data: {
          ...settingsJson(DEFAULT_FLEET_SETTINGS),
          is_default: true,
          created_at: null,
          updated_at: null,
          updated_by: null,
          updated_by_user: null,
        },
      };
    }
    const actors = await loadActors(this.usersLookup, [stored.updatedBy]);
    const audit = auditFields(actors, null, stored.updatedBy);
    return {
      success: true,
      message,
      data: {
        ...settingsJson(stored),
        is_default: false,
        created_at: stored.createdAt,
        updated_at: stored.updatedAt,
        updated_by: audit.updated_by,
        updated_by_user: audit.updated_by_user,
      },
    };
  }

  /** `GET /fleet/settings` — the company's settings, or the defaults (`is_default: true`, no row yet). */
  async getSettings(): Promise<Json> {
    requireCompany();
    return this.response(await this.repo.find(), 'Fleet settings retrieved successfully.');
  }

  /** `PUT /fleet/settings` — partial update (creates the row on first save); optional `expected_updated_at` (D-0176): a stale value → 409, nothing written. */
  async updateSettings(
    input: UpdateFleetSettingsInput,
    expectedUpdatedAt: Date | null | undefined
  ): Promise<Json> {
    requireCompany();
    const current = await this.repo.find();
    await assertNotStale(
      expectedUpdatedAt,
      {
        id: current?.id ?? '0',
        updatedAt: current?.updatedAt ?? null,
        updatedBy: current?.updatedBy ?? null,
      },
      this.usersLookup
    );
    return this.response(await this.repo.upsert(input), 'Fleet settings updated successfully.');
  }
}
