import { ForbiddenError, ValidationError } from '../../platform/errors/app-error.js';
import { planExport, type CsvColumn } from '../../platform/http/csv.js';
import { buildPagination, type ListWindow } from '../../platform/http/list-query.js';
import { getRequestContext } from '../../platform/http/request-context.js';
import { startOfLocalDay, utcDatePartsOf } from '../../platform/time/zoned.js';
import type { FleetSettingsLookup } from '../fleet-settings/fleet-settings.types.js';
import { bucketIndex } from './fleet-activity.service.js';
import { DEFINITION_VERSION, MAX_BUCKETS, type CompareMode } from './fleet-analytics.service.js';
import {
  analyticsRange,
  bucketLabel,
  fullTankIntervals,
  generateBuckets,
  localIsoDate,
  previousWindowOf,
  type Bucket,
  type FullTankInterval,
} from './fleet-dashboard.mapper.js';
import type { FleetDashboardRepository } from './fleet-dashboard.repository.js';
import type { FuelReportRow, VehicleScope } from './fleet-dashboard.types.js';

type Json = Record<string, unknown>;

/** D-0190 (flow 07 B6): `GET /fleet/analytics/fuel` — economy / litres / cost / price series, breakdowns by vehicle category and vendor, anomaly flags and a paged fills table. */
export const FUEL_TABLE_SORT_FIELDS = [
  'fill_date',
  'liters',
  'cost',
  'price_per_liter',
  'vehicle_name',
  'vendor',
  'odometer_km',
  'economy_km_per_l',
] as const;
export type FuelTableSortField = (typeof FUEL_TABLE_SORT_FIELDS)[number];
export const FUEL_ANOMALY_TYPES = ['over_capacity', 'economy_drop', 'odometer_backwards'] as const;
export type FuelAnomalyType = (typeof FUEL_ANOMALY_TYPES)[number];

/** A guard for the in-memory pass over the period's fills. */
export const MAX_REPORT_FILLS = 200_000;
/** A fill's interval economy this many percent below the vehicle's OTHER intervals is flagged (`economy_drop_pct` overrides it per request). */
export const DEFAULT_ECONOMY_DROP_PCT = 30;

export interface FuelReportQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  interval?: 'day' | 'week' | 'month' | undefined;
  compare?: CompareMode | undefined;
  scope?: VehicleScope | undefined;
  /** Table-only filters — the summary, series and breakdowns always cover every fill in scope. */
  vendor?: string | undefined;
  paymentMethod?: string | undefined;
  isFullTank?: boolean | undefined;
  /** `true` = only flagged fills, `false` = only unflagged. */
  anomaly?: boolean | undefined;
  anomalyTypes?: FuelAnomalyType[] | undefined;
  search?: string | undefined;
  sortBy?: FuelTableSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: ListWindow | undefined;
  topVendors?: number | undefined;
  topAnomalies?: number | undefined;
  economyDropPct?: number | undefined;
}

const round = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

function requireCompany(): void {
  if (!getRequestContext()?.companyId) throw new ForbiddenError('Unauthorized action.');
}

/** The cost of a fill: `total_cost`, else `cost` (the dashboard's convention — a `total_cost` of 0 falls back to `cost`); `null` when the fill carries no cost. */
export function effectiveCost(row: Pick<FuelReportRow, 'totalCost' | 'cost'>): number | null {
  if (row.totalCost !== null && row.totalCost > 0) return row.totalCost;
  if (row.cost !== null && row.cost > 0) return row.cost;
  return null;
}

interface Totals {
  fills: number;
  liters: number;
  cost: number;
  pricedLiters: number;
  withCost: number;
  ecoKm: number;
  ecoLiters: number;
  intervals: number;
}

const emptyTotals = (): Totals => ({
  fills: 0,
  liters: 0,
  cost: 0,
  pricedLiters: 0,
  withCost: 0,
  ecoKm: 0,
  ecoLiters: 0,
  intervals: 0,
});

function addFill(t: Totals, row: FuelReportRow): void {
  t.fills += 1;
  t.liters += row.liters;
  const cost = effectiveCost(row);
  if (cost !== null) {
    t.cost += cost;
    t.pricedLiters += row.liters;
    t.withCost += 1;
  }
}

