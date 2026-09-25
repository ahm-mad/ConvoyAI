// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import SelectReuseAble from '@components/Select';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

function Region({ region, control, errors, watch }) {
  const [device, regionData] = watch(['device', `${region}Data`]);
  const { t } = useTranslation();

  const DataOptions = [
    { label: t('dataOptions.battery'), value: 'battery' },
    { label: t('dataOptions.breakIn'), value: 'Break In' },
    { label: t('dataOptions.impact'), value: 'Impact' },
  ];

  const UnitOptions = [
    { label: t('region.unitOptions.energy'), value: 'Energy' },
    { label: t('unitOptions.breakIn'), value: 'Break In' },
    { label: t('unitOptions.impact'), value: 'Impact' },
  ];

  const IconOptions = [
    { label: t('iconOptions.acCurrent'), value: 'AC Current' },
    { label: t('iconOptions.asset'), value: 'Asset' },
    { label: t('iconOptions.air'), value: 'Air' },
  ];

  return (
    <div className="w-[752] mt-4 pb-4   rounded-lg shadow-lg bg-[#F8F8F8]">
      <div className="flex max-md:flex-col gap-2  m-4">
        <Controller
          name={`${region}Data`}
          control={control}
          render={({ field }) => (
            <SelectReuseAble
              {...field}
              error={!!errors[`${region}Data`]}
              helperText={errors[`${region}Data`]?.message}
              disabled={!device}
              label={t('region.dataLabel')}
              className={`bg-gray-50`}
              size="large"
              options={DataOptions}
              minWidth={200}
            />
          )}
        />
        <Controller
          name={`${region}Icon`}
          control={control}
          render={({ field }) => (
            <SelectReuseAble
              {...field}
              error={!!errors[`${region}Icon`]}
              helperText={errors[`${region}Icon`]?.message}
              // disabled={!device}
              label={t('region.iconLabel')}
              className={`bg-[#ffff]`}
              size="large"
              minWidth={200}
              options={IconOptions}
            />
          )}
        />
        <Controller
          name={`${region}Unit`}
          control={control}
          render={({ field }) => (
            <SelectReuseAble
              {...field}
              error={!!errors[`${region}Unit`]}
              helperText={errors[`${region}Unit`]?.message}
              disabled={!regionData}
              label={t('region.unitLabel')}
              size="large"
              className={`bg-gray-50`}
              options={UnitOptions}
              minWidth={200}
            />
          )}
        />
      </div>
    </div>
  );
}

export default Region;
