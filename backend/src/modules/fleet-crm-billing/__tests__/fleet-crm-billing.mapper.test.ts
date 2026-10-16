import { describe, expect, it } from 'vitest';
import { buildBillableEventDrafts } from '../fleet-crm-billing.mapper.js';

const TRIP_BASE = {
  id: '1',
  fleetCustomerId: '9',
  actualDistanceKm: null,
  actualDurationMinutes: null,
};

describe('buildBillableEventDrafts (BillingService::buildEvents, pure)', () => {
  it('generates a zero-rate distance event when there is no contract at all (explicit old-app design intent — finance fills in rates manually later)', () => {
    const drafts = buildBillableEventDrafts(
      { ...TRIP_BASE, actualDistanceKm: 150 },
      null,
      new Map()
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      eventType: 'distance',
      quantity: 150,
      unitRate: 0,
      amount: 0,
      currency: 'USD',
    });
  });

  it('always includes the distance event (even zero-rate), unlike duration which is skipped entirely when unrated', () => {
    const drafts = buildBillableEventDrafts(
      { ...TRIP_BASE, actualDistanceKm: 100, actualDurationMinutes: 120 },
      { id: '5', currency: 'USD' },
      new Map() // no rate cards at all
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.eventType).toBe('distance');
  });

  it('computes the distance event correctly against a real km rate card', () => {
    const drafts = buildBillableEventDrafts(
      { ...TRIP_BASE, actualDistanceKm: 100 },
      { id: '5', currency: 'USD' },
      new Map([['km', { id: '10', unitRate: 2.5 }]])
    );

    expect(drafts[0]).toMatchObject({
      eventType: 'distance',
      rateCardId: '10',
      quantity: 100,
      unit: 'km',
      unitRate: 2.5,
      amount: 250,
    });
  });

  it('includes a duration event only when an hourly rate card exists with unitRate > 0', () => {
    const withRate = buildBillableEventDrafts(
      { ...TRIP_BASE, actualDurationMinutes: 120 },
      { id: '5', currency: 'USD' },
      new Map([['hour', { id: '11', unitRate: 20 }]])
    );
    expect(withRate.find(d => d.eventType === 'duration')).toMatchObject({
      quantity: 2,
      unit: 'hour',
      unitRate: 20,
      amount: 40,
    });

    const withZeroRate = buildBillableEventDrafts(
      { ...TRIP_BASE, actualDurationMinutes: 120 },
      { id: '5', currency: 'USD' },
      new Map([['hour', { id: '11', unitRate: 0 }]])
    );
    expect(withZeroRate.find(d => d.eventType === 'duration')).toBeUndefined();
  });

  it('includes a flat delivery fee only when a delivery rate card exists with unitRate > 0', () => {
    const drafts = buildBillableEventDrafts(
      TRIP_BASE,
      { id: '5', currency: 'USD' },
      new Map([['delivery', { id: '12', unitRate: 15 }]])
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      eventType: 'delivery',
      quantity: 1,
      unitRate: 15,
      amount: 15,
    });
  });

  it('generates all 3 events together when distance, duration, and delivery rate cards all apply', () => {
    const drafts = buildBillableEventDrafts(
      { id: '1', fleetCustomerId: '9', actualDistanceKm: 100, actualDurationMinutes: 60 },
      { id: '5', currency: 'EUR' },
      new Map([
        ['km', { id: '10', unitRate: 1 }],
        ['hour', { id: '11', unitRate: 20 }],
        ['delivery', { id: '12', unitRate: 15 }],
      ])
    );

    expect(drafts.map(d => d.eventType)).toEqual(['distance', 'duration', 'delivery']);
    expect(drafts.every(d => d.currency === 'EUR')).toBe(true);
    expect(drafts.every(d => d.fleetCustomerId === '9')).toBe(true);
    // KNOWN_ISSUES 11.56: the old app's generateFromTrip() doubled this
    // count via a reused-variable bug. This pure function alone can't
    // prove the outer bug is fixed (that's the service's job), but it does
    // prove the draft count itself is correct — exactly 3, not 6.
    expect(drafts).toHaveLength(3);
  });

  it('generates nothing when the trip has no distance, duration, or applicable rate cards', () => {
    const drafts = buildBillableEventDrafts(TRIP_BASE, null, new Map());
    expect(drafts).toHaveLength(0);
  });
});
