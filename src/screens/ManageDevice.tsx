/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ListAlt as ListAltIcon,
  SignalWifiOff as SignalWifiOffIcon,
  Devices as DevicesIcon,
  Tune as TuneIcon,
  IntegrationInstructions as IntegrationInstructionsIcon,
  History as HistoryIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  SignalWifiStatusbar4Bar as SignalWifiStatusbar4BarIcon,
} from '@components/ui/icons';
import React, { useState, useEffect } from 'react';
import DataTable, { type DataTableColumn } from '@components/RadixTable';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useParams, useNavigate, useLocation } from '@lib/router-compat';
import { useTranslation } from 'react-i18next';
import { useUser } from '@contexts/UserContext';
import { useModal } from '@contexts/ModalContext';
import AddDevices from '@forms/MultiStepForm/AddDevices';
import { post, put } from '../utils/apiHelper';
import ConfirmModal from '../components/ConfirmActivationModal';
import GlobalInput from '../components/Input';

import ProductConfiguration from './ProductConfiguration';
import TableSkeleton from '@components/TableSkeleton';
import { useToast } from '@contexts/ToastContext';
import DevicePointsModal from '@components/DevicePointsModal';
import ProtocolIntegration from './ProtocolIntegration';
import SelectRadix from '@components/Select';
import PacketPayloadViewer from '@components/PacketPayloadViewer';
import { useSocket } from '@contexts/SocketContext';
import { ChevronDown } from 'lucide-react';

interface EditingCell {
  rowId: any;
  field: string;
}

