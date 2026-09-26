/* eslint-disable @typescript-eslint/no-explicit-any */
import RequiredHint from '@components/RequiredHint';
import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { post } from '@utils/apiHelper';
import toast from 'react-hot-toast';
import DriverDetailModal from '@components/DriverDetailModal';
import DriverFields, { EMPTY_DRIVER_VALUES, driverToPayload } from '@components/DriverFields';
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

/**
 * Driver Management & Safety pillar — real list, consuming
 * GET /api/drivers exactly as built in the backend phase.
 */
const DRIVER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

// Backend `license_state` (flows/06 §15): expired = before today, expiring = today…+30 days, valid = later, none = no date.
const LICENCE_OPTIONS = [
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'valid', label: 'Valid' },
  { value: 'none', label: 'No licence recorded' },
];

const licenceState = (d: any) =>
  d.is_license_expired
    ? 'expired'
    : d.is_license_expiring_soon
      ? 'expiring'
      : d.license_expiry_date || d.license_number
        ? 'valid'
        : 'none';

const fullName = (d: any) => `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim();

export default function Drivers() {
  const { openModal } = useModal();
  const [showForm, setShowForm] = useState(false);
  // Deactivated (inactive) drivers are hidden by default; ?include_inactive=1 brings them back.
  const [showInactive, setShowInactive] = useState(false);

  // Server-side list (flows/06 §11): only the current page is downloaded. The storage key is versioned
  // because the persisted filter/sort keys changed from the old client-side ones.
  const list = useListState('drivers:server', { pageSize: 20 });
  const { state } = list;
  const { options } = useFleetOptions();

  const includeInactive = showInactive || state.filters.status === 'inactive';

  const view = useServerList<any>(list, {
    queryName: 'drivers-paged', // `driver` prefix → refetched by fleet:changed / reconnect
    url: '/api/drivers',
    sortKeys: ['name', 'license_expiry_date', 'hire_date', 'status', 'created_at'],
    extra: includeInactive ? { include_inactive: 1 } : {},
    filterParams: f => ({
      status: f.status,
      availability_status: f.availability,
      employment_status: f.employment,
      license_state: f.licence,
      assigned: f.assigned ? (f.assigned === 'yes' ? 1 : 0) : undefined,
    }),
  });
  const { isLoading, refetch } = view;
  const { counts } = useStatusCounts('drivers', view.filterParams);

  const filters: FilterDef[] = [
    { key: 'status', label: 'Status', options: DRIVER_STATUS_OPTIONS },
    {
      key: 'availability',
      label: 'Availability',
      options: options.availability_statuses.map(v => ({ value: v, label: optionLabel(v) })),
    },
    {
      key: 'employment',
      label: 'Employment',
      options: options.employment_statuses.map(v => ({ value: v, label: optionLabel(v) })),
    },
    { key: 'licence', label: 'Licence', options: LICENCE_OPTIONS },
    {
      key: 'assigned',
      label: 'Vehicle',
      options: [
        { value: 'yes', label: 'Has vehicle' },
        { value: 'no', label: 'No vehicle' },
      ],
    },
  ];

  const selection = useSelection<any>(
    JSON.stringify([state.search, state.filters, includeInactive])
  );
  const bulk = useBulkAction('drivers', 'driver');
  const exporter = useServerExport('/api/drivers/export', 'drivers');
  const chosen = selection.values;
  const chosenActive = chosen.filter(d => d.status !== 'inactive');
  const chosenInactive = chosen.filter(d => d.status === 'inactive');
  const pageIds = view.items.map(x => x.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selection.isSelected(id));
  const names = new Map(chosen.map(x => [String(x.id), fullName(x)] as [string, string]));

  // Ids mode acts on the ticked rows the action applies to; "all matching" mode sends the list's own
  // filter to the backend (≤ 500 records, narrowed to the rows the action can change).
  const runBulk = async (action: 'deactivate' | 'reactivate' | 'delete', rows: any[]) => {
    const targets = bulkTargets(
      'drivers',
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
  const actionCount = (rows: any[]) => (selection.allMatching ? selection.count : rows.length);
  const confirmAll = (verb: string) =>
    selection.allMatching ? `${verb} all ${selection.count} matching drivers?` : undefined;

  return (
    <div className="flex flex-col pt-3 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="text-[13.5px] text-ink-1 mt-1">
            {isLoading
              ? 'Loading…'
              : `${view.total} driver${view.total === 1 ? '' : 's'}${list.hasActiveFilters ? ' matching' : ''}`}
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
            <Plus size={13} /> Add Driver
          </button>
        </div>
      </div>

      {showForm && <NewDriverForm onClose={() => setShowForm(false)} onCreated={refetch} />}

      <StatusChips
        counts={counts}
        options={DRIVER_STATUS_OPTIONS}
        value={state.filters.status}
        onChange={v => list.setFilter('status', v)}
        totalLabel="Total (incl. inactive)"
      />

      <DataToolbar
        search={state.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search name, licence, email, phone…"
        filters={filters}
        values={state.filters}
        onFilter={list.setFilter}
        onClear={list.clearFilters}
        hasActive={list.hasActiveFilters}
        sortOptions={[
          { value: 'name', label: 'Name' },
          { value: 'license_expiry_date', label: 'Licence expiry' },
          { value: 'hire_date', label: 'Hire date' },
          { value: 'status', label: 'Status' },
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
              ? `Permanently delete all ${selection.count} matching drivers? Only never-used records are deleted; the rest are refused with a reason.`
              : `Permanently delete ${chosen.length} selected drivers? Only never-used records are deleted; the rest are refused with a reason. This can't be undone.`,
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
              No drivers match your search or filters.{' '}
              <button onClick={list.clearFilters} className="text-accent-cyan underline">
                Clear them
              </button>
            </>
          ) : (
            'No drivers added yet.'
          )}
        </div>
      )}

      {!isLoading && view.items.length > 0 && (
        <div className="space-y-3 motion-stagger">
          {view.items.map(d => (
            <SelectableRow
              key={d.id}
              selected={selection.isSelected(d.id)}
              onToggle={() => selection.toggle(d.id, d, view.items)}
              label={fullName(d)}
            >
              <DriverRow
                driver={d}
                onClick={() => openModal(<DriverDetailModal driverId={d.id} />)}
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

function DriverRow({ driver, onClick }: { driver: any; onClick: () => void }) {
  const vehicle = driver.current_assignment?.vehicle;
  const statusColors: Record<string, string> = {
    active: 'bg-accent-green/10 text-accent-green',
    inactive: 'bg-surface-3 text-ink-2',
    suspended: 'bg-danger/10 text-danger',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center justify-between glass-strong spotlight px-5 py-4 card-lift ${
        driver.status === 'inactive' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-card text-body font-semibold text-white"
          style={{ background: 'var(--gradient-avatar)' }}
          aria-hidden
        >
          {`${driver.first_name?.[0] ?? ''}${driver.last_name?.[0] ?? ''}`.toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink-0">
              {driver.first_name} {driver.last_name}
            </span>
            <span
              className={`text-micro font-semibold px-2.5 py-0.5 rounded-full ${statusColors[driver.status] || statusColors.inactive}`}
            >
              {driver.status}
            </span>
            {driver.is_license_expired && (
              <span className="flex items-center gap-1 text-[10px] text-danger">
                <AlertTriangle size={10} /> License expired
              </span>
            )}
            {!driver.is_license_expired && driver.is_license_expiring_soon && (
              <span className="flex items-center gap-1 text-[10px] text-warning">
                <AlertTriangle size={10} /> License expiring soon
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-2 mt-1">
            {driver.license_class || 'No license class set'}
            {driver.license_number && ` · ${driver.license_number}`}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-ink-2 text-right">
        {vehicle ? (
          <span className="text-accent-cyan">{vehicle.name}</span>
        ) : (
          <span className="italic">No vehicle assigned</span>
        )}
      </div>
    </button>
  );
}

function NewDriverForm({ onClose, onCreated }: { onClose?: () => void; onCreated?: () => void }) {
  const [values, setValues] = useState(EMPTY_DRIVER_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const valid = values.first_name.trim() && values.last_name.trim();

  const handleCreate = async () => {
    if (!valid) return;

    setSubmitting(true);
    const response = await post('/api/drivers', driverToPayload(values), {}, false);
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create driver.');

      return;
    }

    toast.success('Driver added.');
    onCreated?.();
    onClose?.();
  };

  return (
    <div className="glass  p-6 mb-5">
      <DriverFields values={values} onChange={setValues} />
      <RequiredHint
        missing={
          [
            !values.first_name.trim() && 'first name',
            !values.last_name.trim() && 'last name',
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
          disabled={submitting || !valid}
          className="text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Add Driver'}
        </button>
      </div>
    </div>
  );
}
