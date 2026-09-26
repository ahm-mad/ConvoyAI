/* eslint-disable @typescript-eslint/no-explicit-any */
import RequiredHint from '@components/RequiredHint';
import { useUnits } from '@hooks/useUnits';
import { formatQty, toDisplayString, toMetric } from '@utils/units';
import { useState } from 'react';
import { Plus, MapPin, LogIn, LogOut } from 'lucide-react';
import { useOptions } from '@hooks/useOptions';
import { post, put, del } from '@utils/apiHelper';
import PickOnMapButton from '@components/CoordinatePicker';
import GeofenceEditForm from '@components/GeofenceEditForm';
import AuditLine from '@components/AuditLine';
import DataToolbar, { type FilterDef } from '@components/list/DataToolbar';
import Pager from '@components/list/Pager';
import { useListState } from '@hooks/useListState';
import { useServerList } from '@hooks/useServerList';
import { useServerExport } from '@hooks/useServerExport';
import { useSelection } from '@hooks/useSelection';
import { useBulkAction, bulkTargets, type BulkAction } from '@hooks/useBulkAction';
import BulkBar from '@components/list/BulkBar';
import SelectableRow from '@components/list/SelectableRow';
import toast from 'react-hot-toast';
import DeleteControl from '@components/records/DeleteControl';
import { conflictMessage, expectedUpdatedAt } from '@utils/fleetConflict';

/**
 * Geofencing — real management UI for the highest-leverage gap identified
 * in the 5-pillar audit. Consumes GET /api/geofences and
 * GET /api/geofences/events exactly as built in the backend phase.
 */
