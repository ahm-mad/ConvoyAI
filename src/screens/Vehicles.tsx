import { useUnits } from '@hooks/useUnits';
import { useState } from 'react';
import { Plus, Truck, Wifi, WifiOff, User } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { post } from '@utils/apiHelper';
import VehicleFields, { EMPTY_VEHICLE_VALUES, vehicleToPayload } from '@components/VehicleFields';
import toast from 'react-hot-toast';
import VehicleDetailModal from '@components/VehicleDetailModal';
import DataToolbar, { type FilterDef } from '@components/list/DataToolbar';
import Pager from '@components/list/Pager';
import StatusChips from '@components/list/StatusChips';
import { useStatusCounts } from '@hooks/useStatusCounts';
import BulkBar from '@components/list/BulkBar';
import SelectableRow from '@components/list/SelectableRow';
import { useListState } from '@hooks/useListState';
import { useServerList } from '@hooks/useServerList';
import { useServerExport } from '@hooks/useServerExport';
import { useSelection } from '@hooks/useSelection';
import { useBulkAction, bulkTargets } from '@hooks/useBulkAction';
import { useFleetOptions, optionLabel } from '@utils/fleetOptions';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Fleet entities come from the backend and aren't being typed in this pass
// (see task.md — API shapes wait for API docs).
type Vehicle = any;

/**
 * The real fleet inventory — Company's vehicles, each showing its current
 * tracker assignment and driver at a glance. Consumes GET /api/vehicles
 * exactly as built during the vehicle/tracker split. Clicking a vehicle
 * opens the same VehicleDetailModal used from the map, where the actual
 * "assign a tracker" feature lives (Tracker tab).
 */
const VEHICLE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'in_maintenance', label: 'In maintenance' },
  { value: 'retired', label: 'Retired' },
  { value: 'sold', label: 'Sold' },
];

const YES_NO = (yes: string, no: string) => [
  { value: 'yes', label: yes },
  { value: 'no', label: no },
];

const isInactiveVehicle = (v: Vehicle) =>
  v.lifecycle_status === 'retired' || v.lifecycle_status === 'sold';

