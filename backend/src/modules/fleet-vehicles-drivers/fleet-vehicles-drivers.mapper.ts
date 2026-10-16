import type {
  vehicles as VehicleRow,
  drivers as DriverRow,
  vehicle_device_assignments as VehicleDeviceAssignmentRow,
  driver_vehicle_assignments as DriverVehicleAssignmentRow,
  driver_incidents as DriverIncidentRow,
  vehicle_maintenance_schedules as MaintenanceScheduleRow,
  vehicle_maintenance_logs as MaintenanceLogRow,
  fuel_logs as FuelLogRow,
} from '@prisma/client';
import type {
  Vehicle,
  Driver,
  VehicleDeviceAssignment,
  DriverVehicleAssignment,
  DriverIncident,
  MaintenanceSchedule,
  MaintenanceLog,
  FuelLog,
} from './fleet-vehicles-drivers.types.js';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    name: row.name,
    vehicleCategory: row.vehicle_category,
    make: row.make,
    model: row.model,
    plate: row.plate,
    vin: row.vin,
    year: row.year,
    fuelType: row.fuel_type,
    tankCapacityLiters: toNumberOrNull(row.tank_capacity_liters),
    odometerKm: toNumberOrNull(row.odometer_km),
    ownershipType: row.ownership_type,
    costCentre: row.cost_centre,
    lifecycleStatus: row.lifecycle_status,
    acquisitionDate: row.acquisition_date,
    acquisitionCost: toNumberOrNull(row.acquisition_cost),
    lengthM: toNumberOrNull(row.length_m),
    widthM: toNumberOrNull(row.width_m),
    heightM: toNumberOrNull(row.height_m),
    grossWeightKg: toNumberOrNull(row.gross_weight_kg),
    payloadKg: toNumberOrNull(row.payload_kg),
    imagePath: row.image_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toDriver(row: DriverRow): Driver {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    licenseNumber: row.license_number,
    licenseClass: row.license_class,
    licenseExpiryDate: row.license_expiry_date,
    status: row.status,
    employmentStatus: row.employment_status,
    availabilityStatus: row.availability_status,
    certifications: row.certifications,
    payrollReference: row.payroll_reference,
    hireDate: row.hire_date,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toVehicleDeviceAssignment(
  row: VehicleDeviceAssignmentRow
): VehicleDeviceAssignment {
  return {
    id: row.id.toString(),
    vehicleId: row.vehicle_id.toString(),
    deviceId: row.device_id.toString(),
    assignedAt: row.assigned_at,
    unassignedAt: row.unassigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDriverVehicleAssignment(
  row: DriverVehicleAssignmentRow
): DriverVehicleAssignment {
  return {
    id: row.id.toString(),
    driverId: row.driver_id.toString(),
    vehicleId: row.vehicle_id.toString(),
    assignedAt: row.assigned_at,
    unassignedAt: row.unassigned_at,
    assignedBy: row.assigned_by?.toString() ?? null,
    unassignedBy: row.unassigned_by?.toString() ?? null,
    notes: row.notes,
    tripCount: row.trip_count,
    distanceKm: Number(row.distance_km),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDriverIncident(row: DriverIncidentRow): DriverIncident {
  return {
    id: row.id.toString(),
    driverId: row.driver_id.toString(),
    vehicleId: row.vehicle_id?.toString() ?? null,
    incidentType: row.incident_type,
    severity: row.severity,
    incidentDate: row.incident_date,
    description: row.description,
    loggedBy: row.logged_by?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toMaintenanceSchedule(row: MaintenanceScheduleRow): MaintenanceSchedule {
  return {
    id: row.id.toString(),
    vehicleId: row.vehicle_id.toString(),
    serviceType: row.service_type,
    intervalDays: row.interval_days,
    intervalKm: row.interval_km,
    lastServiceDate: row.last_service_date,
    odometerBaselineKm: toNumberOrNull(row.odometer_baseline_km),
    odometerBaselineDate: row.odometer_baseline_date,
    lastServiceOdometerKm: toNumberOrNull(row.last_service_odometer_km),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toMaintenanceLog(row: MaintenanceLogRow): MaintenanceLog {
  return {
    id: row.id.toString(),
    vehicleId: row.vehicle_id.toString(),
    maintenanceScheduleId: row.maintenance_schedule_id?.toString() ?? null,
    serviceType: row.service_type,
    serviceDate: row.service_date,
    odometerKm: toNumberOrNull(row.odometer_km),
    cost: toNumberOrNull(row.cost),
    vendor: row.vendor,
    notes: row.notes,
    loggedBy: row.logged_by?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

export function toFuelLog(row: FuelLogRow): FuelLog {
  return {
    id: row.id.toString(),
    vehicleId: row.vehicle_id.toString(),
    fillDate: row.fill_date,
    volume: Number(row.volume),
    unit: row.unit,
    cost: toNumberOrNull(row.cost),
    odometerKm: toNumberOrNull(row.odometer_km),
    isFullTank: row.is_full_tank,
    vendor: row.vendor,
    loggedBy: row.logged_by?.toString() ?? null,
    stationName: row.station_name,
    unitPrice: toNumberOrNull(row.unit_price),
    totalCost: toNumberOrNull(row.total_cost),
    paymentMethod: row.payment_method,
    receiptReference: row.receipt_reference,
    tripId: row.trip_id?.toString() ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}

/** `is_license_expired`/`is_license_expiring_soon` — `Driver::getIsLicenseExpiredAttribute`/`getIsLicenseExpiringSoonAttribute` ported exactly (30-day window, past-expiry short-circuits "expiring soon" to `false`). */
export function isLicenseExpired(licenseExpiryDate: Date | null, now: Date): boolean | null {
  if (!licenseExpiryDate) return null;
  return licenseExpiryDate.getTime() < now.getTime();
}

export function isLicenseExpiringSoon(licenseExpiryDate: Date | null, now: Date): boolean {
  if (!licenseExpiryDate || licenseExpiryDate.getTime() < now.getTime()) return false;
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return licenseExpiryDate.getTime() <= in30Days.getTime();
}

/** `DriverVehicleAssignment::getIsActiveAttribute`/`getDurationDaysAttribute` ported exactly (whole days, `diffInDays`). */
export function assignmentIsActive(assignment: DriverVehicleAssignment): boolean {
  return assignment.unassignedAt === null;
}

export function assignmentDurationDays(assignment: DriverVehicleAssignment): number | null {
  if (!assignment.unassignedAt) return null;
  const ms = assignment.unassignedAt.getTime() - assignment.assignedAt.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
