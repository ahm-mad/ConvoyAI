import { ForbiddenError } from '../../platform/errors/app-error.js';
import { auditFields, loadActors, type ActorDirectory } from '../../platform/http/actors.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import {
  computeScheduleDue,
  dueStatusSeverity,
  type DueStatus,
} from '../../shared/utils/maintenance-due.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type { FleetMaintenanceDueRepository } from './fleet-maintenance-due.repository.js';
import type { DueRow, ScheduleListQuery } from './fleet-maintenance-due.types.js';

type Json = Record<string, unknown>;

const STATUSES: DueStatus[] = ['overdue', 'due_soon', 'ok', 'unknown'];

const EXPORT_COLUMNS: CsvColumn<DueRow>[] = [
  { header: 'id', value: r => r.id },
  { header: 'vehicle_id', value: r => r.vehicleId },
  { header: 'vehicle_name', value: r => r.vehicle.name },
  { header: 'plate', value: r => r.vehicle.plate },
  { header: 'service_type', value: r => r.serviceType },
  { header: 'status', value: r => r.due.status },
  { header: 'due_by', value: r => r.due.dueBy },
  { header: 'next_due_date', value: r => r.due.nextDueDate },
  { header: 'days_until_due', value: r => r.due.daysUntilDue },
  { header: 'next_due_odometer_km', value: r => r.due.nextDueOdometerKm },
  { header: 'km_until_due', value: r => r.due.kmUntilDue },
  { header: 'vehicle_odometer_km', value: r => r.vehicle.odometerKm },
  { header: 'interval_days', value: r => r.intervalDays },
  { header: 'interval_km', value: r => r.intervalKm },
  { header: 'last_service_date', value: r => r.lastServiceDate },
  { header: 'last_service_odometer_km', value: r => r.lastServiceOdometerKm },
];

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/** Business logic for module 4.10 (D-0184, flow 07 ask C1) — a read-only view over the schedules the fleet-fuel-maintenance module already owns. */
export class FleetMaintenanceDueService {
  constructor(
    private readonly repo: FleetMaintenanceDueRepository,
    private readonly settingsLookup: FleetSettingsLookup,
    private readonly usersLookup: ActorDirectory
  ) {}

  /** The filtered + computed rows (`status` filter NOT applied — the chips' counts need the rest) with the company's due-soon window. */
  private async computeRows(
    query: ScheduleListQuery,
    now: Date
  ): Promise<{ rows: DueRow[]; window: { days: number; km: number } }> {
    const settings = await this.settingsLookup.effectiveSettings();
    const window = { days: settings.maintenanceDueSoonDays, km: settings.maintenanceDueSoonKm };
    const all = await this.repo.listSchedulesForCompany(query.includeInactive === true);
    const term = query.search?.toLowerCase();
    const type = query.serviceType?.toLowerCase();
    const category = query.vehicleCategory?.toLowerCase();
    const rows: DueRow[] = [];
    for (const schedule of all) {
      if (query.vehicleIds && !query.vehicleIds.includes(schedule.vehicleId)) continue;
      if (type && schedule.serviceType.toLowerCase() !== type) continue;
      if (category && (schedule.vehicle.category ?? '').toLowerCase() !== category) continue;
      if (
        term &&
        !(
          schedule.serviceType.toLowerCase().includes(term) ||
          schedule.vehicle.name.toLowerCase().includes(term) ||
          (schedule.vehicle.plate ?? '').toLowerCase().includes(term)
        )
      )
        continue;
      const due = computeScheduleDue(schedule, schedule.vehicle.odometerKm, window, now);
      if (
        query.dueBefore &&
        (due.nextDueDate === null || due.nextDueDate.getTime() > query.dueBefore.getTime())
      )
        continue;
      rows.push({ ...schedule, due });
    }
    return { rows, window };
  }

