import { describe, expect, it } from 'vitest';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetDashboardService } from '../fleet-dashboard.service.js';
import {
  fakeFleetDashboardRepository,
  fakeOverviewRepository,
  fakeSettingsLookup,
  fakeVehiclesLookup,
} from './fakes.js';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: '1',
    companyId: '1',
    roles: [],
    perms: [],
    jti: 't',
    exp: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO = new Date('2026-09-16T23:59:59.999Z');

describe('FleetDashboardService.overview', () => {
  it("reuses fleetStatus's offline count for alertSummary's offline_vehicles instead of recomputing (Design notes) — only vehicles WITH a tracker are offline; no tracker = no_tracker (D-0183, A4)", async () => {
    const repo = fakeOverviewRepository({
      vehiclesForCompany: () =>
        Promise.resolve([
          { id: '1', name: 'Silent tracker', plate: null },
          { id: '2', name: 'No tracker', plate: null },
        ]),
      // vehicle 1 has a tracker that has never reported (offline); vehicle 2 has none at all
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map([['1', 'dev-1']])),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }));

    const fleetStatus = result.data.fleet_status as {
      total: number;
      no_tracker: number;
      unknown: number;
      offline: number;
    };
    const alerts = result.data.alerts as { offline_vehicles: number };
    expect(fleetStatus).toMatchObject({ total: 2, offline: 1, no_tracker: 1, unknown: 1 }); // `unknown` is the deprecated alias of `no_tracker`
    expect(alerts.offline_vehicles).toBe(1);
  });

  it('D-0182 (L2): fleetOnly counts only open alarms whose device is installed in a vehicle; default keeps the company-wide counts; offline / expiring stay as they are', async () => {
    const repo = fakeOverviewRepository({
      alarmSeverityCounts: () => Promise.resolve({ critical: 2, warning: 3, info: 1, total: 6 }),
      openAlarmDevices: () =>
        Promise.resolve([
          { severity: 'critical', deviceId: 'd1' },
          { severity: 'critical', deviceId: 'd2' },
          { severity: 'warning', deviceId: 'd1' },
          { severity: 'warning', deviceId: 'd2' },
          { severity: 'warning', deviceId: 'd2' },
          { severity: 'info', deviceId: 'd3' },
        ]),
      countExpiringCompliance: () => Promise.resolve(4),
    });
    const service = new FleetDashboardService(
      repo,
      fakeVehiclesLookup({
        currentVehicleIdForDevice: id => Promise.resolve(id === 'd1' ? 'v1' : undefined),
      }),
      fakeSettingsLookup()
    );

    const all = await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }));
    expect(all.data.alerts).toMatchObject({
      total: 6,
      critical: 2,
      warning: 3,
      info: 1,
      expiring_documents: 4,
    });
    const fleet = await runWithContextAsync(ctx(), () =>
      service.overview({ from: FROM, to: TO }, true)
    );
    expect(fleet.data.alerts).toMatchObject({
      total: 2,
      critical: 1,
      warning: 1,
      info: 0,
      expiring_documents: 4,
    });
  });

  it('classifies vehicles into moving/idle/parked/offline/unknown correctly', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago -- not offline
    const stale = new Date(now.getTime() - 60 * 60 * 1000); // 60 min ago -- offline

    const repo = fakeOverviewRepository({
      vehiclesForCompany: () =>
        Promise.resolve([
          { id: '1', name: 'Moving', plate: null },
          { id: '2', name: 'Idle', plate: null },
          { id: '3', name: 'Parked', plate: null },
          { id: '4', name: 'Offline (stale)', plate: null },
          { id: '5', name: 'Unknown (no tracker)', plate: null },
        ]),
      activeDeviceAssignmentsForVehicles: () =>
        Promise.resolve(
          new Map([
            ['1', 'dev-1'],
            ['2', 'dev-2'],
            ['3', 'dev-3'],
            ['4', 'dev-4'],
          ])
        ),
      latestPositionsForDevices: () =>
        Promise.resolve(
          new Map([
            ['dev-1', { recordedAt: recent, speed: 40 }],
            ['dev-2', { recordedAt: recent, speed: 0 }],
            ['dev-3', { recordedAt: recent, speed: 1 }],
            ['dev-4', { recordedAt: stale, speed: 30 }],
          ])
        ),
      activeTripVehicleIds: () => Promise.resolve(new Set(['2'])),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }));
    const fleetStatus = result.data.fleet_status as Record<string, number>;

    // exclusive states summing to the total (D-0183, A4): the stale tracker is offline, the one without a tracker is no_tracker (alias `unknown`)
    expect(fleetStatus).toMatchObject({
      total: 5,
      moving: 1,
      idle: 1,
      parked: 1,
      offline: 1,
      no_tracker: 1,
      unknown: 1,
    });
    const sum = ['moving', 'idle', 'parked', 'offline', 'no_tracker'].reduce(
      (acc, key) => acc + (fleetStatus[key] ?? 0),
      0
    );
    expect(sum).toBe(fleetStatus['total']);
  });

  it('throws ForbiddenError when there is no company in context', async () => {
    const repo = fakeOverviewRepository();
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () =>
        service.overview({ from: FROM, to: TO })
      )
    ).rejects.toThrow();
  });
});

