import { describe, expect, it } from 'vitest';
import { isOffline, OFFLINE_THRESHOLD_MINUTES } from '../offline.js';

describe('isOffline', () => {
  const now = new Date('2026-09-15T12:00:00.000Z');

  it('is offline with no last-seen timestamp at all', () => {
    expect(isOffline(null, now)).toBe(true);
  });

  it('is online just under the threshold', () => {
    const lastSeenAt = new Date(now.getTime() - (OFFLINE_THRESHOLD_MINUTES * 60 * 1000 - 1));
    expect(isOffline(lastSeenAt, now)).toBe(false);
  });

  it('is offline just over the threshold', () => {
    const lastSeenAt = new Date(now.getTime() - (OFFLINE_THRESHOLD_MINUTES * 60 * 1000 + 1));
    expect(isOffline(lastSeenAt, now)).toBe(true);
  });

  it('is online exactly at the threshold (strictly greater-than, not greater-or-equal)', () => {
    const lastSeenAt = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);
    expect(isOffline(lastSeenAt, now)).toBe(false);
  });
});
