import type { FieldDef } from '@components/records/RecordForm';

/** Edit-form fields per log-type record (mirrors the PUT bodies in the contract, flows/06 §15.5). */

export const MAINTENANCE_SCHEDULE_FIELDS: FieldDef[] = [
  { key: 'service_type', label: 'Service type', type: 'text', required: true, wide: true },
  { key: 'interval_days', label: 'Interval (days)', type: 'number', step: '1' },
  { key: 'interval_km', label: 'Interval (km)', type: 'number', step: '1', qty: 'distance' },
  { key: 'last_service_date', label: 'Last service date', type: 'date' },
  {
    key: 'last_service_odometer_km',
    label: 'Last service odometer (km)',
    type: 'number',
    qty: 'distance',
  },
];

export const maintenanceLogFields = (schedules: any[]): FieldDef[] => [
  { key: 'service_type', label: 'Service performed', type: 'text', required: true, wide: true },
  { key: 'service_date', label: 'Service date', type: 'date', required: true },
  {
    key: 'maintenance_schedule_id',
    label: 'For schedule',
    type: 'select',
    options: schedules.map(s => ({ value: String(s.id), label: s.service_type })),
  },
  { key: 'odometer_km', label: 'Odometer (km)', type: 'number', qty: 'distance' },
  { key: 'cost', label: 'Cost', type: 'number' },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export const FUEL_LOG_FIELDS: FieldDef[] = [
  { key: 'fill_date', label: 'Fill date', type: 'date', required: true },
  {
    key: 'unit',
    label: 'Unit',
    type: 'select',
    required: true,
    options: [
      { value: 'liters', label: 'Liters' },
      { value: 'gallons', label: 'Gallons' },
    ],
  },
  { key: 'volume', label: 'Volume', type: 'number', required: true },
  { key: 'odometer_km', label: 'Odometer (km)', type: 'number', qty: 'distance' },
  { key: 'cost', label: 'Cost', type: 'number' },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'station_name', label: 'Station', type: 'text' },
  { key: 'receipt_reference', label: 'Receipt reference', type: 'text' },
  { key: 'is_full_tank', label: 'Full tank fill-up', type: 'checkbox' },
];

export const DOCUMENT_FIELDS: FieldDef[] = [
  { key: 'document_type', label: 'Document type', type: 'text', required: true, wide: true },
  { key: 'document_number', label: 'Document number', type: 'text' },
  { key: 'issue_date', label: 'Issue date', type: 'date' },
  { key: 'expiry_date', label: 'Expiry date', type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export const INCIDENT_FIELDS: FieldDef[] = [
  { key: 'incident_type', label: 'Incident type', type: 'text', required: true, wide: true },
  {
    key: 'severity',
    label: 'Severity',
    type: 'select',
    required: true,
    options: [
      { value: 'minor', label: 'Minor' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'severe', label: 'Severe' },
    ],
  },
  { key: 'incident_date', label: 'Incident date', type: 'date', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
];

export const SEVERITY_FILTER = {
  key: 'severity',
  label: 'Severity',
  options: [
    { value: 'minor', label: 'Minor' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'severe', label: 'Severe' },
  ],
};