export default function Geofences() {
  const u = useUnits();
  const [showForm, setShowForm] = useState(false);

  // Server-side lists (flows/06 §11): only the current page of each list is downloaded. The storage
  // keys are versioned because the persisted filter/sort keys changed from the old client-side ones.
  const list = useListState('geofences:server', { pageSize: 20 });
  const { state } = list;

  const view = useServerList<any>(list, {
    queryName: 'geofences-paged', // `geofence` prefix → refetched by fleet:changed / reconnect
    url: '/api/geofences',
    sortKeys: ['name', 'radius_m', 'created_at'],
    filterParams: f => ({
      is_active: f.active ? (f.active === 'yes' ? 1 : 0) : undefined,
      linked: f.type ? (f.type === 'yard' ? 1 : 0) : undefined,
      alert_on: f.alert,
    }),
  });
  const { isLoading, refetch } = view;
  const exporter = useServerExport('/api/geofences/export', 'geofences');
  const eventsExporter = useServerExport('/api/geofences/events/export', 'events');

  const selection = useSelection<any>(JSON.stringify([state.search, state.filters]));
  const bulk = useBulkAction('geofences', 'geofence');
  const chosen = selection.values;
  const chosenEnabled = chosen.filter(g => g.is_active);
  const chosenDisabled = chosen.filter(g => !g.is_active);
  const pageIds = view.items.map(g => g.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selection.isSelected(id));
  const names = new Map(chosen.map(g => [String(g.id), g.name] as [string, string]));

  const runBulk = async (action: BulkAction, rows: any[]) => {
    const targets = bulkTargets(
      'geofences',
      action,
      { allMatching: selection.allMatching, ids: rows.map(g => g.id) },
      view.filterParams
    );

    if (!targets) {
      toast(`Nothing to ${action} in this selection.`);

      return;
    }

    if (await bulk.run(action, targets, names)) selection.clear();
  };
  const actionCount = (rows: any[]) => (selection.allMatching ? selection.count : rows.length);

  // Events: real server-side paging + filters (backend now applies the geofence's alert_on filter
  // BEFORE the page, so a page is full whenever more events exist and `total` is exact).
  const eventList = useListState('geofence-events:server', { pageSize: 20 });
  const events = useServerList<any>(eventList, {
    queryName: 'geofence-events', // exact name: geofence:event invalidates it live
    url: '/api/geofences/events',
    sortKeys: [],
    filterParams: f => ({ event_type: f.event_type }),
    refetchInterval: 120000, // safety net; geofence:event refetches live
  });
  const eventLastPage = Math.max(1, Math.ceil(events.total / eventList.state.pageSize));

  // Yards for the "use a yard's coordinates" picker: active yards from the options endpoint.
  const { items: yards } = useOptions('yards');

  const [editingId, setEditingId] = useState<string | number | null>(null);

  const handleToggleActive = async (geofence: any) => {
    const response = await put(
      `/api/geofences/${geofence.id}`,
      { is_active: !geofence.is_active, ...expectedUpdatedAt(geofence) },
      {},
      false
    );
    if (response?.error || response?.success === false) {
      toast.error(conflictMessage(response) || response?.message || 'Could not update geofence.');
      if (response?.status === 409) refetch();

      return;
    }
    refetch();
  };

  const handleDelete = async (geofence: any) => {
    const response = await del(`/api/geofences/${geofence.id}`, {}, false);
    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not delete geofence.');

      return;
    }
    toast.success('Geofence deleted.');
    refetch();
  };

  const filters: FilterDef[] = [
    {
      key: 'active',
      label: 'State',
      options: [
        { value: 'yes', label: 'Enabled' },
        { value: 'no', label: 'Disabled' },
      ],
    },
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'yard', label: 'Yard-linked' },
        { value: 'manual', label: 'Manual' },
      ],
    },
    {
      key: 'alert',
      label: 'Alert on',
      options: [
        { value: 'both', label: 'Enter and exit' },
        { value: 'enter', label: 'Enter only' },
        { value: 'exit', label: 'Exit only' },
      ],
    },
  ];

  return (
    <div className="flex pt-3 pb-12 gap-6">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="page-title">Geofences</h1>
            <p className="text-[13.5px] text-ink-1 mt-1">
              {isLoading
                ? 'Loading…'
                : `${view.total} geofence${view.total === 1 ? '' : 's'}${list.hasActiveFilters ? ' matching' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 btn-brand text-[13px] font-semibold rounded-full px-5 py-2.5 transition-transform hover:-translate-y-px"
          >
            <Plus size={13} /> New Geofence
          </button>
        </div>

        {showForm && (
          <NewGeofenceForm yards={yards} onClose={() => setShowForm(false)} onCreated={refetch} />
        )}

        <DataToolbar
          search={state.search}
          onSearch={list.setSearch}
          searchPlaceholder="Search name or yard…"
          filters={filters}
          values={state.filters}
          onFilter={list.setFilter}
          onClear={list.clearFilters}
          hasActive={list.hasActiveFilters}
          views={list}
          sortOptions={[
            { value: 'name', label: 'Name' },
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
              label: 'Enable',
              count: actionCount(chosenDisabled),
              onClick: () => runBulk('enable', chosenDisabled),
            },
            {
              label: 'Disable',
              count: actionCount(chosenEnabled),
              onClick: () => runBulk('disable', chosenEnabled),
            },
            {
              label: 'Delete',
              count: actionCount(chosen),
              danger: true,
              confirm: selection.allMatching
                ? `Delete all ${selection.count} matching geofences and their events? This can't be undone.`
                : "Delete these geofences and their events? This can't be undone.",
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

        {!isLoading && view.total === 0 && !showForm && !view.error && (
          <div className="text-xs text-ink-2 py-12 text-center border border-dashed border-line rounded-md">
            {list.hasActiveFilters ? (
              <>
                No geofences match your search or filters.{' '}
                <button onClick={list.clearFilters} className="text-accent-cyan underline">
                  Clear them
                </button>
              </>
            ) : (
              'No geofences configured yet.'
            )}
          </div>
        )}

        <div className="space-y-2">
          {view.items.map(g => (
            <div key={g.id}>
              <SelectableRow
                selected={selection.isSelected(g.id)}
                onToggle={() => selection.toggle(g.id, g, view.items)}
                label={g.name}
              >
                <div className="flex items-center justify-between glass-strong  px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-accent-cyan" />
                      <span className="text-sm text-ink-0">{g.name}</span>
                      {!g.is_active && (
                        <span className="text-micro font-semibold text-ink-1 bg-surface-2 px-2.5 py-0.5 rounded-full">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-2 mt-1">
                      {formatQty(u.length, g.radius_m, 0)} radius · alerts on {g.alert_on}
                      {g.yard && ` · linked to ${g.yard.name}`}
                    </div>
                    <AuditLine record={g} className="text-[10px] text-ink-2 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(editingId === g.id ? null : g.id)}
                      className="btn-soft"
                    >
                      {editingId === g.id ? 'Close' : 'Edit'}
                    </button>
                    <button onClick={() => handleToggleActive(g)} className="btn-soft">
                      {g.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <DeleteControl
                      label="Delete"
                      question={`Delete geofence "${g.name}"? Its event history stays, but the zone stops alerting.`}
                      onConfirm={() => handleDelete(g)}
                    />
                  </div>
                </div>
              </SelectableRow>
              {editingId === g.id && (
                <GeofenceEditForm
                  geofence={g}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    refetch();
                  }}
                />
              )}
            </div>
          ))}
        </div>

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

      <div className="w-72 flex-shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-2">Recent Events</div>
          <button
            type="button"
            onClick={() => eventsExporter.run(events.filterParams)}
            disabled={events.total === 0 || eventsExporter.busy}
            className="text-[10px] text-accent-cyan hover:underline disabled:opacity-40"
          >
            {eventsExporter.busy ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        <div className="flex gap-1.5 mb-2">
          <input
            value={eventList.state.search}
            onChange={e => eventList.setSearch(e.target.value)}
            placeholder="Search geofence or vehicle…"
            aria-label="Search events"
            className="flex-1 min-w-0 bg-white border border-line rounded-xl px-2 py-1 text-[11px] text-ink-0"
          />
          <select
            value={eventList.state.filters.event_type ?? ''}
            onChange={e => eventList.setFilter('event_type', e.target.value)}
            aria-label="Event type"
            className="bg-white border border-line rounded-xl px-1.5 py-1 text-[11px] text-ink-0"
          >
            <option value="">All</option>
            <option value="enter">Enter</option>
            <option value="exit">Exit</option>
          </select>
        </div>
        {events.error && (
          <div className="flex items-center justify-between text-[11px] text-danger bg-danger/10 rounded-md px-2 py-1.5 mb-2">
            <span>{events.error}</span>
            <button onClick={() => events.refetch()} className="underline">
              Retry
            </button>
          </div>
        )}
        {!events.isLoading && !events.error && events.items.length === 0 && (
          <div className="text-[11px] text-ink-2 italic">
            {eventList.hasActiveFilters
              ? 'No events match.'
              : 'No geofence transitions recorded yet.'}
          </div>
        )}
        {events.items.map(e => (
          <div key={e.id} className="glass-strong  px-3 py-2.5 mb-2 text-xs">
            <div className="flex items-center gap-1.5">
              {e.event_type === 'enter' ? (
                <LogIn size={12} className="text-accent-green" />
              ) : (
                <LogOut size={12} className="text-warning" />
              )}
              <span className="text-ink-0">{e.device?.name}</span>
            </div>
            <div className="text-[11px] text-ink-2 mt-1">
              {e.event_type === 'enter' ? 'Entered' : 'Exited'} {e.geofence?.name} ·{' '}
              {new Date(e.occurred_at).toLocaleString()}
              {e.trip_id && <span className="text-accent-cyan"> · Trip #{e.trip_id}</span>}
            </div>
          </div>
        ))}
        {events.total > 0 && (
          <div className="flex items-center justify-between text-[11px] text-ink-2 mt-1">
            <span>
              {(eventList.state.page - 1) * eventList.state.pageSize + 1}–
              {Math.min(events.total, eventList.state.page * eventList.state.pageSize)} of{' '}
              {events.total}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                disabled={eventList.state.page <= 1}
                onClick={() => eventList.setPage(eventList.state.page - 1)}
                className="px-2 py-0.5 border border-line rounded hover:bg-surface-2 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <button
                type="button"
                disabled={eventList.state.page >= eventLastPage}
                onClick={() => eventList.setPage(eventList.state.page + 1)}
                className="px-2 py-0.5 border border-line rounded hover:bg-surface-2 disabled:opacity-40"
              >
                Next ›
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NewGeofenceForm({
  yards,
  onClose,
  onCreated,
}: {
  yards: any[];
  onClose?: () => void;
  onCreated?: () => void;
}) {
  const [name, setName] = useState('');
  const [yardId, setYardId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const u = useUnits();
  const [radius, setRadius] = useState(toDisplayString(u.length, 300, 0)); // 300 m by default
  const [alertOn, setAlertOn] = useState('both');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || (!yardId && (!lat || !lng))) return;

    setSubmitting(true);
    const response = await post(
      '/api/geofences',
      {
        name: name.trim(),
        yard_id: yardId || null,
        center_latitude: yardId ? null : parseFloat(lat),
        center_longitude: yardId ? null : parseFloat(lng),
        radius_m: Math.round(toMetric(u.length, radius) ?? 300),
        alert_on: alertOn,
      },
      {},
      false
    );
    setSubmitting(false);

    if (response?.error || response?.success === false) {
      toast.error(response?.message || 'Could not create geofence.');

      return;
    }

    toast.success('Geofence created.');
    onCreated?.();
    onClose?.();
  };

  return (
    <div className="glass  p-6 mb-5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Geofence name"
        className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mb-2"
      />

      <label className="text-[10px] uppercase text-ink-2">Center</label>
      <select
        value={yardId}
        onChange={e => setYardId(e.target.value)}
        className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mt-1 mb-2"
      >
        <option value="">Enter coordinates manually</option>
        {yards.map(y => (
          <option key={y.id} value={y.id}>
            Use {y.name}'s coordinates
          </option>
        ))}
      </select>

      {!yardId && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            value={lat}
            onChange={e => setLat(e.target.value)}
            placeholder="Latitude"
            className="bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
          />
          <input
            value={lng}
            onChange={e => setLng(e.target.value)}
            placeholder="Longitude"
            className="bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0"
          />
          <PickOnMapButton
            latitude={lat}
            longitude={lng}
            title="Pick the geofence centre"
            onPick={(la, lo) => {
              setLat(String(la));
              setLng(String(lo));
            }}
            className="col-span-2"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[10px] uppercase text-ink-2">Radius ({u.length.label})</label>
          <input
            value={radius}
            onChange={e => setRadius(e.target.value)}
            type="number"
            className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase text-ink-2">Alert on</label>
          <select
            value={alertOn}
            onChange={e => setAlertOn(e.target.value)}
            className="w-full bg-white border border-line rounded-xl px-2.5 py-1.5 text-xs text-ink-0 mt-1"
          >
            <option value="both">Enter &amp; Exit</option>
            <option value="enter">Enter only</option>
            <option value="exit">Exit only</option>
          </select>
        </div>
      </div>

      <RequiredHint
        missing={
          [!name.trim() && 'name', !yardId && (!lat || !lng) && 'a yard or coordinates'].filter(
            Boolean
          ) as string[]
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
          disabled={submitting || !name.trim() || (!yardId && (!lat || !lng))}
          className="text-xs btn-brand border border-transparent rounded-full px-3 py-1.5 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Create Geofence'}
        </button>
      </div>
    </div>
  );
}
