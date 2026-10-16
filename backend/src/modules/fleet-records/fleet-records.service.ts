import { ForbiddenError } from '../../platform/errors/app-error.js';
import { auditFields, loadActors, type ActorDirectory } from '../../platform/http/actors.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { localDateOf, localDateString, type LocalDate } from '../../platform/time/zoned.js';
import { expiryStatusOf } from '../../shared/utils/expiry-buckets.js';
import { LITERS_PER_US_GALLON } from '../fleet-dashboard/fleet-dashboard.mapper.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import type { FleetRecordsRepository } from './fleet-records.repository.js';
import {
  COMPLIANCE_STATUSES,
  type ComplianceCountFilter,
  type ComplianceStatus,
  type FuelLogItem,
  type FuelLogListQuery,
  type LogVehicleBrief,
  type MaintenanceLogItem,
  type MaintenanceLogListQuery,
} from './fleet-records.types.js';

type Json = Record<string, unknown>;

const DEFAULT_WINDOW = { page: 1, perPage: 20 };

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/** A reversed range is swapped (the dashboard's own precedent, `parseDateRange`). */
function orderedRange<T extends { from?: Date | undefined; to?: Date | undefined }>(query: T): T {
  return query.from && query.to && query.from.getTime() > query.to.getTime()
    ? { ...query, from: query.to, to: query.from }
    : query;
}

function vehicleJson(v: LogVehicleBrief): Json {
  return {
    id: v.id,
    name: v.name,
    plate: v.plate,
    vehicle_category: v.category,
    lifecycle_status: v.lifecycleStatus,
  };
}

const MAINTENANCE_COLUMNS: CsvColumn<MaintenanceLogItem>[] = [
  { header: 'id', value: r => r.id },
  { header: 'vehicle_id', value: r => r.vehicleId },
  { header: 'vehicle_name', value: r => r.vehicle.name },
  { header: 'plate', value: r => r.vehicle.plate },
  { header: 'service_date', value: r => dateOnly(r.serviceDate) },
  { header: 'service_type', value: r => r.serviceType },
  { header: 'odometer_km', value: r => r.odometerKm },
  { header: 'cost', value: r => r.cost },
  { header: 'vendor', value: r => r.vendor },
  { header: 'notes', value: r => r.notes },
  { header: 'maintenance_schedule_id', value: r => r.maintenanceScheduleId },
  { header: 'created_at', value: r => r.createdAt },
];

const FUEL_COLUMNS: CsvColumn<FuelLogItem>[] = [
  { header: 'id', value: r => r.id },
  { header: 'vehicle_id', value: r => r.vehicleId },
  { header: 'vehicle_name', value: r => r.vehicle.name },
  { header: 'plate', value: r => r.vehicle.plate },
  { header: 'fill_date', value: r => dateOnly(r.fillDate) },
  { header: 'volume', value: r => r.volume },
  { header: 'unit', value: r => r.unit },
  {
    header: 'liters',
    value: r => round(r.volume * (r.unit === 'gallons' ? LITERS_PER_US_GALLON : 1), 3),
  },
  { header: 'total_cost', value: r => r.totalCost },
  { header: 'cost', value: r => r.cost },
  { header: 'unit_price', value: r => r.unitPrice },
  { header: 'is_full_tank', value: r => r.isFullTank },
  { header: 'odometer_km', value: r => r.odometerKm },
  { header: 'vendor', value: r => r.vendor },
  { header: 'station_name', value: r => r.stationName },
  { header: 'payment_method', value: r => r.paymentMethod },
  { header: 'receipt_reference', value: r => r.receiptReference },
  { header: 'trip_id', value: r => r.tripId },
  { header: 'created_at', value: r => r.createdAt },
];

/** Business logic for module 4.11 (D-0188, flow 07 asks C2 / C3 / C4) — read-only views, nothing is stored. */
export class FleetRecordsService {
  constructor(
    private readonly repo: FleetRecordsRepository,
    private readonly settingsLookup: FleetSettingsLookup,
    private readonly usersLookup: ActorDirectory
  ) {}

  private maintenanceJson(
    row: MaintenanceLogItem,
    actors: Awaited<ReturnType<typeof loadActors>>
  ): Json {
    return {
      id: row.id,
      vehicle_id: row.vehicleId,
      maintenance_schedule_id: row.maintenanceScheduleId,
      service_type: row.serviceType,
      service_date: row.serviceDate,
      odometer_km: row.odometerKm,
      cost: row.cost,
      vendor: row.vendor,
      notes: row.notes,
      logged_by: row.loggedBy,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      ...auditFields(actors, row.loggedBy, row.updatedBy),
      vehicle: vehicleJson(row.vehicle),
    };
  }

  private fuelJson(row: FuelLogItem, actors: Awaited<ReturnType<typeof loadActors>>): Json {
    return {
      id: row.id,
      vehicle_id: row.vehicleId,
      fill_date: row.fillDate,
      volume: row.volume,
      unit: row.unit,
      cost: row.cost,
      odometer_km: row.odometerKm,
      is_full_tank: row.isFullTank,
      vendor: row.vendor,
      logged_by: row.loggedBy,
      station_name: row.stationName,
      unit_price: row.unitPrice,
      total_cost: row.totalCost,
      payment_method: row.paymentMethod,
      receipt_reference: row.receiptReference,
      trip_id: row.tripId,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      ...auditFields(actors, row.loggedBy, row.updatedBy),
      vehicle: vehicleJson(row.vehicle),
    };
  }

