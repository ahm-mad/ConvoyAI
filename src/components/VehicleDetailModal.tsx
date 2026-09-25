// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect } from 'react';
import { X, Gauge, Wrench, Warehouse, Plus } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUnits } from '@hooks/useUnits';
import { formatQty, toMetric } from '@utils/units';
import { useFleetCurrency } from '@utils/fleetCurrency';
import { useTheme } from '@contexts/ThemeContext';
import { post } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import VehicleMarker from '@components/VehicleMarker';
import ComplianceTab from '@components/ComplianceTab';
import VehicleEditForm from '@components/VehicleEditForm';
import DeactivateControls from '@components/DeactivateControls';
import AssignmentHistory from '@components/AssignmentHistory';
import VehicleImageControl from '@components/VehicleImageControl';
import OptionSelect from '@components/OptionSelect';
import AuditLine from '@components/AuditLine';
import RecordItem from '@components/records/RecordItem';
import PagedRecords from '@components/records/PagedRecords';
import IncidentSummary from '@components/records/IncidentSummary';
import {
  MAINTENANCE_SCHEDULE_FIELDS,
  maintenanceLogFields,
  FUEL_LOG_FIELDS,
  INCIDENT_FIELDS,
  SEVERITY_FILTER,
} from '@components/records/fields';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Comprehensive vehicle detail — consumes GET /api/vehicles/{id} exactly
 * as built during the vehicle/tracker split. Genuinely keyed on the
 * vehicle now, not the tracker — survives a tracker swap intact.
 * Deliberately shows a real "—" / "not configured" state for anything
 * that isn't actually measured or set up, rather than a fabricated
 * number sitting next to genuinely real ones.
 *
 * refetchInterval added after a direct question about live tracking
 * surfaced a real gap: FleetMap.jsx already polled every 30s, but this
 * modal — the actual focused single-vehicle view a manager would open to
 * watch one truck — didn't refresh at all once opened. 15s here,
 * deliberately shorter than the fleet overview's 30s, since a focused
 * single-vehicle view is exactly where fresher data matters most.
 */
