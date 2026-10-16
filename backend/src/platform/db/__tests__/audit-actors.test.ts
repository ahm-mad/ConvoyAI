import { describe, expect, it } from 'vitest';
import { AUDITED_MODELS, stampActors } from '../audit-actors.js';

const withCreated = { created: true };
const withoutCreated = { created: false };

describe('stampActors (D-0172)', () => {
  it('create by a user fills created_by and updated_by', () => {
    const out = stampActors('create', { data: { name: 'x' } }, withCreated, 7n);
    expect(out['data']).toEqual({ created_by: 7n, updated_by: 7n, name: 'x' });
  });

  it('create on a model whose creator is recorded elsewhere only fills updated_by', () => {
    const out = stampActors('create', { data: { name: 'x' } }, withoutCreated, 7n);
    expect(out['data']).toEqual({ updated_by: 7n, name: 'x' });
  });

  it('an explicit value supplied by the caller always wins (even NULL)', () => {
    const out = stampActors(
      'create',
      { data: { created_by: 3n, updated_by: null } },
      withCreated,
      7n
    );
    expect(out['data']).toEqual({ created_by: 3n, updated_by: null });
  });

  it('create in the system context leaves both columns unset', () => {
    const out = stampActors('create', { data: { name: 'x' } }, withCreated, null);
    expect(out['data']).toEqual({ name: 'x' });
  });

  it('update by a user sets updated_by; update by the system sets it to NULL explicitly', () => {
    expect(stampActors('update', { data: { name: 'y' } }, withCreated, 7n)['data']).toEqual({
      updated_by: 7n,
      name: 'y',
    });
    expect(stampActors('updateMany', { data: { name: 'y' } }, withCreated, null)['data']).toEqual({
      updated_by: null,
      name: 'y',
    });
  });

  it('createMany stamps every row', () => {
    const out = stampActors(
      'createMany',
      { data: [{ a: 1 }, { a: 2, created_by: 9n }] },
      withCreated,
      7n
    );
    expect(out['data']).toEqual([
      { created_by: 7n, updated_by: 7n, a: 1 },
      { created_by: 9n, updated_by: 7n, a: 2 },
    ]);
  });

  it('upsert stamps both branches', () => {
    const out = stampActors('upsert', { create: { a: 1 }, update: { a: 2 } }, withCreated, 7n);
    expect(out['create']).toEqual({ created_by: 7n, updated_by: 7n, a: 1 });
    expect(out['update']).toEqual({ updated_by: 7n, a: 2 });
  });

  it('reads and deletes pass through untouched', () => {
    const args = { where: { id: 1n } };
    expect(stampActors('findMany', args, withCreated, 7n)).toBe(args);
    expect(stampActors('delete', args, withCreated, 7n)).toBe(args);
  });

  it('only the fleet record types are audited; trips keep their own created_by', () => {
    expect(Object.keys(AUDITED_MODELS).sort()).toEqual(
      [
        'compliance_documents',
        'driver_incidents',
        'fleet_settings', // D-0183 (F1): only `updated_by`
        'fuel_logs',
        'geofences',
        'trips',
        'vehicle_maintenance_logs',
        'vehicle_maintenance_schedules',
        'vehicles',
        'drivers',
        'yard_slots',
        'yards',
      ].sort()
    );
    expect(AUDITED_MODELS['trips']?.created).toBe(false);
    expect(AUDITED_MODELS['fuel_logs']?.created).toBe(false);
  });
});