function addInterval(t: Totals, interval: FullTankInterval): void {
  t.ecoKm += interval.km;
  t.ecoLiters += interval.liters;
  t.intervals += 1;
}

const economyOf = (t: Totals): number | null =>
  t.ecoLiters > 0 ? round(t.ecoKm / t.ecoLiters, 2) : null;
const priceOf = (t: Totals): number | null =>
  t.pricedLiters > 0 ? round(t.cost / t.pricedLiters, 4) : null;

interface FlagDetail {
  types: FuelAnomalyType[];
  economy: number | null;
  baseline: number | null;
  dropPct: number | null;
  previousOdometerKm: number | null;
}

interface Analysis {
  intervals: FullTankInterval[];
  intervalByFill: Map<string, FullTankInterval>;
  flags: Map<string, FlagDetail>;
}

/** Full-tank intervals of the rows plus the anomaly flags (over capacity, economy drop against the vehicle's other intervals, odometer going backwards). */
function analyse(rows: FuelReportRow[], dropPct: number): Analysis {
  const intervals = fullTankIntervals(
    rows.map(r => ({
      key: r.id,
      vehicleId: r.vehicleId,
      fillDate: r.fillDate,
      liters: r.liters,
      odometerKm: r.odometerKm,
      isFullTank: r.isFullTank,
    }))
  );
  const intervalByFill = new Map(intervals.map(i => [i.key, i]));
  const perVehicle = new Map<string, { km: number; liters: number; count: number }>();
  for (const i of intervals) {
    const t = perVehicle.get(i.vehicleId) ?? { km: 0, liters: 0, count: 0 };
    t.km += i.km;
    t.liters += i.liters;
    t.count += 1;
    perVehicle.set(i.vehicleId, t);
  }
  const flags = new Map<string, FlagDetail>();
  const flag = (id: string, type: FuelAnomalyType, patch: Partial<FlagDetail> = {}): void => {
    const detail = flags.get(id) ?? {
      types: [],
      economy: null,
      baseline: null,
      dropPct: null,
      previousOdometerKm: null,
    };
    if (!detail.types.includes(type)) detail.types.push(type);
    flags.set(id, { ...detail, ...patch, types: detail.types });
  };
  for (const row of rows) {
    const capacity = row.vehicle.tankCapacityLiters;
    if (capacity !== null && capacity > 0 && row.liters > capacity) flag(row.id, 'over_capacity');
  }
  for (const i of intervals) {
    const total = perVehicle.get(i.vehicleId);
    // the baseline is the vehicle's OTHER intervals (leave-one-out), so one bad fill does not hide itself; a vehicle with one interval has no baseline
    if (!total || total.count < 2) continue;
    const otherLiters = total.liters - i.liters;
    const baseline = otherLiters > 0 ? (total.km - i.km) / otherLiters : null;
    const economy = i.km / i.liters;
    if (baseline !== null && baseline > 0) {
      const drop = ((baseline - economy) / baseline) * 100;
      if (drop > dropPct)
        flag(i.key, 'economy_drop', {
          economy: round(economy, 2),
          baseline: round(baseline, 2),
          dropPct: round(drop, 1),
        });
    }
  }
  const byVehicle = new Map<string, FuelReportRow[]>();
  for (const row of rows) {
    if (row.odometerKm === null) continue;
    byVehicle.set(row.vehicleId, [...(byVehicle.get(row.vehicleId) ?? []), row]);
  }
  for (const list of byVehicle.values()) {
    list.sort((a, b) => a.fillDate.getTime() - b.fillDate.getTime() || Number(a.id) - Number(b.id));
    for (let k = 1; k < list.length; k++) {
      const prev = list[k - 1] as FuelReportRow;
      const cur = list[k] as FuelReportRow;
      if ((cur.odometerKm as number) < (prev.odometerKm as number))
        flag(cur.id, 'odometer_backwards', { previousOdometerKm: prev.odometerKm });
    }
  }
  return { intervals, intervalByFill, flags };
}

