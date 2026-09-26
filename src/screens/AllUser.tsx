// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import { Edit, Trash2, Phone } from 'lucide-react';
import DataTable from '@components/RadixTable';
import { useNavigate, useParams } from '@lib/router-compat';
import { useModal } from '@contexts/ModalContext';
import AddUserForm from '../components/AddMemberForm';
import ConfirmDelete from '@components/ConfirmDelete';
import { del } from '../utils/apiHelper';

// NOTE: file stays @ts-nocheck (pre-existing runtime bug — `onRefetch` was used in
// 3 delete/add paths but never destructured, so every one threw a ReferenceError).
// Added `onRefetch` to the props here so the parent's `onRefetch={refetch}` (EditCompany)
// is actually honored; full typing of this file is deferred.
const AllUser = ({ users = [], companyId, onRefetch }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const navigate = useNavigate();
  const { openModal, closeModal } = useModal();

  //  const id = useParams();

  console.log(companyId, 'eng');

  // Handle search change
  const handleSearchChange = e => {
    setSearchTerm(e.target.value);
  };

  // Filter users based on search term
  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    const phone = (user.number || '').toLowerCase();

    return (
      fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower)
    );
  });

  const handleEditUser = userId => {
    navigate(`/edit-user/${userId}`, {
      state: { companyId },
    });
  };

  // Single delete
  const handleSingleDeleteClick = (userId, userName) => {
    openModal(
      <ConfirmDelete
        itemName={userName}
        onConfirm={() => handleConfirmSingleDelete(userId)}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmSingleDelete = async userId => {
    try {
      await del(`/api/members/bulk-delete`, {
        data: { ids: [userId] },
      });
      setSelectedItems(prev => prev.filter(item => item !== userId));
      if (onRefetch) await onRefetch();
      closeModal();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  // Bulk delete
  const handleBulkDeleteClick = () => {
    if (selectedItems.length === 0) return;

    const selectedCount = selectedItems.length;
    openModal(
      <ConfirmDelete
        itemName={`${selectedCount} user${selectedCount > 1 ? 's' : ''}`}
        onConfirm={handleConfirmBulkDelete}
        onCancel={closeModal}
      />
    );
  };

  const handleConfirmBulkDelete = async () => {
    try {
      await del(`/api/members/bulk-delete`, {
        data: { ids: selectedItems },
      });
      setSelectedItems([]);
      if (onRefetch) await onRefetch();
      closeModal();
    } catch (error) {
      console.error('Failed to delete users:', error);
    }
  };

  // Add User Modal
  const handleAddUser = () => {
    openModal(
      <AddUserForm
        companyId={companyId}
        onSuccess={() => {
          console.log('New user added successfully');
          if (onRefetch) onRefetch();
          closeModal();
        }}
        onClose={() => {
          closeModal();
        }}
      />
    );
  };

  // Column definitions
  const columns = [
    {
      key: 'first_name',
      header: 'Name',
      accessor: 'first_name',
      minWidth: '200px',
      render: (value, user) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{`${value} ${user.last_name || ''}`}</span>
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
          <span className="text-brand-text font-mono text-[12px]">{value}</span>
        </div>
      ),
    },
    {
      key: 'number',
      header: 'Phone Number',
      accessor: 'number',
      minWidth: '150px',
      render: value => (
        <div className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span>{value || '-'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      minWidth: '120px',
      render: value => (
        <span
          className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${
            value === 'active' ? 'bg-accent-green/10 text-accent-green' : 'bg-surface-3 text-ink-1'
          }`}
        >
          {(value || 'inactive').toUpperCase()}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created At',
      accessor: 'created_at',
      minWidth: '150px',
      render: value => (
        <span className="text-xs font-mono text-ink-1">
          {value ? new Date(value).toLocaleDateString() : '-'}
        </span>
      ),
    },
    {
      key: 'edit',
      header: '',
      accessor: null,
      align: 'center',
      minWidth: '60px',
      render: (value, user) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleEditUser(user.id);
          }}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors"
          title="Edit User"
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
      render: (value, user) => (
        <button
          onClick={e => {
            e.stopPropagation();
            handleSingleDeleteClick(user.id, `${user.first_name} ${user.last_name}`);
          }}
          className="p-1.5 hover:bg-danger/10 rounded-md transition-colors"
          title="Delete User"
        >
          <Trash2 className="w-3.5 cursor-pointer h-3.5 text-danger-text hover:brightness-125" />
        </button>
      ),
    },
  ];

  const bulkActions = [
    { id: 1, value: 'delete', label: 'Delete Selected' },
    { id: 2, value: 'export', label: 'Export Selected' },
  ];

  const handleBulkAction = action => {
    if (action === 'delete') {
      handleBulkDeleteClick();
    } else if (action === 'export') {
      console.log('Export action:', action, 'on', selectedItems.length, 'items');
    }
  };

  const handleRowClick = user => {
    console.log('Clicked:', user);
  };

  return (
    <div className="bg-surface-1 rounded-md overflow-hidden">
      <DataTable
        data={filteredUsers}
        columns={columns}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        // Client-side pagination since we have all users
        pagination={true}
        serverSidePagination={false}
        rowsPerPage={10}
        rowsPerPageOptions={[10, 25, 50]}
        selectable={true}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        onRowClick={handleRowClick}
        noDataText={searchTerm ? 'No users found matching your search.' : 'No users found.'}
        showSearch={true}
        showAddButton={true}
        addButtonText="Add User"
        onAddClick={handleAddUser}
        searchPlaceholder="Search users..."
        bulkActions={bulkActions}
        onBulkAction={handleBulkAction}
      />
    </div>
  );
};

export default AllUser;