  private sorted(rows: DueRow[], query: ScheduleListQuery): DueRow[] {
    const field = query.sortBy ?? 'next_due_date';
    const sign = query.sortOrder === 'desc' ? -1 : 1;
    const key = (row: DueRow): number | string | null => {
      switch (field) {
        case 'next_due_date':
          return row.due.nextDueDate ? row.due.nextDueDate.getTime() : null;
        case 'status':
          return dueStatusSeverity(row.due.status);
        case 'vehicle_name':
          return row.vehicle.name.toLowerCase();
        case 'service_type':
          return row.serviceType.toLowerCase();
        case 'last_service_date':
          return row.lastServiceDate ? row.lastServiceDate.getTime() : null;
        case 'days_until_due':
          return row.due.daysUntilDue;
        case 'km_until_due':
          return row.due.kmUntilDue;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null) return Number(BigInt(a.id) - BigInt(b.id));
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0 ? cmp * sign : Number(BigInt(a.id) - BigInt(b.id)) * sign;
    });
  }

  private item(row: DueRow, actors: Awaited<ReturnType<typeof loadActors>>): Json {
    return {
      id: row.id,
      vehicle_id: row.vehicleId,
      vehicle: {
        id: row.vehicle.id,
        name: row.vehicle.name,
        plate: row.vehicle.plate,
        vehicle_category: row.vehicle.category,
        odometer_km: row.vehicle.odometerKm,
      },
      service_type: row.serviceType,
      interval_days: row.intervalDays,
      interval_km: row.intervalKm,
      last_service_date: row.lastServiceDate,
      last_service_odometer_km: row.lastServiceOdometerKm,
      odometer_baseline_km: row.odometerBaselineKm,
      odometer_baseline_date: row.odometerBaselineDate,
      next_due_date: row.due.nextDueDate,
      next_due_odometer_km: row.due.nextDueOdometerKm,
      days_until_due: row.due.daysUntilDue,
      km_until_due: row.due.kmUntilDue,
      status: row.due.status,
      due_by: row.due.dueBy,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      ...auditFields(actors, row.createdBy, row.updatedBy),
    };
  }

  /** `GET /maintenance-schedules` — always paged; `meta.counts` = per-status counts of the filtered set WITHOUT the `status` filter (chips never zero each other). */
  async list(query: ScheduleListQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const { rows, window } = await this.computeRows(query, now);
    const counts: Record<DueStatus | 'total', number> = {
      total: rows.length,
      overdue: 0,
      due_soon: 0,
      ok: 0,
      unknown: 0,
    };
    for (const row of rows) counts[row.due.status] += 1;
    const wanted = query.statuses;
    const matching = wanted ? rows.filter(row => wanted.includes(row.due.status)) : rows;
    const ordered = this.sorted(matching, query);
    const paging = query.window ?? { page: 1, perPage: 20 };
    const pageRows = ordered.slice(
      (paging.page - 1) * paging.perPage,
      paging.page * paging.perPage
    );
    const actors = await loadActors(
      this.usersLookup,
      pageRows.flatMap(row => [row.createdBy, row.updatedBy])
    );
    return {
      success: true,
      message: 'Maintenance schedules retrieved successfully.',
      data: {
        items: pageRows.map(row => this.item(row, actors)),
        pagination: buildPagination(matching.length, paging),
      },
      meta: {
        counts,
        due_soon_days: window.days,
        due_soon_km: window.km,
        generated_at: now.toISOString(),
      },
    };
  }

  /** D-0191 (B7): the computed due state of every schedule of the vehicles in scope (vehicles in service; `undefined` = the whole company) — the maintenance report's point-in-time buckets (interface-typed lookup, CONVENTIONS.md "Modules"). */
  async dueStatesFor(
    vehicleIds: string[] | undefined,
    now = new Date()
  ): Promise<
    { scheduleId: string; vehicleId: string; status: DueStatus; daysUntilDue: number | null }[]
  > {
    requireCompany();
    const { rows } = await this.computeRows({ vehicleIds }, now);
    return rows.map(row => ({
      scheduleId: row.id,
      vehicleId: row.vehicleId,
      status: row.due.status,
      daysUntilDue: row.due.daysUntilDue,
    }));
  }

  /** D-0185 (B2): the overdue / due-soon schedules of vehicles in service — what the attention feed lists (`fleet-attention` reads this through a lookup interface). */
  async attentionSchedules(now = new Date()): Promise<
    {
      id: string;
      vehicleId: string;
      vehicleName: string;
      serviceType: string;
      status: 'overdue' | 'due_soon';
      nextDueDate: Date | null;
    }[]
  > {
    requireCompany();
    const { rows } = await this.computeRows({}, now);
    const out: {
      id: string;
      vehicleId: string;
      vehicleName: string;
      serviceType: string;
      status: 'overdue' | 'due_soon';
      nextDueDate: Date | null;
    }[] = [];
    for (const row of rows) {
      if (row.due.status === 'overdue' || row.due.status === 'due_soon') {
        out.push({
          id: row.id,
          vehicleId: row.vehicleId,
          vehicleName: row.vehicle.name,
          serviceType: row.serviceType,
          status: row.due.status,
          nextDueDate: row.due.nextDueDate,
        });
      }
    }
    return out;
  }

  /** `GET /maintenance-schedules/export` — the list's own filters / sort, every matching row as CSV. */
  async exportRows(query: Omit<ScheduleListQuery, 'window'>, now = new Date()) {
    requireCompany();
    const { rows } = await this.computeRows(query, now);
    const wanted = query.statuses;
    const ordered = this.sorted(
      wanted ? rows.filter(row => wanted.includes(row.due.status)) : rows,
      query
    );
    return planExport('maintenance-schedules', EXPORT_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}

export { STATUSES as DUE_STATUSES };
