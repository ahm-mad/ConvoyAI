import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  OPTIONS_LIMIT,
  optionsResponse,
  buildPagination,
  dateWithinDays,
  flagValue,
  idListParam,
  listData,
  listQueryShape,
  mergeIdLists,
  orderByWithTieBreak,
  resolveWindow,
  sortByEnum,
} from '../list-query.js';
import {
  ListTripsQuerySchema,
  mergedTripStatuses,
} from '../../../modules/fleet-trips/fleet-trips.schemas.js';
import {
  DriverOptionsQuerySchema,
  ListDriversQuerySchema as ListDriversQuerySchemaForTest,
  ListVehiclesQuerySchema,
  VehicleOptionsQuerySchema,
} from '../../../modules/fleet-vehicles-drivers/fleet-vehicles-drivers.schemas.js';
import { ListGeofenceEventsQuerySchema } from '../../../modules/fleet-geofences/fleet-geofences.schemas.js';

describe('resolveWindow / listData (opt-in paging, D-0164)', () => {
  it('is undefined (flat list) when neither page nor per_page is given', () => {
    expect(resolveWindow({})).toBeUndefined();
  });

  it('defaults the missing half: page → 1, per_page → 20', () => {
    expect(resolveWindow({ page: 3 })).toEqual({ page: 3, perPage: 20 });
    expect(resolveWindow({ per_page: 50 })).toEqual({ page: 1, perPage: 50 });
  });

  it('returns the array itself without a window and { items, pagination } with one', () => {
    expect(listData([1, 2], 2, undefined)).toEqual([1, 2]);
    expect(listData([1, 2], 41, { page: 2, perPage: 20 })).toEqual({
      items: [1, 2],
      pagination: { page: 2, per_page: 20, total: 41, total_pages: 3 },
    });
  });

  it('never reports fewer than one page', () => {
    expect(buildPagination(0, { page: 1, perPage: 20 })).toMatchObject({
      total: 0,
      total_pages: 1,
    });
  });
});

