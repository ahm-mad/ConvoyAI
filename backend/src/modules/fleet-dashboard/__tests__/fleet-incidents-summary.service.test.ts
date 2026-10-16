import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { IncidentsSummaryQuerySchema } from '../fleet-analytics.schemas.js';
import type {
  IncidentReportFilter,
  IncidentReportRow,
  TripReportFilter,
  TripReportRow,
} from '../fleet-dashboard.types.js';
import { MAX_REPORT_INCIDENTS } from '../fleet-driver-safety.shared.js';
import {
  FleetIncidentsSummaryService,
  type IncidentsSummaryQuery,
} from '../fleet-incidents-summary.service.js';
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
const trip = (vehicleId: string, driverId: string, km: number | null): TripReportRow => {
  seq += 1;
  return {
    id: String(seq),
    reference: null,
    status: 'completed',
    vehicleId,
    driverId,
    customerId: null,
    originAddress: null,
    destinationAddress: null,
    plannedStartAt: at('2026-09-24T08:00:00Z'),
    actualStartAt: at('2026-09-24T08:00:00Z'),
    plannedEndAt: null,
    actualEndAt: null,
    plannedDistanceKm: null,
    actualDistanceKm: km,
    durationMinutes: null,
    cancellationReason: null,
  };
};
const incident = (
  id: string,
  driverId: string,
  vehicleId: string | null,
  severity: IncidentReportRow['severity'],
  type: string,
  date: string
): IncidentReportRow => ({
  id,
  driverId,
  vehicleId,
  incidentType: type,
  severity,
  incidentDate: at(date),
});

const TRIPS = [
  trip('7', '9', 100),
  trip('7', '10', 100),
  trip('8', '9', 300),
  trip('8', '10', null),
]; // 500 km in all
const INCIDENTS = [
  incident('1', '9', '7', 'severe', 'Collision', '2026-09-24'),
  incident('2', '9', '7', 'minor', ' collision ', '2026-09-24'), // same type, other case / spacing
  incident('3', '10', '8', 'moderate', 'Speeding', '2026-09-25'),
  incident('4', '10', null, 'minor', 'Complaint', '2026-09-23'), // no vehicle
  incident('5', '9', '8', 'minor', 'Speeding', '2026-09-25'),
];
const range = { from: at('2026-09-23'), to: at('2026-09-25') } as const;
interface Seen {
  trips: TripReportFilter[];
  incidents: IncidentReportFilter[];
}

function service(
  opts: {
    trips?: TripReportRow[];
    incidents?: IncidentReportRow[];
    vehicleIds?: string[];
    tripCount?: number;
    incidentCount?: number;
    previousTrips?: TripReportRow[];
    previousIncidents?: IncidentReportRow[];
    seen?: Seen;
  } = {}
) {
  const seen = opts.seen ?? { trips: [], incidents: [] };
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
    vehicleBriefs: () =>
      Promise.resolve(
        new Map([
          ['7', { name: 'Truck 7', plate: 'T-7' }],
          ['8', { name: 'Van 8', plate: null }],
        ])
      ),
    driverNames: () =>
      Promise.resolve(
        new Map([
          ['9', 'Ada Lovelace'],
          ['10', 'Bob Builder'],
        ])
      ),
  });
  return new FleetIncidentsSummaryService(repo, fakeSettingsLookup());
}

interface Metric {
  value: number | null;
  previous: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
}
interface Summary {
  data: {
    summary: Record<string, Metric> & { without_vehicle: number };
    series: { bucket: string; total: number; minor: number; moderate: number; severe: number }[];
    by_severity: { severity: string; count: number; pct: number | null }[];
    by_type: {
      total: number;
      items: {
        incident_type: string;
        count: number;
        severe_incidents: number;
        pct: number | null;
      }[];
      other_count: number;
    };
    top_vehicles: {
      vehicle: { id: string; name: string | null; plate: string | null };
      incidents: number;
      severe_incidents: number;
      distance_km: number;
      incidents_per_100k_km: number | null;
    }[];
    top_drivers: {
      driver: { id: string; name: string | null };
      incidents: number;
      severe_incidents: number;
      distance_km: number;
      incidents_per_100k_km: number | null;
    }[];
    previous_period?: { from: string; to: string };
  };
  meta: Record<string, unknown>;
}
const summary = async (s: FleetIncidentsSummaryService, q: IncidentsSummaryQuery = {}) =>
  (await run(() => s.summary({ ...range, ...q }, NOW))) as unknown as Summary;