describe('FleetDashboardService.activeAlerts (KNOWN_ISSUES 11.1)', () => {
  it('golden pair: an acknowledged alarm does not crash and resolves severity from alarms.severity directly (Bug B fixed — no rule.severity eager-load)', async () => {
    const repo = fakeFleetDashboardRepository({
      activeAlarmsWithRuleName: () =>
        Promise.resolve([
          {
            id: '1',
            ruleName: 'High temperature',
            severity: 'critical',
            state: 'acknowledged',
            deviceId: '9',
            triggeredAt: new Date('2026-09-15T00:00:00.000Z'),
            createdAt: null,
          },
        ]),
    });
    const vehiclesLookup = fakeVehiclesLookup({
      currentVehicleIdForDevice: () => Promise.resolve('42'),
      findVehicleById: () => Promise.resolve({ id: '42', name: 'Truck 1' }),
    });
    const service = new FleetDashboardService(repo, vehiclesLookup, fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.activeAlerts([]));

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      severity: 'critical',
      state: 'acknowledged',
      vehicle_id: '42',
      vehicle_name: 'Truck 1',
    });
  });

  it("filters both active and acknowledged states (Bug A fixed — real enum, not 'open')", async () => {
    const repo = fakeFleetDashboardRepository({
      activeAlarmsWithRuleName: () =>
        Promise.resolve([
          {
            id: '1',
            ruleName: 'R1',
            severity: 'warning' as const,
            state: 'active' as const,
            deviceId: '1',
            triggeredAt: new Date('2026-09-15T10:00:00.000Z'),
            createdAt: null,
          },
          {
            id: '2',
            ruleName: 'R2',
            severity: 'info' as const,
            state: 'acknowledged' as const,
            deviceId: '2',
            triggeredAt: new Date('2026-09-15T09:00:00.000Z'),
            createdAt: null,
          },
        ]),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.activeAlerts([]));

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
  });

  it('orders active before acknowledged (11.2c fixed, no MySQL FIELD())', async () => {
    const repo = fakeFleetDashboardRepository({
      activeAlarmsWithRuleName: () =>
        Promise.resolve([
          {
            id: '1',
            ruleName: 'R1',
            severity: 'info' as const,
            state: 'acknowledged' as const,
            deviceId: '1',
            triggeredAt: new Date('2026-09-15T12:00:00.000Z'),
            createdAt: null,
          },
          {
            id: '2',
            ruleName: 'R2',
            severity: 'info' as const,
            state: 'active' as const,
            deviceId: '2',
            triggeredAt: new Date('2026-09-15T11:00:00.000Z'),
            createdAt: null,
          },
        ]),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.activeAlerts([]));

    expect((result.data[0] as { id: string }).id).toBe('2');
    expect((result.data[1] as { id: string }).id).toBe('1');
  });

  it("falls back to a device-number subject and 'unknown' type when there is no rule name or assigned vehicle", async () => {
    const repo = fakeFleetDashboardRepository({
      activeAlarmsWithRuleName: () =>
        Promise.resolve([
          {
            id: '1',
            ruleName: null,
            severity: 'info' as const,
            state: 'active' as const,
            deviceId: '77',
            triggeredAt: new Date('2026-09-15T00:00:00.000Z'),
            createdAt: null,
          },
        ]),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () => service.activeAlerts([]));

    expect(result.data[0]).toMatchObject({ type: 'unknown', vehicle_id: null, vehicle_name: null });
    expect((result.data[0] as { message: string }).message).toContain('Device #77');
  });
});

describe('FleetDashboardService.vehiclePerformance', () => {
  it('sorts by the requested field and direction', async () => {
    const repo = fakeFleetDashboardRepository({
      vehiclesForCompany: () =>
        Promise.resolve([
          { id: '1', name: 'Slow', plate: null },
          { id: '2', name: 'Fast', plate: null },
        ]),
      completedTripsAggByVehicleInRange: () =>
        Promise.resolve(
          new Map([
            ['1', { minutes: 60, km: 50, fuelLiters: 10, count: 1 }],
            ['2', { minutes: 600, km: 500, fuelLiters: 40, count: 3 }],
          ])
        ),
      completedTripDistancesInRange: () => Promise.resolve([]),
      fuelFillsInRange: () => Promise.resolve([]),
      maintenanceCostByVehicleInRange: () => Promise.resolve(new Map()),
      incidentCountByVehicleInRange: () => Promise.resolve(new Map()),
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map()),
      fuelByVehicleInRange: () =>
        Promise.resolve(
          new Map([
            ['1', { liters: 10, cost: 10 }],
            ['2', { liters: 40, cost: 80 }],
          ])
        ),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const desc = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'distance_km', 'desc')
    );
    expect((desc.data[0] as { vehicle_id: string }).vehicle_id).toBe('2');

    const asc = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'distance_km', 'asc')
    );
    expect((asc.data[0] as { vehicle_id: string }).vehicle_id).toBe('1');
  });

  it('falls back to utilisation_rate when an unrecognized sort field is given', async () => {
    const repo = fakeFleetDashboardRepository({
      vehiclesForCompany: () => Promise.resolve([{ id: '1', name: 'Truck 1', plate: null }]),
      completedTripsAggByVehicleInRange: () => Promise.resolve(new Map()),
      completedTripDistancesInRange: () => Promise.resolve([]),
      fuelFillsInRange: () => Promise.resolve([]),
      maintenanceCostByVehicleInRange: () => Promise.resolve(new Map()),
      incidentCountByVehicleInRange: () => Promise.resolve(new Map()),
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map()),
      fuelByVehicleInRange: () => Promise.resolve(new Map()),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'not_a_real_field', 'desc')
    );

    expect(result.meta.sort).toBe('utilisation_rate');
  });

  it('returns null fuel_efficiency when there is no fuel or no distance (division-by-zero guard)', async () => {
    const repo = fakeFleetDashboardRepository({
      vehiclesForCompany: () => Promise.resolve([{ id: '1', name: 'Truck 1', plate: 'ABC-1' }]),
      completedTripsAggByVehicleInRange: () =>
        Promise.resolve(new Map([['1', { minutes: 0, km: 0, fuelLiters: 0, count: 0 }]])),
      completedTripDistancesInRange: () => Promise.resolve([]),
      fuelFillsInRange: () => Promise.resolve([]),
      maintenanceCostByVehicleInRange: () => Promise.resolve(new Map()),
      incidentCountByVehicleInRange: () => Promise.resolve(new Map()),
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map()),
      fuelByVehicleInRange: () => Promise.resolve(new Map()),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'utilisation_rate', 'desc')
    );

    expect(result.data[0]).toMatchObject({
      vehicle_id: '1',
      plate: 'ABC-1',
      fuel_efficiency: null,
      fuel_cost: 0,
    });
  });
});

