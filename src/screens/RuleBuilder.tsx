/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import DataTable, { type DataTableColumn } from '../components/RadixTable';
import ConfirmDelete from '../components/ConfirmDelete';
import ConfirmModal from '../components/ConfirmActivationModal';
import TableRowSkeleton from '../components/TableSkeleton';
import { useModal } from '../contexts/ModalContext';
import { Edit, Trash2, Mail, MessageSquare, Settings } from 'lucide-react';
import { useNavigate } from '@lib/router-compat';
import { useTranslation } from 'react-i18next';
import { useSimpleQuery } from '../hooks/useSimpleQuery';
import { get, del, post } from '../utils/apiHelper';
import { useUser } from '../contexts/UserContext';

import RuleBuilderDemo from '@root/src/ConvoyAIDemo/RuleBuilderDemo';
import { isFirstDemo } from '../utils/DemoHelper';

export default function Rule() {
  const navigate = useNavigate();
  const { user } = useUser();

  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();

  const [selectedRules, setSelectedRules] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Sorting state
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [demoStart, setDemoStart] = useState(false);

  // Track if this is the first ever data load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (isFirstDemo('RuleBuilderDemo')) {
      setDemoStart(false);
    }
  }, []);

  // Build query parameters
  const queryParams = {
    user_id: user?.id,
    page: currentPage,
    per_page: rowsPerPage,
    sort_by: sortBy,
    sort_order: sortOrder,
    ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
  };

  // Use useSimpleQuery with keepPreviousData
  const {
    data: rulesResponse,
    isLoading,
    refetch,
  } = useSimpleQuery(
    ['rules', currentPage, rowsPerPage, debouncedSearchTerm, sortBy, sortOrder],
    `/api/rules`,
    queryParams,
    {
      // NOTE: react-query v5 dropped `keepPreviousData` (it moved to
      // `placeholderData: keepPreviousData`). It was a silent no-op here since
      // the v5 upgrade — left removed rather than silently ignored. See task.md.
      staleTime: 0,
    }
  );

  // Extract rules and pagination data
  const rules: any[] = rulesResponse?.data?.rules || [];
  const totalItems = rulesResponse?.data?.pagination?.total || 0;
  const totalPages = rulesResponse?.data?.pagination?.last_page || 0;

  // Mark as loaded once we have data for the first time
  useEffect(() => {
    if (rulesResponse && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [rulesResponse, hasLoadedOnce]);

  // Only show skeleton if we've never loaded data before
  const shouldShowSkeleton = isLoading && !hasLoadedOnce;

  // Show spinner in table when searching/paginating after initial load
  const isTableLoading = isLoading && hasLoadedOnce;

  // Handle search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const renderActionTypes = (rule: any) => {
    const actions: any[] = [];

    if (rule.actions?.sendEmail === true || rule.sendEmail === true || rule.email_action === true) {
      actions.push(
        <span
          key="email"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent-blue/10 text-accent-blue rounded-full"
        >
          <Mail className="w-3 h-3" />
          Send Email
        </span>
      );
    }

    if (rule.actions?.sendMessage === true || rule.send_sms === true || rule.sms_action === true) {
      actions.push(
        <span
          key="sms"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-accent-green/10 text-accent-green rounded-full"
        >
          <MessageSquare className="w-3 h-3" />
          Send SMS
        </span>
      );
    }

    if (
      rule.actions?.systemNotification === true ||
      rule.system_action === true ||
      rule.system_notification === true
    ) {
      actions.push(
        <span
          key="system"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-warning/15 text-warning rounded-full"
        >
          <Settings className="w-3 h-3" />
          System Notification
        </span>
      );
    }

    if (actions.length === 0) {
      return <span className="text-ink-2">-</span>;
    }

    return <div className="flex flex-row items-center gap-1 flex-wrap">{actions}</div>;
  };

  const handleBulkStatusChangeClick = (newStatus: boolean) => {
    if (selectedRules.length === 0) return;

    const actionText = newStatus ? 'activate' : 'deactivate';
    const selectedCount = selectedRules.length;

    openModal(
      <ConfirmModal
        title={`${newStatus ? 'Activate' : 'Deactivate'} Rules`}
        message={`Are you sure you want to ${actionText} ${selectedCount} selected rule${selectedCount > 1 ? 's' : ''}?`}
        confirmText={newStatus ? 'Activate' : 'Deactivate'}
        cancelText="Cancel"
        confirmButtonColor={
          newStatus ? 'bg-accent-green hover:brightness-110' : 'bg-warning hover:brightness-110'
        }
        onConfirm={() => handleConfirmBulkStatusChange(newStatus)}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmBulkStatusChange = async (newStatus: boolean) => {
    try {
      const endpoint = newStatus ? 'activate' : 'deactivate';

      const response = await post(`/api/rules/bulk/${endpoint}`, {
        rule_ids: selectedRules,
      });

      if (response?.success === true) {
        setSelectedRules([]);
        refetch();
        closeModal();
        console.log(`Rules ${newStatus ? 'activated' : 'deactivated'} successfully`);
      } else {
        console.error('API returned error:', response);
      }
    } catch (error) {
      console.error(`Failed to ${newStatus ? 'activate' : 'deactivate'} selected rules:`, error);
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedRules.length === 0) return;

    const selectedCount = selectedRules.length;
    openModal(
      <ConfirmDelete
        title="Delete Rules"
        message={`Are you sure you want to delete ${selectedCount} selected rule${selectedCount > 1 ? 's' : ''}?`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  const handleSingleDeleteClick = (ruleId: any) => {
    const rule = rules.find((r: any) => r.id === ruleId);
    const itemName = rule?.name || t('rule.rule') || 'rule';

    openModal(
      <ConfirmDelete
        itemName={itemName}
        onConfirm={() => handleConfirmSingleDelete(ruleId)}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmBulkDelete = async () => {
    try {
      const response = await post('/api/rules/bulk/delete', {
        rule_ids: selectedRules,
      });

      if (response?.success === true) {
        setSelectedRules([]);
        refetch();
        closeModal();
        console.log('Selected rules deleted successfully');
      } else {
        console.error('Bulk delete API returned error:', response);
      }
    } catch (error) {
      console.error('Failed to delete selected rules:', error);
    }
  };

  const handleConfirmSingleDelete = async (ruleId: any) => {
    try {
      await del(`/api/rules/${ruleId}`);
      setSelectedRules((prev: any[]) => prev.filter((id: any) => id !== ruleId));
      refetch();
      closeModal();
      console.log('Rule deleted successfully');
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleEditRule = (ruleId: any) => {
    navigate(`/new-rule/${ruleId}`);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleBulkAction = (action: string) => {
    if (action === 'delete') {
      handleBulkDeleteClick();
    } else if (action === 'activate') {
      handleBulkStatusChangeClick(true);
    } else if (action === 'deactivate') {
      handleBulkStatusChangeClick(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    const numRowsPerPage = parseInt(String(newRowsPerPage), 10);
    setRowsPerPage(numRowsPerPage);
    setCurrentPage(1);
  };

  const handleSort = (columnKey: string, direction: string) => {
    setSortBy(columnKey);
    setSortOrder(direction);
    setCurrentPage(1);
  };

  const columns: DataTableColumn[] = [
    {
      key: 'name',
      header: t('rule.columns.rule') || 'Rule Name',
      accessor: 'name',
      width: '250px',
      render: value => <div className="font-medium text-ink-0">{value}</div>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'is_active',
      align: 'center',
      render: (value, rule) => (
        <button
          onClick={e => {
            e.stopPropagation();
            // handleSingleStatusChangeClick(rule.id, !value);
          }}
          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full transition-colors hover:opacity-80 ${
            value
              ? 'bg-accent-green/10 text-accent-green hover:bg-accent-green/20'
              : 'bg-danger/10 text-danger hover:bg-danger/20'
          }`}
          title={`Click to ${value ? 'deactivate' : 'activate'}`}
        >
          {value ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'action_types',
      header: 'Rule Actions',
      accessor: null,
      align: 'center',
      width: '220px',
      render: (value, rule) => renderActionTypes(rule),
    },
    {
      key: 'created_at',
      header: 'Created At',
      accessor: 'created_at',
      align: 'center',
      render: value => <span className="text-sm text-ink-1">{value ? value : 'Recently'}</span>,
    },
    {
      key: 'last_triggered',
      header: 'Last Trigger',
      accessor: 'last_triggered',
      align: 'center',
      render: value => (
        <span className="text-sm text-ink-1">
          {value ? new Date(value).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      accessor: null,
      align: 'center',
      width: '120px',
      render: (value, rule) => (
        <div className="flex items-center justify-center gap-2 divide-x divide-line">
          <button
            onClick={e => {
              e.stopPropagation();
              handleEditRule(rule.id);
            }}
            className="p-2 hover:bg-surface-3 rounded-md transition-colors"
            title={t('rule.actions.edit') || 'Edit Rule'}
          >
            <Edit className="w-4 h-4 cursor-pointer text-ink-2" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              handleSingleDeleteClick(rule.id);
            }}
            className="p-2 pl-4 hover:bg-surface-3 rounded-md transition-colors"
            title={t('rule.actions.delete') || 'Delete Rule'}
          >
            <Trash2 className="w-4 cursor-pointer h-4 text-ink-2" />
          </button>
        </div>
      ),
    },
  ];

  const bulkActions = [
    { value: 'delete', label: 'Delete' },
    { value: 'activate', label: 'Activate' },
    { value: 'deactivate', label: 'Deactivate' },
  ];

  return (
    <div className="w-full">
      {demoStart && <RuleBuilderDemo />}
      <div className="px-4 sm:px-6 py-2">
        <h1 className="text-lg font-semibold text-ink-0 font-display">{t('rule.title')}</h1>
      </div>

      <div className="px-4">
        {shouldShowSkeleton ? (
          <TableRowSkeleton count={rowsPerPage} />
        ) : (
          <DataTable
            data={rules}
            columns={columns}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            searchPlaceholder={`${t('rule.search') || 'Search Rules'}...`}
            loading={isTableLoading}
            loadingText={t('rule.loading') || 'Loading rules...'}
            noDataText={
              debouncedSearchTerm ? 'No rules found' : t('rule.noRules') || 'No rules found.'
            }
            selectable
            onSelectionChange={setSelectedRules}
            selectedItems={selectedRules}
            pagination
            serverSidePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            rowsPerPage={rowsPerPage}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            serverSideSorting
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            className="bg-surface-1 border overflow-hidden border-line rounded-xl"
            showSearch
            showAddButton
            addButtonText={t('rule.addRule') || 'Add Rule'}
            onAddClick={() => navigate('/new-rule')}
            bulkActions={bulkActions}
            onBulkAction={handleBulkAction}
            addButtonId="add-new-btn"
            cellPadding="py-[6px]"
          />
        )}
      </div>
    </div>
  );
}
