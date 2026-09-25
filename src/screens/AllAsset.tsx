/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect } from 'react';
import { useParams } from '@lib/router-compat';
import { Edit, Trash2 } from 'lucide-react';

import DataTable, { type DataTableColumn } from '@components/RadixTable';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import TableSkeleton from '@components/TableSkeleton';

const AssetsTable = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch assets tree data
  const {
    data: assetsResponse,
    isLoading: assetsLoading,
    isError: assetsError,
    refetch,
  } = useSimpleQuery(
    ['assets-tree', companyId, currentPage, rowsPerPage, debouncedSearchTerm],
    companyId ? `/api/assets/${companyId}/tree` : null,
    {
      page: currentPage,
      per_page: rowsPerPage,
      search: debouncedSearchTerm || undefined,
    },
    {
      enabled: !!companyId,
    }
  );

  // Mark as loaded once we have data
  useEffect(() => {
    if (assetsResponse && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [assetsResponse, hasLoadedOnce]);

  console.log(assetsResponse, 'assets tree data');

  // Extract the correct data structure from API response
  const apiData: any = assetsResponse?.data || assetsResponse || {};

  // Transform assets array to table format
  const assetsData = useMemo<any[]>(() => {
    const assets = apiData.assets || [];

    return assets.map((asset: any) => ({
      id: asset.asset_id,
      assetName: asset.asset_name,
      assetType: asset.asset_type,
      numChildren: asset.total_children,
      numLayers: asset.total_layers,
      numDevices: asset.total_devices_assigned,
    }));
  }, [apiData]);

  // Extract pagination data
  const paginationData = apiData.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    last_page: 1,
  };

  const shouldShowSkeleton = assetsLoading && !hasLoadedOnce;
  const isSearching = assetsLoading && hasLoadedOnce;

  // Filter and sort data
  const processedData = useMemo<any[]>(() => {
    let filtered = [...assetsData];

    if (debouncedSearchTerm) {
      filtered = filtered.filter((item: any) =>
        Object.values(item).some((value: any) =>
          String(value).toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        )
      );
    }

    if (sortBy) {
      filtered.sort((a: any, b: any) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
      });
    }

    return filtered;
  }, [assetsData, debouncedSearchTerm, sortBy, sortOrder]);

  // Handlers
  const handleEditAsset = (assetId: any, assetName: any) => {
    console.log(`Edit asset: ${assetName} (ID: ${assetId})`);
  };

  const handleDeleteAsset = (assetId: any, assetName: any) => {
    if (window.confirm(`Are you sure you want to delete "${assetName}"?`)) {
      console.log(`Delete asset with ID: ${assetId}`);
    }
  };

  const handleSort = (columnKey: string, direction: string) => {
    setSortBy(columnKey);
    setSortOrder(direction);
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action} on ${selectedItems.length} items`);
  };

  const handleAddClick = () => {
    console.log('Add new asset clicked!');
  };

  const handleRowClick = (asset: any) => {
    console.log('Clicked asset:', asset);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedItems([]);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    setSelectedItems([]);
  };

  // Column definitions
  const columns: DataTableColumn[] = [
    {
      key: 'assetName',
      header: 'Asset Name',
      accessor: 'assetName',
      minWidth: '220px',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink-0 text-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'assetType',
      header: 'Asset Type',
      accessor: 'assetType',
      minWidth: '150px',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="text-ink-1 text-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'numChildren',
      header: 'Number of Children',
      accessor: 'numChildren',
      minWidth: '150px',
      align: 'center',
      render: value => (
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold text-ink-0 font-mono text-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'numLayers',
      header: 'Number of Layers',
      accessor: 'numLayers',
      minWidth: '140px',
      align: 'center',
      render: value => (
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold text-ink-0 font-mono text-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'numDevices',
      header: 'Number of Devices Assigned',
      accessor: 'numDevices',
      minWidth: '200px',
      align: 'center',
      render: value => (
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold text-accent-cyan font-mono text-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'edit',
      header: '',
      accessor: null,
      align: 'center',
      minWidth: '60px',
      render: (value, asset) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleEditAsset(asset.id, asset.assetName);
          }}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors"
          title="Edit Asset"
        >
          <Edit className="w-3.5 h-3.5 cursor-pointer text-ink-2 hover:text-accent-cyan" />
        </button>
      ),
    },
    {
      key: 'delete',
      header: '',
      accessor: null,
      align: 'center',
      minWidth: '60px',
      render: (value, asset) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleDeleteAsset(asset.id, asset.assetName);
          }}
          className="p-1.5 hover:bg-danger/10 rounded-md transition-colors"
          title="Delete Asset"
        >
          <Trash2 className="w-3.5 cursor-pointer h-3.5 text-danger hover:brightness-125" />
        </button>
      ),
    },
  ];

  const bulkActions = [
    { id: 1, value: 'delete', label: 'Delete Selected' },
    { id: 2, value: 'export', label: 'Export Selected' },
    { id: 3, value: 'assign', label: 'Assign Devices' },
  ];

  if (!companyId) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-danger/10 border border-danger/25 rounded-md p-4">
            <p className="text-danger text-sm">
              No company ID found. Please select a company first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-[13px] font-semibold text-ink-0 mb-1 font-display">
            Assets management
          </h1>
          <p className="text-xs text-ink-2">
            Manage and view all assets with their hierarchy and device assignments
          </p>
        </div>

        {shouldShowSkeleton ? (
          <TableSkeleton />
        ) : (
          <div className="glass-strong  overflow-hidden">
            <DataTable
              data={processedData}
              columns={columns}
              searchTerm={searchTerm}
              onSearchChange={e => setSearchTerm(e.target?.value ?? '')}
              pagination={true}
              serverSidePagination={true}
              currentPage={paginationData.page || 1}
              totalPages={paginationData.last_page || 1}
              totalItems={paginationData.total || 0}
              rowsPerPage={rowsPerPage}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              selectable={true}
              selectedItems={selectedItems}
              onSelectionChange={setSelectedItems}
              onRowClick={handleRowClick}
              loading={isSearching}
              loadingText="Searching assets..."
              noDataText={
                debouncedSearchTerm
                  ? 'No assets found matching your search.'
                  : 'No assets available.'
              }
              showSearch={true}
              showAddButton={false}
              addButtonText="Add Asset"
              onAddClick={handleAddClick}
              searchPlaceholder="Search assets..."
              bulkActions={bulkActions}
              onBulkAction={handleBulkAction}
            />
          </div>
        )}

        {assetsError && (
          <div className="mt-4 bg-danger/10 border border-danger/25 rounded-md p-4">
            <p className="text-danger text-sm">Failed to load assets data. Please try again.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetsTable;
