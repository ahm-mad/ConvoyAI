import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import {
  ATTENTION_TYPES,
  FleetAttentionService,
  type AttentionMaintenanceLookup,
} from '../fleet-attention.service.js';
import { AttentionQuerySchema } from '../fleet-analytics.schemas.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup, fakeVehiclesLookup } from './fakes.js';

const ctx = (overrides: Partial<RequestContext> = {}): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
  ...overrides,
});
const NOW = new Date('2026-09-25T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

/** One of everything. */
function build(
  overrides: Record<string, unknown> = {},
  maintenance?: AttentionMaintenanceLookup['attentionSchedules']
) {
  const repo = fakeFleetDashboardRepository({
    activeAlarmsWithRuleName: () =>
      Promise.resolve([
        {
          id: '1',
          ruleName: 'High temp',
          severity: 'critical',
          state: 'active',
          deviceId: 'd1',
          triggeredAt: hoursAgo(2),
          createdAt: null,
        },
        {
          id: '2',
          ruleName: 'Door open',
          severity: 'info',
          state: 'acknowledged',
          deviceId: 'd1',
          triggeredAt: hoursAgo(5),
          createdAt: null,
        },
        {
          id: '3',
          ruleName: 'Not a fleet device',
          severity: 'critical',
          state: 'active',
          deviceId: 'd9',
          triggeredAt: hoursAgo(1),
          createdAt: null,
        },
      ]),
    complianceExpiring: () =>
      Promise.resolve([
        {
          id: '10',
          documentableType: 'vehicle',
          documentableId: '1',
          documentType: 'Insurance',
          expiryDate: daysFromNow(-3),
        },
        {
          id: '11',
          documentableType: 'App\\Models\\Driver',
          documentableId: '5',
          documentType: 'Medical',
          expiryDate: daysFromNow(10),
        },
        {
          id: '12',
          documentableType: 'vehicle',
          documentableId: '999',
          documentType: 'Foreign',
          expiryDate: daysFromNow(-1),
        }, // another company's vehicle
      ]),
    vehicleNames: () => Promise.resolve(new Map([['1', 'Truck 1']])),
    driverNames: () => Promise.resolve(new Map([['5', 'Ada Lovelace']])),
    driverLicencesExpiring: () =>
      Promise.resolve([
        { id: '5', name: 'Ada Lovelace', expiryDate: daysFromNow(-20) },
        { id: '6', name: 'Bob Ray', expiryDate: daysFromNow(12) },
      ]),
    vehiclesForCompany: () =>
      Promise.resolve([
        { id: '1', name: 'Truck 1', plate: null },
        { id: '2', name: 'Van 2', plate: null },
        { id: '3', name: 'Bare 3', plate: null },
        { id: '4', name: 'Fresh 4', plate: null },
      ]),
    activeDeviceAssignmentsForVehicles: () =>
      Promise.resolve(
        new Map([
          ['1', 'd1'],
          ['2', 'd2'],
          ['4', 'd4'],
        ])
      ),
    lastPositionTimes: () =>
      Promise.resolve(
        new Map([
          ['d1', hoursAgo(30)],
          ['d4', hoursAgo(1)],
        ])
      ), // d2 never reported
    severeIncidentsSince: () =>
      Promise.resolve([
        {
          id: '20',
          driverId: '5',
          driverName: 'Ada Lovelace',
          vehicleId: '1',
          incidentType: 'collision',
          incidentDate: daysFromNow(-2),
        },
      ]),
    plannedTripsStartingBefore: () =>
      Promise.resolve([
        {
          id: '30',
          reference: 'TRP-00030',
          vehicleId: '2',
          vehicleName: 'Van 2',
          vehicleStatus: 'in_maintenance',
          driverName: 'Bob Ray',
          driverStatus: 'active',
          plannedStartAt: daysFromNow(0.3),
        },
        {
          id: '31',
          reference: null,
          vehicleId: '1',
          vehicleName: 'Truck 1',
          vehicleStatus: 'active',
          driverName: 'Ada Lovelace',
          driverStatus: 'suspended',
          plannedStartAt: daysFromNow(0.5),
        },
        {
          id: '32',
          reference: 'TRP-00032',
          vehicleId: '4',
          vehicleName: 'Fresh 4',
          vehicleStatus: 'active',
          driverName: 'Bob Ray',
          driverStatus: 'active',
          plannedStartAt: daysFromNow(0.2),
        }, // all fine → not listed
      ]),
    openYardStaysBefore: () =>
      Promise.resolve([
        {
          vehicleId: '3',
          vehicleName: 'Bare 3',
          yardName: 'North Depot',
          slotNumber: 'A1',
          checkedInAt: daysFromNow(-9),
        },
      ]),
    ...overrides,
  });
  const lookup: AttentionMaintenanceLookup = {
    attentionSchedules:
      maintenance ??
      (() =>
        Promise.resolve([
          {
            id: '40',
            vehicleId: '1',
            vehicleName: 'Truck 1',
            serviceType: 'Oil change',
            status: 'overdue' as const,
            nextDueDate: daysFromNow(-4),
          },
          {
            id: '41',
            vehicleId: '4',
            vehicleName: 'Fresh 4',
            serviceType: 'Brakes',
            status: 'due_soon' as const,
            nextDueDate: daysFromNow(3),
          },
        ])),
  };
  return new FleetAttentionService(
    repo,
    fakeVehiclesLookup({
      currentVehicleIdForDevice: deviceId => Promise.resolve(deviceId === 'd1' ? '1' : undefined),
      findVehicleById: id => Promise.resolve(id === '1' ? { id: '1', name: 'Truck 1' } : undefined),
    }),
    fakeSettingsLookup(),
    lookup
  );
}

const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);

