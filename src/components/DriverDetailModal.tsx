/* eslint-disable @typescript-eslint/no-explicit-any */
import RequiredHint from '@components/RequiredHint';
import SelectRadix from '@components/Select';
import DatePicker from '@components/DatePicker';
import { useState } from 'react';
import { X, Truck, AlertTriangle, Plus } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { post } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import ComplianceTab from '@components/ComplianceTab';
import DriverEditForm from '@components/DriverEditForm';
import DeactivateControls from '@components/DeactivateControls';
import AssignmentHistory from '@components/AssignmentHistory';
import OptionSelect from '@components/OptionSelect';
import AuditLine from '@components/AuditLine';
import RecordItem from '@components/records/RecordItem';
import PagedRecords from '@components/records/PagedRecords';
import IncidentSummary from '@components/records/IncidentSummary';
import { INCIDENT_FIELDS, SEVERITY_FILTER } from '@components/records/fields';
import { invalidateFleetQueries } from '@utils/fleetCache';
import { useQueryClient } from '@tanstack/react-query';

export default function DriverDetailModal({
  driverId,
  initialTab = 'overview',
}: {
  driverId: string | number;
  initialTab?: string;
}) {
  const { closeModal } = useModal();
  const [tab, setTab] = useState(initialTab);

  const { data, isLoading, refetch } = useSimpleQuery(
    `driver-${driverId}`,
    `/api/drivers/${driverId}`
  );
  const driver: any = data?.success ? data.data : null;

  return (
    <div className="glass-strong  w-[min(600px,calc(100vw_-_1.5rem))] max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink-0">
            {driver ? `${driver.first_name} ${driver.last_name}` : 'Driver Detail'}
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {[
              [driver?.license_class, driver?.license_number].filter(Boolean).join(' '),
              driver?.phone,
              driver?.email,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button onClick={closeModal} className="text-ink-2 hover:text-ink-0" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex gap-1 px-5 pt-2 border-b border-line">
        {['overview', 'assignments', 'incidents', 'compliance'].map((t: string) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-medium px-3 py-1.5 border-b-2 -mb-px capitalize ${
              tab === t ? 'text-ink-0 border-accent-cyan' : 'text-ink-2 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && <div className="text-xs text-ink-2 text-center py-8">Loading…</div>}
        {!isLoading && driver && tab === 'overview' && (
          <OverviewTab driver={driver} onChanged={refetch} />
        )}
        {!isLoading && driver && tab === 'assignments' && (
          <AssignmentHistory scope="driver" id={driverId} />
        )}
        {!isLoading && driver && tab === 'incidents' && (
          <IncidentsTab driverId={driverId} onLogged={refetch} />
        )}
        {!isLoading && driver && tab === 'compliance' && (
          <ComplianceTab documentableType="driver" documentableId={driverId} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ driver, onChanged }: { driver: any; onChanged?: () => void }) {
  const [vehicleId, setVehicleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const currentVehicle = driver.current_assignment?.vehicle;
  const inactive = driver.status === 'inactive';

  const handleAssign = async () => {
    if (!vehicleId) return;

    setSubmitting(true);
    const response = await post(
      `/api/drivers/${driver.id}/assign-vehicle`,
      { vehicle_id: vehicleId },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not assign vehicle.');

      return;
    }

    toast.success('Vehicle assigned.');
    setVehicleId('');
    onChanged?.();
  };

  const handleUnassign = async () => {
    setSubmitting(true);
    const response = await post(`/api/drivers/${driver.id}/unassign-vehicle`, {}, {}, false);
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not unassign vehicle.');

      return;
    }

    toast.success('Vehicle unassigned.');
    onChanged?.();
  };

  if (editing) {
    return (
      <DriverEditForm
        driver={driver}
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
      <AuditLine record={driver} className="text-[10px] text-ink-2 mb-3" />
      {/* Edit / deactivate (flows/05 §8). An inactive driver shows a Reactivate banner instead. */}
      {inactive ? (
        <DeactivateControls
          basePath={`/api/drivers/${driver.id}`}
          inactive
          entityLabel="driver"
          onChanged={onChanged}
          allowDelete
        />
      ) : (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 whitespace-nowrap btn-soft"
          >
            Edit driver
          </button>
          <DeactivateControls
            basePath={`/api/drivers/${driver.id}`}
            inactive={false}
            entityLabel="driver"
            onChanged={onChanged}
            allowDelete
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-surface-2 rounded-md p-3">
          <div className="text-[10px] text-ink-2 uppercase">Status</div>
          <div className="text-sm text-ink-0 mt-1 capitalize">{driver.status}</div>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <div className="text-[10px] text-ink-2 uppercase">License Expiry</div>
          <div
            className={`text-sm mt-1 ${driver.is_license_expired ? 'text-danger-text' : 'text-ink-0'}`}
          >
            {driver.license_expiry_date
              ? new Date(driver.license_expiry_date).toLocaleDateString()
              : 'Not set'}
          </div>
        </div>
      </div>

      {(driver.is_license_expired || driver.is_license_expiring_soon) && (
        <div className="flex items-center gap-1.5 text-xs text-danger-text bg-danger/10 rounded-md px-2.5 py-1.5 mb-4">
          <AlertTriangle size={12} />
          {driver.is_license_expired ? 'License has expired' : 'License expires within 30 days'}
        </div>
      )}

      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Current Vehicle</div>
      {currentVehicle ? (
        <div className="bg-surface-2 rounded-md p-3 mb-4">
          <div className="flex items-center gap-1.5 text-sm text-ink-0">
            <Truck size={13} /> {currentVehicle.name}
          </div>
          <div className="text-[11px] text-ink-2 mt-1">
            {currentVehicle.vehicle_category || 'Category not set'}
            {' · '}
            <span className="capitalize">{currentVehicle.lifecycle_status?.replace('_', ' ')}</span>
          </div>
          <div className="text-[11px] text-ink-2 mt-1">
            {currentVehicle.current_device_assignment?.device
              ? `Tracker: ${currentVehicle.current_device_assignment.device.name}`
              : 'No tracker currently assigned to this vehicle'}
          </div>
          <button
            onClick={handleUnassign}
            disabled={submitting}
            className="w-full mt-2 text-xs text-danger-text border border-danger/40 bg-danger/10 rounded-full py-1.5"
          >
            Unassign
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mb-4">
          {/* One active driver per vehicle (backend 422s otherwise): offer only vehicles without a driver. */}
          <OptionSelect
            kind="vehicles"
            params={{ has_driver: 0 }}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Select vehicle"
            emptyLabel="No vehicles available"
            getOption={v => ({
              label: `${v.name || `Vehicle #${v.id}`}${v.vehicle_category ? ` · ${v.vehicle_category}` : ''} (#${v.id})`,
            })}
          />
          <button
            onClick={handleAssign}
            disabled={submitting || !vehicleId}
            className="text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
          >
            Assign
          </button>
        </div>
      )}
    </div>
  );
}

function IncidentsTab({
  driverId,
  onLogged,
}: {
  driverId: string | number;
  onLogged?: () => void;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLog = async () => {
    if (!type.trim() || !date) return;

    setSubmitting(true);
    const response = await post(
      `/api/drivers/${driverId}/incidents`,
      {
        incident_type: type.trim(),
        severity,
        incident_date: date,
        description: description.trim() || null,
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not log incident.');

      return;
    }

    toast.success('Incident logged.');
    invalidateFleetQueries(qc);
    setShowForm(false);
    setType('');
    setDescription('');
    onLogged?.();
  };

  return (
    <div>
      {/* Paged + filtered by the backend (GET /drivers/{id}/incidents, B9); edit / delete = B3. */}
      <PagedRecords
        queryName={`driver-${driverId}-incidents`}
        url={`/api/drivers/${driverId}/incidents`}
        storageKey={`driver-${driverId}-incidents`}
        emptyText="No incidents logged for this driver."
        searchPlaceholder="Search incidents…"
        extraFilters={[SEVERITY_FILTER]}
        render={(i: any) => (
          <RecordItem
            key={i.id}
            resource="incidents"
            record={i}
            fields={INCIDENT_FIELDS}
            noun="Incident"
            deleteQuestion="Delete this incident?"
            onChanged={onLogged}
          >
            <IncidentSummary incident={i} showDriver={false} />
          </RecordItem>
        )}
      />

      {showForm ? (
        <div className="bg-surface-2 rounded-md p-3 mt-2">
          <input
            value={type}
            onChange={e => setType(e.target.value)}
            placeholder="Incident type (e.g. Speeding Violation)"
            className="w-full field mb-2"
          />
          <SelectRadix
            className="mb-2"
            value={severity}
            onValueChange={setSeverity}
            options={[
              { value: 'minor', label: 'Minor' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'severe', label: 'Severe' },
            ]}
          />
          <DatePicker className="mb-2" value={date} onChange={setDate} />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full field mb-2"
          />
          <RequiredHint
            missing={[!type.trim() && 'incident type', !date && 'date'].filter(Boolean) as string[]}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleLog}
              disabled={submitting || !type.trim() || !date}
              className="flex-1 text-xs btn-brand border border-transparent rounded-full py-1.5 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Log Incident'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs btn-brand border border-transparent rounded-full px-2.5 py-1.5 mt-3"
        >
          <Plus size={12} /> Log Incident
        </button>
      )}
    </div>
  );
}