describe('FleetDashboardService.financial', () => {
  it('returns revenue/profit/outstanding as null with the documented billing-dependency note', async () => {
    const repo = fakeFleetDashboardRepository({
      fuelAggInRange: () => Promise.resolve({ liters: 100, cost: 250.5 }),
      maintenanceCostInRange: () => Promise.resolve(0),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const result = await runWithContextAsync(ctx(), () =>
      service.financial({ from: FROM, to: TO })
    );

    expect(result.data).toMatchObject({
      revenue: null,
      total_cost: 250.5,
      profit: null,
      cost_breakdown: { fuel: 250.5, maintenance: 0 },
    });
  });
});

describe('FleetDashboardService.trends', () => {
  it('returns one point per day bucket for each of the four series', async () => {
    const repo = fakeFleetDashboardRepository({
      inServiceVehicleCount: () => Promise.resolve(2),
      completedTripsAggInRange: () => Promise.resolve({ totalMinutes: 120, totalKm: 100 }),
      fuelAggInRange: () => Promise.resolve({ liters: 20, cost: 40 }),
      tripStatusCountsInWindow: () => Promise.resolve({ total: 3, completed: 2, cancelled: 1 }),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());

    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-03T00:00:00.000Z');
    const result = await runWithContextAsync(ctx(), () => service.trends({ from, to }, 'day'));

    expect(result.data.utilisation).toHaveLength(3);
    expect(result.data.distance).toHaveLength(3);
    expect(result.data.fuel).toHaveLength(3);
    expect(result.data.trips).toHaveLength(3);
    expect(result.data.trips[0]).toMatchObject({ total: 3, completed: 2, cancelled: 1 });
  });
});

describe('FleetDashboardService.activeAlerts — fleet_only (D-0159, owner decision on frontend F6)', () => {
  const alarm = (id: string, deviceId: string) => ({
    id,
    ruleName: `Rule ${id}`,
    severity: 'warning' as const,
    state: 'active' as const,
    deviceId,
    triggeredAt: new Date(`2026-09-15T0${id}:00:00.000Z`),
    createdAt: null,
  });
  const build = () =>
    new FleetDashboardService(
      fakeFleetDashboardRepository({
        activeAlarmsWithRuleName: () => Promise.resolve([alarm('1', '10'), alarm('2', '20')]),
      }),
      fakeVehiclesLookup({
        currentVehicleIdForDevice: deviceId =>
          Promise.resolve(deviceId === '10' ? '42' : undefined),
        findVehicleById: () => Promise.resolve({ id: '42', name: 'Truck 1' }),
      }),
      fakeSettingsLookup()
    );

  it('default keeps the company-wide list (Laravel parity): the alarm of a device that is not in a vehicle is still returned, with vehicle_id null', async () => {
    const result = await runWithContextAsync(ctx(), () => build().activeAlerts([]));
    expect(result.data.map(d => d['vehicle_id']).sort()).toEqual(['42', null]);
    expect(result.meta.total).toBe(2);
  });

  it('fleetOnly drops alarms whose device is not currently installed in a vehicle, and meta.total follows', async () => {
    const result = await runWithContextAsync(ctx(), () => build().activeAlerts([], true));
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ vehicle_id: '42', vehicle_name: 'Truck 1' });
    expect(result.meta.total).toBe(1);
  });
});

describe('D-0183 — settings-driven definitions (A1–A7)', () => {
  const at = (iso: string) => new Date(iso);

  it('A5: the range and buckets follow the company timezone and `meta.timezone` says so; buckets are labelled with local dates', async () => {
    const service = new FleetDashboardService(
      fakeOverviewRepository({
        tripStatusCountsInWindow: () => Promise.resolve({ total: 1, completed: 1, cancelled: 0 }),
      }),
      fakeVehiclesLookup(),
      fakeSettingsLookup({ timezone: 'Asia/Karachi' })
    );
    const now = at('2026-09-24T22:00:00Z'); // already 25 Sept in Karachi
    const overview = await runWithContextAsync(ctx(), () => service.overview({}, false, now));
    expect(overview.meta).toMatchObject({
      from: '2026-09-25',
      to: '2026-09-25',
      timezone: 'Asia/Karachi',
    });

    const trends = await runWithContextAsync(ctx(), () =>
      service.trends(
        { from: at('2026-09-24T00:00:00Z'), to: at('2026-09-25T00:00:00Z') },
        'day',
        now
      )
    );
    expect(trends.meta).toMatchObject({
      from: '2026-09-24',
      to: '2026-09-25',
      timezone: 'Asia/Karachi',
      interval: 'day',
    });
    expect(trends.data.trips.map(row => (row as { date: string }).date)).toEqual([
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('A1: the on-time grace comes from the company settings; trip queries get the period range', async () => {
    let grace: number | undefined;
    const service = new FleetDashboardService(
      fakeOverviewRepository({
        tripStatusCountsInRange: () =>
          Promise.resolve({ total: 24, completed: 21, cancelled: 3, planned: 0 }),
        onTimeStatsInRange: (_from, _to, graceMinutes) => {
          grace = graceMinutes;
          return Promise.resolve({ onTime: 14, sample: 21 });
        },
      }),
      fakeVehiclesLookup(),
      fakeSettingsLookup({ onTimeGraceMinutes: 10 })
    );
    const result = await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }));
    expect(grace).toBe(10);
    expect(result.data.trips).toMatchObject({
      total: 24,
      completed: 21,
      cancelled: 3,
      on_time_pct: 66.7,
    });
  });

  it("A4: the freshness threshold is the company's — a position 20 minutes old is fresh at 30 min and offline at 15", async () => {
    const recordedAt = new Date(Date.now() - 20 * 60_000);
    const repo = () =>
      fakeOverviewRepository({
        vehiclesForCompany: () => Promise.resolve([{ id: '1', name: 'T1', plate: null }]),
        activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map([['1', 'dev-1']])),
        latestPositionsForDevices: () =>
          Promise.resolve(new Map([['dev-1', { recordedAt, speed: 0 }]])),
      });
    const status = async (minutes: number) => {
      const service = new FleetDashboardService(
        repo(),
        fakeVehiclesLookup(),
        fakeSettingsLookup({ positionFreshnessMinutes: minutes })
      );
      return (await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }))).data
        .fleet_status as Record<string, number>;
    };
    expect(await status(30)).toMatchObject({ parked: 1, offline: 0 });
    expect(await status(15)).toMatchObject({ parked: 0, offline: 1 });
  });

  it('A7: available hours = in-service vehicles × scheduled hours per day × local days; the rate has two decimals and the basis is trips', async () => {
    const service = new FleetDashboardService(
      fakeOverviewRepository({
        inServiceVehicleCount: () => Promise.resolve(10),
        completedTripsAggInRange: () =>
          Promise.resolve({ totalMinutes: 7 * 60 + 20, totalKm: 100 }),
      }),
      fakeVehiclesLookup(),
      fakeSettingsLookup({ scheduledHoursPerVehiclePerDay: 12 })
    );
    // 1–7 Sept = 7 local days: 10 × 12 × 7 = 840 available hours; 7h20 driving = 0.8730 %
    const result = await runWithContextAsync(ctx(), () =>
      service.overview({ from: at('2026-09-01T00:00:00Z'), to: at('2026-09-07T00:00:00Z') })
    );
    expect(result.data.utilisation).toMatchObject({
      available_hours: 840,
      driving_hours: 7.3,
      rate: 0.87,
      basis: 'trips',
      vehicles_in_scope: 10,
      scheduled_hours_per_day: 12,
    });
  });

  it("A3: fuel used = the fuel logs' litres and economy = the full-tank method (null without two full fills)", async () => {
    const fill = (odo: number, liters: number, isFullTank: boolean, day: number) => ({
      vehicleId: '1',
      fillDate: new Date(Date.UTC(2026, 8, day)),
      liters,
      odometerKm: odo,
      isFullTank,
    });
    const withFills = new FleetDashboardService(
      fakeOverviewRepository({
        fuelAggInRange: () => Promise.resolve({ liters: 100, cost: 250 }),
        completedTripsAggInRange: () => Promise.resolve({ totalMinutes: 0, totalKm: 1000 }),
        fuelFillsInRange: () =>
          Promise.resolve([
            fill(1000, 40, true, 1),
            fill(1400, 30, true, 2),
            fill(1900, 50, true, 3),
          ]),
      }),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const fuel = (
      await runWithContextAsync(ctx(), () => withFills.overview({ from: FROM, to: TO }))
    ).data.fuel;
    // 900 km ÷ 80 L = 11.25; NOT the 1000 km of trips ÷ 100 L of logs (= 10) the old KPI divided
    expect(fuel).toMatchObject({
      used_liters: 100,
      total_cost: 250,
      average_efficiency_km_per_liter: 11.25,
      efficiency_basis: 'full_tank',
      cost_per_km: 0.25,
    });

    const without = new FleetDashboardService(
      fakeOverviewRepository({ fuelAggInRange: () => Promise.resolve({ liters: 100, cost: 250 }) }),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const empty = (await runWithContextAsync(ctx(), () => without.overview({ from: FROM, to: TO })))
      .data.fuel as Record<string, unknown>;
    expect(empty['average_efficiency_km_per_liter']).toBeNull();
  });

  it("A6: maintenance costs are in the breakdown and total_cost is the breakdown's sum", async () => {
    const service = new FleetDashboardService(
      fakeOverviewRepository({
        fuelAggInRange: () => Promise.resolve({ liters: 10, cost: 250.5 }),
        maintenanceCostInRange: () => Promise.resolve(1200.25),
      }),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const financial = (
      await runWithContextAsync(ctx(), () => service.financial({ from: FROM, to: TO }))
    ).data;
    expect(financial).toMatchObject({
      total_cost: 1450.75,
      cost_breakdown: { fuel: 250.5, maintenance: 1200.25, driver: null },
    });
  });

  it('A2/A3/A7 on the vehicle table: one distance with its source, litres from the fuel logs, full-tank economy, utilisation to two decimals and its basis', async () => {
    const repo = fakeFleetDashboardRepository({
      vehiclesForCompany: () => Promise.resolve([{ id: '1', name: 'Truck 1', plate: 'T-1' }]),
      completedTripsAggByVehicleInRange: () =>
        Promise.resolve(new Map([['1', { minutes: 90, km: 150, fuelLiters: 999, count: 3 }]])), // trip-level fuel (999) is no longer the KPI
      completedTripDistancesInRange: () =>
        Promise.resolve([
          { vehicleId: '1', km: 100, odometerStartKm: 10, odometerEndKm: 110, deviceId: '5' },
          { vehicleId: '1', km: 50, odometerStartKm: null, odometerEndKm: null, deviceId: '5' },
        ]),
      maintenanceCostByVehicleInRange: () => Promise.resolve(new Map()),
      incidentCountByVehicleInRange: () => Promise.resolve(new Map()),
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map([['1', 'dev-1']])),
      fuelByVehicleInRange: () => Promise.resolve(new Map([['1', { liters: 80, cost: 160 }]])),
      fuelFillsInRange: () =>
        Promise.resolve([
          {
            vehicleId: '1',
            fillDate: new Date('2026-09-01'),
            liters: 40,
            odometerKm: 1000,
            isFullTank: true,
          },
          {
            vehicleId: '1',
            fillDate: new Date('2026-09-03'),
            liters: 40,
            odometerKm: 1500,
            isFullTank: true,
          },
        ]),
    });
    const service = new FleetDashboardService(repo, fakeVehiclesLookup(), fakeSettingsLookup());
    const result = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance(
        { from: at('2026-09-01T00:00:00Z'), to: at('2026-09-02T00:00:00Z') },
        'distance_km',
        'desc'
      )
    );
    // 2 local days × 24 h = 48 h; 1.5 h driving = 3.125 %
    expect(result.data[0]).toMatchObject({
      vehicle_id: '1',
      distance_km: 150,
      distance_source: 'odometer', // 100 km by operator odometers vs 50 km from the tracker
      fuel_used_liters: 80,
      fuel_cost: 160,
      fuel_efficiency: 12.5, // 500 km ÷ 40 L
      utilisation_rate: 3.13,
      utilisation_basis: 'trips',
    });
    expect(result.meta).toMatchObject({ timezone: 'UTC' });
  });
});