describe('FleetAttentionService (flow 07 B2)', () => {
  it('merges every source with the documented types, severities, entities and action keys', async () => {
    const items = await run(() => build().collect(NOW));
    const byId = new Map(items.map(i => [i.id, i]));
    expect(byId.get('alarm:1')).toMatchObject({
      type: 'alarm',
      severity: 'critical',
      entity: { type: 'vehicle', id: '1', name: 'Truck 1' },
      action: 'review_alarm',
      title: 'Truck 1: High temp',
    });
    expect(byId.get('alarm:2')?.title).toBe('Truck 1: Door open (acknowledged)');
    expect(byId.has('alarm:3')).toBe(false); // the device is not installed in a vehicle
    expect(byId.get('maintenance:40')).toMatchObject({
      type: 'maintenance_overdue',
      severity: 'warning',
      action: 'schedule_service',
    });
    expect(byId.get('maintenance:41')).toMatchObject({
      type: 'maintenance_due_soon',
      severity: 'info',
    });
    expect(byId.get('document:10')).toMatchObject({
      type: 'document_expired',
      severity: 'critical',
      entity: { type: 'vehicle', name: 'Truck 1' },
      action: 'renew_document',
    });
    expect(byId.get('document:11')).toMatchObject({
      type: 'document_expiring',
      severity: 'warning',
      entity: { type: 'driver', id: '5', name: 'Ada Lovelace' },
    });
    expect(byId.has('document:12')).toBe(false); // a foreign owner has no name in this company
    expect(byId.get('licence:5')).toMatchObject({
      type: 'licence_expired',
      severity: 'critical',
      action: 'renew_licence',
    });
    expect(byId.get('licence:6')).toMatchObject({ type: 'licence_expiring', severity: 'warning' });
    expect(byId.get('incident:20')).toMatchObject({
      type: 'incident_severe',
      severity: 'warning',
      entity: { type: 'driver', name: 'Ada Lovelace' },
      action: 'review_incident',
    });
    expect(byId.get('yard:3')).toMatchObject({
      type: 'yard_long_stay',
      severity: 'info',
      action: 'check_out_vehicle',
    });
    // every produced type is a documented one
    for (const item of items) expect(ATTENTION_TYPES).toContain(item.type);
  });

  it('vehicle_offline: only vehicles WITH a tracker silent for more than 24 h; a never-reporting tracker has since = null; no tracker / fresh tracker are not listed', async () => {
    const items = await run(() => build().collect(NOW));
    const offline = items.filter(i => i.type === 'vehicle_offline');
    expect(offline.map(i => i.id).sort()).toEqual(['offline:1', 'offline:2']);
    expect(offline.find(i => i.id === 'offline:1')).toMatchObject({
      since: hoursAgo(30),
      action: 'check_tracker',
    });
    expect(offline.find(i => i.id === 'offline:2')).toMatchObject({ since: null });
    expect(offline.find(i => i.id === 'offline:2')?.title).toContain('never reported');
  });

  it('trip_at_risk: a planned trip within 24 h whose vehicle is out of service or whose driver is inactive / suspended — naming why; a healthy trip is not listed', async () => {
    const items = await run(() => build().collect(NOW));
    const trips = items.filter(i => i.type === 'trip_at_risk');
    expect(trips.map(i => i.id).sort()).toEqual(['trip:30', 'trip:31']);
    expect(trips.find(i => i.id === 'trip:30')?.title).toBe(
      'TRP-00030 starts soon but vehicle Van 2 is in maintenance'
    );
    expect(trips.find(i => i.id === 'trip:31')).toMatchObject({
      title: 'Trip 31 starts soon but driver Ada Lovelace is suspended',
      entity: { type: 'trip', id: '31', name: 'Trip 31' },
      action: 'fix_trip',
    });
  });

  it('orders most severe first, then longest waiting first (unknown last), and lists everything paged with counts', async () => {
    const result = await run(() => build().list({}, NOW));
    const severities = result.data.items.map(i => i.severity);
    expect(severities).toEqual(
      [...severities].sort(
        (a, b) =>
          ['critical', 'warning', 'info'].indexOf(a) - ['critical', 'warning', 'info'].indexOf(b)
      )
    );
    const warnings = result.data.items.filter(i => i.severity === 'warning');
    const sinces = warnings.map(i => i.since?.getTime() ?? Number.POSITIVE_INFINITY);
    expect(sinces).toEqual([...sinces].sort((a, b) => a - b));
    expect(warnings[warnings.length - 1]?.since).toBeNull(); // the never-reported tracker waits last
    expect(result.data.pagination).toMatchObject({
      page: 1,
      per_page: 20,
      total: result.meta.counts.total,
    });
    expect(
      result.meta.counts.by_severity.critical +
        result.meta.counts.by_severity.warning +
        result.meta.counts.by_severity.info
    ).toBe(result.meta.counts.total);
  });

  it('filters by severity and type; each count ignores its own filter so chips never zero each other; paging slices the ordered list', async () => {
    const service = build();
    const all = await run(() => service.list({}, NOW));
    const critical = await run(() => service.list({ severities: ['critical'] }, NOW));
    expect(critical.data.items.every(i => i.severity === 'critical')).toBe(true);
    expect(critical.meta.counts.by_severity).toEqual(all.meta.counts.by_severity); // by_severity ignores the severity filter
    expect(critical.meta.counts.total).toBe(all.meta.counts.by_severity.critical);
    const licences = await run(() =>
      service.list({ types: ['licence_expired', 'licence_expiring'] }, NOW)
    );
    expect(licences.data.items.map(i => i.type).sort()).toEqual([
      'licence_expired',
      'licence_expiring',
    ]);
    expect(licences.meta.counts.by_type).toEqual(all.meta.counts.by_type); // by_type ignores the type filter
    const both = await run(() => service.list({ severities: ['critical'], types: ['alarm'] }, NOW));
    expect(both.data.items.map(i => i.id)).toEqual(['alarm:1']);
    const page2 = await run(() => service.list({ window: { page: 2, perPage: 3 } }, NOW));
    expect(page2.data.items).toHaveLength(3);
    expect(page2.data.items[0]?.id).toBe(all.data.items[3]?.id);
  });

  it('yard_days: a stay shorter than the limit is not listed', async () => {
    let asked: Date | undefined;
    const service = build({
      openYardStaysBefore: (before: Date) => {
        asked = before;
        return Promise.resolve([]);
      },
    });
    await run(() => service.collect(NOW, 30));
    expect(asked?.toISOString()).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
  });

  it('openIssues counts critical + warning items only (the open_issues KPI); a caller without a company is refused', async () => {
    const service = build();
    const all = await run(() => service.list({}, NOW));
    expect(await run(() => service.openIssues(NOW))).toBe(
      all.meta.counts.by_severity.critical + all.meta.counts.by_severity.warning
    );
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () => service.collect(NOW))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('AttentionQuerySchema', () => {
  it('accepts comma lists and the [] spelling and rejects unknown values with fixed messages', () => {
    const parsed = AttentionQuerySchema.parse({
      severity: 'critical,warning',
      'type[]': ['alarm', 'licence_expired'],
      yard_days: '14',
      per_page: '50',
    });
    expect(parsed.severity).toEqual(['critical', 'warning']);
    expect(parsed['type[]']).toEqual(['alarm', 'licence_expired']);
    expect(parsed.yard_days).toBe(14);
    expect(AttentionQuerySchema.safeParse({ severity: 'urgent' }).error?.issues[0]?.message).toBe(
      'The selected severity is invalid.'
    );
    expect(AttentionQuerySchema.safeParse({ type: 'nonsense' }).error?.issues[0]?.message).toBe(
      'The selected type is invalid.'
    );
    expect(AttentionQuerySchema.safeParse({ yard_days: 0 }).success).toBe(false);
    expect(AttentionQuerySchema.safeParse({ per_page: 101 }).success).toBe(false);
  });
});
