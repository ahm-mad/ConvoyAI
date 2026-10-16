import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../platform/errors/app-error.js';
import { parseOrThrow } from '../../../platform/http/validate.js';
import { FleetVehiclesDriversService } from '../fleet-vehicles-drivers.service.js';
import {
  AVAILABILITY_STATUSES,
  EMPLOYMENT_STATUSES,
  FUEL_TYPES,
  OWNERSHIP_TYPES,
} from '../fleet-vehicles-drivers.constants.js';
import {
  CreateDriverRequestSchema,
  CreateVehicleRequestSchema,
} from '../fleet-vehicles-drivers.schemas.js';

/** D-0157 — the enforced value lists (owner decision answering frontend 04 §15 ask 1). */

function failure(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err;
    throw err;
  }
  throw new Error('expected a ValidationError');
}

const VEHICLE = { name: 'Truck' };
const DRIVER = { first_name: 'Jane', last_name: 'Doe' };

describe('POST /vehicles — fuel_type / ownership_type are enforced lists (D-0157)', () => {
  it.each(FUEL_TYPES)('accepts fuel_type %s', fuel => {
    expect(
      parseOrThrow(CreateVehicleRequestSchema, { ...VEHICLE, fuel_type: fuel }).fuel_type
    ).toBe(fuel);
  });

  it.each(OWNERSHIP_TYPES)('accepts ownership_type %s', ownership => {
    expect(
      parseOrThrow(CreateVehicleRequestSchema, { ...VEHICLE, ownership_type: ownership })
        .ownership_type
    ).toBe(ownership);
  });

  it('null / omitted stays allowed (the fields are optional)', () => {
    expect(
      parseOrThrow(CreateVehicleRequestSchema, {
        ...VEHICLE,
        fuel_type: null,
        ownership_type: null,
      })
    ).toMatchObject({
      fuel_type: null,
      ownership_type: null,
    });
    expect(parseOrThrow(CreateVehicleRequestSchema, VEHICLE).fuel_type).toBeUndefined();
  });

  it('rejects an unknown value (and a different case) with a fixed, field-level message', () => {
    const fuel = failure(() =>
      parseOrThrow(CreateVehicleRequestSchema, { ...VEHICLE, fuel_type: 'coal' })
    );
    expect(fuel.message).toBe('The selected fuel type is invalid.');
    expect(fuel.errors).toEqual({ fuel_type: ['The selected fuel type is invalid.'] });

    expect(
      failure(() => parseOrThrow(CreateVehicleRequestSchema, { ...VEHICLE, fuel_type: 'Diesel' }))
        .message
    ).toBe('The selected fuel type is invalid.');
    expect(
      failure(() =>
        parseOrThrow(CreateVehicleRequestSchema, { ...VEHICLE, ownership_type: 'stolen' })
      ).errors
    ).toEqual({ ownership_type: ['The selected ownership type is invalid.'] });
  });
});

describe('POST /drivers — employment_status / availability_status / certifications are enforced (D-0157)', () => {
  it.each(EMPLOYMENT_STATUSES)('accepts employment_status %s', status => {
    expect(
      parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, employment_status: status })
        .employment_status
    ).toBe(status);
  });

  it.each(AVAILABILITY_STATUSES)('accepts availability_status %s', status => {
    expect(
      parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, availability_status: status })
        .availability_status
    ).toBe(status);
  });

  it('rejects unknown employment/availability values with fixed messages', () => {
    expect(
      failure(() =>
        parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, employment_status: 'intern' })
      ).errors
    ).toEqual({
      employment_status: ['The selected employment status is invalid.'],
    });
    expect(
      failure(() =>
        parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, availability_status: 'sleeping' })
      ).errors
    ).toEqual({ availability_status: ['The selected availability status is invalid.'] });
  });

  it('certifications: [{ name, issued_date, expiry_date }] — dates optional/nullable, YYYY-MM-DD', () => {
    const parsed = parseOrThrow(CreateDriverRequestSchema, {
      ...DRIVER,
      certifications: [
        { name: 'HazMat', issued_date: '2025-01-31', expiry_date: '2027-01-31' },
        { name: 'First aid' },
        { name: 'Forklift', issued_date: null, expiry_date: null },
      ],
    });
    expect(parsed.certifications).toHaveLength(3);
    expect(
      parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, certifications: null }).certifications
    ).toBeNull();
    expect(
      parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, certifications: [] }).certifications
    ).toEqual([]);
  });

  it('certifications: rejects a missing/blank name, a malformed or impossible date, and unknown keys', () => {
    const bad = (entry: unknown) =>
      failure(() =>
        parseOrThrow(CreateDriverRequestSchema, { ...DRIVER, certifications: [entry] })
      );
    expect(Object.keys(bad({ issued_date: '2025-01-01' }).errors ?? {})).toEqual([
      'certifications.0.name',
    ]);
    expect(Object.keys(bad({ name: '' }).errors ?? {})).toEqual(['certifications.0.name']);
    expect(Object.keys(bad({ name: 'X', expiry_date: '31/01/2027' }).errors ?? {})).toEqual([
      'certifications.0.expiry_date',
    ]);
    expect(Object.keys(bad({ name: 'X', issued_date: '2025-02-31' }).errors ?? {})).toEqual([
      'certifications.0.issued_date',
    ]);
    expect(Object.keys(bad({ name: 'X', licence_no: '123' }).errors ?? {}).length).toBeGreaterThan(
      0
    );
  });
});

describe('GET /fleet/options (D-0157, D-0167)', () => {
  it('serves exactly the lists the request schemas validate against, plus the distinct vehicle categories', async () => {
    const service = new FleetVehiclesDriversService(
      { distinctVehicleCategories: () => Promise.resolve(['rigid', 'Van']) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    const body = await service.fleetOptions();

    expect(body).toEqual({
      success: true,
      message: 'Fleet options retrieved successfully.',
      data: {
        fuel_types: ['diesel', 'petrol', 'electric', 'hybrid', 'lpg'],
        ownership_types: ['owned', 'leased', 'rented'],
        employment_statuses: ['full_time', 'part_time', 'contractor', 'terminated'],
        availability_statuses: ['available', 'on_trip', 'on_leave', 'off_duty'],
        vehicle_categories: ['rigid', 'Van'],
      },
    });
  });
});
