import { useSimpleQuery } from '@hooks/useSimpleQuery';
import type { UnitSystem } from '@utils/units';

export interface FleetSettings {
  timezone: string;
  /** Absent until the backend builds flows/07 U1 — treated as `metric`. */
  unit_system?: UnitSystem;
  position_freshness_minutes: number;
  idle_threshold_minutes: number;
  scheduled_hours_per_vehicle_per_day: number;
  on_time_grace_minutes: number;
  maintenance_due_soon_days: number;
  maintenance_due_soon_km: number;
  utilisation_target_pct: number | null;
  on_time_target_pct: number | null;
  cost_per_km_target: number | null;
  idle_limit_pct: number | null;
  fuel_economy_target: number | null;
  is_default: boolean;
  updated_at: string | null;
  updated_by?: number | string | null;
  updated_by_user?: { first_name?: string; last_name?: string } | null;
}

/** Company fleet settings (backend F1, flows/07 §11.3): timezone, freshness, scheduled hours, KPI targets… */
export function useFleetSettings() {
  // Query name starts with `fleet-` so fleet invalidations (and a save on the settings page) refetch it.
  const q = useSimpleQuery<any>('fleet-settings', '/api/fleet/settings', {}, { staleTime: 60_000 });
  const settings: FleetSettings | null = q.data?.success ? q.data.data : null;
  const failure = q.data && !q.data.success ? q.data : null;

  return {
    settings,
    isLoading: q.isLoading,
    /** `{ status, message }` when the request was refused (e.g. 403 without the fleet permission). */
    error: failure
      ? { status: failure.status as number | undefined, message: failure.message as string }
      : null,
    refetch: q.refetch,
  };
}

/** Today's calendar date (YYYY-MM-DD) in an IANA timezone. */
export const todayIn = (timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
  }
};
