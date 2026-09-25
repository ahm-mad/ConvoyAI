/* eslint-disable @typescript-eslint/no-explicit-any */
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { useState } from 'react';
import { Plus, Warehouse } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { post } from '@utils/apiHelper';
import PickOnMapButton from '@components/CoordinatePicker';
import toast from 'react-hot-toast';
import YardLayoutEditor from '@components/YardLayoutEditor';
import DataToolbar, { type FilterDef } from '@components/list/DataToolbar';
import Pager from '@components/list/Pager';
import BulkBar from '@components/list/BulkBar';
import SelectableRow from '@components/list/SelectableRow';
import { useListState } from '@hooks/useListState';
import { useServerList } from '@hooks/useServerList';
import { useServerExport } from '@hooks/useServerExport';
import { useSelection } from '@hooks/useSelection';
import { useBulkAction, bulkTargets } from '@hooks/useBulkAction';

/**
 * Standalone yard list — previously only reachable by clicking a pin on
 * FleetMap. Consumes GET /api/yards exactly as built during the yard
 * management phase. Clicking a yard opens the same YardLayoutEditor used
 * from the map — one editor, two entry points, not a second one built.
 */
export default function Yards() {
  const u = useUnits();
  const { openModal } = useModal();
  const [showForm, setShowForm] = useState(false);

  // Deactivated yards are hidden by default; ?include_inactive=1 brings them back.
  const [showInactive, setShowInactive] = useState(false);

  // Server-side list (flows/06 §11): only the current page is downloaded. The storage key is versioned
  // because the persisted filter/sort keys changed from the old client-side ones.
  const list = useListState('yards:server', { pageSize: 20 });
  const { state } = list;

  const includeInactive = showInactive;

  const view = useServerList<any>(list, {
    queryName: 'yards-paged', // `yard` prefix → refetched by fleet:changed / reconnect
    url: '/api/yards',
    sortKeys: ['name', 'created_at', 'slots_count', 'radius_m'],
    extra: includeInactive ? { include_inactive: 1 } : {},
    filterParams: f => ({
      is_active: f.active ? (f.active === 'yes' ? 1 : 0) : undefined, // 0 = deactivated only (wins over include_inactive)
      has_slots: f.slots ? (f.slots === 'yes' ? 1 : 0) : undefined,
      has_coordinates: f.location ? (f.location === 'yes' ? 1 : 0) : undefined,
      has_layout: f.layout ? (f.layout === 'yes' ? 1 : 0) : undefined,
    }),
  });
  const { isLoading, refetch } = view;

  const filters: FilterDef[] = [
    {
      key: 'active',
      label: 'State',
      options: [
        { value: 'yes', label: 'Active' },
        { value: 'no', label: 'Inactive' },
      ],
    },
    {
      key: 'location',
      label: 'Location',
      options: [
        { value: 'yes', label: 'Has coordinates' },
        { value: 'no', label: 'No coordinates' },
      ],
    },
    {
      key: 'slots',
      label: 'Slots',
      options: [
        { value: 'yes', label: 'Has slots' },
        { value: 'no', label: 'No slots' },
      ],
    },
    {
      key: 'layout',
      label: 'Layout',
      options: [
        { value: 'yes', label: 'Has layout image' },
        { value: 'no', label: 'No layout image' },
      ],
    },
  ];

  const selection = useSelection<any>(
    JSON.stringify([state.search, state.filters, includeInactive])
  );
  const bulk = useBulkAction('yards', 'yard');
  const exporter = useServerExport('/api/yards/export', 'yards');
  const chosen = selection.values;
  const chosenActive = chosen.filter(y => y.is_active !== false);
  const chosenInactive = chosen.filter(y => y.is_active === false);
  const pageIds = view.items.map(x => x.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selection.isSelected(id));
  const names = new Map(chosen.map(x => [String(x.id), x.name] as [string, string]));

  // Ids mode acts on the ticked rows the action applies to; "all matching" mode sends the list's own
  // filter to the backend (≤ 500 records, narrowed to the rows the action can change).
  const runBulk = async (action: 'deactivate' | 'reactivate' | 'delete', rows: any[]) => {
    const targets = bulkTargets(
      'yards',
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
    selection.allMatching ? `${verb} all ${selection.count} matching yards?` : undefined;

  return (
    <div className="flex flex-col pt-3 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Yards</h1>
          <p className="text-[13.5px] text-ink-1 mt-1">
            {isLoading
              ? 'Loading…'
              : `${view.total} yard${view.total === 1 ? '' : 's'}${list.hasActiveFilters ? ' matching' : ''}`}
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
            <Plus size={13} /> Add Yard
          </button>
        </div>
      </div>

      {showForm && <NewYardForm onClose={() => setShowForm(false)} onCreated={refetch} />}

      <DataToolbar
        search={state.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search name or address…"
        filters={filters}
        values={state.filters}
        onFilter={list.setFilter}
        onClear={list.clearFilters}
        hasActive={list.hasActiveFilters}
        sortOptions={[
          { value: 'name', label: 'Name' },
          { value: 'slots_count', label: 'Slots' },
          { value: 'radius_m', label: 'Radius' },
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
              ? `Permanently delete all ${selection.count} matching yards? Only never-used records are deleted; the rest are refused with a reason.`
              : `Permanently delete ${chosen.length} selected yards? Only never-used records are deleted; the rest are refused with a reason. This can't be undone.`,
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
              No yards match your search or filters.{' '}
              <button onClick={list.clearFilters} className="text-accent-cyan underline">
                Clear them
              </button>
            </>
          ) : (
            'No yards added yet.'
          )}
        </div>
      )}

      {!isLoading && view.items.length > 0 && (
        <div className="space-y-2">
          {view.items.map(y => (
            <SelectableRow
              key={y.id}
              selected={selection.isSelected(y.id)}
              onToggle={() => selection.toggle(y.id, y, view.items)}
              label={y.name}
            >
              <button
                onClick={() => openModal(<YardLayoutEditor yardId={y.id} yardName={y.name} />)}
                className={`w-full text-left flex items-center justify-between glass-strong  px-5 py-4 card-lift ${
                  y.is_active === false ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-card bg-brand-wash text-brand flex items-center justify-center flex-shrink-0">
                    <Warehouse size={15} className="text-ink-2" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm text-ink-0">
                      {y.name}
                      {y.is_active === false && (
                        <span className="text-micro font-semibold px-2.5 py-0.5 rounded-full bg-surface-3 text-ink-2">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-2 mt-1">
                      {y.address || 'No address set'}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-ink-2">
                  {y.radius_m != null && `${formatQty(u.length, y.radius_m, 0)} radius · `}
                  {y.slots_count ?? 0} slot{y.slots_count === 1 ? '' : 's'}
                </div>
              </button>
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

function NewYardForm({ onClose, onCreated }: { onClose?: () => void; onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // Detection radius of the yard's linked geofence (created automatically when the yard has a
  // location) — backend default 100 m, minimum 10 (flows/05 §8 7.4).
  const u = useUnits();
  const [radius, setRadius] = useState(toDisplayString(u.length, 100, 0));
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setSubmitting(true);
    const response = await post(
      '/api/yards',
      {
        name: name.trim(),
        address: address.trim() || null,
        latitude: lat ? parseFloat(lat) : null,
        longitude: lng ? parseFloat(lng) : null,
        ...(lat && lng && radius.trim()
          ? { radius_m: Math.round(toMetric(u.length, radius) ?? 100) }
          : {}),
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create yard.');

      return;
    }

    toast.success('Yard added.');
    onCreated?.();
    onClose?.();
  };

  return (
    <div className="glass  p-6 mb-5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Yard name"
        className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mb-2"
      />
      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="Address (optional)"
        className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mb-2"
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          value={lat}
          onChange={e => setLat(e.target.value)}
          placeholder="Latitude (optional)"
          className="bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
        />
        <input
          value={lng}
          onChange={e => setLng(e.target.value)}
          placeholder="Longitude (optional)"
          className="bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
        />
        <PickOnMapButton
          latitude={lat}
          longitude={lng}
          title="Pick the yard location"
          onPick={(la, lo) => {
            setLat(String(la));
            setLng(String(lo));
          }}
          className="col-span-2"
        />
        {lat && lng && (
          <label className="col-span-2 block">
            <span className="block text-[10px] uppercase tracking-wide text-ink-2 mb-1">
              Detection radius ({u.length.label}, min {toDisplayString(u.length, 10, 0)})
            </span>
            <input
              value={radius}
              onChange={e => setRadius(e.target.value)}
              type="number"
              min={10}
              className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
            />
            <span className="block text-[10px] text-ink-2 mt-1">
              A geofence of this size is created for the yard, so sensors detect vehicles entering
              and leaving it. You can change it later.
            </span>
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="text-xs text-ink-2 border border-line rounded-md px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={submitting || !name.trim()}
          className="text-xs text-accent-cyan border border-line rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Add Yard'}
        </button>
      </div>
    </div>
  );
}
