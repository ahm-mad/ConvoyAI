// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState, useEffect, Fragment } from 'react';

// import CancelIcon from '@assets/icons/ReactIcon/CloesIcon';
import IconWrapper from '@utils/ReactIconDynamicImport';
import InputField from '@components/Input';
import SelectReuseAble from '@components/Select';
import GlobalToggle from '../FormComponents/ToggleBtn';
import ReuseAbleSetting from '../FormComponents/ReuseAbleSetting';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useFieldArray } from 'react-hook-form';
import { TemperatureValidation } from '../../validation/TemperatureValidation';
import { useTranslation } from 'react-i18next';
import ShowAndHide from '../FormComponents/ShowAndHide';

export default function TemperatureForm({
  onClose,
  handleModalSubmit,
  incomingWidget,
  handleDeleteWidget,
  products,

  devices,
  attributes,
  setProducts,
  setDevices,
  setAttributes,
}) {
  const { t } = useTranslation();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = !!incomingWidget;

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: yupResolver(TemperatureValidation(t)),
    defaultValues: {
      widget_name: '',
      // product: incomingWidget?.product || '',
      // device: incomingWidget?.device || '',
      // attributes: incomingWidget?.attributes || '',
      // showTimestamp: incomingWidget?.showTimestamp || false,
      sections: [
        {
          product: '',
          device: '',
          attributes: '',
          unit: '',
          conditions: [
            {
              selectedProduct: '',
              selectedAttribute: '',
              selectedCondition: t('conditions.equalTo'),
              conditionValue: '',
              logicalOperator: t('newRule.if'),
            },
          ],
          enabled: incomingWidget?.enabled || false,
          // max_value: incomingWidget?.maxvalue || '',
          // showTimestamp: incomingWidget?.showTimestamp || false,
          // text_color: '#000000',
          value_color: '#000000',
          // background_color: '#ffffff',
        },
      ],
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'sections',
  });

  useEffect(() => {
    if (incomingWidget) {
      reset({
        widget_name: incomingWidget?.widget_settings?.[0].widget_name || '',
        sections: incomingWidget?.widget_settings?.map(section => ({
          product: String(section.product) || '',
          device: String(section.device) || '',
          attributes: section.attributes || '',
          // conditions: section.rule.conditions,
          // icon: section.icon || '',
          unit: section.unit || '',
          label: section.label || '',
          conditions: section?.conditions || section?.rule?.conditions || [],
          // text_color: section.text_color || '#000000',
          value_color: section.value_color || '#000000',
          enabled: section.enabled ?? section.rule?.is_for_all === 1 ?? false,
          // background_color: section.background_color || '#ffffff',
        })),
      });
    }
  }, [incomingWidget, reset]);

  const onSubmit = async data => {
    console.log('final-temperature-form', data);
    const finalPayload = { ...data, widget_settings: data.sections };

    try {
      setIsSubmitting(true);
      await handleModalSubmit(finalPayload);
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (isDeleting || !isEditMode) return;

    setIsDeleting(true);
    try {
      await handleDeleteWidget();
    } catch (error) {
      console.error('Error deleting widget:', error);
      setIsDeleting(false);
    }
  };

  // const product = watch('product');
  // const device = watch('device');

  // const products = [
  //   { label: t('none'), value: '' },
  //   { label: t('products.usamaWaqas'), value: 20 },
  //   { label: t('products.chirpTech'), value: 21 },
  //   { label: t('products.sensorDevice'), value: 22 },
  // ];

  // const Devices = [
  //   { label: t('none'), value: '' },
  //   { label: t('devices.battery'), value: '20' },
  //   { label: t('devices.temperature'), value: '21' },
  //   { label: t('devices.heat'), value: '22' },
  // ];

  // const attributes = [
  //   { label: t('none'), value: '' },
  //   { label: t('attributes.battery'), value: '20' },
  //   { label: t('attributes.temperature'), value: '21' },
  //   { label: t('attributes.heat'), value: '22' },
  // ];

  // const decimal = [
  //   { label: 'none', value: '' },
  //   { label: 'decimals.acCurrent', value: '20' },
  //   { label: 'decimals.asset', value: '21' },
  //   { label: 'decimals.air', value: '22' },
  // ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-transparent w-[60vw]">
      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-ink-2 cursor-pointer hover:text-ink-0"
        disabled={isSubmitting || isDeleting}
      >
        {/* <CancelIcon className="w-6 h-6" /> */}
        <IconWrapper name="close" className={`w-6 h-6`} />
      </button>

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-base font-semibold text-ink-0 font-display">
          {t('TemperatureForm.widgetSettings')}
        </h1>
        <p className="text-ink-2 text-sm">{t('TemperatureForm.temperature')}</p>
      </div>

      {/* General Section */}
      <h2 className="font-semibold text-xs uppercase tracking-wider text-ink-2 mb-2">
        {t('TemperatureForm.general')}
      </h2>
      {/* Input Fields */}
      <div className="flex flex-col gap-4">
        <div className="p-4  rounded-xl">
          <div className="bg-surface-2 rounded-md">
            <Controller
              name="widget_name"
              control={control}
              render={({ field }) => (
                <InputField
                  {...field}
                  className="w-full rounded-sm text-lg p-4 focus:outline-none"
                  placeholder={t('TemperatureForm.widgetNamePlaceholder')}
                  disabled={isSubmitting || isDeleting}
                  error={!!errors.widget_name}
                  helperText={errors.widget_name?.message}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Settings Section */}
      <div>{/* <h2 className="font-bold text-lg mt-4">{t('TemperatureForm.settings')}</h2> */}</div>
      {fields.map((field, index) => (
        <Fragment key={field.id}>
          <ShowAndHide
            errors={errors}
            dirtyFields={dirtyFields}
            watch={watch}
            control={control}
            productOptions={products}
            setProductOptions={setProducts}
            deviceOptions={devices}
            setDeviceOptions={setDevices}
            attributeOptions={attributes}
            setAttributeOptions={setAttributes}
            setValue={setValue}
            // colorSetting={false}
            showValueColor={true}
            showUnitField={true}
            disabled={isSubmitting || isDeleting}
          />
        </Fragment>
      ))}
      {/* <ReuseAbleSetting> */}
      <div className="">
        {/* <div className="mt-4 flex flex-col gap-4">
            <Controller
              name="product"
              control={control}
              render={({ field }) => (
                <SelectReuseAble
                  {...field}
                  error={!!errors.product}
                  helperText={errors.product?.message}
                  label={t('TemperatureForm.selectProduct')}
                  className="bg-[#fff]"
                  size="large"
                  options={products}
                  disabled={isSubmitting || isDeleting}
                />
              )}
            />

            <Controller
              name="device"
              control={control}
              render={({ field }) => (
                <SelectReuseAble
                  {...field}
                  error={!!errors.device}
                  helperText={errors.device?.message}
                  disabled={!product || isSubmitting || isDeleting}
                  label={t('TemperatureForm.selectDevice')}
                  size="large"
                  className="bg-[#fff]"
                  options={Devices}
                />
              )}
            />
            <Controller
              name="attributes"
              control={control}
              render={({ field }) => (
                <SelectReuseAble
                  {...field}
                  error={!!errors.attributes}
                  helperText={errors.attributes?.message}
                  disabled={!device || isSubmitting || isDeleting}
                  label={t('TemperatureForm.selectAttribute')}
                  size="large"
                  className="bg-[#fff]"
                  options={attributes}
                />
              )}
            />

            <Controller
              name="decimal"
              control={control}
              render={({ field }) => (
                <SelectReuseAble
                  {...field}
                  label={t('TemperatureForm.decimal')}
                  size="large"
                  className="bg-[#fff]"
                  options={decimal}
                  disabled={isSubmitting || isDeleting}
                />
              )}
            />
          </div> */}

        {/* <div>
            <h1 className="mt-8 font-bold text-gray-700">{t('TemperatureForm.options')}</h1>

            <div className="flex justify-between mt-8">
              <p className="font-[14px] text-gray-500">{t('TemperatureForm.showTimestamp')}</p>
              <Controller
                name="showTimestamp"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <GlobalToggle
                    checked={value}
                    onChange={onChange}
                    trackColor="#ccc"
                    thumbColor="#fff"
                    checkedThumbColor="#fff"
                    disabled={isSubmitting || isDeleting}
                  />
                )}
              />
            </div>
          </div> */}
      </div>
      {/* </ReuseAbleSetting> */}

      {/* Submit Button */}
      <div className="flex mt-4 justify-between">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-1 font-semibold text-xs px-5 py-2 cursor-pointer rounded-md hover:bg-surface-3"
            disabled={isSubmitting || isDeleting}
          >
            {t('TemperatureForm.cancel')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!isEditMode || isSubmitting || isDeleting}
            className={`px-3 text-xs font-semibold rounded-md ${
              isEditMode && !isDeleting
                ? 'text-danger hover:bg-danger/10 cursor-pointer'
                : 'text-ink-2 cursor-not-allowed'
            }`}
          >
            {isDeleting ? t('TemperatureForm.removing') : t('TemperatureForm.removeWidget')}
          </button>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || isDeleting}
          className={`brand-gradient-bg on-gradient h-9 px-5 text-xs font-semibold rounded-md transition-all ${
            isSubmitting || isDeleting
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:brightness-110 cursor-pointer'
          }`}
        >
          {isSubmitting ? t('TemperatureForm.saving') : t('TemperatureForm.save')}
        </button>
      </div>
    </form>
  );
}
