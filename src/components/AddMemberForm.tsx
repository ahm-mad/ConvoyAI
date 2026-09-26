// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import SelectRadix from '@components/Select';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { post } from '../utils/apiHelper';
import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

const AddUserSchema = yup.object().shape({
  first_name: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters'),

  last_name: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters'),

  email: yup.string().required('Email is required').email('Invalid email format'),

  number: yup
    .string()
    .required('Phone number is required')
    .matches(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/,
      'Invalid phone number'
    ),

  address: yup.string().required('Address is required'),

  city: yup.string().required('City is required'),

  state: yup.string().required('State is required'),

  country: yup.string().required('Country is required'),

  role: yup.string().required('Role is required'),

  password: yup
    .string()
    .required('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number and special character'
    ),
});

export default function AddUserForm({ onClose, companyId, onSuccess }) {
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const companyIDFromUser = user?.roles?.[0]?.company_id;

  const actualId = companyId ?? companyIDFromUser;
  // Fetch roles from API
  const { data: rolesData, isLoading: rolesLoading } = useSimpleQuery(
    ['company-roles', companyIDFromUser],
    `/api/roles/company`,
    {
      company_id: actualId,
    }
  );

  // Transform roles data to options format
  const roleOptions =
    rolesData?.roles?.map(role => ({
      value: role.name,
      label: role.display_name || role.name.charAt(0).toUpperCase() + role.name.slice(1),
    })) || [];

  const countryOptions = [
    { value: 'Pakistan', label: 'Pakistan' },
    { value: 'USA', label: 'USA' },
    { value: 'UK', label: 'UK' },
    { value: 'Spain', label: 'Spain' },
    { value: 'France', label: 'France' },
  ];

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: yupResolver(AddUserSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      number: '',
      address: '',
      city: '',
      state: '',
      country: 'Pakistan',
      role: '',
      password: '',
    },
  });

  const onSubmit = async data => {
    console.log('User Form Data:', data);
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...data,
        company_id: actualId,
      };

      console.log('Final Payload:', payload);
      const response = await post('/api/members', payload);

      console.log('Response:', response);
      setSuccess(true);

      // Reset form
      reset();

      // Call onSuccess callback after a brief delay to show success message
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 1000);
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err.message || 'Failed to create user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-surface-1 rounded-panel w-[90vw] md:w-[50vw] max-h-[85vh] overflow-y-auto scrollbar-hide"
    >
      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Close Button */}
      <div className="sticky top-0 bg-surface-1 z-10 pb-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
        >
          <IconWrapper name="close" className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-base font-semibold text-ink-0 font-display">Add new user</h1>
          <p className="text-xs text-ink-2 mt-0.5">Create a new user account</p>
        </div>
      </div>

      {/* User Information Section */}
      <div className="mb-6">
        <h2 className="font-semibold text-[11px] uppercase tracking-wider mb-3 text-ink-2">
          User information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <Controller
            name="first_name"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">First Name</label>
                <InputField
                  {...field}
                  placeholder="Enter first name"
                  disabled={isSubmitting}
                  error={!!errors.first_name}
                  helperText={errors.first_name?.message}
                />
              </div>
            )}
          />

          {/* Last Name */}
          <Controller
            name="last_name"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Last Name</label>
                <InputField
                  {...field}
                  placeholder="Enter last name"
                  disabled={isSubmitting}
                  error={!!errors.last_name}
                  helperText={errors.last_name?.message}
                />
              </div>
            )}
          />

          {/* Email */}
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Email</label>
                <InputField
                  {...field}
                  type="email"
                  placeholder="user@example.com"
                  disabled={isSubmitting}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
              </div>
            )}
          />

          {/* Phone Number */}
          <Controller
            name="number"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Phone Number</label>
                <InputField
                  {...field}
                  placeholder="+923001234567"
                  disabled={isSubmitting}
                  error={!!errors.number}
                  helperText={errors.number?.message}
                />
              </div>
            )}
          />

          {/* Role - Now with dynamic data from API */}
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Role</label>
                <SelectRadix
                  placeholder={rolesLoading ? 'Loading roles...' : 'Select role type'}
                  options={roleOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  fullWidth={true}
                  size="small"
                  disabled={rolesLoading || isSubmitting}
                />
                {errors.role && (
                  <p className="text-danger-text text-xs mt-1">{errors.role?.message}</p>
                )}
              </div>
            )}
          />

          {/* Password */}
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Password</label>
                <InputField
                  {...field}
                  type="password"
                  placeholder="Enter secure password"
                  disabled={isSubmitting}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                />
              </div>
            )}
          />
        </div>
      </div>

      {/* Address Information Section */}
      <div className="mb-6">
        <h2 className="font-semibold text-[11px] uppercase tracking-wider mb-3 text-ink-2">
          Address information
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {/* Address */}
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Address</label>
                <InputField
                  {...field}
                  placeholder="Enter street address"
                  disabled={isSubmitting}
                  error={!!errors.address}
                  helperText={errors.address?.message}
                />
              </div>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Country */}
            <Controller
              name="country"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-xs font-medium text-ink-1 mb-1">Country</label>
                  <SelectRadix
                    placeholder="Select country"
                    options={countryOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    fullWidth={true}
                    size="small"
                  />
                  {errors.country && (
                    <p className="text-danger-text text-xs mt-1">{errors.country?.message}</p>
                  )}
                </div>
              )}
            />

            {/* City */}
            <Controller
              name="city"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-xs font-medium text-ink-1 mb-1">City</label>
                  <InputField
                    {...field}
                    placeholder="Enter city"
                    disabled={isSubmitting}
                    error={!!errors.city}
                    helperText={errors.city?.message}
                  />
                </div>
              )}
            />

            {/* State */}
            <Controller
              name="state"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-xs font-medium text-ink-1 mb-1">State</label>
                  <InputField
                    {...field}
                    placeholder="Enter state"
                    disabled={isSubmitting}
                    error={!!errors.state}
                    helperText={errors.state?.message}
                  />
                </div>
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex mt-6 pt-4 border-t border-line justify-between sticky bottom-0 bg-surface-1">
        <button
          onClick={onClose}
          type="button"
          disabled={isSubmitting}
          className="text-ink-1 font-medium text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting || rolesLoading}
          className={`brand-gradient-bg on-gradient text-xs font-semibold h-9 px-5 rounded-md ${
            isSubmitting || rolesLoading
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 cursor-pointer'
          } transition-all`}
        >
          {isSubmitting ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
