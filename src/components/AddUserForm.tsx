// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react'; // Add this import
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import SelectRadix from '@components/Select';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { post } from '../utils/apiHelper';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
    { value: 'manager', label: 'Manager' },
    { value: 'viewer', label: 'Viewer' },
  ];

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

    const payload = {
      ...data,
      company_id: companyId,
    };

    console.log('Final Payload:', payload);
    await post('/api/members', payload);

    setIsSubmitting(false);
  };
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white w-[50vw] max-h-[85vh] overflow-y-auto scrollbar-hide"
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
      <div className="sticky top-0 bg-white z-10 pb-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-600 cursor-pointer hover:text-black"
        >
          <IconWrapper name="close" className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-xl font-bold">Add New User</h1>
          <p className="text-gray-600">Create a new user account</p>
        </div>
      </div>

      {/* User Information Section */}
      <div className="mb-6">
        <h2 className="font-semibold text-lg mb-4 text-gray-800">User Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <Controller
            name="first_name"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
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
            name="email" // Changed from user_email to email
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <InputField
                  {...field}
                  type="email"
                  placeholder="user@example.com"
                  disabled={isSubmitting}
                  error={!!errors.email} // Changed from user_email to email
                  helperText={errors.email?.message} // Changed from user_email to email
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
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

          {/* Role */}
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <SelectRadix
                  placeholder="Select role type"
                  options={roleOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  fullWidth={true}
                  size="small"
                />
                {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role?.message}</p>}
              </div>
            )}
          />

          {/* Password */}
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
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
        <h2 className="font-semibold text-lg mb-4 text-gray-800">Address Information</h2>

        <div className="grid grid-cols-1 gap-4">
          {/* Address */}
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <SelectRadix
                    placeholder="Select country"
                    options={countryOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    fullWidth={true}
                    size="small"
                  />
                  {errors.country && (
                    <p className="text-red-500 text-xs mt-1">{errors.country?.message}</p>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
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

      <div className="flex mt-6 pt-4 border-t border-gray-200 justify-between sticky bottom-0 bg-white">
        <button
          onClick={onClose}
          type="button"
          disabled={isSubmitting}
          className="text-gray-700 font-semibold px-6 py-2 cursor-pointer rounded-md hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`bg-primary text-white h-10 px-6 py-2 rounded-md ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-dark cursor-pointer'
          } transition-colors`}
        >
          {isSubmitting ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
