import type {
  vehicle_maintenance_schedules as MaintenanceScheduleRow,
  vehicle_maintenance_logs as MaintenanceLogRow,
  fuel_logs as FuelLogRow,
  compliance_documents as ComplianceDocumentRow,
} from '@prisma/client';
import type {
  MaintenanceSchedule,
  MaintenanceLog,
  FuelLog,
  ComplianceDocument,
  ComplianceDocumentableType,
} from './fleet-fuel-maintenance-compliance.types.js';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
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

export function toComplianceDocument(row: ComplianceDocumentRow): ComplianceDocument {
  return {
    id: row.id.toString(),
    companyId: row.company_id.toString(),
    documentableType: row.documentable_type as ComplianceDocumentableType,
    documentableId: row.documentable_id.toString(),
    documentType: row.document_type,
    documentNumber: row.document_number,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    filePath: row.file_path,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by?.toString() ?? null,
    updatedBy: row.updated_by?.toString() ?? null,
  };
}
