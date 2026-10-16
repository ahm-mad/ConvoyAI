import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../../platform/errors/app-error.js';
import {
  runWithContextAsync,
  type RequestContext,
} from '../../../platform/http/request-context.js';
import { FleetActivityService } from '../fleet-activity.service.js';
import {
  GeofenceEventSummaryQuerySchema,
  YardSummaryQuerySchema,
} from '../fleet-analytics.schemas.js';
import { fakeFleetDashboardRepository, fakeSettingsLookup } from './fakes.js';

const ctx = (): RequestContext => ({
  userId: '1',
  companyId: '1',
  roles: [],
  perms: [],
  jti: 't',
  exp: Number.MAX_SAFE_INTEGER,
});
const NOW = new Date('2026-09-25T12:00:00.000Z');
const run = <T>(fn: () => Promise<T>) => runWithContextAsync(ctx(), fn);
const at = (iso: string) => new Date(iso);

const YARDS = [
  { id: '1', name: 'North', isActive: true, slotsTotal: 4 },
  { id: '2', name: 'South', isActive: true, slotsTotal: 0 },
];
const STAYS = [
  // North: open stay for 2 h, one completed 60 min stay on 09-24, one completed 180 min stay on 09-25, one that checked out before the range
  {
    yardId: '1',
    slotId: '1',
    vehicleId: '1',
    checkedInAt: at('2026-09-25T10:00:00Z'),
    checkedOutAt: null,
  },
  {
    yardId: '1',
    slotId: '2',
    vehicleId: '2',
    checkedInAt: at('2026-09-24T08:00:00Z'),
    checkedOutAt: at('2026-09-24T09:00:00Z'),
  },
  {
    yardId: '1',
    slotId: '3',
    vehicleId: '3',
    checkedInAt: at('2026-09-25T06:00:00Z'),
    checkedOutAt: at('2026-09-25T09:00:00Z'),
  },
  {
    yardId: '1',
    slotId: '4',
    vehicleId: '4',
    checkedInAt: at('2026-09-10T06:00:00Z'),
    checkedOutAt: at('2026-09-18T09:00:00Z'),
  },
];

function yardService(
  yards = YARDS,
  stays = STAYS,
  seen: { includeInactive?: boolean; yardId?: string | undefined }[] = []
) {
  const repo = fakeFleetDashboardRepository({
    yardsWithSlotCounts: (includeInactive: boolean, yardId?: string) => {
      seen.push({ includeInactive, yardId });
      return Promise.resolve(yards);
    },
    yardStaysTouching: () => Promise.resolve(stays),
  });
  return new FleetActivityService(repo, fakeSettingsLookup());
}

