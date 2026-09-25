/* eslint-disable @typescript-eslint/no-explicit-any */
import { fullName } from '@components/AuditLine';

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'text-ink-2',
  moderate: 'text-warning',
  severe: 'text-danger',
};

/**
 * One incident's content (type, date · severity, description, and who / which vehicle — backend's
 * `driver { id, first_name, last_name }` / `vehicle { id, name, plate }` briefs, flows/06 §21; each
 * `null` when unknown). Shared by the per-driver, per-vehicle and company-wide incident lists; a list
 * that is already scoped to one driver / vehicle hides that (redundant) line. `onOpenDriver` /
 * `onOpenVehicle` turn the names into links.
 */
export default function IncidentSummary({
  incident: i,
  showDriver = true,
  showVehicle = true,
  onOpenDriver,
  onOpenVehicle,
}: {
  incident: any;
  showDriver?: boolean;
  showVehicle?: boolean;
  onOpenDriver?: (driverId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const driverName = fullName(i.driver);
  const vehicleName = i.vehicle
    ? `${i.vehicle.name || `Vehicle #${i.vehicle.id}`}${i.vehicle.plate ? ` · ${i.vehicle.plate}` : ''}`
    : null;

  const link = (label: string, onClick?: () => void) =>
    onClick ? (
      <button type="button" onClick={onClick} className="text-accent-cyan hover:underline">
        {label}
      </button>
    ) : (
      <span className="text-ink-1">{label}</span>
    );

  return (
    <>
      <div className={`text-xs font-medium ${SEVERITY_COLORS[i.severity] ?? 'text-ink-0'}`}>
        {i.incident_type}
      </div>
      <div className="text-[11px] text-ink-2 mt-1">
        {new Date(i.incident_date).toLocaleDateString()} · {i.severity}
      </div>
      {((showDriver && driverName) || (showVehicle && vehicleName)) && (
        <div className="text-[11px] text-ink-2 mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
          {showDriver && driverName && (
            <span>
              Driver:{' '}
              {link(
                driverName,
                onOpenDriver && i.driver ? () => onOpenDriver(i.driver.id) : undefined
              )}
            </span>
          )}
          {showVehicle && vehicleName && (
            <span>
              Vehicle:{' '}
              {link(
                vehicleName,
                onOpenVehicle && i.vehicle ? () => onOpenVehicle(i.vehicle.id) : undefined
              )}
            </span>
          )}
        </div>
      )}
      {i.description && <div className="text-[11px] text-ink-1 mt-1">{i.description}</div>}
    </>
  );
}
