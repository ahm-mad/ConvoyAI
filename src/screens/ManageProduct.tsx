/* eslint-disable @typescript-eslint/no-explicit-any */
import DeviceSummary from '@components/devices/DeviceSummary';
import { useEffect, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

import { useModal } from '@contexts/ModalContext';
import AddDevices from '@forms/MultiStepForm/AddDevices';
import AddProductModal from '../components/AddProductModal';

import DataTable, { type DataTableColumn } from '@components/RadixTable';

import { useSimpleQuery } from '@hooks/useSimpleQuery';
import ManageProductSkeleton from '../skeletons/ManageProductSkeleton';

import { useNavigate } from '@lib/router-compat';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useUser } from '@contexts/UserContext';
import { Edit, Trash2, Mail, MessageSquare, Settings } from 'lucide-react';
import ManageProductDemo from '../ConvoyDemo/ManageProductDemo';
import { isFirstDemo } from '@utils/DemoHelper';
import { post } from '../utils/apiHelper';
import ConfirmModal from '../components/ConfirmActivationModal';

interface ManageProductProps {
  passedUserId?: string | number;
}

export default function ManageProduct({ passedUserId }: ManageProductProps) {
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

  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const userId = passedUserId || user?.id;
  const isDemoUser = Boolean(user?.isDemo);

  const {
    data: products,
    isLoading,
    refetch,
  } = useSimpleQuery(
    ['products', user?.id, currentPage, rowsPerPage, debouncedSearchTerm, sortBy, sortOrder],

    `/api/products`,
    {
      user_id: userId,
      page: currentPage,
      per_page: rowsPerPage,
      sort_by: sortBy,
      sort_order: sortOrder,
      search: debouncedSearchTerm || undefined,
    }
  );

  // Mark as loaded once we have data for the first time
  useEffect(() => {
    if (products && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [products, hasLoadedOnce]);

  // Make sure demo users never carry a stale selection (e.g. if `user`
  // becomes available/changes after mount without a full remount).
  useEffect(() => {
    if (isDemoUser && selectedProducts.length > 0) {
      setSelectedProducts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoUser]);

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
          // toast.success('Product added successfully');
          closeModal();
        }}
        onClose={() => {
          closeModal();
        }}
      />
    );
  };

  // Demo-only "Add Product" modal — shown to demo users when they click "Add Product"
  const handleShowDemoAddProduct = () => {
    openModal(
      <AddProductModal
        onClose={() => {
          closeModal();
        }}
        onComplete={({ products: addedProducts }: any) => {
          console.log('Demo products selected:', addedProducts);
          refetch();
          closeModal();
        }}
      />
    );
  };

  const handleProductClick = (product: any) => {
    navigate(`/products/${product.id}/devices`, {
      state: { productName: product.name },
    });
  };

  const handleEditProduct = (product: any, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    console.log('Navigate to devices for product:', product);
    navigate(`/products/${product.id}/configuration`, {
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

  const handleSort = (columnKey: string, direction: string) => {
    setSortBy(columnKey);
    setSortOrder(direction);
    setCurrentPage(1);
  };

  const bulkActions = [
    {
      id: 'bulk-item',
      label: 'Delete Selected',
      value: 'delete',
    },
  ];

  // Handle bulk delete with confirmation modal
  const handleBulkDeleteClick = () => {
    if (isDemoUser) return;
    if (selectedProducts.length === 0) return;

    const selectedCount = selectedProducts.length;

    openModal(
      <ConfirmModal
        title="Delete Products"
        message={`Are you sure you want to delete ${selectedCount} selected product${selectedCount > 1 ? 's' : ''}? This action cannot be undone and will also delete all associated devices.`}
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
    if (isDemoUser) return;

    try {
      const result = await post('/api/products/bulk/destroy', {
        product_ids: selectedProducts,
      });

      if (result?.success) {
        await refetch();
        setSelectedProducts([]);
        closeModal();
        // toast.success(`${result.data?.deleted_count || selectedProducts.length} product(s) deleted successfully`);
        console.log(
          `${result.data?.deleted_count || selectedProducts.length} products deleted successfully`
        );
      } else {
        console.error('API returned error:', result);
        // toast.error('Failed to delete products. Please try again.');
      }
    } catch (error) {
      console.error('Failed to delete selected products:', error);
      // toast.error('An error occurred while deleting products.');
    }
  };

  // Updated handleBulkAction to use confirmation modal
  const handleBulkAction = (actionValue: string) => {
    if (isDemoUser) return;
    if (!selectedProducts?.length) return;

    if (actionValue === 'delete') {
      handleBulkDeleteClick();
    }
  };

  const columns: DataTableColumn[] = [
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (value, item) => (
        <div className="flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_4px_var(--color-accent-green)]"></div>
        </div>
      ),
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
        <div className="flex justify-center">
          <button
            id="edit-prd"
            onClick={event => handleEditProduct(item, event)}
            className="p-1.5 text-ink-2 hover:text-accent-cyan hover:bg-accent-cyan/10 rounded-md transition-colors"
            title="Edit Product"
          >
            <Edit className="w-4 h-4 cursor-pointer" />
          </button>
        </div>
      ),
    },
  ];

  useEffect(() => {
    if (!user?.company_info) {
      console.log(user?.company_info, 'testingg');
      const toastId = 'company-info-warning';
      toast.dismiss(toastId);
      // toast.error("Please complete your company information. You'll be redirected shortly.", {
      //   id: toastId,
      // });

      const timer = setTimeout(() => {
        // navigate('/account-setting');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  // Only show skeleton if we've never loaded data before
  const shouldShowSkeleton = isLoading && !hasLoadedOnce;

  // Show spinner in table when searching/paginating after initial load
  const isSearching = isLoading && hasLoadedOnce;

  // If first load is still happening, show skeleton
  if (shouldShowSkeleton) return <ManageProductSkeleton />;

  const tableData: any[] = products?.data?.data || [];
  const paginationData: any = products?.data || {};

  return (
    <div className="flex flex-col p-5">
      {/* Company Name Header */}
      {demoStart && <ManageProductDemo />}
      <div className="text-ink-0 mb-5 mt-2">
        <div className="eyebrow">{t('companyName')}</div>
        <h1 className="page-title mt-1">Products &amp; devices</h1>
      </div>

      <DeviceSummary products={paginationData.total} />

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
          serverSideSorting
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          // Hide the selection checkbox column entirely for demo users
          selectable={!isDemoUser}
          selectedItems={selectedProducts}
          onSelectionChange={handleSelectionChange}
          onRowClick={() => {}}
          loading={isSearching}
          loadingText="Searching products..."
          noDataText={
            debouncedSearchTerm ? 'No products found matching your search.' : 'No products found.'
          }
          searchPlaceholder="Search products..."
          addButtonText={t('addProduct')}
          onAddClick={isDemoUser ? handleShowDemoAddProduct : handleAddProduct}
          // No bulk actions to offer when there's nothing to select
          bulkActions={isDemoUser ? undefined : bulkActions}
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