describe('FleetActivityService.yardSummary (flow 07 B9)', () => {
  it('counts occupancy now, check-ins / outs in the period, and dwell over the stays checked out in it', async () => {
    const result = await run(() => yardService().yardSummary({}, NOW));
    expect(result.meta).toMatchObject({
      from: '2026-09-19',
      to: '2026-09-25',
      timezone: 'UTC',
      interval: 'day',
      definition_version: 1,
    });
    expect(result.data.summary).toEqual({
      yards_total: 2,
      slots_total: 4,
      occupied_now: 1,
      occupancy_pct: 25,
      check_ins: 3,
      check_outs: 2,
      avg_dwell_minutes: 120,
      longest_dwell_minutes: 180,
    });
    const north = result.data.table.items.find(i => i.yard_id === '1');
    expect(north).toMatchObject({
      occupied_now: 1,
      occupancy_pct: 25,
      check_ins: 3,
      check_outs: 2,
      avg_dwell_minutes: 120,
      longest_open_stay_minutes: 120,
    });
    // a yard without slots has no occupancy figure and no dwell
    const south = result.data.table.items.find(i => i.yard_id === '2');
    expect(south).toMatchObject({
      slots_total: 0,
      occupancy_pct: null,
      avg_dwell_minutes: null,
      longest_open_stay_minutes: null,
      check_ins: 0,
    });
  });

  it('buckets check-ins and check-outs per local day, one point per day of the range', async () => {
    const result = await run(() => yardService().yardSummary({}, NOW));
    expect(result.data.series).toHaveLength(7);
    expect(result.data.series.find(p => p.bucket === '2026-09-24')).toEqual({
      bucket: '2026-09-24',
      check_ins: 1,
      check_outs: 1,
    });
    expect(result.data.series.find(p => p.bucket === '2026-09-25')).toEqual({
      bucket: '2026-09-25',
      check_ins: 2,
      check_outs: 1,
    });
    expect(result.data.series.find(p => p.bucket === '2026-09-20')).toEqual({
      bucket: '2026-09-20',
      check_ins: 0,
      check_outs: 0,
    });
  });

  it('sorts with empty values last, pages, searches by name and passes includeInactive / yardId to the repository', async () => {
    const seen: { includeInactive?: boolean; yardId?: string | undefined }[] = [];
    const svc = yardService(YARDS, STAYS, seen);
    const desc = await run(() =>
      svc.yardSummary(
        { sortBy: 'occupancy_pct', sortOrder: 'desc', includeInactive: true, yardId: '1' },
        NOW
      )
    );
    expect(seen[0]).toEqual({ includeInactive: true, yardId: '1' });
    expect(desc.data.table.items.map(i => i.name)).toEqual(['North', 'South']);
    const asc = await run(() =>
      svc.yardSummary({ sortBy: 'occupancy_pct', sortOrder: 'asc' }, NOW)
    );
    expect(asc.data.table.items.map(i => i.name)).toEqual(['North', 'South']); // null occupancy stays last either way
    const paged = await run(() => svc.yardSummary({ window: { page: 2, perPage: 1 } }, NOW));
    expect(paged.data.table.items.map(i => i.name)).toEqual(['South']);
    expect(paged.data.table.pagination).toMatchObject({ total: 2, page: 2 });
    const found = await run(() => svc.yardSummary({ search: 'sou' }, NOW));
    expect(found.data.table.items.map(i => i.name)).toEqual(['South']);
    expect(found.data.summary.yards_total).toBe(1);
  });

  it('refuses a range with too many buckets, and a caller without a company', async () => {
    await expect(
      run(() =>
        yardService().yardSummary(
          { from: at('2020-01-01T00:00:00Z'), to: NOW, interval: 'day' },
          NOW
        )
      )
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(yardService().yardSummary({}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

const EVENTS = [
  {
    geofenceId: '1',
    geofenceName: 'Gate',
    yardId: '1',
    vehicleId: '1',
    eventType: 'enter' as const,
    occurredAt: at('2026-09-25T09:10:00Z'),
  },
  {
    geofenceId: '1',
    geofenceName: 'Gate',
    yardId: '1',
    vehicleId: '1',
    eventType: 'exit' as const,
    occurredAt: at('2026-09-25T09:50:00Z'),
  },
  {
    geofenceId: '1',
    geofenceName: 'Gate',
    yardId: '1',
    vehicleId: '2',
    eventType: 'enter' as const,
    occurredAt: at('2026-09-24T22:00:00Z'),
  },
  {
    geofenceId: '2',
    geofenceName: 'Depot',
    yardId: null,
    vehicleId: '2',
    eventType: 'enter' as const,
    occurredAt: at('2026-09-25T09:20:00Z'),
  },
];

function geofenceService(count = EVENTS.length, seen: unknown[] = []) {
  const repo = fakeFleetDashboardRepository({
    countVisibleGeofenceEvents: (_f: Date, _t: Date, filter: unknown) => {
      seen.push(filter);
      return Promise.resolve(count);
    },
    visibleGeofenceEvents: () => Promise.resolve(EVENTS),
  });
  return new FleetActivityService(repo, fakeSettingsLookup());
}

describe('FleetActivityService.geofenceSummary (flow 07 B9)', () => {
  it('totals enter / exit, ranks the geofences and finds the busiest bucket', async () => {
    const result = await run(() => geofenceService().geofenceSummary({}, NOW));
    expect(result.data.summary).toEqual({
      total: 4,
      enter: 3,
      exit: 1,
      geofences_with_events: 2,
      vehicles_involved: 2,
      busiest_bucket: { bucket: '2026-09-25', total: 3 },
    });
    expect(result.data.top_geofences).toEqual([
      { geofence_id: '1', name: 'Gate', yard_id: '1', enter: 2, exit: 1, total: 3 },
      { geofence_id: '2', name: 'Depot', yard_id: null, enter: 1, exit: 0, total: 1 },
    ]);
    expect(result.data.series.find(p => p.bucket === '2026-09-24')).toEqual({
      bucket: '2026-09-24',
      enter: 1,
      exit: 0,
      total: 1,
    });
  });

  it('interval=hour gives local-hour labels and top limits the ranking', async () => {
    const result = await run(() =>
      geofenceService().geofenceSummary(
        {
          from: at('2026-09-25T00:00:00Z'),
          to: at('2026-09-25T23:59:59Z'),
          interval: 'hour',
          top: 1,
        },
        NOW
      )
    );
    expect(result.data.series).toHaveLength(24);
    expect(result.data.series.find(p => p.bucket === '2026-09-25T09:00')).toEqual({
      bucket: '2026-09-25T09:00',
      enter: 2,
      exit: 1,
      total: 3,
    });
    expect(result.data.top_geofences).toHaveLength(1);
  });

  it('passes the filters through, caps the number of events, and refuses more than a week of hourly buckets', async () => {
    const seen: unknown[] = [];
    await run(() =>
      geofenceService(4, seen).geofenceSummary(
        { geofenceId: '1', vehicleId: '2', yardId: '3' },
        NOW
      )
    );
    expect(seen[0]).toEqual({ geofenceId: '1', vehicleId: '2', yardId: '3' });
    await expect(
      run(() => geofenceService(200_001).geofenceSummary({}, NOW))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run(() =>
        geofenceService().geofenceSummary(
          { from: at('2026-09-01T00:00:00Z'), to: NOW, interval: 'hour' },
          NOW
        )
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('B9 query schemas', () => {
  it('accept the documented parameters and refuse unknown enum values', () => {
    expect(
      YardSummaryQuerySchema.safeParse({
        interval: 'week',
        sort_by: 'name',
        sort_order: 'desc',
        page: '2',
        per_page: '10',
        yard_id: '3',
      }).success
    ).toBe(true);
    expect(YardSummaryQuerySchema.safeParse({ interval: 'hour' }).success).toBe(false);
    expect(YardSummaryQuerySchema.safeParse({ sort_by: 'bogus' }).success).toBe(false);
    expect(
      GeofenceEventSummaryQuerySchema.safeParse({ interval: 'hour', top: '50', geofence_id: '1' })
        .success
    ).toBe(true);
    expect(GeofenceEventSummaryQuerySchema.safeParse({ top: '51' }).success).toBe(false);
    expect(GeofenceEventSummaryQuerySchema.safeParse({ interval: 'minute' }).success).toBe(false);
  });
});