export default function Vehicles() {
  const { openModal } = useModal();
  const [showForm, setShowForm] = useState(false);
  // Deactivated (retired/sold) vehicles are hidden by default; ?include_inactive=1 brings them back.
  const [showInactive, setShowInactive] = useState(false);

  // Server-side list (flows/06 §11): search / filters / sort / paging go to the backend as request
  // parameters and only the current page is downloaded. The storage key is versioned because the
  // persisted filter/sort keys changed from the old client-side ones.
  const list = useListState('vehicles:server', { pageSize: 20 });
  const { state } = list;
  const { options } = useFleetOptions();

  // Filtering to Retired/Sold only makes sense with inactive vehicles included.
  const includeInactive =
    showInactive || state.filters.status === 'retired' || state.filters.status === 'sold';

  const view = useServerList<Vehicle>(list, {
    queryName: 'vehicles-paged', // `vehicle` prefix → refetched by fleet:changed / reconnect
    url: '/api/vehicles',
    sortKeys: ['name', 'plate', 'lifecycle_status', 'odometer_km', 'year', 'created_at'],
    extra: includeInactive ? { include_inactive: 1 } : {},
    filterParams: f => ({
      status: f.status,
      vehicle_category: f.category,
      fuel_type: f.fuel_type,
      has_tracker: f.tracker ? (f.tracker === 'yes' ? 1 : 0) : undefined,
      has_driver: f.driver ? (f.driver === 'yes' ? 1 : 0) : undefined,
    }),
  });
  const { isLoading, refetch } = view;
  const { counts } = useStatusCounts('vehicles', view.filterParams);
  const vehicles: Vehicle[] = view.items;

  const filters: FilterDef[] = [
    { key: 'status', label: 'Status', options: VEHICLE_STATUS_OPTIONS },
    {
      key: 'category',
      label: 'Category',
      options: options.vehicle_categories.map(c => ({ value: c, label: c })),
    },
    {
      key: 'fuel_type',
      label: 'Fuel',
      options: options.fuel_types.map(f => ({ value: f, label: optionLabel(f) })),
    },
    { key: 'tracker', label: 'Tracker', options: YES_NO('Has tracker', 'No tracker') },
    { key: 'driver', label: 'Driver', options: YES_NO('Has driver', 'No driver') },
  ];

  const selection = useSelection<Vehicle>(
    JSON.stringify([state.search, state.filters, includeInactive])
  );
  const bulk = useBulkAction('vehicles', 'vehicle');
  const exporter = useServerExport('/api/vehicles/export', 'vehicles');
  const chosen = selection.values;
  const chosenActive = chosen.filter(v => !isInactiveVehicle(v));
  const chosenInactive = chosen.filter(isInactiveVehicle);
  const pageIds = view.items.map(x => x.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selection.isSelected(id));
  const names = new Map(chosen.map(x => [String(x.id), x.name] as [string, string]));

  // Ids mode acts on the ticked rows the action applies to; "all matching" mode sends the list's own
  // filter to the backend (≤ 500 records, narrowed to the rows the action can change).
  const runBulk = async (action: 'deactivate' | 'reactivate' | 'delete', rows: Vehicle[]) => {
    const targets = bulkTargets(
      'vehicles',
      action,
      { allMatching: selection.allMatching, ids: rows.map(x => x.id) },
      view.filterParams
    );

    if (!targets) {
      toast(`Nothing to ${action} in this selection.`);

      return;
    }

    if (await bulk.run(action, targets, names)) selection.clear();
  };
  const actionCount = (rows: Vehicle[]) => (selection.allMatching ? selection.count : rows.length);
  const confirmAll = (verb: string) =>
    selection.allMatching ? `${verb} all ${selection.count} matching vehicles?` : undefined;

  return (
    <div className="flex flex-col pt-3 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Vehicles</h1>
          <p className="text-[13.5px] text-ink-1 mt-1">
            {isLoading
              ? 'Loading…'
              : `${view.total} vehicle${view.total === 1 ? '' : 's'}${list.hasActiveFilters ? ' matching' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 btn-brand text-[13px] font-semibold rounded-full px-5 py-2.5 transition-transform hover:-translate-y-px"
          >
            <Plus size={13} /> Add Vehicle
          </button>
        </div>
      </div>

      {showForm && (
        <NewVehicleForm
          existingVehicles={vehicles}
          onClose={() => setShowForm(false)}
          onCreated={refetch}
        />
      )}

      <StatusChips
        counts={counts}
        options={VEHICLE_STATUS_OPTIONS}
        value={state.filters.status}
        onChange={v => list.setFilter('status', v)}
        totalLabel="Total (incl. retired/sold)"
      />

      <DataToolbar
        search={state.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search name, plate, VIN, make, model…"
        filters={filters}
        values={state.filters}
        onFilter={list.setFilter}
        onClear={list.clearFilters}
        hasActive={list.hasActiveFilters}
        sortOptions={[
          { value: 'name', label: 'Name' },
          { value: 'plate', label: 'Plate' },
          { value: 'lifecycle_status', label: 'Status' },
          { value: 'odometer_km', label: 'Odometer' },
          { value: 'year', label: 'Year' },
          { value: 'created_at', label: 'Date added' },
        ]}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSort={list.setSort}
        actions={
          <>
            {view.total > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={e => selection.setMany(pageIds, e.target.checked, view.items)}
                />
                Select page
              </label>
            )}
            {view.total > view.items.length && !selection.allMatching && (
              <button
                type="button"
                onClick={() => selection.selectAllMatching(view.total)}
                className="text-accent-cyan hover:underline"
              >
                {`Select all ${view.total}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => exporter.run(view.filterParams)}
              disabled={view.total === 0 || exporter.busy}
              className="text-accent-cyan hover:underline disabled:opacity-40"
            >
              {exporter.busy ? 'Exporting…' : 'Export CSV'}
            </button>
          </>
        }
      />

      <BulkBar
        count={selection.count}
        allMatching={selection.allMatching}
        running={bulk.running}
        result={bulk.result}
        onDismissResult={bulk.dismiss}
        onClear={selection.clear}
        actions={[
          {
            label: 'Deactivate',
            count: actionCount(chosenActive),
            danger: true,
            confirm: confirmAll('Deactivate'),
            onClick: () => runBulk('deactivate', chosenActive),
          },
          {
            label: 'Reactivate',
            count: actionCount(chosenInactive),
            confirm: confirmAll('Reactivate'),
            onClick: () => runBulk('reactivate', chosenInactive),
          },
          {
            label: 'Delete permanently',
            count: actionCount(chosen),
            danger: true,
            confirm: selection.allMatching
              ? `Permanently delete all ${selection.count} matching vehicles? Only never-used records are deleted; the rest are refused with a reason.`
              : `Permanently delete ${chosen.length} selected vehicles? Only never-used records are deleted; the rest are refused with a reason. This can't be undone.`,
            onClick: () => runBulk('delete', chosen),
          },
        ]}
      />

      {view.error && (
        <div className="flex items-center justify-between text-xs text-danger bg-danger/10 rounded-md px-3 py-2 mb-3">
          <span>{view.error}</span>
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {isLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

      {!isLoading && view.total === 0 && !showForm && !view.error && (
        <div className="text-xs text-ink-2 py-12 text-center border border-dashed border-line rounded-md">
          {list.hasActiveFilters ? (
            <>
              No vehicles match your search or filters.{' '}
              <button onClick={list.clearFilters} className="text-accent-cyan underline">
                Clear them
              </button>
            </>
          ) : (
            'No vehicles added yet. A yacht, a truck, anything you track — add it here, then assign a tracker to it from its detail view.'
          )}
        </div>
      )}

      {!isLoading && view.items.length > 0 && (
        <div className="space-y-3 motion-stagger">
          {view.items.map(v => (
            <SelectableRow
              key={v.id}
              selected={selection.isSelected(v.id)}
              onToggle={() => selection.toggle(v.id, v, view.items)}
              label={v.name}
            >
              <VehicleRow
                vehicle={v}
                onClick={() => openModal(<VehicleDetailModal vehicleId={v.id} />)}
              />
            </SelectableRow>
          ))}
        </div>
      )}

      {!isLoading && view.total > 0 && (
        <Pager
          page={state.page}
          pageSize={state.pageSize}
          total={view.total}
          onPage={list.setPage}
          onPageSize={list.setPageSize}
        />
      )}
    </div>
  );
}

function VehicleRow({ vehicle, onClick }: { vehicle: Vehicle; onClick: () => void }) {
  const tracker = vehicle.current_device_assignment?.device;
  const driver = vehicle.current_driver_assignment?.driver;

  const statusColors: Record<string, string> = {
    active: 'bg-accent-green/10 text-accent-green',
    in_maintenance: 'bg-warning/10 text-warning',
    retired: 'bg-surface-3 text-ink-2',
    sold: 'bg-surface-3 text-ink-2',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center justify-between glass-strong  px-5 py-4 card-lift ${
        vehicle.lifecycle_status === 'retired' || vehicle.lifecycle_status === 'sold'
          ? 'opacity-60'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {vehicle.image_url ? (
          <img
            src={vehicle.image_url}
            alt=""
            className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-brand-wash flex items-center justify-center flex-shrink-0">
            <Truck size={18} className="text-brand" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink-0">{vehicle.name}</span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${statusColors[vehicle.lifecycle_status] || statusColors.active}`}
            >
              {vehicle.lifecycle_status?.replace('_', ' ')}
            </span>
          </div>
          <div className="text-[11px] text-ink-2 mt-1">
            {vehicle.vehicle_category || 'Category not set'}
            {vehicle.make && ` · ${vehicle.make} ${vehicle.model || ''}`}
            {vehicle.plate && ` · ${vehicle.plate}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-ink-2">
        <div className="flex items-center gap-1.5">
          {tracker ? (
            <Wifi size={12} className="text-accent-green" />
          ) : (
            <WifiOff size={12} className="text-ink-2" />
          )}
          {tracker ? tracker.name : 'No tracker'}
        </div>
        <div className="flex items-center gap-1.5">
          <User size={12} />
          {driver ? `${driver.first_name} ${driver.last_name}` : 'No driver'}
        </div>
      </div>
    </button>
  );
}

interface NewVehicleFormProps {
  existingVehicles?: Vehicle[];
  onClose?: () => void;
  onCreated?: () => void;
}

function NewVehicleForm({ existingVehicles = [], onClose, onCreated }: NewVehicleFormProps) {
  const u = useUnits();
  const [values, setValues] = useState(EMPTY_VEHICLE_VALUES);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!values.name.trim()) return;

    setSubmitting(true);
    const response = await post('/api/vehicles', vehicleToPayload(values, undefined, u), {}, false);
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create vehicle.');

      return;
    }

    toast.success('Vehicle added.');
    onCreated?.();
    onClose?.();
  };

  return (
    <div className="glass  p-6 mb-5">
      <VehicleFields
        values={values}
        onChange={setValues}
        existingNames={existingVehicles.map(v => v.name)}
      />

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="text-xs text-ink-2 border border-line rounded-md px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={submitting || !values.name.trim()}
          className="text-xs text-accent-cyan border border-line rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Add Vehicle'}
        </button>
      </div>
    </div>
  );
}