describe('D-0184 — B3 status summary and A8 vehicle-performance table', () => {
  const recent = new Date(Date.now() - 5 * 60_000);
  const stale = new Date(Date.now() - 3 * 3_600_000);
  const fleet = () =>
    fakeOverviewRepository({
      vehiclesForCompany: scope => {
        const all = [
          { id: '1', name: 'Moving truck', plate: 'A-1', category: 'Truck' },
          { id: '2', name: 'Parked van', plate: 'B-2', category: 'Van' },
          { id: '3', name: 'Silent truck', plate: 'C-3', category: 'Truck' },
          { id: '4', name: 'No tracker van', plate: 'D-4', category: 'van' },
          { id: '5', name: 'Uncategorised', plate: null, category: null },
        ];
        return Promise.resolve(
          scope?.vehicleCategory
            ? all.filter(
                v => (v.category ?? '').toLowerCase() === scope.vehicleCategory?.toLowerCase()
              )
            : all
        );
      },
      activeDeviceAssignmentsForVehicles: () =>
        Promise.resolve(
          new Map([
            ['1', 'd1'],
            ['2', 'd2'],
            ['3', 'd3'],
          ])
        ),
      latestPositionsForDevices: () =>
        Promise.resolve(
          new Map([
            ['d1', { recordedAt: recent, speed: 50 }],
            ['d2', { recordedAt: recent, speed: 0 }],
            ['d3', { recordedAt: stale, speed: 20 }],
          ])
        ),
      activeTripVehicleIds: () => Promise.resolve(new Set(['1', '9'])),
    });

  it("B3: exclusive counts, split by category (case-insensitive groups are the repository's; here each stored spelling is a group), tracker coverage, in-scope active trips", async () => {
    const service = new FleetDashboardService(fleet(), fakeVehiclesLookup(), fakeSettingsLookup());
    const result = await runWithContextAsync(ctx(), () => service.statusSummary({}));
    expect(result.data).toMatchObject({
      total: 5,
      by_status: { moving: 1, idle: 0, parked: 1, offline: 1, no_tracker: 2 },
      coverage: { with_tracker: 3, no_tracker: 2, tracker_pct: 60 },
      active_trips: 1, // vehicle 9 is not in scope
    });
    const byCategory = result.data.by_category as {
      category: string | null;
      total: number;
      moving: number;
      no_tracker: number;
    }[];
    expect(byCategory.find(c => c.category === 'Truck')).toMatchObject({ total: 2, moving: 1 });
    expect(byCategory.find(c => c.category === null)).toMatchObject({ total: 1, no_tracker: 1 });
    expect(result.meta).toMatchObject({ timezone: 'UTC', position_freshness_minutes: 15 });
    // the counts sum to the total
    const s = result.data.by_status;
    expect(s.moving + s.idle + s.parked + s.offline + s.no_tracker).toBe(result.data.total);
  });

  it('B3: the scope reaches the repository and narrows the summary; an empty scope gives zeros and a null percentage', async () => {
    const service = new FleetDashboardService(fleet(), fakeVehiclesLookup(), fakeSettingsLookup());
    const trucks = await runWithContextAsync(ctx(), () =>
      service.statusSummary({ vehicleCategory: 'truck' })
    );
    expect(trucks.data).toMatchObject({ total: 2, by_status: { moving: 1, offline: 1 } });
    const none = new FleetDashboardService(
      fakeOverviewRepository({ vehiclesForCompany: () => Promise.resolve([]) }),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const empty = await runWithContextAsync(ctx(), () => none.statusSummary({}));
    expect(empty.data).toMatchObject({
      total: 0,
      coverage: { with_tracker: 0, tracker_pct: null },
      by_category: [],
    });
  });

  const perfRepo = () =>
    fakeFleetDashboardRepository({
      vehiclesForCompany: () =>
        Promise.resolve([
          { id: '1', name: 'Alpha', plate: 'AAA-1', category: 'Truck' },
          { id: '2', name: 'Bravo', plate: 'BBB-2', category: 'Van' },
          { id: '3', name: 'Charlie', plate: null, category: 'Truck' },
        ]),
      completedTripsAggByVehicleInRange: () =>
        Promise.resolve(
          new Map([
            ['1', { minutes: 60, km: 100, fuelLiters: 0, count: 2 }],
            ['2', { minutes: 600, km: 50, fuelLiters: 0, count: 5 }],
          ])
        ),
      completedTripDistancesInRange: () => Promise.resolve([]),
      fuelByVehicleInRange: () => Promise.resolve(new Map([['1', { liters: 10, cost: 20 }]])),
      fuelFillsInRange: () => Promise.resolve([]),
      maintenanceCostByVehicleInRange: () => Promise.resolve(new Map([['1', 30]])),
      incidentCountByVehicleInRange: () => Promise.resolve(new Map([['2', 3]])),
      activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map([['1', 'd1']])),
    });

  it('A8: extra row fields (category, tracker, maintenance cost, cost per km = (fuel + maintenance) ÷ km, incidents); no paging = the flat array', async () => {
    const service = new FleetDashboardService(
      perfRepo(),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const result = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'vehicle_name', 'asc')
    );
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.map(r => r.vehicle_name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(result.data[0]).toMatchObject({
      vehicle_category: 'Truck',
      has_tracker: true,
      maintenance_cost: 30,
      cost_per_km: 0.5,
      incident_count: 0,
    });
    expect(result.data[1]).toMatchObject({ has_tracker: false, cost_per_km: 0, incident_count: 3 });
    expect(result.data[2]).toMatchObject({ cost_per_km: null }); // no distance
  });

  it('A8: sorts on any column with empty values LAST in both directions; an unknown sort still falls back to utilisation_rate', async () => {
    const service = new FleetDashboardService(
      perfRepo(),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const order = async (sort: string, dir: string) =>
      (
        await runWithContextAsync(ctx(), () =>
          service.vehiclePerformance({ from: FROM, to: TO }, sort, dir)
        )
      ).data.map(r => r.vehicle_id);
    expect(await order('cost_per_km', 'asc')).toEqual(['2', '1', '3']); // 0, 0.5, null
    expect(await order('cost_per_km', 'desc')).toEqual(['1', '2', '3']); // 0.5, 0, null — the null stays last
    expect(await order('plate', 'desc')).toEqual(['2', '1', '3']);
    expect(await order('incident_count', 'desc')).toEqual(['2', '1', '3']);
    const fallback = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'nonsense', 'desc')
    );
    expect(fallback.meta.sort).toBe('utilisation_rate');
  });

  it('A8: search (name / plate), paging ({ items, pagination }, meta.total) and the scope reach the rows', async () => {
    const service = new FleetDashboardService(
      perfRepo(),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const searched = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformance({ from: FROM, to: TO }, 'vehicle_name', 'asc', { search: 'bbb' })
    );
    expect(searched.data.map(r => r.vehicle_id)).toEqual(['2']);
    const page2 = await runWithContextAsync(ctx(), () =>
      service.vehiclePerformancePaged({ from: FROM, to: TO }, 'vehicle_name', 'asc', {
        window: { page: 2, perPage: 2 },
      })
    );
    expect(page2.data.items.map(r => r.vehicle_id)).toEqual(['3']);
    expect(page2.data.pagination).toEqual({ page: 2, per_page: 2, total: 3, total_pages: 2 });
    expect(page2.meta.total).toBe(3);
  });

  it("A8: the CSV export covers every matching row with the table's columns", async () => {
    const service = new FleetDashboardService(
      perfRepo(),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
    const plan = await runWithContextAsync(ctx(), () =>
      service.exportVehiclePerformance({ from: FROM, to: TO }, 'vehicle_name', 'asc')
    );
    expect(plan.total).toBe(3);
    expect(plan.columns.map(c => c.header)).toContain('cost_per_km');
    expect(plan.name).toBe('vehicle-performance');
  });
});

