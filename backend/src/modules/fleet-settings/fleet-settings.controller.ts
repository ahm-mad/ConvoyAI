import type { Request, Response } from 'express';
import { parseOrThrow } from '../../platform/http/validate.js';
import { UpdateFleetSettingsRequestSchema } from './fleet-settings.schemas.js';
import type { FleetSettingsService } from './fleet-settings.service.js';
import type { UpdateFleetSettingsInput } from './fleet-settings.types.js';

/** Transport layer only (ARCHITECTURE.md §2): parse -> call service -> shape response. */
export class FleetSettingsController {
  constructor(private readonly service: FleetSettingsService) {}

  getSettings = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.service.getSettings());
  };

  updateSettings = async (req: Request, res: Response): Promise<void> => {
    const body = parseOrThrow(UpdateFleetSettingsRequestSchema, req.body);
    const input: UpdateFleetSettingsInput = {
      timezone: body.timezone,
      positionFreshnessMinutes: body.position_freshness_minutes,
      idleThresholdMinutes: body.idle_threshold_minutes,
      scheduledHoursPerVehiclePerDay: body.scheduled_hours_per_vehicle_per_day,
      onTimeGraceMinutes: body.on_time_grace_minutes,
      maintenanceDueSoonDays: body.maintenance_due_soon_days,
      maintenanceDueSoonKm: body.maintenance_due_soon_km,
      utilisationTargetPct: body.utilisation_target_pct,
      onTimeTargetPct: body.on_time_target_pct,
      costPerKmTarget: body.cost_per_km_target,
      idleLimitPct: body.idle_limit_pct,
      fuelEconomyTarget: body.fuel_economy_target,
      unitSystem: body.unit_system,
    };
    res.status(200).json(await this.service.updateSettings(input, body.expected_updated_at));
  };
}
