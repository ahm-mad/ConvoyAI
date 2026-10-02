/* eslint-disable @typescript-eslint/no-explicit-any */
import ListEmpty from '@components/list/ListEmpty';
import RequiredHint from '@components/RequiredHint';
import DatePicker from '@components/DatePicker';
import { useUnits } from '@hooks/useUnits';
import { formatQty, toMetric } from '@utils/units';
import { useState, type ReactNode } from 'react';
import { Plus, Play, CheckCircle2, XCircle, Route } from 'lucide-react';
import { useOptions } from '@hooks/useOptions';
import OptionSelect from '@components/OptionSelect';
import TripStopsEditor, { stopsToCreatePayload, type StopDraft } from '@components/TripStopsEditor';
import { useModal } from '@contexts/ModalContext';
import { get, post } from '@utils/apiHelper';
import PickOnMapButton from '@components/CoordinatePicker';
import { toIsoInstant } from '@utils/datetime';
import toast from 'react-hot-toast';
import TripDetailModal from '@components/TripDetailModal';
import DataToolbar, { type FilterDef } from '@components/list/DataToolbar';
import Pager from '@components/list/Pager';
import StatusChips from '@components/list/StatusChips';
import { useStatusCounts } from '@hooks/useStatusCounts';
import { useListState } from '@hooks/useListState';
import { useTripsList, TRIP_STATUS_OPTIONS } from '@hooks/useTripsList';
import { useSelection } from '@hooks/useSelection';
import { useBulkAction, bulkTargets } from '@hooks/useBulkAction';
import { useServerExport } from '@hooks/useServerExport';
import BulkBar from '@components/list/BulkBar';
import SelectableRow from '@components/list/SelectableRow';

