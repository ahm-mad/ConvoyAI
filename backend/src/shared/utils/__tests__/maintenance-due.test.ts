import { describe, expect, it } from 'vitest';
import {
  computeScheduleDue,
  dueStatusSeverity,
  isOverdueByDate,
  nextServiceDate,
} from '../maintenance-due.js';

describe('maintenance-due (Laravel VehicleMaintenanceSchedule accessors)', () => {
  it('next = last_service_date + interval_days', () => {
    expect(nextServiceDate(new Date('2026-09-01T00:00:00Z'), 30)?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z'
    );
  });

  it('is null without a day interval (null or 0) or without a last service date', () => {
    expect(nextServiceDate(new Date('2026-09-01T00:00:00Z'), null)).toBeNull();
    expect(nextServiceDate(new Date('2026-09-01T00:00:00Z'), 0)).toBeNull();
    expect(nextServiceDate(null, 30)).toBeNull();
  });

  it('overdue is null when there is no next date, false in the future, true once past (strict, like Carbon isPast)', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(isOverdueByDate(null, now)).toBeNull();
    expect(isOverdueByDate(new Date('2026-09-25T00:00:00Z'), now)).toBe(false);
    expect(isOverdueByDate(new Date('2026-09-24T00:00:00Z'), now)).toBe(true);
    expect(isOverdueByDate(new Date('2026-09-24T12:00:00Z'), now)).toBe(false);
  });
});

describe('computeScheduleDue (D-0184, flow 07 C1)', () => {
  const NOW = new Date('2026-09-25T12:00:00Z');
  const WINDOW = { days: 7, km: 500 };
  const base = {
    intervalDays: null,
    intervalKm: null,
    lastServiceDate: null,
    lastServiceOdometerKm: null,
    odometerBaselineKm: null,
    odometerBaselineDate: null,
  };
  const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

  it('date limit: last service + interval_days; overdue once strictly past, due_soon inside the window, ok beyond it', () => {
    const at = (offsetDays: number) =>
      computeScheduleDue(
        { ...base, intervalDays: 30, lastServiceDate: day(offsetDays - 30) },
        null,
        WINDOW,
        NOW
      );
    expect(at(-2)).toMatchObject({ status: 'overdue', dueBy: 'date', daysUntilDue: -2 });
    expect(at(3)).toMatchObject({ status: 'due_soon', dueBy: 'date', daysUntilDue: 3 });
    expect(at(7)).toMatchObject({ status: 'due_soon' }); // exactly on the window edge
    expect(at(8)).toMatchObject({ status: 'ok', dueBy: null });
    expect(at(-2).nextDueOdometerKm).toBeNull();
  });

  it("odometer limit: last service odometer + interval_km against the vehicle's odometer (at or past = overdue; within the km window = due_soon)", () => {
    const sched = { ...base, intervalKm: 10_000, lastServiceOdometerKm: 40_000 };
    expect(computeScheduleDue(sched, 50_000, WINDOW, NOW)).toMatchObject({
      nextDueOdometerKm: 50_000,
      kmUntilDue: 0,
      status: 'overdue',
      dueBy: 'odometer',
    });
    expect(computeScheduleDue(sched, 50_400, WINDOW, NOW)).toMatchObject({
      kmUntilDue: -400,
      status: 'overdue',
    });
    expect(computeScheduleDue(sched, 49_600, WINDOW, NOW)).toMatchObject({
      kmUntilDue: 400,
      status: 'due_soon',
      dueBy: 'odometer',
    });
    expect(computeScheduleDue(sched, 45_000, WINDOW, NOW)).toMatchObject({
      kmUntilDue: 5_000,
      status: 'ok',
    });
    // no odometer reading on the vehicle → the km limit cannot be judged: nothing computable from it
    expect(computeScheduleDue(sched, null, WINDOW, NOW)).toMatchObject({
      nextDueOdometerKm: 50_000,
      kmUntilDue: null,
      status: 'unknown',
    });
  });

  it('the worse of the two limits wins; a schedule never serviced counts from its baseline date / odometer', () => {
    const both = {
      ...base,
      intervalDays: 90,
      intervalKm: 10_000,
      lastServiceDate: day(-10),
      lastServiceOdometerKm: 40_000,
    };
    // date fine (80 days left), odometer 100 km over → overdue by odometer
    expect(computeScheduleDue(both, 50_100, WINDOW, NOW)).toMatchObject({
      status: 'overdue',
      dueBy: 'odometer',
    });
    // baseline: never serviced, counts from the operator's baseline
    const baseline = {
      ...base,
      intervalDays: 30,
      intervalKm: 5_000,
      odometerBaselineDate: day(-40),
      odometerBaselineKm: 1_000,
    };
    expect(computeScheduleDue(baseline, 2_000, WINDOW, NOW)).toMatchObject({
      status: 'overdue',
      dueBy: 'date',
      nextDueOdometerKm: 6_000,
    });
  });

  it('nothing computable → unknown, and nothing is invented', () => {
    expect(computeScheduleDue(base, 1000, WINDOW, NOW)).toEqual({
      nextDueDate: null,
      nextDueOdometerKm: null,
      daysUntilDue: null,
      kmUntilDue: null,
      status: 'unknown',
      dueBy: null,
    });
    expect(computeScheduleDue({ ...base, intervalDays: 30 }, 1000, WINDOW, NOW).status).toBe(
      'unknown'
    ); // an interval but no base date
  });

  it('dueStatusSeverity orders overdue first', () => {
    expect(
      (
        ['ok', 'unknown', 'overdue', 'due_soon'] as ('ok' | 'unknown' | 'overdue' | 'due_soon')[]
      ).sort((a, b) => dueStatusSeverity(a) - dueStatusSeverity(b))
    ).toEqual(['overdue', 'due_soon', 'ok', 'unknown']);
  });
});