interface TableRow {
  row: FuelReportRow;
  json: Json;
  pricePerLiter: number | null;
  economy: number | null;
  types: FuelAnomalyType[];
}

const TABLE_COLUMNS: CsvColumn<TableRow>[] = [
  { header: 'fill_id', value: r => r.row.id },
  { header: 'vehicle_id', value: r => r.row.vehicleId },
  { header: 'vehicle_name', value: r => r.row.vehicle.name },
  { header: 'plate', value: r => r.row.vehicle.plate },
  { header: 'fill_date', value: r => r.row.fillDate.toISOString().slice(0, 10) },
  { header: 'volume', value: r => r.row.volume },
  { header: 'unit', value: r => r.row.unit },
  { header: 'liters', value: r => round(r.row.liters, 3) },
  { header: 'cost', value: r => effectiveCost(r.row) },
  { header: 'price_per_liter', value: r => r.pricePerLiter },
  { header: 'is_full_tank', value: r => r.row.isFullTank },
  { header: 'odometer_km', value: r => r.row.odometerKm },
  { header: 'economy_km_per_l', value: r => r.economy },
  { header: 'vendor', value: r => r.row.vendor },
  { header: 'station_name', value: r => r.row.stationName },
  { header: 'payment_method', value: r => r.row.paymentMethod },
  { header: 'receipt_reference', value: r => r.row.receiptReference },
  { header: 'trip_id', value: r => r.row.tripId },
  { header: 'anomalies', value: r => r.types.join(' ') },
];

/** Business logic for the fuel report (D-0190, flow 07 ask B6) — a read-only view over `fuel_logs`; nothing is stored. */
export class FleetFuelReportService {
  constructor(
    private readonly repo: FleetDashboardRepository,
    private readonly settingsLookup: FleetSettingsLookup
  ) {}

  private async fetch(
    from: Date,
    to: Date,
    tz: string,
    vehicleIds: string[] | undefined
  ): Promise<FuelReportRow[]> {
    const count = await this.repo.countFuelFillsForReport(from, to, tz, vehicleIds);
    if (count > MAX_REPORT_FILLS) {
      throw new ValidationError(
        `This range has ${String(count)} fuel logs; at most ${String(MAX_REPORT_FILLS)} can be analysed — narrow the range or add a filter.`
      );
    }
    return this.repo.fuelFillsForReport(from, to, tz, vehicleIds);
  }

  private tableRows(rows: FuelReportRow[], analysis: Analysis): TableRow[] {
    return rows.map(row => {
      const cost = effectiveCost(row);
      const interval = analysis.intervalByFill.get(row.id);
      const detail = analysis.flags.get(row.id);
      const pricePerLiter = cost !== null && row.liters > 0 ? round(cost / row.liters, 4) : null;
      const economy =
        interval && interval.liters > 0 ? round(interval.km / interval.liters, 2) : null;
      const types = detail?.types ?? [];
      return {
        row,
        pricePerLiter,
        economy,
        types,
        json: {
          fill_id: row.id,
          vehicle: {
            id: row.vehicleId,
            name: row.vehicle.name,
            plate: row.vehicle.plate,
            vehicle_category: row.vehicle.category,
          },
          fill_date: row.fillDate,
          volume: row.volume,
          unit: row.unit,
          liters: round(row.liters, 3),
          cost,
          price_per_liter: pricePerLiter,
          is_full_tank: row.isFullTank,
          odometer_km: row.odometerKm,
          economy_km_per_l: economy,
          vendor: row.vendor,
          station_name: row.stationName,
          payment_method: row.paymentMethod,
          receipt_reference: row.receiptReference,
          trip_id: row.tripId,
          anomaly_types: types,
        },
      };
    });
  }

