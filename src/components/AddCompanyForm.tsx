// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useMemo } from 'react';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import SelectRadix from '@components/Select';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { post } from '../utils/apiHelper';

// Validation Schema
const AddCompanySchema = yup.object().shape({
  // Company Information
  company_name: yup
    .string()
    .required('Company name is required')
    .min(2, 'Company name must be at least 2 characters'),

  company_email: yup.string().required('Company email is required').email('Invalid email format'),

  address: yup.string().required('Address is required'),

  city: yup.string().required('City is required'),

  state: yup.string().required('State is required'),

  country: yup.string().required('Country is required'),

  zip_code: yup
    .string()
    .required('Zip code is required')
    .matches(/^[0-9]+$/, 'Zip code must be numeric'),

  timezone: yup.string().required('Timezone is required'),

  // Admin User Information
  first_name: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters'),

  last_name: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters'),

  user_email: yup.string().required('Admin email is required').email('Invalid email format'),

  number: yup
    .string()
    .required('Phone number is required')
    .matches(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/,
      'Invalid phone number'
    ),

  password: yup
    .string()
    .required('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number and special character'
    ),
});

export default function AddCompanyForm({ onClose, onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate timezone options
  const timeZoneOptions = useMemo(() => {
    return Intl.supportedValuesOf('timeZone')?.map(t => ({
      label: t,
      value: t,
    }));
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(AddCompanySchema),
    defaultValues: {
      company_name: '',
      company_email: '',
      address: '',
      city: '',
      state: '',
      country: '',
      zip_code: '',
      timezone: 'Asia/Karachi',
      first_name: '',
      last_name: '',
      user_email: '',
      number: '',
      password: '',
    },
  });

  const onSubmit = async data => {
    console.log('Company Form Data:', data);

    setIsSubmitting(true);

    await post('/api/companies/create-with-user', data);

    if (onSuccess) {
      onSuccess();
    }

    setIsSubmitting(false);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-surface-1 rounded-panel w-[60vw] max-h-[85vh] overflow-y-auto scrollbar-hide"
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
          className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
        >
          <IconWrapper name="close" className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-base font-semibold text-ink-0 font-display">Add new company</h1>
          <p className="text-xs text-ink-2 mt-0.5">Create a new company with an admin user</p>
        </div>
      </div>

      {/* Company Information Section */}
      <div className="mb-6">
        <h2 className="font-semibold text-[11px] uppercase tracking-wider mb-3 text-ink-2">
          Company information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Company Name */}
          <Controller
            name="company_name"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Company Name</label>
                <InputField
                  {...field}
                  placeholder="Enter company name"
                  disabled={isSubmitting}
                  error={!!errors.company_name}
                  helperText={errors.company_name?.message}
                />
              </div>
            )}
          />

          {/* Company Email */}
          <Controller
            name="company_email"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Company Email</label>
                <InputField
                  {...field}
                  type="email"
                  // className="w-full rounded-md text-base p-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="company@example.com"
                  disabled={isSubmitting}
                  error={!!errors.company_email}
                  helperText={errors.company_email?.message}
                />
              </div>
            )}
          />

          {/* Address */}
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <div className="md:col-span-2">
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
                <label className="block text-xs font-medium text-ink-1 mb-1">State/Province</label>
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

          {/* Country */}
          <Controller
            name="country"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Country</label>
                <InputField
                  {...field}
                  placeholder="Enter country"
                  disabled={isSubmitting}
                  error={!!errors.country}
                  helperText={errors.country?.message}
                />
              </div>
            )}
          />

          {/* Zip Code */}
          <Controller
            name="zip_code"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Zip Code</label>
                <InputField
                  {...field}
                  placeholder="Enter zip code"
                  disabled={isSubmitting}
                  error={!!errors.zip_code}
                  helperText={errors.zip_code?.message}
                />
              </div>
            )}
          />

          {/* Timezone */}
          <Controller
            name="timezone"
            control={control}
            render={({ field }) => (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-ink-1 mb-1">Timezone</label>
                <SelectRadix
                  placeholder="Select timezone"
                  options={timeZoneOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  fullWidth={true}
                  size="small"
                />
                {errors.timezone && (
                  <p className="text-danger text-xs mt-1">{errors.timezone?.message}</p>
                )}
              </div>
            )}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-line my-5"></div>

      {/* Admin User Section */}
      <div className="mb-6">
        <h2 className="font-semibold text-[11px] uppercase tracking-wider mb-3 text-ink-2">
          Admin user information
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

          {/* Admin Email */}
          <Controller
            name="user_email"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-xs font-medium text-ink-1 mb-1">Admin Email</label>
                <InputField
                  {...field}
                  type="email"
                  placeholder="admin@example.com"
                  disabled={isSubmitting}
                  error={!!errors.user_email}
                  helperText={errors.user_email?.message}
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

          {/* Password */}
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <div className="md:col-span-2">
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

      <div className="flex mt-6  pt-4 border-t  border-line justify-between sticky bottom-0 bg-surface-1">
        <button
          onClick={onClose}
          type="button"
          disabled={isSubmitting}
          className="text-ink-1 font-medium text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3 transition-colors"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`brand-gradient-bg on-gradient text-xs font-semibold h-9 px-5 rounded-md
 ${
   isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 cursor-pointer'
 } transition-all`}
        >
          {isSubmitting ? 'Creating...' : 'Create Company'}
        </button>
      </div>
    </form>
  );
}
