// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useModal } from '@contexts/ModalContext';
import InputField from './Input';
import SelectReuseAble from './Select';
import CrossIcon from '../assets/icons/MUIicons/CrossIcon';
import { LocationSchema } from '../validation/LocationValidation';
import Button from './Button';
import { get, put } from '@utils/apiHelper';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@lib/router-compat';
import { useUser } from '@contexts/UserContext';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

function getAllCountryOptions() {
  const countryMap = countries.getNames('en', { select: 'official' });

  return Object.entries(countryMap)
    .map(([code, label]) => ({ label, value: code }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ISO 4217 codes the runtime knows, labelled "PKR — Pakistani Rupee".
function getCurrencyOptions() {
  let codes: string[] = [];

  try {
    codes = (Intl as any).supportedValuesOf('currency') as string[];
  } catch {
    codes = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR', 'CAD', 'AUD'];
  }

  let names: Intl.DisplayNames | null = null;

  try {
    names = new Intl.DisplayNames(['en'], { type: 'currency' });
  } catch {
    names = null;
  }

  return codes.map(code => ({ value: code, label: `${code} — ${names?.of(code) ?? code}` }));
}

export default function AddLocation({ companyData, companyID = undefined, refetch = () => {} }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useUser();

  const { closeModal } = useModal();

  const countryOptions = getAllCountryOptions();
  const currencyOptions = getCurrencyOptions();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm({
    resolver: yupResolver(LocationSchema(t)),
    defaultValues: {
      name: '',
      country: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      email: '',
      currency: '',
    },
  });

  useEffect(() => {
    // If companyData is passed as prop, use it directly (for Account Settings page)
    if (companyData) {
      reset({
        name: companyData?.name || '',
        country: companyData?.country || '',
        address: companyData?.address || '',
        city: companyData?.city || '',
        state: companyData?.state || '',
        zip_code: companyData?.zip_code || '',
        email: companyData?.email || '',
        currency: companyData?.currency || '',
      });
    } else {
      // Otherwise, fetch it from API (for modal or other places)
      const fetchCompanyData = async () => {
        try {
          const response = await get('/api/profile');
          if (response?.data?.user?.company) {
            const companyInfo = response.data.user.company;

            reset({
              name: companyInfo?.name || '',
              country: companyInfo?.country || '',
              address: companyInfo?.address || '',
              city: companyInfo?.city || '',
              state: companyInfo?.state || '',
              zip_code: companyInfo?.zip_code || '',
              email: companyInfo?.email || '',
              currency: companyInfo?.currency || '',
            });
          }
        } catch (error) {
          console.error('Error fetching company data:', error);
        }
      };
      fetchCompanyData();
    }
  }, [companyData, reset]);

  // The profile's company object does not carry `currency`, so read it from the company itself and
  // re-apply it after any reset (the effect below runs after the reset effect above).
  const [companyCurrency, setCompanyCurrency] = useState('');
  const currencyCompanyId = companyID ?? user?.company_id;

  useEffect(() => {
    if (!currencyCompanyId) return;

    get(`/api/companies/${currencyCompanyId}`).then(response => {
      const code = response?.data?.currency;

      if (typeof code === 'string' && code) setCompanyCurrency(code);
    });
  }, [currencyCompanyId]);

  useEffect(() => {
    if (companyCurrency) setValue('currency', companyCurrency);
  }, [companyCurrency, companyData, setValue]);

  const onSubmit = async data => {
    try {
      // Must be the COMPANY id — user.id only matched by coincidence.
      const actualUserId = companyID ?? user.company_id ?? user.id;
      // currency is optional on PUT: leave it out when empty so the company's value is unchanged.
      const payload = { ...data };
      if (!payload.currency) delete payload.currency;
      const response = await put(`/api/companies/${actualUserId}`, payload);

      if (response?.success) {
        closeModal();
        const userToUpdate = { ...user, company_info: true };
        updateUser(userToUpdate);
        navigate('/manage-product');
      }
    } catch (error) {
      console.error('Error updating company:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="">
      <h1 className="font-semibold"> Company Info</h1>

      <div className="w-full border-b border-line-soft mt-4.5" />

      <div className="mt-8 flex flex-col gap-4">
        {/* Name Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.name')}:</div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-name-input"
                  fullWidth={true}
                  shrink={false}
                  size="small"
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  height="h-[36px]"
                />
              )}
            />
          </div>
        </div>

        {/* Country Dropdown */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.country')}:</div>
          <div id="company-country-select" className="w-full md:w-[70%]">
            <Controller
              name="country"
              control={control}
              render={({ field: { onChange, value } }) => (
                <SelectReuseAble
                  options={countryOptions}
                  value={value}
                  onValueChange={onChange}
                  label={t('addCompany.selectOption')}
                  error={!!errors.country}
                  helperText={errors.country?.message}
                  searchable
                  searchPlaceholder={t('addCompany.searchCountry', 'Search country...')}
                  sx={{
                    width: '100%',
                    '& .MuiInputBase-root': {
                      height: '35px',
                    },
                  }}
                />
              )}
            />
          </div>
        </div>

        {/* Currency (company-wide; the Fleet screens show money in this currency) */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">Currency:</div>
          <div id="company-currency-select" className="w-full md:w-[70%]">
            <Controller
              name="currency"
              control={control}
              render={({ field: { onChange, value } }) => (
                <SelectReuseAble
                  options={currencyOptions}
                  value={value}
                  onValueChange={onChange}
                  label="Select currency"
                  searchable
                  searchPlaceholder="Search currency..."
                  sx={{
                    width: '100%',
                    '& .MuiInputBase-root': {
                      height: '35px',
                    },
                  }}
                />
              )}
            />
          </div>
        </div>

        {/* City Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.city')}:</div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="city"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-city-input"
                  size="small"
                  error={!!errors.city}
                  helperText={errors.city?.message}
                  height="h-[36px]"
                  fullWidth={true}
                />
              )}
            />
          </div>
        </div>

        {/* Address Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.address')}:</div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="address"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-address-input"
                  size="small"
                  error={!!errors.address}
                  helperText={errors.address?.message}
                  height="h-[36px]"
                  fullWidth={true}
                />
              )}
            />
          </div>
        </div>

        {/* State Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.state')}:</div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="state"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-state-input"
                  size="small"
                  error={!!errors.state}
                  helperText={errors.state?.message}
                  height="h-[36px]"
                  fullWidth={true}
                />
              )}
            />
          </div>
        </div>

        {/* Zip Code Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">{t('addCompany.zipCode')}:</div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="zip_code"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-zipcode-input"
                  size="small"
                  error={!!errors.zip_code}
                  helperText={errors.zip_code?.message}
                  height="h-[36px]"
                  fullWidth={true}
                />
              )}
            />
          </div>
        </div>

        {/* Primary Contact Input */}
        <div className="flex w-full max-md:flex-col max-md:gap-2 justify-between items-start">
          <div className="font-medium text-sm min-w-[120px] pt-2">
            {t('addCompany.primaryContact')}:
          </div>
          <div className="w-full md:w-[70%]">
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  id="company-email-input"
                  type="email"
                  size="small"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  height="h-[36px]"
                  fullWidth={true}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex mt-8 gap-3 justify-end mb-5.5">
        <Button
          id="company-save-button"
          type="submit"
          className="bg-green-light text-background-lightest hover:bg-green-dark cursor-pointer px-6 py-2 rounded-md"
        >
          {t('addCompany.save')}
        </Button>
      </div>
    </form>
  );
}