  private filteredAndSorted(all: TableRow[], query: FuelReportQuery): TableRow[] {
    const vendor = query.vendor?.toLowerCase();
    const payment = query.paymentMethod?.toLowerCase();
    const term = query.search?.toLowerCase();
    const rows = all.filter(r => {
      if (vendor && (r.row.vendor ?? '').trim().toLowerCase() !== vendor) return false;
      if (payment && (r.row.paymentMethod ?? '').trim().toLowerCase() !== payment) return false;
      if (query.isFullTank !== undefined && r.row.isFullTank !== query.isFullTank) return false;
      if (query.anomaly !== undefined && r.types.length > 0 !== query.anomaly) return false;
      if (query.anomalyTypes && !r.types.some(t => query.anomalyTypes?.includes(t))) return false;
      if (!term) return true;
      return [
        r.row.vendor,
        r.row.stationName,
        r.row.receiptReference,
        r.row.paymentMethod,
        r.row.vehicle.name,
        r.row.vehicle.plate,
      ].some(v => (v ?? '').toLowerCase().includes(term));
    });
    const field = query.sortBy ?? 'fill_date';
    const sign = (query.sortOrder ?? (query.sortBy ? 'asc' : 'desc')) === 'desc' ? -1 : 1;
    const key = (r: TableRow): number | string | null => {
      switch (field) {
        case 'fill_date':
          return r.row.fillDate.getTime();
        case 'liters':
          return r.row.liters;
        case 'cost':
          return effectiveCost(r.row);
        case 'price_per_liter':
          return r.pricePerLiter;
        case 'vehicle_name':
          return r.row.vehicle.name.toLowerCase();
        case 'vendor':
          return r.row.vendor === null ? null : r.row.vendor.toLowerCase();
        case 'odometer_km':
          return r.row.odometerKm;
        case 'economy_km_per_l':
          return r.economy;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === null && y === null) return Number(a.row.id) - Number(b.row.id);
      if (x === null) return 1; // empty values last in both directions
      if (y === null) return -1;
      const cmp =
        typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return cmp !== 0 ? cmp * sign : (Number(a.row.id) - Number(b.row.id)) * sign;
    });
  }

  /** The headline values of a window, for `summary` and its comparison. */
  private headline(t: Totals, tripKm: number): Record<string, number | null> {
    return {
      fills: t.fills,
      liters: round(t.liters, 2),
      total_cost: round(t.cost, 2),
      avg_price_per_liter: priceOf(t),
      fuel_economy_km_per_l: economyOf(t),
      fuel_cost_per_km: t.cost > 0 && tripKm > 0 ? round(t.cost / tripKm, 2) : null,
    };
  }

  private totalsOf(rows: FuelReportRow[], analysis: Analysis): Totals {
    const t = emptyTotals();
    for (const row of rows) addFill(t, row);
    for (const i of analysis.intervals) addInterval(t, i);
    return t;
  }

  /** `GET /fleet/analytics/fuel`. */
  async report(query: FuelReportQuery, now = new Date()): Promise<Json> {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const interval = query.interval ?? 'day';
    const compare = query.compare ?? 'none';
    const dropPct = query.economyDropPct ?? DEFAULT_ECONOMY_DROP_PCT;
    const [from, to] = analyticsRange(query, now, tz);
    const buckets: Bucket[] = generateBuckets(from, to, interval, tz);
    if (buckets.length > MAX_BUCKETS) {
      throw new ValidationError(
        `The range covers ${String(buckets.length)} ${interval} buckets; at most ${String(MAX_BUCKETS)} are allowed — use a larger interval or a shorter range.`
      );
    }
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    const prevWindow = previousWindowOf(from, to, compare, tz);
    const [rows, previousRows, tripAgg, previousTripAgg] = await Promise.all([
      this.fetch(from, to, tz, vehicleIds),
      prevWindow ? this.fetch(prevWindow[0], prevWindow[1], tz, vehicleIds) : Promise.resolve(null),
      this.repo.completedTripsAggInRange(from, to, vehicleIds),
      prevWindow
        ? this.repo.completedTripsAggInRange(prevWindow[0], prevWindow[1], vehicleIds)
        : Promise.resolve(null),
    ]);
    const analysis = analyse(rows, dropPct);
    const current = this.totalsOf(rows, analysis);
    const currentValues = this.headline(current, tripAgg.totalKm);
    const previousValues =
      previousRows && previousTripAgg
        ? this.headline(
            this.totalsOf(previousRows, analyse(previousRows, dropPct)),
            previousTripAgg.totalKm
          )
        : null;
    const metric = (name: string): Json => {
      const value = currentValues[name] ?? null;
      const prev = previousValues ? (previousValues[name] ?? null) : null;
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
    };

    // series: a fill sits in the bucket of its local date; an economy interval in the bucket of the fill that CLOSED it (so the buckets add up to the range)
    const bucketTotals = buckets.map(() => emptyTotals());
    const bucketOfDate = (date: Date): number =>
      bucketIndex(buckets, startOfLocalDay(utcDatePartsOf(date), tz).getTime());
    for (const row of rows) {
      const i = bucketOfDate(row.fillDate);
      if (i >= 0) addFill(bucketTotals[i] as Totals, row);
    }
    for (const i of analysis.intervals) {
      const b = bucketOfDate(i.fillDate);
      if (b >= 0) addInterval(bucketTotals[b] as Totals, i);
    }

    const byCategory = new Map<
      string,
      { category: string | null; totals: Totals; vehicles: Set<string> }
    >();
    const byVendor = new Map<string, { vendor: string | null; totals: Totals }>();
    const vehicleCategory = new Map(rows.map(r => [r.vehicleId, r.vehicle.category]));
    for (const row of rows) {
      const catKey = row.vehicle.category ?? '';
      const cat = byCategory.get(catKey) ?? {
        category: row.vehicle.category,
        totals: emptyTotals(),
        vehicles: new Set<string>(),
      };
      addFill(cat.totals, row);
      cat.vehicles.add(row.vehicleId);
      byCategory.set(catKey, cat);
      const text = row.vendor?.trim() || null;
      const vKey = text ? text.toLowerCase() : '';
      const vend = byVendor.get(vKey) ?? { vendor: text, totals: emptyTotals() };
      addFill(vend.totals, row);
      byVendor.set(vKey, vend);
    }
    for (const i of analysis.intervals) {
      const cat = byCategory.get(vehicleCategory.get(i.vehicleId) ?? '');
      if (cat) addInterval(cat.totals, i);
    }
    const breakdown = (t: Totals): Json => ({
      fills: t.fills,
      liters: round(t.liters, 2),
      total_cost: round(t.cost, 2),
      avg_price_per_liter: priceOf(t),
      fuel_economy_km_per_l: economyOf(t),
    });
    const categories = [...byCategory.values()].sort(
      (a, b) =>
        b.totals.liters - a.totals.liters || (a.category ?? '').localeCompare(b.category ?? '')
    );
    const vendors = [...byVendor.values()].sort(
      (a, b) =>
        b.totals.cost - a.totals.cost ||
        b.totals.liters - a.totals.liters ||
        (a.vendor ?? '').localeCompare(b.vendor ?? '')
    );
    const topVendors = query.topVendors ?? 10;

    const table = this.filteredAndSorted(this.tableRows(rows, analysis), query);
    const paging = query.window ?? { page: 1, perPage: 20 };
    const byType: Record<FuelAnomalyType, number> = {
      over_capacity: 0,
      economy_drop: 0,
      odometer_backwards: 0,
    };
    for (const detail of analysis.flags.values())
      for (const type of detail.types) byType[type] += 1;
    const rowById = new Map(rows.map(r => [r.id, r]));
    const flagged = [...analysis.flags.entries()]
      .map(([id, detail]) => ({ id, detail, row: rowById.get(id) as FuelReportRow }))
      .sort(
        (a, b) => b.row.fillDate.getTime() - a.row.fillDate.getTime() || Number(b.id) - Number(a.id)
      );

    return {
      success: true,
      message: 'Fuel report retrieved successfully.',
      data: {
        summary: {
          fills: metric('fills'),
          liters: metric('liters'),
          total_cost: metric('total_cost'),
          avg_price_per_liter: metric('avg_price_per_liter'),
          fuel_economy_km_per_l: metric('fuel_economy_km_per_l'),
          fuel_cost_per_km: metric('fuel_cost_per_km'),
          samples: {
            priced_fills: current.withCost,
            economy_intervals: current.intervals,
            fills_with_odometer: rows.filter(r => r.odometerKm !== null).length,
          },
        },
        series: buckets.map((bucket, i) => {
          const t = bucketTotals[i] as Totals;
          return {
            bucket: bucketLabel(bucket, interval, tz),
            fills: t.fills,
            liters: round(t.liters, 2),
            total_cost: round(t.cost, 2),
            avg_price_per_liter: priceOf(t),
            fuel_economy_km_per_l: economyOf(t),
          };
        }),
        by_vehicle_category: categories.map(c => ({
          category: c.category,
          vehicles: c.vehicles.size,
          ...breakdown(c.totals),
        })),
        by_vendor: {
          items: vendors
            .slice(0, topVendors)
            .map(v => ({ vendor: v.vendor, ...breakdown(v.totals) })),
          other_count: Math.max(0, vendors.length - topVendors),
        },
        anomalies: {
          total: analysis.flags.size,
          by_type: byType,
          items: flagged.slice(0, query.topAnomalies ?? 20).map(({ id, detail, row }) => ({
            fill_id: id,
            vehicle: { id: row.vehicleId, name: row.vehicle.name, plate: row.vehicle.plate },
            fill_date: row.fillDate,
            types: detail.types,
            liters: round(row.liters, 3),
            tank_capacity_liters: row.vehicle.tankCapacityLiters,
            economy_km_per_l: detail.economy,
            baseline_economy_km_per_l: detail.baseline,
            drop_pct: detail.dropPct,
            odometer_km: row.odometerKm,
            previous_odometer_km: detail.previousOdometerKm,
          })),
        },
        table: {
          items: table
            .slice((paging.page - 1) * paging.perPage, paging.page * paging.perPage)
            .map(r => r.json),
          pagination: buildPagination(table.length, paging),
        },
        ...(prevWindow
          ? {
              previous_period: {
                from: localIsoDate(prevWindow[0], tz),
                to: localIsoDate(prevWindow[1], tz),
              },
            }
          : {}),
      },
      meta: {
        from: localIsoDate(from, tz),
        to: localIsoDate(to, tz),
        timezone: tz,
        interval,
        compare,
        generated_at: now.toISOString(),
        definition_version: DEFINITION_VERSION,
        economy_drop_pct: dropPct,
        basis: {
          period:
            'a fill belongs to the local calendar date of its fill_date; every vehicle of the scope counts, retired / sold ones included',
          liters: 'gallons are converted to litres (1 US gal = 3.785411784 L)',
          cost: 'total_cost, else cost, per fill; the price per litre is judged over exactly the fills that carry a cost',
          fuel_economy_km_per_l:
            'full-tank method (D-0183 A3): km between two full fills ÷ litres put in since the earlier one, from the fills of the range only; an interval belongs to the bucket of its closing fill',
          fuel_cost_per_km:
            "fuel cost ÷ the completed trips' distance of the same range (the dashboard's fuel cost per km)",
          anomalies:
            "over_capacity = litres above the vehicle's tank capacity; economy_drop = an interval's economy more than economy_drop_pct below the vehicle's other intervals; odometer_backwards = an odometer reading lower than the vehicle's previous fill",
        },
      },
    };
  }

  /** `GET /fleet/analytics/fuel/export` — the table's own filters / sort, every matching fill as CSV. */
  async exportRows(query: Omit<FuelReportQuery, 'window'>, now = new Date()) {
    requireCompany();
    const settings = await this.settingsLookup.effectiveSettings();
    const tz = settings.timezone;
    const [from, to] = analyticsRange(query, now, tz);
    const vehicleIds = await this.repo.vehicleIdsForScope(query.scope ?? {});
    const rows = await this.fetch(from, to, tz, vehicleIds);
    const ordered = this.filteredAndSorted(
      this.tableRows(rows, analyse(rows, query.economyDropPct ?? DEFAULT_ECONOMY_DROP_PCT)),
      query
    );
    return planExport('fuel-report', TABLE_COLUMNS, (page, perPage) =>
      Promise.resolve({
        items: ordered.slice((page - 1) * perPage, page * perPage),
        total: ordered.length,
      })
    );
  }
}
