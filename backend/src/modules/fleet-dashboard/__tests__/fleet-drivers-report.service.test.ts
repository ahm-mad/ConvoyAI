import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { DriversReportQuerySchema } from '../fleet-analytics.schemas.js';
import type {
  DriverReportRow,
  IncidentReportFilter,
  IncidentReportRow,
  TripReportFilter,
  TripReportRow,
} from '../fleet-dashboard.types.js';
import {
  FleetDriversReportService,
  type DriversReportQuery,
} from '../fleet-drivers-report.service.js';
import { MAX_REPORT_INCIDENTS } from '../fleet-driver-safety.shared.js';
import { MAX_REPORT_TRIPS } from '../fleet-trips-report.service.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';

const ctx = (): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});
const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);
const NOW = new Date('2026-09-25T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

let seq = 0;
const trip = (driverId: string, over: Partial<TripReportRow> = {}): TripReportRow => {
  seq += 1;
  return {
    id: String(seq),
    reference: null,
    status: 'completed',
    vehicleId: '7',
    driverId,
    customerId: null,
    originAddress: null,
    destinationAddress: null,
    plannedStartAt: at('2026-09-24T08:00:00Z'),
    actualStartAt: at('2026-09-24T08:00:00Z'),
    plannedEndAt: at('2026-09-24T10:00:00Z'),
    actualEndAt: at('2026-09-24T10:00:00Z'),
    plannedDistanceKm: 50,
    actualDistanceKm: 50,
    durationMinutes: 120,
    cancellationReason: null,
    ...over,
  };
};
const incident = (
  id: string,
  driverId: string,
  severity: IncidentReportRow['severity'],
  date: string,
  vehicleId: string | null = '7',
  type = 'Collision'
): IncidentReportRow => ({
  id,
  driverId,
  vehicleId,
  incidentType: type,
  severity,
  incidentDate: at(date),
});
const driver = (
  id: string,
  name: string,
  status: DriverReportRow['status'] = 'active',
  expiry: string | null = null
): DriverReportRow => ({
  id,
  name,
  status,
  licenseNumber: `L-${id}`,
  licenseExpiryDate: expiry ? at(expiry) : null,
});

const DRIVERS = [
  driver('9', 'Ada Lovelace', 'active', '2026-12-01'),
  driver('10', 'Bob Builder', 'active', '2026-09-20'), // expired
  driver('11', 'Cy Idle', 'inactive'), // deactivated, no activity
  driver('12', 'Dee Gone', 'inactive'), // deactivated, but with activity
  driver('13', 'Eve Suspended', 'suspended'), // not deactivated, no activity
];
const TRIPS = [
  trip('9', { actualEndAt: at('2026-09-24T09:50:00Z') }), // −10 min → on time, 50 km
  trip('9', { actualEndAt: at('2026-09-24T10:30:00Z'), actualDistanceKm: 60 }), // +30 min → late, 60 km
  trip('9', {
    status: 'cancelled',
    actualStartAt: null,
    plannedStartAt: at('2026-09-25T08:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
  }),
  trip('10', { actualEndAt: at('2026-09-24T13:00:00Z'), actualDistanceKm: 100 }), // +180 min → late, 100 km
  trip('10', {
    status: 'planned',
    actualStartAt: null,
    plannedStartAt: at('2026-09-25T15:00:00Z'),
    actualEndAt: null,
    durationMinutes: null,
    actualDistanceKm: null,
  }),
  trip('12', { plannedEndAt: null, actualDistanceKm: 40 }), // not judged, 40 km
];
const INCIDENTS = [
  incident('1', '9', 'severe', '2026-09-24'),
  incident('2', '9', 'minor', '2026-09-25', null),
  incident('3', '12', 'moderate', '2026-09-23', '8'),
];

const range = { from: at('2026-09-23'), to: at('2026-09-25') } as const;
interface Seen {
  trips: TripReportFilter[];
  incidents: IncidentReportFilter[];
  driverIds: (string[] | undefined)[];
}
function service(
  opts: {
    trips?: TripReportRow[];
    incidents?: IncidentReportRow[];
    drivers?: DriverReportRow[];
    vehicleIds?: string[];
    tripCount?: number;
    incidentCount?: number;
    previousTrips?: TripReportRow[];
    previousIncidents?: IncidentReportRow[];
    seen?: Seen;
    settings?: Parameters<typeof fakeSettingsLookup>[0];
  } = {}
) {
  const seen = opts.seen ?? { trips: [], incidents: [], driverIds: [] };
  const isPrevious = (from: Date) => from.getTime() < range.from.getTime();
  const repo = fakeFleetDashboardRepository({
    vehicleIdsForScope: () => Promise.resolve(opts.vehicleIds),
    countTripsForReport: () => Promise.resolve(opts.tripCount ?? 0),
    tripsForReport: (from: Date, _to: Date, filter: TripReportFilter) => {
      seen.trips.push(filter);
      return Promise.resolve(isPrevious(from) ? (opts.previousTrips ?? []) : (opts.trips ?? TRIPS));
    },
    countIncidentsForReport: () => Promise.resolve(opts.incidentCount ?? 0),
    incidentsForReport: (from: Date, _to: Date, _tz: string, filter: IncidentReportFilter) => {
      seen.incidents.push(filter);
      return Promise.resolve(
        isPrevious(from) ? (opts.previousIncidents ?? []) : (opts.incidents ?? INCIDENTS)
      );
    },
    driversForReport: (ids?: string[]) => {
      seen.driverIds.push(ids);
      return Promise.resolve((opts.drivers ?? DRIVERS).filter(d => !ids || ids.includes(d.id)));
    },
  });
  return new FleetDriversReportService(repo, fakeSettingsLookup(opts.settings ?? {}));
}

interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  target?: number | null;
}
interface Row {
  driver: { id: string; name: string; status: string };
  license_state: string;
  trips_total: number;
  trips_completed: number;
  trips_cancelled: number;
  cancellation_rate_pct: number | null;
  on_time_pct: number | null;
  on_time_sample: number;
  avg_delay_minutes: number | null;
  distance_km: number;
  incidents: number;
  incidents_minor: number;
  incidents_moderate: number;
  incidents_severe: number;
  incidents_per_100k_km: number | null;
  last_incident_date: string | null;
  [key: string]: unknown;
}
interface Report {
  data: {
    summary: Record<string, Metric> & { drivers_listed: number; samples: { on_time: number } };
    series: Record<string, unknown>[];
    table: { items: Row[]; pagination: Record<string, unknown> };
    previous_period?: { from: string; to: string };
  };
  meta: Record<string, unknown>;
}
const report = async (s: FleetDriversReportService, q: DriversReportQuery = {}) =>
  (await run(() => s.report({ ...range, ...q }, NOW))) as unknown as Report;
const names = (r: Report) => r.data.table.items.map(i => i.driver.name);

describe('FleetDriversReportService.report', () => {
  it("summary: the trips report's definitions per driver set, incidents, the rate per 100 000 km", async () => {
    const s = (await report(service())).data.summary;
    expect(s['trips_total']?.value).toBe(6);
    expect(s['trips_completed']?.value).toBe(4);
    expect(s['cancellation_rate_pct']?.value).toBe(16.7); // 1 of 6
    // judged = the 3 completed trips with a planned end; on time = only the first
    expect(s['on_time_pct']?.value).toBe(33.3);
    expect(s['on_time_pct']?.target).toBeNull();
    expect(s['avg_delay_minutes']?.value).toBe(66.7); // (−10 + 30 + 180) / 3
    expect(s.samples.on_time).toBe(3);
    expect(s['distance_km']?.value).toBe(250);
    expect(s['incidents']?.value).toBe(3);
    expect(s['severe_incidents']?.value).toBe(1);
    expect(s['incidents_per_100k_km']?.value).toBe(1200); // 3 / 250 × 100 000
    expect(s['drivers_with_trips']?.value).toBe(3);
    expect(s['drivers_with_incidents']?.value).toBe(2);
    expect(s['trips_total']).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
  });

  it('table: one row per driver with the figures, deactivated drivers only with activity, default sort = trips desc', async () => {
    const r = await report(service());
    // Cy (deactivated, nothing to show) is left out; Eve (suspended) is listed with zeros; Dee (deactivated) is listed because she has activity
    expect(names(r)).toEqual(['Ada Lovelace', 'Bob Builder', 'Dee Gone', 'Eve Suspended']);
    expect(r.data.summary.drivers_listed).toBe(4);
    const ada = r.data.table.items[0] as Row;
    expect(ada).toMatchObject({
      driver: { id: '9', name: 'Ada Lovelace', status: 'active' },
      license_state: 'valid_after_60',
      trips_total: 3,
      trips_completed: 2,
      trips_cancelled: 1,
      cancellation_rate_pct: 33.3,
      on_time_pct: 50,
      on_time_sample: 2,
      avg_delay_minutes: 10,
      distance_km: 110,
      incidents: 2,
      incidents_minor: 1,
      incidents_moderate: 0,
      incidents_severe: 1,
      last_incident_date: '2026-09-25',
    });
    expect(ada.incidents_per_100k_km).toBe(1818.2); // 2 / 110 × 100 000
    const bob = r.data.table.items[1] as Row;
    expect(bob).toMatchObject({
      license_state: 'expired',
      trips_total: 2,
      on_time_pct: 0,
      incidents: 0,
      incidents_per_100k_km: 0,
      last_incident_date: null,
    });
    const dee = r.data.table.items[2] as Row;
    expect(dee).toMatchObject({
      driver: { status: 'inactive' },
      on_time_pct: null,
      on_time_sample: 0,
      avg_delay_minutes: null,
      incidents_moderate: 1,
      distance_km: 40,
    });
    const eve = r.data.table.items[3] as Row;
    expect(eve).toMatchObject({
      driver: { status: 'suspended' },
      trips_total: 0,
      cancellation_rate_pct: null,
      on_time_pct: null,
      distance_km: 0,
      incidents: 0,
      incidents_per_100k_km: null,
      license_state: 'no_expiry',
    });
  });

  it('include_inactive lists the deactivated drivers without activity too', async () => {
    const r = await report(service(), { includeInactive: true });
    expect(names(r)).toContain('Cy Idle');
    expect(r.data.summary.drivers_listed).toBe(5);
  });

  it('a driver filter is passed to the trips, the incidents and the driver list; the vehicle scope lists only drivers with activity', async () => {
    const seen: Seen = { trips: [], incidents: [], driverIds: [] };
    const r = await report(service({ seen, vehicleIds: ['7'] }), {
      driverIds: ['9', '10', '13'],
      scope: { vehicleCategory: 'Truck' },
    });
    expect(seen.trips[0]).toEqual({ vehicleIds: ['7'], driverIds: ['9', '10', '13'] });
    expect(seen.incidents[0]).toEqual({ vehicleIds: ['7'], driverIds: ['9', '10', '13'] });
    expect(seen.driverIds[0]).toEqual(['9', '10', '13']);
    expect(names(r)).toEqual(['Ada Lovelace', 'Bob Builder']); // Eve had nothing in the scope
    expect(r.meta['vehicle_scope']).toBe(true);
    expect((await report(service())).meta['vehicle_scope']).toBe(false);
  });

  it('search (name / licence number), sorts with empty values last, paging', async () => {
    const s = service();
    expect(names(await report(s, { search: 'lovelace' }))).toEqual(['Ada Lovelace']);
    expect(names(await report(s, { search: 'L-10' }))).toEqual(['Bob Builder']);
    expect(names(await report(s, { sortBy: 'driver_name' }))).toEqual([
      'Ada Lovelace',
      'Bob Builder',
      'Dee Gone',
      'Eve Suspended',
    ]);
    expect(names(await report(s, { sortBy: 'driver_name', sortOrder: 'desc' }))).toEqual([
      'Eve Suspended',
      'Dee Gone',
      'Bob Builder',
      'Ada Lovelace',
    ]);
    // on-time: Ada 50, Bob 0, the rest null → nulls last in BOTH directions
    expect(names(await report(s, { sortBy: 'on_time_pct', sortOrder: 'desc' }))).toEqual([
      'Ada Lovelace',
      'Bob Builder',
      'Dee Gone',
      'Eve Suspended',
    ]);
    expect(names(await report(s, { sortBy: 'on_time_pct', sortOrder: 'asc' }))).toEqual([
      'Bob Builder',
      'Ada Lovelace',
      'Dee Gone',
      'Eve Suspended',
    ]);
    expect(names(await report(s, { sortBy: 'incidents' }))).toEqual([
      'Ada Lovelace',
      'Dee Gone',
      'Bob Builder',
      'Eve Suspended',
    ]);
    expect(names(await report(s, { sortBy: 'last_incident_date' }))).toEqual([
      'Ada Lovelace',
      'Dee Gone',
      'Bob Builder',
      'Eve Suspended',
    ]);
    const paged = await report(s, { window: { page: 2, perPage: 3 } });
    expect(names(paged)).toEqual(['Eve Suspended']);
    expect(paged.data.table.pagination).toMatchObject({ total: 4, page: 2, per_page: 3 });
    // the summary does not follow the search or the page
    expect((await report(s, { search: 'lovelace' })).data.summary['trips_total']?.value).toBe(6);
  });

  it('series: trips by period start, incidents by their local date; one point per bucket', async () => {
    const r = await report(service());
    expect(r.data.series.map(p => p['bucket'])).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    expect(r.data.series[0]).toMatchObject({ trips: 0, incidents: 1, severe_incidents: 0 });
    expect(r.data.series[1]).toMatchObject({
      trips: 4,
      completed: 4,
      cancelled: 0,
      on_time_pct: 33.3,
      on_time_sample: 3,
      incidents: 1,
      severe_incidents: 1,
    });
    expect(r.data.series[2]).toMatchObject({
      trips: 2,
      completed: 0,
      cancelled: 1,
      on_time_pct: null,
      on_time_sample: 0,
      incidents: 1,
    });
  });

  it('compare = previous_period fills previous / delta and names the window; the on-time grace comes from the settings', async () => {
    const previousTrips = [trip('9'), trip('9', { actualEndAt: at('2026-09-24T11:00:00Z') })];
    const r = await report(
      service({ previousTrips, previousIncidents: [incident('9', '9', 'minor', '2026-09-21')] }),
      { compare: 'previous_period' }
    );
    expect(r.data.previous_period).toEqual({ from: '2026-09-20', to: '2026-09-22' });
    expect(r.data.summary['trips_total']).toMatchObject({
      value: 6,
      previous: 2,
      delta_abs: 4,
      delta_pct: 200,
    });
    expect(r.data.summary['incidents']).toMatchObject({ value: 3, previous: 1, delta_abs: 2 });
    // a 30-minute grace turns Ada's +30 min trip into an on-time one: 2 of 3 judged
    const graced = await report(service({ settings: { onTimeGraceMinutes: 30 } }));
    expect(graced.data.summary['on_time_pct']?.value).toBe(66.7);
  });

  it('refuses ranges that are too big, and needs a company', async () => {
    await expect(report(service({ tripCount: MAX_REPORT_TRIPS + 1 }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      report(service({ incidentCount: MAX_REPORT_INCIDENTS + 1 }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      report(service(), { from: at('2020-01-01'), to: at('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError); // > 92 day buckets
    await expect(service().report({ ...range }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('empty period: zeros and nulls, never NaN', async () => {
    const r = await report(service({ trips: [], incidents: [] }));
    const s = r.data.summary;
    expect(s['trips_total']?.value).toBe(0);
    expect(s['on_time_pct']?.value).toBeNull();
    expect(s['cancellation_rate_pct']?.value).toBeNull();
    expect(s['incidents_per_100k_km']?.value).toBeNull();
    expect(s['distance_km']?.value).toBe(0);
  });
});

describe('FleetDriversReportService.exportRows', () => {
  it("plans a CSV of every matching driver with the table's filters / sort", async () => {
    const plan = await run(() => service().exportRows({ ...range, sortBy: 'driver_name' }, NOW));
    expect(plan.name).toBe('drivers-report');
    expect(plan.total).toBe(4);
    expect(plan.columns.map(c => c.header).slice(0, 6)).toEqual([
      'driver_id',
      'driver_name',
      'driver_status',
      'license_number',
      'license_expiry_date',
      'license_state',
    ]);
    const rows: unknown[][] = [];
    for await (const batch of plan.batches())
      for (const row of batch) rows.push(plan.columns.map(c => c.value(row)));
    expect(rows[0]).toEqual([
      '9',
      'Ada Lovelace',
      'active',
      'L-9',
      '2026-12-01',
      'valid_after_60',
      3,
      2,
      1,
      33.3,
      50,
      2,
      10,
      110,
      2,
      1,
      0,
      1,
      1818.2,
      '2026-09-25',
    ]);
    const searched = await run(() => service().exportRows({ ...range, search: 'lovelace' }, NOW));
    expect(searched.total).toBe(1);
  });
});

describe('DriversReportQuerySchema', () => {
  it('accepts both id-list spellings and the flag; rejects bad values', () => {
    const ok = DriversReportQuerySchema.parse({
      'vehicle_id[]': ['1', '2'],
      driver_id: '3,4',
      'driver_id[]': ['5'],
      include_inactive: '1',
      sort_by: 'on_time_pct',
      sort_order: 'desc',
      page: '2',
      per_page: '50',
    });
    expect(ok.include_inactive).toBe('1');
    expect(DriversReportQuerySchema.safeParse({ sort_by: 'nope' }).success).toBe(false);
    expect(DriversReportQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
    expect(DriversReportQuerySchema.safeParse({ compare: 'yesterday' }).success).toBe(false);
    expect(DriversReportQuerySchema.safeParse({ driver_id: 'abc' }).success).toBe(false);
    expect(DriversReportQuerySchema.safeParse({ per_page: '101' }).success).toBe(false);
  });
});