export default function Trips() {
  const { openModal } = useModal();
  const [showForm, setShowForm] = useState(false);

  // List state (page, page size, search, filters) — persisted per tab, resets to page 1 on change.
  const list = useListState('trips', { pageSize: 20 });
  const { state } = list;
  const t = useTripsList(list);
  const { counts } = useStatusCounts('trips', t.filterParams);

  // Filter dropdowns come from the options endpoints (active records, ≤ 1000 — flows/06 §12).
  // `include_inactive`: a history filter must still find a deactivated vehicle / driver (backend D-0171).
  const { items: vehicles } = useOptions('vehicles', { include_inactive: 1 });
  const { items: drivers } = useOptions('drivers', { include_inactive: 1 });

  const filters: FilterDef[] = [
    { key: 'status', label: 'Status', options: TRIP_STATUS_OPTIONS },
    {
      key: 'vehicle_id',
      label: 'Vehicle',
      options: vehicles.map(v => ({
        value: String(v.id),
        label: `${v.name}${v.plate ? ` · ${v.plate}` : ''} (#${v.id})${
          v.lifecycle_status === 'retired' || v.lifecycle_status === 'sold' ? ' — inactive' : ''
        }`,
      })),
    },
    {
      key: 'driver_id',
      label: 'Driver',
      options: drivers.map(d => ({
        value: String(d.id),
        label: `${d.name}${d.status && d.status !== 'active' ? ` — ${d.status}` : ''}`,
      })),
    },
    { key: 'date_from', label: 'Date from', type: 'date' },
    { key: 'date_to', label: 'Date to', type: 'date' },
  ];

  const selection = useSelection<any>(JSON.stringify([state.search, state.filters]));
  const bulk = useBulkAction('trips', 'trip');
  const exporter = useServerExport('/api/trips/export', 'trips');
  const chosen = selection.values;
  // Only planned trips can be deleted (backend refuses the rest), so only those are sent.
  const chosenPlanned = chosen.filter(x => x.status === 'planned');
  const pageIds = t.items.map((x: any) => x.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id: any) => selection.isSelected(id));
  const names = new Map(
    chosen.map(x => [String(x.id), x.trip_reference || `Trip #${x.id}`] as [string, string])
  );

  const runBulkDelete = async () => {
    const targets = bulkTargets(
      'trips',
      'delete',
      { allMatching: selection.allMatching, ids: chosenPlanned.map(x => x.id) },
      t.filterParams
    );

    if (!targets) {
      toast('There are no planned trips in this selection.');

      return;
    }

    if (await bulk.run('delete', targets, names)) selection.clear();
  };

  return (
    <div className="flex flex-col pt-3 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Trips</h1>

          <p className="text-[13.5px] text-ink-1 mt-1">
            {t.isLoading ? 'Loading…' : `${t.total} trip${t.total === 1 ? '' : 's'}`}
            {list.hasActiveFilters && !t.isLoading ? ' matching' : ''}
          </p>
        </div>

        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 btn-brand text-[13px] font-semibold rounded-full px-5 py-2.5 transition-transform hover:-translate-y-px"
        >
          <Plus size={13} />
          Create Trip
        </button>
      </div>

      {showForm && <NewTripForm onClose={() => setShowForm(false)} onCreated={t.refetch} />}

      <StatusChips
        counts={counts}
        options={TRIP_STATUS_OPTIONS}
        value={state.filters.status}
        onChange={v => list.setFilter('status', v)}
      />

      <DataToolbar
        search={state.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search reference, place, vehicle, driver…"
        filters={filters}
        values={state.filters}
        onFilter={list.setFilter}
        onClear={list.clearFilters}
        hasActive={list.hasActiveFilters}
        views={list}
        sortOptions={[
          { value: 'planned_start_at', label: 'Planned start' },
          { value: 'created_at', label: 'Date created' },
          { value: 'status', label: 'Status' },
          { value: 'trip_reference', label: 'Reference' },
        ]}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSort={list.setSort}
        summary={t.isRefreshing && !t.isLoading ? 'Updating…' : undefined}
        actions={
          <>
            {t.total > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={e => selection.setMany(pageIds, e.target.checked, t.items)}
                />
                Select page
              </label>
            )}
            {t.total > t.items.length && !selection.allMatching && (
              <button
                type="button"
                onClick={() => selection.selectAllMatching(t.total)}
                className="text-brand-text hover:underline"
              >
                {`Select all ${t.total}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => exporter.run(t.filterParams)}
              disabled={t.total === 0 || exporter.busy}
              className="text-[11px] text-brand-text hover:underline disabled:opacity-40"
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
            label: 'Delete planned',
            count: selection.allMatching ? selection.count : chosenPlanned.length,
            danger: true,
            confirm: selection.allMatching
              ? `Delete the planned trips among all ${selection.count} matching? This can't be undone.`
              : "Delete these planned trips and their stops? This can't be undone — cancel a trip instead to keep a record.",
            onClick: runBulkDelete,
          },
        ]}
      />

      {t.error && (
        <div className="flex items-center justify-between text-xs text-danger-text bg-danger/10 rounded-md px-3 py-2 mb-3">
          <span>{t.error}</span>
          <button onClick={() => t.refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {t.isLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

      {!t.isLoading && t.items.length === 0 && !showForm && !t.error && (
        <ListEmpty
          noun="trips"
          icon={Route}
          filtered={list.hasActiveFilters}
          onClear={list.clearFilters}
          hint="Plan a trip to dispatch a vehicle and driver and track it end to end."
          addLabel="Create trip"
          onAdd={() => setShowForm(true)}
        />
      )}

      {!t.isLoading && t.items.length > 0 && (
        <div className="space-y-3 motion-stagger">
          {t.items.map((trip: any) => (
            <SelectableRow
              key={trip.id}
              selected={selection.isSelected(trip.id)}
              onToggle={() => selection.toggle(trip.id, trip, t.items)}
              label={trip.trip_reference || `trip ${trip.id}`}
            >
              <TripRow
                trip={trip}
                onClick={() =>
                  openModal(<TripDetailModal tripId={trip.id} onListChanged={t.refetch} />)
                }
              />
            </SelectableRow>
          ))}
        </div>
      )}

      {!t.isLoading && t.total > 0 && (
        <Pager
          page={state.page}
          pageSize={state.pageSize}
          total={t.total}
          onPage={list.setPage}
          onPageSize={list.setPageSize}
        />
      )}
    </div>
  );
}

function TripRow({ trip, onClick }: { trip: any; onClick: () => void }) {
  const u = useUnits();
  const status = trip.status || 'planned';

  const statusConfig: Record<string, { icon: ReactNode; className: string }> = {
    planned: {
      icon: null,
      className: 'bg-surface-3 text-ink-1',
    },

    in_progress: {
      icon: <Play size={9} />,
      className: 'bg-accent-cyan/10 text-accent-cyan',
    },

    completed: {
      icon: <CheckCircle2 size={10} />,
      className: 'bg-accent-green/10 text-accent-green',
    },

    cancelled: {
      icon: <XCircle size={10} />,
      className: 'bg-danger/10 text-danger-text',
    },
  };

  const config = statusConfig[status] || statusConfig.planned;

  const driverName = trip.driver
    ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim()
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-strong spotlight px-5 py-4 group card-lift"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-0 font-medium">
              {trip.trip_reference || `Trip #${trip.id}`}
            </span>

            <span
              className={`inline-flex items-center gap-1 text-micro font-semibold px-2.5 py-0.5 rounded-full capitalize ${config.className}`}
            >
              {config.icon}
              {status.replace('_', ' ')}
            </span>
          </div>

          <div className="text-[11px] text-ink-2 mt-1 truncate">
            {trip.origin_address || 'Origin not set'}
            <span className="mx-1">→</span>
            {trip.destination_address || 'Destination not set'}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-[11px] text-brand-text">{trip.vehicle?.name || 'No vehicle'}</div>

          <div className="text-[10px] text-ink-2 mt-0.5">{driverName || 'No driver'}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-ink-2">
        {trip.purpose && <span className="capitalize">Purpose: {trip.purpose}</span>}

        {trip.planned_distance_km != null && (
          <span>Planned: {formatQty(u.distance, trip.planned_distance_km)}</span>
        )}

        {trip.actual_distance_km != null && (
          <span>Actual: {formatQty(u.distance, trip.actual_distance_km)}</span>
        )}
      </div>
    </button>
  );
}

function NewTripForm({ onClose, onCreated }: { onClose?: () => void; onCreated?: () => void }) {
  const u = useUnits();
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripReference, setTripReference] = useState('');
  const [purpose, setPurpose] = useState('');

  const [originAddress, setOriginAddress] = useState('');
  const [originLatitude, setOriginLatitude] = useState('');
  const [originLongitude, setOriginLongitude] = useState('');

  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationLatitude, setDestinationLatitude] = useState('');
  const [destinationLongitude, setDestinationLongitude] = useState('');

  const [plannedStartAt, setPlannedStartAt] = useState('');
  const [plannedEndAt, setPlannedEndAt] = useState('');
  const [plannedDistance, setPlannedDistance] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [notes, setNotes] = useState('');

  // ---------------------------------------------------------
  // Planned yards
  // ---------------------------------------------------------
  const [plannedYards, setPlannedYards] = useState<StopDraft[]>([]);
  const [stopErrors, setStopErrors] = useState<Record<string, string[] | string> | undefined>();

  const [submitting, setSubmitting] = useState(false);

  // Picking a vehicle pre-selects its current driver (the backend snapshots it anyway); the operator
  // can still choose a different one. The options endpoint does not carry the driver, so read it from
  // the vehicle's own record.
  const handleVehicleChange = async (id: string) => {
    setVehicleId(id);
    setDriverId('');

    if (!id) return;

    const res: any = await get(`/api/vehicles/${id}`);

    setDriverId(String(res?.data?.vehicle?.current_driver_assignment?.driver?.id ?? ''));
  };

  const handleCreate = async () => {
    // Backend 422s without a driver unless the vehicle already has one (pre-filled above).
    if (!vehicleId || !driverId || !originAddress.trim() || !destinationAddress.trim()) {
      toast.error(
        !vehicleId
          ? 'Choose a vehicle for this trip.'
          : !driverId
            ? 'Choose a driver — this vehicle has none assigned.'
            : !originAddress.trim()
              ? 'Enter the origin address.'
              : 'Enter the destination address.'
      );

      return;
    }

    setSubmitting(true);
    setStopErrors(undefined);

    const payload = {
      vehicle_id: Number(vehicleId),
      driver_id: driverId ? Number(driverId) : null,
      trip_reference: tripReference.trim() || null,
      purpose: purpose.trim() || null,
      origin_address: originAddress.trim(),
      origin_latitude: originLatitude ? Number(originLatitude) : null,
      origin_longitude: originLongitude ? Number(originLongitude) : null,
      destination_address: destinationAddress.trim(),
      destination_latitude: destinationLatitude ? Number(destinationLatitude) : null,
      destination_longitude: destinationLongitude ? Number(destinationLongitude) : null,
      planned_start_at: toIsoInstant(plannedStartAt),
      planned_end_at: toIsoInstant(plannedEndAt),
      // Typed in the company's distance unit; the API takes km.
      planned_distance_km: plannedDistance ? toMetric(u.distance, plannedDistance) : null,
      odometer_start_km: odometerStart ? toMetric(u.distance, odometerStart) : null,

      // -------------------------------------------------------
      // Planned yards
      // -------------------------------------------------------
      planned_yards: stopsToCreatePayload(plannedYards),

      notes: notes.trim() || null,
    };

    const response = await post('/api/trips', payload, {}, false);

    setSubmitting(false);

    if (response?.error || response?.success === false) {
      setStopErrors(response?.errors);
      toast.error(response?.message || 'Could not create trip.');
      return;
    }

    toast.success('Trip created.');

    onCreated?.();
    onClose?.();
  };

  return (
    <div className="glass  p-6 mb-5">
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-3">New Trip</div>

      {/* =====================================================
          BASIC TRIP INFORMATION
      ====================================================== */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <OptionSelect
          kind="vehicles"
          value={vehicleId}
          onChange={id => handleVehicleChange(id)}
          placeholder="Select vehicle *"
          ariaLabel="Vehicle"
          emptyLabel="No vehicles available"
          getOption={v => ({
            label: `${v.name || `Vehicle #${v.id}`}${v.vehicle_category ? ` · ${v.vehicle_category}` : ''} (#${v.id})`,
          })}
        />

        <OptionSelect
          kind="drivers"
          value={driverId}
          onChange={setDriverId}
          placeholder="Select driver *"
          ariaLabel="Driver"
          emptyLabel="No drivers available"
          getOption={d => ({
            label: `${d.name}${d.license_number ? ` · ${d.license_number}` : ''}`,
          })}
        />

        <input
          value={tripReference}
          onChange={e => setTripReference(e.target.value)}
          placeholder="Trip reference"
          className="field"
        />

        <input
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder="Purpose (e.g. delivery)"
          className="field"
        />
      </div>

      {/* =====================================================
          ORIGIN
      ====================================================== */}
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Origin</div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          value={originAddress}
          onChange={e => setOriginAddress(e.target.value)}
          placeholder="Origin address *"
          className="field col-span-2"
        />

        <input
          value={originLatitude}
          onChange={e => setOriginLatitude(e.target.value)}
          placeholder="Latitude"
          type="number"
          step="any"
          className="field"
        />

        <input
          value={originLongitude}
          onChange={e => setOriginLongitude(e.target.value)}
          placeholder="Longitude"
          type="number"
          step="any"
          className="field"
        />

        <PickOnMapButton
          latitude={originLatitude}
          longitude={originLongitude}
          title="Pick the trip origin"
          onPick={(la, lo) => {
            setOriginLatitude(String(la));
            setOriginLongitude(String(lo));
          }}
          className="col-span-2"
        />
      </div>

      {/* =====================================================
          DESTINATION
      ====================================================== */}
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2">Destination</div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          value={destinationAddress}
          onChange={e => setDestinationAddress(e.target.value)}
          placeholder="Destination address *"
          className="field col-span-2"
        />

        <input
          value={destinationLatitude}
          onChange={e => setDestinationLatitude(e.target.value)}
          placeholder="Latitude"
          type="number"
          step="any"
          className="field"
        />

        <input
          value={destinationLongitude}
          onChange={e => setDestinationLongitude(e.target.value)}
          placeholder="Longitude"
          type="number"
          step="any"
          className="field"
        />

        <PickOnMapButton
          latitude={destinationLatitude}
          longitude={destinationLongitude}
          title="Pick the trip destination"
          onPick={(la, lo) => {
            setDestinationLatitude(String(la));
            setDestinationLongitude(String(lo));
          }}
          className="col-span-2"
        />
      </div>

      {/* =====================================================
          PLANNED YARDS
      ====================================================== */}
      <TripStopsEditor stops={plannedYards} onChange={setPlannedYards} errors={stopErrors} />

      {/* =====================================================
          PLANNING
      ====================================================== */}
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-2 mt-3">Planning</div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <DatePicker
          withTime
          value={plannedStartAt}
          onChange={setPlannedStartAt}
          aria-label="Planned start"
          placeholder="Planned start"
        />

        <DatePicker
          withTime
          value={plannedEndAt}
          onChange={setPlannedEndAt}
          aria-label="Planned end"
          placeholder="Planned end"
        />

        <input
          value={plannedDistance}
          onChange={e => setPlannedDistance(e.target.value)}
          placeholder={`Planned distance (${u.distance.label})`}
          type="number"
          step="any"
          className="field"
        />

        <input
          value={odometerStart}
          onChange={e => setOdometerStart(e.target.value)}
          placeholder={`Starting odometer (${u.distance.label})`}
          type="number"
          step="any"
          className="field"
        />

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="field col-span-2 resize-none"
        />
      </div>

      {/* =====================================================
          ACTIONS
      ====================================================== */}
      <RequiredHint
        missing={
          [
            !vehicleId && 'vehicle',
            !driverId && 'driver',
            !originAddress.trim() && 'origin',
            !destinationAddress.trim() && 'destination',
          ].filter(Boolean) as string[]
        }
      />
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="text-xs text-ink-2 border border-line bg-white hover:bg-surface-2 rounded-full px-3 py-1.5"
        >
          Cancel
        </button>

        <button
          onClick={handleCreate}
          disabled={submitting || !vehicleId || !originAddress.trim() || !destinationAddress.trim()}
          className="text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Create Trip'}
        </button>
      </div>
    </div>
  );
}
