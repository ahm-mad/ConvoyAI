/**
 * `VehicleMaintenanceSchedule::getNextServiceDateAttribute`/`getIsOverdueByDateAttribute` (Laravel `$appends`, KNOWN_ISSUES
 * 11.81) — real date math, no invented numbers: `null` when the schedule has no day interval or no last service date,
 * never a guess. `isPast()` is a strict "before now" comparison, so a due date of today (00:00 UTC) counts as overdue
 * from the start of that day — exactly Carbon's behaviour.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function nextServiceDate(
  lastServiceDate: Date | null,
  intervalDays: number | null
): Date | null {
  if (!intervalDays || !lastServiceDate) return null;
  return new Date(lastServiceDate.getTime() + intervalDays * MS_PER_DAY);
}

export function isOverdueByDate(next: Date | null, now: Date = new Date()): boolean | null {
  return next ? next.getTime() < now.getTime() : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// D-0184 (flow 07 ask C1): the computed due state of a schedule for the company-wide list.
// ---------------------------------------------------------------------------------------------------------------------

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export interface ScheduleDueInput {
  intervalDays: number | null;
  intervalKm: number | null;
  lastServiceDate: Date | null;
  lastServiceOdometerKm: number | null;
  odometerBaselineKm: number | null;
  odometerBaselineDate: Date | null;
}

export interface ScheduleDue {
  nextDueDate: Date | null;
  nextDueOdometerKm: number | null;
  /** Whole days from now to the due date, rounded up (negative once overdue); `null` without a due date. */
  daysUntilDue: number | null;
  /** Km from the vehicle's odometer to the due odometer (negative once overdue); `null` without a due odometer or an odometer reading. */
  kmUntilDue: number | null;
  status: DueStatus;
  /** Which limit decided the status (`date` / `odometer`); `null` for `ok` / `unknown`. */
  dueBy: 'date' | 'odometer' | null;
}

const RANK: Record<DueStatus, number> = { overdue: 3, due_soon: 2, ok: 1, unknown: 0 };

/**
 * A schedule counts from its last service, or — never serviced — from the operator's baseline (`odometer_baseline_date` / `odometer_baseline_km`):
 * `next_due_date = base date + interval_days`, `next_due_odometer_km = base odometer + interval_km`. Either limit can make it `overdue` (the date
 * strictly passed — the rule `is_overdue_by_date` already uses — or the vehicle's odometer at / past the due odometer) or `due_soon` (within the
 * company's due-soon window: days and km); the worse of the two wins. Nothing computable (no interval, or no base) → `unknown`; nothing is guessed.
 */
export function computeScheduleDue(
  schedule: ScheduleDueInput,
  vehicleOdometerKm: number | null,
  window: { days: number; km: number },
  now: Date = new Date()
): ScheduleDue {
  const baseDate = schedule.lastServiceDate ?? schedule.odometerBaselineDate;
  const baseOdo = schedule.lastServiceOdometerKm ?? schedule.odometerBaselineKm;
  const nextDueDate = nextServiceDate(baseDate, schedule.intervalDays);
  const nextDueOdometerKm =
    schedule.intervalKm && baseOdo !== null ? baseOdo + schedule.intervalKm : null;
  const daysUntilDue = nextDueDate
    ? Math.ceil((nextDueDate.getTime() - now.getTime()) / MS_PER_DAY)
    : null;
  const kmUntilDue =
    nextDueOdometerKm !== null && vehicleOdometerKm !== null
      ? nextDueOdometerKm - vehicleOdometerKm
      : null;

  let status: DueStatus = 'unknown';
  let dueBy: 'date' | 'odometer' | null = null;
  const consider = (candidate: DueStatus, by: 'date' | 'odometer') => {
    if (RANK[candidate] > RANK[status]) {
      status = candidate;
      dueBy = candidate === 'overdue' || candidate === 'due_soon' ? by : null;
    }
  };
  if (nextDueDate) {
    if (nextDueDate.getTime() < now.getTime()) consider('overdue', 'date');
    else if (nextDueDate.getTime() - now.getTime() <= window.days * MS_PER_DAY)
      consider('due_soon', 'date');
    else consider('ok', 'date');
  }
  if (kmUntilDue !== null) {
    if (kmUntilDue <= 0) consider('overdue', 'odometer');
    else if (kmUntilDue <= window.km) consider('due_soon', 'odometer');
    else consider('ok', 'odometer');
  }
  return { nextDueDate, nextDueOdometerKm, daysUntilDue, kmUntilDue, status, dueBy };
}

/** Sort weight of a status: worst first when ascending. */
export function dueStatusSeverity(status: DueStatus): number {
  return 3 - RANK[status];
}