export default function VehicleDetailModal({ vehicleId, initialTab = 'overview' }: any) {
  const { closeModal } = useModal();
  const [tab, setTab] = useState(initialTab);

  const { data, isLoading, refetch, dataUpdatedAt } = useSimpleQuery(
    `vehicle-detail-${vehicleId}`,
    `/api/vehicles/${vehicleId}`,
    {},
    { refetchInterval: 120000 } // fleet:position updates current_position live; slow safety poll
  );
  const detail = data?.success ? data.data : null;
  const vehicle = detail?.vehicle;

  return (
    <div className="glass-strong  w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">{vehicle?.name || 'Vehicle Detail'}</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {vehicle?.vehicle_category}
            {vehicle?.make && ` · ${vehicle.make} ${vehicle.model || ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt && (
            <div
              className="flex items-center gap-1.5 text-[10px] text-ink-2"
              title="Refreshes automatically every 15s"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              Live — updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </div>
          )}
          <button onClick={closeModal} className="text-ink-2 hover:text-ink-0">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-5 pt-2 border-b border-line">
        {['overview', 'tracker', 'maintenance', 'fuel', 'compliance', 'vehicle history'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-medium px-3 py-1.5 border-b-2 -mb-px capitalize whitespace-nowrap ${
              tab === t ? 'text-ink-0 border-accent-cyan' : 'text-ink-2 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && <div className="text-xs text-ink-2 text-center py-8">Loading…</div>}

        {!isLoading && detail && tab === 'overview' && (
          <OverviewTab detail={detail} vehicleId={vehicleId} onChanged={refetch} />
        )}
        {!isLoading && detail && tab === 'tracker' && (
          <TrackerTab vehicleId={vehicleId} vehicle={vehicle} onChanged={refetch} />
        )}
        {!isLoading && detail && tab === 'maintenance' && (
          <MaintenanceTab
            vehicleId={vehicleId}
            schedules={detail.maintenance_schedules}
            onCreated={refetch}
          />
        )}
        {!isLoading && detail && tab === 'fuel' && (
          <FuelTab vehicleId={vehicleId} economy={detail.fuel_economy} onCreated={refetch} />
        )}
        {!isLoading && detail && tab === 'compliance' && (
          <ComplianceTab documentableType="vehicle" documentableId={vehicleId} />
        )}
        {!isLoading && detail && tab === 'vehicle history' && (
          // <YardHistoryTab history={detail.yard_history} onChanged={refetch} />
          <VehicleHistoryTab
            vehicleId={vehicleId}
            yardHistory={detail.yard_history}
            onChanged={refetch}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="bg-surface-2 rounded-md p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-ink-2 uppercase tracking-wide">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="text-lg font-mono font-semibold text-ink-0 mt-1">
        {value === null || value === undefined ? (
          <span className="text-ink-2 text-sm">— not measured</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function OverviewTab({ detail, vehicleId, onChanged }) {
  const u = useUnits();
  const { vehicle, current_position: currentPosition, stats } = detail;
  const [driverId, setDriverId] = useState('');
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [editing, setEditing] = useState(false);
  const currentDriver = vehicle.current_driver_assignment?.driver;
  const inactive = vehicle.lifecycle_status === 'retired' || vehicle.lifecycle_status === 'sold';

  if (editing) {
    return (
      <VehicleEditForm
        vehicle={vehicle}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }

  return (
    <div>
      {/* Edit / deactivate (flows/05 §8). A deactivated vehicle shows a Reactivate banner instead. */}
      {inactive ? (
        <DeactivateControls
          basePath={`/api/vehicles/${vehicleId}`}
          inactive
          entityLabel="vehicle"
          onChanged={onChanged}
          allowDelete
        />
      ) : (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 whitespace-nowrap text-[11px] text-accent-cyan border border-line rounded px-2.5 py-1 hover:bg-surface-2"
          >
            Edit vehicle
          </button>
          <DeactivateControls
            basePath={`/api/vehicles/${vehicleId}`}
            inactive={false}
            entityLabel="vehicle"
            onChanged={onChanged}
            allowDelete
          />
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 bg-surface-2 rounded-md p-3">
        <VehicleImageControl
          vehicleId={vehicleId}
          imageUrl={vehicle.image_url}
          onChanged={onChanged}
        />
        <div>
          <div className="text-sm text-ink-0">
            {vehicle.make || 'Unknown'} {vehicle.model || ''}
          </div>
          <div className="text-[11px] text-ink-2 mt-0.5">
            {vehicle.vehicle_category || 'Category not set'}
            {vehicle.plate && ` · ${vehicle.plate}`}
            {vehicle.year && ` · ${vehicle.year}`}
            {vehicle.length_m && ` · ${formatQty(u.length, vehicle.length_m)} long`}
            {' · '}
            <span className="capitalize">{vehicle.lifecycle_status?.replace('_', ' ')}</span>
          </div>
          <AuditLine record={vehicle} className="text-[10px] text-ink-2 mt-1" />
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Current Driver</div>
      {currentDriver ? (
        <div className="bg-surface-2 rounded-md p-3 mb-4">
          <div className="text-sm text-ink-0">
            {currentDriver.first_name} {currentDriver.last_name}
          </div>
          <button
            onClick={async () => {
              setAssigningDriver(true);
              const response = await post(
                `/api/drivers/${currentDriver.id}/unassign-vehicle`,
                {},
                {},
                false
              );
              setAssigningDriver(false);

              if (response?.error || response?.success === false) {
                toast.error(response?.message || 'Could not unassign driver.');

                return;
              }

              toast.success('Driver unassigned.');
              onChanged?.();
            }}
            disabled={assigningDriver}
            className="w-full mt-2 text-xs text-danger border border-danger/40 bg-danger/10 rounded-md py-1.5"
          >
            {assigningDriver ? 'Unassigning…' : 'Unassign Driver'}
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <div className="text-[11px] text-ink-2 italic mb-2">No driver currently assigned.</div>
          <div className="flex gap-2">
            {/* A driver can only be on one vehicle (backend 422s otherwise): offer only unassigned, active ones. */}
            <OptionSelect
              kind="drivers"
              params={{ assigned: 0 }}
              value={driverId}
              onChange={setDriverId}
              placeholder="Select driver"
              emptyLabel="No unassigned drivers"
              getOption={d => ({
                label: `${d.name}${d.license_number ? ` · ${d.license_number}` : ''}`,
              })}
            />
            <button
              onClick={async () => {
                if (!driverId) return;
                setAssigningDriver(true);
                // No /api/vehicles/{id}/assign-driver endpoint exists —
                // the real one lives under drivers
                // (DriverController::assignVehicle), keyed by driver_id
                // in the URL with vehicle_id in the body. Reused exactly
                // as built, not duplicated as a second endpoint.
                const response = await post(
                  `/api/drivers/${driverId}/assign-vehicle`,
                  { vehicle_id: vehicleId },
                  {},
                  false
                );
                setAssigningDriver(false);

                if (response?.error || response?.success === false) {
                  toast.error(response?.message || 'Could not assign driver.');

                  return;
                }

                toast.success('Driver assigned.');
                setDriverId('');
                onChanged?.();
              }}
              disabled={assigningDriver || !driverId}
              className="text-xs text-accent-cyan border border-line rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              Assign
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat
          label="Distance (7d)"
          value={stats.distance_km_7d != null ? formatQty(u.distance, stats.distance_km_7d) : null}
          icon={Gauge}
        />
        <Stat
          label="Distance (30d)"
          value={
            stats.distance_km_30d != null ? formatQty(u.distance, stats.distance_km_30d) : null
          }
          icon={Gauge}
        />
        <Stat
          label="Avg speed (7d)"
          value={stats.avg_speed_kmh_7d != null ? formatQty(u.speed, stats.avg_speed_kmh_7d) : null}
        />
        <Stat
          label="Max speed (7d)"
          value={stats.max_speed_kmh_7d != null ? formatQty(u.speed, stats.max_speed_kmh_7d) : null}
        />
      </div>

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Current Position</div>
      {currentPosition ? (
        <div>
          <div
            className="rounded-md overflow-hidden border border-line-soft"
            style={{ height: '180px' }}
          >
            <MiniLocationMap position={{ ...currentPosition, device: { name: vehicle.name } }} />
          </div>
          <div className="text-[10.5px] text-ink-2 mt-1.5 font-mono">
            {currentPosition.latitude.toFixed(5)}, {currentPosition.longitude.toFixed(5)} · recorded{' '}
            {new Date(currentPosition.recorded_at).toLocaleTimeString()}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-ink-2 italic">
          No GPS position recorded —{' '}
          {stats.distance_km_7d == null
            ? 'no tracker currently assigned, or it has never reported a position.'
            : 'check the Tracker tab.'}
        </div>
      )}

      <div className="text-[10px] text-ink-2 mt-4 border-t border-line-soft pt-3">
        Fuel tracking isn't shown here — no fuel sensor/OBD-II integration exists in this system
        today. If this vehicle's hardware reports a fuel field, it would appear as ordinary
        telemetry, not a dedicated stat.
      </div>
    </div>
  );
}

function TrackerTab({ vehicleId, vehicle, onChanged }) {
  const [deviceId, setDeviceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const current = vehicle?.current_device_assignment?.device;

  // Devices not installed in any vehicle (GET /vehicles/assignable-trackers).
  // Trackers that already reported a position come first; the rest are tagged
  // "no GPS yet" so an operator knows they won't show on the map until they do.
  const {
    data: trackersData,
    isLoading: trackersLoading,
    refetch: refetchTrackers,
  } = useSimpleQuery(
    'assignable-trackers',
    '/api/vehicles/assignable-trackers',
    {},
    { enabled: !current, refetchOnMount: 'always' }
  );
  const trackers = [...(trackersData?.success ? trackersData.data : [])].sort(
    (a, b) => Number(!!b.has_position) - Number(!!a.has_position)
  );

  const handleAssign = async () => {
    if (!deviceId) return;

    setSubmitting(true);
    const response = await post(
      `/api/vehicles/${vehicleId}/assign-device`,
      { device_id: Number(deviceId) },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      // Surfaces the real backend rule directly — e.g. "already installed
      // in another vehicle" — not a generic failure message.
      toast.error(response?.message || 'Could not assign tracker.');

      return;
    }

    toast.success('Tracker assigned.');
    setDeviceId('');
    refetchTrackers();
    onChanged?.();
  };

  const handleUnassign = async () => {
    setSubmitting(true);
    const response = await post(`/api/vehicles/${vehicleId}/unassign-device`, {}, {}, false);
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not unassign tracker.');

      return;
    }

    toast.success('Tracker unassigned.');
    refetchTrackers();
    onChanged?.();
  };

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
        Currently Installed Tracker
      </div>
      {current ? (
        <div className="bg-surface-2 rounded-md p-3">
          <div className="text-sm text-ink-0">{current.name}</div>
          <div className="text-[11px] text-ink-2 mt-1 font-mono">
            {current.device_unique_identifier}
          </div>
          <button
            onClick={handleUnassign}
            disabled={submitting}
            className="w-full mt-3 text-xs text-danger border border-danger/40 bg-danger/10 rounded-md py-1.5"
          >
            {submitting ? 'Unassigning…' : 'Unassign Tracker'}
          </button>
        </div>
      ) : (
        <div>
          <div className="text-[11px] text-ink-2 italic mb-3">
            No tracker currently installed in this vehicle.
          </div>
          <div className="flex gap-2">
            <select
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              disabled={trackersLoading}
              className="flex-1 bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
            >
              <option value="">
                {trackersLoading
                  ? 'Loading trackers…'
                  : trackers.length
                    ? 'Select tracker'
                    : 'No unassigned trackers'}
              </option>
              {trackers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.device_unique_identifier}
                  {t.product?.name ? ` · ${t.product.name}` : ''}
                  {t.has_position ? '' : ' — no GPS yet'}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={submitting || !deviceId}
              className="text-xs text-accent-cyan border border-line rounded-md px-3 py-1.5 disabled:opacity-40"
            >
              Assign
            </button>
          </div>
        </div>
      )}

      <div className="text-[10px] text-ink-2 mt-4 border-t border-line-soft pt-3">
        A vehicle can hold one active tracker at a time. Swapping trackers — unassign the old one,
        assign the new one — keeps this vehicle's whole history (maintenance, fuel, position stats)
        continuous, since everything is attached to the vehicle, not the tracker itself.
      </div>
    </div>
  );
}

function MaintenanceTab({ vehicleId, schedules, onCreated }) {
  const code = useFleetCurrency();
  const u = useUnits();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [serviceType, setServiceType] = useState('');
  const [intervalDays, setIntervalDays] = useState('');
  const [lastServiceDate, setLastServiceDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [logType, setLogType] = useState('');
  const [logScheduleId, setLogScheduleId] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!serviceType.trim()) return;

    setSubmitting(true);
    const response = await post(
      `/api/vehicles/${vehicleId}/maintenance-schedules`,
      {
        service_type: serviceType.trim(),
        interval_days: intervalDays ? parseInt(intervalDays, 10) : null,
        last_service_date: lastServiceDate || null,
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create schedule.');

      return;
    }

    toast.success('Maintenance schedule created.');
    invalidateFleetQueries(qc);
    setShowForm(false);
    setServiceType('');
    setIntervalDays('');
    setLastServiceDate('');
    onCreated?.();
  };

  const handleLogService = async () => {
    if (!logType.trim() || !logDate) return;

    setLogSubmitting(true);
    const response = await post(
      `/api/vehicles/${vehicleId}/maintenance-logs`,
      {
        service_type: logType.trim(),
        service_date: logDate,
        cost: logCost ? parseFloat(logCost) : null,
        // Backend only resets a schedule's next-due date when the log
        // carries the schedule's id (flows/04 §10.2 B8).
        maintenance_schedule_id: logScheduleId ? Number(logScheduleId) : null,
      },
      {},
      false
    );
    setLogSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not log service.');

      return;
    }

    toast.success('Service logged.');
    invalidateFleetQueries(qc);
    setShowLogForm(false);
    setLogType('');
    setLogScheduleId('');
    setLogCost('');
    onCreated?.();
  };

  return (
    <div>
      {schedules.length === 0 && !showForm && (
        <div className="text-[11px] text-ink-2 italic mb-3">
          No maintenance schedules configured for this vehicle yet.
        </div>
      )}

      {schedules.map(s => (
        <RecordItem
          key={s.id}
          resource="maintenance-schedules"
          record={s}
          fields={MAINTENANCE_SCHEDULE_FIELDS}
          noun="Schedule"
          deleteQuestion="Delete this schedule? Its service logs stay as history."
          onChanged={onCreated}
        >
          <div className="flex items-center gap-1.5 text-xs text-ink-0 font-medium">
            <Wrench size={12} /> {s.service_type}
          </div>
          {s.next_service_date ? (
            <div
              className={`text-[11px] mt-1 ${s.is_overdue_by_date ? 'text-danger' : 'text-ink-2'}`}
            >
              {s.is_overdue_by_date ? 'Overdue — was due' : 'Next due'}{' '}
              {new Date(s.next_service_date).toLocaleDateString()}
            </div>
          ) : (
            <div className="text-[11px] text-ink-2 mt-1">No date-based interval set.</div>
          )}
        </RecordItem>
      ))}

      {showForm ? (
        <div className="bg-surface-2 rounded-md p-3 mt-3">
          <input
            value={serviceType}
            onChange={e => setServiceType(e.target.value)}
            placeholder="Service type (e.g. Oil Change)"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <input
            value={intervalDays}
            onChange={e => setIntervalDays(e.target.value)}
            placeholder="Interval (days)"
            type="number"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <input
            value={lastServiceDate}
            onChange={e => setLastServiceDate(e.target.value)}
            type="date"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 text-xs text-ink-2 border border-line rounded-md py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting || !serviceType.trim()}
              className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-accent-cyan border border-line rounded-md px-2.5 py-1.5 mt-2"
        >
          <Plus size={12} /> Add Schedule
        </button>
      )}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2 mt-5 pt-4 border-t border-line-soft">
        Service History
      </div>
      {/* Paged + filtered by the backend (GET /vehicles/{id}/maintenance-logs, B9). Editing or deleting a
          log recomputes its schedule's last-service date, so the detail (schedules above) is refetched. */}
      <PagedRecords
        queryName={`vehicle-${vehicleId}-maintenance-logs`}
        url={`/api/vehicles/${vehicleId}/maintenance-logs`}
        storageKey={`vehicle-${vehicleId}-maintenance-logs`}
        emptyText="No completed services logged yet."
        searchPlaceholder="Search service, vendor…"
        extraFilters={
          schedules.length
            ? [
                {
                  key: 'maintenance_schedule_id',
                  label: 'Schedule',
                  options: schedules.map(x => ({ value: String(x.id), label: x.service_type })),
                },
              ]
            : []
        }
        render={l => (
          <RecordItem
            key={l.id}
            resource="maintenance-logs"
            record={l}
            fields={maintenanceLogFields(schedules)}
            noun="Service log"
            deleteQuestion="Delete this service log?"
            onChanged={onCreated}
            className="bg-surface-2 rounded-md p-3 mb-2 text-xs"
          >
            <div className="text-ink-0">{l.service_type}</div>
            <div className="text-[11px] text-ink-2 mt-1">
              {new Date(l.service_date).toLocaleDateString()}
              {l.cost != null &&
                ` · ${code} ${Number(l.cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              {l.vendor && ` · ${l.vendor}`}
              {l.odometer_km != null && ` · ${formatQty(u.distance, l.odometer_km, 0)}`}
            </div>
            {l.notes && <div className="text-[11px] text-ink-1 mt-1">{l.notes}</div>}
          </RecordItem>
        )}
      />

      {showLogForm ? (
        <div className="bg-surface-2 rounded-md p-3 mt-2">
          {schedules.length > 0 && (
            <select
              value={logScheduleId}
              onChange={e => {
                setLogScheduleId(e.target.value);
                const schedule = schedules.find(s => String(s.id) === e.target.value);
                if (schedule) setLogType(schedule.service_type);
              }}
              className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
            >
              <option value="">Unscheduled service (no schedule)</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>
                  For schedule: {s.service_type}
                </option>
              ))}
            </select>
          )}
          <input
            value={logType}
            onChange={e => setLogType(e.target.value)}
            placeholder="Service performed (e.g. Oil Change)"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <input
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
            type="date"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <input
            value={logCost}
            onChange={e => setLogCost(e.target.value)}
            type="number"
            placeholder="Cost (optional)"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowLogForm(false)}
              className="flex-1 text-xs text-ink-2 border border-line rounded-md py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleLogService}
              disabled={logSubmitting || !logType.trim() || !logDate}
              className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
            >
              {logSubmitting ? 'Saving…' : 'Log Service'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLogForm(true)}
          className="flex items-center gap-1.5 text-xs text-accent-cyan border border-line rounded-md px-2.5 py-1.5 mt-3"
        >
          <Plus size={12} /> Log Completed Service
        </button>
      )}
    </div>
  );
}

