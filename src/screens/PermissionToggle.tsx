/* eslint-disable @typescript-eslint/no-explicit-any */
import toast from 'react-hot-toast';
import GlobalToggle from '@forms/FormComponents/ToggleBtn';
import { useState, useEffect } from 'react';
import type { ComponentType, FormEvent, ReactNode } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useParams, useNavigate } from '@lib/router-compat';
import {
  Settings,
  User,
  Mail,
  LayoutDashboard,
  Smartphone,
  Package,
  Shield,
  Lock,
  UsersRound,
} from 'lucide-react';
import GlobalInput from '../components/Input';
import { get, post, put } from '../utils/apiHelper';
import { useUser } from '@contexts/UserContext';

const HexagonBadge = ({ children }: { children?: ReactNode }) => (
  <div className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center">
    <svg
      className="w-full h-full absolute"
      width="44"
      height="48"
      viewBox="0 0 44 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 2.4641C19.7128 0.320509 24.2872 0.320508 28 2.4641L37.6506 8.0359C41.3634 10.1795 43.6506 14.141 43.6506 18.4282V29.5718C43.6506 33.859 41.3634 37.8205 37.6506 39.9641L28 45.5359C24.2872 47.6795 19.7128 47.6795 16 45.5359L6.34937 39.9641C2.63655 37.8205 0.349365 33.859 0.349365 29.5718V18.4282C0.349365 14.141 2.63655 10.1795 6.34937 8.0359L16 2.4641Z"
        fill="var(--color-surface-2)"
      />
      <path
        d="M16.25 2.89711C19.8081 0.842838 24.1919 0.842837 27.75 2.89711L37.4006 8.46891C40.9587 10.5232 43.1506 14.3196 43.1506 18.4282V29.5718C43.1506 33.6804 40.9587 37.4768 37.4006 39.5311L27.75 45.1029C24.1919 47.1572 19.8081 47.1572 16.25 45.1029L6.59937 39.5311C3.04125 37.4768 0.849365 33.6803 0.849365 29.5718V18.4282C0.349365 14.3196 3.04125 10.5232 6.59937 8.46891L16.25 2.89711Z"
        stroke="var(--color-accent-cyan)"
        strokeWidth="1"
      />
    </svg>
    <div className="absolute inset-0 flex items-center justify-center z-10">{children}</div>
  </div>
);

interface PermissionCardProps {
  icon: ComponentType<{ className?: string }>;
  title?: ReactNode;
  description?: ReactNode;
  enabled?: boolean;
  onChange?: () => void;
}

const PermissionCard = ({
  icon: Icon,
  title,
  description,
  enabled,
  onChange,
}: PermissionCardProps) => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 glass-strong group card-lift gap-3 sm:gap-4">
    <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto">
      <HexagonBadge>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-accent-cyan" />
      </HexagonBadge>
      <div className="flex-1 min-w-0">
        <h3 className="card-title mb-1">{title}</h3>
        <p className="card-subtitle leading-relaxed">{description}</p>
      </div>
    </div>
    <GlobalToggle checked={enabled} onChange={onChange} aria-label={`${title} access`} />
  </div>
);

interface RoleFormValues {
  roleName: string;
  description: string;
}