describe('D-0186 — on-time and distance variance are judged over the trips that can be judged', () => {
  const build = (overrides: Parameters<typeof fakeOverviewRepository>[0]) =>
    new FleetDashboardService(
      fakeOverviewRepository(overrides),
      fakeVehiclesLookup(),
      fakeSettingsLookup()
    );
  const trips = async (service: FleetDashboardService) =>
    (await runWithContextAsync(ctx(), () => service.overview({ from: FROM, to: TO }))).data
      .trips as Record<string, unknown>;

  it('on_time_pct = on time ÷ completed trips WITH a plan (on_time_sample); null and sample 0 when none has a plan — never a false 0 %', async () => {
    const withPlans = await trips(
      build({
        tripStatusCountsInRange: () =>
          Promise.resolve({ total: 25, completed: 21, cancelled: 4, planned: 0 }),
        onTimeStatsInRange: () => Promise.resolve({ onTime: 3, sample: 4 }),
      })
    );
    expect(withPlans).toMatchObject({ completed: 21, on_time_pct: 75, on_time_sample: 4 });
    const noPlans = await trips(
      build({
        tripStatusCountsInRange: () =>
          Promise.resolve({ total: 25, completed: 21, cancelled: 4, planned: 0 }),
        onTimeStatsInRange: () => Promise.resolve({ onTime: 0, sample: 0 }),
      })
    );
    expect(noPlans).toMatchObject({ completed: 21, on_time_pct: null, on_time_sample: 0 });
  });

  it('distance_variance_km = actual − planned over the trips that have BOTH (distance_variance_sample); null when none; planned / actual keep their meaning', async () => {
    // 5 trips have an actual distance (144.3 km), only 1 has a planned distance (50 km) — that one drove 62.7 km
    const t = await trips(
      build({
        tripDistanceAggInRange: () => Promise.resolve({ plannedKm: 50, actualKm: 144.329 }),
        tripDistanceVarianceInRange: () =>
          Promise.resolve({ plannedKm: 50, actualKm: 62.652, sample: 1 }),
      })
    );
    expect(t).toMatchObject({
      planned_distance_km: 50,
      actual_distance_km: 144.3,
      distance_variance_km: 12.7,
      distance_variance_sample: 1,
    });
    const none = await trips(
      build({
        tripDistanceAggInRange: () => Promise.resolve({ plannedKm: 0, actualKm: 80 }),
        tripDistanceVarianceInRange: () =>
          Promise.resolve({ plannedKm: 0, actualKm: 0, sample: 0 }),
      })
    );
    expect(none).toMatchObject({
      actual_distance_km: 80,
      distance_variance_km: null,
      distance_variance_sample: 0,
    });
  });
});
