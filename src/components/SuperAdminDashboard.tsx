// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useMemo, useEffect } from 'react';
import { Search, ChevronDown, Star, MapPin, Users } from 'lucide-react';
// import companiesIcon from '../assets/images/companies.webp';
// import ProductsIcon from '../assets/images/products.webp';
// import devicesIcon from '../assets/images/internet-of-things.webp';
import ContactNotificationSlides from './ContactNotificationSlides';
import SelectRadix from './Select';
import DataTable from './RadixTable';
import LineChart from './LineChart';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';
import { useModal } from '@contexts/ModalContext';
import ConfirmModal from '../components/ConfirmActivationModal';
import TableSkeleton from '@components/TableSkeleton';
import { post } from '../utils/apiHelper';
import { toast } from 'react-hot-toast';

// Skeleton Components
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-surface-3 rounded ${className}`}></div>
);

const StatCardSkeleton = () => (
  <div className="bg-surface-1 border border-line-soft rounded-md p-4 sm:p-6">
    <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-md mb-3 sm:mb-4" />
    <Skeleton className="h-8 sm:h-10 w-20 mb-2" />
    <Skeleton className="h-4 w-16" />
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-surface-1 border h-96 border-line-soft rounded-md p-4">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-8 w-32 rounded-md" />
    </div>
    <div className="border animate-pulse border-line-soft"></div>
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-48">
        {[...Array(12)].map((_, j) => (
          <Skeleton key={j} className="flex-1" style={{ height: `${Math.random() * 60 + 40}%` }} />
        ))}
      </div>
    </div>
  </div>
);

const NotificationCardSkeleton = () => (
  <div className="p-3">
    <div className="flex items-start gap-4">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0 mt-1" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
    </div>
  </div>
);

const NotificationsSkeleton = () => (
  <div className="border border-line-soft rounded-md overflow-hidden">
    <div className="h-[440px]">
      <div className="bg-surface-1 flex items-center gap-4 rounded-t-sm p-5 border-b border-line-soft">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="bg-surface-1 divide-y divide-line-soft">
        {[...Array(4)].map((_, i) => (
          <NotificationCardSkeleton key={i} />
        ))}
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useUser();
  const { openModal, closeModal } = useModal();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [selectedItems, setSelectedItems] = useState([]);
  const [timePeriod, setTimePeriod] = useState('1m');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Track if this is the first ever data load for companies table
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useSimpleQuery(['stats-count-all'], '/api/stats/count-all', {});

  const {
    data: monthlyRegistrations,
    isLoading: monthlyLoading,
    isError: monthlyError,
  } = useSimpleQuery(
    ['users-monthly-registrations', timePeriod],
    '/api/users/monthly-registrations',
    {
      range: timePeriod,
    }
  );

  const {
    data: companiesData,
    isLoading: companiesLoading,
    isError: companiesError,
    refetch: refetchCompanies,
  } = useSimpleQuery(
    ['companies-dashboard', user?.id, currentPage, rowsPerPage, debouncedSearchTerm],
    `/api/companies`,
    {
      user_id: user?.id,
      page: currentPage,
      per_page: rowsPerPage,
      search: debouncedSearchTerm || undefined,
    }
  );

  // Mark as loaded once we have data for the first time
  useEffect(() => {
    if (companiesData && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [companiesData, hasLoadedOnce]);

  console.log(stats, '90485904');
  console.log(companiesData, 'companies data');

  const statCards = [
    // { icon: ProductsIcon, value: stats?.data?.companies, label: 'Companies', color: 'bg-accent-cyan' },
    { icon: 'users', value: stats?.data?.users, label: 'Users', color: 'bg-accent-green' },
    // { icon: companiesIcon, value: stats?.data?.products, label: 'Products', color: 'bg-warning' },
    // { icon: devicesIcon, value: stats?.data?.device, label: 'Devices', color: 'bg-surface-3' },
  ];

  const ChartData = {
    categories: monthlyRegistrations?.data?.map(item => item.month) || [],
    series: [
      {
        name: 'Users',
        data: monthlyRegistrations?.data?.map(item => item.total) || [],
      },
    ],
  };

  const timeOptions = [
    { value: '1w', label: '1 week' },
    { value: '1m', label: '1 month' },
    { value: '3m', label: '3 months' },
    { value: '6m', label: '6 months' },
    { value: '1y', label: '1 year' },
  ];

  const companies = companiesData?.data?.data || [];
  const paginationData = companiesData?.data || {};

  // Only show skeleton/loading if we've never loaded data before
  const shouldShowSkeleton = companiesLoading && !hasLoadedOnce;

  // Show spinner in table when searching/paginating after initial load
  const isSearching = companiesLoading && hasLoadedOnce;

  const bulkActions = [
    {
      id: 'bulk-delete-companies',
      label: 'Delete Selected',
      value: 'delete',
    },
  ];

  const handleBulkDeleteClick = () => {
    if (selectedItems.length === 0) return;

    const selectedCount = selectedItems.length;

    openModal(
      <ConfirmModal
        title="Delete Companies"
        message={`Are you sure you want to delete ${selectedCount} selected compan${selectedCount > 1 ? 'ies' : 'y'}? This action cannot be undone and will also delete all associated users, products, and devices.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonColor="bg-danger hover:brightness-110"
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmBulkDelete = async () => {
    try {
      const result = await post('/api/companies/bulk/destroy', {
        company_ids: selectedItems,
      });

      if (result?.success) {
        await refetchCompanies();
        setSelectedItems([]);
        closeModal();
        console.log(
          `${result.data?.deleted_count || selectedItems.length} companies deleted successfully`
        );
      } else {
        console.error('API returned error:', result);
      }
    } catch (error) {
      console.error('Failed to delete selected companies:', error);
    }
  };

  const handleBulkAction = actionValue => {
    if (!selectedItems?.length) return;

    if (actionValue === 'delete') {
      handleBulkDeleteClick();
    }
  };

  const renderMembers = count => (
    <div className="flex -space-x-2">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="w-6 h-6 bg-surface-3 rounded-full border-2 border-surface-1"></div>
      ))}
    </div>
  );

  const columns = [
    {
      key: 'name',
      header: 'Company Name',
      accessor: 'name',
      render: (value, item) => (
        <div>
          <p className="font-medium text-ink-0">{value}</p>
          <p className="text-xs text-ink-2 font-mono">{item.email}</p>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      accessor: 'country',
      render: value => (
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-ink-2" />
          <span className="text-ink-0 font-medium">{value || 'N/A'}</span>
        </div>
      ),
    },
    {
      key: 'users_count',
      header: 'Users',
      accessor: 'users_count',
      render: value => (
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-accent-cyan" />
          <span className="text-ink-0 font-mono font-semibold">{value || 0}</span>
        </div>
      ),
    },
    {
      key: 'products_count',
      header: 'Products',
      accessor: 'products_count',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="text-ink-0 font-mono font-semibold">{value || 0}</span>
        </div>
      ),
    },
    {
      key: 'devices_count',
      header: 'Devices',
      accessor: 'devices_count',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="text-ink-0 font-mono font-semibold">{value || 0}</span>
        </div>
      ),
    },
    {
      key: 'assets_count',
      header: 'Assets',
      accessor: 'assets_count',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="text-ink-0 font-mono font-semibold">{value || 0}</span>
        </div>
      ),
    },
  ];

  if (statsError || monthlyError) {
    return <p className="text-danger text-center mt-10 text-sm">Failed to load data</p>;
  }

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <div className="border-b border-line-soft px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-ink-0 font-display">
              Dashboard
            </h1>
            <p className="text-ink-2 text-xs sm:text-sm mt-1">
              Central Hub for Personal Customization
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
        <div className="grid xl:grid-cols-5 gap-6 sm:gap-8">
          {/* Stat Cards - Individual Loading */}
          <div className="xl:col-span-2 grid gap-4 sm:gap-6 grid-cols-2">
            {statsLoading ? (
              <>
                {[...Array(4)].map((_, idx) => (
                  <StatCardSkeleton key={idx} />
                ))}
              </>
            ) : (
              statCards.map((stat, idx) => (
                <div
                  key={idx}
                  className="bg-surface-1 border border-line-soft rounded-md p-4 sm:p-6 hover:border-line transition-colors"
                >
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 ${stat.color} rounded-md flex items-center justify-center on-gradient text-xl mb-3 sm:mb-4`}
                  >
                    {stat.icon === 'users' ? (
                      <Users size={20} className="sm:w-6 sm:h-6" />
                    ) : (
                      <img
                        src={stat.icon}
                        alt={stat.label}
                        className="w-6 h-6 sm:w-8 sm:h-8 brightness-0 invert"
                      />
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-semibold text-ink-0 mb-1">
                    {stat.value}
                  </div>
                  <p className="text-ink-2 text-xs sm:text-sm">{stat.label}</p>
                </div>
              ))
            )}
          </div>

          {/* Earnings Chart - Individual Loading */}
          <div className="xl:col-span-3">
            {monthlyLoading ? (
              <ChartSkeleton />
            ) : (
              <div className="bg-surface-1 border border-line-soft rounded-md overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2 mt-2 px-4">
                  <h2 className="text-sm sm:text-base font-semibold text-ink-0">
                    User Acquisition Insights
                  </h2>
                  <div className="w-full sm:w-32">
                    <SelectRadix
                      value={timePeriod}
                      onValueChange={setTimePeriod}
                      options={timeOptions}
                      size="xs"
                      fullWidth={false}
                    />
                  </div>
                </div>
                <div className="border-t border-line-soft"></div>
                <div className="w-[89%]">
                  <LineChart categories={ChartData.categories} series={ChartData.series} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="max-lg:col-span-3">
            <ContactNotificationSlides NotificationsSkeleton={NotificationsSkeleton} />
          </div>

          <div className="max-lg:col-span-3 col-span-2 h-fit">
            {shouldShowSkeleton ? (
              <TableSkeleton />
            ) : (
              <div className="bg-surface-1 border border-line-soft overflow-hidden rounded-md">
                <DataTable
                  data={companies}
                  columns={columns}
                  searchTerm={searchTerm}
                  onSearchChange={e => setSearchTerm(e.target?.value ?? '')}
                  pagination={true}
                  serverSidePagination={true}
                  currentPage={paginationData.current_page || 1}
                  totalPages={paginationData.last_page || 1}
                  totalItems={paginationData.total || 0}
                  rowsPerPage={rowsPerPage}
                  onPageChange={setCurrentPage}
                  onRowsPerPageChange={newRowsPerPage => {
                    setRowsPerPage(newRowsPerPage);
                    setCurrentPage(1);
                  }}
                  rowsPerPageOptions={[5, 10, 15]}
                  selectable={true}
                  selectedItems={selectedItems}
                  onSelectionChange={setSelectedItems}
                  showSearch={true}
                  showAddButton={false}
                  loading={isSearching}
                  loadingText="Loading companies..."
                  noDataText={
                    debouncedSearchTerm
                      ? 'No companies found matching your search.'
                      : 'No companies available.'
                  }
                  searchPlaceholder="Search companies..."
                  bulkActions={bulkActions}
                  onBulkAction={handleBulkAction}
                  bulkActionId="company-bulk-action"
                  checkAllId="company-check-all"
                  CheckOneID="company-check-one"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
