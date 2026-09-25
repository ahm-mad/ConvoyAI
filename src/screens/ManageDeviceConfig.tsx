/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { useToast } from '@contexts/ToastContext';
import ProductConfiguration from './ProductConfiguration';
import TableSkeleton from '@components/TableSkeleton';

import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import DevicesIcon from '@mui/icons-material/Devices';
import TuneIcon from '@mui/icons-material/Tune';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ProtocolIntegration from './ProtocolIntegration';

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
  // Server-side state management only
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

  const productName = location.state?.productName || `Product ${productId}`;

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryParams = React.useMemo(() => {
    const params: Record<string, any> = {
      user_id: user?.id,
      page: currentPage,
      per_page: rowsPerPage,
    };

    if (debouncedSearch) {
      params.search = debouncedSearch;
    }

    return params;
  }, [user?.id, currentPage, rowsPerPage, debouncedSearch]);

  const {
    data: devicesData,
    isLoading,
    refetch,
  } = useSimpleQuery(
    `product-${productId}-devices-page-${currentPage}-${rowsPerPage}-${debouncedSearch}`,
    `/api/products/${productId}`,
    queryParams
  );

  useEffect(() => {
    if (devicesData && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [devicesData, hasLoadedOnce]);

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setSelectedDevices([]);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    setSelectedDevices([]);
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
    navigate(`/all-products/${productId}/${tabId}`, {
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
    ];

    return (
      <div className="border-b border-line mb-4">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`py-2.5 px-0.5 border-b-2 font-medium cursor-pointer text-xs flex items-center gap-1.5 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-cyan text-ink-0'
                  : 'border-transparent text-ink-2 hover:text-ink-1 hover:border-line'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-1 py-0.5 px-1.5 rounded text-[10px] font-mono ${
                    activeTab === tab.id
                      ? 'bg-accent-cyan/10 text-accent-cyan'
                      : 'bg-surface-2 text-ink-2'
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
        <div className="flex items-center gap-3 py-1 relative z-50">
          <input
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveEdit(item);
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="flex-1 px-3 py-2 border border-accent-cyan rounded-md focus:outline-none focus:ring-2 focus:ring-accent-cyan/30 text-sm bg-surface-2 text-ink-0"
            autoFocus
            disabled={isSaving}
          />
          <button
            onClick={handleCancelEdit}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium text-ink-1 bg-white border border-line rounded-xl hover:bg-surface-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed z-50"
            title="Cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSaveEdit(item)}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold on-gradient brand-gradient-bg border border-transparent rounded-md hover:brightness-110 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed z-50"
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
          <EditIcon className="w-4 h-4 cursor-pointer text-accent-cyan" />
        </button>
      </div>
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
      key: 'tags',
      header: 'Tags',
      accessor: 'tags',
      width: '180px',
      render: (value, item) => (
        <div className="py-1">
          <EditableCell item={item} field="tags" value={value} placeholder="No tags" />
        </div>
      ),
    },
    {
      key: 'last_updated',
      header: 'Last Updated',
      width: '140px',
      render: (value, item) => {
        if (!item.last_updated || item.last_updated === 'never') {
          return <span className="text-ink-2 italic text-xs">Never</span>;
        }

        const date = new Date(item.last_updated);

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
  ];

  // Only show skeleton if we've never loaded data before
  const shouldShowSkeleton = isLoading && !hasLoadedOnce;

  // Show spinner in table when searching/paginating after initial load
  const isSearching = isLoading && hasLoadedOnce;

  return (
    <div className="flex flex-col p-6 min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-[13px] font-semibold text-ink-0 font-display">
                Devices for {productName}
              </h1>
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
    </div>
  );
}
