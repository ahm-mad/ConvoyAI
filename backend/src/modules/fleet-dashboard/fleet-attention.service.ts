import { ForbiddenError } from '../../platform/errors/app-error.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { addLocalDays, localDateOf } from '../../platform/time/zoned.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type { FleetDashboardVehiclesLookup } from './fleet-dashboard.types.js';

/**
 * The attention feed (D-0185, flow 07 ask B2): ONE merged, severity-ordered worklist of everything in the fleet that needs a person —
 * built server-side from the sources the fleet already has. Nothing is stored; every request recomputes it.
 */
export type AttentionSeverity = 'critical' | 'warning' | 'info';

export const ATTENTION_TYPES = [
  'alarm',
  'maintenance_overdue',
  'maintenance_due_soon',
  'document_expired',
  'document_expiring',
  'licence_expired',
  'licence_expiring',
  'vehicle_offline',
  'incident_severe',
  'trip_at_risk',
  'yard_long_stay',
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];

/** Severity of each type — expired legal documents are critical, overdue work and the like are warnings, "coming up" is info. Alarms keep their own severity. */
const SEVERITY: Record<Exclude<AttentionType, 'alarm'>, AttentionSeverity> = {
  maintenance_overdue: 'warning',
  maintenance_due_soon: 'info',
  document_expired: 'critical',
  document_expiring: 'warning',
  licence_expired: 'critical',
  licence_expiring: 'warning',
  vehicle_offline: 'warning',
  incident_severe: 'warning',
  trip_at_risk: 'warning',
  yard_long_stay: 'info',
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

export interface AttentionItem {
  id: string;
  type: AttentionType;
  severity: AttentionSeverity;
  title: string;
  entity: { type: 'vehicle' | 'driver' | 'trip'; id: string; name: string };
  since: Date | null;
  /** A verb key the UI maps to a button / link (`review_alarm`, `schedule_service`, `renew_document`, `check_tracker`, `review_incident`, `fix_trip`, `check_out_vehicle`, `renew_licence`). */
  action: string;
}

export interface AttentionListQuery {
  severities?: AttentionSeverity[] | undefined;
  types?: AttentionType[] | undefined;
  /** An open yard stay longer than this many days is listed (default 7). */
  yardDays?: number | undefined;
  window?: ListWindow | undefined;
}

/** Overdue / due-soon schedules of vehicles in service — implemented by `FleetMaintenanceDueService` (interface-typed, CONVENTIONS.md "Modules"). */
export interface AttentionMaintenanceLookup {
  attentionSchedules(now: Date): Promise<
    {
      id: string;
      vehicleId: string;
      vehicleName: string;
      serviceType: string;
      status: 'overdue' | 'due_soon';
      nextDueDate: Date | null;
    }[]
  >;
}

/** Constants of the feed's rules (documented in the contract). */
export const ATTENTION_RULES = {
  expiryWindowDays: 30,
  offlineHours: 24,
  incidentDays: 7,
  tripLookaheadHours: 24,
  defaultYardDays: 7,
} as const;

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

export class FleetAttentionService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly vehiclesLookup: FleetDashboardVehiclesLookup,
    private readonly settingsLookup: FleetSettingsLookup,
    private readonly maintenanceLookup: AttentionMaintenanceLookup
  ) {}

  /** Every attention item of the company (unfiltered, unsorted). */
  async collect(
    now: Date,
    yardDays: number = ATTENTION_RULES.defaultYardDays
  ): Promise<AttentionItem[]> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const today = localDateOf(now, settings.timezone);
    const items: AttentionItem[] = [];

    // 1. alarms of devices installed in a vehicle (the fleet's own alarms — same rule as `fleet_only`)
    const alarms = await this.repo.activeAlarmsWithRuleName([]);
    const vehicleByDevice = new Map<string, { id: string; name: string } | null>();
    for (const deviceId of new Set(alarms.map(alarm => alarm.deviceId))) {
      const vehicleId = await this.vehiclesLookup.currentVehicleIdForDevice(deviceId);
      vehicleByDevice.set(
        deviceId,
        vehicleId ? ((await this.vehiclesLookup.findVehicleById(vehicleId)) ?? null) : null
      );
    }
    for (const alarm of alarms) {
      const vehicle = vehicleByDevice.get(alarm.deviceId);
      if (!vehicle) continue;
      items.push({
        id: `alarm:${alarm.id}`,
        type: 'alarm',
        severity: alarm.severity,
        title: `${vehicle.name}: ${alarm.ruleName ?? 'Alert'}${alarm.state === 'acknowledged' ? ' (acknowledged)' : ''}`,
        entity: { type: 'vehicle', id: vehicle.id, name: vehicle.name },
        since: alarm.triggeredAt,
        action: 'review_alarm',
      });
    }

    // 2. maintenance
    for (const schedule of await this.maintenanceLookup.attentionSchedules(now)) {
      const overdue = schedule.status === 'overdue';
      items.push({
        id: `maintenance:${schedule.id}`,
        type: overdue ? 'maintenance_overdue' : 'maintenance_due_soon',
        severity: overdue ? SEVERITY.maintenance_overdue : SEVERITY.maintenance_due_soon,
        title: `${schedule.vehicleName}: ${schedule.serviceType} ${overdue ? 'is overdue' : 'is due soon'}`,
        entity: { type: 'vehicle', id: schedule.vehicleId, name: schedule.vehicleName },
        since: schedule.nextDueDate,
        action: 'schedule_service',
      });
    }

    // 3. compliance documents (vehicle and driver documents)
    const documents = await this.repo.complianceExpiring(ATTENTION_RULES.expiryWindowDays, now);
    const [docVehicles, docDrivers] = await Promise.all([
      this.repo.vehicleNames(
        documents
          .filter(d => d.documentableType.toLowerCase().includes('vehicle'))
          .map(d => d.documentableId)
      ),
      this.repo.driverNames(
        documents
          .filter(d => d.documentableType.toLowerCase().includes('driver'))
          .map(d => d.documentableId)
      ),
    ]);
    for (const doc of documents) {
      const isVehicle = doc.documentableType.toLowerCase().includes('vehicle');
      const name = (isVehicle ? docVehicles : docDrivers).get(doc.documentableId);
      if (name === undefined) continue; // the owner is not (or no longer) in this company
      const expired = doc.expiryDate.getTime() < Date.UTC(today.y, today.m - 1, today.d);
      const type: AttentionType = expired ? 'document_expired' : 'document_expiring';
      items.push({
        id: `document:${doc.id}`,
        type,
        severity: SEVERITY[type],
        title: `${name}: ${doc.documentType} ${expired ? 'expired' : 'expires soon'}`,
        entity: { type: isVehicle ? 'vehicle' : 'driver', id: doc.documentableId, name },
        since: doc.expiryDate,
        action: 'renew_document',
      });
    }

    // 4. driver licences
    for (const licence of await this.repo.driverLicencesExpiring(
      ATTENTION_RULES.expiryWindowDays,
      now
    )) {
      const expired = licence.expiryDate.getTime() < Date.UTC(today.y, today.m - 1, today.d);
      const type: AttentionType = expired ? 'licence_expired' : 'licence_expiring';
      items.push({
        id: `licence:${licence.id}`,
        type,
        severity: SEVERITY[type],
        title: `${licence.name}: licence ${expired ? 'expired' : 'expires soon'}`,
        entity: { type: 'driver', id: licence.id, name: licence.name },
        since: licence.expiryDate,
        action: 'renew_licence',
      });
    }

    // 5. vehicles that have a tracker but have not reported for more than 24 h (never-reported included, `since` null)
    const vehicles = await this.repo.vehiclesForCompany();
    const assignments = await this.repo.activeDeviceAssignmentsForVehicles(vehicles.map(v => v.id));
    const lastSeen = await this.repo.lastPositionTimes([...new Set(assignments.values())]);
    const offlineBefore = now.getTime() - ATTENTION_RULES.offlineHours * 3_600_000;
    for (const vehicle of vehicles) {
      const deviceId = assignments.get(vehicle.id);
      if (deviceId === undefined) continue; // no tracker: not "offline"
      const seen = lastSeen.get(deviceId);
      if (seen !== undefined && seen.getTime() >= offlineBefore) continue;
      items.push({
        id: `offline:${vehicle.id}`,
        type: 'vehicle_offline',
        severity: SEVERITY.vehicle_offline,
        title: `${vehicle.name}: tracker silent for more than ${String(ATTENTION_RULES.offlineHours)} h${seen === undefined ? ' (never reported)' : ''}`,
        entity: { type: 'vehicle', id: vehicle.id, name: vehicle.name },
        since: seen ?? null,
        action: 'check_tracker',
      });
    }

    // 6. severe incidents of the last 7 days
    const from = addLocalDays(today, -ATTENTION_RULES.incidentDays);
    const incidentSince = new Date(Date.UTC(from.y, from.m - 1, from.d));
    for (const incident of await this.repo.severeIncidentsSince(incidentSince)) {
      items.push({
        id: `incident:${incident.id}`,
        type: 'incident_severe',
        severity: SEVERITY.incident_severe,
        title: `${incident.driverName}: severe incident (${incident.incidentType})`,
        entity: { type: 'driver', id: incident.driverId, name: incident.driverName },
        since: incident.incidentDate,
        action: 'review_incident',
      });
    }

    // 7. planned trips starting within 24 h whose vehicle or driver is not available (a trip always has both; the resource can be out of service)
    const until = new Date(now.getTime() + ATTENTION_RULES.tripLookaheadHours * 3_600_000);
    for (const trip of await this.repo.plannedTripsStartingBefore(until)) {
      const vehicleOut = trip.vehicleStatus !== 'active';
      const driverOut = trip.driverStatus !== 'active';
      if (!vehicleOut && !driverOut) continue;
      const why = [
        vehicleOut
          ? `vehicle ${trip.vehicleName} is ${trip.vehicleStatus.replace('_', ' ')}`
          : null,
        driverOut ? `driver ${trip.driverName} is ${trip.driverStatus}` : null,
      ]
        .filter(Boolean)
        .join(' and ');
      const name = trip.reference ?? `Trip ${trip.id}`;
      items.push({
        id: `trip:${trip.id}`,
        type: 'trip_at_risk',
        severity: SEVERITY.trip_at_risk,
        title: `${name} starts soon but ${why}`,
        entity: { type: 'trip', id: trip.id, name },
        since: trip.plannedStartAt,
        action: 'fix_trip',
      });
    }

    // 8. vehicles that have been checked in at a yard for more than `yardDays`
    const stayBefore = new Date(now.getTime() - yardDays * 86_400_000);
    for (const stay of await this.repo.openYardStaysBefore(stayBefore)) {
      items.push({
        id: `yard:${stay.vehicleId}`,
        type: 'yard_long_stay',
        severity: SEVERITY.yard_long_stay,
        title: `${stay.vehicleName}: at ${stay.yardName} (slot ${stay.slotNumber}) for more than ${String(yardDays)} days`,
        entity: { type: 'vehicle', id: stay.vehicleId, name: stay.vehicleName },
        since: stay.checkedInAt,
        action: 'check_out_vehicle',
      });
    }

    return items;
  }

  /** Most severe first; within a severity the longest-waiting first (`since` ascending, unknown last); ties by id. */
  private order(items: AttentionItem[]): AttentionItem[] {
    return [...items].sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      const x = a.since?.getTime() ?? Number.POSITIVE_INFINITY;
      const y = b.since?.getTime() ?? Number.POSITIVE_INFINITY;
      return x !== y ? x - y : a.id.localeCompare(b.id);
    });
  }

  /** `GET /fleet/attention` — always paged; `meta.counts.by_severity` ignores the `severity` filter and `by_type` ignores the `type` filter (chips never zero each other). */
  async list(query: AttentionListQuery, now = new Date()) {
    const all = await this.collect(now, query.yardDays ?? ATTENTION_RULES.defaultYardDays);
    const byType = query.types ? all.filter(item => query.types?.includes(item.type)) : all;
    const bySeverityFiltered = query.severities
      ? all.filter(item => query.severities?.includes(item.severity))
      : all;
    const matching = byType.filter(
      item => !query.severities || query.severities.includes(item.severity)
    );
    const severityCounts = { critical: 0, warning: 0, info: 0 };
    for (const item of byType) severityCounts[item.severity] += 1;
    const typeCounts: Record<string, number> = Object.fromEntries(
      ATTENTION_TYPES.map(type => [type, 0])
    );
    for (const item of bySeverityFiltered) typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
    const ordered = this.order(matching);
    const window = query.window ?? { page: 1, perPage: 20 };
    return {
      success: true,
      message: 'Attention items retrieved successfully.',
      data: {
        items: ordered
          .slice((window.page - 1) * window.perPage, window.page * window.perPage)
          .map(item => ({ ...item })),
        pagination: buildPagination(matching.length, window),
      },
      meta: {
        counts: { total: matching.length, by_severity: severityCounts, by_type: typeCounts },
        generated_at: now.toISOString(),
        rules: ATTENTION_RULES,
      },
    };
  }

  /** The number of items that need a person now (critical + warning) — the `open_issues` KPI. */
  async openIssues(now: Date): Promise<number> {
    return (await this.collect(now)).filter(item => item.severity !== 'info').length;
  }
}