describe('orderByWithTieBreak', () => {
  it("keeps the default order and breaks ties by id in the default's direction", () => {
    expect(orderByWithTieBreak(undefined, undefined, [{ name: 'asc' }])).toEqual([
      { name: 'asc' },
      { id: 'asc' },
    ]);
    expect(orderByWithTieBreak(undefined, undefined, [{ created_at: 'desc' }])).toEqual([
      { created_at: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('orders by the chosen column then id, both in the requested direction (asc when omitted)', () => {
    expect(orderByWithTieBreak('plate', 'desc', [{ name: 'asc' }])).toEqual([
      { plate: 'desc' },
      { id: 'desc' },
    ]);
    expect(orderByWithTieBreak('plate', undefined, [{ name: 'asc' }])).toEqual([
      { plate: 'asc' },
      { id: 'asc' },
    ]);
  });
});

describe('query schema pieces', () => {
  const schema = z.object({
    sort_by: sortByEnum(['name', 'created_at'] as const),
    ...listQueryShape,
  });

  it('trims search and treats a blank search as absent', () => {
    expect(schema.parse({ search: '  truck  ' }).search).toBe('truck');
    expect(schema.parse({ search: '   ' }).search).toBeUndefined();
  });

  it('rejects an unknown sort_by / sort_order with the fixed messages', () => {
    const bad = schema.safeParse({ sort_by: 'password', sort_order: 'sideways' });
    expect(bad.success).toBe(false);
    const messages = bad.error?.issues.map(issue => issue.message);
    expect(messages).toContain('The selected sort by is invalid.');
    expect(messages).toContain('The selected sort order is invalid.');
  });

  it('caps per_page at 100 and requires page >= 1', () => {
    expect(schema.safeParse({ per_page: '101' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.parse({ page: '2', per_page: '100' })).toMatchObject({ page: 2, per_page: 100 });
  });

  it('flagValue understands 1/true/0/false', () => {
    expect([
      flagValue('1'),
      flagValue('true'),
      flagValue('0'),
      flagValue('false'),
      flagValue(undefined),
    ]).toEqual([true, true, false, false, undefined]);
  });
});

describe('dateWithinDays', () => {
  it('spans from today (UTC midnight) to today + N days', () => {
    const { from, to } = dateWithinDays(30, new Date('2026-09-24T18:45:00Z'));
    expect(from.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });
});

describe('the fleet list schemas built on it', () => {
  it('trips: status accepts one value, a comma list or status[] and rejects an unknown one', () => {
    expect(ListTripsQuerySchema.parse({ status: 'planned' }).status).toEqual(['planned']);
    expect(ListTripsQuerySchema.parse({ status: 'planned, in_progress,planned' }).status).toEqual([
      'planned',
      'in_progress',
    ]);
    expect(ListTripsQuerySchema.parse({ status: ['completed', 'cancelled'] }).status).toEqual([
      'completed',
      'cancelled',
    ]);
    expect(ListTripsQuerySchema.parse({}).status).toBeUndefined();
    const bad = ListTripsQuerySchema.safeParse({ status: 'planned,flying' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe('The selected status is invalid.');
  });

  it("trips: the bracketed status[] key Express 5's simple parser produces is validated and merged into status", () => {
    const parsed = ListTripsQuerySchema.parse({ 'status[]': ['planned', 'in_progress'] });
    expect(mergedTripStatuses(parsed)).toEqual(['planned', 'in_progress']);
    expect(
      mergedTripStatuses(
        ListTripsQuerySchema.parse({ 'status[]': 'completed', status: 'planned,completed' })
      )
    ).toEqual(['planned', 'completed']);
    expect(mergedTripStatuses(ListTripsQuerySchema.parse({}))).toBeUndefined();
    expect(ListTripsQuerySchema.safeParse({ 'status[]': 'flying' }).success).toBe(false);
  });

  it('trips keep their always-paged defaults (page 1, per_page 20)', () => {
    expect(ListTripsQuerySchema.parse({})).toMatchObject({ page: 1, per_page: 20 });
  });

  it('vehicles: the sort whitelist and status enum are enforced', () => {
    expect(
      ListVehiclesQuerySchema.safeParse({ sort_by: 'odometer_km', status: 'retired' }).success
    ).toBe(true);
    expect(ListVehiclesQuerySchema.safeParse({ sort_by: 'vin' }).success).toBe(false);
    expect(ListVehiclesQuerySchema.safeParse({ status: 'flying' }).success).toBe(false);
    expect(ListVehiclesQuerySchema.parse({}).page).toBeUndefined(); // no paging unless asked
  });

  it('geofence events: limit stays 50 by default and the new filters validate', () => {
    expect(ListGeofenceEventsQuerySchema.parse({}).limit).toBe(50);
    const parsed = ListGeofenceEventsQuerySchema.parse({
      event_type: 'exit',
      from: '2026-09-01T00:00:00+05:00',
      geofence_id: '3',
    });
    expect(parsed.event_type).toBe('exit');
    expect(parsed.from?.toISOString()).toBe('2026-08-31T19:00:00.000Z');
    expect(parsed.geofence_id).toBe(3);
    expect(ListGeofenceEventsQuerySchema.safeParse({ event_type: 'teleport' }).success).toBe(false);
    expect(ListGeofenceEventsQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
  });
});

describe('options endpoints (D-0165, B2)', () => {
  it('limit defaults to nothing here (the controller uses 1000), max 1000, and is validated', () => {
    expect(OPTIONS_LIMIT).toBe(1000);
    expect(VehicleOptionsQuerySchema.parse({}).limit).toBeUndefined();
    expect(VehicleOptionsQuerySchema.parse({ limit: '50', search: '  van ' })).toMatchObject({
      limit: 50,
      search: 'van',
    });
    expect(VehicleOptionsQuerySchema.safeParse({ limit: '1001' }).success).toBe(false);
    expect(DriverOptionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('optionsResponse marks a cut-off list as truncated', () => {
    expect(optionsResponse('m', [1, 2], 2, 1000).meta).toEqual({
      total: 2,
      limit: 1000,
      truncated: false,
    });
    expect(optionsResponse('m', [1, 2], 40, 2).meta).toEqual({
      total: 40,
      limit: 2,
      truncated: true,
    });
  });
});

describe('orderByWithTieBreak nulls last (D-0167, R1)', () => {
  it('adds nulls:last in both directions only for the nullable sort columns', () => {
    expect(orderByWithTieBreak('odometer_km', 'desc', [{ name: 'asc' }], ['odometer_km'])).toEqual([
      { odometer_km: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
    expect(orderByWithTieBreak('odometer_km', 'asc', [{ name: 'asc' }], ['odometer_km'])).toEqual([
      { odometer_km: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
    // a NOT NULL column keeps the plain direction (Prisma rejects `nulls` there)
    expect(orderByWithTieBreak('name', 'desc', [{ name: 'asc' }], ['odometer_km'])).toEqual([
      { name: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('leaves the default order alone', () => {
    expect(
      orderByWithTieBreak(undefined, undefined, [{ expiry_date: 'desc' }], ['expiry_date'])
    ).toEqual([{ expiry_date: 'desc' }, { id: 'desc' }]);
  });

  it('license_state and the new sort fields are validated', () => {
    expect(
      ListDriversQuerySchemaForTest.safeParse({ license_state: 'valid', sort_by: 'status' }).success
    ).toBe(true);
    expect(ListDriversQuerySchemaForTest.safeParse({ license_state: 'old' }).success).toBe(false);
  });
});

describe('idListParam / mergeIdLists (D-0184)', () => {
  const schema = idListParam('vehicle id');
  it('reads comma lists and repeated params, de-duplicates, and leaves an absent / blank filter undefined', () => {
    expect(schema.parse('1,2, 3')).toEqual(['1', '2', '3']);
    expect(schema.parse(['1', '2,3', '2'])).toEqual(['1', '2', '3']);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('')).toBeUndefined();
  });
  it('rejects anything that is not a whole number with the fixed message', () => {
    for (const bad of ['a', '1,b', '-1', '1.5'])
      expect(schema.safeParse(bad).error?.issues[0]?.message).toBe(
        'The vehicle id must be a list of ids.'
      );
  });
  it('mergeIdLists combines the plain and the [] spelling', () => {
    expect(mergeIdLists(['1'], ['2', '1'])).toEqual(['1', '2']);
    expect(mergeIdLists(undefined, undefined)).toBeUndefined();
  });
});
