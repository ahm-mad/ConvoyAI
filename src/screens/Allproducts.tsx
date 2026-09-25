/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

import { useModal } from '@contexts/ModalContext';
import AddDevices from '@forms/MultiStepForm/AddDevices';
import CreateProductFromPayload from '@components/CreateProductFromPayload';
import SaveAsTemplateModal from '@components/SaveAsTemplateModal';
import CreateTemplateModal from '@components/CreateTemplateModal';

import DataTable, { type DataTableColumn } from '@components/RadixTable';

import { useSimpleQuery } from '@hooks/useSimpleQuery';
import ManageProductSkeleton from '../skeletons/ManageProductSkeleton';

import { useNavigate } from '@lib/router-compat';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useUser } from '@contexts/UserContext';
import { Edit, Trash2, Mail, MessageSquare, Settings, Save } from 'lucide-react';
import ManageProductDemo from '../ConvoyDemo/ManageProductDemo';
import { isFirstDemo } from '@utils/DemoHelper';

export default function ManageProduct() {
  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();
  const navigate = useNavigate();
  const { user } = useUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [demoStart, setDemoStart] = useState(false);

  useEffect(() => {
    if (isFirstDemo('ManageProduct')) {
      setDemoStart(false);
    }
  }, []);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // FIXED: Track if this is the first ever data load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const {
    data: products,
    isLoading,
    refetch,
  } = useSimpleQuery(['products', currentPage, rowsPerPage, debouncedSearchTerm], `/api/products`, {
    // user_id: user?.id,
    page: currentPage,
    per_page: rowsPerPage,
    search: debouncedSearchTerm || undefined,
  });

  // FIXED: Mark as loaded once we have data for the first time
  useEffect(() => {
    if (products && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [products, hasLoadedOnce]);

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAddProduct = () => {
    openModal(
      <AddDevices
        isNewProduct={true}
        startTour={true}
        onSuccess={() => {
          console.log('New product added successfully');
          refetch();
          toast.success('Product added successfully');
          closeModal();
        }}
        onClose={() => {
          closeModal();
        }}
      />
    );
  };

  const handleCreateFromPayload = () => {
    openModal(
      <CreateProductFromPayload
        onSuccess={() => {
          refetch();
          toast.success('Product refined from payload successfully');
        }}
      />
    );
  };

  const handleConfigureMapping = (product: any) => {
    openModal(
      <CreateProductFromPayload
        initialProductId={product.id}
        onSuccess={() => {
          refetch();
          toast.success(`${product.name} configured successfully`);
        }}
      />
    );
  };

  const handleSaveAsTemplate = (product: any, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    openModal(
      <SaveAsTemplateModal
        product={product}
        onSuccess={() => {
          toast.success(`Template saved from ${product.name}`);
        }}
      />
    );
  };

  const handleCreateTemplate = () => {
    openModal(
      <CreateTemplateModal
        onSuccess={() => {
          toast.success('Template created');
        }}
      />
    );
  };

  const handleProductClick = (product: any) => {
    navigate(`/all-products/${product.id}/devices`, {
      state: { productName: product.name },
    });
  };

  const handleEditProduct = (product: any, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    console.log('Navigate to devices for product:', product);
    navigate(`/all-products/${product.id}/configuration`, {
      state: { productName: product.name },
    });
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSelectionChange = (selectedIds: any[]) => {
    setSelectedProducts(selectedIds);
  };

  const handleViewDevices = () => {
    navigate(`/products/${currentProduct.id}/devices`, {
      state: { productName: currentProduct.name },
    });
    handleClose();
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedProducts([]); // Clear selection on page change
  };

  // Handle rows per page change
  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1); // Reset to first page when changing rows per page
    setSelectedProducts([]); // Clear selection
  };

  const bulkActions = [
    {
      id: 'bulk-item',
      label: 'Delete Selected',
      value: 'delete',
    },
  ];

  const handleBulkAction = (actionValue: string) => {
    console.log('Bulk action:', actionValue, 'for products:', selectedProducts);
    setSelectedProducts([]);
  };

  const columns: DataTableColumn[] = [
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (value, item) => {
        // Was hardcoded green regardless of item — fixed to reflect real
        // state: a product with devices sending data but zero configured
        // field mappings silently never populates DeviceValue (every
        // packet gets filtered against these preferences in
        // storeCleanedPacket; zero mappings means zero output, with no
        // visible error anywhere). That's the gap this flags.
        const hasDevices = (item.devices_count || 0) > 0;
        const hasMappings = (item.attribute_preferences_count || 0) > 0;
        const needsConfig = hasDevices && !hasMappings;

        if (needsConfig) {
          return (
            <div className="flex items-center justify-center">
              <button
                onClick={e => {
                  e.stopPropagation();
                  handleConfigureMapping(item);
                }}
                title="0 fields mapped — click to configure"
                className="h-2 w-2 rounded-full bg-warning shadow-[0_0_4px_var(--color-warning)] cursor-pointer"
              />
            </div>
          );
        }

        return (
          <div className="flex items-center justify-center">
            <div
              title={hasDevices ? 'Fields mapped' : 'No devices yet'}
              className={`h-2 w-2 rounded-full ${
                hasDevices
                  ? 'bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]'
                  : 'bg-ink-2'
              }`}
            ></div>
          </div>
        );
      },
      align: 'center',
    },
    {
      key: 'name',
      header: 'Product Name',
      accessor: 'name',
      width: '200px',
      render: (value, item) => (
        <div className="flex items-center">
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: 'id',
      header: 'Product ID',
      accessor: 'id',
      width: '120px',
      render: value => <span className="font-mono text-xs text-ink-1">{value}</span>,
    },
    {
      key: 'created_at',
      header: 'Created Date',
      accessor: 'created_at',
      width: '150px',
      render: value => {
        if (!value) return '-';
        const date = new Date(value);
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
      key: 'devices_count',
      header: 'Devices',
      accessor: 'devices_count',
      width: '100px',
      render: (value, item) => (
        <span
          className="px-2 py-0.5 bg-accent-cyan/10 text-accent-cyan rounded text-xs font-mono cursor-pointer hover:bg-accent-cyan/20 transition-colors"
          onClick={e => {
            e.stopPropagation();
            navigate(`/products/${item.id}/devices`, {
              state: { productName: item.name },
            });
          }}
          title="Click to view devices"
        >
          {item.devices_count || 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '120px',
      align: 'center',
      render: (value, item) => (
        <div className="flex justify-center gap-1">
          <button
            id="edit-prd"
            onClick={event => handleEditProduct(item, event)}
            className="p-1.5 text-ink-2 hover:text-accent-cyan hover:bg-accent-cyan/10 rounded-md transition-colors"
            title="Edit Product"
          >
            <Edit className="w-4 h-4 cursor-pointer" />
          </button>
          <button
            onClick={event => handleSaveAsTemplate(item, event)}
            disabled={!item.attribute_preferences_count}
            className={`p-1.5 rounded-md transition-colors ${
              item.attribute_preferences_count
                ? 'text-ink-2 hover:text-accent-green hover:bg-accent-green/10 cursor-pointer'
                : 'text-ink-2/30 cursor-not-allowed'
            }`}
            title={
              item.attribute_preferences_count
                ? 'Save as Template'
                : 'Configure at least one field first'
            }
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // useEffect(() => {
  //   // if (!user?.company_info) {
  //   //   // const toastId = 'company-info-warning';
  //   //   // toast.dismiss(toastId);
  //   //   // toast.error("Please complete your company information. You'll be redirected shortly.", {
  //   //   //   id: toastId,
  //   //   // });

  //   //   const timer = setTimeout(() => {
  //   //     navigate('/account-setting');
  //   //   }, 3000);

  //     return () => clearTimeout(timer);
  //   }
  // }, [user, navigate]);

  // FIXED: Only show skeleton if we've never loaded data before
  const shouldShowSkeleton = isLoading && !hasLoadedOnce;

  // FIXED: Show spinner in table when searching/paginating after initial load
  const isSearching = isLoading && hasLoadedOnce;

  // If first load is still happening, show skeleton
  if (shouldShowSkeleton) return <ManageProductSkeleton />;

  const tableData: any[] = products?.data?.data || [];
  const paginationData: any = products?.data || {};

  return (
    <div className="flex flex-col p-5">
      {/* Company Name Header */}
      {demoStart && <ManageProductDemo />}
      <div className="text-ink-0 mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold font-display">{t('companyName')}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateTemplate}
            className="text-xs font-medium text-ink-1 border border-line rounded-full px-3 py-1.5 hover:bg-surface-2 transition-colors"
          >
            + New Template
          </button>
          <button
            onClick={handleCreateFromPayload}
            className="text-xs font-medium btn-brand border border-transparent rounded-full px-3 py-1.5 hover:bg-surface-2 transition-colors"
          >
            + Create from Payload
          </button>
        </div>
      </div>

      <div>
        <DataTable
          data={tableData}
          columns={columns}
          searchTerm={searchTerm}
          searchItemId="search-prd"
          onSearchChange={handleSearchChange}
          // Server-side pagination props
          pagination={true}
          serverSidePagination={true}
          currentPage={paginationData.current_page || 1}
          totalPages={paginationData.last_page || 1}
          totalItems={paginationData.total || 0}
          rowsPerPage={rowsPerPage}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 25, 50, 100]}
          selectable={true}
          selectedItems={selectedProducts}
          onSelectionChange={handleSelectionChange}
          onRowClick={handleProductClick}
          loading={isSearching}
          loadingText="Searching products..."
          noDataText={
            debouncedSearchTerm ? 'No products found matching your search.' : 'No products found.'
          }
          searchPlaceholder="Search products..."
          addButtonText={t('addProduct')}
          onAddClick={handleAddProduct}
          bulkActions={bulkActions}
          onBulkAction={handleBulkAction}
          addButtonId="add-new-prd"
          className="border-0"
          headerClassName="bg-surface-2"
          rowClassName="hover:bg-surface-2 transition-colors"
          bulkActionId="bulk-id"
          checkAllId="check-all-id"
          CheckOneID="check-one-id"
        />
      </div>
    </div>
  );
}
