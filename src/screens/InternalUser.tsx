/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { Building2, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import DataTable, { type DataTableColumn } from '@components/RadixTable';
import { useNavigate } from '@lib/router-compat';

const usersData: any[] = [
  {
    id: 1,
    name: 'John Smith',
    companyName: 'Tech Solutions Inc',
    email: 'john.smith@techsolutions.com',
    password: 'Pass@1234',
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    companyName: 'Global Innovations',
    email: 'sarah.j@globalinnovations.com',
    password: 'Secure#567',
  },
  {
    id: 3,
    name: 'Michael Brown',
    companyName: 'Digital Dynamics',
    email: 'michael.b@digitaldynamics.com',
    password: 'MyPass890',
  },
  {
    id: 4,
    name: 'Emily Davis',
    companyName: 'Future Systems',
    email: 'emily.davis@futuresystems.com',
    password: 'Emily@2024',
  },
  {
    id: 5,
    name: 'David Wilson',
    companyName: 'Smart Analytics Co',
    email: 'david.w@smartanalytics.com',
    password: 'David#456',
  },
  {
    id: 6,
    name: 'Lisa Anderson',
    companyName: 'Cloud Networks',
    email: 'lisa.a@cloudnetworks.com',
    password: 'Cloud@789',
  },
  {
    id: 7,
    name: 'Robert Taylor',
    companyName: 'Data Insights Ltd',
    email: 'robert.t@datainsights.com',
    password: 'Rob@123!',
  },
  {
    id: 8,
    name: 'Jennifer Lee',
    companyName: 'Innovation Labs',
    email: 'jennifer.lee@innovationlabs.com',
    password: 'Jenn$2024',
  },
  {
    id: 9,
    name: 'William Martinez',
    companyName: 'Web Services Pro',
    email: 'william.m@webservicespro.com',
    password: 'Will#678',
  },
];

// Password Display Component
const PasswordCell = ({ password }: { password?: string }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2">
      {/* <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" /> */}
      <span className="font-mono text-xs text-ink-0">{showPassword ? password : '••••••••'}</span>
      <button
        onClick={e => {
          e.stopPropagation();
          setShowPassword(!showPassword);
        }}
        className="p-1 hover:bg-surface-3 rounded transition-colors"
      >
        {showPassword ? (
          <EyeOff className="w-3.5 h-3.5 text-ink-2" />
        ) : (
          <Eye className="w-3.5 h-3.5 text-ink-2" />
        )}
      </button>
    </div>
  );
};

// Main Users Table Component
const UsersTable = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Filter and sort data
  const processedData = useMemo<any[]>(() => {
    const filtered = usersData.filter((item: any) =>
      Object.values(item).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

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
  }, [searchTerm, sortBy, sortOrder]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return processedData.slice(start, start + rowsPerPage);
  }, [processedData, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(processedData.length / rowsPerPage);

  const handleEditUser = (userId: any) => {};

  const handleDeleteUser = (userId: any, userName: any) => {
    // if (window.confirm(`Are you sure you want to delete ${userName}?`)) {
    //   // alert(`Delete user with ID: ${userId}`);
    //   // Add your delete API call here
    // }
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
      key: 'companyName',
      header: 'Company Name',
      accessor: 'companyName',
      minWidth: '200px',
      render: value => (
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-ink-2 flex-shrink-0" />
          <span>{value}</span>
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
          {/* <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" /> */}
          <span className="text-accent-cyan font-mono text-[12px]">{value}</span>
        </div>
      ),
    },
    {
      key: 'password',
      header: 'Password',
      accessor: 'password',
      minWidth: '200px',
      render: value => <PasswordCell password={value} />,
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
            handleDeleteUser(user.id, user.name);
          }}
          className="p-1.5 hover:bg-danger/10 rounded-md transition-colors"
          title="Delete User"
        >
          <Trash2 className="w-3.5 cursor-pointer h-3.5 text-danger hover:brightness-125" />
        </button>
      ),
    },
  ];

  const bulkActions = [
    { id: 1, value: 'delete', label: 'Delete Selected' },
    { id: 2, value: 'export', label: 'Export Selected' },
    { id: 3, value: 'reset', label: 'Reset Passwords' },
  ];

  const handleSort = (columnKey: string, direction: string) => {
    setSortBy(columnKey);
    setSortOrder(direction);
  };

  const handleBulkAction = (action: string) => {
    // alert(`Bulk action: ${action} on ${selectedItems.length} users`);
  };

  const handleAddClick = () => {
    // alert('Add new user clicked!');
  };

  const handleRowClick = (user: any) => {
    console.log('Clicked:', user);
  };

  return (
    <div className="min-h-screen  ">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-[13px] font-semibold text-ink-0 mt-4 font-display">Internal users</h1>
          {/* <p className="text-gray-600">Manage user accounts and credentials</p> */}
        </div>

        <div className="bg-surface-1 rounded-md border border-line-soft overflow-hidden">
          <DataTable
            data={paginatedData}
            columns={columns}
            searchTerm={searchTerm}
            onSearchChange={e => setSearchTerm(e.target?.value ?? '')}
            pagination={true}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={processedData.length}
            rowsPerPage={rowsPerPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={setRowsPerPage}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            selectable={true}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            onRowClick={handleRowClick}
            loading={loading}
            showSearch={true}
            showAddButton={true}
            addButtonText="Add User"
            onAddClick={handleAddClick}
            searchPlaceholder="Search users..."
            bulkActions={bulkActions}
            onBulkAction={handleBulkAction}
          />
        </div>
      </div>
    </div>
  );
};

export default UsersTable;
