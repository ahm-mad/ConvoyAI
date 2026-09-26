/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from '@lib/router-compat';
import { MapPin, Hash, Trash2, Edit, Users, Package } from 'lucide-react';

import DataTable, { type DataTableColumn } from '@components/RadixTable';
import ConfirmDelete from '@components/ConfirmDelete';
import AddCompanyForm from '../components/AddCompanyForm';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUser } from '@contexts/UserContext';
import { useModal } from '@contexts/ModalContext';
import { del, post } from '../utils/apiHelper';
import TableSkeleton from '@components/TableSkeleton';

const CompaniesListView = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { openModal, closeModal } = useModal();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch companies list
  const {
    data: companies,
    isLoading,
    refetch,
  } = useSimpleQuery(
    ['companies-list', user?.id, currentPage, rowsPerPage, debouncedSearchTerm],
    '/api/companies',
    {
      user_id: user?.id,
      page: currentPage,
      per_page: rowsPerPage,
      search: debouncedSearchTerm || undefined,
    }
  );
  console.log('sss---a', currentPage, rowsPerPage, debouncedSearchTerm);
  // Mark as loaded once
  useEffect(() => {
    if (companies && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [companies, hasLoadedOnce]);

  // Navigation handlers
  const handleEditCompany = (companyId: any, companyName: any) => {
    navigate(`/companies/${companyId}/users`, {
      state: { companyName },
    });
  };

  // Delete handlers
  const handleSingleDeleteClick = (companyId: any, companyName: any) => {
    openModal(
      <ConfirmDelete
        itemName={companyName}
        onConfirm={() => handleConfirmSingleDelete(companyId)}
        onCancel={closeModal}
      />
    );
  };

  const handleBulkDeleteClick = () => {
    if (selectedItems.length === 0) return;
    openModal(
      <ConfirmDelete
        itemName={`${selectedItems.length} companies`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmSingleDelete = async (companyId: any) => {
    try {
      await del(`/api/companies/${companyId}`);
      setSelectedItems(prev => prev.filter(item => item.id !== companyId));
      await refetch();
      closeModal();
    } catch (error) {
      console.error('Failed to delete company:', error);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedItems.length === 0) return;

    try {
      const company_ids = selectedItems;

      // console.log(ids,"ieruwir")

      await post('/api/companies/bulk-delete', { company_ids });

      setSelectedItems([]);
      await refetch();
      closeModal();
    } catch (error) {
      console.error('Failed to delete companies:', error);
    }
  };

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedItems([]);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    setSelectedItems([]);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Add company handler
  const handleAddCompany = () => {
    openModal(
      <AddCompanyForm
        onSuccess={() => {
          refetch();
          closeModal();
        }}
        onClose={closeModal}
      />
    );
  };

  // Column definitions
  const columns: DataTableColumn[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
      minWidth: '200px',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      accessor: 'email',
      minWidth: '250px',
      render: value => (
        <div className="flex items-center gap-2">
          <span className="text-accent-cyan font-mono text-[12px]">{value}</span>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      accessor: 'country',
      minWidth: '150px',
      render: value => (
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: 'zipCode',
      header: 'Zip Code',
      accessor: 'zip_code',
      minWidth: '120px',
      render: value => (
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span className="font-mono text-xs text-ink-0">{value || '-'}</span>
        </div>
      ),
    },
    {
      key: 'users_count',
      header: 'Users',
      accessor: 'users_count',
      align: 'center',
      minWidth: '100px',
      render: value => (
        <div className="flex items-center justify-center gap-2">
          <Users className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span className="font-medium">{value || 0}</span>
        </div>
      ),
    },
    {
      key: 'devices_count',
      header: 'Devices',
      accessor: 'devices_count',
      align: 'center',
      minWidth: '100px',
      render: value => (
        <div className="flex items-center justify-center gap-2">
          <Package className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span className="font-medium">{value || 0}</span>
        </div>
      ),
    },
    {
      key: 'edit',
      header: '',
      accessor: null,
      align: 'center',
      minWidth: '60px',
      render: (value, company) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleEditCompany(company.id, company.name);
          }}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors"
          title="Edit Company"
        >
          <Edit className="w-3.5 h-3.5 cursor-pointer text-ink-2" />
        </button>
      ),
    },
    {
      key: 'delete',
      header: '',
      accessor: null,
      align: 'center',
      minWidth: '60px',
      render: (value, company) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleSingleDeleteClick(company.id, company.name);
          }}
          className="p-1.5 hover:bg-danger/10 rounded-md transition-colors"
          title="Delete Company"
        >
          <Trash2 className="w-3.5 cursor-pointer h-3.5 text-danger hover:brightness-125" />
        </button>
      ),
    },
  ];

  const bulkActions = [{ id: 1, value: 'delete', label: 'Delete Selected' }];

  const handleBulkAction = (action: string) => {
    if (action === 'delete') {
      handleBulkDeleteClick();
    }
  };

  const handleRowClick = (company: any) => {
    console.log('Clicked:', company);
  };

  const shouldShowSkeleton = isLoading && !hasLoadedOnce;
  const isSearching = isLoading && hasLoadedOnce;
  const tableData: any[] = companies?.data?.data || [];
  const paginationData: any = companies?.data || {};

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto">
        <div className="mb-4">
          <div className="eyebrow">Platform</div>
          <h1 className="page-title mt-1">Companies directory</h1>
          <p className="page-subtitle mt-1">Manage and view all company information</p>
        </div>

        {shouldShowSkeleton ? (
          <TableSkeleton />
        ) : (
          <div className="glass-strong  overflow-hidden">
            <DataTable
              data={tableData}
              columns={columns}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
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
              selectedItems={selectedItems}
              onSelectionChange={setSelectedItems}
              onRowClick={handleRowClick}
              loading={isSearching}
              loadingText="Searching companies..."
              noDataText={
                debouncedSearchTerm
                  ? 'No companies found matching your search.'
                  : 'No companies found.'
              }
              showSearch={true}
              showAddButton={true}
              addButtonText="Add Company"
              onAddClick={handleAddCompany}
              searchPlaceholder="Search companies..."
              bulkActions={bulkActions}
              onBulkAction={handleBulkAction}
              className="border-0"
              headerClassName="bg-surface-2"
              rowClassName="hover:bg-surface-2 transition-colors"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CompaniesListView;