export default function RolePermissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const { hasPermission } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    setError,
  } = useForm<RoleFormValues>({
    defaultValues: {
      roleName: '',
      description: '',
    },
    mode: 'onChange',
  });

  const getIconForPermission = (permissionName: string) => {
    const iconMap: Record<string, ComponentType<{ className?: string }>> = {
      dashboard: LayoutDashboard,
      'device-management': Smartphone,
      'plan-management': Package,
      'module-management': Settings,
      'role-management': Shield,
      'permission-management': Lock,
      'member-management': UsersRound,
    };

    const key = permissionName.replace('all-', '');
    return iconMap[key] || Settings;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const modulesResponse = await get('/api/modules');

        setModules((modulesResponse as any).modules);

        // Initialize permissions
        const initialPermissions: Record<string, boolean> = {};
        (modulesResponse as any).modules.forEach((module: any) => {
          initialPermissions[module.slug] = false;
        });

        // If editing, fetch role data
        if (isEditMode) {
          const roleResponse = await get(`/api/roles/${id}`);
          console.log('87648893', roleResponse);

          if (roleResponse && roleResponse.success && roleResponse.role) {
            const roleData = roleResponse.role;

            // Set form values
            setValue('roleName', roleData.name || '');
            setValue('description', roleData.description || '');

            // Set permissions based on role's permissions array
            if (roleData.permissions && Array.isArray(roleData.permissions)) {
              roleData.permissions.forEach((permission: any) => {
                // Extract module slug from permission name (e.g., "all-dashboard" -> "dashboard")
                const moduleSlug = permission.name.replace('all-', '');
                if (initialPermissions.hasOwnProperty(moduleSlug)) {
                  initialPermissions[moduleSlug] = true;
                }
              });
            }
          }
        }

        setPermissions(initialPermissions);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false); // Set loading to false after everything completes
      }
    };

    fetchData();
  }, [id, isEditMode, setValue]);

  const togglePermission = (slug: string) => {
    setPermissions(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  const onSubmit = async (data: RoleFormValues) => {
    // Validate at least one module is selected
    const selectedCount = Object.values(permissions).filter(Boolean).length;
    if (selectedCount === 0) {
      setError('root.modules', {
        type: 'manual',
        message: 'Please select at least one module',
      });
      return;
    }

    try {
      setSaving(true);

      // Get selected module IDs
      const selectedModuleIds = modules
        .filter((module: any) => permissions[module.slug])
        .map((module: any) => module.id);

      // Prepare payload
      const payload = {
        name: data.roleName.trim(),
        description: data.description.trim(),
        module_ids: selectedModuleIds,
      };

      // Call API - either create or update
      const response = isEditMode
        ? await put(`/api/roles/${id}/update`, payload)
        : await post('/api/roles/create', payload);

      if (response && response.success) {
        toast.success(isEditMode ? 'Role updated' : 'Role created');

        if (!isEditMode) {
          // Reset form for create mode
          reset();
          const resetPermissions: Record<string, boolean> = {};
          modules.forEach((module: any) => {
            resetPermissions[module.slug] = false;
          });
          setPermissions(resetPermissions);
        } else {
          // Navigate back for edit mode
          navigate('/roles-permission');
        }
      } else {
        toast.error(response?.message || 'Could not save the role.');
      }
    } catch (error) {
      console.error('Failed to save role:', error);
      // alert('An error occurred while saving the role');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSubmit(onSubmit)();
  };

  return (
    <div className="">
      <div className="max-w-7xl">
        {/* Header */}
        <div className="px-3 sm:px-4 lg:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <h2 className="page-title mb-3 sm:mb-4">
            {isEditMode ? 'Edit Role' : 'Create New Role'}
          </h2>
        </div>

        {/* Input Fields Section */}
        <div className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Controller
                name="roleName"
                control={control}
                rules={{
                  required: 'Role name is required',
                  minLength: {
                    value: 3,
                    message: 'Role name must be at least 3 characters',
                  },
                }}
                render={({ field }) => (
                  <GlobalInput
                    label="Role Name"
                    {...field}
                    placeholder="Enter role name"
                    startAdornment={<User className="w-4 h-4" />}
                    disabled={loading || saving}
                  />
                )}
              />
              {errors.roleName && (
                <p className="text-danger-text text-xs mt-1">{errors.roleName.message}</p>
              )}
            </div>
            <div>
              <Controller
                name="description"
                control={control}
                rules={{
                  required: 'Description is required',
                  minLength: {
                    value: 10,
                    message: 'Description must be at least 10 characters',
                  },
                }}
                render={({ field }) => (
                  <GlobalInput
                    label="Description"
                    {...field}
                    type="text"
                    placeholder="Enter description"
                    startAdornment={<Mail className="w-4 h-4" />}
                    disabled={loading || saving}
                  />
                )}
              />
              {errors.description && (
                <p className="text-danger-text text-xs mt-1">{errors.description.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line-soft mb-4 sm:mb-5"></div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-cyan"></div>
          </div>
        ) : modules.length > 0 ? (
          <div>
            {/* Permissions Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 px-3 sm:px-4 lg:px-6 pb-4 sm:pb-6">
              {modules
                .filter((m: any) => hasPermission(`all-${m.code}`))
                .map((module: any) => (
                  <PermissionCard
                    key={module.id}
                    icon={getIconForPermission(module.slug)}
                    title={module.code.charAt(0).toUpperCase() + module.code.slice(1)}
                    description={`Manage and control ${module.code.toLowerCase()} functionality.`}
                    enabled={permissions[module.slug] || false}
                    onChange={() => togglePermission(module.slug)}
                  />
                ))}
            </div>
            {errors.root?.modules && (
              <p className="text-danger-text text-xs px-3 sm:px-4 lg:px-6 pb-2">
                {errors.root.modules.message}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-ink-2 text-sm">
            No modules found
          </div>
        )}

        {/* Save Button */}
        <div className="border-t border-line-soft px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex justify-end gap-3">
          {/* {isEditMode && (
            // <button
            //   type="button"
            //   onClick={() => navigate('/roles')}
            //   disabled={saving}
            //   className="w-full sm:w-auto px-6 py-2.5 bg-gray-200 text-gray-700 text-sm font-medium cursor-pointer rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            // >
            //   Cancel
            // </button>
          )} */}
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={loading || saving}
            className="w-full sm:w-auto px-5 py-2 brand-gradient-bg on-gradient text-xs font-semibold cursor-pointer rounded-md hover:brightness-110 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditMode ? 'Update Role' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
