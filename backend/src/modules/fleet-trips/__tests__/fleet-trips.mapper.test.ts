import { describe, expect, it } from 'vitest';
import {
  tripIsEditable,
  tripCanStart,
  tripCanComplete,
  tripCanCancel,
  tripAwaitingCompletion,
  formatTripReference,
} from '../fleet-trips.mapper.js';
import type { Trip } from '../fleet-trips.types.js';

describe('Trip status helpers (Trip::isEditable/canStart/canComplete/canCancel ports)', () => {
  const statuses: Trip['status'][] = ['planned', 'in_progress', 'completed', 'cancelled'];

  it('isEditable: only planned/in_progress', () => {
    expect(statuses.filter(tripIsEditable)).toEqual(['planned', 'in_progress']);
  });

  it('canStart: only planned', () => {
    expect(statuses.filter(tripCanStart)).toEqual(['planned']);
  });

  it('canComplete: only in_progress', () => {
    expect(statuses.filter(tripCanComplete)).toEqual(['in_progress']);
  });

  it('canCancel: only planned/in_progress', () => {
    expect(statuses.filter(tripCanCancel)).toEqual(['planned', 'in_progress']);
  });
});

describe('formatTripReference (TripService::generateReference port)', () => {
  it('zero-pads to 5 digits with a TRP- prefix', () => {
    expect(formatTripReference(1)).toBe('TRP-00001');
    expect(formatTripReference(42)).toBe('TRP-00042');
    expect(formatTripReference(123456)).toBe('TRP-123456');
  });
});

describe('tripAwaitingCompletion (D-0155)', () => {
  const reached = new Date('2026-09-24T09:00:00Z');

  it('true only for an in_progress trip whose destination has been reached', () => {
    expect(tripAwaitingCompletion({ status: 'in_progress', destinationReachedAt: reached })).toBe(
      true
    );
    expect(tripAwaitingCompletion({ status: 'in_progress', destinationReachedAt: null })).toBe(
      false
    );
    expect(tripAwaitingCompletion({ status: 'completed', destinationReachedAt: reached })).toBe(
      false
    );
    expect(tripAwaitingCompletion({ status: 'cancelled', destinationReachedAt: reached })).toBe(
      false
    );
  });
});