describe('FleetIncidentsSummaryService.summary', () => {
  it('summary: incidents, severe share, the rate per 100 000 km, drivers / vehicles involved, incidents without a vehicle', async () => {
    const s = (await summary(service())).data.summary;
    expect(s['incidents']?.value).toBe(5);
    expect(s['severe_incidents']?.value).toBe(1);
    expect(s['severe_share_pct']?.value).toBe(20);
    expect(s['distance_km']?.value).toBe(500);
    expect(s['incidents_per_100k_km']?.value).toBe(1000); // 5 / 500 × 100 000
    expect(s['drivers_involved']?.value).toBe(2);
    expect(s['vehicles_involved']?.value).toBe(2);
    expect(s.without_vehicle).toBe(1);
    expect(s['incidents']).toMatchObject({ previous: null, delta_abs: null, delta_pct: null });
  });

  it('series per day, by severity (all three always present), by type grouped case-insensitively with the top N and the rest', async () => {
    const r = await summary(service());
    expect(r.data.series).toEqual([
      { bucket: '2026-09-23', total: 1, minor: 1, moderate: 0, severe: 0 },
      { bucket: '2026-09-24', total: 2, minor: 1, moderate: 0, severe: 1 },
      { bucket: '2026-09-25', total: 2, minor: 1, moderate: 1, severe: 0 },
    ]);
    expect(r.data.by_severity).toEqual([
      { severity: 'minor', count: 3, pct: 60 },
      { severity: 'moderate', count: 1, pct: 20 },
      { severity: 'severe', count: 1, pct: 20 },
    ]);
    expect(r.data.by_type.total).toBe(5);
    expect(r.data.by_type.items).toEqual([
      { incident_type: 'Collision', count: 2, severe_incidents: 1, pct: 40 }, // the first spelling seen names the group
      { incident_type: 'Speeding', count: 2, severe_incidents: 0, pct: 40 },
      { incident_type: 'Complaint', count: 1, severe_incidents: 0, pct: 20 },
    ]);
    const top1 = await summary(service(), { topTypes: 1 });
    expect(top1.data.by_type.items.length).toBe(1);
    expect(top1.data.by_type.other_count).toBe(3);
    const none = await summary(service({ incidents: [] }));
    expect(none.data.by_severity.map(b => [b.count, b.pct])).toEqual([
      [0, null],
      [0, null],
      [0, null],
    ]);
  });

  it("top vehicles / drivers: ranked by incidents then severe; the rate uses that vehicle's / driver's own distance; incidents without a vehicle are not in top_vehicles", async () => {
    const r = await summary(service());
    expect(r.data.top_vehicles).toEqual([
      {
        vehicle: { id: '7', name: 'Truck 7', plate: 'T-7' },
        incidents: 2,
        severe_incidents: 1,
        distance_km: 200,
        incidents_per_100k_km: 1000,
      },
      {
        vehicle: { id: '8', name: 'Van 8', plate: null },
        incidents: 2,
        severe_incidents: 0,
        distance_km: 300,
        incidents_per_100k_km: 666.7,
      },
    ]);
    expect(r.data.top_drivers).toEqual([
      {
        driver: { id: '9', name: 'Ada Lovelace' },
        incidents: 3,
        severe_incidents: 1,
        distance_km: 400,
        incidents_per_100k_km: 750,
      },
      {
        driver: { id: '10', name: 'Bob Builder' },
        incidents: 2,
        severe_incidents: 0,
        distance_km: 100,
        incidents_per_100k_km: 2000,
      },
    ]);
    expect((await summary(service(), { top: 1 })).data.top_drivers.length).toBe(1);
  });

  it('severity / type narrow the incidents but not the distance; the vehicle scope and the driver filter reach both reads', async () => {
    const seen: Seen = { trips: [], incidents: [] };
    const r = await summary(service({ seen, vehicleIds: ['7', '8'] }), {
      severities: ['minor', 'moderate'],
      incidentType: 'SPEEDING',
      driverIds: ['9'],
      scope: { vehicleCategory: 'Truck' },
    });
    expect(seen.trips[0]).toEqual({ vehicleIds: ['7', '8'], driverIds: ['9'] });
    expect(seen.incidents[0]).toEqual({ vehicleIds: ['7', '8'], driverIds: ['9'] });
    expect(r.data.summary['incidents']?.value).toBe(2); // the two Speeding incidents (moderate + minor)
    expect(r.data.summary['distance_km']?.value).toBe(500); // unchanged by severity / type
    expect(r.meta['vehicle_scope']).toBe(true);
    expect((await summary(service())).meta['vehicle_scope']).toBe(false);
  });

  it('compare = previous_period fills previous / delta and names the window', async () => {
    const r = await summary(
      service({
        previousIncidents: [incident('9', '9', '7', 'severe', 'Collision', '2026-09-21')],
        previousTrips: [trip('7', '9', 50)],
      }),
      { compare: 'previous_period' }
    );
    expect(r.data.previous_period).toEqual({ from: '2026-09-20', to: '2026-09-22' });
    expect(r.data.summary['incidents']).toMatchObject({
      value: 5,
      previous: 1,
      delta_abs: 4,
      delta_pct: 400,
    });
    expect(r.data.summary['incidents_per_100k_km']).toMatchObject({ value: 1000, previous: 2000 });
    expect(r.data.summary['severe_share_pct']).toMatchObject({ value: 20, previous: 100 });
  });

  it('empty period and no distance: zeros and nulls, never NaN or Infinity', async () => {
    const r = await summary(service({ trips: [], incidents: [] }));
    expect(r.data.summary['incidents']?.value).toBe(0);
    expect(r.data.summary['severe_share_pct']?.value).toBeNull();
    expect(r.data.summary['incidents_per_100k_km']?.value).toBeNull();
    expect(r.data.top_vehicles).toEqual([]);
    const noKm = await summary(service({ trips: [] }));
    expect(noKm.data.summary['incidents_per_100k_km']?.value).toBeNull();
    expect(noKm.data.top_vehicles[0]?.incidents_per_100k_km).toBeNull();
  });

  it('refuses ranges that are too big, and needs a company', async () => {
    await expect(summary(service({ tripCount: MAX_REPORT_TRIPS + 1 }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      summary(service({ incidentCount: MAX_REPORT_INCIDENTS + 1 }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      summary(service(), { from: at('2020-01-01'), to: at('2026-09-25') })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(service().summary({ ...range }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('IncidentsSummaryQuerySchema', () => {
  it('accepts both id-list / severity spellings; rejects bad values', () => {
    const ok = IncidentsSummaryQuerySchema.parse({
      'vehicle_id[]': ['1'],
      driver_id: '3,4',
      severity: 'minor,severe',
      'severity[]': ['moderate'],
      incident_type: 'Collision',
      top: '5',
      top_types: '3',
    });
    expect(ok.severity).toEqual(['minor', 'severe']);
    expect(IncidentsSummaryQuerySchema.safeParse({ severity: 'fatal' }).success).toBe(false);
    expect(IncidentsSummaryQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
    expect(IncidentsSummaryQuerySchema.safeParse({ compare: 'yesterday' }).success).toBe(false);
    expect(IncidentsSummaryQuerySchema.safeParse({ top: '51' }).success).toBe(false);
    expect(IncidentsSummaryQuerySchema.safeParse({ driver_id: 'abc' }).success).toBe(false);
  });
});