function FuelTab({ vehicleId, economy, onCreated }) {
  const code = useFleetCurrency();
  const u = useUnits();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [fillDate, setFillDate] = useState('');
  const [volume, setVolume] = useState('');
  // New fill-ups default to the company's fuel unit (a per-log unit stays selectable).
  const [unit, setUnit] = useState(u.volume.label === 'gal' ? 'gallons' : 'liters');
  const [odometer, setOdometer] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!fillDate || !volume) return;

    setSubmitting(true);
    const response = await post(
      `/api/vehicles/${vehicleId}/fuel-logs`,
      {
        fill_date: fillDate,
        volume: parseFloat(volume),
        unit,
        odometer_km: odometer ? toMetric(u.distance, odometer) : null,
        is_full_tank: isFullTank,
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not log fuel.');

      return;
    }

    toast.success('Fuel logged.');
    invalidateFleetQueries(qc);
    setShowForm(false);
    setFillDate('');
    setVolume('');
    setOdometer('');
    onCreated?.();
  };

  return (
    <div>
      <div className="bg-surface-2 rounded-md p-3 mb-4">
        <div className="text-[10px] text-ink-2 uppercase">Average Economy</div>
        {economy?.economy != null ? (
          <div className="text-lg font-mono font-semibold text-ink-0 mt-1">
            {economy.unit === 'km/L'
              ? `${Math.round(u.economy.from(economy.economy) * 100) / 100} ${u.economy.label}`
              : `${economy.economy} ${economy.unit}`}
          </div>
        ) : (
          <div className="text-xs text-ink-2 mt-1">
            — not enough data. Needs at least 2 consecutive full-tank fills with an odometer reading
            on each.
          </div>
        )}
      </div>

      {/* Paged + filtered by the backend (GET /vehicles/{id}/fuel-logs, B9). Edit / delete recomputes the
          average economy, so the detail is refetched. */}
      <PagedRecords
        queryName={`vehicle-${vehicleId}-fuel-logs`}
        url={`/api/vehicles/${vehicleId}/fuel-logs`}
        storageKey={`vehicle-${vehicleId}-fuel-logs`}
        emptyText="No fuel fill-ups logged yet."
        searchPlaceholder="Search vendor, station…"
        render={l => (
          <RecordItem
            key={l.id}
            resource="fuel-logs"
            record={l}
            fields={FUEL_LOG_FIELDS}
            noun="Fuel log"
            deleteQuestion="Delete this fuel log? Average economy is recalculated."
            onChanged={onCreated}
            className="bg-surface-2 rounded-md p-3 mb-2 text-xs"
          >
            <div className="text-ink-0">
              {l.volume} {l.unit} {l.is_full_tank ? '(full tank)' : '(partial)'}
            </div>
            <div className="text-[11px] text-ink-2 mt-1">
              {new Date(l.fill_date).toLocaleDateString()}
              {l.cost != null &&
                ` · ${code} ${Number(l.cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              {l.odometer_km != null && ` · ${formatQty(u.distance, l.odometer_km, 0)}`}
              {l.station_name && ` · ${l.station_name}`}
            </div>
          </RecordItem>
        )}
      />

      {showForm ? (
        <div className="bg-surface-2 rounded-md p-3 mt-2">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              value={fillDate}
              onChange={e => setFillDate(e.target.value)}
              type="date"
              className="bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0"
            />
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0"
            >
              <option value="liters">Liters</option>
              <option value="gallons">Gallons</option>
            </select>
          </div>
          <input
            value={volume}
            onChange={e => setVolume(e.target.value)}
            type="number"
            placeholder="Volume"
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <input
            value={odometer}
            onChange={e => setOdometer(e.target.value)}
            type="number"
            placeholder={`Odometer (${u.distance.label}, optional)`}
            className="w-full bg-surface-1 border border-line rounded px-2 py-1.5 text-xs text-ink-0 mb-2"
          />
          <label className="flex items-center gap-2 text-xs text-ink-1 mb-2">
            <input
              type="checkbox"
              checked={isFullTank}
              onChange={e => setIsFullTank(e.target.checked)}
            />
            Full tank fill-up
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 text-xs text-ink-2 border border-line rounded-md py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting || !fillDate || !volume}
              className="flex-1 text-xs text-accent-cyan border border-line rounded-md py-1.5 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Log Fuel'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-accent-cyan border border-line rounded-md px-2.5 py-1.5 mt-3"
        >
          <Plus size={12} /> Log Fuel Fill-up
        </button>
      )}
    </div>
  );
}

function VehicleHistoryTab({ vehicleId, yardHistory = [], onChanged }) {
  const [submitting, setSubmitting] = useState(false);

  const currentYard = yardHistory.find(h => !h.checked_out_at);
  const pastYardHistory = yardHistory.filter(h => h.checked_out_at);

  const handleCheckOut = async slotId => {
    setSubmitting(true);

    const response = await post(`/api/yard-slots/${slotId}/check-out`, {}, {}, false);

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not check out.');

      return;
    }

    toast.success('Checked out.');
    onChanged?.();
  };

  return (
    <div>
      {/* ============================================================
          DRIVER ASSIGNMENT HISTORY — paged + filtered by the backend
          (GET /vehicles/{id}/assignment-history), replaces the embedded, unpaged list.
          ============================================================ */}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
        Driver Assignment History
      </div>

      <AssignmentHistory scope="vehicle" id={vehicleId} />

      {/* ============================================================
          YARD HISTORY
          ============================================================ */}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2 mt-6 pt-4 border-t border-line-soft">
        Yard History
      </div>

      {currentYard ? (
        <div className="bg-surface-2 rounded-md p-3 mb-4">
          <div className="text-[10px] uppercase text-accent-cyan mb-1">Currently Parked</div>

          <div className="text-sm text-ink-0">
            {currentYard.slot?.yard?.name}
            {' — '}
            {currentYard.slot?.slot_number}
          </div>

          <div className="text-[11px] text-ink-2 mt-1">
            Checked in {new Date(currentYard.checked_in_at).toLocaleString()}
          </div>

          <button
            onClick={() => handleCheckOut(currentYard.slot?.id)}
            disabled={submitting}
            className="w-full mt-2 text-xs text-danger border border-danger/40 bg-danger/10 rounded-md py-1.5"
          >
            {submitting ? 'Checking out…' : 'Check Out'}
          </button>
        </div>
      ) : (
        <div className="text-[11px] text-ink-2 italic mb-4">
          Not currently parked in any yard slot.
        </div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
        Previous Yard Visits
      </div>

      {/* Paged + filtered by the backend (GET /vehicles/{id}/yard-history, B9). */}
      <PagedRecords
        queryName={`vehicle-${vehicleId}-yard-history`}
        url={`/api/vehicles/${vehicleId}/yard-history`}
        storageKey={`vehicle-${vehicleId}-yard-history`}
        emptyText="No yard check-ins for this vehicle yet."
        searchPlaceholder="Search yard or slot…"
        extraFilters={[
          {
            key: 'open',
            label: 'Stay',
            options: [
              { value: '1', label: 'Current' },
              { value: '0', label: 'Finished' },
            ],
          },
        ]}
        render={history => (
          <div key={history.id} className="bg-surface-2 rounded-md p-3 mb-2 text-xs">
            <div className="text-ink-0 font-medium">
              {history.slot?.yard?.name}
              {' — '}
              {history.slot?.slot_number}
            </div>

            <div className="text-[11px] text-ink-2 mt-1">
              {new Date(history.checked_in_at).toLocaleString()}
              {' → '}
              {history.checked_out_at
                ? new Date(history.checked_out_at).toLocaleString()
                : 'still parked'}
            </div>
          </div>
        )}
      />

      {/* ============================================================
          INCIDENTS involving this vehicle (GET /vehicles/{id}/incidents, B9) — edit / delete (B3)
          ============================================================ */}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2 mt-6 pt-4 border-t border-line-soft">
        Incidents
      </div>

      <PagedRecords
        queryName={`vehicle-${vehicleId}-incidents`}
        url={`/api/vehicles/${vehicleId}/incidents`}
        storageKey={`vehicle-${vehicleId}-incidents`}
        emptyText="No incidents recorded for this vehicle."
        searchPlaceholder="Search incidents…"
        extraFilters={[SEVERITY_FILTER]}
        render={i => (
          <RecordItem
            key={i.id}
            resource="incidents"
            record={i}
            fields={INCIDENT_FIELDS}
            noun="Incident"
            deleteQuestion="Delete this incident?"
            onChanged={onChanged}
            className="bg-surface-2 rounded-md p-3 mb-2 text-xs"
          >
            <IncidentSummary incident={i} showVehicle={false} />
          </RecordItem>
        )}
      />

      {/* ============================================================
          FUTURE HISTORY MODULES
          ============================================================ */}

      <div className="mt-6 pt-4 border-t border-line-soft">
        <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">
          More Vehicle History
        </div>

        <div className="space-y-2">
          <div className="bg-surface-2 rounded-md p-3">
            <div className="text-xs text-ink-0">Trip / Journey History</div>
            <div className="text-[10px] text-ink-2 mt-1">
              This vehicle's trips, drivers, distance and outcomes are listed in the Trips tab.
            </div>
          </div>

          <div className="bg-surface-2 rounded-md p-3">
            <div className="text-xs text-ink-0">Other Vehicle Events</div>
            <div className="text-[10px] text-ink-2 mt-1">
              Additional vehicle lifecycle and operational events can be added here later without
              changing the overall history structure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The actual answer to "can a manager see live location": a real
 * embedded map, not raw coordinates as text. Re-centers on every
 * refresh (via useMap()) since MapContainer's center prop only applies
 * on initial mount — without this, the map would stay frozen at the
 * first position even while the marker/data underneath kept updating.
 */
function MiniLocationMap({ position }) {
  const u = useUnits();
  const { isLight } = useTheme();
  // const mapTilerKey = '<OLD_MAPTILER_KEY_REDACTED>';
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const tileUrl = `https://api.maptiler.com/maps/dataviz-${isLight ? 'light' : 'dark'}/{z}/{x}/{y}.png?key=${mapTilerKey}`;

  return (
    <MapContainer
      center={[position.latitude, position.longitude]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      {/* attributionControl was previously disabled entirely on this
          mini-map — caught while fixing the tile provider itself: that
          would have meant zero attribution shown, which violates
          virtually every tile provider's terms, MapTiler's included.
          Left enabled; Leaflet's default control is already compact. */}
      <TileLayer
        url={tileUrl}
        tileSize={512}
        zoomOffset={-1}
        attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; OSM'
      />
      <VehicleMarker position={position} units={u} />
      <RecenterOnUpdate lat={position.latitude} lng={position.longitude} />
    </MapContainer>
  );
}

function RecenterOnUpdate({ lat, lng }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);

  return null;
}
