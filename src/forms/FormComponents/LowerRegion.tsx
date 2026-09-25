// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import SelectReuseAble from '@components/Select';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export default function LowerRegion({ control, errors, watch }) {
  const { t } = useTranslation();
  const [device, lowerData] = watch(['device', 'lowerData']);

  const DataOptions = [
    { label: t('dataOptions.battery'), value: 'battery' },
    { label: t('dataOptions.breakIn'), value: 'Break In' },
    { label: t('dataOptions.impact'), value: 'Impact' },
  ];

  const UnitOptions = [
    { label: t('unitOptions.energy'), value: 'Energy' },
    { label: t('unitOptions.breakIn'), value: 'Break In' },
    { label: t('unitOptions.impact'), value: 'Impact' },
  ];

  const IconOptions = [
    { label: t('iconOptions.acCurrent'), value: 'AC Current' },
    { label: t('iconOptions.asset'), value: 'Asset' },
    { label: t('iconOptions.air'), value: 'Air' },
  ];

  const DecimalOptions = [
    { label: t('decimalOptions.one'), value: '1' },
    { label: t('decimalOptions.two'), value: '2' },
    { label: t('decimalOptions.three'), value: '3' },
  ];

  return (
    <div>
      <div className="p-4 mt-4 bg-[#F8F8F8] flex flex-col gap-4 shadow-lg rounded-xl">
        <div>
          <Controller
            name={`lowerData`}
            control={control}
            render={({ field }) => (
              <SelectReuseAble
                {...field}
                error={!!errors?.lowerData}
                helperText={errors?.lowerData?.message}
                disabled={!device}
                label={t('lowerRegion.dataLabel')}
                size="large"
                className={`bg-[#ffff]`}
                options={DataOptions}
              />
            )}
          />
        </div>
        <div>
          <Controller
            name={`lowerUnit`}
            control={control}
            render={({ field }) => (
              <SelectReuseAble
                {...field}
                error={!!errors?.lowerUnit}
                helperText={errors?.lowerUnit?.message}
                disabled={!lowerData}
                label={t('lowerRegion.unitLabel')}
                size="large"
                className={`bg-[#ffff]`}
                options={UnitOptions}
              />
            )}
          />
        </div>
        <div>
          <Controller
            name={`lowerIcon`}
            control={control}
            render={({ field }) => (
              <SelectReuseAble
                {...field}
                error={!!errors?.lowerIcon}
                helperText={errors?.lowerIcon?.message}
                // disabled={!device}
                label={t('lowerRegion.iconLabel')}
                size="large"
                className={`bg-[#ffff]`}
                options={IconOptions}
              />
            )}
          />
        </div>
        <div>
          <Controller
            name={`lowerDecimal`}
            control={control}
            render={({ field }) => (
              <SelectReuseAble
                {...field}
                label={t('lowerRegion.decimalLabel')}
                size="large"
                className={`bg-[#ffff]`}
                options={DecimalOptions}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
