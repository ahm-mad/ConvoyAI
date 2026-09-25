/* eslint-disable @typescript-eslint/no-explicit-any */
import { useModal } from '@contexts/ModalContext';
import { useOptions } from '@hooks/useOptions';
import { useListState } from '@hooks/useListState';
import { useServerList } from '@hooks/useServerList';
import DataToolbar, { type FilterDef } from '@components/list/DataToolbar';
import Pager from '@components/list/Pager';
import RecordItem from '@components/records/RecordItem';
import IncidentSummary from '@components/records/IncidentSummary';
import { INCIDENT_FIELDS, SEVERITY_FILTER } from '@components/records/fields';
import DriverDetailModal from '@components/DriverDetailModal';
import VehicleDetailModal from '@components/VehicleDetailModal';

/**
 * Every fleet incident of the company in one list (backend B7, flows/06 §26 — `GET /incidents`, always
 * paged): filter by date range, severity, driver, vehicle; search type / description; sort by date,
 * severity or created. Edit / delete work as on the per-driver / per-vehicle lists (same records); a new
 * incident is logged from the driver's Incidents tab. Incidents are fleet-only (driver-safety records) —
 * platform-wide alarms live in Alarms.
 */
const SORT_KEYS = ['incident_date', 'severity', 'created_at'];

export default function Incidents() {
  const { openModal } = useModal();
  const list = useListState('incidents', {
    pageSize: 20,
    sortBy: 'incident_date',
    sortDir: 'desc',
  });
  const { state } = list;

  const view = useServerList<any>(list, {
    queryName: 'fleet-incidents', // `fleet-` prefix → refetched by the fleet cache invalidations
    url: '/api/incidents',
    sortKeys: SORT_KEYS,
    filterParams: f => ({
      severity: f.severity,
      driver_id: f.driver_id,
      vehicle_id: f.vehicle_id,
      date_from: f.date_from,
      date_to: f.date_to,
    }),
  });

  // Filter dropdowns from the options endpoints; deactivated ones stay findable (history filter).
  const { items: drivers } = useOptions('drivers', { include_inactive: 1 });
  const { items: vehicles } = useOptions('vehicles', { include_inactive: 1 });

  const filters: FilterDef[] = [
    { ...SEVERITY_FILTER },
    {
      key: 'driver_id',
      label: 'Driver',
      options: drivers.map(d => ({ value: String(d.id), label: d.name })),
    },
    {
      key: 'vehicle_id',
      label: 'Vehicle',
      options: vehicles.map(v => ({
        value: String(v.id),
        label: `${v.name}${v.plate ? ` · ${v.plate}` : ''} (#${v.id})`,
      })),
    },
    { key: 'date_from', label: 'Date from', type: 'date' },
    { key: 'date_to', label: 'Date to', type: 'date' },
  ];

  return (
    <div className="flex flex-col p-5">
      <div className="mb-4">
        <h1 className="page-title">Incidents</h1>
        <p className="text-[13.5px] text-ink-1 mt-1">
          {view.total} incident{view.total === 1 ? '' : 's'} logged against your drivers and
          vehicles
        </p>
      </div>

      <DataToolbar
        search={state.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search type or description…"
        filters={filters}
        values={state.filters}
        onFilter={list.setFilter}
        onClear={list.clearFilters}
        hasActive={list.hasActiveFilters}
        sortOptions={[
          { value: 'incident_date', label: 'Incident date' },
          { value: 'severity', label: 'Severity' },
          { value: 'created_at', label: 'Date logged' },
        ]}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSort={list.setSort}
        summary={view.isFetching && !view.isLoading ? 'Updating…' : undefined}
      />

      {view.error && (
        <div className="flex items-center justify-between text-xs text-danger bg-danger/10 rounded-md px-3 py-2 mb-3">
          <span>{view.error}</span>
          <button onClick={() => view.refetch()} className="underline">
            Retry
          </button>
        </div>
      )}

      {view.isLoading && <div className="text-xs text-ink-2 py-8 text-center">Loading…</div>}

      {!view.isLoading && view.items.length === 0 && !view.error && (
        <div className="text-xs text-ink-2 py-12 text-center border border-dashed border-line rounded-md">
          {list.hasActiveFilters ? (
            <>
              No incidents match your search or filters.{' '}
              <button onClick={list.clearFilters} className="text-accent-cyan underline">
                Clear them
              </button>
            </>
          ) : (
            'No incidents have been logged yet. Log one from a driver’s Incidents tab.'
          )}
        </div>
      )}

      {view.items.map(incident => (
        <RecordItem
          key={incident.id}
          resource="incidents"
          record={incident}
          fields={INCIDENT_FIELDS}
          noun="Incident"
          deleteQuestion="Delete this incident?"
          onChanged={view.refetch}
        >
          <IncidentSummary
            incident={incident}
            onOpenDriver={id => openModal(<DriverDetailModal driverId={id} />)}
            onOpenVehicle={id => openModal(<VehicleDetailModal vehicleId={id} />)}
          />
        </RecordItem>
      ))}

      {!view.isLoading && view.total > 0 && (
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
