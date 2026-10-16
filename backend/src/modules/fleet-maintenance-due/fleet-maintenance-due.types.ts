import type { DueStatus, ScheduleDue } from '../../shared/utils/maintenance-due.js';

/**
 * Module 4.10 (fleet-maintenance-due, D-0184, flow 07 ask C1): the company-wide maintenance-schedule list with computed due state.
 * Reads `vehicle_maintenance_schedules` (`parent:vehicles`, joined through `vehicles.company_id` by hand) — it owns no table and changes nothing.
 */
export interface ScheduleWithVehicle {
  id: string;
  vehicleId: string;
  serviceType: string;
  intervalDays: number | null;
  intervalKm: number | null;
  lastServiceDate: Date | null;
  odometerBaselineKm: number | null;
  odometerBaselineDate: Date | null;
  lastServiceOdometerKm: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  vehicle: {
    id: string;
    name: string;
    plate: string | null;
    category: string | null;
    odometerKm: number | null;
  };
}

export interface DueRow extends ScheduleWithVehicle {
  due: ScheduleDue;
}

export const SCHEDULE_SORT_FIELDS = [
  'next_due_date',
  'status',
  'vehicle_name',
  'service_type',
  'last_service_date',
  'days_until_due',
  'km_until_due',
] as const;
export type ScheduleSortField = (typeof SCHEDULE_SORT_FIELDS)[number];

export interface ScheduleListQuery {
  statuses?: DueStatus[] | undefined;
  vehicleIds?: string[] | undefined;
  serviceType?: string | undefined;
  vehicleCategory?: string | undefined;
  /** Only schedules whose next due date is on or before this instant. */
  dueBefore?: Date | undefined;
  search?: string | undefined;
  includeInactive?: boolean | undefined;
  sortBy?: ScheduleSortField | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  window?: { page: number; perPage: number } | undefined;
}
