import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetAnalyticsService } from '../fleet-analytics.service.js';
import type { FleetAttentionService } from '../fleet-attention.service.js';
import { AnalyticsSummaryQuerySchema } from '../fleet-analytics.schemas.js';
import { fakeOverviewRepository, fakeSettingsLookup } from './fakes.js';

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
const attention = (openIssues = 4) =>
  ({ openIssues: () => Promise.resolve(openIssues) }) as unknown as FleetAttentionService;
const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);

interface Call {
  from: string;
  to: string;
  vehicleIds: string[] | undefined;
}

/** A repository whose figures depend on the window asked for, so the previous period and every bucket can be told apart. */
function build(settings = {}, calls: Call[] = []) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const repo = fakeOverviewRepository({
    vehiclesForCompany: scope =>
      Promise.resolve(
        scope?.vehicleCategory === 'Van'
          ? [{ id: '2', name: 'Van', plate: null }]
          : [
              { id: '1', name: 'Truck', plate: null },
              { id: '2', name: 'Van', plate: null },
            ]
      ),
    activeDeviceAssignmentsForVehicles: () => Promise.resolve(new Map([['1', 'd1']])),
    availabilityCounts: () => Promise.resolve({ active: 9, inMaintenance: 1 }),
    inServiceVehicleCount: (ids?: string[]) => Promise.resolve(ids ? ids.length : 2),
    // 6 of 8 planned trips on time now; 5 of 10 in the previous window (the sample is the completed trips that have a planned end)
    onTimeStatsInRange: (from: Date, to: Date, _grace: number, ids?: string[]) => {
      calls.push({ from: day(from), to: day(to), vehicleIds: ids }); // every window and bucket the summary asks about goes through here
      return Promise.resolve(
        day(from) < '2026-09-19' ? { onTime: 5, sample: 10 } : { onTime: 6, sample: 8 }
      );
    },
    // 12 h of driving in the current window, 6 h in the previous one
    completedTripsAggInRange: (from: Date) =>
      Promise.resolve(
        day(from) < '2026-09-19'
          ? { totalMinutes: 360, totalKm: 100 }
          : { totalMinutes: 720, totalKm: 200 }
      ),
    fuelAggInRange: (from: Date) =>
      Promise.resolve(
        day(from) < '2026-09-19' ? { liters: 10, cost: 30 } : { liters: 20, cost: 100 }
      ),
    maintenanceCostInRange: () => Promise.resolve(20),
    fuelFillsInRange: () =>
      Promise.resolve([
        { vehicleId: '1', fillDate: NOW, liters: 40, odometerKm: 1000, isFullTank: true },
        { vehicleId: '1', fillDate: NOW, liters: 50, odometerKm: 1500, isFullTank: true },
      ]),
  });
  return new FleetAnalyticsService(
    repo,
    fakeSettingsLookup({ utilisationTargetPct: 70, costPerKmTarget: 0.5, ...settings }),
    attention()
  );
}