export default function ManageDevice() {
  const { t } = useTranslation();
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const { user } = useUser();
  const { openModal, closeModal } = useModal();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState(
    location?.state?.from == 'packetToatManager' ? 'configuration' : 'devices'
  );

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // History tab state (packet history)
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyDebouncedSearch, setHistoryDebouncedSearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);
  const [historySortBy, setHistorySortBy] = useState('received_at');
  const [historySortOrder, setHistorySortOrder] = useState('desc');
  const [hasLoadedHistoryOnce, setHasLoadedHistoryOnce] = useState(false);
  // Which device's packets to show ('' = every device under this product).
  const [historyDeviceFilter, setHistoryDeviceFilter] = useState('');
  // Which rows' "View Details" accordion is open — a Set so more than one can be open at once.
  const [expandedPacketIds, setExpandedPacketIds] = useState<Set<any>>(new Set());

  const productName = location.state?.productName || `Product ${productId}`;

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Debounce history search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setHistoryDebouncedSearch(historySearchTerm);
      setHistoryPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [historySearchTerm]);

  const queryParams = React.useMemo(() => {
    const params: Record<string, any> = {
      user_id: user?.id,
      page: currentPage,
      per_page: rowsPerPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    };

    if (debouncedSearch) {
      params.search = debouncedSearch;
    }

    return params;
  }, [user?.id, currentPage, rowsPerPage, debouncedSearch, sortBy, sortOrder]);

  const {
    data: devicesData,
    isLoading,
    refetch,
  } = useSimpleQuery(
    `product-${productId}-devices-page-${currentPage}-${rowsPerPage}-${debouncedSearch}-${sortBy}-${sortOrder}`,
    `/api/products/${productId}`,
    queryParams
  );

  useEffect(() => {
    if (devicesData && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [devicesData, hasLoadedOnce]);

  // Packet history query params (scoped to this product)
  const historyQueryParams = React.useMemo(() => {
    const params: Record<string, any> = {
      product_id: productId,
      page: historyPage,
      per_page: historyRowsPerPage,
      sort_by: historySortBy,
      sort_order: historySortOrder,
    };

    if (historyDebouncedSearch) {
      params.search = historyDebouncedSearch;
    }

    // device_unique_identifier, per backend_frontend_sync/communication/flows/02-packet-history-live-view.md
    // (open question — assumed until the backend session confirms/corrects it there).
    if (historyDeviceFilter) {
      params.device_id = historyDeviceFilter;
    }

    return params;
  }, [
    productId,
    historyPage,
    historyRowsPerPage,
    historyDebouncedSearch,
    historySortBy,
    historySortOrder,
    historyDeviceFilter,
  ]);

  const {
    data: historyData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useSimpleQuery(
    `product-${productId}-packet-history-page-${historyPage}-${historyRowsPerPage}-${historyDebouncedSearch}-${historySortBy}-${historySortOrder}`,
    `/api/dashboard/packet-history`,
    historyQueryParams,
    { enabled: activeTab === 'history' }
  );

  useEffect(() => {
    if (historyData && !hasLoadedHistoryOnce) {
      setHasLoadedHistoryOnce(true);
    }
  }, [historyData, hasLoadedHistoryOnce]);

  // Device list for this product, to populate the history device-filter dropdown — deliberately
  // separate from the Devices tab's own paginated `devicesData` query above, so a product with more
  // devices than one page of THAT query doesn't silently hide some from the dropdown. per_page is capped
  // at 100 by the backend (verified live 2026-09-22 — a higher value 422s the whole request, which
  // silently emptied this dropdown until caught); a product with more than 100 devices would still miss
  // some here — not handled, flagged as a known limit rather than guessed at further.
  const { data: allProductDevicesData } = useSimpleQuery(
    `product-${productId}-devices-for-history-filter`,
    `/api/products/${productId}`,
    { user_id: user?.id, page: 1, per_page: 100 },
    { enabled: activeTab === 'history' }
  );

  const deviceFilterOptions = React.useMemo(() => {
    const devices = allProductDevicesData?.data?.devices || [];
    return devices.map((d: any) => ({
      value: d.device_unique_identifier,
      label: d.name ? `${d.name} (${d.device_unique_identifier})` : d.device_unique_identifier,
    }));
  }, [allProductDevicesData]);

  // device:value's `deviceId` is now product-scoped (backend fix D-0142, 2026-09-22 — see the flow doc's
  // "Backend resolution" section; was previously a global lookup that could return another product's
  // device row for a duplicate device_unique_identifier). Matched against the DB id below to decide
  // whether a live update is relevant to the currently selected device filter.
  const deviceDbIdByIdentifier = React.useMemo(() => {
    const map = new Map<string, string>();
    const devices = allProductDevicesData?.data?.devices || [];
    devices.forEach((d: any) => {
      if (d.device_unique_identifier != null && d.id != null) {
        map.set(d.device_unique_identifier, String(d.id));
      }
    });
    return map;
  }, [allProductDevicesData]);

  // The attributes the user configured for this product ("Configure Attribute") — each becomes its own
  // column in the history table. Same endpoint ProductConfiguration.tsx reads; response has
  // `user_preference_attributes` at the top level, not nested under `.data` (verified live 2026-09-22).
  const { data: productSettingsData } = useSimpleQuery(
    `product-${productId}-settings-for-history`,
    `/api/product-settings/${productId}`,
    {},
    { enabled: activeTab === 'history' }
  );

  const configuredAttributes = React.useMemo(
    () => productSettingsData?.user_preference_attributes || [],
    [productSettingsData]
  );

  // Live updates: device:value fires once per ingested packet. We don't try to merge its
  // `cleanedPacket` into a synthesized row (its exact key format isn't confirmed — see the flow doc) —
  // instead, on a match, just refetch packet-history in the background. react-query keeps the current
  // page's data on screen while doing this (no loading flash), so a new packet shows up within the
  // debounce window without the user doing anything.
  //
  // Scoped to what's actually on screen (restored 2026-09-22 after backend fix D-0142 — deviceId is now
  // product-scoped, so it's safe to trust): with no device filter (viewing "All devices"), any packet for
  // this product is relevant. With one device selected, a packet from a DIFFERENT device is not shown and
  // must NOT trigger a refetch — switching the dropdown itself already fetches that device's latest data
  // via the normal query (historyDeviceFilter is part of the query key).
  const { bindDeviceValueEvent, unbindDeviceValueEvent } = useSocket();
  const liveRefetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!productId) return;
    bindDeviceValueEvent(productId, (data: any) => {
      if (historyDeviceFilter) {
        const eventDeviceId = String(data?.deviceId ?? '');
        const selectedDbId = deviceDbIdByIdentifier.get(historyDeviceFilter);
        const matchesSelectedDevice =
          eventDeviceId === historyDeviceFilter || eventDeviceId === selectedDbId;
        if (!matchesSelectedDevice) return;
      }
      if (liveRefetchTimer.current) clearTimeout(liveRefetchTimer.current);
      liveRefetchTimer.current = setTimeout(() => {
        refetchHistory();
      }, 600);
    });
    return () => {
      unbindDeviceValueEvent(productId);
      if (liveRefetchTimer.current) clearTimeout(liveRefetchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, historyDeviceFilter, deviceDbIdByIdentifier]);

  // Direct data from API - no client-side processing
  const allDevices = React.useMemo(() => {
    if (!devicesData?.data?.devices) {
      return [];
    }
    return devicesData.data.devices;
  }, [devicesData]);

  const paginationData = React.useMemo(() => {
    const pagination = devicesData?.data?.pagination || {
      current_page: 1,
      per_page: 25,
      total: 0,
      last_page: 1,
      from: 0,
      to: 0,
      has_more_pages: false,
    };
    return pagination;
  }, [devicesData]);

  const packetHistory = React.useMemo(() => {
    if (!historyData?.data?.packets) {
      return [];
    }
    return historyData.data.packets;
  }, [historyData]);

  const historyPaginationData = React.useMemo(() => {
    const pagination = historyData?.data?.pagination || {
      current_page: 1,
      per_page: 10,
      total: 0,
      last_page: 1,
      from: 0,
      to: 0,
    };
    return pagination;
  }, [historyData]);

  const historySummary = React.useMemo(() => {
    return (
      historyData?.data?.summary || {
        total: 0,
        alerts: 0,
        normal: 0,
      }
    );
  }, [historyData]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
  };

  const handleHistorySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHistorySearchTerm(value);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setSelectedDevices([]);
  };

  const handleHistoryPageChange = (newPage: number) => {
    setHistoryPage(newPage);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    setSelectedDevices([]);
  };

  const handleHistoryRowsPerPageChange = (newRowsPerPage: number) => {
    setHistoryRowsPerPage(newRowsPerPage);
    setHistoryPage(1);
  };

  const handleSort = (columnKey: string, direction: string) => {
    setSortBy(columnKey);
    setSortOrder(direction);
    setCurrentPage(1);
  };

  const handleHistorySort = (columnKey: string, direction: string) => {
    setHistorySortBy(columnKey);
    setHistorySortOrder(direction);
    setHistoryPage(1);
  };

  const handleHistoryDeviceFilterChange = (value: string) => {
    setHistoryDeviceFilter(value);
    setHistoryPage(1);
  };

  const toggleExpandedPacket = (id: any) => {
    setExpandedPacketIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Resolves a dot-path attribute_key (e.g. "object.temperature", "deviceInfo.devEui" — same convention
  // as user_preference_attributes elsewhere) against a packet's raw json_body. Returns undefined rather
  // than throwing if a segment is missing, so a misconfigured/legacy attribute just shows a blank cell.
  const getAttributeValue = (jsonBody: any, attributeKey: string): any => {
    if (!jsonBody || !attributeKey) return undefined;
    return attributeKey
      .split('.')
      .reduce((acc: any, segment: string) => (acc == null ? undefined : acc[segment]), jsonBody);
  };

  const handleSelectionChange = (selectedIds: any[]) => {
    setSelectedDevices(selectedIds);
  };

  const handleAddDevice = () => {
    const currentProduct = {
      id: productId,
      name: productName,
    };

    openModal(
      <AddDevices
        productId={productId}
        product={currentProduct}
        preSelectedProduct={true}
        onSuccess={() => {
          refetch();
          closeModal();
        }}
        onClose={() => {
          closeModal();
        }}
      />
    );
  };

  // Inline editing functions
  const handleEditClick = (item: any, field: string) => {
    setEditingCell({ rowId: item.id, field });
    setEditValue(item[field] || '');
  };

  const handleSaveEdit = async (item: any) => {
    if (!editingCell) return;

    setIsSaving(true);
    try {
      const result = await put(`/api/devices/${item.id}`, {
        [editingCell.field]: editValue,
      });

      if (result?.success) {
        await refetch();
        setEditingCell(null);
        setEditValue('');
      }
    } catch (error) {
      console.error('Error updating device:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  useEffect(() => {
    if (location.pathname.includes('configuration')) {
      setActiveTab('configuration');
    } else if (location.pathname.includes('integration')) {
      setActiveTab('integration');
    } else if (location.pathname.includes('history')) {
      setActiveTab('history');
    } else {
      setActiveTab('devices');
    }
  }, [location.pathname]);

  // Bulk actions for devices
  const bulkActions = [
    {
      label: 'Enable Selected',
      value: 'enable',
    },
    {
      label: 'Disable Selected',
      value: 'disable',
    },
    {
      label: 'Delete Selected',
      value: 'delete',
    },
  ];

  // Handle bulk delete with confirmation modal
  const handleBulkDeleteClick = () => {
    if (selectedDevices.length === 0) return;

    const selectedCount = selectedDevices.length;

    openModal(
      <ConfirmModal
        title="Delete Devices"
        message={`Are you sure you want to delete ${selectedCount} selected device${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonColor="bg-danger hover:brightness-110"
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  // Confirm and execute bulk delete
  const handleConfirmBulkDelete = async () => {
    try {
      const result = await post('/api/devices/bulk/destroy', {
        device_ids: selectedDevices,
      });

      if (result?.success) {
        await refetch();
        setSelectedDevices([]);
        closeModal();
        console.log(
          `${result.data?.deleted_count || selectedDevices.length} devices deleted successfully`
        );
      } else {
        console.error('API returned error:', result);
      }
    } catch (error) {
      console.error('Failed to delete selected devices:', error);
    }
  };

  // Handle bulk action with confirmation modal
  const handleBulkStatusChangeClick = (isEnable: boolean) => {
    if (selectedDevices.length === 0) return;

    const actionText = isEnable ? 'enable' : 'disable';
    const selectedCount = selectedDevices.length;

    openModal(
      <ConfirmModal
        title={`${isEnable ? 'Enable' : 'Disable'} Devices`}
        message={`Are you sure you want to ${actionText} ${selectedCount} selected device${selectedCount > 1 ? 's' : ''}?`}
        confirmText={isEnable ? 'Enable' : 'Disable'}
        cancelText="Cancel"
        confirmButtonColor={
          isEnable ? 'bg-accent-green hover:brightness-110' : 'bg-warning hover:brightness-110'
        }
        onConfirm={() => handleConfirmBulkStatusChange(isEnable)}
        onCancel={closeModal}
      />
    );
  };

  // Confirm and execute bulk status change
  const handleConfirmBulkStatusChange = async (isEnable: boolean) => {
    try {
      const endpoint = isEnable ? '/api/devices/bulk/enable' : '/api/devices/bulk/disable';

      const result = await post(endpoint, {
        device_ids: selectedDevices,
      });

      if (result?.success) {
        await refetch();
        setSelectedDevices([]);
        closeModal();
        console.log(`Devices ${isEnable ? 'enabled' : 'disabled'} successfully`);
      } else {
        console.error('API returned error:', result);
      }
    } catch (error) {
      console.error(`Failed to ${isEnable ? 'enable' : 'disable'} selected devices:`, error);
    }
  };

  // Updated handleBulkAction to use confirmation modal
  const handleBulkAction = async (actionValue: string) => {
    if (!selectedDevices?.length) return;

    if (actionValue === 'enable') {
      handleBulkStatusChangeClick(true);
    } else if (actionValue === 'disable') {
      handleBulkStatusChangeClick(false);
    } else if (actionValue === 'delete') {
      handleBulkDeleteClick();
    }
  };

  const DeviceStatus = ({ status, size = 'normal' }: { status?: string; size?: string }) => {
    const getStatusConfig = () => {
      switch (status?.toLowerCase()) {
        case 'active':
          return {
            color: 'bg-accent-green',
            text: 'Active',
            icon: <SignalWifiStatusbar4BarIcon sx={{ fontSize: 14 }} />,
          };
        case 'inactive':
          return {
            color: 'bg-ink-2',
            text: 'Inactive',
            icon: <SignalWifiOffIcon sx={{ fontSize: 14 }} />,
          };
        default:
          return {
            color: 'bg-ink-2',
            text: 'Unknown',
            icon: <SignalWifiOffIcon sx={{ fontSize: 14 }} />,
          };
      }
    };

    const config = getStatusConfig();
    const dotSize = size === 'small' ? 'h-2 w-2' : 'h-3 w-3';

    return (
      <div className="flex items-center gap-2">
        <div className={`${dotSize} rounded-full ${config.color}`}></div>
        <span className="capitalize text-sm font-medium text-ink-0">{config.text}</span>
      </div>
    );
  };

  const handleTabClick = (tabId: string) => {
    navigate(`/products/${productId}/${tabId}`, {
      state: { productName },
    });
  };

  // Tab navigation component
  const TabNavigation = () => {
    const tabs: { id: string; label: string; icon: React.ReactNode; count?: any }[] = [
      {
        id: 'configuration',
        label: 'Configuration',
        icon: <TuneIcon fontSize="small" />,
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: <DevicesIcon fontSize="small" />,
        count: paginationData.total,
      },
      {
        id: 'integration',
        label: 'Integration',
        icon: <IntegrationInstructionsIcon fontSize="small" />,
      },
      {
        id: 'history',
        label: 'History',
        icon: <HistoryIcon fontSize="small" />,
      },
    ];

    return (
      <div className="mb-5">
        <nav className="flex gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-1 py-0.5 px-2 rounded-full text-micro font-mono ${
                    activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-black/[0.06] text-ink-1'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    );
  };

  // Editable Cell Component
  const EditableCell = ({
    item,
    field,
    value,
    placeholder = '',
  }: {
    item: any;
    field: string;
    value?: any;
    placeholder?: string;
  }) => {
    const isEditing = editingCell?.rowId === item.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center  gap-2 -my-1 relative z-50 min-w-[350px]">
          <div className="flex-1 min-w-0">
            <GlobalInput
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              inputProps={{
                onKeyDown: e => {
                  if (e.key === 'Enter') handleSaveEdit(item);
                  if (e.key === 'Escape') handleCancelEdit();
                },
                autoFocus: true,
              }}
              disabled={isSaving}
              fullWidth={true}
              height="h-[36px]"
              textSize="text-sm"
              error={false}
            />
          </div>
          <button
            onClick={handleCancelEdit}
            disabled={isSaving}
            className="px-3 py-1.5  cursor-pointer text-xs font-medium text-ink-1 bg-white border border-line rounded-xl hover:bg-surface-3 focus:outline-none  disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSaveEdit(item)}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs cursor-pointer  font-semibold on-gradient brand-gradient-bg border border-transparent rounded-md hover:brightness-110 focus:outline-none  disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Save"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between group">
        <span className="text-xs text-ink-0">
          {value || <span className="text-ink-2 italic">{placeholder}</span>}
        </span>
        <button
          onClick={e => {
            e.stopPropagation();
            handleEditClick(item, field);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent-cyan/10 rounded"
          title="Edit"
        >
          <EditIcon className="w-3 h-3 cursor-pointer text-accent-cyan" />
        </button>
      </div>
    );
  };

  const handleViewPoints = (device: any) => {
    openModal(
      <DevicePointsModal
        deviceId={device.id}
        deviceName={device.name || device.device_unique_identifier}
      />
    );
  };

  const columns: DataTableColumn[] = [
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (value, item) => <DeviceStatus status={item.status || 'inactive'} />,
    },
    {
      key: 'device_unique_identifier',
      header: 'Dev EUI',
      accessor: 'device_unique_identifier',
      width: '220px',
      render: (value, item) => (
        <div className="py-1 font-mono">
          <EditableCell
            item={item}
            field="device_unique_identifier"
            value={value}
            placeholder="N/A"
          />
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Device Name',
      accessor: 'name',
      width: '220px',
      render: (value, item) => (
        <div className="py-1">
          <EditableCell item={item} field="name" value={value} placeholder="Unnamed Device" />
          {item.type && <div className="text-[10.5px] text-ink-2 mt-1">Type: {item.type}</div>}
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      accessor: 'location',
      width: '200px',
      render: (value, item) => (
        <div className="py-1">
          <EditableCell item={item} field="location" value={value} placeholder="Not Set" />
        </div>
      ),
    },
    {
      key: 'last_updated',
      header: 'Last Updated',
      width: '140px',
      render: (value, item) => {
        // The API returns this pre-formatted (e.g. "19 hours ago", or the
        // literal string "never") — it's a display string, not a timestamp
        // to parse. See api_contract/openapi/products.yaml's `last_updated`.
        if (!item.last_updated || item.last_updated === 'never') {
          return <span className="text-ink-2 italic text-xs">Never</span>;
        }

        return <span className="text-xs text-ink-0">{item.last_updated}</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Created At',
      width: '140px',
      render: (value, item) => {
        if (!item.created_at) {
          return <span className="text-ink-2 italic text-xs">Unknown</span>;
        }

        const date = new Date(item.created_at);

        return (
          <div className="text-xs font-mono">
            <div className="font-medium text-ink-0">{date.toLocaleDateString()}</div>
            <div className="text-[10.5px] text-ink-2">
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        );
      },
    },
    {
      key: 'points',
      header: 'Points',
      width: '90px',
      render: (value, item) => (
        <button
          onClick={() => handleViewPoints(item)}
          className="p-1.5 text-ink-2 hover:text-accent-cyan hover:bg-accent-cyan/10 rounded-md transition-colors"
          title="View Points"
        >
          <ListAltIcon style={{ fontSize: '16px' }} />
        </button>
      ),
    },
  ];

  // Packet history columns — device unique identifier | product | status | one column per attribute the
  // user configured for this product | actions (owner spec, 2026-09-22). Raw payload is no longer its
  // own column; it moves into the "View Details" accordion (renderExpandedRow below).
  const historyColumns: DataTableColumn[] = [
    {
      key: 'device_unique_identifier',
      header: 'Device Unique Identifier',
      width: '200px',
      render: (value, item) => {
        // device_ids per api_contract's packet-history schema is an array; a packet carries exactly one
        // device today (see backend_frontend_sync/communication/flows/02-packet-history-live-view.md
        // open question #2) — shown as a chip so a future multi-device packet degrades gracefully
        // (all ids visible, just wraps) instead of silently dropping any.
        const ids: string[] = Array.isArray(item.device_ids) ? item.device_ids : [];
        if (ids.length === 0) {
          return <span className="text-ink-2 italic text-xs">Unknown device</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map(id => (
              <span
                key={id}
                className="font-mono text-[11px] text-ink-0 bg-surface-2 border border-line-soft rounded px-1.5 py-0.5"
              >
                {id}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'product',
      header: 'Product',
      width: '160px',
      render: (value, item) => (
        <span className="text-xs font-medium text-ink-0">
          {item.product?.name || <span className="text-ink-2 italic">N/A</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (value, item) => (
        <span
          className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-1 rounded-full capitalize ${
            item.is_alert ? 'bg-danger/10 text-danger' : 'bg-accent-green/10 text-accent-green'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${item.is_alert ? 'bg-danger' : 'bg-accent-green'}`}
          />
          {item.is_alert ? 'Alert' : item.status || 'Normal'}
        </span>
      ),
    },
    // One column per attribute the user configured for this product (label from
    // "Configure Attribute" -> user_preference_attributes; value read from the packet's raw json_body
    // at that attribute's dot-path key — see the flow doc's open question #3 on that assumption).
    ...configuredAttributes.map((attr: any): DataTableColumn => ({
      key: `attr-${attr.attribute_key}`,
      header: attr.label || attr.attribute_key,
      width: '150px',
      render: (value, item) => {
        const raw = getAttributeValue(item.json_body, attr.attribute_key);
        if (raw === undefined || raw === null || raw === '') {
          return <span className="text-ink-2 italic text-xs">—</span>;
        }
        return (
          <span className="text-xs font-mono text-ink-0">
            {String(raw)}
            {attr.unit ? <span className="text-ink-2 ml-0.5">{attr.unit}</span> : null}
          </span>
        );
      },
    })),
    {
      key: 'actions',
      header: 'Actions',
      width: '140px',
      accessor: null,
      align: 'right',
      render: (value, item) => {
        const isOpen = expandedPacketIds.has(item.id);
        return (
          <button
            type="button"
            onClick={() => toggleExpandedPacket(item.id)}
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              isOpen
                ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10'
                : 'border-line-soft text-ink-1 hover:text-ink-0 hover:bg-surface-2'
            }`}
          >
            {isOpen ? 'Hide Details' : 'View Details'}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        );
      },
    },
  ];

  // Only show skeleton if we've never loaded data before
  const shouldShowSkeleton = isLoading && !hasLoadedOnce;

  // Show spinner in table when searching/paginating after initial load
  const isSearching = isLoading && hasLoadedOnce;

  const shouldShowHistorySkeleton = isHistoryLoading && !hasLoadedHistoryOnce;
  const isHistorySearching = isHistoryLoading && hasLoadedHistoryOnce;

  return (
    <div className="flex flex-col p-6 min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="page-title">Devices for {productName}</h1>
              <p className="text-xs text-ink-2 mt-0.5">
                Manage and monitor devices for this product
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation />

      {activeTab === 'configuration' && (
        <div className="bg-surface-1 rounded-md border border-line-soft">
          <ProductConfiguration id={productId} />
        </div>
      )}

      {/* Integration Tab */}
      {activeTab === 'integration' && (
        <div className="bg-surface-1 rounded-md  ">
          {activeTab === 'integration' && (
            <div className="bg-surface-1 rounded-md border p-4 border-line-soft ">
              <div className="">
                <ProtocolIntegration productID={productId} />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'devices' && (
        <>
          {shouldShowSkeleton ? (
            <TableSkeleton />
          ) : (
            <div className="bg-surface-1 rounded-md border overflow-hidden border-line-soft">
              <DataTable
                data={allDevices}
                columns={columns}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                pagination={true}
                serverSidePagination={true}
                currentPage={paginationData.current_page}
                totalPages={paginationData.last_page}
                totalItems={paginationData.total}
                rowsPerPage={rowsPerPage}
                onPageChange={handlePageChange}
                onRowsPerPageChange={handleRowsPerPageChange}
                serverSideSorting
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                rowsPerPageOptions={[10, 25, 50, 100]}
                selectable={true}
                onSelectionChange={handleSelectionChange}
                selectedItems={selectedDevices}
                onRowClick={() => {}}
                loading={isSearching}
                loadingText="Searching devices..."
                noDataText={
                  debouncedSearch
                    ? 'No devices found matching your search.'
                    : 'No devices found for this product.'
                }
                searchPlaceholder="Search by device name, Dev EUI, location..."
                addButtonText="Add Device"
                onAddClick={handleAddDevice}
                bulkActions={bulkActions}
                onBulkAction={handleBulkAction}
                className="border-0"
                headerClassName="bg-surface-2"
                rowClassName="hover:bg-surface-2 transition-colors"
              />
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {shouldShowHistorySkeleton ? (
            <TableSkeleton />
          ) : (
            <div className="bg-surface-1 rounded-md border overflow-hidden border-line-soft">
              {/* Filter bar: device picker + a quiet "live" indicator so it's clear new packets arrive
                  on their own, without implying anything more urgent than that. */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-line-soft bg-surface-2/50">
                <div className="flex items-center gap-2 text-[11px] font-medium text-accent-green">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
                  </span>
                  Live — new packets appear automatically
                </div>
                <div className="w-full sm:w-64">
                  <SelectRadix
                    id="history-device-filter"
                    value={historyDeviceFilter}
                    onValueChange={handleHistoryDeviceFilterChange}
                    placeholder="All devices"
                    options={[{ value: '', label: 'All devices' }, ...deviceFilterOptions]}
                    size="small"
                    searchable={deviceFilterOptions.length > 6}
                    className="w-full"
                  />
                </div>
              </div>

              <DataTable
                data={packetHistory}
                columns={historyColumns}
                searchTerm={historySearchTerm}
                onSearchChange={handleHistorySearchChange}
                pagination={true}
                serverSidePagination={true}
                currentPage={historyPaginationData.current_page}
                totalPages={historyPaginationData.last_page}
                totalItems={historyPaginationData.total}
                rowsPerPage={historyRowsPerPage}
                onPageChange={handleHistoryPageChange}
                onRowsPerPageChange={handleHistoryRowsPerPageChange}
                serverSideSorting
                sortBy={historySortBy}
                sortOrder={historySortOrder}
                onSort={handleHistorySort}
                rowsPerPageOptions={[10, 25, 50, 100]}
                selectable={false}
                onRowClick={() => {}}
                isRowExpanded={item => expandedPacketIds.has(item.id)}
                renderExpandedRow={item => (
                  <PacketPayloadViewer payload={item.json_body} receivedAt={item.received_at} />
                )}
                loading={isHistorySearching}
                loadingText="Loading packet history..."
                noDataText={
                  historyDebouncedSearch
                    ? 'No history found matching your search.'
                    : historyDeviceFilter
                      ? 'No packets from this device yet.'
                      : 'No packet history found for this product.'
                }
                searchPlaceholder="Search packet history..."
                className="border-0"
                headerClassName="bg-surface-2"
                rowClassName="hover:bg-surface-2 transition-colors"
                showAddButton={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
