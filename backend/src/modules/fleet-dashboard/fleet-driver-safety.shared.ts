import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type {
  IncidentReportRow,
  TripReportFilter,
  TripReportRow,
} from './fleet-dashboard.types.js';
import { MAX_REPORT_TRIPS } from './fleet-trips-report.service.js';

/** Shared by the drivers scorecard and the incidents summary (D-0193, flow 07 B8). */
export const INCIDENT_SEVERITIES = ['minor', 'moderate', 'severe'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** A guard for the in-memory pass over the period's incidents. */
export const MAX_REPORT_INCIDENTS = 200_000;

export const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/** Incidents per 100 000 km driven; `null` when there is no distance to divide by. */
export const per100kKm = (incidents: number, km: number): number | null =>
  km > 0 ? round((incidents / km) * 100_000, 1) : null;

/** `{ value, previous, delta_abs, delta_pct }` of one metric — `previous` / the deltas stay `null` without a comparison window. */
export function metricOf(
  current: Record<string, number | null>,
  previous: Record<string, number | null> | null,
  name: string
): Record<string, unknown> {
  const value = current[name] ?? null;
  const prev = previous ? (previous[name] ?? null) : null;
  const deltaAbs = value !== null && prev !== null ? round(value - prev, 2) : null;
  return {
    value,
    previous: prev,
    delta_abs: deltaAbs,
    delta_pct:
      deltaAbs !== null && prev !== null && prev !== 0
        ? round((deltaAbs / Math.abs(prev)) * 100, 1)
        : null,
  };
}

/** The trips of a window, refusing a range too big for the in-memory pass (the trips report's guard). */
export async function fetchTrips(
  repo: FleetDashboardRepository,
  from: Date,
  to: Date,
  filter: TripReportFilter
): Promise<TripReportRow[]> {
  const count = await repo.countTripsForReport(from, to, filter);
  if (count > MAX_REPORT_TRIPS) {
    throw new ValidationError(
      `This range has ${String(count)} trips; at most ${String(MAX_REPORT_TRIPS)} can be analysed — narrow the range or add a filter.`
    );
  }
  return repo.tripsForReport(from, to, filter);
}

/** The incidents of a window (LOCAL calendar dates of the range), refusing a range too big for the in-memory pass. */
export async function fetchIncidents(
  repo: FleetDashboardRepository,
  from: Date,
  to: Date,
  tz: string,
  filter: { driverIds?: string[] | undefined; vehicleIds?: string[] | undefined }
): Promise<IncidentReportRow[]> {
  const count = await repo.countIncidentsForReport(from, to, tz, filter);
  if (count > MAX_REPORT_INCIDENTS) {
    throw new ValidationError(
      `This range has ${String(count)} incidents; at most ${String(MAX_REPORT_INCIDENTS)} can be analysed — narrow the range or add a filter.`
    );
  }
  return repo.incidentsForReport(from, to, tz, filter);
}

/** `YYYY-MM-DD` of an incident date (a DATE column read as a UTC-midnight `Date`). */
export const incidentDateString = (date: Date): string => date.toISOString().slice(0, 10);