describe('FleetAnalyticsService.summary (flow 07 B1)', () => {
  it('returns the six tiles with the D-0183 definitions, the company targets and the B0 meta (default range = the last 7 local days)', async () => {
    const result = await run(() => build().summary({}, NOW));
    expect(result.meta).toMatchObject({
      from: '2026-09-19',
      to: '2026-09-25',
      timezone: 'UTC',
      interval: 'day',
      compare: 'none',
      definition_version: 1,
    });
    expect(result.meta.data_quality).toMatchObject({ vehicles_total: 2, vehicles_with_tracker: 1 });
    const s = result.data.summary as Record<string, Record<string, unknown>>;
    // utilisation: 12 h / (2 in-service × 24 h × 7 days = 336 h) = 3.57 %
    expect(s['utilisation']).toMatchObject({
      value: 3.57,
      previous: null,
      delta_abs: null,
      delta_pct: null,
      target: 70,
    });
    expect(s['on_time_pct']).toMatchObject({ value: 75, target: null }); // 6 of 8 completed
    expect(s['cost_per_km']).toMatchObject({ value: 0.6, target: 0.5 }); // (100 fuel + 20 maintenance) / 200 km
    expect(s['fuel_economy']).toMatchObject({ value: 10 }); // full-tank method: the first full fill starts the sequence, then 500 km ÷ the 50 L of the later fill
    expect(s['fleet_availability']).toMatchObject({ value: 90, previous: null }); // 9 of 10, a point-in-time metric
    expect(s['open_issues']).toMatchObject({ value: 4, previous: null });
  });

  it('compare=previous_period uses the immediately preceding window of the same length and reports delta_abs / delta_pct', async () => {
    const calls: Call[] = [];
    const result = await run(() => build({}, calls).summary({ compare: 'previous_period' }, NOW));
    expect(result.data.previous_period).toEqual({ from: '2026-09-12', to: '2026-09-18' });
    const s = result.data.summary as Record<string, Record<string, unknown>>;
    // previous: 6 h / 336 h = 1.79 %; now 3.57 % → +1.78 pts, +99.4 %
    expect(s['utilisation']).toMatchObject({
      value: 3.57,
      previous: 1.79,
      delta_abs: 1.78,
      delta_pct: 99.4,
    });
    // previous on-time: 5 of 10 = 50 % → +25 pts
    expect(s['on_time_pct']).toMatchObject({
      value: 75,
      previous: 50,
      delta_abs: 25,
      delta_pct: 50,
    });
    expect(calls.some(c => c.from === '2026-09-12' && c.to === '2026-09-18')).toBe(true);
  });

  it('compare=previous_year shifts the same calendar dates back one year', async () => {
    const result = await run(() => build().summary({ compare: 'previous_year' }, NOW));
    expect(result.data.previous_period).toEqual({ from: '2025-09-19', to: '2025-09-25' });
    // 29 February clamps to 28 February
    const leap = await run(() =>
      build().summary(
        {
          from: new Date('2028-02-29T00:00:00Z'),
          to: new Date('2028-02-29T00:00:00Z'),
          compare: 'previous_year',
        },
        NOW
      )
    );
    expect(leap.data.previous_period).toEqual({ from: '2027-02-28', to: '2027-02-28' });
  });

  it('the series has one point per bucket (the sparkline) with the same four metrics', async () => {
    const result = await run(() =>
      build().summary(
        { from: new Date('2026-09-20T00:00:00Z'), to: new Date('2026-09-25T00:00:00Z') },
        NOW
      )
    );
    expect((result.data.series as { bucket: string }[]).map(p => p.bucket)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(result.data.series[0]).toHaveProperty('utilisation');
    expect(result.data.series[0]).toHaveProperty('fuel_economy');
    const weekly = await run(() =>
      build().summary(
        {
          from: new Date('2026-09-01T00:00:00Z'),
          to: new Date('2026-09-25T00:00:00Z'),
          interval: 'week',
        },
        NOW
      )
    );
    expect((weekly.data.series as unknown[]).length).toBe(4); // Tue 1 (partial week) · 7 · 14 · 21
  });

  it('the scope narrows the vehicles every aggregate looks at; no scope leaves them unrestricted', async () => {
    const calls: Call[] = [];
    await run(() => build({}, calls).summary({ scope: { vehicleCategory: 'Van' } }, NOW));
    expect(calls.every(c => c.vehicleIds?.join(',') === '2')).toBe(true);
    const all: Call[] = [];
    await run(() => build({}, all).summary({}, NOW));
    expect(all.every(c => c.vehicleIds === undefined)).toBe(true);
  });

  it('refuses a range with more than 92 buckets (422 naming the fix) and a caller without a company', async () => {
    await expect(
      run(() =>
        build().summary(
          { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-09-25T00:00:00Z') },
          NOW
        )
      )
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run(() =>
        build().summary(
          { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-09-25T00:00:00Z') },
          NOW
        )
      )
    ).rejects.toThrow('at most 92 are allowed');
    await expect(
      runWithContextAsync(ctx({ companyId: undefined }), () => build().summary({}, NOW))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('D-0186: on_time_pct is null — never a false 0 % — when no completed trip has a planned end, and is judged over the trips that DO have one', async () => {
    const noPlans = new FleetAnalyticsService(
      fakeOverviewRepository({
        tripStatusCountsInRange: () =>
          Promise.resolve({ total: 21, completed: 21, cancelled: 0, planned: 0 }),
        onTimeStatsInRange: () => Promise.resolve({ onTime: 0, sample: 0 }),
      }),
      fakeSettingsLookup(),
      attention()
    );
    const tile = (
      (await run(() => noPlans.summary({}, NOW))).data.summary as Record<
        string,
        Record<string, unknown>
      >
    )['on_time_pct'];
    expect(tile).toMatchObject({ value: null });
    // 21 completed but only 4 have a plan, 3 of them on time → 75 %, not 3 ÷ 21
    const partial = new FleetAnalyticsService(
      fakeOverviewRepository({
        tripStatusCountsInRange: () =>
          Promise.resolve({ total: 21, completed: 21, cancelled: 0, planned: 0 }),
        onTimeStatsInRange: () => Promise.resolve({ onTime: 3, sample: 4 }),
      }),
      fakeSettingsLookup(),
      attention()
    );
    expect(
      (
        (await run(() => partial.summary({}, NOW))).data.summary as Record<
          string,
          Record<string, unknown>
        >
      )['on_time_pct']
    ).toMatchObject({ value: 75 });
  });

  it('empty data gives null metrics, never zeros or NaN', async () => {
    const service = new FleetAnalyticsService(
      fakeOverviewRepository(),
      fakeSettingsLookup(),
      attention(0)
    );
    const result = await run(() => service.summary({ compare: 'previous_period' }, NOW));
    const s = result.data.summary as Record<string, Record<string, unknown>>;
    for (const key of [
      'utilisation',
      'on_time_pct',
      'cost_per_km',
      'fuel_economy',
      'fleet_availability',
    ])
      expect(s[key]?.['value']).toBeNull();
    expect(s['open_issues']?.['value']).toBe(0);
  });
});

describe('AnalyticsSummaryQuerySchema', () => {
  it('validates interval / compare with fixed messages and accepts the scope filters', () => {
    expect(
      AnalyticsSummaryQuerySchema.parse({
        interval: 'week',
        compare: 'previous_year',
        vehicle_category: 'Truck',
        driver_id: '1,2',
      }).driver_id
    ).toEqual(['1', '2']);
    expect(
      AnalyticsSummaryQuerySchema.safeParse({ interval: 'hour' }).error?.issues[0]?.message
    ).toBe('The selected interval is invalid.');
    expect(
      AnalyticsSummaryQuerySchema.safeParse({ compare: 'last_week' }).error?.issues[0]?.message
    ).toBe('The selected compare is invalid.');
  });
});
