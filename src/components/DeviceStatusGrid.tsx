import { useState, useMemo } from 'react';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';
import { Search, RefreshCw } from 'lucide-react';

/**
 * Replaces the widget-grid Dashboard (Grid.jsx) with a simpler per-device
 * status view. Swapped in at the Dashboard.jsx wrapper level rather than
 * editing Grid.jsx directly — Grid.jsx and its GridStack drag/drop logic
 * are untouched and still in the codebase if this needs to be reverted.
 *
 * Uses only real, already-existing data:
 *   - GET /api/devices returns products with nested devices (paginated) —
 *     flattened here into a flat device list.
 *   - device.status: a real fillable field, but it's a MANUAL active/inactive
 *     toggle (validated 'in:active,inactive' in DeviceController::store()),
 *     not an automatic online/offline signal. Shown as a separate fact.
 *   - device.last_updated: a real computed accessor (Device model's
 *     getLastUpdatedAttribute()) — human-readable time since the device's
 *     most recent DeviceValue, or 'never'. THIS is what actually reflects
 *     whether a device is currently reporting data.
 *
 * Deliberately not shown: an alarm/alert indicator per card. Assets already
 * have a real, working alert computation (AssetController::checkComponentAlerts),
 * but there's no equivalent for a bare device outside asset context — adding
 * one here would mean writing new backend logic, not reusing what exists,
 * which is a bigger decision than this pass makes on its own.
 */
export default function DeviceStatusGrid() {
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 12;

  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useSimpleQuery(
    `device-status-grid-page-${page}`,
    '/api/devices',
    { per_page: perPage, page },
    { enabled: !!user }
  );

  // API shape isn't being typed in this pass (see task.md); treat rows as `any`.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const products: any[] = response?.data?.data || [];
  const pagination: any = response?.data || {};

  const devices = useMemo<any[]>(() => {
    return products.flatMap((product: any) =>
      (product.devices || []).map((device: any) => ({
        ...device,
        productName: product.name,
      }))
    );
  }, [products]);

  const filteredDevices = useMemo<any[]>(() => {
    if (!search.trim()) return devices;
    const term = search.trim().toLowerCase();

    return devices.filter(
      (d: any) =>
        d.name?.toLowerCase().includes(term) ||
        d.device_unique_identifier?.toLowerCase().includes(term) ||
        d.productName?.toLowerCase().includes(term)
    );
  }, [devices, search]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="flex flex-col p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[15px] font-semibold text-ink-0 font-display">Device Status</h1>
          <p className="text-xs text-ink-2 mt-0.5">
            {pagination.total ?? devices.length} devices · showing status, not individual attribute
            widgets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search devices..."
              className="bg-surface-2 border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-ink-0 placeholder-ink-2 w-56"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="text-ink-2 hover:text-ink-0 border border-line rounded-md p-1.5"
            title="Refresh"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-ink-2 py-12 text-center">Loading device status...</div>
      )}

      {!isLoading && filteredDevices.length === 0 && (
        <div className="text-xs text-ink-2 py-12 text-center border border-dashed border-line rounded-md">
          {search ? 'No devices match your search.' : 'No devices found.'}
        </div>
      )}

      {!isLoading && filteredDevices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto">
          {filteredDevices.map(device => (
            <DeviceStatusCard key={device.id} device={device} />
          ))}
        </div>
      )}

      {pagination.last_page > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-xs text-ink-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-2 py-1 border border-line rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="font-mono text-ink-2">
            Page {pagination.current_page || page} of {pagination.last_page}
          </span>
          <button
            disabled={page >= pagination.last_page}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border border-line rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeviceStatusCard({ device }: { device: any }) {
  const isActive = device.status === 'active';
  const isReporting = device.last_updated && device.last_updated !== 'never';

  // Dot color reflects whether the device has ever reported data recently,
  // not the manual active/inactive toggle — "green" here means "we're
  // actually hearing from this device," which is the more useful signal
  // for an at-a-glance status view.
  const dotClass = isReporting ? 'bg-accent-green' : 'bg-ink-2';

  return (
    <div className="bg-surface-1 border border-line-soft rounded-md p-3.5 hover:border-line transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-0 truncate">{device.name}</div>
          <div className="text-[10px] font-mono text-ink-2 truncate">
            {device.device_unique_identifier}
          </div>
        </div>
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotClass}`}
          title={isReporting ? 'Reporting data' : 'No recent data'}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] mt-3 pt-3 border-t border-line-soft">
        <span className="text-ink-2">{device.productName}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isActive ? 'bg-accent-green/10 text-accent-green' : 'bg-surface-3 text-ink-2'
          }`}
        >
          {device.status || 'unknown'}
        </span>
      </div>

      <div className="text-[10px] font-mono text-ink-2 mt-1.5">
        Last data: <span className="text-ink-1">{device.last_updated || 'never'}</span>
      </div>
    </div>
  );
}
