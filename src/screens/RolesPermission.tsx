/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import SelectReuseAble from '../components/Select';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useTranslation } from 'react-i18next';
import { useUser } from '@contexts/UserContext';
import { useModal } from '@contexts/ModalContext';
import { roleTypes } from '@root/src/utils/fakeBackend/Data';
import DataTable, { type DataTableColumn } from '@components/RadixTable';
import CardRole from '@components/CardRole';
import Button from '@components/Button';
import AddBtnIcon from '@assets/icons/MUIicons/AddBtnIcon';
import { Users, Shield, UserPlus } from 'lucide-react';
import { useParams, useNavigate, useLocation } from '@lib/router-compat';
import PermissionsToggler from './PermissionToggle';
import AddUserForm from '../components/AddMemberForm';
import ConfirmDelete from '@components/ConfirmDelete';
import { del } from '../utils/apiHelper';

const RolesPermission = () => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRules, setSelectedRules] = useState<any[]>([]);
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { openModal, closeModal } = useModal();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('roles');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const comapny_id = (user as any)?.roles?.[0]?.company_id;

  // Fetch roles data using useSimpleQuery
  const {
    data: rolesData,
    isLoading: rolesLoading,
    refetch: refetchRoles,
  } = useSimpleQuery(['company-roles', comapny_id], `/api/roles/company`, {
    company_id: comapny_id,
  });

  const {
    data: membersData,
    isLoading: membersLoading,
    refetch: refetchMembers,
  } = useSimpleQuery(['company-members'], 'api/members', {});

  // Mark as loaded once
  useEffect(() => {
    if ((rolesData || membersData) && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [rolesData, membersData, hasLoadedOnce]);

  // Transform roles data
  const roles: any[] =
    rolesData?.roles?.map((role: any) => ({
      id: role.id,
      title: role.name.charAt(0).toUpperCase() + role.name.slice(1),
      subTitle: role.display_name || role.name,
      description: role.description || `Role with ${role.permissions.length} permissions`,
      team: role.users.length,
      badge: { value: role.permissions.length },
      path: `/role/${role.id}`,
      permissionCount: role.permissions.length,
      userCount: role.users.length,
      created_at: role.created_at,
    })) || [];

  // Transform members data
  const members: any[] =
    membersData?.data?.data?.map((member: any) => ({
      id: member.id,
      name: `${member.user.first_name} ${member.user.last_name}`,
      email: member.user.email,
      phone: member.user.number,
      role: member.user.roles[0]?.name || 'No Role',
      status: member.user.status,
      createdAt: member.created_at,
      userId: member.user_id,
    })) || [];

  const pagination = {
    currentPage: membersData?.data?.current_page || 1,
    totalPages: membersData?.data?.last_page || 1,
    perPage: membersData?.data?.per_page || 10,
    total: membersData?.data?.total || 0,
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Fixed: Refetch roles data instead of using setRoles
  const handleRoleDeleted = (deletedRoleId: any) => {
    // Refetch the roles data to get the updated list
    refetchRoles();
  };

  // Single delete for members
  const handleSingleDeleteClick = (memberId: any, memberName: any) => {
    openModal(
      <ConfirmDelete
        itemName={memberName}
        onConfirm={() => handleConfirmSingleDelete(memberId)}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmSingleDelete = async (memberId: any) => {
    try {
      await del(`/api/members/bulk-delete`, {
        data: { ids: [memberId] },
      });
      setSelectedRules(prev => prev.filter(item => item !== memberId));
      await refetchMembers();
      closeModal();
    } catch (error) {
      console.error('Failed to delete member:', error);
    }
  };

  // Bulk delete for members
  const handleBulkDeleteClick = () => {
    if (selectedRules.length === 0) return;

    const selectedCount = selectedRules.length;
    openModal(
      <ConfirmDelete
        itemName={`${selectedCount} member${selectedCount > 1 ? 's' : ''}`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmBulkDelete = async () => {
    try {
      await del(`/api/members/bulk-delete`, {
        data: { ids: selectedRules },
      });
      setSelectedRules([]);
      await refetchMembers();
      closeModal();
    } catch (error) {
      console.error('Failed to delete members:', error);
    }
  };

  const handleBulkAction = (action: string, selectedItems?: any) => {
    console.log(`Bulk action: ${action}`, selectedItems);

    if (action === 'delete') {
      handleBulkDeleteClick();
    }
  };

  useEffect(() => {
    if (location.pathname.includes('roles')) {
      setActiveTab('roles');
    } else if (location.pathname.includes('members')) {
      setActiveTab('members');
    } else if (location.pathname.includes('assign-permission')) {
      setActiveTab('assign-permission');
    }
  }, [location.pathname]);

  function handleAddRole() {
    navigate('/assign-permission');
  }

  const handleAddMemberSuccess = () => {
    closeModal();
    refetchMembers(); // Refresh the members list after successful creation
  };

  const handleAddMemberClick = () => {
    openModal(
      <AddUserForm onClose={closeModal} companyId={comapny_id} onSuccess={handleAddMemberSuccess} />
    );
  };

  const bulkActions = [
    {
      label: 'Delete Selected',
      value: 'delete',
      className: 'text-danger hover:bg-danger/10',
    },
  ];

  const handleTabClick = (tabId: string) => {
    if (tabId == 'roles') {
      navigate('/roles-permission');
    } else if (tabId == 'members') {
      navigate('/members');
    }
  };

  // Columns for members table
  const memberColumns: DataTableColumn[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
      sortable: true,
      width: '200px',
      render: (value, item) => (
        <div className="py-1">
          <div className="font-medium text-ink-0 text-xs md:text-sm">{value}</div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      accessor: 'email',
      sortable: true,
      width: '220px',
      render: value => <div className="text-xs md:text-sm text-ink-1">{value}</div>,
    },
    {
      key: 'phone',
      header: 'Phone',
      accessor: 'phone',
      sortable: false,
      width: '150px',
      render: value => <div className="text-xs md:text-sm text-ink-1">{value}</div>,
    },
    {
      key: 'role',
      header: 'Role',
      accessor: 'role',
      sortable: true,
      width: '150px',
      render: value => (
        <span className="px-2 py-0.5 bg-accent-cyan/10 text-accent-cyan rounded text-[10.5px] font-medium capitalize">
          {value}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      width: '120px',
      render: status => (
        <span
          className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${
            status === 'Active'
              ? 'bg-accent-green/10 text-accent-green'
              : status === 'Pending'
                ? 'bg-warning/10 text-warning'
                : 'bg-danger/10 text-danger'
          }`}
        >
          {status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created At',
      accessor: 'createdAt',
      sortable: true,
      width: '140px',
      render: value => {
        const date = new Date(value);
        return (
          <div className="text-xs md:text-sm font-mono">
            <div className="font-medium text-ink-0">{date.toLocaleDateString()}</div>
            <div className="text-[10.5px] text-ink-2">
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        );
      },
    },
  ];

  const TabNavigation = () => {
    const tabs: { id: string; label: string; icon: ReactNode; count?: number }[] = [
      {
        id: 'roles',
        label: 'Roles',
        icon: <Shield size={16} className="md:w-4 md:h-4 w-3 h-3" />,
        count: roles.length,
      },
      {
        id: 'members',
        label: 'Members',
        icon: <Users size={16} className="md:w-4 md:h-4 w-3 h-3" />,
        count: pagination.total,
      },
    ];

    return (
      <div className="border-b border-line mb-3 md:mb-4 overflow-x-auto">
        <nav className="flex space-x-4 md:space-x-8 min-w-max md:min-w-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`tab whitespace-nowrap ${activeTab === tab.id ? 'tab-active' : ''}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
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

  const loading = activeTab === 'roles' ? rolesLoading : membersLoading;
  const shouldShowSkeleton = loading && !hasLoadedOnce;
  const isSearching = loading && hasLoadedOnce;

  return (
    <div className="w-full mb-4 md:mb-6 px-2 sm:px-4">
      <div className="mb-3 mt-2 flex sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="page-title">{t('RulesPermission.title')}</h1>
        {activeTab === 'roles' && (
          <Button onClick={handleAddRole} className="w-full sm:w-auto">
            <AddBtnIcon /> <span className="ml-1">Add Role</span>
          </Button>
        )}
      </div>

      <TabNavigation />

      {activeTab == 'roles' ? (
        shouldShowSkeleton ? (
          <div className="flex justify-center items-center h-40">
            <p className="text-ink-2 text-xs md:text-sm">{t('RulesPermission.loading')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {roles.map((item, index) => {
              return (
                <div key={item.id}>
                  <CardRole
                    id={item.id}
                    onRoleDeleted={handleRoleDeleted}
                    onSuccess={handleAddMemberSuccess}
                    onClose={closeModal}
                    title={item.title}
                    subTitle={item.subTitle}
                    description={item.description}
                    team={item.team}
                    path={item.path}
                    badge={item.badge}
                  />
                </div>
              );
            })}
          </div>
        )
      ) : activeTab == 'members' ? (
        <div className="overflow-x-auto">
          <DataTable
            data={members}
            columns={memberColumns}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            searchPlaceholder={`${t('rule.search') || 'Search Members'}...`}
            loading={isSearching}
            loadingText={t('rule.loading') || 'Loading members...'}
            noDataText={t('rule.noRules') || 'No members found.'}
            selectable={true}
            onSelectionChange={setSelectedRules}
            selectedItems={selectedRules}
            pagination={true}
            rowsPerPageOptions={[5, 10, 25, 50]}
            defaultRowsPerPage={10}
            className="bg-surface-1 border overflow-hidden border-line-soft rounded-md"
            showSearch={true}
            showAddButton={true}
            addButtonText={'Add Member'}
            onAddClick={handleAddMemberClick}
            bulkActions={bulkActions}
            onBulkAction={handleBulkAction}
            cellPadding="py-[6px]"
          />
        </div>
      ) : activeTab == 'assign-permission' ? (
        ''
      ) : null}
    </div>
  );
};

export default RolesPermission;
