import { describe, expect, it } from 'vitest';
import {
  isLicenseExpired,
  isLicenseExpiringSoon,
  assignmentIsActive,
  assignmentDurationDays,
} from '../fleet-vehicles-drivers.mapper.js';
import type { DriverVehicleAssignment } from '../fleet-vehicles-drivers.types.js';

const NOW = new Date('2026-09-15T00:00:00.000Z');

function assignment(overrides: Partial<DriverVehicleAssignment> = {}): DriverVehicleAssignment {
  return {
    id: '1',
    driverId: '1',
    vehicleId: '1',
    assignedAt: new Date('2026-09-01T00:00:00.000Z'),
    unassignedAt: null,
    assignedBy: null,
    unassignedBy: null,
    notes: null,
    tripCount: 0,
    distanceKm: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('isLicenseExpired', () => {
  it('returns null when there is no license expiry date', () => {
    expect(isLicenseExpired(null, NOW)).toBeNull();
  });

  it('returns true for a past date', () => {
    expect(isLicenseExpired(new Date('2026-01-01T00:00:00.000Z'), NOW)).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isLicenseExpired(new Date('2027-01-01T00:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('isLicenseExpiringSoon', () => {
  it('returns false when there is no license expiry date', () => {
    expect(isLicenseExpiringSoon(null, NOW)).toBe(false);
  });

  it("returns false for an already-expired license (Driver::getIsLicenseExpiringSoonAttribute's short-circuit)", () => {
    expect(isLicenseExpiringSoon(new Date('2026-01-01T00:00:00.000Z'), NOW)).toBe(false);
  });

  it('returns true within the 30-day window', () => {
    expect(isLicenseExpiringSoon(new Date('2026-09-25T00:00:00.000Z'), NOW)).toBe(true);
  });

  it('returns false beyond the 30-day window', () => {
    expect(isLicenseExpiringSoon(new Date('2026-12-01T00:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('assignmentIsActive / assignmentDurationDays', () => {
  it('an open assignment is active with a null duration', () => {
    const a = assignment({ unassignedAt: null });
    expect(assignmentIsActive(a)).toBe(true);
    expect(assignmentDurationDays(a)).toBeNull();
  });

  it('a closed assignment is not active and has a whole-day duration', () => {
    const a = assignment({
      assignedAt: new Date('2026-09-01T00:00:00.000Z'),
      unassignedAt: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect(assignmentIsActive(a)).toBe(false);
    expect(assignmentDurationDays(a)).toBe(4);
  });
});