  /** `GET /maintenance-logs` — always paged; `meta.summary` covers the whole filtered set, not the page. */
  async listMaintenanceLogs(rawQuery: MaintenanceLogListQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const query = orderedRange(rawQuery);
    const window = query.window ?? DEFAULT_WINDOW;
    const [{ items, total }, summary] = await Promise.all([
      this.repo.listMaintenanceLogs(query, (window.page - 1) * window.perPage, window.perPage),
      this.repo.maintenanceSummary(query),
    ]);
    const actors = await loadActors(
      this.usersLookup,
      items.flatMap(row => [row.loggedBy, row.updatedBy])
    );
    return {
      success: true,
      message: 'Maintenance logs retrieved successfully.',
      data: {
        items: items.map(row => this.maintenanceJson(row, actors)),
        pagination: buildPagination(total, window),
      },
      meta: {
        summary: {
          count: summary.count,
          total_cost: round(summary.totalCost, 2),
          avg_cost: summary.withCost > 0 ? round(summary.totalCost / summary.withCost, 2) : null,
          logs_with_cost: summary.withCost,
        },
        generated_at: now.toISOString(),
      },
    };
  }

  /** `GET /maintenance-logs/export` — the list's own filters / sort, every matching row as CSV. */
  async exportMaintenanceLogs(rawQuery: Omit<MaintenanceLogListQuery, 'window'>) {
    requireCompany();
    const query = orderedRange(rawQuery);
    return planExport('maintenance-logs', MAINTENANCE_COLUMNS, (page, perPage) =>
      this.repo.listMaintenanceLogs(query, (page - 1) * perPage, perPage)
    );
  }

  /** `GET /fuel-logs` — always paged; `meta.summary` covers the whole filtered set (litres converted from gallons). */
  async listFuelLogs(rawQuery: FuelLogListQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const query = orderedRange(rawQuery);
    const window = query.window ?? DEFAULT_WINDOW;
    const [{ items, total }, summary] = await Promise.all([
      this.repo.listFuelLogs(query, (window.page - 1) * window.perPage, window.perPage),
      this.repo.fuelSummary(query),
    ]);
    const actors = await loadActors(
      this.usersLookup,
      items.flatMap(row => [row.loggedBy, row.updatedBy])
    );
    return {
      success: true,
      message: 'Fuel logs retrieved successfully.',
      data: {
        items: items.map(row => this.fuelJson(row, actors)),
        pagination: buildPagination(total, window),
      },
      meta: {
        summary: {
          count: summary.count,
          liters: round(summary.liters, 2),
          total_cost: round(summary.totalCost, 2),
          avg_price_per_liter:
            summary.pricedLiters > 0 ? round(summary.totalCost / summary.pricedLiters, 4) : null,
          logs_with_cost: summary.withCost,
        },
        generated_at: now.toISOString(),
      },
    };
  }

  /** `GET /fuel-logs/export` — the list's own filters / sort, every matching row as CSV. */
  async exportFuelLogs(rawQuery: Omit<FuelLogListQuery, 'window'>) {
    requireCompany();
    const query = orderedRange(rawQuery);
    return planExport('fuel-logs', FUEL_COLUMNS, (page, perPage) =>
      this.repo.listFuelLogs(query, (page - 1) * perPage, perPage)
    );
  }

  /**
   * `GET /compliance-documents/counts` — every document of the company in exactly one of six exclusive buckets, judged against TODAY in the
   * company timezone: `expired` (before today), `expiring_0_7` (today … +7 days), `expiring_8_30`, `expiring_31_60`, `valid_after_60`, `no_expiry`.
   */
  async complianceCounts(filter: ComplianceCountFilter, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const today: LocalDate = localDateOf(now, settings.timezone);
    const rows = await this.repo.complianceRowsForCounts(filter);

    const empty = (): Record<ComplianceStatus, number> => ({
      expired: 0,
      expiring_0_7: 0,
      expiring_8_30: 0,
      expiring_31_60: 0,
      valid_after_60: 0,
      no_expiry: 0,
    });

    const overall = empty();
    const byOwner = new Map<string, Record<ComplianceStatus, number>>();
    const byType = new Map<string, Record<ComplianceStatus, number>>();
    for (const row of rows) {
      const status = expiryStatusOf(row.expiryDate, today);
      overall[status] += 1;
      const owner = byOwner.get(row.documentableType) ?? empty();
      owner[status] += 1;
      byOwner.set(row.documentableType, owner);
      const type = byType.get(row.documentType) ?? empty();
      type[status] += 1;
      byType.set(row.documentType, type);
    }
    const total = (counts: Record<ComplianceStatus, number>): number =>
      COMPLIANCE_STATUSES.reduce((n, s) => n + counts[s], 0);

    return {
      success: true,
      message: 'Compliance document counts retrieved successfully.',
      data: {
        total: rows.length,
        by_status: overall,
        by_owner_type: [...byOwner.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([documentable_type, counts]) => ({
            documentable_type,
            total: total(counts),
            ...counts,
          })),
        by_document_type: [...byType.entries()]
          .map(([document_type, counts]) => ({ document_type, total: total(counts), ...counts }))
          .sort((a, b) => b.total - a.total || a.document_type.localeCompare(b.document_type)),
      },
      meta: {
        timezone: settings.timezone,
        today: localDateString(today),
        generated_at: now.toISOString(),
        buckets: {
          expired: 'expiry date before today',
          expiring_0_7: 'today up to 7 days ahead',
          expiring_8_30: '8 to 30 days ahead',
          expiring_31_60: '31 to 60 days ahead',
          valid_after_60: 'more than 60 days ahead',
          no_expiry: 'no expiry date',
        },
      },
    };
  }
}
